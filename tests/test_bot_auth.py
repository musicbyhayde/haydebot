"""Bot API auth: kill switch, keys (missing / bad / revoked / expired), scopes, rate limits,
audit log, error format, and separation from the dashboard API."""
import subprocess
import sys
import pathlib

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from app.bot import errors, keys
from app.bot.auth import require_scopes
from app.bot.keyformat import hash_key
from tests.bot_helpers import bot_env, hdr, past, future  # noqa: F401

ROOT = pathlib.Path(__file__).resolve().parent.parent


@pytest.fixture
def client():
    from app.main import app
    return TestClient(app)


def err(r):
    body = r.json()
    assert set(body) == {"error"}, body
    assert body["error"]["status"] == r.status_code
    return body["error"]["code"]


# --- kill switch -------------------------------------------------------------------------
def test_kill_switch_off_by_default_and_not_audited(bot_env, client, monkeypatch):
    from app.core.config import Settings
    assert Settings().BOT_API_ENABLED is False  # default
    key = bot_env.table.add("grok", ["leads:read"])
    monkeypatch.setattr(bot_env.settings, "BOT_API_ENABLED", False)
    r = client.get("/api/bot/v1/whoami", headers=hdr(key))
    assert r.status_code == 503 and err(r) == "bot_api_disabled"
    assert bot_env.audited() == []
    assert bot_env.table.reads == 0  # key table not even read


# --- keys --------------------------------------------------------------------------------
def test_valid_key_whoami_and_audit(bot_env, client):
    key = bot_env.table.add("grok", ["leads:read", "finance:read", "bogus:scope"])
    r = client.get("/api/bot/v1/whoami?q=x&token=abc", headers={**hdr(key), "User-Agent": "grok-test"})
    assert r.status_code == 200
    assert r.json()["data"] == {"bot": "grok", "read_only": True,
                                "scopes": ["finance:read", "finance:summary", "leads:read"]}
    (row,) = bot_env.audited()
    assert row["bot_name"] == "grok" and row["key_id"] == "id-grok"
    assert row["status"] == 200 and row["method"] == "GET" and row["path"] == "/api/bot/v1/whoami"
    assert row["params"] == {"q": "x", "token": "[redacted]"}
    assert isinstance(row["latency_ms"], int) and row["error_code"] is None
    assert row["user_agent"] == "grok-test"
    assert key not in repr(row) and hash_key(key) not in repr(row)


def test_x_bot_key_header_also_works(bot_env, client):
    key = bot_env.table.add("n8n", ["leads:read"])
    assert client.get("/api/bot/v1/whoami", headers={"X-Bot-Key": key}).status_code == 200


def test_no_key(bot_env, client):
    r = client.get("/api/bot/v1/whoami")
    assert r.status_code == 401 and err(r) == "missing_key"
    assert r.headers["www-authenticate"] == "Bearer"
    (row,) = bot_env.audited()
    assert row["bot_name"] is None and row["status"] == 401 and row["error_code"] == "missing_key"


@pytest.mark.parametrize("bad", ["nope", "hbk_12345678_" + "a" * 43, "eyJhbGciOi.eyJzdWIi.sig"])
def test_bad_key(bot_env, client, bad):
    bot_env.table.add("grok", ["leads:read"])
    r = client.get("/api/bot/v1/whoami", headers=hdr(bad))
    assert r.status_code == 401 and err(r) == "invalid_key"


def test_revoked_key(bot_env, client):
    key = bot_env.table.add("old", ["leads:read"], active=False)
    r = client.get("/api/bot/v1/whoami", headers=hdr(key))
    assert r.status_code == 401 and err(r) == "invalid_key"
    assert bot_env.audited()[0]["bot_name"] == "old"


