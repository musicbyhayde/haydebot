"""public.dashboard_users as the source of dashboard users/roles, the temporary built-in
fallback (table missing/empty), the 60s cache and GET /api/v1/me."""
from unittest.mock import patch, MagicMock

import jwt
import pytest
import time
from fastapi.testclient import TestClient

from app.core import auth, dashboard_users as du
from app.core.config import get_settings

SECRET = "unit-test-jwt-secret-unit-test-jwt-secret"

ROWS = [
    {"email": "Ziv200@gmail.com", "role": "admin", "display_name": "אילן", "active": True},
    {"email": "kobile@gmail.com", "role": "partner", "display_name": "קובי", "active": True},
    {"email": "old@example.com", "role": "admin", "display_name": "ישן", "active": False},
    {"email": "new@example.com", "role": "partner", "display_name": "חדש", "active": True},
]


@pytest.fixture(autouse=True)
def _reset(monkeypatch):
    s = get_settings()
    monkeypatch.setattr(s, "API_KEY", "server-to-server-key-0123456789abcdef")
    monkeypatch.setattr(s, "SUPABASE_JWT_SECRET", SECRET)
    auth._cache.clear()
    du.invalidate_cache()
    yield
    auth._cache.clear()
    du.invalidate_cache()


def _rows(monkeypatch, rows=None, exc=None):
    calls = {"n": 0}

    def fetch():
        calls["n"] += 1
        if exc:
            raise exc
        return rows
    monkeypatch.setattr(du, "_fetch_rows", fetch)
    return calls


def _token(email):
    return jwt.encode({"sub": "u", "email": email, "aud": "authenticated",
                       "exp": int(time.time()) + 3600}, SECRET, algorithm="HS256")


def _client():
    from app.main import app
    return TestClient(app)


def _me(email):
    return _client().get("/api/v1/me", headers={"Authorization": f"Bearer {_token(email)}"})


# --- source of truth ------------------------------------------------------------------
def test_table_rows_are_used(monkeypatch):
    _rows(monkeypatch, ROWS)
    assert du.get_dashboard_user("ZIV200@gmail.com") == {
        "email": "ziv200@gmail.com", "role": "admin", "display_name": "אילן"}
    assert du.get_dashboard_user("new@example.com")["display_name"] == "חדש"
    assert du.get_dashboard_user("musicbyhayde@gmail.com") is None  # not in table -> no fallback
    assert du.current_source() == "table"


def test_inactive_user_is_rejected(monkeypatch):
    _rows(monkeypatch, ROWS)
    assert du.get_dashboard_user("old@example.com") is None
    assert _me("old@example.com").status_code == 403


def test_all_rows_inactive_means_nobody(monkeypatch):
    _rows(monkeypatch, [dict(r, active=False) for r in ROWS])
    assert du.get_dashboard_user("ziv200@gmail.com") is None


@pytest.mark.parametrize("kind", ["missing", "empty"])
def test_fallback_when_table_missing_or_empty(monkeypatch, kind):
    if kind == "missing":
        _rows(monkeypatch, exc=Exception("PGRST205 relation public.dashboard_users not found"))
    else:
        _rows(monkeypatch, [])
    assert du.get_dashboard_user("ziv200@gmail.com")["role"] == "admin"
    assert du.get_dashboard_user("kobile@gmail.com") == {
        "email": "kobile@gmail.com", "role": "partner", "display_name": "קובי"}
    assert du.get_dashboard_user("musicbyhayde@gmail.com")["display_name"] == "מנהל"
    assert du.get_dashboard_user("evil@x.com") is None
    assert du.current_source() != "table"


def test_fallback_matches_seed_sql():
    import pathlib, re
    sql = (pathlib.Path(__file__).parent.parent / "migrations" / "add_dashboard_users_table.sql").read_text()
    seeded = {e: {"role": r, "display_name": n}
              for e, r, n in re.findall(r"\('([^']+@[^']+)',\s*'(\w+)',\s*'([^']+)'\)", sql)}
    assert seeded == du._FALLBACK_USERS


def test_cache_60s(monkeypatch):
    calls = _rows(monkeypatch, ROWS)
    for _ in range(5):
        du.get_dashboard_user("ziv200@gmail.com")
    assert calls["n"] == 1
    du._state["expires"] = 0  # TTL passed
    du.get_dashboard_user("ziv200@gmail.com")
    assert calls["n"] == 2


def test_read_error_keeps_last_good_table(monkeypatch):
    _rows(monkeypatch, ROWS)
    du.get_dashboard_user("ziv200@gmail.com")
    du._state["expires"] = 0
    _rows(monkeypatch, exc=Exception("timeout"))
    assert du.get_dashboard_user("new@example.com") is not None   # still the table data
    assert du.get_dashboard_user("musicbyhayde@gmail.com") is None  # not the fallback
    assert du.current_source() == "table"


def test_fetch_rows_queries_dashboard_users_table():
    fake = MagicMock()
    fake.table.return_value.select.return_value.execute.return_value.data = ROWS
    with patch("app.services.supabase_service.supabase_service.client", fake):
        assert du._fetch_rows() == ROWS
    fake.table.assert_called_with("dashboard_users")


# --- /api/v1/me -----------------------------------------------------------------------
def test_me_returns_role_and_display_name(monkeypatch):
    _rows(monkeypatch, ROWS)
    r = _me("kobile@gmail.com")
    assert r.status_code == 200
    assert r.json() == {"email": "kobile@gmail.com", "role": "partner",
                        "display_name": "קובי", "auth_method": "jwt"}


def test_me_unknown_user_403(monkeypatch):
    _rows(monkeypatch, ROWS)
    assert _me("evil@x.com").status_code == 403


def test_me_without_credentials_403(monkeypatch):
    _rows(monkeypatch, ROWS)
    assert _client().get("/api/v1/me").status_code == 403


def test_me_with_server_key(monkeypatch):
    _rows(monkeypatch, ROWS)
    r = _client().get("/api/v1/me", headers={"X-API-Key": get_settings().API_KEY})
    assert r.status_code == 200
    assert r.json() == {"email": None, "role": "service", "display_name": None, "auth_method": "api_key"}


# --- admin-only endpoint uses the table role ------------------------------------------
def test_backup_role_from_table(monkeypatch):
    _rows(monkeypatch, [dict(ROWS[1], role="admin"), dict(ROWS[0], role="partner")])
    c = _client()
    r = c.get("/api/v1/backup/full", headers={"Authorization": f"Bearer {_token('ziv200@gmail.com')}"})
    assert r.status_code == 403  # ziv is 'partner' in this table
    with patch("requests.get") as g:
        g.side_effect = Exception("no network in tests")
        r = c.get("/api/v1/backup/full", headers={"Authorization": f"Bearer {_token('kobile@gmail.com')}"})
    assert r.status_code != 403  # passed the admin check


def test_leftover_env_lists_are_ignored(monkeypatch):
    monkeypatch.setenv("DASHBOARD_ALLOWED_EMAILS", "evil@x.com")
    monkeypatch.setenv("DASHBOARD_ADMIN_EMAILS", "evil@x.com")
    from app.core.config import Settings
    s = Settings()
    assert not hasattr(s, "DASHBOARD_ALLOWED_EMAILS")
    _rows(monkeypatch, ROWS)
    assert _me("evil@x.com").status_code == 403
