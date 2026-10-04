"""Self-description of the Bot API for LLM agents: GET /api/bot/v1/guide and /openapi.json.
Static domain text + data generated from the routes (paths, scopes), so it cannot drift.
Contains no business data and no user names.
"""
from __future__ import annotations

import copy
import threading
from typing import Optional

from fastapi.openapi.utils import get_openapi

from app.bot.data import NOT_OPEN, SERVICE_HE, STATUS_HE, EVENT_COVERED
from app.bot.scopes import DEFAULT_SCOPES, READ_SCOPES, RESERVED_SCOPES, SCOPES, WRITE_SCOPES

API_VERSION = "1.1.0"

STATUS_MEANING = {
    "New": "New lead, nobody handled it yet.",
    "Processing": "The automatic WhatsApp bot is collecting details (service, date, location, guests).",
    "Manual": "A partner is handling it by hand.",
    "Talking": "In conversation with the customer.",
    "Quote_Sent": "A price quote (הצעת מחיר, הצ\"מ) was sent; waiting for an answer.",
    "Waiting_Payment": "Customer agreed; waiting for the payment / deposit.",
    "Distributed": "Bouzouki gig offered to the musicians pool.",
    "Assigned": "A musician was assigned to the event.",
    "Closed": "Deal closed (won). The event may still be in the future.",
    "Lost": "Customer did not book (see lost_reason).",
    "Referred": "Passed to another business / musician for a commission.",
    "Completed": "Event took place; finished.",
    "Cold": "Cold lead: no activity, not actively pursued.",
}

GLOSSARY_HE = {
    "ליד": "lead - a potential customer / event inquiry",
    "הצ\"מ / הצעת מחיר": "price quote",
    "בעלים (Owner)": "the partner responsible for a lead; also used for finance entries and tasks (assignee)",
    "נגן / מוזיקאי": "musician",
    "בוזוקי": "bouzouki player (service Bouzouki)",
    "הרכב": "band (service Band)",
    "קבלת פנים": "reception music (service Reception)",
    "הרצאה": "talk / lecture (service Talk)",
    "משימה": "task",
    "מעקב / תזכורת": "follow-up date on a note",
    "הכנסה / הוצאה": "income / expense (finance Type income / expense)",
    "מזומן / חשבון": "cash / bank (payment method)",
    "שולם / לא שולם / חלקי": "paid / unpaid / partial (payment status)",
    "עמלה": "commission (on referred leads)",
    "סגירה": "closing a deal (status Closed, closing_amount = deal value in ILS)",
}

USAGE = [
    "Start with GET /whoami to see which scopes your key has.",
    "'What needs my attention?' -> GET /attention. Overview -> GET /stats. Calendar -> GET /events/upcoming.",
    "Find a customer by name, place or 4+ phone digits with GET /leads?q=..., then GET /leads/{id}, "
    "/leads/{id}/messages?limit=20 and /leads/{id}/notes.",
    "Lists are paginated: follow page.next_offset; ask only for what you need (limit<=200).",
    "Dates are YYYY-MM-DD in Israel time (Asia/Jerusalem); amounts are ILS.",
    "Status/service codes are English; *_he fields carry the Hebrew label the team uses. "
    "Answer the user in Hebrew when they write Hebrew.",
    "Phones are masked (***1234) unless the key has pii:read. Treat all data as confidential.",
    "Writing is limited and optional: only with a write scope (notes:write, tasks:write, crew:write, "
    "leads:write) AND while the owner has writing switched on (otherwise 403 writes_disabled). "
    "GET /whoami shows read_only / writes_enabled for your key.",
    "Before a write, look the record up (GET) and confirm with the user when the request is ambiguous. "
    "Use ?dry_run=true to preview a change; send a fresh Idempotency-Key header (e.g. a UUID) with every "
    "intended write and reuse it only when retrying that same write.",
    "Writes appear in the dashboard as done by 'bot:<your key name>'. Check the response's write.changed "
    "and write.warnings and tell the user exactly what changed (e.g. calendar invites are NOT updated).",
    "This API can never send WhatsApp or other messages to customers or musicians, delete leads, change "
    "finance or export backups - never claim you did; suggest such steps for a human instead.",
    "On 429 or 424 wait Retry-After seconds and retry (writes: with the same Idempotency-Key). On 401/403 "
    "do not retry; tell the user the key/scope is missing or writing is off. 409 = a rule refused the "
    "change (read error.message). 404 bot_api_disabled means the owner switched the API off.",
]