def test_revocation_applies_after_cache_ttl(bot_env, client):
    key = bot_env.table.add("grok", ["leads:read"])
    assert client.get("/api/bot/v1/whoami", headers=hdr(key)).status_code == 200
    bot_env.table.rows[0]["active"] = False
    assert client.get("/api/bot/v1/whoami", headers=hdr(key)).status_code == 200  # cached (<=60s)
    keys._state["expires"] = 0  # TTL passed
    assert client.get("/api/bot/v1/whoami", headers=hdr(key)).status_code == 401


def test_expired_key(bot_env, client):
    key = bot_env.table.add("tmp", ["leads:read"], expires_at=past())
    ok = bot_env.table.add("tmp2", ["leads:read"], expires_at=future())
    r = client.get("/api/bot/v1/whoami", headers=hdr(key))
    assert r.status_code == 401 and err(r) == "key_expired"
    assert client.get("/api/bot/v1/whoami", headers=hdr(ok)).status_code == 200


def test_missing_table_rejects_all(bot_env, client):
    key = bot_env.table.add("grok", ["leads:read"])
    bot_env.table.fail = Exception("{'code': 'PGRST205', 'message': \"Could not find the table 'public.bot_api_keys'\"}")
    r = client.get("/api/bot/v1/whoami", headers=hdr(key))
    assert r.status_code == 401


def test_key_store_down_fails_closed_but_uses_recent_copy(bot_env, client):
    key = bot_env.table.add("grok", ["leads:read"])
    bot_env.table.fail = TimeoutError("db down")
    r = client.get("/api/bot/v1/whoami", headers=hdr(key))
    assert r.status_code == 503 and err(r) == "key_store_unavailable"
    bot_env.table.fail = None
    assert client.get("/api/bot/v1/whoami", headers=hdr(key)).status_code == 200
    keys._state["expires"] = 0
    bot_env.table.fail = TimeoutError("db down")
    assert client.get("/api/bot/v1/whoami", headers=hdr(key)).status_code == 200  # recent copy


def test_last_used_is_throttled(bot_env, client):
    key = bot_env.table.add("grok", ["leads:read"])
    for _ in range(3):
        client.get("/api/bot/v1/whoami", headers=hdr(key))
    bot_env.audited()
    assert bot_env.touched == ["id-grok"]


# --- scopes ------------------------------------------------------------------------------
def test_wrong_scope(bot_env):
    app = FastAPI()
    errors.install(app)

    @app.get("/api/bot/v1/x")
    async def x(ctx=Depends(require_scopes("finance:read"))):
        return {"ok": True}
    c = TestClient(app)
    weak = bot_env.table.add("weak", ["finance:summary"])
    strong = bot_env.table.add("strong", ["finance:read"])
    r = c.get("/api/bot/v1/x", headers=hdr(weak))
    assert r.status_code == 403 and err(r) == "insufficient_scope" and "finance:read" in r.json()["error"]["message"]
    assert c.get("/api/bot/v1/x", headers=hdr(strong)).status_code == 200


# --- rate limits -------------------------------------------------------------------------
def test_per_key_rate_limit(bot_env, client):
    key = bot_env.table.add("chatty", ["leads:read"], rate_limit=2)
    other = bot_env.table.add("calm", ["leads:read"])
    assert client.get("/api/bot/v1/whoami", headers=hdr(key)).status_code == 200
    assert client.get("/api/bot/v1/whoami", headers=hdr(key)).status_code == 200
    r = client.get("/api/bot/v1/whoami", headers=hdr(key))
    assert r.status_code == 429 and err(r) == "rate_limited" and int(r.headers["retry-after"]) >= 1
    assert client.get("/api/bot/v1/whoami", headers=hdr(other)).status_code == 200


def test_default_rate_limit_from_env(bot_env, client, monkeypatch):
    monkeypatch.setattr(bot_env.settings, "BOT_RATE_LIMIT_PER_MINUTE", 1)
    key = bot_env.table.add("grok", ["leads:read"])
    assert client.get("/api/bot/v1/whoami", headers=hdr(key)).status_code == 200
    assert client.get("/api/bot/v1/whoami", headers=hdr(key)).status_code == 429


