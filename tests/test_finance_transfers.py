"""Partner transfers ("העברה בין שותפים", Ilan 2026-10-08): admin-only create/edit/archive,
partner read-only, viewers blocked, balance + pools move, income/expenses never change."""
import time
from copy import deepcopy
from unittest.mock import patch

import jwt
import pytest
from fastapi.testclient import TestClient

from app.core import auth, dashboard_users as du
from app.core.config import get_settings
from app.services import activity_text, finance_transfers as ft
from app.services.supabase_service import SupabaseService

SECRET = "unit-test-jwt-secret-unit-test-jwt-secret"
ADMIN, ADMIN2, PARTNER, VIEWER = ("admin@example.com", "manager@example.com",
                                  "partner@example.com", "viewer@example.com")
P1, P2 = activity_text.PARTNERS[0], activity_text.PARTNERS[1]   # the existing partner list
URL = "/api/v1/finance/transfers"


@pytest.fixture
def client(monkeypatch, mock_service):
    rows = [
        {"email": ADMIN, "role": "admin", "display_name": P1, "active": True},
        {"email": ADMIN2, "role": "admin", "display_name": "מנהל", "active": True},
        {"email": PARTNER, "role": "partner", "display_name": P2, "active": True},
        {"email": VIEWER, "role": "viewer", "display_name": "צופה", "active": True},
    ]
    s = get_settings()
    monkeypatch.setattr(s, "SUPABASE_JWT_SECRET", SECRET)
    monkeypatch.setattr(s, "API_KEY", "server-to-server-key-0123456789abcdef")
    monkeypatch.setattr(du, "_fetch_rows", lambda: deepcopy(rows))
    auth._cache.clear()
    du.invalidate_cache()
    mock_service._stores["finance"] += [
        {"id": "f1", "Owner": P2, "Type": "income", "Amount": 10000, "Payment_Method": "מזומן"},
        {"id": "f2", "Owner": P1, "Type": "expense", "Amount": 3000, "Payment_Method": "חשבון"},
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


def body(**kw):
    b = {"transfer_date": "2026-10-08", "amount": 6000, "from_partner": P2, "from_pool": "מזומן",
         "to_partner": P1, "to_pool": "חשבון", "note": "בדיקה"}
    b.update(kw)
    return b


def summary(client):
    r = client.get("/api/v1/finance/summary", headers=H(ADMIN))
    assert r.status_code == 200
    return r.json()


# ─── pure logic ─────────────────────────────────────────

def test_validate_new_normalizes():
    row = ft.validate_new(body(amount="6000.004", note="  x  "))
    assert row == {"transfer_date": "2026-10-08", "amount": 6000.0, "from_partner": P2, "from_pool": "מזומן",
                   "to_partner": P1, "to_pool": "חשבון", "note": "x"}


@pytest.mark.parametrize("kw", [
    {"to_partner": P2},                    # same partner (no self transfers in v1)
    {"from_partner": "מישהו"},             # unknown partner
    {"from_pool": "אשראי"},                # only מזומן / חשבון
    {"amount": 0}, {"amount": -5}, {"amount": "abc"}, {"amount": None}, {"amount": "nan"},
    {"transfer_date": "08/10/2026"}, {"transfer_date": "2026-02-30"},
    {"note": "x" * 501},
])
def test_validate_new_rejects(kw):
    with pytest.raises(ft.TransferError):
        ft.validate_new(body(**kw))


def test_validate_update():
    cur = dict(ft.validate_new(body()), id="t1")
    assert ft.validate_update(cur, {"amount": 6000}) == {}
    assert ft.validate_update(cur, {"amount": 5000, "to_pool": "מזומן"}) == {"amount": 5000.0, "to_pool": "מזומן"}
    with pytest.raises(ft.TransferError):
        ft.validate_update(cur, {"to_partner": P2})          # would become a self transfer
    with pytest.raises(ft.TransferError):
        ft.validate_update(cur, {"created_by": "x"})          # not editable


def test_apply_to_summary_moves_balance_and_pools_only():
    s = {P2: {"income": 10000, "expenses": 0, "balance": 10000, "cash_balance": 10000, "bank_balance": 0},
         P1: {"income": 0, "expenses": 3000, "balance": -3000, "cash_balance": 0, "bank_balance": -3000}}
    before_total = sum(r["balance"] for r in s.values())
    ft.apply_to_summary(s, [ft.validate_new(body()),
                            dict(ft.validate_new(body(amount=999)), archived_at="2026-10-08T10:00:00")])
    assert s[P2]["cash_balance"] == 4000 and s[P2]["balance"] == 4000 and s[P2]["transfers_out"] == 6000
    assert s[P1]["bank_balance"] == 3000 and s[P1]["balance"] == 3000 and s[P1]["transfers_in"] == 6000
    for r in s.values():
        assert r["cash_balance"] + r["bank_balance"] == r["balance"]
    assert (s[P2]["income"], s[P2]["expenses"], s[P1]["income"], s[P1]["expenses"]) == (10000, 0, 0, 3000)
    assert sum(r["balance"] for r in s.values()) == before_total


def test_apply_to_summary_partner_without_finance_rows():
    s = ft.apply_to_summary({}, [ft.validate_new(body(amount=100))])
    assert s[P1]["balance"] == 100 and s[P1]["income"] == 0 and s[P2]["cash_balance"] == -100


# ─── real SupabaseService.get_finance_summary (deploy order safety) ──────

class _Q:
    def __init__(self, rows, fail=False):
        self.rows, self.fail = rows, fail
    def select(self, *a, **k): return self
    def is_(self, *a, **k): return self
    def order(self, *a, **k): return self
    def range(self, *a, **k): return self
    def execute(self):
        if self.fail:
            raise RuntimeError('relation "public.finance_transfers" does not exist')
        return type("R", (), {"data": self.rows})()


class _Client:
    def __init__(self, finance, transfers=None):
        self.finance, self.transfers = finance, transfers
    def table(self, name):
        if name == "finance":
            return _Q(self.finance)
        return _Q(self.transfers or [], fail=self.transfers is None)


def _svc(client):
    s = SupabaseService.__new__(SupabaseService)
    s.client = client
    return s


FIN = [{"id": "a", "Owner": P2, "Type": "income", "Amount": 10000, "Payment_Method": "מזומן"},
       {"id": "b", "Owner": P1, "Type": "expense", "Amount": 3000, "Payment_Method": "חשבון"}]


def test_summary_ignores_missing_table():
    s = _svc(_Client(FIN, transfers=None)).get_finance_summary()
    assert s[P2]["balance"] == 10000 and s[P1]["balance"] == -3000
    assert s[P2]["transfers_out"] == 0


def test_summary_applies_transfers():
    s = _svc(_Client(FIN, transfers=[ft.validate_new(body())])).get_finance_summary()
    assert s[P2]["cash_balance"] == 4000 and s[P2]["balance"] == 4000
    assert s[P1]["bank_balance"] == 3000 and s[P1]["balance"] == 3000
    assert s[P2]["income"] == 10000 and s[P1]["expenses"] == 3000


# ─── routes ────────────────────────────────────────────

def test_admin_creates_transfer_and_summary_moves(client, mock_service, audit_rows):
    before = summary(client)
    r = client.post(URL, json=body(), headers=H(ADMIN))
    assert r.status_code == 201, r.text
    t = r.json()
    assert t["created_by"] == ADMIN and t["amount"] == 6000 and t["id"]
    after = summary(client)
    assert after[P2]["cash_balance"] == before[P2]["cash_balance"] - 6000
    assert after[P2]["balance"] == before[P2]["balance"] - 6000
    assert after[P1]["bank_balance"] == before[P1]["bank_balance"] + 6000
    assert after[P1]["balance"] == before[P1]["balance"] + 6000
    for who in (P1, P2):
        assert after[who]["income"] == before[who]["income"]
        assert after[who]["expenses"] == before[who]["expenses"]
        assert after[who]["cash_balance"] + after[who]["bank_balance"] == after[who]["balance"]
    ev = [a for a in audit_rows if a["event"] == "finance_transfer_created"]
    assert len(ev) == 1 and ev[0]["email"] == ADMIN and ev[0]["detail"]["amount"] == 6000
    acts = mock_service._stores["activities"]
    assert acts[-1]["action_type"] == activity_text.TRANSFER_ACTION_TYPE and acts[-1]["actor"] == P1
    assert not activity_text.visible_to_viewer({"fields": acts[-1]})       # hidden from viewers
    assert mock_service._stores["finance"] and all(f["id"] in ("f1", "f2") for f in mock_service._stores["finance"])


def test_second_admin_account_can_create(client):
    assert client.post(URL, json=body(), headers=H(ADMIN2)).status_code == 201


def test_partner_reads_but_cannot_write(client, mock_service):
    t = client.post(URL, json=body(), headers=H(ADMIN)).json()
    r = client.get(URL, headers=H(PARTNER))
    assert r.status_code == 200 and [x["id"] for x in r.json()] == [t["id"]]
    assert client.post(URL, json=body(), headers=H(PARTNER)).status_code == 403
    assert client.patch(f"{URL}/{t['id']}", json={"amount": 1}, headers=H(PARTNER)).status_code == 403
    assert client.post(f"{URL}/{t['id']}/archive", headers=H(PARTNER)).status_code == 403
    assert len(mock_service._stores["finance_transfers"]) == 1
    assert mock_service._stores["finance_transfers"][0]["amount"] == 6000


def test_viewer_and_api_key_blocked(client):
    t = client.post(URL, json=body(), headers=H(ADMIN)).json()
    for m, path in (("get", URL), ("post", URL), ("patch", f"{URL}/{t['id']}"),
                    ("post", f"{URL}/{t['id']}/archive"), ("post", f"{URL}/{t['id']}/unarchive")):
        kw = {"json": body()} if m != "get" else {}
        assert getattr(client, m)(path, headers=H(VIEWER), **kw).status_code == 403, (m, path)
    key = {"X-API-Key": get_settings().API_KEY}
    assert client.post(URL, json=body(), headers=key).status_code == 403   # admin = a real person


def test_validation_errors(client):
    r = client.post(URL, json=body(to_partner=P2), headers=H(ADMIN))
    assert r.status_code == 400 and "שותפים שונים" in r.json()["detail"]
    assert client.post(URL, json=body(amount=0), headers=H(ADMIN)).status_code == 400
    assert client.post(URL, content="nope", headers={**H(ADMIN), "Content-Type": "application/json"}).status_code == 400


def test_edit_audits_before_after(client, audit_rows):
    t = client.post(URL, json=body(), headers=H(ADMIN)).json()
    r = client.patch(f"{URL}/{t['id']}", json={"amount": 5000, "to_pool": "מזומן"}, headers=H(ADMIN))
    assert r.status_code == 200 and r.json()["amount"] == 5000 and r.json()["updated_by"] == ADMIN
    ev = [a for a in audit_rows if a["event"] == "finance_transfer_updated"][0]
    assert ev["detail"]["before"] == {"amount": 6000.0, "to_pool": "חשבון"}
    assert ev["detail"]["after"] == {"amount": 5000.0, "to_pool": "מזומן"}
    s = summary(client)
    assert s[P1]["cash_balance"] == 5000
    assert client.patch(f"{URL}/{t['id']}", json={"id": "x"}, headers=H(ADMIN)).status_code == 400
    assert client.patch(f"{URL}/nope", json={"amount": 1}, headers=H(ADMIN)).status_code == 404


def test_archive_and_unarchive(client, audit_rows):
    before = summary(client)
    t = client.post(URL, json=body(), headers=H(ADMIN)).json()
    r = client.post(f"{URL}/{t['id']}/archive", json={"reason": "טעות"}, headers=H(ADMIN))
    assert r.status_code == 200 and r.json()["archived_at"] and r.json()["archive_reason"] == "טעות"
    assert summary(client)[P2]["balance"] == before[P2]["balance"]          # archived = not counted
    assert client.get(URL, headers=H(ADMIN)).json() == []
    assert len(client.get(URL, params={"include_archived": "true"}, headers=H(ADMIN)).json()) == 1
    assert client.patch(f"{URL}/{t['id']}", json={"amount": 1}, headers=H(ADMIN)).status_code == 409
    r = client.post(f"{URL}/{t['id']}/unarchive", headers=H(ADMIN))
    assert r.status_code == 200 and not r.json()["archived_at"]
    assert summary(client)[P2]["balance"] == before[P2]["balance"] - 6000
    events = [a["event"] for a in audit_rows if a["event"].startswith("finance_transfer_")]
    assert events == ["finance_transfer_created", "finance_transfer_archived", "finance_transfer_unarchived"]


def test_list_503_when_table_missing(client, mock_service):
    def boom(**kw):
        raise RuntimeError("relation does not exist")
    mock_service.get_finance_transfers = boom
    assert client.get(URL, headers=H(ADMIN)).status_code == 503


def test_bot_api_finance_summary_excludes_transfers(mock_service):
    from app.bot import data
    mock_service._stores["finance"] = [dict(FIN[0])]
    mock_service._stores["finance_transfers"] = [dict(ft.validate_new(body()), id="t1")]
    with patch.object(data, "db", mock_service):
        s = data.finance_summary(None)["data"]
    assert s["by_owner"][P2]["cash_balance"] == 10000 and P1 not in s["by_owner"]
