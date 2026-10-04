"""Bot API write actions (phase 2). Each action goes through the SAME SupabaseService functions and
models the dashboard API uses (create_note / update_note / create_task / update_task / update_lead /
create_activity, NoteCreate / TaskCreate / LeadUpdate ...), with the dashboard's field formats and
activity texts (app/services/activity_text.py), so the dashboard shows bot actions like any other.

Differences from the dashboard, on purpose:
- The actor is always 'bot:<key name>' (note Author, activity actor), never a partner's name.
- No side effects that contact anyone: no WhatsApp, no Bouzouki distribution, no Google Calendar
  invites/updates (a partner syncs the calendar from the dashboard; responses carry a warning).
- Narrow rules: only some statuses (never Closed), owners only the partners, no deletes except
  taking a musician off a crew. Repeating an update that is already in effect changes nothing.
- Every write also gets an activity row (the dashboard logs some actions silently), so the
  History page shows everything a bot did.
Every function returns a Result; nothing is written when w.dry_run is true.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import date
from typing import Any, Optional

from app.bot import data
from app.bot import idempotency as idem
from app.bot.auth import WriteContext
from app.bot.errors import BotError
from app.models.schemas import ActivityCreate, LeadUpdate, NoteCreate, NoteUpdate, TaskCreate, TaskUpdate
from app.services import activity_text as texts
from app.services.activity_text import PARTNERS  # noqa: F401 (re-exported for the routes)

logger = logging.getLogger("haydebot.bot.writes")

# Statuses a bot may set. Not: New/Processing/Distributed/Assigned (automation states),
# Closed (deal value + calendar, a partner decides), Referred (commission).
BOT_SETTABLE_STATUSES: tuple[str, ...] = ("Talking", "Manual", "Quote_Sent", "Waiting_Payment",
                                          "Cold", "Lost", "Completed")
CREW_TYPES = {"POOL", "REFERRER"}          # same filter as the dashboard's crew picker
CALENDAR_WARNING = ("This lead has a Google Calendar event; it was NOT updated. A partner should "
                    "sync the calendar from the dashboard.")


@dataclass
class Result:
    status: int
    data: Any
    changes: dict = field(default_factory=dict)
    warnings: list = field(default_factory=list)
    result_id: Optional[str] = None
    replayed: bool = False

    @property
    def changed(self) -> bool:
        return bool(self.changes)


def _db():
    return data.db  # one patch point for tests (same object the read endpoints use)


def ddmmyyyy(d: date) -> str:
    """Dates the dashboard writes for tasks and event dates (e.g. 20.11.2026)."""
    return f"{d:%d.%m.%Y}"


def _is_duplicate(exc: Exception) -> bool:
    msg = str(exc).lower()
    return getattr(exc, "code", None) == "23505" or "23505" in msg or "duplicate key" in msg


def _fields(rec: Optional[dict]) -> dict:
    return (rec or {}).get("fields") or {}


def _log_activity(w: WriteContext, action: str, action_type: str, description: str,
                  lead_id: Optional[str]) -> bool:
    """Activity row with the bot as actor. Best effort (the main write already happened)."""
    try:
        _db().create_activity(ActivityCreate(actor=w.actor, action_type=action_type,
                                             description=description, lead_id=lead_id),
                              record_id=idem.activity_id(w.bot.key_id, action, w.idempotency_key))
        return True
    except Exception as e:
        if _is_duplicate(e):  # retry of an idempotent write: already logged
            return True
        logger.warning("BOT_WRITE: activity for %s not logged: %s", action, type(e).__name__)
        return False


def _check_updated(res: Any) -> None:
    # SupabaseService.update_lead / update_task return {} on failure instead of raising
    if not res:
        raise BotError(424, "upstream_error", "The change could not be saved right now, retry shortly.",
                       {"Retry-After": "10"})


def _get(table: str, rid: str, what: str) -> dict:
    rec = getattr(_db(), table).get(rid) if rid else None
    if not rec:
        raise BotError(404, "not_found", f"{what} '{rid}' not found.")
    return rec


def _musicians() -> dict:
    return {m.get("id"): m for m in _db().get_all_musicians()}


def _name(rec: Optional[dict]) -> Optional[str]:
    return _fields(rec).get("Name")


def task_out(rec: dict) -> dict:
    f = _fields(rec)
    due = data.parse_day(f.get("Due_Date"))
    return {"id": rec.get("id"), "title": f.get("Title"), "assignee": f.get("Assignee"),
            "due_date": due.isoformat() if due else None, "is_completed": bool(f.get("Is_Completed")),
            "lead_id": f.get("Lead_ID"), "created_at": f.get("Created_At")}


def _create_with_id(create, model, rid: Optional[str], table: str, same) -> tuple[Optional[dict], bool]:
    """Insert with a deterministic id when idempotent. -> (record, replayed)."""
    try:
        return create(model, record_id=rid), False
    except Exception as e:
        if not (rid and _is_duplicate(e)):
            raise
    existing = getattr(_db(), table).get(rid)
    if not existing or not same(_fields(existing)):
        raise BotError(409, "idempotency_key_reused",
                       "This Idempotency-Key was already used with a different request.")
    return existing, True


# ─── notes ────────────────────────────────────────────────────────────────────────────
def add_note(w: WriteContext, lead_id: str, content: str, follow_up_date: Optional[date]) -> Result:
    data._get_lead(lead_id)
    fu = follow_up_date.isoformat() if follow_up_date else None   # notes use YYYY-MM-DD
    note = NoteCreate(lead_id=lead_id, author=w.actor, content=content, follow_up_date=fu,
                      follow_up_completed=False)
    changes = {"note": {"lead_id": lead_id, "author": w.actor, "content": content, "follow_up_date": fu}}
    if w.dry_run:
        return Result(200, {"id": None, "lead_id": lead_id, "author": w.actor, "content": content,
                            "follow_up_date": fu, "follow_up_completed": False}, changes)
    rid = idem.record_id(w.bot.key_id, "note.create", w.idempotency_key)
    rec, replayed = _create_with_id(
        _db().create_note, note, rid, "notes_table",
        lambda f: f.get("Lead_ID") == lead_id and f.get("Content") == content)
    _check_updated(rec)
    out = data.note_out(rec, w.bot)
    if replayed:
        return Result(200, out, changes, result_id=rec.get("id"), replayed=True)
    action_type, desc = texts.note_added(content)
    warnings = [] if _log_activity(w, "note.create", action_type, desc, lead_id) else ["activity_not_logged"]
    return Result(201, out, changes, warnings, result_id=rec.get("id"))


def update_follow_up(w: WriteContext, note_id: str, completed: Optional[bool],
                     follow_up_date: Optional[date]) -> Result:
    rec = _get("notes_table", note_id, "Note")
    f = _fields(rec)
    if follow_up_date is None and not f.get("Follow_Up_Date"):
        raise BotError(409, "no_follow_up", "This note has no follow-up date; send follow_up_date to set one.")
    if follow_up_date is not None and completed is None:
        completed = False            # a new reminder date means it is pending again
    changes: dict = {}
    if follow_up_date is not None and f.get("Follow_Up_Date") != follow_up_date.isoformat():
        changes["follow_up_date"] = {"from": f.get("Follow_Up_Date"), "to": follow_up_date.isoformat()}
    if completed is not None and bool(f.get("Follow_Up_Completed")) != completed:
        changes["follow_up_completed"] = {"from": bool(f.get("Follow_Up_Completed")), "to": completed}
    preview = {**data.note_out(rec, w.bot),
               **{k: v["to"] for k, v in changes.items()}}
    if not changes or w.dry_run:
        return Result(200, preview, changes, result_id=note_id)
    upd = NoteUpdate(follow_up_date=changes.get("follow_up_date", {}).get("to"),
                     follow_up_completed=changes.get("follow_up_completed", {}).get("to"))
    res = _db().update_note(note_id, upd)
    _check_updated(res)
    snippet = (f.get("Content") or "")[:30]
    if changes.get("follow_up_completed", {}).get("to") is True:
        desc = f"סימן/ה תזכורת כטופלה: {snippet}..."
    elif "follow_up_date" in changes:
        desc = f"קבע/ה תזכורת ל-{ddmmyyyy(follow_up_date)}: {snippet}..."
    else:
        desc = f"פתח/ה מחדש תזכורת: {snippet}..."
    warnings = [] if _log_activity(w, "note.follow_up", "עדכון תזכורת", desc, f.get("Lead_ID")) \
        else ["activity_not_logged"]
    return Result(200, data.note_out(res, w.bot), changes, warnings, result_id=note_id)


# ─── tasks ────────────────────────────────────────────────────────────────────────────
def create_task(w: WriteContext, title: str, assignee: Optional[str], due_date: Optional[date],
                lead_id: Optional[str]) -> Result:
    if lead_id:
        data._get_lead(lead_id)
    due = ddmmyyyy(due_date) if due_date else None
    task = TaskCreate(title=title, assignee=assignee, due_date=due, is_completed=False, lead_id=lead_id)
    changes = {"task": {"title": title, "assignee": assignee, "due_date": due, "lead_id": lead_id}}
    if w.dry_run:
        return Result(200, {"id": None, "title": title, "assignee": assignee,
                            "due_date": due_date.isoformat() if due_date else None,
                            "is_completed": False, "lead_id": lead_id, "created_at": None}, changes)
    rid = idem.record_id(w.bot.key_id, "task.create", w.idempotency_key)
    rec, replayed = _create_with_id(
        _db().create_task, task, rid, "tasks_table",
        lambda f: f.get("Title") == title and f.get("Lead_ID") == lead_id)
    _check_updated(rec)
    if replayed:
        return Result(200, task_out(rec), changes, result_id=rec.get("id"), replayed=True)
    action_type, desc = texts.task_created(title)
    warnings = [] if _log_activity(w, "task.create", action_type, desc, lead_id) else ["activity_not_logged"]
    return Result(201, task_out(rec), changes, warnings, result_id=rec.get("id"))


def update_task(w: WriteContext, task_id: str, *, completed: Optional[bool] = None,
                due_date: Optional[date] = None, assignee: Optional[str] = None,
                title: Optional[str] = None) -> Result:
    rec = _get("tasks_table", task_id, "Task")
    f = _fields(rec)
    want = {"Is_Completed": completed, "Due_Date": ddmmyyyy(due_date) if due_date else None,
            "Assignee": assignee, "Title": title}
    changes = {}
    for k, v in want.items():
        cur = bool(f.get(k)) if k == "Is_Completed" else f.get(k)
        if v is not None and cur != v:
            changes[k.lower()] = {"from": cur, "to": v}
    preview = task_out({"id": task_id, "fields": {**f, **{k: v for k, v in want.items()
                                                           if v is not None}}})
    if not changes or w.dry_run:
        return Result(200, preview, changes, result_id=task_id)
    upd = TaskUpdate(**{k.lower(): c["to"] for k, c in changes.items()})
    res = _db().update_task(task_id, upd)
    _check_updated(res)
    t = title or f.get("Title") or ""
    if changes.get("is_completed", {}).get("to") is True and len(changes) == 1:
        action_type, desc = "משימה הושלמה", f"סימן/ה משימה כבוצעה: {t}"
    else:
        labels = {"is_completed": "סטטוס", "due_date": "תאריך יעד", "assignee": "אחראי", "title": "כותרת"}
        action_type, desc = "עדכון משימה", f"עדכן/ה משימה: {t} ({', '.join(labels[k] for k in changes)})"
    warnings = [] if _log_activity(w, "task.update", action_type, desc, f.get("Lead_ID")) \
        else ["activity_not_logged"]
    return Result(200, task_out(res), changes, warnings, result_id=task_id)


# ─── crew (musicians on an event = lead Musician_Team) ────────────────────────────────
def _crew_out(w: WriteContext, team: list, musicians: dict) -> list:
    names = w.bot.has("musicians:read")
    return [{"id": m, **({"name": _name(musicians.get(m))} if names else {})} for m in team]


def _busy_elsewhere(lead: dict, musician_id: str) -> list[dict]:
    ev = data.parse_event_date(_fields(lead).get("Event_Date"))
    if not ev:
        return []
    out = []
    for other in _db().get_all_leads():
        of = _fields(other)
        if other.get("id") == lead.get("id") or of.get("Status") in data.EVENT_HIDDEN:
            continue
        if musician_id in (of.get("Musician_Team") or []) and data.parse_event_date(of.get("Event_Date")) == ev:
            out.append({"lead_id": other.get("id"), "event_date": ev.isoformat()})
    return out


def crew_add(w: WriteContext, lead_id: str, musician_id: str, allow_conflict: bool = False) -> Result:
    lead = data._get_lead(lead_id)
    f = _fields(lead)
    musicians = _musicians()
    m = musicians.get(musician_id)
    if not m:
        raise BotError(404, "not_found", f"Musician '{musician_id}' not found.")
    mf = _fields(m)
    if mf.get("Is_Active") is False or mf.get("Type") not in CREW_TYPES:
        raise BotError(409, "musician_unavailable", "This musician is inactive or not a crew musician.")
    team = list(f.get("Musician_Team") or [])
    if musician_id in team:
        return Result(200, {"lead_id": lead_id, "crew": _crew_out(w, team, musicians)}, result_id=lead_id)
    warnings = []
    busy = _busy_elsewhere(lead, musician_id)
    if busy and not allow_conflict:
        raise BotError(409, "musician_busy",
                       f"The musician is already on the crew of another event on {busy[0]['event_date']} "
                       f"(lead {busy[0]['lead_id']}). Send allow_conflict=true to add anyway.")
    if busy:
        warnings.append(f"musician_busy: also on lead {busy[0]['lead_id']} the same day")
    if f.get("Google_Event_ID"):
        warnings.append(CALENDAR_WARNING)
    new_team = team + [musician_id]
    changes = {"musician_team": {"add": musician_id}}
    if w.dry_run:
        return Result(200, {"lead_id": lead_id, "crew": _crew_out(w, new_team, musicians)}, changes, warnings,
                      result_id=lead_id)
    _check_updated(_db().update_lead(lead_id, LeadUpdate(musician_team=new_team)))
    if not _log_activity(w, "crew.add", "עדכון צוות", f"הוסיף/ה את {_name(m) or musician_id} לצוות האירוע",
                         lead_id):
        warnings.append("activity_not_logged")
    return Result(200, {"lead_id": lead_id, "crew": _crew_out(w, new_team, musicians)}, changes, warnings,
                  result_id=lead_id)


def crew_remove(w: WriteContext, lead_id: str, musician_id: str) -> Result:
    lead = data._get_lead(lead_id)
    f = _fields(lead)
    musicians = _musicians()
    team = list(f.get("Musician_Team") or [])
    if musician_id not in team:
        return Result(200, {"lead_id": lead_id, "crew": _crew_out(w, team, musicians)}, result_id=lead_id)
    new_team = [x for x in team if x != musician_id]
    changes = {"musician_team": {"remove": musician_id}}
    warnings = [CALENDAR_WARNING] if f.get("Google_Event_ID") else []
    if w.dry_run:
        return Result(200, {"lead_id": lead_id, "crew": _crew_out(w, new_team, musicians)}, changes, warnings,
                      result_id=lead_id)
    _check_updated(_db().update_lead(lead_id, LeadUpdate(musician_team=new_team)))
    name = _name(musicians.get(musician_id)) or musician_id
    if not _log_activity(w, "crew.remove", "עדכון צוות", f"הסיר/ה את {name} מצוות האירוע", lead_id):
        warnings.append("activity_not_logged")
    return Result(200, {"lead_id": lead_id, "crew": _crew_out(w, new_team, musicians)}, changes, warnings,
                  result_id=lead_id)


# ─── leads (limited fields) ───────────────────────────────────────────────────────────
def _lead_brief(lead_id: str, fields: dict) -> dict:
    return {"id": lead_id, "status": fields.get("Status"), "status_he": data.STATUS_HE.get(fields.get("Status")),
            "owner": fields.get("Owner"), "event_date_text": fields.get("Event_Date"),
            "location": fields.get("Location"), "guests": fields.get("Guests"),
            "lost_reason": fields.get("Lost_Reason")}


def set_status(w: WriteContext, lead_id: str, status: str, lost_reason: Optional[str] = None,
               expected_status: Optional[str] = None) -> Result:
    lead = data._get_lead(lead_id)
    f = _fields(lead)
    cur = f.get("Status")
    if expected_status and cur != expected_status:
        raise BotError(409, "status_mismatch", f"The lead's status is '{cur}', not '{expected_status}'.")
    if status not in BOT_SETTABLE_STATUSES:
        raise BotError(422, "invalid_request", f"A bot may set only: {', '.join(BOT_SETTABLE_STATUSES)}.")
    if lost_reason and status != "Lost":
        raise BotError(422, "invalid_request", "lost_reason is only allowed with status Lost.")
    if cur == status and (not lost_reason or lost_reason == f.get("Lost_Reason")):
        return Result(200, _lead_brief(lead_id, f), result_id=lead_id)
    if cur in ("Completed", "Referred"):
        raise BotError(409, "status_locked", f"A bot cannot change a lead that is {cur}.")
    if cur == "Closed" and status != "Completed":
        raise BotError(409, "status_locked", "A closed deal can only be marked Completed by a bot.")
    if status == "Completed" and cur != "Closed":
        raise BotError(409, "invalid_transition", "Only a Closed lead can be marked Completed.")
    changes: dict = {}
    if cur != status:
        changes["status"] = {"from": cur, "to": status}
    if lost_reason:
        changes["lost_reason"] = {"from": f.get("Lost_Reason"), "to": lost_reason}
    warnings = []
    if status == "Lost":
        open_tasks = [t for t in _db().get_tasks()
                      if _fields(t).get("Lead_ID") == lead_id and not _fields(t).get("Is_Completed")]
        if open_tasks:
            warnings.append(f"{len(open_tasks)} open task(s) on this lead were left open")
    preview = _lead_brief(lead_id, {**f, "Status": status, **({"Lost_Reason": lost_reason} if lost_reason else {})})
    if w.dry_run:
        return Result(200, preview, changes, warnings, result_id=lead_id)
    _check_updated(_db().update_lead(lead_id, LeadUpdate(status=status, lost_reason=lost_reason or None)))
    if "status" in changes:
        action_type, desc = texts.status_changed(status)
    else:
        action_type, desc = "עדכון ליד", f"עדכן/ה סיבת הפסד: {lost_reason[:30]}"
    if not _log_activity(w, "lead.status", action_type, desc, lead_id):
        warnings.append("activity_not_logged")
    return Result(200, preview, changes, warnings, result_id=lead_id)


def set_owner(w: WriteContext, lead_id: str, owner: str, handover_note: str) -> Result:
    lead = data._get_lead(lead_id)
    f = _fields(lead)
    prev = (f.get("Owner") or "").strip()
    if prev == owner:
        return Result(200, _lead_brief(lead_id, f), result_id=lead_id)
    action_type, desc, note_content = texts.owner_transfer(prev, owner, handover_note)
    changes = {"owner": {"from": prev or None, "to": owner}, "note": {"content": note_content}}
    preview = _lead_brief(lead_id, {**f, "Owner": owner})
    if w.dry_run:
        return Result(200, preview, changes, result_id=lead_id)
    _check_updated(_db().update_lead(lead_id, LeadUpdate(owner=owner)))
    warnings = []
    try:  # hand-over note, exactly like the dashboard's transfer (author = the bot)
        _create_with_id(_db().create_note, NoteCreate(lead_id=lead_id, author=w.actor, content=note_content),
                        idem.record_id(w.bot.key_id, "lead.owner.note", w.idempotency_key), "notes_table",
                        lambda nf: nf.get("Lead_ID") == lead_id)
    except Exception as e:
        logger.warning("BOT_WRITE: hand-over note not saved: %s", type(e).__name__)
        warnings.append("handover_note_not_saved")
    if not _log_activity(w, "lead.owner", action_type, desc, lead_id):
        warnings.append("activity_not_logged")
    return Result(200, preview, changes, warnings, result_id=lead_id)


def set_event(w: WriteContext, lead_id: str, event_date: Optional[date] = None,
              location: Optional[str] = None, guests: Optional[str] = None) -> Result:
    lead = data._get_lead(lead_id)
    f = _fields(lead)
    want = {"Event_Date": ddmmyyyy(event_date) if event_date else None, "Location": location, "Guests": guests}
    changes = {k.lower(): {"from": f.get(k), "to": v} for k, v in want.items() if v is not None and f.get(k) != v}
    preview = _lead_brief(lead_id, {**f, **{k: v for k, v in want.items() if v is not None}})
    if not changes:
        return Result(200, preview, result_id=lead_id)
    warnings = [CALENDAR_WARNING] if f.get("Google_Event_ID") else []
    if w.dry_run:
        return Result(200, preview, changes, warnings, result_id=lead_id)
    _check_updated(_db().update_lead(lead_id, LeadUpdate(**{k: c["to"] for k, c in changes.items()})))
    labels = {"event_date": "תאריך", "location": "מיקום", "guests": "אורחים"}
    desc = "עדכן/ה פרטי אירוע: " + ", ".join(f"{labels[k]} {c['to']}" for k, c in changes.items())
    if not _log_activity(w, "lead.event", "עדכון פרטי אירוע", desc, lead_id):
        warnings.append("activity_not_logged")
    return Result(200, preview, changes, warnings, result_id=lead_id)
