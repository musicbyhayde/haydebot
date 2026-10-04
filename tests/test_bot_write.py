"""Bot API write endpoints: switches, scopes, idempotency, dry run, validation, actor attribution and
what the dashboard sees afterwards (same in-memory service behind both APIs)."""
import re
from datetime import timedelta
from pathlib import Path
from unittest.mock import patch

import pytest

from app.bot import data, idempotency
from app.services import activity_text
from tests.bot_helpers import bot_env, hdr  # noqa: F401

B = "/api/bot/v1"
T0 = data.today()
ALL_WRITE = ["notes:write", "tasks:write", "crew:write", "leads:write"]
DEFAULT = ["leads:read", "messages:read", "notes:read", "tasks:read", "musicians:read", "finance:summary"]


def iso(days):
    return (T0 + timedelta(days=days)).isoformat()


def dmy(days):
    return f"{T0 + timedelta(days=days):%d.%m.%Y}"


@pytest.fixture
def w(bot_env, mock_service, test_client, monkeypatch):
    """test_client = dashboard API on mock_service (X-API-Key); the bot API uses the same service."""
    monkeypatch.setattr(data, "db", mock_service)
    monkeypatch.setattr(bot_env.settings, "BOT_API_WRITE_ENABLED", True)
    st = mock_service._stores
    st["leads"] += [
        {"id": "L1", "Name": "דנה כהן", "Phone": "972501234567", "Status": "Talking", "Owner": "אילן",
         "Event_Date": dmy(20), "Location": "תל אביב", "Guests": "100", "Musician_Team": [], "Service": "Band"},
        {"id": "L2", "Name": "Other Event", "Phone": "972500000002", "Status": "Closed", "Owner": "קובי",
         "Event_Date": dmy(20), "Musician_Team": ["m1"], "Google_Event_ID": "gcal1", "Service": "Band"},
        {"id": "L3", "Name": "Bouz", "Phone": "972500000003", "Status": "New", "Service": "Bouzouki",
         "Event_Date": dmy(30), "Location": "חיפה", "Guests": "80", "Musician_Team": ["m2"]},
    ]
    st["musicians"] += [
        {"id": "m1", "Name": "Yossi", "Phone": "972501111111", "Is_Active": True, "Type": "POOL"},
        {"id": "m2", "Name": "Avi", "Phone": "972502222222", "Is_Active": True, "Type": "REFERRER"},
        {"id": "m3", "Name": "Old", "Phone": "972503333333", "Is_Active": False, "Type": "POOL"},
    ]
    st["notes"].append({"id": "n1", "Lead_ID": "L1", "Author": "קובי", "Content": "להתקשר אחרי החג",
                        "Follow_Up_Date": iso(1), "Follow_Up_Completed": False})
    st["notes"].append({"id": "n2", "Lead_ID": "L1", "Author": "קובי", "Content": "בלי תזכורת"})
    st["tasks"].append({"id": "t1", "Title": "להזמין הגברה", "Assignee": "קובי", "Due_Date": dmy(3),
                        "Is_Completed": False, "Lead_ID": "L1"})
    keys = {
        "writer": bot_env.table.add("office-bot", DEFAULT + ALL_WRITE),
        "reader": bot_env.table.add("reader", DEFAULT),
        "notes": bot_env.table.add("notes-only", ["notes:write"]),
    }

    def call(method, path, key="writer", json=None, idem=None, **params):
        h = hdr(keys[key])
        if idem:
            h["Idempotency-Key"] = idem
        return test_client.request(method, B + path, headers=h, json=json, params=params)
    call.svc, call.st, call.env, call.dash, call.keys = mock_service, st, bot_env, test_client, keys
    return call


def acts(w, **match):
    return [a for a in w.st.get("activities", []) if all(a.get(k) == v for k, v in match.items())]


def err(r):
    return r.json()["error"]["code"]


