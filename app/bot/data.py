"""Read-only data for the Bot API: reads through the existing SupabaseService (paginated selects)
and returns small, English snake_case JSON with Hebrew labels next to codes.

Minimisation rules (see also app/bot/scopes.py):
- Phone numbers are masked (***1234) unless the key has pii:read; musician emails likewise.
- Musicians' bank details are never returned. Media / attachment URLs only with pii:read.
- Money (deal amount) only with finance:summary; quotes, commissions, ledger rows only with
  finance:read.
- Internal technical fields (Google event id, stars, read markers) are not returned.
Nothing here writes to the database.
"""
from __future__ import annotations

import re
from datetime import date, datetime, timedelta, timezone
from typing import Any, Iterable, Optional
from zoneinfo import ZoneInfo

from app.bot.auth import BotContext
from app.bot.errors import BotError
from app.core.dates import parse_event_date  # noqa: F401  (re-exported)
from app.services.lead_source import LEAD_SOURCE_HE, LEAD_SOURCES
from app.services.supabase_service import supabase_service as db

TZ = ZoneInfo("Asia/Jerusalem")

STATUS_HE = {
    "New": "חדש", "Processing": "בטיפול בוט", "Manual": "בטיפול ידני", "Talking": "בשיחה",
    "Quote_Sent": 'נשלחה הצ"מ', "Waiting_Payment": "מחכה לתשלום", "Distributed": "הופץ",
    "Assigned": "שובץ", "Closed": "נסגר", "Lost": "אבוד", "Referred": "הופנה",
    "Completed": "הושלם", "Cold": "ליד קר",
}
SERVICE_HE = {"Bouzouki": "בוזוקי", "Band": "הרכב", "DJ": "DJ", "Reception": "קבלת פנים",
              "Talk": "הרצאה", "Other": "אחר"}
# "open" = still in the sales pipeline (not finished, not dropped)
NOT_OPEN = {"Closed", "Lost", "Completed", "Referred", "Cold"}
# an event is "covered" once the deal is closed / musician assigned / payment pending
EVENT_COVERED = {"Closed", "Assigned", "Waiting_Payment", "Completed"}
EVENT_HIDDEN = {"Lost", "Cold", "Referred"}
PAID = {"שולם", "תשלום"}


# ─── helpers ──────────────────────────────────────────────────────────────────────────
def today() -> date:
    return datetime.now(TZ).date()


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def page(items: list, limit: int, offset: int) -> dict:
    total = len(items)
    nxt = offset + limit
    return {"data": items[offset:nxt],
            "page": {"total": total, "limit": limit, "offset": offset,
                     "next_offset": nxt if nxt < total else None}}


def mask_phone(phone: Optional[str]) -> Optional[str]:
    if not phone:
        return None
    digits = re.sub(r"\D", "", str(phone))
    return "***" + digits[-4:] if len(digits) >= 4 else "***"




def parse_ts(value: Any) -> Optional[datetime]:
    if not value:
        return None
    if isinstance(value, datetime):
        dt = value
    else:
        try:
            dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        except ValueError:
            return None
    return dt if dt.tzinfo else dt.replace(tzinfo=TZ)


def parse_day(value: Any) -> Optional[date]:
    if not value:
        return None
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return parse_event_date(value)


def _num(v) -> float:
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


def split_csv(value: Optional[str]) -> list[str]:
    return [x.strip() for x in (value or "").split(",") if x.strip()]


