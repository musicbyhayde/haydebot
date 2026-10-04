"""Bot API v1 - read-only, vendor-neutral HTTPS + JSON for bots / AI agents.

Auth: per-bot key ('Authorization: Bearer <key>', see app/bot/auth.py). Every request is audited
(app/bot/middleware.py). Errors: {"error": {"status", "code", "message"}} (app/bot/errors.py).
Lists: {"data": [...], "page": {"total", "limit", "offset", "next_offset"}}; single: {"data": {...}}.
No endpoint here writes data, sends messages to customers, or exposes the full backup.
Handlers are plain `def` so the (blocking) database reads run in the threadpool.
"""
from __future__ import annotations

import logging
from datetime import date, datetime
from typing import Literal, Optional

from fastapi import APIRouter, Depends, Path, Query
from fastapi.responses import JSONResponse, PlainTextResponse

from app.bot import data
from app.bot import guide as guide_mod
from app.bot.auth import BotContext, bot_context, docs_access, require_scopes
from app.core.config import get_settings
from app.bot.errors import BotError

logger = logging.getLogger("haydebot.bot.api")

BOT_API_PREFIX = "/api/bot/v1"

bot_router = APIRouter(prefix=BOT_API_PREFIX)

ERRORS = {
    401: {"description": "Missing, invalid, revoked or expired key"},
    403: {"description": "Key lacks a required scope"},
    404: {"description": "Not found, or the bot API is switched off (code bot_api_disabled)"},
    424: {"description": "Database temporarily unreachable (key_store_unavailable / upstream_error); "
                         "retry after Retry-After seconds"},
    429: {"description": "Rate limit exceeded (see Retry-After)"},
}
NOT_FOUND = {**ERRORS, 404: {"description": "No such lead, or the bot API is switched off (bot_api_disabled)"}}
LIMIT = Query(50, ge=1, le=200, description="Page size (max 200)")
OFFSET = Query(0, ge=0, le=100_000, description="Items to skip; use page.next_offset for the next page")
LEAD_ID = Path(..., min_length=1, max_length=64, description="Lead id, e.g. rec1a2b3c4d5e6f7a")


