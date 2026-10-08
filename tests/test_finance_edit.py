"""PATCH /finance/{id}: Owner (partners only) and Lead_ID ("" / null unlinks) are persisted,
edits are audited with before/after, viewers stay blocked, the Bot API is untouched."""
import time
from copy import deepcopy
from unittest.mock import patch

import jwt
import pytest
from fastapi.testclient import TestClient

from app.core import auth, dashboard_users as du
from app.core.config import get_settings
from app.models.schemas import FinanceEntryUpdate
from app.services import activity_text
from app.services.supabase_service import SupabaseService

SECRET = "unit-test-jwt-secret-unit-test-jwt-secret"
ADMIN, PARTNER, VIEWER = "admin@example.com", "partner@example.com", "viewer@example.com"
P1, P2 = activity_text.PARTNERS[0], activity_text.PARTNERS[1]


@pytest.fixture
def client(monkeypatch, mock_service):
    rows = [
        {"email": ADMIN, "role": "admin", "display_name": "מנהל", "active": True},
        {"email": PARTNER, "role": "partner", "display_name": P2, "active": True},
        {"email": VIEWER, "role": "viewer", "display_name": "צופה", "active": True},
    ]
    monkeypatch.setattr(get_settings(), "SUPABASE_JWT_SECRET", SECRET)
    monkeypatch.setattr(du, "_fetch_rows", lambda: deepcopy(rows))
    auth._cache.clear()
    du.invalidate_cache()
    mock_service._stores["leads"] += [{"id": "lead1", "Phone": "972500000001", "Name": "א"},
                                      {"id": "lead2", "Phone": "972500000002", "Name": "ב"}]
    mock_service._stores["finance"] += [
        {"id": "f1", "Owner": P1, "Type": "income", "Amount": 1000.0, "Date": "2026-10-01",
         "Description": "חתונה", "Payment_Status": "שולם", "Payment_Method": "חשבון", "Lead_ID": "lead1"},
    ]
    with patch("app.api.routes.airtable_service", mock_service), patch("app.core.scheduler.scheduler"):
        from app.main import app
        yield TestClient(app, raise_server_exceptions=False)
    auth._cache.clear()
    du.invalidate_cache()


def H(email):
    tok = jwt.encode({"sub": "u", "email": email, "aud": "authenticated", "exp": int(time.time()) + 3600},
                     SECRET, algorithm="HS256")
    return {"Authorization": f"Bearer {tok}"}


def row(mock_service):
    return next(r for r in mock_service._stores["finance"] if r["id"] == "f1")


def edits(audit_rows):
    return [a for a in audit_rows if a["event"] == "finance_entry_updated"]


def test_owner_change_is_saved_and_audited(client, mock_service, audit_rows):
    r = client.patch("/api/v1/finance/f1", json={"Owner": P2, "Amount": 1200}, headers=H(ADMIN))
    assert r.status_code == 200, r.text
    assert row(mock_service)["Owner"] == P2 and row(mock_service)["Amount"] == 1200
    s = client.get("/api/v1/finance/summary", headers=H(ADMIN)).json()
    assert s[P2]["income"] == 1200 and s.get(P1, {}).get("income", 0) == 0
    [a] = edits(audit_rows)
    assert a["email"] == ADMIN and a["detail"]["entry_id"] == "f1"
    assert a["detail"]["before"] == {"Owner": P1, "Amount": 1000.0}
    assert a["detail"]["after"] == {"Owner": P2, "Amount": 1200.0}
    assert a["detail"]["fields"] == ["Amount", "Owner"]


@pytest.mark.parametrize("value", ["", None, "   "])
def test_lead_id_can_be_cleared(client, mock_service, audit_rows, value):
    r = client.patch("/api/v1/finance/f1", json={"Lead_ID": value}, headers=H(ADMIN))
    assert r.status_code == 200
    assert row(mock_service)["Lead_ID"] is None
    assert client.get("/api/v1/leads/lead1/finance", headers=H(ADMIN)).json() == []
    [a] = edits(audit_rows)
    assert a["detail"]["before"] == {"Lead_ID": "lead1"} and a["detail"]["after"] == {"Lead_ID": None}


def test_lead_id_relink_and_unknown_lead(client, mock_service, audit_rows):
    assert client.patch("/api/v1/finance/f1", json={"Lead_ID": "lead2"}, headers=H(ADMIN)).status_code == 200
    assert row(mock_service)["Lead_ID"] == "lead2"
    r = client.patch("/api/v1/finance/f1", json={"Lead_ID": "nope"}, headers=H(ADMIN))
    assert r.status_code == 400 and row(mock_service)["Lead_ID"] == "lead2"


@pytest.mark.parametrize("owner", ["מנהל", "", "Unknown", None])
def test_owner_must_be_a_partner(client, mock_service, owner):
    r = client.patch("/api/v1/finance/f1", json={"Owner": owner, "Amount": 5}, headers=H(ADMIN))
    assert r.status_code == 400 and r.json()["detail"] == "שותף לא מוכר"
    assert row(mock_service)["Owner"] == P1 and row(mock_service)["Amount"] == 1000.0


def test_no_change_writes_nothing(client, mock_service, audit_rows):
    body = {"Owner": P1, "Lead_ID": "lead1", "Amount": 1000, "Type": "income", "Date": "2026-10-01",
            "Description": "חתונה", "Payment_Status": "שולם", "Payment_Method": "חשבון"}
    r = client.patch("/api/v1/finance/f1", json=body, headers=H(ADMIN))
    assert r.status_code == 200 and r.json()["fields"]["Owner"] == P1
    assert edits(audit_rows) == []