# ─── shaping ──────────────────────────────────────────────────────────────────────────
def lead_out(rec: dict, ctx: BotContext, detail: bool = False,
             musician_names: Optional[dict] = None) -> dict:
    f = rec.get("fields") or {}
    ev = parse_event_date(f.get("Event_Date"))
    out = {
        "id": rec.get("id"),
        "name": f.get("Name"),
        "status": f.get("Status"),
        "status_he": STATUS_HE.get(f.get("Status")),
        "service": f.get("Service"),
        "service_he": SERVICE_HE.get(f.get("Service")),
        "owner": f.get("Owner"),
        "event_date": ev.isoformat() if ev else None,
        "event_date_text": f.get("Event_Date"),
        "location": f.get("Location"),
        "guests": f.get("Guests"),
        "created_at": rec.get("createdTime") or f.get("Created_At"),
        "last_interaction": f.get("Last_Interaction"),
        "summary": f.get("Last_Summary"),
        "lead_source": f.get("Lead_Source"),
        "lead_source_he": LEAD_SOURCE_HE.get(f.get("Lead_Source")),
    }
    if ctx.has("pii:read"):
        out["phone"] = f.get("Phone")
    else:
        out["phone_masked"] = mask_phone(f.get("Phone"))
    if ctx.has("finance:summary"):
        out["closing_amount"] = f.get("Closing_Amount")
    if detail:
        out.update({
            "conversation_state": f.get("Conversation_State"),
            "lost_reason": f.get("Lost_Reason"),
            "referred_to": f.get("Referred_To"),
            "bot_muted_until": f.get("Bot_Mute_Until"),
            "source": source_out(f, ctx),
        })
        team_ids = list(dict.fromkeys((f.get("Musician_Assigned") or []) + (f.get("Musician_Team") or [])))
        names = musician_names or {}
        out["musicians"] = [{"id": m, "name": names.get(m)} for m in team_ids]
        rsvps = f.get("Musician_RSVPs") or {}
        out["musician_rsvps"] = rsvps if isinstance(rsvps, dict) else {}
        if ctx.has("finance:read"):
            out.update({
                "commission_amount": f.get("Commission_Amount"),
                "commission_status": f.get("Commission_Status"),
                "commission_includes_vat": f.get("Commission_Includes_VAT"),
                "quote": f.get("Quote_Data"),
            })
    return out


_SOURCE_FIELDS = {
    "detail": "Source_Detail", "campaign_id": "Campaign_ID", "campaign_name": "Campaign_Name",
    "adset_id": "Adset_ID", "adset_name": "Adset_Name", "ad_id": "Ad_ID", "ad_name": "Ad_Name",
    "form_id": "Form_ID", "form_name": "Form_Name", "utm_source": "UTM_Source",
    "utm_medium": "UTM_Medium", "utm_campaign": "UTM_Campaign", "utm_content": "UTM_Content",
    "detected_at": "Source_Detected_At",
}
_REFERRAL_KEYS = ("source_type", "source_id", "source_url", "headline", "body", "media_type")


def source_out(f: dict, ctx: BotContext) -> dict:
    """Attribution block of the lead detail. The form's name/phone and the Meta click/lead ids
    (they identify the person on Meta) only with pii:read."""
    out: dict = {"value": f.get("Lead_Source"), "value_he": LEAD_SOURCE_HE.get(f.get("Lead_Source"))}
    out.update({k: f.get(col) for k, col in _SOURCE_FIELDS.items()})
    ref = f.get("Source_Referral")
    out["referral"] = {k: ref.get(k) for k in _REFERRAL_KEYS if ref.get(k) is not None} if isinstance(ref, dict) and ref else None
    form = f.get("Form_Answers")
    if isinstance(form, dict) and form:
        fo = {k: form.get(k) for k in ("language", "event_type", "answers", "phone_matches_whatsapp") if form.get(k) is not None}
        if ctx.has("pii:read"):
            fo.update({k: form.get(k) for k in ("full_name", "phone", "email", "note") if form.get(k)})
        elif form.get("phone"):
            fo["phone_masked"] = mask_phone(form.get("phone"))
        out["form"] = fo
    else:
        out["form"] = None
    if ctx.has("pii:read"):
        out["ctwa_clid"] = f.get("CTWA_CLID")
        out["meta_lead_id"] = f.get("Meta_Lead_ID")
    return out


def message_out(rec: dict, ctx: BotContext) -> dict:
    f = rec.get("fields") or {}
    out = {"id": rec.get("id"), "direction": f.get("Direction"), "timestamp": f.get("Timestamp"),
           "content": f.get("Content"), "media_type": f.get("Media_Type"), "status": f.get("Status")}
    if ctx.has("pii:read") and f.get("Media_URL"):
        out["media_url"] = f.get("Media_URL")
    return out


def note_out(rec: dict, ctx: BotContext, lead_names: Optional[dict] = None) -> dict:
    f = rec.get("fields") or {}
    out = {"id": rec.get("id"), "lead_id": f.get("Lead_ID"), "author": f.get("Author"),
           "content": f.get("Content"), "created_at": f.get("Created_At"),
           "follow_up_date": f.get("Follow_Up_Date"),
           "follow_up_completed": bool(f.get("Follow_Up_Completed")),
           "file_name": f.get("File_Name")}
    if lead_names is not None:
        out["lead_name"] = lead_names.get(f.get("Lead_ID"))
    if ctx.has("pii:read") and f.get("File_URL"):
        out["file_url"] = f.get("File_URL")
    return out


