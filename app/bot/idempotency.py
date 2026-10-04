"""Idempotency for Bot API writes, so a bot that retries (timeouts, crashes, LLM loops) does not
write twice.

1. In memory (single DigitalOcean instance): the response of a completed write is kept per
   (key, method, path, Idempotency-Key) for 24h and replayed for an identical retry
   (header Idempotent-Replayed: true). Same key with a different body -> 409. A retry while the
   first request is still running -> 409 idempotency_in_progress (+ Retry-After).
   Creates without an Idempotency-Key get a 10-minute duplicate guard on (key, path, body).
2. In the database, surviving restarts: creates with an Idempotency-Key use a record id derived
   from (key id, action, Idempotency-Key), so a repeated insert hits the primary key instead of
   creating a second row (see app/bot/writes.py).
"""
from __future__ import annotations

import copy
import hashlib
import json
import threading
import time
import uuid
from collections import OrderedDict
from dataclasses import dataclass
from typing import Any, Optional

from app.bot.errors import BotError

EXPLICIT_TTL = 24 * 3600.0
IMPLICIT_TTL = 600.0
MAX_ENTRIES = 5000
IDEM_PATTERN = r"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$"
_NS = uuid.UUID("6f1c2a7e-8b4d-4c1e-9a3f-2d5e7b9c0a14")


@dataclass
class _Entry:
    fingerprint: str
    expires: float
    status: Optional[int] = None      # None = still running
    body: Any = None


_lock = threading.Lock()
_store: "OrderedDict[str, _Entry]" = OrderedDict()


def fingerprint(method: str, path: str, body: Any) -> str:
    raw = json.dumps({"m": method, "p": path, "b": body}, sort_keys=True, ensure_ascii=False, default=str)
    return hashlib.sha256(raw.encode()).hexdigest()


def _purge(now: float) -> None:
    for k in [k for k, e in _store.items() if e.expires <= now]:
        del _store[k]
    while len(_store) > MAX_ENTRIES:
        _store.popitem(last=False)


def begin(slot: str, fp: str, ttl: float) -> Optional[tuple[int, Any]]:
    """Reserve `slot`. Returns a stored (status, body) to replay, or None if the caller should run
    the write (and then call complete() or abort())."""
    now = time.monotonic()
    with _lock:
        _purge(now)
        e = _store.get(slot)
        if e is not None:
            if e.fingerprint != fp:
                raise BotError(409, "idempotency_key_reused",
                               "This Idempotency-Key was already used with a different request.")
            if e.status is None:
                raise BotError(409, "idempotency_in_progress",
                               "The same request is still being processed; retry shortly.", {"Retry-After": "2"})
            return e.status, copy.deepcopy(e.body)
        _store[slot] = _Entry(fingerprint=fp, expires=now + ttl)
        return None


def complete(slot: str, status: int, body: Any) -> None:
    with _lock:
        e = _store.get(slot)
        if e is not None:
            e.status, e.body = status, copy.deepcopy(body)


def abort(slot: str) -> None:
    with _lock:
        e = _store.get(slot)
        if e is not None and e.status is None:
            del _store[slot]


def record_id(key_id: str, action: str, idem_key: Optional[str]) -> Optional[str]:
    """Deterministic 'rec' + 14 hex id (same format as SupabaseService._generate_id)."""
    if not idem_key:
        return None
    return "rec" + hashlib.sha256(f"{key_id}|{action}|{idem_key}".encode()).hexdigest()[:14]


def activity_id(key_id: str, action: str, idem_key: Optional[str]) -> Optional[str]:
    if not idem_key:
        return None
    return str(uuid.uuid5(_NS, f"{key_id}|{action}|{idem_key}|activity"))


def reset() -> None:
    with _lock:
        _store.clear()
