"""Authentication for the Bot API (/api/bot/v1): per-bot keys only.

    Authorization: Bearer hbk_xxxxxxxx_...      (X-Bot-Key: ... also accepted)

Status codes are all 4xx on purpose: DigitalOcean's edge replaces ANY 5xx from the app with its own
HTML 504 page (the original status only survives in the X-Do-Orig-Status header), which would hide
our JSON error. So: switched off -> 404 bot_api_disabled; key table unreachable -> 424 + Retry-After.

Separate from the dashboard auth (app/core/auth.py): bot keys are NOT accepted on /api/v1, and the
dashboard JWT / server API_KEY are NOT accepted here. Order of checks:
kill switch (BOT_API_ENABLED) -> key present/known/active/not expired -> rate limit -> scope
-> for writes: write switch (BOT_API_WRITE_ENABLED, skipped for dry_run=true) -> write rate limits.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Callable, Optional

from fastapi import Depends, Header, Query, Request

from app.bot import keys
from app.bot.errors import BotError
from app.bot.idempotency import IDEM_PATTERN
from app.bot.ratelimit import SlidingWindowLimiter, limiter
from app.core.config import get_settings

logger = logging.getLogger("haydebot.bot.auth")


@dataclass(frozen=True)
class BotContext:
    key_id: str
    name: str
    scopes: frozenset

    def has(self, scope: str) -> bool:
        return scope in self.scopes


def client_ip(request: Request) -> str:
    # DigitalOcean App Platform sets do-connecting-ip; X-Forwarded-For is client-controlled.
    return request.headers.get("do-connecting-ip") or (request.client.host if request.client else "?")


def _extract_key(request: Request) -> str | None:
    auth = request.headers.get("authorization", "")
    if auth[:7].lower() == "bearer ":
        return auth[7:].strip() or None
    return (request.headers.get("x-bot-key") or "").strip() or None


def ensure_enabled() -> None:
    if not get_settings().BOT_API_ENABLED:
        raise BotError(404, "bot_api_disabled", "The bot API is switched off.")


def _anon_limit(request: Request) -> None:
    """Requests without a valid key: per-IP limit; beyond it they are not even audited."""
    retry = limiter.hit("ip:" + client_ip(request), get_settings().BOT_ANON_RATE_LIMIT_PER_MINUTE)
    if retry:
        request.state.bot_audit_skip = True
        raise BotError(429, "rate_limited", "Too many unauthenticated requests.",
                       {"Retry-After": str(retry)})


def authenticate(request: Request) -> BotContext:
    ensure_enabled()
    key = _extract_key(request)
    if not key:
        _anon_limit(request)
        raise BotError(401, "missing_key", "Send the bot key as 'Authorization: Bearer <key>'.",
                       {"WWW-Authenticate": "Bearer"})
    if not keys.looks_like_key(key):
        _anon_limit(request)
        raise BotError(401, "invalid_key", "Invalid or revoked key.", {"WWW-Authenticate": "Bearer"})
    try:
        bot = keys.lookup(key)
    except keys.KeyStoreUnavailable:
        raise BotError(424, "key_store_unavailable", "Cannot verify keys right now, retry shortly.",
                       {"Retry-After": "30"})
    if bot is not None:
        request.state.bot_key_id, request.state.bot_name = bot.id, bot.name
    if bot is None or not bot.active:
        _anon_limit(request)
        raise BotError(401, "invalid_key", "Invalid or revoked key.", {"WWW-Authenticate": "Bearer"})
    if bot.is_expired():
        raise BotError(401, "key_expired", "This key has expired; ask for a new one.",
                       {"WWW-Authenticate": "Bearer"})
    limit = bot.rate_limit_per_min or get_settings().BOT_RATE_LIMIT_PER_MINUTE
    retry = limiter.hit("key:" + bot.id, limit)
    if retry:
        raise BotError(429, "rate_limited", f"Rate limit of {limit} requests/minute exceeded.",
                       {"Retry-After": str(retry)})
    keys.touch_last_used(bot)
    return BotContext(key_id=bot.id, name=bot.name, scopes=bot.scopes)


async def bot_context(request: Request) -> BotContext:
    """Dependency: any valid bot key."""
    return authenticate(request)


def require_scopes(*scopes: str) -> Callable:
    """Dependency factory: valid key that has ALL the given scopes."""
    async def dep(ctx: BotContext = Depends(bot_context)) -> BotContext:
        missing = [s for s in scopes if s not in ctx.scopes]
        if missing:
            raise BotError(403, "insufficient_scope",
                           f"This key lacks the scope(s): {', '.join(missing)}.")
        return ctx
    dep.__name__ = "require_" + "_".join(s.replace(":", "_") for s in scopes)
    dep.required_scopes = tuple(scopes)  # read by the guide / OpenAPI generator
    return dep


async def docs_access(request: Request) -> BotContext | None:
    """guide / openapi.json: open to key holders; public if BOT_DOCS_PUBLIC=true (no data in them).
    With BOT_DOCS_PUBLIC a key is still checked if one is sent (so the guide can show its scopes)."""
    ensure_enabled()
    if get_settings().BOT_DOCS_PUBLIC and not _extract_key(request):
        _anon_limit(request)
        return None
    return authenticate(request)


# ─── writes ───────────────────────────────────────────────────────────────────────────
write_limiter = SlidingWindowLimiter(window=60.0)
daily_write_limiter = SlidingWindowLimiter(window=86400.0)


def reset_write_limits() -> None:
    write_limiter.reset()
    daily_write_limiter.reset()


@dataclass(frozen=True)
class WriteContext:
    bot: BotContext
    dry_run: bool
    idempotency_key: Optional[str]

    @property
    def actor(self) -> str:
        """How the dashboard shows who did it (note author / activity actor)."""
        return "bot:" + self.bot.name


def require_write(scope: str) -> Callable:
    """Dependency factory for write endpoints: key with `scope`, writes switched on (unless
    dry_run), within the per-key write limits. Adds the dry_run query param and the optional
    Idempotency-Key header to the endpoint."""
    async def dep(
        dry_run: bool = Query(False, description="true = validate and show what would change, write nothing"),
        idempotency_key: Optional[str] = Header(
            None, alias="Idempotency-Key", max_length=100, pattern=IDEM_PATTERN,
            description="Recommended: a unique id per intended write (e.g. a UUID). Retrying with the "
                        "same id never writes twice; the first result is returned again."),
        ctx: BotContext = Depends(require_scopes(scope)),
    ) -> WriteContext:
        s = get_settings()
        if not dry_run and not s.BOT_API_WRITE_ENABLED:
            raise BotError(403, "writes_disabled",
                           "Writing through the bot API is switched off by the owner "
                           "(dry_run=true previews still work).")
        retry = write_limiter.hit("key:" + ctx.key_id, s.BOT_WRITE_RATE_LIMIT_PER_MINUTE)
        if retry:
            raise BotError(429, "rate_limited",
                           f"Write limit of {s.BOT_WRITE_RATE_LIMIT_PER_MINUTE} writes/minute exceeded.",
                           {"Retry-After": str(retry)})
        if not dry_run:
            retry = daily_write_limiter.hit("key:" + ctx.key_id, s.BOT_WRITE_DAILY_LIMIT)
            if retry:
                raise BotError(429, "rate_limited",
                               f"Daily write limit of {s.BOT_WRITE_DAILY_LIMIT} writes exceeded.",
                               {"Retry-After": str(retry)})
        return WriteContext(bot=ctx, dry_run=dry_run, idempotency_key=idempotency_key)
    dep.__name__ = "require_write_" + scope.replace(":", "_")
    dep.required_scopes = (scope,)
    dep.is_write = True
    return dep
