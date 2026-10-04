"""Fix #3 (failed sends reported as sent) and fix #8 (manual reply overwrites status)."""
from unittest.mock import patch, MagicMock
import pytest

from app.services.whatsapp import send_failed, describe_send_error

OK = {"messaging_product": "whatsapp", "messages": [{"id": "wamid.ABC"}]}
WINDOW = {"error": "400 Client Error", "error_code": 131047, "error_message": "Re-engagement message"}


def test_send_failed_classification():
    assert not send_failed(OK)
    assert send_failed({"error": "x"})
    assert send_failed(None)
    assert send_failed({})
    assert "24" in describe_send_error(WINDOW)


def test_whatsapp_service_extracts_meta_error_code():
    import requests
    from app.services.whatsapp import whatsapp_service
    resp = MagicMock()
    resp.text = '{"error":{"code":131047}}'
    resp.json.return_value = {"error": {"code": 131047, "message": "Re-engagement message"}}
    err = requests.exceptions.HTTPError("400 Client Error", response=resp)
    resp.raise_for_status.side_effect = err
    with patch("app.services.whatsapp.requests.post", return_value=resp):
        res = whatsapp_service.send_message("972500000000", "hi")
    assert res["error_code"] == 131047 and "error" in res


# --- logic._send_message stores Failed --------------------------------------------
@pytest.mark.parametrize("wa_res,expected", [(OK, "Sent"), (WINDOW, "Failed")])
def test_logic_send_message_logs_status(wa_res, expected):
    from app.services import logic
    stored = []
    with patch.object(logic.whatsapp_service, "send_message", return_value=wa_res), \
         patch.object(logic.airtable_service, "create_message", side_effect=lambda m: stored.append(m)):
        res = logic.bot_logic._send_message("972500000000", "hello", lead_id="rec1")
    assert res == wa_res
    assert stored[0].status == expected and stored[0].content == "hello"


def test_logic_failed_status_fallback_marker_if_db_rejects():
    from app.services import logic
    stored = []

    def create(m):
        if m.status == "Failed":
            raise Exception("check constraint")
        stored.append(m)

    with patch.object(logic.whatsapp_service, "send_message", return_value=WINDOW), \
         patch.object(logic.airtable_service, "create_message", side_effect=create):
        logic.bot_logic._send_message("972500000000", "hello", lead_id="rec1")
    assert stored[0].content.startswith("⚠️ לא נשלח")


def test_logic_interactive_failed():
    from app.services import logic
    stored = []
    with patch.object(logic.whatsapp_service, "send_interactive_buttons", return_value={"error": "x"}), \
         patch.object(logic.airtable_service, "create_message", side_effect=lambda m: stored.append(m)):
        logic.bot_logic._send_interactive("9725", "t", "b", "B", musician_id="m1")
    assert stored[0].status == "Failed"


# --- routes ---------------------------------------------------------------------
@pytest.fixture
def client(test_client):
    return test_client


def _make_lead(client, status):
    lead_id = client.post("/api/v1/leads", json={"Phone": "972501111111"}).json()["id"]
    if status:
        client.patch(f"/api/v1/leads/{lead_id}", json={"Status": status})
    return lead_id


def _status(client, lead_id):
    leads = client.get("/api/v1/leads").json()
    return next(l for l in leads if l["id"] == lead_id)["fields"]


def test_manual_message_failure_returns_502_and_keeps_status(client):
    import app.api.routes as routes
    lead_id = _make_lead(client, "Quote_Sent")
    routes.bot_logic._send_message.return_value = WINDOW
    r = client.post(f"/api/v1/leads/{lead_id}/messages", json={"text": "hi"})
    assert r.status_code == 502 and "24" in r.json()["detail"]
    f = _status(client, lead_id)
    assert f["Status"] == "Quote_Sent" and not f.get("Bot_Mute_Until")


@pytest.mark.parametrize("before,after", [
    ("Closed", "Closed"), ("Quote_Sent", "Quote_Sent"), ("Waiting_Payment", "Waiting_Payment"),
    ("Completed", "Completed"), ("Assigned", "Assigned"), ("Distributed", "Distributed"),
    ("New", "Manual"), ("Talking", "Manual"), ("Processing", "Manual"), ("Lost", "Manual"),
])
def test_manual_message_success_status_rules(client, before, after):
    import app.api.routes as routes
    lead_id = _make_lead(client, before)
    routes.bot_logic._send_message.return_value = OK
    r = client.post(f"/api/v1/leads/{lead_id}/messages", json={"text": "hi"})
    assert r.status_code == 200 and r.json() == {"status": "sent"}
    f = _status(client, lead_id)
    assert f["Status"] == after
    assert f.get("Bot_Mute_Until")


def test_send_intro_failure_502_and_no_history(client, mock_service):
    lead_id = _make_lead(client, None)
    with patch("app.services.whatsapp.whatsapp_service.send_template", return_value={"error": "x"}):
        r = client.post(f"/api/v1/leads/{lead_id}/send-intro", json={"video_urls": []})
    assert r.status_code == 502
    assert mock_service._stores["messages"] == []


def test_send_intro_success_unchanged(client):
    lead_id = _make_lead(client, None)
    with patch("app.services.whatsapp.whatsapp_service.send_template", return_value=OK):
        r = client.post(f"/api/v1/leads/{lead_id}/send-intro", json={"video_urls": []})
    assert r.status_code == 200 and r.json()["status"] == "success"
