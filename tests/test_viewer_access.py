"""Read-only viewer role (viewer access plan, Ilan 2026-10-05): deny by default in require_auth,
GET allowlist, every route classified, data trimming for viewers, audit rows."""
import re
import time
from copy import deepcopy
from unittest.mock import patch

import jwt
import pytest
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient

from app.core import auth, dashboard_users as du, permissions
from app.core.config import get_settings

SECRET = "unit-test-jwt-secret-unit-test-jwt-secret"
ADMIN, PARTNER, VIEWER, OFF, ODD = ("admin@example.com", "partner@example.com", "viewer@example.com",
                                    "off@example.com", "odd@example.com")


@pytest.fixture
def rows():
    return [
        {"email": ADMIN, "role": "admin", "display_name": "אילן", "active": True},
        {"email": PARTNER, "role": "partner", "display_name": "קובי", "active": True},
        {"email": VIEWER, "role": "viewer", "display_name": "רוני", "active": True},
        {"email": OFF, "role": "viewer", "display_name": "כבוי", "active": False},
        {"email": ODD, "role": "superuser", "display_name": "מוזר", "active": True},
    ]


@pytest.fixture
def client(monkeypatch, mock_service, rows):
    s = get_settings()
    monkeypatch.setattr(s, "SUPABASE_JWT_SECRET", SECRET)
    monkeypatch.setattr(s, "API_KEY", "server-to-server-key-0123456789abcdef")
    monkeypatch.setattr(du, "_fetch_rows", lambda: deepcopy(rows))
    auth._cache.clear()
    du.invalidate_cache()
    with patch("app.api.routes.airtable_service", mock_service), patch("app.core.scheduler.scheduler"):
        from app.main import app
        yield TestClient(app, raise_server_exceptions=False)
    auth._cache.clear()
    du.invalidate_cache()


def H(email):
    tok = jwt.encode({"sub": "u", "email": email, "aud": "authenticated", "exp": int(time.time()) + 3600},
                     SECRET, algorithm="HS256")
    return {"Authorization": f"Bearer {tok}"}


def _protected_routes():
    """(method, path) of every /api/v1 route that requires auth; path relative to /api/v1."""
    from app.main import app
    from app.api.routes import public_router
    public = {r.path for r in public_router.routes}
    out = []
    for full, ops in app.openapi()["paths"].items():
        if not full.startswith("/api/v1/"):
            continue
        p = full[len("/api/v1"):]
        if p in public:
            continue
        for m in ops:
            if m.upper() in ("GET", "POST", "PUT", "PATCH", "DELETE"):
                out.append((m.upper(), p))
    return sorted(out)


def _url(path):
    return re.sub(r"\{(\w+)\}", lambda m: "x@example.com" if m.group(1) == "email" else "rec_nope", path)


# ── classification ──────────────────────────────────────

def test_every_protected_get_route_is_classified():
    routes = _protected_routes()
    assert len(routes) > 50
    unclassified = [p for m, p in routes if m == "GET"
                    and p not in permissions.VIEWER_GET_ALLOWED and p not in permissions.VIEWER_GET_DENIED]
    assert not unclassified, f"classify these GET routes in app/core/permissions.py: {unclassified}"


def test_permission_sets_are_consistent():
    gets = {p for m, p in _protected_routes() if m == "GET"}
    assert not (permissions.VIEWER_GET_ALLOWED & permissions.VIEWER_GET_DENIED)
    assert permissions.VIEWER_GET_ALLOWED <= gets, "stale allowlist entry"
    assert permissions.VIEWER_GET_DENIED <= gets, "stale denylist entry"
    for m, p in permissions.VIEWER_NOOP:
        assert (m, p) in _protected_routes()


def test_finance_and_admin_never_allowed():
    for p in ("/finance", "/finance/summary", "/backup/full", "/admin/users"):
        assert not permissions.viewer_may("GET", p)
    assert not permissions.viewer_may("POST", "/leads/{lead_id}/notes")
    assert permissions.strip_prefix("/api/v1/leads") == "/leads"
    assert permissions.strip_prefix("/leads") == "/leads"
    assert not permissions.viewer_may("GET", None)


# ── behaviour for every route ───────────────────────────

def test_viewer_is_blocked_everywhere_except_allowlist(client, mock_service):
    mock_service._stores["leads"].append({"id": "rec_nope", "Phone": "9725", "Status": "New"})
    before = deepcopy(mock_service._stores)
    checked = 0
    for method, path in _protected_routes():
        r = client.request(method, "/api/v1" + _url(path), headers=H(VIEWER), json={})
        if permissions.viewer_may(method, path):
            assert r.status_code != 403, (method, path, r.text)
        else:
            assert r.status_code == 403, (method, path, r.status_code)
            assert r.json()["detail"] == permissions.VIEWER_DENIED_DETAIL
        checked += 1
    assert checked > 50
    assert mock_service._stores == before, "a viewer request changed data"


def test_partner_and_admin_keep_full_access(client, mock_service):
    mock_service._stores["leads"].append({"id": "rec_l1", "Phone": "9725", "Status": "New"})
    for who in (PARTNER, ADMIN):
        r = client.post("/api/v1/leads/rec_l1/notes", headers=H(who), json={"content": "x", "author": "קובי"})
        assert r.status_code in (200, 201), r.text
        assert client.get("/api/v1/finance", headers=H(who)).status_code == 200