# ─── leads ────────────────────────────────────────────────────────────────────────────
def _all_leads() -> list[dict]:
    return db.get_all_leads()


def _get_lead(lead_id: str) -> dict:
    rec = db.leads_table.get(lead_id) if lead_id else None
    if not rec:
        raise BotError(404, "not_found", f"Lead '{lead_id}' not found.")
    return rec


def _validate_statuses(statuses: list[str]) -> None:
    bad = [s for s in statuses if s not in STATUS_HE]
    if bad:
        raise BotError(422, "invalid_request",
                       f"Unknown status {', '.join(bad)}. Valid: {', '.join(STATUS_HE)}.")


def list_leads(ctx: BotContext, *, status: Optional[str] = None, service: Optional[str] = None,
               owner: Optional[str] = None, q: Optional[str] = None, open_only: bool = False,
               event_from: Optional[date] = None, event_to: Optional[date] = None,
               created_from: Optional[date] = None, created_to: Optional[date] = None,
               updated_since: Optional[datetime] = None, sort: str = "last_interaction",
               limit: int = 50, offset: int = 0, source: Optional[str] = None) -> dict:
    statuses = split_csv(status)
    _validate_statuses(statuses)
    sources = set(split_csv(source))
    bad_src = [s for s in sources if s not in LEAD_SOURCES and s != "none"]
    if bad_src:
        raise BotError(422, "invalid_request",
                       f"Unknown source {', '.join(bad_src)}. Valid: {', '.join(LEAD_SOURCES)}, none.")
    services = {s.lower() for s in split_csv(service)}
    needle = (q or "").strip().lower()
    needle_digits = re.sub(r"\D", "", needle)
    since = updated_since.replace(tzinfo=updated_since.tzinfo or TZ) if updated_since else None

    out = []
    for rec in _all_leads():
        f = rec.get("fields") or {}
        st = f.get("Status")
        if statuses and st not in statuses:
            continue
        if open_only and st in NOT_OPEN:
            continue
        if services and str(f.get("Service") or "").lower() not in services:
            continue
        if owner and (f.get("Owner") or "") != owner:
            continue
        if sources and (f.get("Lead_Source") or "none") not in sources:
            continue
        if needle:
            hay = " ".join(str(f.get(k) or "") for k in ("Name", "Location", "Last_Summary", "Event_Date")).lower()
            phone_hit = len(needle_digits) >= 4 and needle_digits in re.sub(r"\D", "", str(f.get("Phone") or ""))
            if needle not in hay and not phone_hit:
                continue
        if event_from or event_to:
            ev = parse_event_date(f.get("Event_Date"))
            if not ev or (event_from and ev < event_from) or (event_to and ev > event_to):
                continue
        if created_from or created_to:
            cr = parse_ts(rec.get("createdTime") or f.get("Created_At"))
            crd = cr.astimezone(TZ).date() if cr else None
            if not crd or (created_from and crd < created_from) or (created_to and crd > created_to):
                continue
        if since:
            li = parse_ts(f.get("Last_Interaction"))
            if not li or li < since:
                continue
        out.append(rec)

    epoch = datetime.min.replace(tzinfo=timezone.utc)
    if sort == "event_date":
        out.sort(key=lambda r: parse_event_date((r.get("fields") or {}).get("Event_Date")) or date.max)
    elif sort == "created":
        out.sort(key=lambda r: parse_ts(r.get("createdTime")) or epoch, reverse=True)
    else:
        out.sort(key=lambda r: parse_ts((r.get("fields") or {}).get("Last_Interaction")) or epoch, reverse=True)
    return page([lead_out(r, ctx) for r in out], limit, offset)


def _musician_names() -> dict:
    return {m.get("id"): (m.get("fields") or {}).get("Name") for m in db.get_all_musicians()}


def get_lead(ctx: BotContext, lead_id: str) -> dict:
    rec = _get_lead(lead_id)
    names = _musician_names() if ctx.has("musicians:read") else None
    return {"data": lead_out(rec, ctx, detail=True, musician_names=names)}


