"""Fix #6: 'היי' / 'שלום' / 'תפריט' must not reset an active deal."""
import asyncio
from unittest.mock import patch, AsyncMock, MagicMock

import pytest

from app.services import logic

PHONE = "972501234567"


def _run(status, text="היי", state="COMPLETED"):
    lead = {"id": "rec1", "fields": {"Phone": PHONE, "Status": status, "Conversation_State": state}}
    svc = MagicMock()
    svc.get_all_musicians.return_value = []
    svc.is_message_processed.return_value = False
    bl = logic.bot_logic
    with patch.object(logic, "airtable_service", svc), \
         patch.object(bl, "get_active_lead_robust", return_value=lead), \
         patch.object(bl, "handle_reset_command", new=AsyncMock()) as reset, \
         patch.object(bl, "_alert_admins_customer_message") as alert, \
         patch.object(bl, "_send_message") as send:
        asyncio.run(bl.handle_incoming_message(PHONE, "Dan", text, None))
    return reset, alert, send


@pytest.mark.parametrize("status", ["New", "Processing", None])
@pytest.mark.parametrize("text", ["היי", "שלום", "תפריט", "Menu "])
def test_reset_allowed_early_stage(status, text):
    reset, alert, _ = _run(status, text)
    reset.assert_awaited_once()
    alert.assert_not_called()


@pytest.mark.parametrize("status", ["Quote_Sent", "Waiting_Payment", "Assigned", "Distributed",
                                    "Talking", "Manual", "Cold", "Referred"])
def test_reset_blocked_for_active_deal(status):
    reset, alert, send = _run(status, "היי")
    reset.assert_not_awaited()
    alert.assert_called_once()
    send.assert_not_called()  # no menu / auto reply to the customer


def test_normal_text_unaffected():
    reset, alert, send = _run("Quote_Sent", "מתי אתם מגיעים?")
    reset.assert_not_awaited()
    alert.assert_not_called()
