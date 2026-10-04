"""Auth: Supabase user JWT for dashboard users + optional server-to-server API_KEY.
The old hard-coded shared key must be rejected everywhere."""
import time
from unittest.mock import patch, MagicMock

import jwt
import pytest
import requests
from fastapi import FastAPI, Depends
from fastapi.testclient import TestClient

from app.core import auth, dashboard_users
from app.core.config import get_settings

SECRET = "unit-test-jwt-secret-unit-test-jwt-secret"
OLD_PUBLIC_KEY = "some-shared-key-from-a-js-bundle"  # any shared key without API_KEY configured


@pytest.fixture(autouse=True)
def _reset(monkeypatch):
    s = get_settings()
    monkeypatch.setattr(s, "API_KEY", None)
    monkeypatch.setattr(s, "SUPABASE_JWT_SECRET", None)
    monkeypatch.setattr(dashboard_users, "_fetch_rows", lambda: [
        {"email": "ziv200@gmail.com", "role": "admin", "display_name": "אילן", "active": True},
        {"email": "kobile@gmail.com", "role": "partner", "display_name": "קובי", "active": True},
    ])
    auth._cache.clear()
    dashboard_users.invalidate_cache()
    yield s
    auth._cache.clear()
    dashboard_users.invalidate_cache()


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


# --- the old public key is gone --------------------------------------------------------
def test_old_public_key_rejected(client):
    assert client.get("/p", headers={"X-API-Key": OLD_PUBLIC_KEY}).status_code == 403


def test_old_key_rejected_even_with_leftover_transition_env(monkeypatch, client):
    # leftover env vars from the transition must be ignored, not re-enable anything
    monkeypatch.setenv("REQUIRE_USER_AUTH", "false")
    monkeypatch.setenv("LEGACY_DEFAULT_API_KEY_ENABLED", "true")
    from app.core.config import Settings
    s = Settings()
    assert not hasattr(s, "REQUIRE_USER_AUTH") and not hasattr(s, "LEGACY_DEFAULT_API_KEY_ENABLED")
    assert client.get("/p", headers={"X-API-Key": OLD_PUBLIC_KEY}).status_code == 403


def test_legacy_key_machinery_removed():
    from app.core import config
    assert not hasattr(config, "LEGACY_DEFAULT_API_KEY")
    assert not hasattr(auth, "legacy_key_accepted")
    assert set(auth._counts) == {"jwt", "api_key"}


def test_rejects_missing_or_wrong_key(client):
    assert client.get("/p").status_code == 403
    assert client.get("/p", headers={"X-API-Key": "nope"}).status_code == 403


def test_main_app_protected_routes_require_auth():
    from app.main import app
    c = TestClient(app)
    assert c.get("/api/v1/leads").status_code == 403
    assert c.get("/api/v1/finance", headers={"X-API-Key": OLD_PUBLIC_KEY}).status_code == 403


# --- JWT --------------------------------------------------------------------------
def test_jwt_local_secret(client, _reset):
    _reset.SUPABASE_JWT_SECRET = SECRET
    r = client.get("/p", headers={"Authorization": f"Bearer {_token()}"})
    assert r.json()["method"] == "jwt"


def test_jwt_expired_or_forged_rejected(client, _reset):
    _reset.SUPABASE_JWT_SECRET = SECRET
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


def test_supabase_down_gives_503(client):
    with patch("app.core.auth.requests.get", side_effect=requests.exceptions.Timeout()):
        r = client.get("/p", headers={"Authorization": f"Bearer {_token()}"})
    assert r.status_code == 503


def test_supabase_down_but_valid_server_key_still_works(client, _reset):
    _reset.API_KEY = "s" * 48
    with patch("app.core.auth.requests.get", side_effect=requests.exceptions.Timeout()):
        r = client.get("/p", headers={"Authorization": f"Bearer {_token()}", "X-API-Key": "s" * 48})
    assert r.json()["method"] == "api_key"


# --- server-to-server key ---------------------------------------------------------------
def test_strong_api_key_accepted(client, _reset):
    _reset.API_KEY = "s" * 48
    assert client.get("/p", headers={"X-API-Key": "s" * 48}).json()["method"] == "api_key"
    assert client.get("/p", headers={"X-API-Key": OLD_PUBLIC_KEY}).status_code == 403


def test_no_api_key_configured_means_no_key_accepted(client):
    assert client.get("/p", headers={"X-API-Key": ""}).status_code == 403


def test_cors_preflight_allows_authorization_header():
    from app.main import app
    c = TestClient(app)
    r = c.options("/api/v1/leads", headers={
        "Origin": "https://haydebot.vercel.app",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "authorization",
    })
    assert r.status_code == 200
    assert "authorization" in r.headers.get("access-control-allow-headers", "").lower()


# --- /backup/full -------------------------------------------------------------------
def _backup_client():
    from app.main import app
    return TestClient(app)


def test_backup_rejects_old_key():
    r = _backup_client().get("/api/v1/backup/full", headers={"X-API-Key": OLD_PUBLIC_KEY})
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
