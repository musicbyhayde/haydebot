"""
Dashboard user management (admin screen "משתמשים"), v1: viewer accounts only.

Each dashboard user = a Supabase Auth user (login: email + password) + a row in
public.dashboard_users (role / display name / active). Both are written here with the backend's
service-role client; the service key never reaches the browser. Public signup stays closed:
users are created only through the Admin API.

Revocation is immediate:
  - dashboard_users.active=false + cache cleared -> the API answers 403 on the next request
    (one DO instance, one worker), and the RLS function public.is_dashboard_user() hides
    leads/messages from direct Supabase/Realtime reads;
  - the Supabase user is banned -> no new login, no token refresh.
"""
from __future__ import annotations

import logging
import re
from typing import Optional

from app.core import audit_log, dashboard_users
from app.core.permissions import VIEWER_ROLE
from app.services.activity_text import PARTNERS

logger = logging.getLogger("haydebot.user_admin")

BAN_FOREVER = "876000h"     # ~100 years
MIN_PASSWORD = 10
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_RESERVED_NAMES = {"מערכת", "מנהל"} | set(PARTNERS)


class UserAdminError(Exception):
    def __init__(self, status: int, detail: str):
        super().__init__(detail)
        self.status = status
        self.detail = detail


def _client():
    from app.services.supabase_service import supabase_service
    if supabase_service.client is None:
        raise UserAdminError(503, "Supabase לא מוגדר בשרת")
    return supabase_service.client


# ── validation ──────────────────────────────────────────

def normalize_email(email: Optional[str]) -> str:
    e = (email or "").strip().lower()
    if not _EMAIL_RE.match(e) or len(e) > 254:
        raise UserAdminError(400, "כתובת מייל לא תקינה")
    return e


def check_password(password: Optional[str]) -> str:
    p = password or ""
    if len(p) < MIN_PASSWORD:
        raise UserAdminError(400, f"הסיסמה חייבת להכיל לפחות {MIN_PASSWORD} תווים")
    if len(p) > 72:
        raise UserAdminError(400, "הסיסמה ארוכה מדי (עד 72 תווים)")
    return p


def check_display_name(name: Optional[str], rows: list[dict]) -> str:
    n = (name or "").strip()
    if not (2 <= len(n) <= 40):
        raise UserAdminError(400, "שם תצוגה: 2 עד 40 תווים")
    if n in _RESERVED_NAMES or n.lower().startswith("bot:"):
        raise UserAdminError(400, f"השם '{n}' שמור במערכת, בחרו שם אחר")
    if any((r.get("display_name") or "").strip().lower() == n.lower() for r in rows):
        raise UserAdminError(409, f"כבר קיים משתמש בשם '{n}'")
    return n


# ── data access ─────────────────────────────────────────

def _rows() -> list[dict]:
    res = _client().table("dashboard_users").select("email, role, display_name, active, created_at") \
        .order("created_at").execute()
    return list(res.data or [])


def _row(email: str) -> Optional[dict]:
    return next((r for r in _rows() if (r.get("email") or "").lower() == email), None)


def _auth_users() -> list:
    users, page = [], 1
    while True:
        batch = _client().auth.admin.list_users(page=page, per_page=200) or []
        users.extend(batch)
        if len(batch) < 200 or page >= 50:
            return users
        page += 1


def _auth_user(email: str):
    return next((u for u in _auth_users() if (getattr(u, "email", "") or "").lower() == email), None)


def _managed_row(email: str, actor_email: str) -> dict:
    """The viewer row that may be changed by `actor_email`, else UserAdminError."""
    email = normalize_email(email)
    if email == (actor_email or "").lower():
        raise UserAdminError(400, "אי אפשר לשנות את המשתמש שלך מהמסך הזה")
    row = _row(email)
    if not row:
        raise UserAdminError(404, "המשתמש לא נמצא")
    if row.get("role") != VIEWER_ROLE:
        raise UserAdminError(403, "במסך הזה אפשר לנהל רק משתמשי צפייה")
    return row


def _changed() -> None:
    dashboard_users.invalidate_cache()


def _audit(event: str, actor: str, target: str, **extra) -> None:
    audit_log.record(event, email=actor, role="admin", detail={"target": target, **extra})


# ── operations ──────────────────────────────────────────

