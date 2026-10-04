"""
Who may use the dashboard, and with which role / display name.

Source of truth: the Supabase table public.dashboard_users
(migrations/add_dashboard_users_table.sql), read with the service key and cached for 60s.

TEMPORARY deploy-order fallback: while that table is missing or has no rows (or cannot be read
and nothing was ever loaded), the previous built-in list below is used, so SQL-first or
code-first deploys both keep the dashboard working. Remove _FALLBACK_USERS (and treat
"missing/empty" as "nobody") once the table is seeded in production and the logs have shown
no "DASHBOARD_USERS: using built-in fallback" lines for about a week.
"""
from __future__ import annotations

import logging
import threading
import time
from typing import Optional

logger = logging.getLogger("haydebot.dashboard_users")

CACHE_TTL = 60.0         # seconds a successful table read is reused
RETRY_AFTER_ERROR = 10.0  # seconds before retrying after a failed read

# TEMPORARY - identical to the seed rows in add_dashboard_users_table.sql. See module docstring.
_FALLBACK_USERS: dict[str, dict] = {
    "ziv200@gmail.com": {"role": "admin", "display_name": "אילן"},
    "kobile@gmail.com": {"role": "partner", "display_name": "קובי"},
    "musicbyhayde@gmail.com": {"role": "admin", "display_name": "מנהל"},
}

_lock = threading.Lock()
_state: dict = {"users": None, "source": None, "expires": 0.0}


def _fetch_rows() -> list[dict]:
    """Read every row of public.dashboard_users with the service-role client."""
    from app.services.supabase_service import supabase_service
    client = supabase_service.client
    if client is None:
        raise RuntimeError("Supabase client not configured")
    res = client.table("dashboard_users").select("email, role, display_name, active").execute()
    return list(res.data or [])


def _rows_to_users(rows: list[dict]) -> dict[str, dict]:
    users: dict[str, dict] = {}
    for r in rows:
        email = (r.get("email") or "").strip().lower()
        if not email or r.get("active") is False:
            continue
        users[email] = {"role": r.get("role") or "partner", "display_name": r.get("display_name") or ""}
    return users


def _set(users: dict, source: str, ttl: float) -> dict:
    if source != _state["source"]:
        if source == "table":
            logger.warning("DASHBOARD_USERS: loaded %d active user(s) from public.dashboard_users", len(users))
        else:
            logger.warning("DASHBOARD_USERS: using built-in fallback list (%s)", source)
    _state.update(users=users, source=source, expires=time.monotonic() + ttl)
    return users


def get_dashboard_users() -> dict[str, dict]:
    """email -> {role, display_name} for every active dashboard user."""
    with _lock:
        if _state["users"] is not None and _state["expires"] > time.monotonic():
            return _state["users"]
        try:
            rows = _fetch_rows()
        except Exception as e:  # table missing (PGRST205), network, config...
            if _state["source"] == "table":
                # keep the last good table data; retry soon
                logger.warning("DASHBOARD_USERS: read failed (%s), keeping last loaded list", type(e).__name__)
                _state["expires"] = time.monotonic() + RETRY_AFTER_ERROR
                return _state["users"]
            logger.warning("DASHBOARD_USERS: read failed: %s", type(e).__name__)
            return _set(dict(_FALLBACK_USERS), "table unreadable", RETRY_AFTER_ERROR)
        if not rows:
            return _set(dict(_FALLBACK_USERS), "table empty", CACHE_TTL)
        # rows exist -> the table is authoritative, even if every row is inactive
        return _set(_rows_to_users(rows), "table", CACHE_TTL)


def get_dashboard_user(email: Optional[str]) -> Optional[dict]:
    """{email, role, display_name} for an active dashboard user, else None."""
    if not email:
        return None
    email = email.strip().lower()
    u = get_dashboard_users().get(email)
    return {"email": email, **u} if u else None


def current_source() -> Optional[str]:
    return _state["source"]


def invalidate_cache() -> None:
    with _lock:
        _state.update(users=None, source=None, expires=0.0)