ALL_WRITES = [
    ("POST", "/leads/L1/notes", {"content": "x"}),
    ("PATCH", "/notes/n1/follow-up", {"completed": True}),
    ("POST", "/tasks", {"title": "x"}),
    ("PATCH", "/tasks/t1", {"completed": True}),
    ("POST", "/leads/L1/crew", {"musician_id": "m2"}),
    ("DELETE", "/leads/L3/crew/m2", None),
    ("PATCH", "/leads/L1/status", {"status": "Quote_Sent"}),
    ("PATCH", "/leads/L1/owner", {"owner": "קובי", "handover_note": "הוא מכיר את הלקוחה"}),
    ("PATCH", "/leads/L1/event", {"location": "רמת גן"}),
]


# --- switches and scopes ------------------------------------------------------------------
@pytest.mark.parametrize("method,path,body", ALL_WRITES)
def test_write_switch_off_blocks_every_write_but_allows_dry_run(w, method, path, body):
    w.env.settings.BOT_API_WRITE_ENABLED = False
    before = repr(w.st)
    r = w(method, path, json=body)
    assert r.status_code == 403 and err(r) == "writes_disabled"
    r = w(method, path, json=body, dry_run="true")
    assert r.status_code == 200 and r.json()["write"]["dry_run"] is True
    assert repr(w.st) == before          # nothing written either way


@pytest.mark.parametrize("method,path,body", ALL_WRITES)
def test_kill_switch_off_is_404(w, method, path, body):
    w.env.settings.BOT_API_ENABLED = False
    r = w(method, path, json=body)
    assert r.status_code == 404 and err(r) == "bot_api_disabled"


@pytest.mark.parametrize("method,path,body", ALL_WRITES)
def test_read_scopes_cannot_write(w, method, path, body):
    r = w(method, path, key="reader", json=body)
    assert r.status_code == 403 and err(r) == "insufficient_scope" and ":write" in r.json()["error"]["message"]


def test_each_write_scope_only_opens_its_endpoints(w):
    assert w("POST", "/leads/L1/notes", key="notes", json={"content": "ok"}).status_code == 201
    assert err(w("POST", "/tasks", key="notes", json={"title": "x"})) == "insufficient_scope"
    assert err(w("PATCH", "/leads/L1/status", key="notes", json={"status": "Cold"})) == "insufficient_scope"


def test_whoami_shows_write_state(w):
    d = w("GET", "/whoami").json()["data"]
    assert d["read_only"] is False and d["writes_enabled"] is True and "crew:write" in d["scopes"]
    assert w("GET", "/whoami", key="reader").json()["data"]["read_only"] is True
    w.env.settings.BOT_API_WRITE_ENABLED = False
    assert w("GET", "/whoami").json()["data"]["writes_enabled"] is False


# --- notes --------------------------------------------------------------------------------
def test_add_note_is_attributed_to_the_bot_and_visible_in_dashboard(w):
    r = w("POST", "/leads/L1/notes", json={"content": "  דיברנו, מחכה להצעה  ", "follow_up_date": iso(2)})
    assert r.status_code == 201, r.text
    body = r.json()
    note = body["data"]
    assert note["author"] == "bot:office-bot" and note["content"] == "דיברנו, מחכה להצעה"
    assert body["write"]["actor"] == "bot:office-bot" and body["write"]["changed"] is True
    stored = next(n for n in w.st["notes"] if n["id"] == note["id"])
    assert stored["Lead_ID"] == "L1" and stored["Author"] == "bot:office-bot"
    assert stored["Follow_Up_Date"] == iso(2) and stored["Follow_Up_Completed"] is False
    # dashboard API shows it like any note
    dash = w.dash.get("/api/v1/leads/L1/notes").json()
    assert any(n["id"] == note["id"] and n["fields"]["Author"] == "bot:office-bot" for n in dash)
    # same activity entry the dashboard writes for a note, with the bot as actor
    (a,) = acts(w, actor="bot:office-bot")
    assert (a["action_type"], a["description"]) == activity_text.note_added("דיברנו, מחכה להצעה")
    assert a["lead_id"] == "L1"
    w.dash.post("/api/v1/leads/L1/notes", json={"content": "דיברנו, מחכה להצעה", "author": "אילן"})
    (human,) = acts(w, actor="אילן")
    assert (human["action_type"], human["description"]) == (a["action_type"], a["description"])
    # and the bot read API sees it
    assert any(n["author"] == "bot:office-bot" for n in w("GET", "/leads/L1/notes").json()["data"])


