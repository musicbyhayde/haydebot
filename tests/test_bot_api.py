"""Bot API read endpoints: filters, pagination, scopes, masking, errors, audit."""
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.bot import data
from tests.bot_helpers import bot_env, hdr  # noqa: F401

T0 = data.today()
NOW = datetime.now(timezone.utc)


def d(days):
    return (T0 + timedelta(days=days))


def ts(hours_ago):
    return (NOW - timedelta(hours=hours_ago)).isoformat()


def lead(id, name, status, phone="972501234567", service="Band", owner="אילן", event=None,
         created_days_ago=1, last_hours_ago=1, **extra):
    fields = {"Name": name, "Status": status, "Phone": phone, "Service": service, "Owner": owner,
              "Event_Date": event, "Location": "תל אביב", "Guests": "100",
              "Last_Interaction": ts(last_hours_ago), "Last_Summary": f"סיכום {name}",
              "Closing_Amount": 5000, "Google_Event_ID": "gcal-secret", "Starred_By": ["x"],
              "Quote_Data": {"price": 5000}, "Commission_Amount": 750, "Musician_Team": ["m1"],
              "Musician_RSVPs": {"m1": "accepted"}}
    fields.update(extra)
    return {"id": id, "createdTime": ts(24 * created_days_ago), "fields": fields}


class FakeDB:
    def __init__(self):
        self.fail = False
        self.leads = [
            lead("L1", "דנה כהן", "New", event=f"{d(5):%d.%m.%Y} (שבוע הבא)", last_hours_ago=0.5),
            lead("L2", "Moshe Levi", "Talking", phone="972529998877", service="DJ", owner="קובי",
                 event=d(40).isoformat(), last_hours_ago=24 * 10, created_days_ago=20),
            lead("L3", "Closed Deal", "Closed", service="Bouzouki", event=f"{d(3):%d.%m.%y}"),
            lead("L4", "Lost One", "Lost", event=f"{d(2):%d.%m.%Y}", created_days_ago=60),
            lead("L5", "Old Event", "Completed", event=f"{d(-10):%d.%m.%Y}", created_days_ago=100),
        ]
        self.messages = {
            "L1": [{"id": f"w{i}", "fields": {"Direction": "Inbound" if i % 2 == 0 else "Outbound",
                                              "Content": f"msg {i}", "Timestamp": ts(30 - i),
                                              "Status": "Sent", "Media_URL": "https://s/x.jpg" if i == 0 else None}}
                   for i in range(5)],
        }
        self.meta = [
            {"id": "a", "Lead": ["L1"], "Direction": "Inbound", "Timestamp": ts(20)},   # waiting 20h
            {"id": "b", "Lead": ["L2"], "Direction": "Inbound", "Timestamp": ts(30)},
            {"id": "c", "Lead": ["L2"], "Direction": "Outbound", "Timestamp": ts(5)},   # answered
        ]
        self.notes = [{"id": "n1", "fields": {"Lead_ID": "L1", "Author": "אילן", "Content": "להתקשר",
                                              "Created_At": ts(5), "Follow_Up_Date": d(-1).isoformat(),
                                              "Follow_Up_Completed": False, "File_URL": "https://s/f.pdf",
                                              "File_Name": "f.pdf"}}]
        self.tasks = [
            {"id": "t1", "fields": {"Title": "להזמין הגברה", "Assignee": "קובי", "Due_Date": d(-2).isoformat(),
                                    "Is_Completed": False, "Lead_ID": "L1"}},
            {"id": "t2", "fields": {"Title": "חשבונית", "Assignee": "אילן", "Due_Date": d(3).isoformat(),
                                    "Is_Completed": False}},
            {"id": "t3", "fields": {"Title": "done", "Assignee": "אילן", "Is_Completed": True}},
        ]
        self.musicians = [
            {"id": "m1", "fields": {"Name": "Yossi", "Phone": "972501111111", "Email": "y@x.com",
                                    "Is_Active": True, "Score": 8, "Type": "POOL",
                                    "Bank_Account_Number": "12345", "Bank_Name": "Leumi"}},
            {"id": "m2", "fields": {"Name": "Inactive", "Phone": "1", "Is_Active": False, "Type": "REFERRER"}},
        ]
        self.finance = [
            {"id": "f1", "fields": {"Owner": "אילן", "Type": "income", "Amount": 1000, "Date": "2026-09-10",
                                    "Payment_Status": "שולם", "Payment_Method": "חשבון", "Description": "חתונה"}},
            {"id": "f2", "fields": {"Owner": "אילן", "Type": "expense", "Amount": 300, "Date": "2026-09-12",
                                    "Payment_Status": "שולם", "Payment_Method": "מזומן", "Description": "נגן"}},
            {"id": "f3", "fields": {"Owner": "קובי", "Type": "income", "Amount": 2000, "Date": "2026-10-01",
                                    "Payment_Status": "לא שולם", "Payment_Method": "חשבון", "Description": "בר מצווה"}},
        ]
        db = self

        class LT:
            def get(self, rid):
                return next((l for l in db.leads if l["id"] == rid), None)
        self.leads_table = LT()

    def _chk(self):
        if self.fail:
            raise ConnectionError("db down")

    def get_all_leads(self):
        self._chk()
        return [dict(l) for l in self.leads]

    def get_messages_for_lead(self, lid):
        return list(self.messages.get(lid, []))

    def get_notes_for_lead(self, lid):
        return [n for n in self.notes if n["fields"]["Lead_ID"] == lid]

    def get_pending_followups(self):
        return list(self.notes)

    def get_tasks(self):
        return list(self.tasks)

    def get_all_musicians(self):
        return list(self.musicians)

    def get_finance_entries(self, owner=None):
        return [f for f in self.finance if not owner or f["fields"]["Owner"] == owner]

    def get_message_meta_since(self, since):
        return list(self.meta)