def _run(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except BotError:
        raise
    except Exception as e:  # database / network problem; details stay in the server log
        logger.warning("BOT_API: %s failed: %s", getattr(fn, "__name__", "?"), type(e).__name__)
        # 424, not 5xx: DigitalOcean's edge would replace a 5xx body with an HTML page
        raise BotError(424, "upstream_error", "Could not read the data right now, retry shortly.",
                       {"Retry-After": "10"})


# ─── meta ─────────────────────────────────────────────────────────────────────────────
@bot_router.get("/whoami", tags=["meta"], operation_id="whoami", responses=ERRORS,
                summary="Which bot am I and what may I read")
def whoami(ctx: BotContext = Depends(bot_context)):
    """Name and scopes of the calling key. Cheap way to test a key."""
    return {"data": {"bot": ctx.name, "scopes": sorted(ctx.scopes), "read_only": True}}


@bot_router.get("/guide", tags=["meta"], operation_id="getGuide", responses=ERRORS,
                summary="Read me first: domain knowledge, endpoints and usage tips for agents")
def get_guide(format: Literal["json", "markdown"] = Query("json", description="markdown = paste into an LLM prompt"),
              ctx: Optional[BotContext] = Depends(docs_access)):
    """Natural-language + JSON description of the business domain (statuses, services, Hebrew terms),
    every endpoint with its scopes, recommended usage and example questions. No business data."""
    caller = {"bot": ctx.name, "scopes": sorted(ctx.scopes)} if ctx else None
    g = guide_mod.build_guide(bot_router, BOT_API_PREFIX, get_settings().PUBLIC_BASE_URL, caller)
    if format == "markdown":
        return PlainTextResponse(guide_mod.guide_markdown(g), media_type="text/markdown; charset=utf-8")
    return {"data": g}


@bot_router.get("/openapi.json", tags=["meta"], operation_id="getOpenApi", include_in_schema=False)
def get_openapi_spec(ctx: Optional[BotContext] = Depends(docs_access)):
    """OpenAPI 3 document for the Bot API only (import as tools in Grok, ChatGPT Actions, Claude, n8n...)."""
    return JSONResponse(guide_mod.build_openapi(bot_router, BOT_API_PREFIX, get_settings().PUBLIC_BASE_URL))


# ─── leads ────────────────────────────────────────────────────────────────────────────
@bot_router.get("/leads", tags=["leads"], operation_id="listLeads", responses=ERRORS,
                summary="Search / filter leads (customers and their events)")
def list_leads(
    status: Optional[str] = Query(None, description="Comma list of status codes, e.g. 'New,Talking,Quote_Sent'"),
    service: Optional[str] = Query(None, description="Comma list: Bouzouki, Band, DJ, Reception, Talk, Other"),
    owner: Optional[str] = Query(None, max_length=50, description="Exact owner name (Hebrew first name of the partner)"),
    q: Optional[str] = Query(None, max_length=100, description="Free text in name / location / summary, or 4+ phone digits"),
    open_only: bool = Query(False, description="Only leads still in the pipeline (not Closed/Lost/Completed/Referred/Cold)"),
    event_from: Optional[date] = Query(None, description="Event date >= (YYYY-MM-DD)"),
    event_to: Optional[date] = Query(None, description="Event date <= (YYYY-MM-DD)"),
    created_from: Optional[date] = Query(None, description="Lead created on/after (YYYY-MM-DD)"),
    created_to: Optional[date] = Query(None, description="Lead created on/before (YYYY-MM-DD)"),
    updated_since: Optional[datetime] = Query(None, description="Last interaction at/after (ISO 8601)"),
    sort: Literal["last_interaction", "event_date", "created"] = Query("last_interaction"),
    limit: int = LIMIT, offset: int = OFFSET,
    ctx: BotContext = Depends(require_scopes("leads:read")),
):
    """Leads newest-activity first. Phone numbers are masked unless the key has pii:read;
    closing_amount only with finance:summary."""
    return _run(data.list_leads, ctx, status=status, service=service, owner=owner, q=q,
                open_only=open_only, event_from=event_from, event_to=event_to,
                created_from=created_from, created_to=created_to, updated_since=updated_since,
                sort=sort, limit=limit, offset=offset)


@bot_router.get("/leads/{lead_id}", tags=["leads"], operation_id="getLead",
                responses=NOT_FOUND, summary="One lead in detail")
def get_lead(lead_id: str = LEAD_ID, ctx: BotContext = Depends(require_scopes("leads:read"))):
    """Lead detail: event, status, assigned musicians (names with musicians:read), RSVPs,
    lost reason; quote and commission only with finance:read."""
    return _run(data.get_lead, ctx, lead_id)


@bot_router.get("/leads/{lead_id}/messages", tags=["leads"], operation_id="getLeadMessages",
                responses=NOT_FOUND,
                summary="WhatsApp conversation of a lead (read only)")
def get_lead_messages(lead_id: str = LEAD_ID,
                      order: Literal["newest", "oldest"] = Query("newest"),
                      limit: int = LIMIT, offset: int = OFFSET,
                      ctx: BotContext = Depends(require_scopes("leads:read", "messages:read"))):
    """Messages between the business and the customer. direction: Inbound = from the customer,
    Outbound = from us / the WhatsApp bot. This API cannot send messages."""
    return _run(data.lead_messages, ctx, lead_id, limit=limit, offset=offset, order=order)


@bot_router.get("/leads/{lead_id}/notes", tags=["leads"], operation_id="getLeadNotes",
                responses=NOT_FOUND, summary="Internal notes on a lead")
def get_lead_notes(lead_id: str = LEAD_ID, limit: int = LIMIT, offset: int = OFFSET,
                   ctx: BotContext = Depends(require_scopes("leads:read", "notes:read"))):
    """Team notes, newest first, with optional follow-up date."""
    return _run(data.lead_notes, ctx, lead_id, limit=limit, offset=offset)


# ─── notes / tasks ────────────────────────────────────────────────────────────────────
@bot_router.get("/follow-ups", tags=["notes"], operation_id="listPendingFollowUps", responses=ERRORS,
                summary="Follow-up reminders due today or overdue")
def list_follow_ups(limit: int = LIMIT, offset: int = OFFSET,
                    ctx: BotContext = Depends(require_scopes("notes:read"))):
    """Notes whose follow-up date is today or earlier and not marked done (lead_name with leads:read)."""
    return _run(data.pending_followups, ctx, limit=limit, offset=offset)


@bot_router.get("/tasks", tags=["tasks"], operation_id="listTasks", responses=ERRORS,
                summary="Team tasks")
def list_tasks(status: Literal["open", "done", "all"] = Query("open"),
               assignee: Optional[str] = Query(None, max_length=50, description="Exact assignee name"),
               lead_id: Optional[str] = Query(None, max_length=64),
               due_from: Optional[date] = Query(None), due_to: Optional[date] = Query(None),
               overdue: bool = Query(False, description="Only open tasks due before today"),
               limit: int = LIMIT, offset: int = OFFSET,
               ctx: BotContext = Depends(require_scopes("tasks:read"))):
    """Tasks sorted by due date (no date last)."""
    return _run(data.list_tasks, ctx, status=status, assignee=assignee, lead_id=lead_id,
                due_from=due_from, due_to=due_to, overdue=overdue, limit=limit, offset=offset)


# ─── events / stats ───────────────────────────────────────────────────────────────────
@bot_router.get("/events/upcoming", tags=["events"], operation_id="listUpcomingEvents", responses=ERRORS,
                summary="Upcoming events (from the leads' event dates)")
def list_upcoming_events(days: int = Query(60, ge=1, le=365, description="Look-ahead window in days"),
                         include_all: bool = Query(False, description="Also include Lost / Cold / Referred leads"),
                         limit: int = LIMIT, offset: int = OFFSET,
                         ctx: BotContext = Depends(require_scopes("leads:read"))):
    """Events from today to today+days (Israel time), soonest first. covered=true when the lead is
    Closed / Assigned / Waiting_Payment / Completed."""
    return _run(data.upcoming_events, ctx, days=days, include_all=include_all, limit=limit, offset=offset)


@bot_router.get("/stats", tags=["stats"], operation_id="getStats", responses=ERRORS,
                summary="Counts by status / service / owner")
def get_stats(ctx: BotContext = Depends(require_scopes("leads:read"))):
    """Pipeline snapshot. With finance:summary also closed deal amounts by event month."""
    return _run(data.stats, ctx)


@bot_router.get("/attention", tags=["stats"], operation_id="getAttention", responses=ERRORS,
                summary="What needs attention now")
def get_attention(no_reply_hours: int = Query(12, ge=1, le=720, description="Customer wrote last, waiting at least this long"),
                  stale_days: int = Query(7, ge=1, le=365, description="Open lead with no interaction for this many days"),
                  event_days: int = Query(14, ge=1, le=90, description="Event within this many days but not closed"),
                  ctx: BotContext = Depends(require_scopes("leads:read"))):
    """needs_reply, stale_leads, events_soon_not_closed; plus overdue_followups (notes:read) and
    overdue_tasks (tasks:read). Reads message times/directions only, not their content."""
    return _run(data.attention, ctx, no_reply_hours=no_reply_hours, stale_days=stale_days,
                event_days=event_days)


# ─── musicians ────────────────────────────────────────────────────────────────────────
@bot_router.get("/musicians", tags=["musicians"], operation_id="listMusicians", responses=ERRORS,
                summary="Musicians")
def list_musicians(active_only: bool = Query(True), type: Optional[Literal["REFERRER", "POOL"]] = Query(None),
                   limit: int = Query(100, ge=1, le=200), offset: int = OFFSET,
                   ctx: BotContext = Depends(require_scopes("musicians:read"))):
    """Name, type, active, score. Phone/email only with pii:read; bank details never."""
    return _run(data.list_musicians, ctx, active_only=active_only, type=type, limit=limit, offset=offset)


# ─── finance ──────────────────────────────────────────────────────────────────────────
@bot_router.get("/finance/summary", tags=["finance"], operation_id="getFinanceSummary", responses=ERRORS,
                summary="Finance totals per owner and month (ILS)")
def get_finance_summary(owner: Optional[str] = Query(None, max_length=50),
                        date_from: Optional[date] = Query(None), date_to: Optional[date] = Query(None),
                        ctx: BotContext = Depends(require_scopes("finance:summary"))):
    """Aggregates only: income, expenses, balance, cash vs bank, unpaid income."""
    return _run(data.finance_summary, ctx, owner=owner, date_from=date_from, date_to=date_to)


@bot_router.get("/finance/entries", tags=["finance"], operation_id="listFinanceEntries", responses=ERRORS,
                summary="Individual finance ledger entries")
def list_finance_entries(owner: Optional[str] = Query(None, max_length=50),
                         type: Optional[Literal["income", "expense"]] = Query(None),
                         date_from: Optional[date] = Query(None), date_to: Optional[date] = Query(None),
                         limit: int = LIMIT, offset: int = OFFSET,
                         ctx: BotContext = Depends(require_scopes("finance:read"))):
    """Ledger rows, newest first."""
    return _run(data.finance_entries, ctx, owner=owner, entry_type=type, date_from=date_from,
                date_to=date_to, limit=limit, offset=offset)