def list_users(actor_email: str) -> list[dict]:
    rows = _rows()
    info = {}
    try:
        for u in _auth_users():
            info[(getattr(u, "email", "") or "").lower()] = {
                "last_sign_in_at": str(getattr(u, "last_sign_in_at", "") or "") or None,
                "banned": bool(getattr(u, "banned_until", None)),
            }
    except Exception as e:  # list still useful without the auth details
        logger.warning("USER_ADMIN: could not list auth users: %s", type(e).__name__)
    out = []
    for r in rows:
        email = (r.get("email") or "").lower()
        out.append({
            "email": email,
            "role": r.get("role"),
            "display_name": r.get("display_name"),
            "active": bool(r.get("active")),
            "created_at": r.get("created_at"),
            "last_sign_in_at": (info.get(email) or {}).get("last_sign_in_at"),
            "manageable": r.get("role") == VIEWER_ROLE and email != (actor_email or "").lower(),
        })
    return out


def create_viewer(actor_email: str, email: str, password: str, display_name: str) -> dict:
    email = normalize_email(email)
    password = check_password(password)
    rows = _rows()
    if any((r.get("email") or "").lower() == email for r in rows):
        raise UserAdminError(409, "המייל כבר קיים ברשימת המשתמשים")
    name = check_display_name(display_name, rows)
    client = _client()
    try:
        res = client.auth.admin.create_user({"email": email, "password": password, "email_confirm": True})
    except Exception as e:
        msg = str(e).lower()
        if "already" in msg or "registered" in msg or "exists" in msg:
            raise UserAdminError(409, "כתובת המייל כבר רשומה במערכת ההתחברות")
        logger.warning("USER_ADMIN: create auth user failed: %s", type(e).__name__)
        raise UserAdminError(502, "יצירת המשתמש ב-Supabase נכשלה")
    uid = getattr(getattr(res, "user", None), "id", None)
    try:
        client.table("dashboard_users").insert(
            {"email": email, "role": VIEWER_ROLE, "display_name": name, "active": True}).execute()
    except Exception as e:
        logger.warning("USER_ADMIN: insert dashboard_users failed, removing auth user: %s", type(e).__name__)
        if uid:
            try:
                client.auth.admin.delete_user(uid)
            except Exception:
                logger.warning("USER_ADMIN: cleanup of auth user failed")
        raise UserAdminError(502, "שמירת המשתמש נכשלה, לא נוצר משתמש")
    _changed()
    _audit("user_created", actor_email, email, display_name=name)
    return {"email": email, "role": VIEWER_ROLE, "display_name": name, "active": True}


def set_active(actor_email: str, email: str, active: bool) -> dict:
    row = _managed_row(email, actor_email)
    email = row["email"].lower()
    client = _client()
    warning = None
    if active:
        u = _auth_user(email)
        if u is not None:
            client.auth.admin.update_user_by_id(u.id, {"ban_duration": "none"})
        client.table("dashboard_users").update({"active": True}).eq("email", email).execute()
        _changed()
    else:
        # access first (immediate), then the Supabase ban (no new login / refresh)
        client.table("dashboard_users").update({"active": False}).eq("email", email).execute()
        _changed()
        try:
            u = _auth_user(email)
            if u is not None:
                client.auth.admin.update_user_by_id(u.id, {"ban_duration": BAN_FOREVER})
        except Exception as e:
            logger.warning("USER_ADMIN: ban failed (user already disabled in dashboard_users): %s", type(e).__name__)
            warning = "המשתמש הושבת, אבל החסימה ב-Supabase נכשלה"
    _audit("user_enabled" if active else "user_disabled", actor_email, email)
    out = {"email": email, "active": active}
    if warning:
        out["warning"] = warning
    return out


def reset_password(actor_email: str, email: str, password: str) -> dict:
    row = _managed_row(email, actor_email)
    password = check_password(password)
    email = row["email"].lower()
    u = _auth_user(email)
    if u is None:
        raise UserAdminError(404, "משתמש ההתחברות לא נמצא ב-Supabase")
    _client().auth.admin.update_user_by_id(u.id, {"password": password})
    _audit("password_reset", actor_email, email)
    return {"email": email, "status": "password_reset"}


def delete_viewer(actor_email: str, email: str) -> dict:
    row = _managed_row(email, actor_email)
    email = row["email"].lower()
    client = _client()
    client.table("dashboard_users").update({"active": False}).eq("email", email).execute()
    _changed()
    u = _auth_user(email)
    if u is not None:
        client.auth.admin.delete_user(u.id)
    client.table("dashboard_users").delete().eq("email", email).execute()
    _changed()
    _audit("user_deleted", actor_email, email)
    return {"email": email, "status": "deleted"}
