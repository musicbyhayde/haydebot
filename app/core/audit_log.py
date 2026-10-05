"""
Dashboard audit log -> public.dashboard_audit_log (service role only; migrations/add_viewer_access.sql).

Records (Ilan 2026-10-05): session activity (first request of each dashboard user per day),
viewer requests that were blocked, and every user-management action. Not per-lead views.
Best effort: a failed write (e.g. table not created yet) is logged and never breaks a request.
"""
from __future__ import annotations

import logging
import threading
import time
from datetime import datetime
from typing import Optional

logger = logging.getLogger("haydebot.audit")

_seen_lock = threading.Lock()
_seen: dict[str, str] = {}          # email -> local date of the last "session" row
_last_warn = {"t": 0.0}


def _insert(row: dict) -> None:
    from app.services.supabase_service import supabase_service
    client = supabase_service.client
    if client is None:
        return
    client.table("dashboard_audit_log").insert(row).execute()


def record(event: str, *, email: Optional[str] = None, role: Optional[str] = None,
           method: Optional[str] = None, path: Optional[str] = None,
           detail: Optional[dict] = None) -> None:
    row = {"event": event, "email": email, "role": role, "method": method, "path": path,
           "detail": detail or {}}
    try:
        _insert(row)
    except Exception as e:  # never break the request because of the audit log
        now = time.monotonic()
        if now - _last_warn["t"] > 300:
            _last_warn["t"] = now
            logger.warning("AUDIT: could not write %s row: %s", event, type(e).__name__)


def note_session(email: str, role: str, request=None) -> None:
    """One "session" row per user per day (in-process memory; a restart may add one more)."""
    today = datetime.now().date().isoformat()
    with _seen_lock:
        if _seen.get(email) == today:
            return
        _seen[email] = today
    ua = ""
    if request is not None:
        ua = (request.headers.get("user-agent") or "")[:160]
    record("session", email=email, role=role, detail={"user_agent": ua})


def reset_for_tests() -> None:
    with _seen_lock:
        _seen.clear()