ALL_DEFAULT = ["leads:read", "messages:read", "notes:read", "tasks:read", "musicians:read", "finance:summary"]


@pytest.fixture
def api(bot_env, monkeypatch):
    fake = FakeDB()
    monkeypatch.setattr(data, "db", fake)
    from app.main import app
    c = TestClient(app)
    keys = {
        "default": bot_env.table.add("default", ALL_DEFAULT),
        "leads": bot_env.table.add("leadsonly", ["leads:read"]),
        "full": bot_env.table.add("full", ["leads:read", "messages:read", "notes:read", "tasks:read",
                                           "musicians:read", "finance:read", "pii:read"]),
        "tasks": bot_env.table.add("tasksonly", ["tasks:read"]),
    }

    def get(path, key="default", **params):
        return c.get("/api/bot/v1" + path, headers=hdr(keys[key]), params=params)
    get.fake, get.env, get.client, get.keys = fake, bot_env, c, keys
    return get


def ids(r):
    return [x.get("id") or x.get("lead_id") for x in r.json()["data"]]


# --- leads -------------------------------------------------------------------------------
def test_leads_list_default_sort_and_masking(api):
    r = api("/leads")
    assert r.status_code == 200
    body = r.json()
    assert body["page"] == {"total": 5, "limit": 50, "offset": 0, "next_offset": None}
    first = body["data"][0]
    assert first["id"] == "L1" and first["status_he"] == "חדש" and first["service_he"] == "הרכב"
    assert first["phone_masked"] == "***4567" and "phone" not in first
    assert first["event_date"] == d(5).isoformat()
    assert first["closing_amount"] == 5000           # finance:summary in default
    for banned in ("Google_Event_ID", "google_event_id", "Starred_By", "quote", "commission_amount"):
        assert banned not in r.text


def test_leads_scope_variants(api):
    only = api("/leads", key="leads").json()["data"][0]
    assert "closing_amount" not in only and "phone" not in only
    full = api("/leads", key="full").json()["data"][0]
    assert full["phone"] == "972501234567" and full["closing_amount"] == 5000  # finance:read implies summary


def test_leads_filters(api):
    assert ids(api("/leads", status="Talking,New")) == ["L1", "L2"]
    assert ids(api("/leads", service="dj")) == ["L2"]
    assert ids(api("/leads", owner="קובי")) == ["L2"]
    assert ids(api("/leads", q="moshe")) == ["L2"]
    assert ids(api("/leads", q="9988")) == ["L2"]                # phone digits search, result masked
    assert set(ids(api("/leads", open_only="true"))) == {"L1", "L2"}
    assert ids(api("/leads", event_from=d(0).isoformat(), event_to=d(4).isoformat(), sort="event_date")) == ["L4", "L3"]
    assert ids(api("/leads", created_from=d(-30).isoformat(), sort="created")) == ["L1", "L3", "L2"]
    assert set(ids(api("/leads", updated_since=(NOW - timedelta(hours=5)).isoformat()))) == {"L1", "L3", "L4", "L5"}


def test_leads_pagination(api):
    r = api("/leads", limit=2, offset=0).json()
    assert len(r["data"]) == 2 and r["page"]["next_offset"] == 2
    r = api("/leads", limit=2, offset=4).json()
    assert len(r["data"]) == 1 and r["page"]["next_offset"] is None


