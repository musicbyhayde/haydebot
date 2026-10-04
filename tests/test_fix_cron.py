"""Cron endpoint: no hard-coded fallback secret, no admin phone numbers in the response."""
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient


def _client():
    from app.main import app
    return TestClient(app)


def test_cron_rejects_old_fallback_secret(monkeypatch):
    monkeypatch.setenv("CRON_SECRET", "real-secret")
    r = _client().get("/api/v1/cron/reminders", headers={"Authorization": "Bearer haydebot_cron_secret"})
    assert r.status_code == 401


def test_cron_disabled_without_secret(monkeypatch):
    monkeypatch.delenv("CRON_SECRET", raising=False)
    r = _client().get("/api/v1/cron/reminders", headers={"Authorization": "Bearer haydebot_cron_secret"})
    assert r.status_code == 503


def test_cron_response_has_no_raw_numbers(monkeypatch):
    from app.core.config import get_settings
    monkeypatch.setenv("CRON_SECRET", "real-secret")
    monkeypatch.setattr(get_settings(), "NOTIFICATION_NUMBERS", "972501112233")
    svc = MagicMock()
    for m in ("get_followup_notes_for_today", "get_pending_followups", "get_tasks", "get_all_leads",
              "get_active_leads", "get_overdue_followups"):
        getattr(svc, m).return_value = []
    with patch("app.services.supabase_service.supabase_service", svc), \
         patch("app.services.whatsapp.whatsapp_service.send_template",
               return_value={"messages": [{"id": "w"}]}):
        r = _client().get("/api/v1/cron/reminders", headers={"Authorization": "Bearer real-secret"})
    assert r.status_code == 200, r.text
    assert "972501112233" not in r.text and "raw_numbers_env" not in r.text
