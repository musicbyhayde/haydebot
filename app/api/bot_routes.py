"""Bot API v1 - read-only, vendor-neutral HTTPS + JSON for bots / AI agents.

Auth: per-bot key ('Authorization: Bearer <key>', see app/bot/auth.py). Every request is audited
(app/bot/middleware.py). Errors: {"error": {"status", "code", "message"}} (app/bot/errors.py).
No endpoint here writes data, sends messages to customers, or exposes the full backup.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends

from app.bot.auth import BotContext, bot_context

BOT_API_PREFIX = "/api/bot/v1"

bot_router = APIRouter(prefix=BOT_API_PREFIX)


@bot_router.get("/whoami", tags=["meta"], summary="Which bot am I and what may I read",
                operation_id="whoami")
async def whoami(ctx: BotContext = Depends(bot_context)):
    """Name and scopes of the calling key. Cheap way to test a key."""
    return {"data": {"bot": ctx.name, "scopes": sorted(ctx.scopes), "read_only": True}}
