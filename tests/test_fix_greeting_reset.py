"""Fix #6: greeting / menu words vs. intake and active deals.

- Intake (bot still collecting details: state START/AWAITING_* and status New):
    greeting  -> no reset, no admin alert, the current intake question is asked again
    menu word -> restart the intake (as before), no admin alert
- Past intake (details collected / deal active): no reset, no customer reply, admins get the
  approved admin_system_alert_v2 template (never free text).
"""
import asyncio
from datetime import datetime, timedelta
from unittest.mock import patch, AsyncMock, MagicMock

import pytest

from app.services import logic

PHONE = "972501234567"
ADMINS = "972500000001,972500000002"
INTAKE_STATES = ["START", "AWAITING_SERVICE", "AWAITING_DATE", "AWAITING_LOCATION", "AWAITING_GUESTS"]


def _run(status, text="היי", state="COMPLETED", last_interaction=None, real_alert=False):
    fields = {"Phone": PHONE, "Name": "דנה", "Status": status, "Conversation_State": state}
    if last_interaction:
        fields["Last_Interaction"] = last_interaction
    lead = {"id": "rec1", "fields": fields}
    svc = MagicMock()
    svc.get_all_musicians.return_value = []
    svc.is_message_processed.return_value = False
    bl = logic.bot_logic
    m = {}
    patches = [
        patch.object(logic, "airtable_service", svc),
        patch.object(logic.settings, "NOTIFICATION_NUMBERS", ADMINS),
        patch.object(bl, "get_active_lead_robust", return_value=lead),
        patch.object(bl, "handle_reset_command", new=AsyncMock()),
        patch.object(bl, "send_state_question", new=AsyncMock()),
        patch.object(bl, "send_welcome_menu", new=AsyncMock()),
        patch.object(bl, "handle_date_input", new=AsyncMock()),
        patch.object(bl, "handle_service_selection", new=AsyncMock()),
        patch.object(bl, "_send_message"),
        patch.object(bl, "_send_interactive"),
        patch.object(logic.whatsapp_service, "send_template"),
        patch.object(logic.whatsapp_service, "send_message"),
    ]
    if not real_alert:
        patches.append(patch.object(bl, "_alert_admins_customer_message"))
    started = [p.start() for p in patches]
    try:
        names = ["svc", "settings", "lead", "reset", "reask", "menu", "date", "service", "send",
                 "interactive", "template", "freetext"] + ([] if real_alert else ["alert"])
        m = dict(zip(names, started))
        asyncio.run(bl.handle_incoming_message(PHONE, "Dana", text, None))
    finally:
        for p in reversed(patches):
            p.stop()
    return m


def _updates(m):
    return [c.args[1] for c in m["svc"].update_lead.call_args_list]


# ── 1. intake: greeting keeps the flow going ────────────────────────────────────────
@pytest.mark.parametrize("state", INTAKE_STATES[1:])
@pytest.mark.parametrize("text", ["היי", "שלום", " היי "])
def test_greeting_mid_intake_reasks_current_question(state, text):
    m = _run("New", text, state)
    m["reset"].assert_not_awaited()
    m["alert"].assert_not_called()
    m["reask"].assert_awaited_once()
    assert m["reask"].await_args.args[1].value == state
    # answers already given are not touched: no status/state change, only Last_Interaction
    for u in _updates(m):
        assert u.status is None and u.conversation_state is None
    m["date"].assert_not_awaited()          # "היי" is not fed to the AI as an answer
    m["template"].assert_not_called()
    m["freetext"].assert_not_called()


def test_greeting_at_start_sends_menu_without_alert():
    m = _run("New", "היי", "START")
    m["menu"].assert_awaited_once()
    m["alert"].assert_not_called()
    m["reset"].assert_not_awaited()


@pytest.mark.parametrize("status", [None, ""])
def test_greeting_mid_intake_without_status_counts_as_intake(status):
    m = _run(status, "שלום", "AWAITING_LOCATION")
    m["reask"].assert_awaited_once()
    m["alert"].assert_not_called()