@pytest.mark.parametrize("body", [
    {}, {"content": ""}, {"content": "   "}, {"content": "x" * 2001},
    {"content": "x", "follow_up_date": "2020-01-01"}, {"content": "x", "follow_up_date": "tomorrow"},
    {"content": "x", "author": "אילן"},            # extra fields are rejected (no impersonation)
    {"content": "x", "file_url": "https://evil"},
])
def test_note_validation(w, body):
    r = w("POST", "/leads/L1/notes", json=body)
    assert r.status_code == 422 and err(r) == "invalid_request"
    assert len(w.st["notes"]) == 2


def test_note_on_unknown_lead_is_404(w):
    r = w("POST", "/leads/nope/notes", json={"content": "x"})
    assert r.status_code == 404 and err(r) == "not_found" and len(w.st["notes"]) == 2


def test_follow_up_done_postpone_and_noop(w):
    r = w("PATCH", "/notes/n1/follow-up", json={"completed": True})
    assert r.status_code == 200 and r.json()["write"]["changed"] is True
    assert w.st["notes"][0]["Follow_Up_Completed"] is True and w.st["notes"][0]["Content"] == "להתקשר אחרי החג"
    assert acts(w, actor="bot:office-bot", action_type="עדכון תזכורת")
    n_acts = len(w.st["activities"])
    r = w("PATCH", "/notes/n1/follow-up", json={"completed": True})       # already done: no change
    assert r.json()["write"]["changed"] is False and len(w.st["activities"]) == n_acts
    r = w("PATCH", "/notes/n1/follow-up", json={"follow_up_date": iso(7)})   # postpone reopens
    assert w.st["notes"][0]["Follow_Up_Date"] == iso(7) and w.st["notes"][0]["Follow_Up_Completed"] is False
    assert err(w("PATCH", "/notes/n2/follow-up", json={"completed": True})) == "no_follow_up"
    assert err(w("PATCH", "/notes/n1/follow-up", json={})) == "invalid_request"
    assert err(w("PATCH", "/notes/n1/follow-up", json={"content": "edit"})) == "invalid_request"
    assert w("PATCH", "/notes/zzz/follow-up", json={"completed": True}).status_code == 404


# --- idempotency --------------------------------------------------------------------------
def test_idempotency_key_replays_instead_of_writing_twice(w):
    r1 = w("POST", "/leads/L1/notes", json={"content": "פעם אחת"}, idem="abc-123")
    r2 = w("POST", "/leads/L1/notes", json={"content": "פעם אחת"}, idem="abc-123")
    assert r1.status_code == 201 and r2.status_code == 201
    assert r2.headers["idempotent-replayed"] == "true" and r2.json()["write"]["replayed"] is True
    assert r1.json()["data"]["id"] == r2.json()["data"]["id"]
    assert [n["Content"] for n in w.st["notes"]].count("פעם אחת") == 1
    assert len(acts(w, actor="bot:office-bot")) == 1
    r3 = w("POST", "/leads/L1/notes", json={"content": "משהו אחר"}, idem="abc-123")
    assert r3.status_code == 409 and err(r3) == "idempotency_key_reused"


def test_idempotency_survives_a_restart_via_deterministic_ids(w):
    r1 = w("POST", "/tasks", json={"title": "חשבונית", "lead_id": "L1"}, idem="k-1")
    idempotency.reset()                               # server restarted: memory is gone
    r2 = w("POST", "/tasks", json={"title": "חשבונית", "lead_id": "L1"}, idem="k-1")
    assert r1.status_code == 201 and r2.status_code == 200 and r2.json()["write"]["replayed"] is True
    assert r2.json()["data"]["id"] == r1.json()["data"]["id"]
    assert [t["Title"] for t in w.st["tasks"]].count("חשבונית") == 1
    assert len(acts(w, action_type="משימה חדשה")) == 1
    idempotency.reset()
    r3 = w("POST", "/tasks", json={"title": "אחר", "lead_id": "L1"}, idem="k-1")
    assert r3.status_code == 409 and err(r3) == "idempotency_key_reused"


