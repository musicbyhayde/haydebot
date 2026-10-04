"""ASGI middleware: writes one bot_audit_log row per /api/bot/* request (status + latency)."""
from __future__ import annotations

import time
from urllib.parse import parse_qsl

from app.bot import audit
from app.bot.errors import is_bot_path
from app.core.config import get_settings


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
            if get_settings().BOT_API_ENABLED and not state.get("bot_audit_skip"):
                headers = {k.decode("latin-1").lower(): v.decode("latin-1")
                           for k, v in scope.get("headers") or []}
                client = scope.get("client") or ("?", 0)
                audit.record({
                    "key_id": state.get("bot_key_id"),
                    "bot_name": state.get("bot_name"),
                    "method": scope.get("method", "?"),
                    "path": scope.get("path", "")[:300],
                    "params": audit.sanitize_params(
                        dict(parse_qsl(scope.get("query_string", b"").decode("latin-1")))),
                    "status": status["code"],
                    "latency_ms": int((time.perf_counter() - start) * 1000),
                    "error_code": state.get("bot_error_code"),
                    "ip": (headers.get("do-connecting-ip") or client[0] or "?")[:64],
                    "user_agent": headers.get("user-agent", "")[:200] or None,
                })