def test_description_only_change_names_the_field_without_values(client, audit_rows):
    assert client.patch("/api/v1/finance/f1", json={"Description": "בר מצווה"}, headers=H(ADMIN)).status_code == 200
    [a] = edits(audit_rows)
    assert a["detail"]["fields"] == ["Description"] and a["detail"]["before"] == {} and a["detail"]["after"] == {}


def test_partner_cannot_move_entry_to_other_partner(client, mock_service, audit_rows):
    r = client.patch("/api/v1/finance/f1", json={"Owner": P2, "Payment_Method": "מזומן"}, headers=H(PARTNER))
    assert r.status_code == 403 and r.json()["detail"] == "רק מנהל יכול להעביר תנועה בין שותפים"
    assert row(mock_service)["Owner"] == P1 and row(mock_service)["Payment_Method"] == "חשבון"
    assert edits(audit_rows) == []


def test_partner_edit_with_same_or_no_owner_is_fine(client, mock_service):
    assert client.patch("/api/v1/finance/f1", json={"Owner": P1, "Amount": 1100}, headers=H(PARTNER)).status_code == 200
    assert client.patch("/api/v1/finance/f1", json={"Payment_Method": "מזומן"}, headers=H(PARTNER)).status_code == 200
    assert row(mock_service)["Owner"] == P1 and row(mock_service)["Amount"] == 1100
    assert row(mock_service)["Payment_Method"] == "מזומן"


def test_api_key_can_move_owner(test_client, mock_service):
    mock_service._stores["finance"].append({"id": "f9", "Owner": P1, "Type": "income", "Amount": 5.0})
    assert test_client.patch("/api/v1/finance/f9", json={"Owner": P2}).status_code == 200
    assert mock_service._stores["finance"][-1]["Owner"] == P2


NEW = {"Type": "expense", "Date": "2026-10-08", "Description": "ציוד", "Amount": 50}


@pytest.mark.parametrize("who", [ADMIN, PARTNER])
@pytest.mark.parametrize("owner", ["מנהל", "", None, "עסק", "missing"])
def test_create_requires_a_partner_owner(client, mock_service, who, owner):
    body = dict(NEW) if owner == "missing" else {**NEW, "Owner": owner}
    before = len(mock_service._stores["finance"])
    r = client.post("/api/v1/finance", json=body, headers=H(who))
    assert r.status_code == 400 and r.json()["detail"] == "יש לבחור שותף"
    assert len(mock_service._stores["finance"]) == before


def test_partner_creates_only_for_themselves(client, mock_service):
    before = len(mock_service._stores["finance"])
    r = client.post("/api/v1/finance", json={**NEW, "Owner": P1}, headers=H(PARTNER))   # PARTNER is P2
    assert r.status_code == 403 and r.json()["detail"] == "שותף יכול לרשום תנועות רק על שמו"
    assert len(mock_service._stores["finance"]) == before
    r = client.post("/api/v1/finance", json={**NEW, "Owner": P2}, headers=H(PARTNER))
    assert r.status_code == 200 and r.json()["fields"]["Owner"] == P2


def test_admin_creates_for_any_partner(client):
    for p in activity_text.PARTNERS:
        r = client.post("/api/v1/finance", json={**NEW, "Owner": p}, headers=H(ADMIN))
        assert r.status_code == 200 and r.json()["fields"]["Owner"] == p


def test_create_with_partner_owner(client, mock_service):
    r = client.post("/api/v1/finance", json={**NEW, "Owner": f" {P2} "}, headers=H(ADMIN))
    assert r.status_code == 200 and r.json()["fields"]["Owner"] == P2
    assert client.post("/api/v1/finance", json={**NEW, "Owner": P2, "Amount": "x"}, headers=H(ADMIN)).status_code == 400
    assert client.post("/api/v1/finance", json={**NEW, "Owner": P2}, headers=H(VIEWER)).status_code == 403


def test_viewer_blocked(client, mock_service, audit_rows):
    r = client.patch("/api/v1/finance/f1", json={"Owner": P2, "Lead_ID": ""}, headers=H(VIEWER))
    assert r.status_code == 403
    assert row(mock_service)["Owner"] == P1 and row(mock_service)["Lead_ID"] == "lead1"
    assert edits(audit_rows) == []


def test_errors(client):
    assert client.patch("/api/v1/finance/nope", json={"Amount": 1}, headers=H(ADMIN)).status_code == 404
    assert client.patch("/api/v1/finance/f1", json={"Amount": "abc"}, headers=H(ADMIN)).status_code == 400
    assert client.patch("/api/v1/finance/f1", content="x",
                        headers={**H(ADMIN), "Content-Type": "application/json"}).status_code == 400


def test_service_clear_sends_null():
    sent = {}

    class Q:
        def update(self, data): sent.update(data); return self
        def eq(self, *a): return self
        def execute(self): return type("R", (), {"data": [{"id": "f1", **sent}]})()

    svc = SupabaseService.__new__(SupabaseService)
    svc.client = type("C", (), {"table": lambda self, name: Q()})()
    out = svc.update_finance_entry("f1", FinanceEntryUpdate(Owner=P2), clear=("Lead_ID",))
    assert sent == {"Owner": P2, "Lead_ID": None}
    assert out["fields"]["Lead_ID"] is None