def test_same_idempotency_key_is_per_bot(w):
    assert w("POST", "/leads/L1/notes", json={"content": "a"}, idem="same").status_code == 201
    assert w("POST", "/leads/L1/notes", key="notes", json={"content": "a"}, idem="same").status_code == 201
    assert [n["Content"] for n in w.st["notes"]].count("a") == 2


def test_create_without_key_has_a_short_duplicate_guard(w):
    w("POST", "/leads/L1/notes", json={"content": "כפול"})
    r = w("POST", "/leads/L1/notes", json={"content": "כפול"})
    assert r.headers.get("idempotent-replayed") == "true"
    assert [n["Content"] for n in w.st["notes"]].count("כפול") == 1
    w("POST", "/leads/L1/notes", json={"content": "שונה"})
    assert len(w.st["notes"]) == 4


def test_bad_idempotency_key_is_422(w):
    r = w("POST", "/leads/L1/notes", json={"content": "x"}, idem="has space")
    assert r.status_code == 422 and len(w.st["notes"]) == 2


def test_failed_write_does_not_poison_the_key(w):
    with patch.object(w.svc, "create_note", side_effect=ConnectionError("db down")):
        r = w("POST", "/leads/L1/notes", json={"content": "retry me"}, idem="r1")
    assert r.status_code == 424 and err(r) == "upstream_error" and "db down" not in r.text
    r = w("POST", "/leads/L1/notes", json={"content": "retry me"}, idem="r1")
    assert r.status_code == 201 and "idempotent-replayed" not in r.headers


def test_lead_update_failure_is_424_not_5xx(w):
    with patch.object(w.svc, "update_lead", return_value={}):   # real service returns {} on errors
        r = w("PATCH", "/leads/L1/status", json={"status": "Cold"})
    assert r.status_code == 424 and r.headers["retry-after"] == "10"


# --- dry run ------------------------------------------------------------------------------
@pytest.mark.parametrize("method,path,body", ALL_WRITES)
def test_dry_run_writes_nothing(w, method, path, body):
    before = repr(w.st)
    r = w(method, path, json=body, dry_run="true")
    assert r.status_code == 200, r.text
    assert r.json()["write"]["dry_run"] is True and r.json()["write"]["changed"] is True
    assert repr(w.st) == before
    (row,) = [x for x in w.env.audited() if x["method"] == method]
    assert row["params"]["_write"]["dry_run"] is True


def test_dry_run_still_validates(w):
    assert w("POST", "/leads/nope/notes", json={"content": "x"}, dry_run="true").status_code == 404
    assert err(w("PATCH", "/leads/L2/status", json={"status": "Lost"}, dry_run="true")) == "status_locked"


# --- tasks --------------------------------------------------------------------------------
def test_create_task_like_the_dashboard(w):
    r = w("POST", "/tasks", json={"title": "להזמין במה", "assignee": "קובי", "due_date": iso(5), "lead_id": "L1"})
    assert r.status_code == 201, r.text
    t = r.json()["data"]
    assert t["due_date"] == iso(5) and t["assignee"] == "קובי" and t["is_completed"] is False
    stored = next(x for x in w.st["tasks"] if x["id"] == t["id"])
    assert stored["Due_Date"] == dmy(5) and stored["Lead_ID"] == "L1"     # dashboard format DD.MM.YYYY
    assert stored["Starred_By"] == [] and stored["Pinned_By"] == []
    assert any(x["id"] == t["id"] for x in w.dash.get("/api/v1/tasks").json())
    (a,) = acts(w, actor="bot:office-bot")
    assert (a["action_type"], a["description"]) == activity_text.task_created("להזמין במה")
    assert any(x["id"] == t["id"] and x["due_date"] == iso(5) for x in w("GET", "/tasks").json()["data"])


@pytest.mark.parametrize("body", [
    {"title": ""}, {"title": "x", "assignee": "מישהו"}, {"title": "x", "due_date": "2001-01-01"},
    {"title": "x", "is_completed": True}, {"title": "x" * 201},
])
def test_task_validation(w, body):
    assert w("POST", "/tasks", json=body).status_code == 422 and len(w.st["tasks"]) == 1