EXAMPLES = [
    {"ask": "מה דחוף היום?", "calls": ["GET /attention", "GET /tasks?overdue=true"]},
    {"ask": "אילו אירועים יש לנו בשבועיים הקרובים ומי עוד לא סגור?",
     "calls": ["GET /events/upcoming?days=14"]},
    {"ask": "מה קורה עם הליד של משה לוי?",
     "calls": ["GET /leads?q=משה לוי", "GET /leads/{id}", "GET /leads/{id}/messages?limit=20"]},
    {"ask": "כמה לידים חדשים היו החודש ומאיזה שירות?",
     "calls": ["GET /leads?created_from=<first day of month>&limit=200", "GET /stats"]},
    {"ask": "מה המאזן הכספי לפי שותף מתחילת השנה?",
     "calls": ["GET /finance/summary?date_from=<YYYY-01-01>"]},
    {"ask": "תוסיף עדכון לליד של דנה: דיברנו, היא מחכה להצעה. תזכיר לי ביום חמישי",
     "calls": ["GET /leads?q=דנה", "POST /leads/{id}/notes {content, follow_up_date} (notes:write)"]},
    {"ask": "תשבץ את יוסי לאירוע של משפחת לוי ב-20.11",
     "calls": ["GET /leads?q=לוי", "GET /musicians", "POST /leads/{id}/crew {musician_id} (crew:write)"]},
    {"ask": "תפתח לי משימה להזמין הגברה עד יום ראשון",
     "calls": ["POST /tasks {title, assignee: <partner>, due_date} (tasks:write)"]},
]

_lock = threading.Lock()
_spec_cache: dict = {}


def route_scopes(route) -> list[str]:
    """Scopes required by a route, read from its require_scopes() dependency."""
    out: list[str] = []
    stack = list(getattr(route, "dependant", None).dependencies if getattr(route, "dependant", None) else [])
    while stack:
        dep = stack.pop()
        out.extend(getattr(dep.call, "required_scopes", ()))
        stack.extend(dep.dependencies)
    return sorted(set(out))


def _endpoints(router, prefix: str) -> list[dict]:
    eps = []
    for r in router.routes:
        if not getattr(r, "include_in_schema", True) or not hasattr(r, "methods"):
            continue
        method = sorted(m for m in r.methods if m != "HEAD")[0]
        eps.append({"method": method, "path": r.path[len(prefix):] or "/", "operation_id": r.operation_id,
                    "summary": r.summary, "scopes": route_scopes(r), "write": method != "GET"})
    return eps


