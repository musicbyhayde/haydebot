"""Fix #4: WhatsApp signature (log-only by default) + calendar channel token + debounce."""
import asyncio
import hashlib
import hmac
import json
from unittest.mock import patch, AsyncMock

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings

BODY = json.dumps({"object": "whatsapp_business_account", "entry": []}).encode()


@pytest.fixture
def s(monkeypatch):
    st = get_settings()
    monkeypatch.setattr(st, "META_APP_SECRET", None)
    monkeypatch.setattr(st, "WEBHOOK_SIGNATURE_ENFORCE", False)
    monkeypatch.setattr(st, "CALENDAR_WEBHOOK_ENFORCE", False)
    monkeypatch.setattr(st, "CALENDAR_WEBHOOK_TOKEN", None)
    return st


@pytest.fixture
def c():
    from app.main import app
    with patch("app.api.routes.bot_logic") as bl:
        bl.process_webhook = AsyncMock()
        bl.sync_calendar_rsvps = AsyncMock()
        yield TestClient(app), bl


def _sig(secret, body=BODY):
    return "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def post(client, headers=None):
    return client.post("/api/v1/webhook", content=BODY,
                       headers={"Content-Type": "application/json", **(headers or {})})


def test_no_secret_behaves_like_before(s, c):
    client, bl = c
    r = post(client)
    assert r.status_code == 200 and r.json() == {"status": "received"}
    bl.process_webhook.assert_called_once()
    assert bl.process_webhook.call_args.args[0] == json.loads(BODY)


def test_log_only_mode_accepts_bad_signature(s, c):
    s.META_APP_SECRET = "appsecret"
    client, bl = c
    assert post(client, {"X-Hub-Signature-256": "sha256=bad"}).status_code == 200
    assert post(client).status_code == 200
    assert bl.process_webhook.call_count == 2


def test_enforce_mode(s, c):
    s.META_APP_SECRET = "appsecret"
    s.WEBHOOK_SIGNATURE_ENFORCE = True
    client, bl = c
    assert post(client, {"X-Hub-Signature-256": "sha256=bad"}).status_code == 403
    assert post(client).status_code == 403
    assert post(client, {"X-Hub-Signature-256": _sig("appsecret")}).status_code == 200
    assert bl.process_webhook.call_count == 1


def test_invalid_json_unchanged(s, c):
    client, _ = c
    r = client.post("/api/v1/webhook", content=b"not json")
    assert r.status_code == 200 and r.json() == {"status": "error"}


def test_calendar_watch_registers_token(s):
    from app.services.google_calendar_service import google_calendar
    from app.core.webhook_security import calendar_channel_token
    captured = {}

    class Ev:
        def watch(self, calendarId, body):
            captured.update(body)
            class X:
                def execute(self_inner):
                    return {"expiration": "1"}
            return X()

    class Svc:
        def events(self):
            return Ev()

    with patch.object(google_calendar, "service", Svc()):
        google_calendar.watch_calendar("https://x/api/v1/webhooks/calendar")
    assert captured["token"] == calendar_channel_token() and len(captured["token"]) <= 256


def test_calendar_token_log_only_then_enforce(s, c):
    from app.core.webhook_security import calendar_channel_token
    client, bl = c
    h = {"X-Goog-Resource-State": "sync"}
    assert client.post("/api/v1/webhooks/calendar", headers=h).status_code == 200
    s.CALENDAR_WEBHOOK_ENFORCE = True
    assert client.post("/api/v1/webhooks/calendar", headers=h).status_code == 403
    h["X-Goog-Channel-Token"] = calendar_channel_token()
    assert client.post("/api/v1/webhooks/calendar", headers=h).status_code == 200


def test_calendar_sync_debounced(s, monkeypatch):
    import app.api.routes as routes
    monkeypatch.setattr(s, "CALENDAR_SYNC_MIN_INTERVAL", 0.05)
    routes._cal_sync.update(running=False, dirty=False, last=0.0)
    calls = []

    async def fake_sync():
        calls.append(1)
        await asyncio.sleep(0.02)

    async def burst():
        with patch.object(routes.bot_logic, "sync_calendar_rsvps", side_effect=fake_sync):
            tasks = [asyncio.create_task(routes._debounced_calendar_sync()) for _ in range(20)]
            await asyncio.gather(*tasks)

    asyncio.run(burst())
    assert len(calls) == 2  # 20 pushes -> first run + one trailing run