def lead_messages(ctx: BotContext, lead_id: str, *, limit: int = 50, offset: int = 0,
                  order: str = "newest") -> dict:
    _get_lead(lead_id)
    msgs = db.get_messages_for_lead(lead_id)
    msgs.sort(key=lambda m: str((m.get("fields") or {}).get("Timestamp") or ""), reverse=(order != "oldest"))
    return page([message_out(m, ctx) for m in msgs], limit, offset)


def lead_notes(ctx: BotContext, lead_id: str, *, limit: int = 50, offset: int = 0) -> dict:
    _get_lead(lead_id)
    notes = db.get_notes_for_lead(lead_id)
    notes.sort(key=lambda n: str((n.get("fields") or {}).get("Created_At") or ""), reverse=True)
    return page([note_out(n, ctx) for n in notes], limit, offset)


def _lead_names() -> dict:
    return {r.get("id"): (r.get("fields") or {}).get("Name") for r in _all_leads()}


def pending_followups(ctx: BotContext, *, limit: int = 50, offset: int = 0) -> dict:
    notes = db.get_pending_followups()
    notes.sort(key=lambda n: str((n.get("fields") or {}).get("Follow_Up_Date") or ""))
    names = _lead_names() if ctx.has("leads:read") else None
    return page([note_out(n, ctx, names) for n in notes], limit, offset)


# ─── tasks ────────────────────────────────────────────────────────────────────────────
def list_tasks(ctx: BotContext, *, status: str = "open", assignee: Optional[str] = None,
               lead_id: Optional[str] = None, due_from: Optional[date] = None,
               due_to: Optional[date] = None, overdue: bool = False,
               limit: int = 50, offset: int = 0) -> dict:
    t0 = today()
    names = _lead_names() if ctx.has("leads:read") else None
    out = []
    for rec in db.get_tasks():
        f = rec.get("fields") or {}
        done = bool(f.get("Is_Completed"))
        if (status == "open" and done) or (status == "done" and not done):
            continue
        if assignee and (f.get("Assignee") or "") != assignee:
            continue
        if lead_id and f.get("Lead_ID") != lead_id:
            continue
        due = parse_day(f.get("Due_Date"))
        is_overdue = bool(due and due < t0 and not done)
        if overdue and not is_overdue:
            continue
        if (due_from or due_to) and (not due or (due_from and due < due_from) or (due_to and due > due_to)):
            continue
        item = {"id": rec.get("id"), "title": f.get("Title"), "assignee": f.get("Assignee"),
                "due_date": due.isoformat() if due else None, "is_completed": done,
                "overdue": is_overdue, "lead_id": f.get("Lead_ID"), "created_at": f.get("Created_At")}
        if names is not None:
            item["lead_name"] = names.get(f.get("Lead_ID"))
        out.append(item)
    out.sort(key=lambda t: (t["due_date"] or "9999-12-31", t["title"] or ""))
    return page(out, limit, offset)


# ─── events ───────────────────────────────────────────────────────────────────────────
def upcoming_events(ctx: BotContext, *, days: int = 60, include_all: bool = False,
                    limit: int = 50, offset: int = 0) -> dict:
    t0 = today()
    end = t0 + timedelta(days=days)
    rows = []
    for rec in _all_leads():
        f = rec.get("fields") or {}
        if not include_all and f.get("Status") in EVENT_HIDDEN:
            continue
        ev = parse_event_date(f.get("Event_Date"))
        if ev and t0 <= ev <= end:
            item = lead_out(rec, ctx)
            item["days_until"] = (ev - t0).days
            item["covered"] = f.get("Status") in EVENT_COVERED
            rows.append(item)
    rows.sort(key=lambda r: (r["event_date"], r["name"] or ""))
    return page(rows, limit, offset)