def test_anonymous_flood_is_limited_and_not_audited(bot_env, client, monkeypatch):
    monkeypatch.setattr(bot_env.settings, "BOT_ANON_RATE_LIMIT_PER_MINUTE", 3)
    codes = [client.get("/api/bot/v1/whoami", headers=hdr("x")).status_code for _ in range(6)]
    assert codes == [401, 401, 401, 429, 429, 429]
    assert len(bot_env.audited()) == 3


# --- error format / separation from dashboard API ----------------------------------------
def test_unknown_bot_path_uses_bot_error_format(bot_env, client):
    r = client.get("/api/bot/v1/does-not-exist")
    assert r.status_code == 404 and err(r) == "not_found"


def test_unknown_path_scan_audit_is_capped(bot_env, client, monkeypatch):
    monkeypatch.setattr(bot_env.settings, "BOT_ANON_RATE_LIMIT_PER_MINUTE", 3)
    for i in range(8):
        assert client.get(f"/api/bot/v1/scan-{i}").status_code == 404
    assert len(bot_env.audited()) == 3


def test_non_bot_paths_keep_default_errors(client):
    r = client.get("/api/v1/does-not-exist")
    assert r.status_code == 404 and "detail" in r.json()


def test_bot_key_not_accepted_on_dashboard_api(bot_env, client):
    key = bot_env.table.add("grok", ["leads:read", "finance:read", "pii:read"])
    for path in ("/api/v1/leads", "/api/v1/backup/full", "/api/v1/me"):
        assert client.get(path, headers=hdr(key)).status_code == 403
        assert client.get(path, headers={"X-API-Key": key}).status_code == 403
    r = client.post("/api/v1/leads/rec1/messages", headers=hdr(key), json={"content": "hi"})
    assert r.status_code == 403


def test_server_api_key_not_accepted_on_bot_api(bot_env, client, monkeypatch):
    monkeypatch.setattr(bot_env.settings, "API_KEY", "server-key-" + "x" * 30)
    r = client.get("/api/bot/v1/whoami", headers={"X-API-Key": bot_env.settings.API_KEY})
    assert r.status_code == 401
    r = client.get("/api/bot/v1/whoami", headers=hdr(bot_env.settings.API_KEY))
    assert r.status_code == 401


# --- CLI ---------------------------------------------------------------------------------
def _cli(*args):
    return subprocess.run([sys.executable, "scripts/bot_keys.py", *args], cwd=ROOT,
                          capture_output=True, text=True, env={"PATH": "/usr/bin:/bin"})


def test_cli_create_prints_key_once_and_sql_with_hash_only():
    r = _cli("create", "--name", "grok", "--scopes", "default", "--expires-days", "30")
    assert r.returncode == 0, r.stderr
    lines = r.stdout.splitlines()
    key = next(l for l in lines if l.startswith("hbk_"))
    assert keys.looks_like_key(key)
    sql = next(l for l in lines if l.startswith("insert into public.bot_api_keys"))
    assert hash_key(key) in sql and key not in sql and key[:12] in sql
    assert "'leads:read'" in sql and "finance:read" not in sql and "expires_at" in sql
    assert r.stdout.count(key) == 1


@pytest.mark.parametrize("scopes", ["notes:write", "whatsapp:send", "leads:read,nope"])
def test_cli_rejects_unknown_or_reserved_scopes(scopes):
    r = _cli("create", "--name", "grok", "--scopes", scopes)
    assert r.returncode != 0 and "hbk_" not in r.stdout


def test_cli_rejects_bad_name_and_revoke_sql():
    assert _cli("create", "--name", "Bad Name'; drop table x;--").returncode != 0
    r = _cli("revoke", "--name", "grok")
    assert r.stdout.strip() == "update public.bot_api_keys set active = false where name = 'grok';"
