"""Admin alert for a customer writing while the bot is muted (human takeover) goes out with the
approved admin_system_alert_v2 template, not free text (Meta rejects free text outside 24h)."""
import asyncio
from datetime import datetime, timedelta, timezone
from unittest.mock import patch, AsyncMock, MagicMock

import pytest

from app.services import logic

PHONE = "972501234567"
ADMINS = "972500000001, 972500000002"


def _muted_run(text="מתי אתם מגיעים?", media_url=None, status="Manual", name_field="דנה",
               admins=ADMINS, muted=True):
    until = datetime.now(timezone.utc) + (timedelta(hours=10) if muted else -timedelta(hours=1))
    fields = {"Phone": PHONE, "Status": status, "Conversation_State": "COMPLETED",
              "Bot_Mute_Until": until.isoformat()}
    if name_field:
        fields["Name"] = name_field
    lead = {"id": "rec1", "fields": fields}
    svc = MagicMock()
    svc.get_all_musicians.return_value = []
    svc.is_message_processed.return_value = False
    bl = logic.bot_logic
    with patch.object(logic, "airtable_service", svc), \
         patch.object(logic.settings, "NOTIFICATION_NUMBERS", admins), \
         patch.object(bl, "get_active_lead_robust", return_value=lead), \
         patch.object(bl, "handle_reset_command", new=AsyncMock()) as reset, \
         patch.object(bl, "_send_message") as bot_reply, \
         patch.object(logic.whatsapp_service, "send_template") as tpl, \
         patch.object(logic.whatsapp_service, "send_message") as free:
        asyncio.run(bl.handle_incoming_message(PHONE, "Dana WA", text, None, media_url=media_url))
    return tpl, free, bot_reply, reset, svc


def test_muted_alert_uses_admin_template_for_every_admin():
    tpl, free, bot_reply, reset, svc = _muted_run()
    free.assert_not_called()
    assert {c.args[0] for c in tpl.call_args_list} == {"972500000001", "972500000002"}
    for c in tpl.call_args_list:
        assert c.args[1:3] == ("admin_system_alert_v2", "he")
        title, body = c.kwargs["parameters"]
        assert title == "הודעה חדשה בצאט ידני"
        for piece in ("דנה", PHONE, "Manual", "מתי אתם מגיעים?", "בצאט ידני"):
            assert piece in body
        assert "\n" not in body and "    " not in body
    bot_reply.assert_not_called()          # bot stays silent, as before
    reset.assert_not_awaited()


def test_muted_alert_media_and_whatsapp_name_fallback():
    tpl, *_ = _muted_run(text="[IMAGE RECEIVED]", media_url="https://x/m.jpg", name_field=None)
    body = tpl.call_args.kwargs["parameters"][1]
    assert "[מדיה]" in body and "Dana WA" in body


def test_muted_alert_long_multiline_text_is_sanitized_and_truncated():
    tpl, *_ = _muted_run(text="שורה\nשניה\t" + "א" * 1000)
    body = tpl.call_args.kwargs["parameters"][1]
    assert "\n" not in body and "\t" not in body and len(body) < 600


def test_muted_alert_skipped_without_admin_numbers():
    tpl, free, *_ = _muted_run(admins="")
    tpl.assert_not_called()
    free.assert_not_called()


def test_muted_alert_not_sent_to_the_customer_itself():
    tpl, *_ = _muted_run(admins=f"{PHONE},972500000002")
    assert [c.args[0] for c in tpl.call_args_list] == ["972500000002"]


def test_not_muted_no_muted_alert():
    tpl, free, *_ = _muted_run(text="מתי אתם מגיעים?", status="Quote_Sent", muted=False)
    titles = [c.kwargs["parameters"][0] for c in tpl.call_args_list]
    assert "הודעה חדשה בצאט ידני" not in titles


def test_greeting_alert_still_uses_shared_template_helper():
    with patch.object(logic.settings, "NOTIFICATION_NUMBERS", ADMINS), \
         patch.object(logic.whatsapp_service, "send_template") as tpl, \
         patch.object(logic.whatsapp_service, "send_message") as free:
        logic.bot_logic._alert_admins_customer_message(PHONE, "x", "היי", None,
                                                       {"Status": "Quote_Sent", "Name": "דנה"})
    free.assert_not_called()
    assert tpl.call_count == 2
    assert tpl.call_args.kwargs["parameters"][0] == "לקוח פעיל כתב שוב"
