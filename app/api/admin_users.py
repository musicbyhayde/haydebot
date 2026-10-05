"""Admin screen "משתמשים": manage viewer accounts (app/services/user_admin.py).
Only an admin dashboard user (JWT); viewers are already blocked by the central deny-by-default."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request

from app.core.auth import require_admin, require_auth
from app.services import user_admin

admin_router = APIRouter(dependencies=[Depends(require_auth), Depends(require_admin)])


def _run(fn, *args):
    try:
        return fn(*args)
    except user_admin.UserAdminError as e:
        raise HTTPException(status_code=e.status, detail=e.detail)


async def _body(request: Request) -> dict:
    try:
        body = await request.json()
    except Exception:
        body = None
    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="גוף הבקשה חייב להיות JSON")
    return body


@admin_router.get("/admin/users")
async def list_users(request: Request):
    return _run(user_admin.list_users, request.state.auth_user)


@admin_router.post("/admin/users", status_code=201)
async def create_user(request: Request):
    b = await _body(request)
    role = (b.get("role") or "viewer").strip()
    if role != "viewer":
        raise HTTPException(status_code=400, detail="במסך הזה אפשר ליצור רק משתמשי צפייה")
    return _run(user_admin.create_viewer, request.state.auth_user,
                b.get("email"), b.get("password"), b.get("display_name"))


@admin_router.post("/admin/users/{email}/disable")
async def disable_user(email: str, request: Request):
    return _run(user_admin.set_active, request.state.auth_user, email, False)


@admin_router.post("/admin/users/{email}/enable")
async def enable_user(email: str, request: Request):
    return _run(user_admin.set_active, request.state.auth_user, email, True)


@admin_router.post("/admin/users/{email}/password")
async def reset_password(email: str, request: Request):
    b = await _body(request)
    return _run(user_admin.reset_password, request.state.auth_user, email, b.get("password"))


@admin_router.delete("/admin/users/{email}")
async def delete_user(email: str, request: Request):
    return _run(user_admin.delete_viewer, request.state.auth_user, email)
