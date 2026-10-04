"""Fix #1: dual-mode auth (Supabase JWT + server key + legacy key during transition)."""
import time
from unittest.mock import patch, MagicMock

import jwt
import pytest
import requests
from fastapi import FastAPI, Depends
from fastapi.testclient import TestClient

from app.core import auth
from app.core.config import get_settings, LEGACY_DEFAULT_API_KEY

SECRET = "unit-test-jwt-secret-unit-test-jwt-secret"


@pytest.fixture(autouse=True)
def _reset(monkeypatch):
    s = get_settings()
    monkeypatch.setattr(s, "API_KEY", None)
    monkeypatch.setattr(s, "LEGACY_DEFAULT_API_KEY_ENABLED", True)
    monkeypatch.setattr(s, "REQUIRE_USER_AUTH", False)
    monkeypatch.setattr(s, "SUPABASE_JWT_SECRET", None)
    monkeypatch.setattr(s, "DASHBOARD_ALLOWED_EMAILS", "ziv200@gmail.com,kobile@gmail.com")
    auth._cache.clear()
    yield s
    auth._cache.clear()


@pytest.fixture
def client():
    app = FastAPI()

    @app.get("/p")
    async def p(method: str = Depends(auth.require_auth)):
        return {"method": method}

    return TestClient(app)


def _token(email="ziv200@gmail.com", exp_in=3600, secret=SECRET, aud="authenticated"):
    return jwt.encode({"sub": "u1", "email": email, "aud": aud, "exp": int(time.time()) + exp_in},
                      secret, algorithm="HS256")


# --- default config == today's behaviour --------------------------------------------
def test_default_accepts_legacy_key(client):
    r = client.get("/p", headers={"X-API-Key": LEGACY_DEFAULT_API_KEY})
    assert r.status_code == 200 and r.json()["method"] == "legacy_key"


def test_rejects_missing_or_wrong_key(client):
    assert client.get("/p").status_code == 403
    assert client.get("/p", headers={"X-API-Key": "nope"}).status_code == 403


def test_main_app_protected_routes_use_new_dependency():
    from app.main import app
    c = TestClient(app)
    assert c.get("/api/v1/leads").status_code == 403
    assert c.get("/api/v1/finance").status_code == 403


# --- JWT --------------------------------------------------------------------------
def test_jwt_local_secret(client, _reset):
    _reset.SUPABASE_JWT_SECRET = SECRET
    r = client.get("/p", headers={"Authorization": f"Bearer {_token()}"})
    assert r.json()["method"] == "jwt"


def test_jwt_expired_or_forged_rejected(client, _reset):
    _reset.SUPABASE_JWT_SECRET = SECRET
    _reset.LEGACY_DEFAULT_API_KEY_ENABLED = False
    assert client.get("/p", headers={"Authorization": f"Bearer {_token(exp_in=-10)}"}).status_code == 403
    assert client.get("/p", headers={"Authorization": f"Bearer {_token(secret='x'*40)}"}).status_code == 403
    assert client.get("/p", headers={"Authorization": f"Bearer {_token(aud='anon')}"}).status_code == 403


def test_jwt_user_not_allowlisted(client, _reset):
    _reset.SUPABASE_JWT_SECRET = SECRET
    r = client.get("/p", headers={"Authorization": f"Bearer {_token(email='evil@x.com')}"})
    assert r.status_code == 403


def test_jwt_remote_verification_and_cache(client):
    ok = MagicMock(status_code=200)
    ok.json.return_value = {"email": "Kobile@gmail.com"}
    tok = _token(secret="whatever-the-project-uses-xxxxxxxxxx")
    with patch("app.core.auth.requests.get", return_value=ok) as g:
        for _ in range(3):
            assert client.get("/p", headers={"Authorization": f"Bearer {tok}"}).json()["method"] == "jwt"
    assert g.call_count == 1  # cached
    assert g.call_args.kwargs["timeout"]


def test_bad_jwt_falls_back_to_legacy_key_during_transition(client):
    bad = MagicMock(status_code=401)
    with patch("app.core.auth.requests.get", return_value=bad):
        r = client.get("/p", headers={"Authorization": f"Bearer {_token()}",
                                      "X-API-Key": LEGACY_DEFAULT_API_KEY})
    assert r.json()["method"] == "legacy_key"


def test_supabase_down_falls_back_to_key_then_503(client, _reset):
    with patch("app.core.auth.requests.get", side_effect=requests.exceptions.Timeout()):
        r = client.get("/p", headers={"Authorization": f"Bearer {_token()}",
                                      "X-API-Key": LEGACY_DEFAULT_API_KEY})
        assert r.json()["method"] == "legacy_key"
        auth._cache.clear()
        _reset.REQUIRE_USER_AUTH = True
        r = client.get("/p", headers={"Authorization": f"Bearer {_token()}"})
        assert r.status_code == 503


# --- rotation end-state -------------------------------------------------------------
def test_strong_api_key_accepted(client, _reset):
    _reset.API_KEY = "s" * 48
    assert client.get("/p", headers={"X-API-Key": "s" * 48}).json()["method"] == "api_key"


def test_require_user_auth_disables_legacy_key(client, _reset):
    _reset.REQUIRE_USER_AUTH = True
    _reset.API_KEY = "s" * 48
    assert client.get("/p", headers={"X-API-Key": LEGACY_DEFAULT_API_KEY}).status_code == 403
    assert client.get("/p", headers={"X-API-Key": "s" * 48}).status_code == 200


def test_legacy_flag_off_disables_legacy_key(client, _reset):
    _reset.LEGACY_DEFAULT_API_KEY_ENABLED = False
    assert client.get("/p", headers={"X-API-Key": LEGACY_DEFAULT_API_KEY}).status_code == 403


def test_explicit_api_key_equal_to_legacy_value_is_honoured(client, _reset):
    # Operator explicitly set API_KEY to the old value: honoured (startup prints a warning).
    _reset.API_KEY = LEGACY_DEFAULT_API_KEY
    _reset.LEGACY_DEFAULT_API_KEY_ENABLED = False
    assert client.get("/p", headers={"X-API-Key": LEGACY_DEFAULT_API_KEY}).status_code == 200


def test_cors_preflight_allows_authorization_header():
    from app.main import app
    c = TestClient(app)
    r = c.options("/api/v1/leads", headers={
        "Origin": "https://haydebot.vercel.app",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "authorization,x-api-key",
    })
    assert r.status_code == 200
    assert "authorization" in r.headers.get("access-control-allow-headers", "").lower()


# --- /backup/full -------------------------------------------------------------------
def _backup_client():
    from app.main import app
    return TestClient(app)


def test_backup_rejects_legacy_key():
    r = _backup_client().get("/api/v1/backup/full", headers={"X-API-Key": LEGACY_DEFAULT_API_KEY})
    assert r.status_code == 403


def test_backup_rejects_partner_jwt(_reset):
    _reset.SUPABASE_JWT_SECRET = SECRET
    r = _backup_client().get("/api/v1/backup/full",
                             headers={"Authorization": f"Bearer {_token('kobile@gmail.com')}"})
    assert r.status_code == 403


def test_backup_allows_admin_jwt(_reset):
    _reset.SUPABASE_JWT_SECRET = SECRET
    fake = MagicMock(status_code=200)
    fake.json.return_value = {"definitions": {}}
    fake.raise_for_status.return_value = None
    with patch("app.api.routes.requests.get", return_value=fake):
        r = _backup_client().get("/api/v1/backup/full",
                                 headers={"Authorization": f"Bearer {_token('ziv200@gmail.com')}"})
    assert r.status_code == 200
