"""Per-bot API keys, read from public.bot_api_keys with the service key and cached.

Revocation (active=false), expiry and scope changes take effect within BOT_KEYS_CACHE_TTL
(60s). If the table cannot be read, the last loaded copy is used for at most 5 minutes; after
that every key is refused (fail closed). A missing table means "no keys".
"""
from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

from app.bot.keyformat import hash_key, looks_like_key  # noqa: F401 (re-exported)
from app.bot.scopes import effective_scopes

logger = logging.getLogger("haydebot.bot.keys")

STALE_MAX = 300.0          # seconds a stale copy may be used while the table is unreadable
RETRY_AFTER_ERROR = 10.0
TOUCH_EVERY = 300.0        # last_used_at is written at most every 5 minutes per key


class KeyStoreUnavailable(Exception):
    pass


@dataclass(frozen=True)
class BotKey:
    id: str
    name: str
    prefix: str
    scopes: frozenset
    active: bool
    expires_at: Optional[datetime]
    rate_limit_per_min: Optional[int]

    def is_expired(self, now: Optional[datetime] = None) -> bool:
        return bool(self.expires_at) and self.expires_at <= (now or datetime.now(timezone.utc))


_lock = threading.Lock()
_state: dict = {"by_hash": None, "loaded_at": 0.0, "expires": 0.0}
_touched: dict[str, float] = {}


def _ttl() -> float:
    from app.core.config import get_settings
    return float(get_settings().BOT_KEYS_CACHE_TTL)


def _fetch_rows() -> list[dict]:
    from app.services.supabase_service import supabase_service
    if supabase_service.client is None:
        raise RuntimeError("Supabase client not configured")
    res = (supabase_service.client.table("bot_api_keys")
           .select("id, name, key_hash, key_prefix, scopes, active, expires_at, rate_limit_per_min")
           .execute())
    return list(res.data or [])


def _parse_ts(value) -> Optional[datetime]:
    if not value:
        return None
    if isinstance(value, datetime):
        dt = value
    else:
        try:
            dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        except ValueError:
            return datetime.min.replace(tzinfo=timezone.utc)  # unparseable -> treat as expired
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _row_to_key(r: dict) -> BotKey:
    return BotKey(
        id=str(r.get("id")),
        name=str(r.get("name") or "?"),
        prefix=str(r.get("key_prefix") or ""),
        scopes=effective_scopes(r.get("scopes")),
        active=bool(r.get("active")),
        expires_at=_parse_ts(r.get("expires_at")),
        rate_limit_per_min=r.get("rate_limit_per_min"),
    )


def _load() -> dict[str, BotKey]:
    now = time.monotonic()
    if _state["by_hash"] is not None and _state["expires"] > now:
        return _state["by_hash"]
    try:
        rows = _fetch_rows()
    except Exception as e:
        msg = str(e)
        if "PGRST205" in msg or "bot_api_keys" in msg and "does not exist" in msg:
            logger.warning("BOT_KEYS: table public.bot_api_keys missing - no bot keys accepted")
            _state.update(by_hash={}, loaded_at=now, expires=now + _ttl())
            return {}
        if _state["by_hash"] is not None and now - _state["loaded_at"] < STALE_MAX:
            logger.warning("BOT_KEYS: read failed (%s), using copy from %.0fs ago",
                           type(e).__name__, now - _state["loaded_at"])
            _state["expires"] = now + RETRY_AFTER_ERROR
            return _state["by_hash"]
        logger.error("BOT_KEYS: read failed (%s) and no recent copy - refusing bot keys", type(e).__name__)
        raise KeyStoreUnavailable() from e
    by_hash = {}
    for r in rows:
        h = (r.get("key_hash") or "").lower()
        if h:
            by_hash[h] = _row_to_key(r)
    _state.update(by_hash=by_hash, loaded_at=now, expires=now + _ttl())
    return by_hash


def lookup(key: str) -> Optional[BotKey]:
    """BotKey row for this plaintext key (active or not), or None. Raises KeyStoreUnavailable."""
    with _lock:
        return _load().get(hash_key(key))


def touch_last_used(bot: BotKey) -> None:
    """Best-effort, throttled update of last_used_at (runs on the audit writer thread)."""
    now = time.monotonic()
    with _lock:
        if now - _touched.get(bot.id, -1e9) < TOUCH_EVERY:
            return
        _touched[bot.id] = now
    from app.bot import audit
    audit.submit(_write_last_used, bot.id)


def _write_last_used(key_id: str) -> None:
    from app.services.supabase_service import supabase_service
    if supabase_service.client is None:
        return
    (supabase_service.client.table("bot_api_keys")
     .update({"last_used_at": datetime.now(timezone.utc).isoformat()}).eq("id", key_id).execute())


def invalidate_cache() -> None:
    with _lock:
        _state.update(by_hash=None, loaded_at=0.0, expires=0.0)
        _touched.clear()