def test_unknown_role_and_disabled_viewer_rejected(client):
    assert client.get("/api/v1/me", headers=H(ODD)).status_code == 403
    assert client.get("/api/v1/leads", headers=H(OFF)).status_code == 403


def test_me_reports_viewer(client):
    r = client.get("/api/v1/me", headers=H(VIEWER))
    assert r.status_code == 200
    assert r.json()["role"] == "viewer" and r.json()["display_name"] == "רוני"


def test_revocation_is_immediate(client, rows, monkeypatch):
    assert client.get("/api/v1/leads", headers=H(VIEWER)).status_code == 200
    rows[2]["active"] = False
    du.invalidate_cache()      # what user_admin does after every change
    assert client.get("/api/v1/leads", headers=H(VIEWER)).status_code == 403


# ── data trimming ───────────────────────────────────────

def test_lead_finance_endpoint(client, mock_service):
    mock_service._stores["finance"] += [
        {"id": "f1", "Lead_ID": "rec_a", "Amount": 100, "Date": "2026-01-01"},
        {"id": "f2", "Lead_ID": "rec_b", "Amount": 200, "Date": "2026-01-02"},
        {"id": "f3", "Amount": 300, "Date": "2026-01-03"},
    ]
    r = client.get("/api/v1/leads/rec_a/finance", headers=H(VIEWER))
    assert r.status_code == 200
    assert [e["id"] for e in r.json()] == ["f1"]
    assert client.get("/api/v1/finance", headers=H(VIEWER)).status_code == 403
    assert client.get("/api/v1/finance/summary", headers=H(VIEWER)).status_code == 403


def test_activities_hide_finance_without_lead_for_viewer(client, mock_service):
    mock_service._stores["activities"] = [
        {"id": "a1", "action_type": "הוצאה", "description": "הזין/ה 500 ₪ (שכירות)", "lead_id": None},
        {"id": "a2", "action_type": "הכנסה/הוצאה", "description": "הזין/ה 5000 ₪", "lead_id": "rec_a"},
        {"id": "a3", "action_type": "שינוי סטטוס", "description": "x", "lead_id": "rec_a"},
    ]
    ids = lambda r: sorted(a["id"] for a in r.json())
    assert ids(client.get("/api/v1/activities", headers=H(VIEWER))) == ["a2", "a3"]
    assert ids(client.get("/api/v1/activities", headers=H(PARTNER))) == ["a1", "a2", "a3"]


def test_mark_read_is_noop_for_viewer(client, mock_service):
    mock_service._stores["leads"].append({"id": "rec_r", "Phone": "9725", "Status": "New"})
    r = client.post("/api/v1/leads/rec_r/read", headers=H(VIEWER))
    assert r.status_code == 200 and r.json()["status"] == "skipped"
    assert "Last_Read_At" not in mock_service._stores["leads"][0]
    assert client.post("/api/v1/leads/rec_r/read", headers=H(PARTNER)).json()["status"] == "success"
    assert mock_service._stores["leads"][0].get("Last_Read_At")


# ── audit ───────────────────────────────────────────────

def test_audit_session_once_per_day_and_blocked_rows(client, audit_rows):
    client.get("/api/v1/leads", headers=H(VIEWER))
    client.get("/api/v1/tasks", headers=H(VIEWER))
    client.post("/api/v1/leads/rec_x/notes", headers=H(VIEWER), json={"content": "x"})
    sessions = [r for r in audit_rows if r["event"] == "session"]
    blocked = [r for r in audit_rows if r["event"] == "blocked"]
    assert len(sessions) == 1 and sessions[0]["email"] == VIEWER and sessions[0]["role"] == "viewer"
    assert len(blocked) == 1
    assert blocked[0]["method"] == "POST" and blocked[0]["path"] == "/leads/{lead_id}/notes"


def test_audit_failure_never_breaks_requests(client, monkeypatch):
    from app.core import audit_log

    def boom(row):
        raise RuntimeError("table missing")
    monkeypatch.setattr(audit_log, "_insert", boom)
    assert client.get("/api/v1/leads", headers=H(VIEWER)).status_code == 200
    assert client.post("/api/v1/leads/rec_x/notes", headers=H(VIEWER), json={}).status_code == 403


def test_api_key_caller_unaffected(client):
    r = client.get("/api/v1/finance", headers={"X-API-Key": "server-to-server-key-0123456789abcdef"})
    assert r.status_code == 200


def test_musicians_trimmed_for_viewer(client, mock_service):
    full = client.get("/api/v1/musicians", headers=H(PARTNER)).json()
    assert full and "Phone" in full[0]["fields"]
    trimmed = client.get("/api/v1/musicians", headers=H(VIEWER)).json()
    assert trimmed[0]["id"] == full[0]["id"]
    assert set(trimmed[0]["fields"]) == {"Name", "Type", "Is_Active"}
    assert trimmed[0]["fields"]["Name"] == full[0]["fields"]["Name"]