# ─── stats & attention ────────────────────────────────────────────────────────────────
def stats(ctx: BotContext) -> dict:
    leads = _all_leads()
    t0 = today()
    by_status: dict = {}
    by_service: dict = {}
    by_source: dict = {}
    by_owner: dict = {}
    new7 = new30 = open_count = events30 = 0
    revenue_by_month: dict = {}
    for rec in leads:
        f = rec.get("fields") or {}
        st = f.get("Status") or "?"
        by_status[st] = by_status.get(st, 0) + 1
        svc = f.get("Service") or "none"
        by_service[svc] = by_service.get(svc, 0) + 1
        src = f.get("Lead_Source") or "none"
        by_source[src] = by_source.get(src, 0) + 1
        if st not in NOT_OPEN:
            open_count += 1
            ow = f.get("Owner") or "none"
            by_owner[ow] = by_owner.get(ow, 0) + 1
        cr = parse_ts(rec.get("createdTime"))
        if cr:
            age = (t0 - cr.astimezone(TZ).date()).days
            new7 += age < 7
            new30 += age < 30
        ev = parse_event_date(f.get("Event_Date"))
        if ev and 0 <= (ev - t0).days <= 30 and st not in EVENT_HIDDEN:
            events30 += 1
        if ctx.has("finance:summary") and st == "Closed" and ev:
            k = ev.strftime("%Y-%m")
            revenue_by_month[k] = revenue_by_month.get(k, 0) + _num(f.get("Closing_Amount"))
    data = {
        "total_leads": len(leads),
        "open_leads": open_count,
        "new_leads_last_7_days": new7,
        "new_leads_last_30_days": new30,
        "events_next_30_days": events30,
        "by_status": [{"status": s, "status_he": STATUS_HE.get(s), "count": c}
                      for s, c in sorted(by_status.items(), key=lambda x: -x[1])],
        "by_service": dict(sorted(by_service.items(), key=lambda x: -x[1])),
        "by_source": [{"source": s, "source_he": LEAD_SOURCE_HE.get(s), "count": c}
                      for s, c in sorted(by_source.items(), key=lambda x: -x[1])],
        "open_by_owner": by_owner,
    }
    if ctx.has("finance:summary"):
        data["closed_deal_amount_by_event_month"] = dict(sorted(revenue_by_month.items()))
    return {"data": data}


def attention(ctx: BotContext, *, no_reply_hours: int = 12, stale_days: int = 7,
              event_days: int = 14) -> dict:
    now = now_utc()
    t0 = today()
    leads = _all_leads()
    open_leads = {r.get("id"): r for r in leads if (r.get("fields") or {}).get("Status") not in NOT_OPEN}

    # last message per lead (only direction + time are read, not content)
    since = (now - timedelta(days=30)).isoformat()
    last_msg: dict = {}
    for m in db.get_message_meta_since(since):
        ts = parse_ts(m.get("Timestamp"))
        if not ts:
            continue
        for lid in m.get("Lead") or []:
            if lid in open_leads and (lid not in last_msg or ts > last_msg[lid][0]):
                last_msg[lid] = (ts, m.get("Direction"))

    def brief(rec):
        f = rec.get("fields") or {}
        return {"lead_id": rec.get("id"), "name": f.get("Name"), "status": f.get("Status"),
                "status_he": STATUS_HE.get(f.get("Status")), "owner": f.get("Owner")}

    needs_reply = []
    for lid, (ts, direction) in last_msg.items():
        hours = (now - ts).total_seconds() / 3600
        if direction == "Inbound" and hours >= no_reply_hours:
            needs_reply.append({**brief(open_leads[lid]), "last_inbound_at": ts.isoformat(),
                                "hours_waiting": round(hours, 1)})
    needs_reply.sort(key=lambda x: -x["hours_waiting"])

    stale = []
    for rec in open_leads.values():
        li = parse_ts((rec.get("fields") or {}).get("Last_Interaction"))
        if li and (now - li).days >= stale_days:
            stale.append({**brief(rec), "last_interaction": li.isoformat(), "days_idle": (now - li).days})
    stale.sort(key=lambda x: -x["days_idle"])

    events_not_covered = []
    for rec in leads:
        f = rec.get("fields") or {}
        ev = parse_event_date(f.get("Event_Date"))
        if ev and 0 <= (ev - t0).days <= event_days and f.get("Status") not in EVENT_COVERED | EVENT_HIDDEN:
            events_not_covered.append({**brief(rec), "event_date": ev.isoformat(), "days_until": (ev - t0).days})
    events_not_covered.sort(key=lambda x: x["days_until"])

    data = {"criteria": {"no_reply_hours": no_reply_hours, "stale_days": stale_days, "event_days": event_days},
            "needs_reply": needs_reply, "stale_leads": stale, "events_soon_not_closed": events_not_covered}
    if ctx.has("notes:read"):
        names = {k: (v.get("fields") or {}).get("Name") for k, v in open_leads.items()}
        names.update({r.get("id"): (r.get("fields") or {}).get("Name") for r in leads})
        data["overdue_followups"] = [note_out(n, ctx, names) for n in db.get_pending_followups()]
    if ctx.has("tasks:read"):
        data["overdue_tasks"] = list_tasks(ctx, status="open", overdue=True, limit=200)["data"]
    return {"data": data}