def test_leads_validation_errors_use_bot_format(api):
    r = api("/leads", status="Bogus")
    assert r.status_code == 422 and r.json()["error"]["code"] == "invalid_request" and "Bogus" in r.text
    r = api("/leads", limit=500)
    assert r.status_code == 422 and r.json()["error"]["code"] == "invalid_request" and "limit" in r.text
    r = api("/leads", event_from="next week")
    assert r.status_code == 422 and set(r.json()) == {"error"}


def test_lead_detail(api):
    r = api("/leads/L1")
    lead = r.json()["data"]
    assert lead["musicians"] == [{"id": "m1", "name": "Yossi"}] and lead["musician_rsvps"] == {"m1": "accepted"}
    assert "quote" not in lead and "commission_amount" not in lead
    lead = api("/leads/L1", key="leads").json()["data"]
    assert lead["musicians"] == [{"id": "m1", "name": None}]  # no musicians:read
    lead = api("/leads/L1", key="full").json()["data"]
    assert lead["quote"] == {"price": 5000} and lead["commission_amount"] == 750
    r = api("/leads/NOPE")
    assert r.status_code == 404 and r.json()["error"]["code"] == "not_found"


# --- messages / notes --------------------------------------------------------------------
def test_messages_scope_order_pagination_and_media(api):
    r = api("/leads/L1/messages", key="leads")
    assert r.status_code == 403 and r.json()["error"]["code"] == "insufficient_scope"
    r = api("/leads/L1/messages", limit=2).json()
    assert [m["content"] for m in r["data"]] == ["msg 4", "msg 3"] and r["page"]["total"] == 5
    r = api("/leads/L1/messages", order="oldest", limit=1, offset=0).json()
    assert r["data"][0]["content"] == "msg 0" and "media_url" not in r["data"][0]
    r = api("/leads/L1/messages", key="full", order="oldest", limit=1).json()
    assert r["data"][0]["media_url"] == "https://s/x.jpg"
    assert api("/leads/NOPE/messages").status_code == 404


def test_notes_and_followups(api):
    note = api("/leads/L1/notes").json()["data"][0]
    assert note["content"] == "להתקשר" and note["file_name"] == "f.pdf" and "file_url" not in note
    assert api("/leads/L1/notes", key="full").json()["data"][0]["file_url"] == "https://s/f.pdf"
    fu = api("/follow-ups").json()["data"][0]
    assert fu["lead_name"] == "דנה כהן"
    assert api("/follow-ups", key="leads").status_code == 403


# --- tasks / events / stats / attention --------------------------------------------------
def test_tasks(api):
    r = api("/tasks").json()
    assert [t["id"] for t in r["data"]] == ["t1", "t2"]
    assert r["data"][0]["overdue"] is True and r["data"][0]["lead_name"] == "דנה כהן"
    assert [t["id"] for t in api("/tasks", status="all").json()["data"]] == ["t1", "t2", "t3"]
    assert [t["id"] for t in api("/tasks", overdue="true").json()["data"]] == ["t1"]
    assert [t["id"] for t in api("/tasks", assignee="אילן", status="all").json()["data"]] == ["t2", "t3"]
    t = api("/tasks", key="tasks").json()["data"][0]
    assert "lead_name" not in t and t["lead_id"] == "L1"   # no leads:read
    assert api("/tasks", key="leads").status_code == 403


def test_upcoming_events(api):
    r = api("/events/upcoming").json()
    assert [e["id"] for e in r["data"]] == ["L3", "L1", "L2"]         # Lost hidden, past excluded
    assert r["data"][0]["covered"] is True and r["data"][1]["days_until"] == 5
    assert [e["id"] for e in api("/events/upcoming", days=10).json()["data"]] == ["L3", "L1"]
    assert "L4" in [e["id"] for e in api("/events/upcoming", include_all="true").json()["data"]]
    assert api("/events/upcoming", days=1000).status_code == 422


def test_stats(api):
    s = api("/stats").json()["data"]
    assert s["total_leads"] == 5 and s["open_leads"] == 2
    assert s["new_leads_last_7_days"] == 2 and s["new_leads_last_30_days"] == 3
    assert s["events_next_30_days"] == 2
    assert {"status": "New", "status_he": "חדש", "count": 1} in s["by_status"]
    assert s["open_by_owner"] == {"אילן": 1, "קובי": 1}
    assert s["closed_deal_amount_by_event_month"] == {d(3).strftime("%Y-%m"): 5000.0}
    assert "closed_deal_amount_by_event_month" not in api("/stats", key="leads").json()["data"]


