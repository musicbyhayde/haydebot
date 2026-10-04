"""ASGI middleware: writes one bot_audit_log row per /api/bot/* request (status + latency;
for writes also a payload summary under params._write)."""
from __future__ import annotations

import logging
import time
from urllib.parse import parse_qsl

from app.bot import audit
from app.bot.errors import is_bot_path
from app.bot.ratelimit import limiter
from app.core.config import get_settings

logger = logging.getLogger("haydebot.bot.audit")


def _params(scope, state) -> dict:
    params = audit.sanitize_params(dict(parse_qsl(scope.get("query_string", b"").decode("latin-1"))))
    if state.get("bot_write"):  # write endpoints: summary of what was (or would be) changed
        params["_write"] = state["bot_write"]
    return params


class BotAuditMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope.get("type") != "http" or not is_bot_path(scope.get("path", "")):
            return await self.app(scope, receive, send)
        start = time.perf_counter()
        state = scope.setdefault("state", {})
        status = {"code": 500}

        async def send_wrapper(message):
            if message["type"] == "http.response.start":
                status["code"] = message["status"]
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            try:
                self._audit(scope, state, status["code"], start)
            except Exception as e:  # auditing must never break or mask a response
                logger.warning("BOT_AUDIT: could not queue audit row: %s", type(e).__name__)

    @staticmethod
    def _audit(scope, state, status_code: int, start: float) -> None:
        settings = get_settings()
        if not settings.BOT_API_ENABLED or state.get("bot_audit_skip"):
            return
        headers = {k.decode("latin-1").lower(): v.decode("latin-1") for k, v in scope.get("headers") or []}
        client = scope.get("client") or ("?", 0)
        ip = (headers.get("do-connecting-ip") or client[0] or "?")[:64]
        # requests without a valid key (incl. scanners hitting unknown paths): capped per IP
        if not state.get("bot_key_id") and limiter.hit("audit:" + ip, settings.BOT_ANON_RATE_LIMIT_PER_MINUTE):
            return
        audit.record({
            "key_id": state.get("bot_key_id"),
            "bot_name": state.get("bot_name"),
            "method": scope.get("method", "?"),
            "path": scope.get("path", "")[:300],
            "params": _params(scope, state),
            "status": status_code,
            "latency_ms": int((time.perf_counter() - start) * 1000),
            "error_code": state.get("bot_error_code"),
            "ip": ip,
            "user_agent": headers.get("user-agent", "")[:200] or None,
        })