# ─── musicians ────────────────────────────────────────────────────────────────────────
def list_musicians(ctx: BotContext, *, active_only: bool = True, type: Optional[str] = None,
                   limit: int = 100, offset: int = 0) -> dict:
    out = []
    for rec in db.get_all_musicians():
        f = rec.get("fields") or {}
        if active_only and f.get("Is_Active") is False:
            continue
        if type and (f.get("Type") or "") != type:
            continue
        item = {"id": rec.get("id"), "name": f.get("Name"), "type": f.get("Type"),
                "is_active": f.get("Is_Active") is not False, "score": f.get("Score")}
        if ctx.has("pii:read"):
            item["phone"], item["email"] = f.get("Phone"), f.get("Email")
        out.append(item)
    out.sort(key=lambda m: (m["name"] or ""))
    return page(out, limit, offset)


# ─── finance ──────────────────────────────────────────────────────────────────────────
def _finance_rows(owner: Optional[str], date_from: Optional[date], date_to: Optional[date],
                  entry_type: Optional[str] = None) -> list[dict]:
    rows = []
    for rec in db.get_finance_entries(owner):
        f = rec.get("fields") or {}
        d = parse_day(f.get("Date"))
        if (date_from and (not d or d < date_from)) or (date_to and (not d or d > date_to)):
            continue
        if entry_type and f.get("Type") != entry_type:
            continue
        rows.append((rec, f, d))
    return rows


def finance_summary(ctx: BotContext, *, owner: Optional[str] = None, date_from: Optional[date] = None,
                    date_to: Optional[date] = None) -> dict:
    per_owner: dict = {}
    per_month: dict = {}
    for _rec, f, d in _finance_rows(owner, date_from, date_to):
        amt = _num(f.get("Amount"))
        income = f.get("Type") == "income"
        o = per_owner.setdefault(f.get("Owner") or "none", {
            "income": 0.0, "expenses": 0.0, "balance": 0.0, "cash_balance": 0.0, "bank_balance": 0.0,
            "unpaid_income_count": 0, "unpaid_income_amount": 0.0})
        o["income" if income else "expenses"] += amt
        o["balance"] = o["income"] - o["expenses"]
        signed = amt if income else -amt
        o["cash_balance" if f.get("Payment_Method") == "מזומן" else "bank_balance"] += signed
        if income and f.get("Payment_Status") not in PAID:
            o["unpaid_income_count"] += 1
            o["unpaid_income_amount"] += amt
        if d:
            mth = per_month.setdefault(d.strftime("%Y-%m"), {"income": 0.0, "expenses": 0.0, "net": 0.0})
            mth["income" if income else "expenses"] += amt
            mth["net"] = mth["income"] - mth["expenses"]
    totals = {k: sum(o[k] for o in per_owner.values())
              for k in ("income", "expenses", "balance", "unpaid_income_amount")}
    return {"data": {"currency": "ILS",
                     "filters": {"owner": owner, "date_from": date_from and date_from.isoformat(),
                                 "date_to": date_to and date_to.isoformat()},
                     "totals": totals, "by_owner": per_owner,
                     "by_month": dict(sorted(per_month.items()))}}


def finance_entries(ctx: BotContext, *, owner: Optional[str] = None, entry_type: Optional[str] = None,
                    date_from: Optional[date] = None, date_to: Optional[date] = None,
                    limit: int = 50, offset: int = 0) -> dict:
    out = []
    for rec, f, d in _finance_rows(owner, date_from, date_to, entry_type):
        out.append({"id": rec.get("id"), "date": d.isoformat() if d else f.get("Date"),
                    "owner": f.get("Owner"), "type": f.get("Type"), "amount": _num(f.get("Amount")),
                    "description": f.get("Description"), "event_name": f.get("Event_Name"),
                    "musician": f.get("Musician"), "payment_status": f.get("Payment_Status"),
                    "payment_method": f.get("Payment_Method"), "lead_id": f.get("Lead_ID")})
    out.sort(key=lambda e: e["date"] or "", reverse=True)
    return page(out, limit, offset)
