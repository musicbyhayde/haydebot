"""Bot API v1 - vendor-neutral HTTPS + JSON for bots / AI agents: reads, plus a few narrow writes.

Auth: per-bot key ('Authorization: Bearer <key>', see app/bot/auth.py). Every request is audited
(app/bot/middleware.py). Errors: {"error": {"status", "code", "message"}} (app/bot/errors.py).
Lists: {"data": [...], "page": {"total", "limit", "offset", "next_offset"}}; single: {"data": {...}}.
Writes (POST/PATCH/DELETE, bottom of this file) need a write scope AND BOT_API_WRITE_ENABLED=true;
they support dry_run=true and the Idempotency-Key header (app/bot/writes.py, app/bot/idempotency.py).
No endpoint sends messages to customers, deletes leads, writes finance or exposes the backup.
Handlers are plain `def` so the (blocking) database calls run in the threadpool.
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta
from typing import Any, Callable, Literal, Optional, Union

from fastapi import APIRouter, Body, Depends, Path, Query, Request
from fastapi.responses import JSONResponse, PlainTextResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.bot import data
from app.bot import guide as guide_mod
from app.bot import idempotency as idem
from app.bot import writes
from app.bot.auth import BotContext, WriteContext, bot_context, docs_access, require_scopes, require_write
from app.bot.scopes import WRITE_SCOPES
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
                summary="Which bot am I, what may I read / write")
def whoami(ctx: BotContext = Depends(bot_context)):
    """Name and scopes of the calling key. Cheap way to test a key."""
    can_write = any(sc in WRITE_SCOPES for sc in ctx.scopes)
    return {"data": {"bot": ctx.name, "scopes": sorted(ctx.scopes), "read_only": not can_write,
                     "writes_enabled": bool(get_settings().BOT_API_WRITE_ENABLED) and can_write}}


@bot_router.get("/guide", tags=["meta"], operation_id="getGuide", responses=ERRORS,
                summary="Read me first: domain knowledge, endpoints and usage tips for agents")
def get_guide(format: Literal["json", "markdown"] = Query("json", description="markdown = paste into an LLM prompt"),
              ctx: Optional[BotContext] = Depends(docs_access)):
    """Natural-language + JSON description of the business domain (statuses, services, Hebrew terms),
    every endpoint with its scopes, recommended usage and example questions. No business data."""
    caller = {"bot": ctx.name, "scopes": sorted(ctx.scopes)} if ctx else None
    s = get_settings()
    g = guide_mod.build_guide(bot_router, BOT_API_PREFIX, s.PUBLIC_BASE_URL, caller,
                              writes_enabled=bool(s.BOT_API_WRITE_ENABLED))
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



# ═══ writes ═══════════════════════════════════════════════════════════════════════════
WRITE_ERRORS = {
    **ERRORS,
    403: {"description": "Key lacks the write scope (insufficient_scope), or writing is switched off "
                         "on the server (writes_disabled)"},
    404: {"description": "No such lead / note / task / musician, or the bot API is switched off"},
    409: {"description": "Conflict: idempotency_key_reused / idempotency_in_progress, status_locked, "
                         "invalid_transition, status_mismatch, musician_busy, musician_unavailable, no_follow_up"},
    429: {"description": "Rate limit or write limit exceeded (see Retry-After)"},
}
NOTE_ID = Path(..., min_length=1, max_length=64, description="Note id (from GET /leads/{id}/notes)")
TASK_ID = Path(..., min_length=1, max_length=64, description="Task id (from GET /tasks)")
MUSICIAN_ID = Path(..., min_length=1, max_length=64, description="Musician id (from GET /musicians)")
Partner = Literal[writes.PARTNERS]  # type: ignore[valid-type]
BotStatus = Literal[writes.BOT_SETTABLE_STATUSES]  # type: ignore[valid-type]


class _In(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


def _date_window(v: Optional[date], past_days: int, future_days: int, what: str) -> Optional[date]:
    if v is None:
        return v
    t = data.today()
    if not (t - timedelta(days=past_days) <= v <= t + timedelta(days=future_days)):
        raise ValueError(f"{what} must be between {t - timedelta(days=past_days)} and {t + timedelta(days=future_days)}")
    return v


class NoteIn(_In):
    content: str = Field(..., min_length=1, max_length=2000, description="The update text (Hebrew is fine)")
    follow_up_date: Optional[date] = Field(None, description="Optional reminder date YYYY-MM-DD (today..+365 days)")

    @field_validator("follow_up_date")
    @classmethod
    def _fu(cls, v):
        return _date_window(v, 0, 365, "follow_up_date")


class FollowUpIn(_In):
    completed: Optional[bool] = Field(None, description="true = reminder handled; false = reopen")
    follow_up_date: Optional[date] = Field(None, description="New reminder date YYYY-MM-DD (postpone)")

    @field_validator("follow_up_date")
    @classmethod
    def _fu(cls, v):
        return _date_window(v, 0, 365, "follow_up_date")

    @model_validator(mode="after")
    def _one(self):
        if self.completed is None and self.follow_up_date is None:
            raise ValueError("send completed and/or follow_up_date")
        return self


class TaskIn(_In):
    title: str = Field(..., min_length=1, max_length=200)
    assignee: Optional[Partner] = Field(None, description="Partner responsible (Hebrew first name)")
    due_date: Optional[date] = Field(None, description="YYYY-MM-DD (stored like the dashboard: DD.MM.YYYY)")
    lead_id: Optional[str] = Field(None, min_length=1, max_length=64, description="Link the task to a lead")

    @field_validator("due_date")
    @classmethod
    def _due(cls, v):
        return _date_window(v, 30, 730, "due_date")


class TaskPatchIn(_In):
    completed: Optional[bool] = Field(None, description="true = done, false = reopen")
    due_date: Optional[date] = None
    assignee: Optional[Partner] = None
    title: Optional[str] = Field(None, min_length=1, max_length=200)

    @field_validator("due_date")
    @classmethod
    def _due(cls, v):
        return _date_window(v, 30, 730, "due_date")

    @model_validator(mode="after")
    def _one(self):
        if all(getattr(self, k) is None for k in ("completed", "due_date", "assignee", "title")):
            raise ValueError("send at least one of completed, due_date, assignee, title")
        return self


class CrewIn(_In):
    musician_id: str = Field(..., min_length=1, max_length=64, description="From GET /musicians")
    allow_conflict: bool = Field(False, description="Add even if the musician is on another event that day")


class StatusIn(_In):
    status: BotStatus = Field(..., description="New status. Not allowed for bots: New, Processing, Distributed, "
                                                "Assigned, Closed, Referred. Completed only from Closed.")
    lost_reason: Optional[str] = Field(None, min_length=1, max_length=300, description="Only with status Lost")
    expected_status: Optional[str] = Field(None, max_length=30,
                                           description="Optional safety check: fail with 409 if the current status differs")


class OwnerIn(_In):
    owner: Partner = Field(..., description="New owner (partner)")
    handover_note: str = Field(..., min_length=3, max_length=500,
                               description="Why / what the new owner should know; saved as a note on the lead")


class EventIn(_In):
    event_date: Optional[date] = Field(None, description="YYYY-MM-DD (stored like the dashboard: DD.MM.YYYY)")
    location: Optional[str] = Field(None, min_length=1, max_length=200)
    guests: Optional[Union[int, str]] = Field(None, description="Number of guests (or a short text like '150-200')")

    @field_validator("event_date")
    @classmethod
    def _ev(cls, v):
        return _date_window(v, 365, 365 * 5, "event_date")

    @field_validator("guests")
    @classmethod
    def _guests(cls, v):
        if v is None:
            return v
        if isinstance(v, int) and not 1 <= v <= 100_000:
            raise ValueError("guests must be 1..100000")
        v = str(v).strip()
        if not 1 <= len(v) <= 50:
            raise ValueError("guests: 1-50 characters")
        return v

    @model_validator(mode="after")
    def _one(self):
        if self.event_date is None and self.location is None and self.guests is None:
            raise ValueError("send at least one of event_date, location, guests")
        return self


def _short(v: Any, n: int = 120) -> Any:
    if isinstance(v, str):
        return v if len(v) <= n else v[:n] + "…"
    if isinstance(v, dict):
        return {str(k)[:40]: _short(x, n) for k, x in list(v.items())[:20]}
    if isinstance(v, (list, tuple)):
        return [_short(x, n) for x in list(v)[:20]]
    return v


def _write(request: Request, w: WriteContext, action: str, body: Optional[BaseModel],
           fn: Callable[[], "writes.Result"], create: bool = False) -> JSONResponse:
    """Common path of every write: audit summary, idempotency (replay / conflict), 4xx-only errors."""
    payload_in = body.model_dump(mode="json", exclude_none=True) if body is not None else {}
    summary = {"action": action, "dry_run": w.dry_run, "body": _short(payload_in),
               "idem": w.idempotency_key[:100] if w.idempotency_key else None}
    request.state.bot_write = summary
    fp = idem.fingerprint(request.method, request.url.path, payload_in)
    slot = None
    if not w.dry_run:
        if w.idempotency_key:
            slot, ttl = f"{w.bot.key_id}|{request.method}|{request.url.path}|{w.idempotency_key}", idem.EXPLICIT_TTL
        elif create:  # duplicate guard for creates sent without an Idempotency-Key
            slot, ttl = f"{w.bot.key_id}|auto|{fp}", idem.IMPLICIT_TTL
    if slot:
        cached = idem.begin(slot, fp, ttl)
        if cached:
            status, payload = cached
            payload["write"]["replayed"] = True
            summary.update(replayed=True, result_id=payload["write"].get("result_id"))
            return JSONResponse(payload, status_code=status, headers={"Idempotent-Replayed": "true"})
    try:
        res = _run(fn)
    except BaseException:
        if slot:
            idem.abort(slot)
        raise
    payload = {"data": res.data,
               "write": {"action": action, "actor": w.actor, "dry_run": w.dry_run, "changed": res.changed,
                         "changes": res.changes, "warnings": res.warnings, "result_id": res.result_id,
                         "replayed": res.replayed}}
    summary.update(changed=res.changed, changes=_short(res.changes), result_id=res.result_id,
                   replayed=res.replayed, warnings=_short(res.warnings))
    if slot:
        idem.complete(slot, res.status, payload)
    return JSONResponse(payload, status_code=res.status,
                        headers={"Idempotent-Replayed": "true"} if res.replayed else None)


def _write_doc(text: str) -> str:
    return (text + "\n\nWrite endpoint: needs BOT_API_WRITE_ENABLED on the server. Add ?dry_run=true to "
            "validate and preview without writing. Send an Idempotency-Key header (e.g. a UUID) so a retry "
            "never writes twice. Shown in the dashboard as done by 'bot:<your key name>'.")


# ─── notes ────────────────────────────────────────────────────────────────────────────
@bot_router.post("/leads/{lead_id}/notes", tags=["write: notes"], operation_id="addLeadNote",
                 status_code=201, responses=WRITE_ERRORS, summary="Add a note / update to a lead",
                 description=_write_doc("Adds an internal note (עדכון) to the lead, optionally with a "
                                        "follow-up reminder date. Author = bot:<key name>."))
def add_lead_note(request: Request, lead_id: str = LEAD_ID, body: NoteIn = Body(...),
                  w: WriteContext = Depends(require_write("notes:write"))):
    return _write(request, w, "note.create", body,
                  lambda: writes.add_note(w, lead_id, body.content, body.follow_up_date), create=True)


@bot_router.patch("/notes/{note_id}/follow-up", tags=["write: notes"], operation_id="updateFollowUp",
                  responses=WRITE_ERRORS, summary="Mark a follow-up reminder done, reopen or postpone it",
                  description=_write_doc("Changes only the reminder of a note (never its text). A new "
                                         "follow_up_date without 'completed' reopens the reminder."))
def update_follow_up(request: Request, note_id: str = NOTE_ID, body: FollowUpIn = Body(...),
                     w: WriteContext = Depends(require_write("notes:write"))):
    return _write(request, w, "note.follow_up", body,
                  lambda: writes.update_follow_up(w, note_id, body.completed, body.follow_up_date))


# ─── tasks ────────────────────────────────────────────────────────────────────────────
@bot_router.post("/tasks", tags=["write: tasks"], operation_id="createTask", status_code=201,
                 responses=WRITE_ERRORS, summary="Create a team task",
                 description=_write_doc("Creates a task (optionally for a partner, with a due date, linked "
                                        "to a lead)."))
def create_task(request: Request, body: TaskIn = Body(...),
                w: WriteContext = Depends(require_write("tasks:write"))):
    return _write(request, w, "task.create", body,
                  lambda: writes.create_task(w, body.title, body.assignee, body.due_date, body.lead_id),
                  create=True)


@bot_router.patch("/tasks/{task_id}", tags=["write: tasks"], operation_id="updateTask",
                  responses=WRITE_ERRORS, summary="Mark a task done / reopen it, or change due date, assignee, title",
                  description=_write_doc("Partial update of a task. Tasks cannot be deleted through the API."))
def update_task(request: Request, task_id: str = TASK_ID, body: TaskPatchIn = Body(...),
                w: WriteContext = Depends(require_write("tasks:write"))):
    return _write(request, w, "task.update", body,
                  lambda: writes.update_task(w, task_id, completed=body.completed, due_date=body.due_date,
                                             assignee=body.assignee, title=body.title))


# ─── crew ─────────────────────────────────────────────────────────────────────────────
@bot_router.post("/leads/{lead_id}/crew", tags=["write: crew"], operation_id="addCrewMusician",
                 responses=WRITE_ERRORS, summary="Add a musician to the crew of a lead's event",
                 description=_write_doc("Adds the musician to the event crew (צוות). Refuses with 409 "
                                        "musician_busy if the musician is on another event the same day, unless "
                                        "allow_conflict=true. Calendar invites are NOT sent or updated."))
def add_crew_musician(request: Request, lead_id: str = LEAD_ID, body: CrewIn = Body(...),
                      w: WriteContext = Depends(require_write("crew:write"))):
    return _write(request, w, "crew.add", body,
                  lambda: writes.crew_add(w, lead_id, body.musician_id, body.allow_conflict))


@bot_router.delete("/leads/{lead_id}/crew/{musician_id}", tags=["write: crew"], operation_id="removeCrewMusician",
                   responses=WRITE_ERRORS, summary="Remove a musician from the crew of a lead's event",
                   description=_write_doc("Takes the musician off the event crew. Calendar invites are NOT "
                                          "changed."))
def remove_crew_musician(request: Request, lead_id: str = LEAD_ID, musician_id: str = MUSICIAN_ID,
                         w: WriteContext = Depends(require_write("crew:write"))):
    return _write(request, w, "crew.remove", None, lambda: writes.crew_remove(w, lead_id, musician_id))


# ─── leads ────────────────────────────────────────────────────────────────────────────
@bot_router.patch("/leads/{lead_id}/status", tags=["write: leads"], operation_id="setLeadStatus",
                  responses=WRITE_ERRORS, summary="Change a lead's pipeline status (never to Closed)",
                  description=_write_doc("Allowed: " + ", ".join(writes.BOT_SETTABLE_STATUSES) + ". A Closed "
                                         "deal can only become Completed; Completed / Referred leads are locked."))
def set_lead_status(request: Request, lead_id: str = LEAD_ID, body: StatusIn = Body(...),
                    w: WriteContext = Depends(require_write("leads:write"))):
    return _write(request, w, "lead.status", body,
                  lambda: writes.set_status(w, lead_id, body.status, body.lost_reason, body.expected_status))


@bot_router.patch("/leads/{lead_id}/owner", tags=["write: leads"], operation_id="setLeadOwner",
                  responses=WRITE_ERRORS, summary="Hand a lead over to a partner (with a hand-over note)",
                  description=_write_doc("Same as the dashboard's transfer: sets Owner, saves the hand-over "
                                         "note on the lead and logs the activity."))
def set_lead_owner(request: Request, lead_id: str = LEAD_ID, body: OwnerIn = Body(...),
                   w: WriteContext = Depends(require_write("leads:write"))):
    return _write(request, w, "lead.owner", body,
                  lambda: writes.set_owner(w, lead_id, body.owner, body.handover_note))


@bot_router.patch("/leads/{lead_id}/event", tags=["write: leads"], operation_id="setLeadEventDetails",
                  responses=WRITE_ERRORS, summary="Update event date / location / guests of a lead",
                  description=_write_doc("The Google Calendar event (if any) is NOT updated."))
def set_lead_event(request: Request, lead_id: str = LEAD_ID, body: EventIn = Body(...),
                   w: WriteContext = Depends(require_write("leads:write"))):
    return _write(request, w, "lead.event", body,
                  lambda: writes.set_event(w, lead_id, body.event_date, body.location, body.guests))