def test_attention(api):
    a = api("/attention").json()["data"]
    assert [x["lead_id"] for x in a["needs_reply"]] == ["L1"] and a["needs_reply"][0]["hours_waiting"] >= 19.9
    assert [x["lead_id"] for x in a["stale_leads"]] == ["L2"]
    assert [x["lead_id"] for x in a["events_soon_not_closed"]] == ["L1"]   # L3 closed, L4 lost
    assert [n["id"] for n in a["overdue_followups"]] == ["n1"]
    assert [t["id"] for t in a["overdue_tasks"]] == ["t1"]
    a = api("/attention", no_reply_hours=24).json()["data"]
    assert a["needs_reply"] == []
    limited = api("/attention", key="leads").json()["data"]
    assert "overdue_followups" not in limited and "overdue_tasks" not in limited
    assert "msg" not in api("/attention").text  # no message content


# --- musicians / finance -----------------------------------------------------------------
def test_musicians(api):
    r = api("/musicians")
    assert [m["name"] for m in r.json()["data"]] == ["Yossi"]
    assert "972501111111" not in r.text and "Leumi" not in r.text and "12345" not in r.text and "y@x.com" not in r.text
    full = api("/musicians", key="full", active_only="false")
    assert {m["name"] for m in full.json()["data"]} == {"Yossi", "Inactive"}
    assert "972501111111" in full.text and "Leumi" not in full.text and "12345" not in full.text
    assert api("/musicians", key="leads").status_code == 403


def test_finance_summary_and_entries(api):
    s = api("/finance/summary").json()["data"]
    assert s["totals"] == {"income": 3000.0, "expenses": 300.0, "balance": 2700.0, "unpaid_income_amount": 2000.0}
    assert s["by_owner"]["אילן"]["cash_balance"] == -300.0 and s["by_owner"]["אילן"]["bank_balance"] == 1000.0
    assert s["by_owner"]["קובי"]["unpaid_income_count"] == 1
    assert s["by_month"] == {"2026-09": {"income": 1000.0, "expenses": 300.0, "net": 700.0},
                             "2026-10": {"income": 2000.0, "expenses": 0.0, "net": 2000.0}}
    s = api("/finance/summary", owner="קובי", date_from="2026-10-01").json()["data"]
    assert s["totals"]["income"] == 2000.0
    assert "חתונה" not in api("/finance/summary").text            # aggregates only
    assert api("/finance/entries").status_code == 403            # default key has no finance:read
    assert api("/finance/summary", key="leads").status_code == 403
    e = api("/finance/entries", key="full", type="income").json()
    assert [x["id"] for x in e["data"]] == ["f3", "f1"] and e["data"][0]["amount"] == 2000.0
    assert api("/finance/summary", key="full").status_code == 200   # finance:read implies summary


# --- cross-cutting -----------------------------------------------------------------------
def test_upstream_failure_is_502_without_details(api):
    api.fake.fail = True
    r = api("/leads")
    assert r.status_code == 502 and r.json()["error"]["code"] == "upstream_error" and "db down" not in r.text


def test_every_request_is_audited(api):
    paths = ["/whoami", "/leads", "/leads/L1", "/leads/L1/messages", "/stats", "/finance/entries"]
    for p in paths:
        api(p)
    rows = api.env.audited()
    assert [r["path"] for r in rows] == ["/api/bot/v1" + p for p in paths]
    assert rows[-1]["status"] == 403 and rows[-1]["error_code"] == "insufficient_scope"
    assert all(r["bot_name"] == "default" for r in rows)


@pytest.mark.parametrize("method", ["post", "put", "patch", "delete"])
def test_no_write_methods(api, method):
    r = getattr(api.client, method)("/api/bot/v1/leads", headers=hdr(api.keys["full"]))
    assert r.status_code == 405 and r.json()["error"]["code"] == "method_not_allowed"


def test_router_is_get_only_and_has_no_send_or_backup():
    from app.api.bot_routes import bot_router
    for route in bot_router.routes:
        assert route.methods <= {"GET", "HEAD"}, route.path
        assert not any(w in route.path for w in ("send", "backup", "upload", "webhook"))


def test_message_meta_query_is_paginated_and_content_free():
    from unittest.mock import MagicMock
    from app.services.supabase_service import SupabaseService
    svc = SupabaseService.__new__(SupabaseService)
    svc.client = MagicMock()
    q = svc.client.table.return_value.select.return_value.gte.return_value.order.return_value.order.return_value
    q.range.return_value.execute.return_value.data = [{"id": "a"}]
    assert svc.get_message_meta_since("2026-01-01") == [{"id": "a"}]
    svc.client.table.assert_called_with("messages")
    cols = svc.client.table.return_value.select.call_args[0][0]
    assert "Content" not in cols and "Direction" in cols
    q.range.assert_called_with(0, 999)