def test_greeting_mid_intake_after_4h_gets_the_resume_prompt():
    old = (datetime.now() - timedelta(hours=5)).isoformat()
    m = _run("New", "היי", "AWAITING_DATE", last_interaction=old)
    m["interactive"].assert_called_once()           # "להמשיך או להתחיל מהתחלה?"
    m["reask"].assert_not_awaited()
    m["alert"].assert_not_called()
    m["reset"].assert_not_awaited()


@pytest.mark.parametrize("state", INTAKE_STATES)
@pytest.mark.parametrize("text", ["תפריט", "Menu", "התחל מחדש", "restart"])
def test_menu_word_mid_intake_restarts_intake_without_alert(state, text):
    m = _run("New", text, state)
    m["reset"].assert_awaited_once()
    m["alert"].assert_not_called()


def test_normal_answer_mid_intake_unaffected():
    m = _run("New", "12/12/2026", "AWAITING_DATE")
    m["date"].assert_awaited_once()
    m["reask"].assert_not_awaited()
    m["alert"].assert_not_called()


# ── 2. past intake: alert admins via the approved template ──────────────────────────
@pytest.mark.parametrize("status,state", [
    ("Processing", "COMPLETED"),        # bot finished collecting details
    ("Manual", "COMPLETED"),            # "talk to a human" chosen
    ("Quote_Sent", "COMPLETED"), ("Waiting_Payment", "COMPLETED"), ("Talking", "COMPLETED"),
    ("Assigned", "COMPLETED"), ("Distributed", "COMPLETED"), ("Cold", "COMPLETED"),
    ("Referred", "COMPLETED"),
    ("New", "COMPLETED"),               # details collected even though status is still New
    ("Manual", "START"),                # created by hand in the dashboard, not a bot intake
    ("Quote_Sent", "AWAITING_DATE"),    # deal moved on in the dashboard mid-intake
])
@pytest.mark.parametrize("text", ["היי", "שלום", "תפריט"])
def test_past_intake_no_reset_and_alert(status, state, text):
    m = _run(status, text, state)
    m["reset"].assert_not_awaited()
    m["reask"].assert_not_awaited()
    m["alert"].assert_called_once()
    m["send"].assert_not_called()          # no automatic reply to the customer
    for u in _updates(m):
        assert u.status is None and u.conversation_state is None


def test_past_intake_alert_uses_admin_template_not_free_text():
    m = _run("Quote_Sent", "היי", "COMPLETED", real_alert=True)
    tpl, free = m["template"], m["freetext"]
    free.assert_not_called()
    assert tpl.call_count == 2
    sent_to = {c.args[0] for c in tpl.call_args_list}
    assert sent_to == set(ADMINS.split(","))
    for c in tpl.call_args_list:
        assert c.args[1] == "admin_system_alert_v2" and c.args[2] == "he"
        title, body = c.kwargs["parameters"]
        assert title and "\n" not in body and "    " not in body
        assert PHONE in body and "Quote_Sent" in body and "היי" in body and "דנה" in body


def test_template_name_is_one_already_used_by_existing_admin_alerts():
    import inspect
    src = inspect.getsource(logic.HaydeBotLogic._handle_returning_closed_customer)
    assert '"admin_system_alert_v2"' in src


def test_alert_skipped_without_notification_numbers():
    with patch.object(logic.settings, "NOTIFICATION_NUMBERS", ""), \
         patch.object(logic.whatsapp_service, "send_template") as tpl:
        logic.bot_logic._alert_admins_customer_message(PHONE, "x", "היי", None, {"Status": "Quote_Sent"})
    tpl.assert_not_called()


def test_normal_text_past_intake_unaffected():
    m = _run("Quote_Sent", "מתי אתם מגיעים?")
    m["reset"].assert_not_awaited()
    m["alert"].assert_not_called()
