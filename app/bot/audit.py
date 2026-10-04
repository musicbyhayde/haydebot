"""Audit log for the Bot API: one row per request in public.bot_audit_log.

Writes happen on a single background thread so a slow database never slows a bot response.
Failures are logged (no request data, no keys) and dropped.
"""
from __future__ import annotations

import logging
import re
import threading
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Callable, Mapping

logger = logging.getLogger("haydebot.bot.audit")

MAX_PENDING = 1000
_SENSITIVE = re.compile(r"key|token|secret|pass|auth|cookie", re.I)

_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="bot-audit")
_pending = 0
_pending_lock = threading.Lock()


def _run(fn: Callable, *args: Any) -> None:
    global _pending
    try:
        fn(*args)
    except Exception as e:
        logger.warning("BOT_AUDIT: background write failed: %s", type(e).__name__)
    finally:
        with _pending_lock:
            _pending -= 1


def submit(fn: Callable, *args: Any) -> bool:
    global _pending
    with _pending_lock:
        if _pending >= MAX_PENDING:
            logger.warning("BOT_AUDIT: queue full, dropping a write")
            return False
        _pending += 1
    _executor.submit(_run, fn, *args)
    return True


def _insert(row: dict) -> None:
    from app.services.supabase_service import supabase_service
    if supabase_service.client is None:
        return
    supabase_service.client.table("bot_audit_log").insert(row).execute()


def _insert_row(row: dict) -> None:
    _insert(row)  # looked up at call time (tests replace _insert)


def record(row: dict) -> None:
    submit(_insert_row, row)


def flush(timeout: float = 5.0) -> None:
    """Wait until every queued write has run (single worker => FIFO). For tests / shutdown."""
    _executor.submit(lambda: None).result(timeout=timeout)


def sanitize_params(params: Mapping[str, Any] | None, max_items: int = 20) -> dict:
    """Query params for the log: max 20 keys, values cut to 100 chars, secret-looking keys dropped."""
    out: dict[str, str] = {}
    for k, v in list((params or {}).items())[:max_items]:
        k = str(k)[:40]
        if _SENSITIVE.search(k):
            out[k] = "[redacted]"
            continue
        out[k] = str(v)[:100]
    return out
