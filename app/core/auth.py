"""
Authentication for the protected API.

Accepted credentials, in order:
  1. A Supabase user session JWT (Authorization: Bearer <access_token>) of a dashboard
     user. This is what the dashboard sends.
  2. The server-to-server API_KEY (X-API-Key), only if API_KEY is set in env.
Nothing else: the old hard-coded shared key is gone.
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import threading
import time
from typing import Optional

import requests
from fastapi import HTTPException, Request

from app.core.config import get_settings

logger = logging.getLogger("haydebot.auth")

_CACHE_TTL = 60.0          # seconds a verified token stays trusted without re-checking
_NEG_CACHE_TTL = 10.0      # seconds a rejected token is remembered
_cache: dict[str, tuple[float, Optional[str]]] = {}
_cache_lock = threading.Lock()
_counts = {"jwt": 0, "api_key": 0}
_LOG_EVERY = 200


def _consteq(a: Optional[str], b: Optional[str]) -> bool:
    if not a or not b:
        return False
    return hmac.compare_digest(a.encode(), b.encode())


def allowed_emails() -> set[str]:
    raw = get_settings().DASHBOARD_ALLOWED_EMAILS or ""
    return {e.strip().lower() for e in raw.split(",") if e.strip()}


def admin_emails() -> set[str]:
    raw = get_settings().DASHBOARD_ADMIN_EMAILS or ""
    return {e.strip().lower() for e in raw.split(",") if e.strip()}


def is_admin_request(request: Request) -> bool:
    """True for an admin dashboard user (JWT) or a server-to-server API_KEY caller."""
    method = getattr(request.state, "auth_method", None)
    if method == "api_key":
        return True
    return method == "jwt" and getattr(request.state, "auth_user", None) in admin_emails()


def _verify_jwt_local(token: str, secret: str) -> Optional[str]:
    import jwt  # PyJWT (pinned in requirements.txt)
    try:
        claims = jwt.decode(token, secret, algorithms=["HS256"], audience="authenticated",
                            options={"require": ["exp", "sub"]})
    except Exception as e:  # expired / bad signature / wrong alg
        logger.info("AUTH: local JWT verify failed: %s", type(e).__name__)
        return None
    return (claims.get("email") or "").lower() or None


def _verify_jwt_remote(token: str) -> Optional[str]:
    """Ask Supabase Auth who owns this token (works for HS256 and asymmetric keys)."""
    s = get_settings()
    if not s.SUPABASE_URL or not s.SUPABASE_KEY:
        return None
    try:
        r = requests.get(
            f"{s.SUPABASE_URL.rstrip('/')}/auth/v1/user",
            headers={"apikey": s.SUPABASE_KEY, "Authorization": f"Bearer {token}"},
            timeout=(s.HTTP_CONNECT_TIMEOUT, 5.0),
        )
    except requests.RequestException as e:
        logger.warning("AUTH: Supabase auth check unreachable: %s", type(e).__name__)
        raise
    if r.status_code != 200:
        return None
    try:
        return (r.json().get("email") or "").lower() or None
    except ValueError:
        return None


def verify_user_token(token: str) -> Optional[str]:
    """Return the user's email if `token` is a valid Supabase session JWT, else None.
    Raises requests.RequestException if Supabase Auth could not be reached."""
    if not token or token.count(".") != 2:
        return None
    key = hashlib.sha256(token.encode()).hexdigest()
    now = time.monotonic()
    with _cache_lock:
        hit = _cache.get(key)
        if hit and hit[0] > now:
            return hit[1]
    secret = get_settings().SUPABASE_JWT_SECRET
    email = _verify_jwt_local(token, secret) if secret else _verify_jwt_remote(token)
    with _cache_lock:
        if len(_cache) > 1000:
            _cache.clear()
        _cache[key] = (now + (_CACHE_TTL if email else _NEG_CACHE_TTL), email)
    return email


def _count(method: str) -> None:
    _counts[method] += 1
    total = sum(_counts.values())
    if total % _LOG_EVERY == 1:
        logger.warning("AUTH stats since boot: %s", dict(_counts))
        print(f"AUTH stats since boot: {dict(_counts)}")


async def require_auth(request: Request) -> str:
    """FastAPI dependency for every protected route. Returns the auth method used."""
    s = get_settings()
    auth_header = request.headers.get("authorization", "")
    api_key = request.headers.get("x-api-key")
    supabase_down = False

    # 1) Supabase user JWT
    if auth_header.lower().startswith("bearer "):
        token = auth_header[7:].strip()
        try:
            email = verify_user_token(token)
        except requests.RequestException:
            email, supabase_down = None, True
        if email:
            if email in allowed_emails():
                request.state.auth_user = email
                request.state.auth_method = "jwt"
                _count("jwt")
                return "jwt"
            logger.warning("AUTH: valid JWT but user not in DASHBOARD_ALLOWED_EMAILS")
            if not api_key:
                raise HTTPException(status_code=403, detail="User not allowed")

    # 2) Configured server-to-server key
    if s.API_KEY and _consteq(api_key, s.API_KEY):
        request.state.auth_method = "api_key"
        _count("api_key")
        return "api_key"

    if supabase_down:
        raise HTTPException(status_code=503, detail="Auth service unavailable, retry")
    raise HTTPException(status_code=403, detail="Invalid API Key")