def test_task_for_unknown_lead_is_404(w):
    assert w("POST", "/tasks", json={"title": "x", "lead_id": "nope"}).status_code == 404


def test_update_task(w):
    r = w("PATCH", "/tasks/t1", json={"completed": True})
    assert r.status_code == 200 and w.st["tasks"][0]["Is_Completed"] is True
    (a,) = acts(w, actor="bot:office-bot")
    assert a["action_type"] == "משימה הושלמה" and "להזמין הגברה" in a["description"]
    r = w("PATCH", "/tasks/t1", json={"completed": True})
    assert r.json()["write"]["changed"] is False and len(acts(w, actor="bot:office-bot")) == 1
    r = w("PATCH", "/tasks/t1", json={"due_date": iso(9), "assignee": "אילן"})
    assert w.st["tasks"][0]["Due_Date"] == dmy(9) and w.st["tasks"][0]["Assignee"] == "אילן"
    assert set(r.json()["write"]["changes"]) == {"due_date", "assignee"}
    assert w("PATCH", "/tasks/nope", json={"completed": True}).status_code == 404
    assert w("PATCH", "/tasks/t1", json={}).status_code == 422
    assert w("DELETE", "/tasks/t1").status_code == 405


# --- crew ---------------------------------------------------------------------------------
def test_add_and_remove_crew_like_the_dashboard(w):
    r = w("POST", "/leads/L3/crew", json={"musician_id": "m1"})
    assert r.status_code == 200, r.text
    assert w.st["leads"][2]["Musician_Team"] == ["m2", "m1"]          # appended, like the dashboard
    assert r.json()["data"]["crew"] == [{"id": "m2", "name": "Avi"}, {"id": "m1", "name": "Yossi"}]
    (a,) = acts(w, actor="bot:office-bot")
    assert a["action_type"] == "עדכון צוות" and "Yossi" in a["description"] and a["lead_id"] == "L3"
    assert w("POST", "/leads/L3/crew", json={"musician_id": "m1"}).json()["write"]["changed"] is False
    r = w("DELETE", "/leads/L3/crew/m2")
    assert r.status_code == 200 and w.st["leads"][2]["Musician_Team"] == ["m1"]
    assert w("DELETE", "/leads/L3/crew/m2").json()["write"]["changed"] is False
    lead = next(x for x in w.dash.get("/api/v1/leads").json() if x["id"] == "L3")
    assert lead["fields"]["Musician_Team"] == ["m1"]


def test_crew_does_not_trigger_bouzouki_or_messages(w):
    with patch("app.services.logic.bot_logic") as logic, patch("app.services.whatsapp.whatsapp_service") as wa:
        w("POST", "/leads/L3/crew", json={"musician_id": "m1"})
        w("PATCH", "/leads/L3/event", json={"guests": 120})
        w("PATCH", "/leads/L3/status", json={"status": "Talking"})
    assert not logic.method_calls and not wa.method_calls


def test_crew_conflicts_and_rules(w):
    r = w("POST", "/leads/L1/crew", json={"musician_id": "m1"})     # m1 is on L2 the same day
    assert r.status_code == 409 and err(r) == "musician_busy" and "L2" in r.json()["error"]["message"]
    assert w.st["leads"][0]["Musician_Team"] == []
    r = w("POST", "/leads/L1/crew", json={"musician_id": "m1", "allow_conflict": True})
    assert r.status_code == 200 and w.st["leads"][0]["Musician_Team"] == ["m1"]
    assert any("musician_busy" in x for x in r.json()["write"]["warnings"])
    assert err(w("POST", "/leads/L1/crew", json={"musician_id": "m3"})) == "musician_unavailable"
    assert w("POST", "/leads/L1/crew", json={"musician_id": "zzz"}).status_code == 404
    assert w("POST", "/leads/zzz/crew", json={"musician_id": "m2"}).status_code == 404


def test_crew_change_warns_that_calendar_is_not_updated(w):
    r = w("DELETE", "/leads/L2/crew/m1")
    assert r.status_code == 200 and any("Calendar" in x for x in r.json()["write"]["warnings"])