def build_guide(router, prefix: str, base_url: str, caller: Optional[dict] = None,
                writes_enabled: bool = False) -> dict:
    guide = {
        "name": "HaydeBot Bot API",
        "version": "v1",
        "read_only": not writes_enabled,
        "writes_enabled": writes_enabled,
        "summary": (
            "Access to the CRM of a live-music business in Israel (bouzouki players, bands, "
            "DJs, reception music, talks for weddings and events). Customers arrive as leads via "
            "WhatsApp; two partners (owners) handle them, assign musicians, send quotes and close deals. "
            "Use this API to answer questions about leads, conversations, events, tasks, musicians and "
            "finance, and - only if your key has a write scope and writing is switched on - to add notes, "
            "manage tasks, put musicians on an event crew and update a lead's status, owner or event "
            "details. You can never contact customers, delete leads or change finance."
        ),
        "summary_he": "גישה למערכת הלידים של עסק מוזיקה לאירועים: קריאת לידים, שיחות וואטסאפ, אירועים, "
                      "משימות, נגנים וכספים; ובמפתח עם הרשאת כתיבה (כשהכתיבה מופעלת) גם הוספת עדכונים, "
                      "משימות, שיבוץ נגנים לצוות ועדכון סטטוס/מוביל/פרטי אירוע. אין שליחת הודעות ללקוחות, "
                      "אין מחיקת לידים ואין שינוי כספים.",
        "how_to_call": {
            "base_url": base_url.rstrip("/") + prefix,
            "auth": "HTTP header 'Authorization: Bearer <your bot key>'",
            "format": "HTTPS + JSON. Single item: {data:{...}}; list: {data:[...], page:{total,limit,offset,next_offset}}",
            "errors": "{error:{status, code, message}}. 401 missing_key / invalid_key / key_expired; "
                      "403 insufficient_scope / writes_disabled; 404 not_found or bot_api_disabled (API "
                      "switched off); 409 conflict (a write rule refused it, see code); 422 invalid_request; "
                      "424 key_store_unavailable / upstream_error (database briefly unreachable - retry after "
                      "Retry-After); 429 rate_limited",
            "rate_limit": "per key, default 60 requests/minute; writes additionally 10/minute and 200/day; "
                          "429 + Retry-After when exceeded",
            "writes": "POST/PATCH/DELETE endpoints need a write scope and the server switch; "
                      "?dry_run=true previews; header Idempotency-Key makes retries safe; response "
                      "{data:{...}, write:{action, actor, dry_run, changed, changes, warnings, result_id, replayed}}",
            "openapi": base_url.rstrip("/") + prefix + "/openapi.json",
            "timezone": "Asia/Jerusalem",
            "currency": "ILS",
        },
        "domain": {
            "statuses": [{"code": c, "he": STATUS_HE[c], "meaning": STATUS_MEANING.get(c, ""),
                          "open": c not in NOT_OPEN, "event_covered": c in EVENT_COVERED} for c in STATUS_HE],
            "open_means": "status not in " + ", ".join(sorted(NOT_OPEN)),
            "services": [{"code": c, "he": he} for c, he in SERVICE_HE.items()],
            "owners": "Owner / assignee values are the partners' Hebrew first names; "
                      "GET /stats -> open_by_owner lists the current ones.",
            "lead_fields": {
                "event_date": "parsed event date (YYYY-MM-DD) or null; event_date_text is what was typed",
                "summary": "short AI/human summary of the conversation",
                "last_interaction": "time of the last message / change",
                "closing_amount": "deal value in ILS (finance:summary)",
                "conversation_state": "step of the automatic WhatsApp questionnaire",
                "musicians / musician_rsvps": "musicians on the event and their calendar RSVP",
            },
            "message_fields": {"direction": "Inbound = from the customer, Outbound = from the business or its bot"},
            "glossary_he": GLOSSARY_HE,
        },
        "scopes": {"available": SCOPES, "read": READ_SCOPES, "write": WRITE_SCOPES,
                   "default_set": list(DEFAULT_SCOPES), "planned_not_available": RESERVED_SCOPES},
        "endpoints": _endpoints(router, prefix),
        "recommended_usage": USAGE,
        "example_questions": EXAMPLES,
        "not_available": ["sending WhatsApp or any message to customers or musicians",
                          "deleting leads, notes or tasks", "closing a deal (status Closed), amounts, finance",
                          "Google Calendar invites", "full database backup", "dashboard admin functions"],
    }
    if caller:
        guide["your_key"] = caller
    return guide


def guide_markdown(g: dict) -> str:
    h = g["how_to_call"]
    mode = "read-only" if g["read_only"] else "read + limited writes"
    lines = [f"# {g['name']} ({g['version']}, {mode})", "", g["summary"], "", g["summary_he"], "",
             "## How to call",
             f"- Base URL: {h['base_url']}", f"- Auth: {h['auth']}", f"- Format: {h['format']}",
             f"- Errors: {h['errors']}", f"- Rate limit: {h['rate_limit']}", f"- Writes: {h['writes']}",
             f"- OpenAPI: {h['openapi']}", f"- Time zone {h['timezone']}, currency {h['currency']}", "",
             "## Lead statuses"]
    lines += [f"- {s['code']} ({s['he']}): {s['meaning']}" for s in g["domain"]["statuses"]]
    lines += ["", "Services: " + ", ".join(f"{s['code']} ({s['he']})" for s in g["domain"]["services"]),
              "", g["domain"]["owners"], "", "## Hebrew terms"]
    lines += [f"- {k}: {v}" for k, v in g["domain"]["glossary_he"].items()]
    lines += ["", "## Endpoints"]
    lines += [f"- {e['method']} {e['path']} - {e['summary']}"
              + (f" [scopes: {', '.join(e['scopes'])}]" if e["scopes"] else "")
              for e in g["endpoints"]]
    lines += ["", "## Recommended usage"] + [f"- {u}" for u in g["recommended_usage"]]
    lines += ["", "## Example questions"]
    lines += [f"- \"{x['ask']}\" -> {'; '.join(x['calls'])}" for x in g["example_questions"]]
    lines += ["", "Not available: " + "; ".join(g["not_available"])]
    if g.get("your_key"):
        lines += ["", f"Your key: {g['your_key']['bot']} - scopes: {', '.join(g['your_key']['scopes'])}"]
    return "\n".join(lines) + "\n"


