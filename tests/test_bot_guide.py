"""Self-description: /guide (JSON + markdown) and /openapi.json for tool import."""
import pytest
from fastapi.testclient import TestClient

from app.models.schemas import LeadStatus, ServiceType
from tests.bot_helpers import bot_env, hdr  # noqa: F401


@pytest.fixture
def c():
    from app.main import app
    return TestClient(app)


def test_guide_needs_key_by_default(bot_env, c):
    r = c.get("/api/bot/v1/guide")
    assert r.status_code == 401 and r.json()["error"]["code"] == "missing_key"
    assert c.get("/api/bot/v1/openapi.json").status_code == 401


def test_guide_content(bot_env, c):
    key = bot_env.table.add("grok", ["leads:read", "tasks:read"])
    r = c.get("/api/bot/v1/guide", headers=hdr(key))
    assert r.status_code == 200
    g = r.json()["data"]
    assert g["read_only"] is True and g["your_key"] == {"bot": "grok", "scopes": ["leads:read", "tasks:read"]}
    assert {s["code"] for s in g["domain"]["statuses"]} == {s.value for s in LeadStatus}
    assert all(s["he"] and s["meaning"] for s in g["domain"]["statuses"])
    assert {s["code"] for s in g["domain"]["services"]} == {s.value for s in ServiceType}
    eps = {e["path"]: e for e in g["endpoints"]}
    assert eps["/leads/{lead_id}/messages"]["scopes"] == ["leads:read", "messages:read"]
    assert eps["/finance/entries"]["scopes"] == ["finance:read"]
    assert all(e["summary"] for e in g["endpoints"])
    assert "notes:write" in g["scopes"]["planned_not_available"]
    assert g["how_to_call"]["base_url"].endswith("/api/bot/v1")
    # no business data / user identities in the guide
    for banned in ("אילן", "קובי", "@gmail.com", "9725"):
        assert banned not in r.text


def test_guide_markdown(bot_env, c):
    key = bot_env.table.add("grok", ["leads:read"])
    r = c.get("/api/bot/v1/guide?format=markdown", headers=hdr(key))
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/markdown")
    assert "## Endpoints (GET)" in r.text and "Quote_Sent" in r.text and "/attention" in r.text


def test_docs_public_mode(bot_env, c, monkeypatch):
    monkeypatch.setattr(bot_env.settings, "BOT_DOCS_PUBLIC", True)
    r = c.get("/api/bot/v1/guide")
    assert r.status_code == 200 and "your_key" not in r.json()["data"]
    assert c.get("/api/bot/v1/openapi.json").status_code == 200
    assert c.get("/api/bot/v1/guide", headers=hdr("hbk_bad")).status_code == 401  # a sent key is checked
    assert c.get("/api/bot/v1/leads").status_code == 401                          # data still needs a key


def test_docs_off_with_kill_switch(bot_env, c, monkeypatch):
    monkeypatch.setattr(bot_env.settings, "BOT_DOCS_PUBLIC", True)
    monkeypatch.setattr(bot_env.settings, "BOT_API_ENABLED", False)
    assert c.get("/api/bot/v1/guide").status_code == 503
    assert c.get("/api/bot/v1/openapi.json").status_code == 503


def test_openapi_spec(bot_env, c, monkeypatch):
    monkeypatch.setattr(bot_env.settings, "PUBLIC_BASE_URL", "https://api.example.test/")
    key = bot_env.table.add("grok", ["leads:read"])
    r = c.get("/api/bot/v1/openapi.json", headers=hdr(key))
    assert r.status_code == 200
    spec = r.json()
    assert spec["openapi"].startswith("3.") and spec["servers"] == [{"url": "https://api.example.test"}]
    assert spec["components"]["securitySchemes"]["botKey"] == {
        "type": "http", "scheme": "bearer", "description": "Per-bot key (hbk_...)"}
    assert spec["security"] == [{"botKey": []}]
    op_ids = []
    for path, item in spec["paths"].items():
        assert path.startswith("/api/bot/v1/")
        assert set(item) == {"get"}, path
        op = item["get"]
        op_ids.append(op["operationId"])
        assert op.get("summary") and op.get("tags")
        for code, resp in op["responses"].items():
            if code[0] in "45":
                assert resp["content"]["application/json"]["schema"] == {"$ref": "#/components/schemas/Error"}
    assert len(op_ids) == len(set(op_ids))
    assert {"listLeads", "getLead", "getLeadMessages", "getAttention", "getFinanceSummary", "getGuide"} <= set(op_ids)
    assert spec["paths"]["/api/bot/v1/leads/{lead_id}/messages"]["get"]["x-required-scopes"] == ["leads:read", "messages:read"]
    assert "/api/bot/v1/openapi.json" not in spec["paths"]
    assert "HTTPValidationError" not in r.text


def test_openapi_spec_is_valid():
    validator = pytest.importorskip("openapi_spec_validator")
    from app.api.bot_routes import bot_router, BOT_API_PREFIX
    from app.bot.guide import build_openapi
    validator.validate(build_openapi(bot_router, BOT_API_PREFIX, "https://x.test"))


def test_main_app_openapi_still_builds(c):
    assert c.get("/api/v1/openapi.json").status_code == 200