def test_crew_names_need_musicians_read(w):
    key = w.env.table.add("crew-only", ["crew:write"])
    r = w.dash.post(B + "/leads/L3/crew", headers=hdr(key), json={"musician_id": "m1"})
    assert r.status_code == 200 and r.json()["data"]["crew"] == [{"id": "m2"}, {"id": "m1"}]


# --- lead status / owner / event ----------------------------------------------------------
def test_status_change_uses_dashboard_activity_text(w):
    r = w("PATCH", "/leads/L1/status", json={"status": "Quote_Sent", "expected_status": "Talking"})
    assert r.status_code == 200 and w.st["leads"][0]["Status"] == "Quote_Sent"
    assert r.json()["data"]["status_he"] == 'נשלחה הצ"מ'
    (a,) = acts(w, actor="bot:office-bot")
    assert (a["action_type"], a["description"]) == activity_text.status_changed("Quote_Sent")
    assert w("PATCH", "/leads/L1/status", json={"status": "Quote_Sent"}).json()["write"]["changed"] is False


@pytest.mark.parametrize("body,code", [
    ({"status": "Closed"}, 422), ({"status": "New"}, 422), ({"status": "Referred"}, 422),
    ({"status": "Distributed"}, 422), ({"status": "Cold", "lost_reason": "x"}, 422),
    ({"status": "Completed"}, 409), ({"status": "Lost", "expected_status": "New"}, 409),
])
def test_status_rules(w, body, code):
    r = w("PATCH", "/leads/L1/status", json=body)
    assert r.status_code == code and w.st["leads"][0]["Status"] == "Talking"


def test_closed_deal_can_only_be_completed(w):
    assert err(w("PATCH", "/leads/L2/status", json={"status": "Lost"})) == "status_locked"
    assert w("PATCH", "/leads/L2/status", json={"status": "Completed"}).status_code == 200
    assert err(w("PATCH", "/leads/L2/status", json={"status": "Talking"})) == "status_locked"


def test_lost_with_reason_warns_about_open_tasks(w):
    r = w("PATCH", "/leads/L1/status", json={"status": "Lost", "lost_reason": "סגרו עם הרכב אחר"})
    assert r.status_code == 200 and w.st["leads"][0]["Lost_Reason"] == "סגרו עם הרכב אחר"
    assert any("open task" in x for x in r.json()["write"]["warnings"])
    assert w.st["tasks"][0]["Is_Completed"] is False          # tasks are left alone


def test_owner_handover_matches_dashboard_transfer(w):
    r = w("PATCH", "/leads/L1/owner", json={"owner": "קובי", "handover_note": "הלקוחה ביקשה לדבר איתו"})
    assert r.status_code == 200 and w.st["leads"][0]["Owner"] == "קובי"
    action, desc, note = activity_text.owner_transfer("אילן", "קובי", "הלקוחה ביקשה לדבר איתו")
    (n,) = [x for x in w.st["notes"] if x["Author"] == "bot:office-bot"]
    assert n["Content"] == note and n["Lead_ID"] == "L1"
    (a,) = acts(w, actor="bot:office-bot")
    assert (a["action_type"], a["description"]) == (action, desc)
    assert w("PATCH", "/leads/L1/owner", json={"owner": "קובי", "handover_note": "שוב"}).json()["write"]["changed"] is False


@pytest.mark.parametrize("body", [{"owner": "קובי"}, {"owner": "קובי", "handover_note": "x"},
                                  {"owner": "Bob", "handover_note": "because"}, {"owner": None, "handover_note": "abc"}])
def test_owner_validation(w, body):
    assert w("PATCH", "/leads/L1/owner", json=body).status_code == 422 and w.st["leads"][0]["Owner"] == "אילן"