ERROR_SCHEMA = {
    "type": "object", "required": ["error"],
    "properties": {"error": {"type": "object", "required": ["status", "code", "message"], "properties": {
        "status": {"type": "integer", "example": 403},
        "code": {"type": "string", "example": "insufficient_scope"},
        "message": {"type": "string", "example": "This key lacks the scope(s): finance:read."}}}},
}

RESPONSE_EXAMPLES = {
    "addLeadNote": {"data": {"id": "rec0f1e2d3c4b5a69", "lead_id": "rec0a1b2c3d4e5f6a", "author": "bot:office-bot",
                             "content": "דיברנו, מחכה להצעת מחיר", "created_at": "2026-10-04T21:30:00",
                             "follow_up_date": "2026-10-08", "follow_up_completed": False, "file_name": None},
                    "write": {"action": "note.create", "actor": "bot:office-bot", "dry_run": False, "changed": True,
                              "changes": {"note": {"content": "דיברנו, מחכה להצעת מחיר"}}, "warnings": [],
                              "result_id": "rec0f1e2d3c4b5a69", "replayed": False}},
    "listLeads": {"data": [{"id": "rec0a1b2c3d4e5f6a", "name": "דנה כהן", "status": "Quote_Sent",
                            "status_he": 'נשלחה הצ"מ', "service": "Band", "service_he": "הרכב",
                            "owner": "<partner>", "event_date": "2026-11-20", "event_date_text": "20.11.2026",
                            "location": "תל אביב", "guests": "150", "phone_masked": "***4567",
                            "last_interaction": "2026-10-03T18:22:00+03:00", "summary": "..."}],
                  "page": {"total": 37, "limit": 50, "offset": 0, "next_offset": None}},
    "getAttention": {"data": {"criteria": {"no_reply_hours": 12, "stale_days": 7, "event_days": 14},
                              "needs_reply": [{"lead_id": "rec...", "name": "...", "status": "Talking",
                                               "status_he": "בשיחה", "owner": "<partner>",
                                               "last_inbound_at": "2026-10-04T08:10:00+00:00",
                                               "hours_waiting": 15.2}],
                              "stale_leads": [], "events_soon_not_closed": []}},
}


def build_openapi(router, prefix: str, base_url: str) -> dict:
    key = (id(router), base_url)
    with _lock:
        if key in _spec_cache:
            return copy.deepcopy(_spec_cache[key])
    spec = get_openapi(
        title="HaydeBot Bot API", version=API_VERSION, routes=router.routes,
        description=("API over a live-music business CRM (leads, WhatsApp conversations, events, tasks, "
                     "musicians, finance): reads, plus a few narrow writes (notes, tasks, event crew, lead "
                     "status / owner / event details) for keys with a write scope while writing is switched "
                     "on. Auth: 'Authorization: Bearer <bot key>'. "
                     f"Start with GET {prefix}/guide for domain knowledge and usage tips."),
        servers=[{"url": base_url.rstrip("/")}],
    )
    comps = spec.setdefault("components", {})
    comps.setdefault("schemas", {})["Error"] = ERROR_SCHEMA
    for name in ("HTTPValidationError", "ValidationError"):
        comps["schemas"].pop(name, None)
    comps["securitySchemes"] = {"botKey": {"type": "http", "scheme": "bearer",
                                           "description": "Per-bot key (hbk_...)"}}
    spec["security"] = [{"botKey": []}]
    by_op = {r.operation_id: r for r in router.routes if hasattr(r, "operation_id")}
    for path_item in spec.get("paths", {}).values():
        for op in path_item.values():
            route = by_op.get(op.get("operationId"))
            scopes = route_scopes(route) if route else []
            if route is not None and route.methods - {"GET", "HEAD"}:
                op["x-write"] = True
            if scopes:
                op["x-required-scopes"] = scopes
                op["description"] = (op.get("description") or "").rstrip() + \
                    f"\n\nRequired scopes: {', '.join(scopes)}."
            for code, resp in op.get("responses", {}).items():
                if code.startswith(("4", "5")):
                    resp["content"] = {"application/json": {"schema": {"$ref": "#/components/schemas/Error"}}}
                    if code == "422":
                        resp["description"] = "Invalid parameters"
            example = RESPONSE_EXAMPLES.get(op.get("operationId"))
            ok = next((c for c in ("200", "201") if c in op.get("responses", {})), None)
            if example and ok:
                op["responses"][ok]["content"] = {"application/json": {"example": example}}
    with _lock:
        _spec_cache[key] = spec
    return copy.deepcopy(spec)