def test_event_details(w):
    r = w("PATCH", "/leads/L1/event", json={"event_date": iso(40), "guests": 150, "location": "  רמת גן "})
    assert r.status_code == 200, r.text
    lead = w.st["leads"][0]
    assert (lead["Event_Date"], lead["Guests"], lead["Location"]) == (dmy(40), "150", "רמת גן")
    (a,) = acts(w, actor="bot:office-bot")
    assert a["action_type"] == "עדכון פרטי אירוע" and dmy(40) in a["description"]
    assert w("GET", "/leads/L1").json()["data"]["event_date"] == iso(40)    # bot read parses it back
    r = w("PATCH", "/leads/L2/event", json={"location": "אילת"})
    assert any("Calendar" in x for x in r.json()["write"]["warnings"])
    for bad in ({}, {"guests": 0}, {"event_date": "1999-01-01"}, {"phone": "0501234567"}, {"name": "x"}):
        assert w("PATCH", "/leads/L1/event", json=bad).status_code == 422


# --- limits and audit ---------------------------------------------------------------------
def test_write_rate_limit_per_minute_and_day(w):
    w.env.settings.BOT_WRITE_RATE_LIMIT_PER_MINUTE = 2
    for i in range(2):
        assert w("POST", "/leads/L1/notes", json={"content": f"n{i}"}).status_code == 201
    r = w("POST", "/leads/L1/notes", json={"content": "n3"})
    assert r.status_code == 429 and "writes/minute" in r.json()["error"]["message"] and r.headers["retry-after"]
    assert w("GET", "/leads").status_code == 200                     # reads are not affected
    from app.bot.auth import reset_write_limits
    reset_write_limits()
    w.env.settings.BOT_WRITE_RATE_LIMIT_PER_MINUTE, w.env.settings.BOT_WRITE_DAILY_LIMIT = 10, 1
    assert w("POST", "/leads/L1/notes", json={"content": "d1"}).status_code == 201
    r = w("POST", "/leads/L1/notes", json={"content": "d2"})
    assert r.status_code == 429 and "Daily" in r.json()["error"]["message"]


def test_audit_row_has_write_summary(w):
    w("POST", "/leads/L1/notes", json={"content": "א" * 500}, idem="audit-1")
    w("PATCH", "/leads/L1/status", key="reader", json={"status": "Cold"})
    rows = w.env.audited()
    ok = rows[0]
    assert ok["status"] == 201 and ok["bot_name"] == "office-bot" and ok["method"] == "POST"
    s = ok["params"]["_write"]
    assert s["action"] == "note.create" and s["idem"] == "audit-1" and s["dry_run"] is False
    assert s["changed"] is True and s["result_id"].startswith("rec")
    assert len(s["body"]["content"]) <= 121                       # payload summary, truncated
    denied = rows[1]
    assert denied["status"] == 403 and denied["error_code"] == "insufficient_scope"


# --- static guarantees --------------------------------------------------------------------
def test_write_code_cannot_message_anyone():
    """writes.py only imports the data layer; it calls no messaging / calendar / delete / finance code."""
    import ast
    tree = ast.parse(Path("app/bot/writes.py").read_text(encoding="utf-8"))
    mods = {n.module for n in ast.walk(tree) if isinstance(n, ast.ImportFrom)} | \
           {a.name for n in ast.walk(tree) if isinstance(n, ast.Import) for a in n.names}
    assert not [m for m in mods if m and any(x in m for x in ("whatsapp", "logic", "calendar", "email"))]
    attrs = {n.attr for n in ast.walk(tree) if isinstance(n, ast.Attribute)}
    banned = {"send_message", "_send_message", "notify_admins", "check_and_trigger_bouzouki_protocol",
              "start_bouzouki_protocol", "delete_lead", "delete_note", "delete_task", "create_finance_entry",
              "update_finance_entry", "delete_finance_entry", "create_event", "update_event"}
    assert not attrs & banned


def test_partners_match_dashboard_owner_list():
    ts = Path("frontend/lib/constants.ts").read_text(encoding="utf-8")
    m = re.search(r"export const OWNERS = \[([^\]]*)\]", ts)
    assert tuple(re.findall(r"'([^']+)'", m.group(1))) == activity_text.PARTNERS


def test_deterministic_ids_have_dashboard_format():
    rid = idempotency.record_id("key-1", "note.create", "abc")
    assert re.fullmatch(r"rec[0-9a-f]{14}", rid) and rid == idempotency.record_id("key-1", "note.create", "abc")
    assert rid != idempotency.record_id("key-2", "note.create", "abc")
    assert idempotency.record_id("key-1", "note.create", None) is None
