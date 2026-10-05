"""Improvement #5: human escalation and the "פרטי האירוע נשמרו!" loop.

ESCALATION_ENABLED=false -> the old behaviour (except: "talk to someone" no longer stores the
service "Talk", which the dashboard shows as "הרצאה").
ESCALATION_ENABLED=true:
- past the intake the bot never answers by itself; partners get an admin_system_alert_v2 alert
  ("💬 לקוח ממתין למענה", or "🙋 לקוח מבקש נציג" for explicit requests), at most one per lead and
  kind per ESCALATION_ALERT_COOLDOWN_MINUTES (throttled through an activity row);
- "talk to someone" -> New + its own human-request alert (WhatsApp template + email);
- a finished intake -> New instead of Processing; a lead stuck in Processing moves to New when the
  customer writes;
- mid-intake messages (greetings included) are unchanged;
- optional acknowledgement to the customer (ESCALATION_CUSTOMER_ACK), max once per 12h.
"""
import asyncio
from datetime import datetime, timedelta, timezone
from unittest.mock import patch, AsyncMock, MagicMock

import pytest

from app.models.schemas import LeadStatus, ConversationState, ServiceType
from app.services import logic

PHONE = "972501234567"
ADMINS = "972500000001,972500000002"
ADMIN_SET = set(ADMINS.split(","))


def _svc(lead_fields=None, recent_activity=False, recent_outbound=False):
    svc = MagicMock()
    svc.get_all_musicians.return_value = []
    svc.is_message_processed.return_value = False
    svc.has_recent_activity.return_value = recent_activity
    svc.has_recent_outbound.return_value = recent_outbound
    if lead_fields is not None:
        svc.leads_table.get.return_value = {"id": "rec1", "fields": lead_fields}
    return svc


def _run(status="Processing", text="מתי אתם חוזרים אליי?", state="COMPLETED", *, enabled=True,
         ack=False, cooldown=60, recent_activity=False, recent_outbound=False, interactive_id=None,
         owner=None, muted=False, media_url=None, extra=None, admins=ADMINS):
    fields = {"Phone": PHONE, "Name": "דנה", "Status": status, "Conversation_State": state}
    if owner:
        fields["Owner"] = owner
    if muted:
        fields["Bot_Mute_Until"] = (datetime.now(timezone.utc) + timedelta(hours=5)).isoformat()
    fields.update(extra or {})
    lead = {"id": "rec1", "fields": fields}
    svc = _svc(dict(fields), recent_activity, recent_outbound)
    bl = logic.bot_logic
    patches = {
        "svc": patch.object(logic, "airtable_service", svc),
        "admins": patch.object(logic.settings, "NOTIFICATION_NUMBERS", admins),
        "enabled": patch.object(logic.settings, "ESCALATION_ENABLED", enabled),
        "ack_flag": patch.object(logic.settings, "ESCALATION_CUSTOMER_ACK", ack),
        "cooldown": patch.object(logic.settings, "ESCALATION_ALERT_COOLDOWN_MINUTES", cooldown),
        "lead": patch.object(bl, "get_active_lead_robust", return_value=lead),
        "reset": patch.object(bl, "handle_reset_command", new=AsyncMock()),
        "reask": patch.object(bl, "send_state_question", new=AsyncMock()),
        "menu": patch.object(bl, "send_welcome_menu", new=AsyncMock()),
        "date": patch.object(bl, "handle_date_input", new=AsyncMock()),
        "musician": patch.object(bl, "handle_musician_interaction", new=AsyncMock()),
        "notify": patch.object(bl, "notify_admins", new=AsyncMock()),
        "send": patch.object(bl, "_send_message"),
        "interactive": patch.object(bl, "_send_interactive"),
        "template": patch.object(logic.whatsapp_service, "send_template"),
        "freetext": patch.object(logic.whatsapp_service, "send_message"),
        "email": patch.object(logic.email_service, "send_notification", new=AsyncMock()),
    }
    m = {}
    try:
        for k, p in patches.items():
            m[k] = p.start()
        m["svc"] = svc
        asyncio.run(bl.handle_incoming_message(PHONE, "Dana WA", text, interactive_id,
                                               media_url=media_url))
    finally:
        for p in reversed(list(patches.values())):
            p.stop()
    return m


def _updates(m):
    return [c.args[1] for c in m["svc"].update_lead.call_args_list]


def _alerts(m):
    """[(to, title, body)] for every admin template sent."""
    out = []
    for c in m["template"].call_args_list:
        assert c.args[1] == "admin_system_alert_v2" and c.args[2] == "he"
        title, body = c.kwargs["parameters"]
        out.append((c.args[0], title, body))
    return out


def _activities(m):
    return [c.args[0] for c in m["svc"].create_activity.call_args_list]


# ── flag off: old behaviour ──────────────────────────────────────────────────────────
def test_off_completed_lead_still_gets_the_saved_reply():
    m = _run("Processing", enabled=False)
    m["send"].assert_called_once()
    assert m["send"].call_args.args[1] == logic.COMPLETED_REPLY_TEXT
    assert _alerts(m) == []
    m["svc"].create_activity.assert_not_called()
    m["svc"].has_recent_activity.assert_not_called()


def test_off_past_intake_greeting_keeps_the_old_alert():
    m = _run("Quote_Sent", "היי", enabled=False)
    titles = {t for _, t, _ in _alerts(m)}
    assert titles == {"לקוח פעיל כתב שוב"}
    m["send"].assert_not_called()


def test_off_finished_intake_stays_processing():
    status = _finish_intake(enabled=False)
    assert status == LeadStatus.PROCESSING


def test_off_talk_keeps_manual_and_generic_alert_but_no_talk_service():
    svc, send, notify, tpl, email = _talk(enabled=False)
    ups = [c.args[1] for c in svc.update_lead.call_args_list]
    assert all(u.service is None for u in ups)              # never "Talk" (= "הרצאה" in the dashboard)
    assert ups[-1].status == LeadStatus.MANUAL and ups[-1].conversation_state == ConversationState.COMPLETED
    send.assert_called_once()
    assert send.call_args.args[1] == logic.TALK_REPLY_TEXT
    notify.assert_awaited_once()
    assert notify.await_args.args[0]["Service"] == "לדבר עם נציג"   # readable in the admin_new_lead template
    svc.create_activity.assert_not_called()


# ── flag on: the loop is broken ──────────────────────────────────────────────────────
@pytest.mark.parametrize("status", ["Processing", "New", "Manual", "Talking", "Quote_Sent",
                                    "Waiting_Payment", "Cold", "Referred", "Assigned"])
def test_on_message_after_intake_gets_no_bot_reply_and_alerts_partners(status):
    m = _run(status, "מתי תחזרו אליי עם הצעה")
    m["send"].assert_not_called()                     # no "פרטי האירוע נשמרו!"
    m["freetext"].assert_not_called()
    alerts = _alerts(m)
    assert {to for to, _, _ in alerts} == ADMIN_SET
    for _, title, body in alerts:
        assert title == logic.ALERT_TITLE_WAITING_REPLY
        assert PHONE in body and "דנה" in body and "מתי תחזרו אליי עם הצעה" in body
        assert "\n" not in body and "    " not in body
    acts = _activities(m)
    assert len(acts) == 1 and acts[0].action_type == logic.ACTIVITY_WAITING_REPLY
    assert acts[0].lead_id == "rec1" and acts[0].actor == "מערכת"
    m["email"].assert_not_awaited()                   # generic "waiting" alert: WhatsApp only
    m["reset"].assert_not_awaited()
    m["date"].assert_not_awaited()


def test_on_stuck_processing_lead_moves_to_new_and_others_keep_status():
    m = _run("Processing")
    ups = _updates(m)
    assert len(ups) == 1 and ups[0].status == LeadStatus.NEW and ups[0].last_interaction
    m2 = _run("Quote_Sent")
    ups2 = _updates(m2)
    assert len(ups2) == 1 and ups2[0].status is None and ups2[0].last_interaction


def test_on_alert_shows_hebrew_status_and_owner():
    body = _alerts(_run("Quote_Sent", owner="קובי"))[0][2]
    assert 'נשלחה הצ"מ' in body and "מוביל: קובי" in body
    body = _alerts(_run("Talking"))[0][2]
    assert "בשיחה" in body and "ללא מוביל" in body


def test_on_repeat_within_cooldown_is_silent():
    m = _run("Processing", "????", recent_activity=True)
    assert _alerts(m) == []
    m["send"].assert_not_called()
    m["svc"].create_activity.assert_not_called()
    m["email"].assert_not_awaited()
    assert _updates(m)                                 # Last_Interaction is still recorded
    since = m["svc"].has_recent_activity.call_args.args[2]
    assert timedelta(minutes=59) < datetime.now(timezone.utc) - since < timedelta(minutes=61)


def test_on_cooldown_zero_never_throttles():
    m = _run("Processing", cooldown=0, recent_activity=True)
    m["svc"].has_recent_activity.assert_not_called()
    assert len(_alerts(m)) == 2


@pytest.mark.parametrize("text", ["????", "הייי???", "אף אחד לא חזר אליי", "זה דחוף",
                                  "אפשר לדבר עם נציג?", "I need to talk to a human", "URGENT"])
def test_on_explicit_request_gets_the_human_request_alert_and_email(text):
    m = _run("Processing", text)
    titles = {t for _, t, _ in _alerts(m)}
    assert titles == {logic.ALERT_TITLE_HUMAN_REQUEST}
    m["email"].assert_awaited_once()
    assert _activities(m)[0].action_type == logic.ACTIVITY_HUMAN_REQUEST
    m["send"].assert_not_called()


def test_on_human_request_and_waiting_are_throttled_separately():
    m = _run("Processing", "????")
    assert m["svc"].has_recent_activity.call_args.args[1] == logic.ACTIVITY_HUMAN_REQUEST
    m = _run("Processing", "תודה")
    assert m["svc"].has_recent_activity.call_args.args[1] == logic.ACTIVITY_WAITING_REPLY


@pytest.mark.parametrize("text", ["היי", "שלום", "תפריט", "restart"])
def test_on_past_intake_greeting_or_menu_word_escalates_without_reset(text):
    m = _run("Quote_Sent", text)
    m["reset"].assert_not_awaited()
    m["send"].assert_not_called()
    assert {t for _, t, _ in _alerts(m)} == {logic.ALERT_TITLE_WAITING_REPLY}


def test_on_partner_moved_lead_mid_intake_bot_does_not_continue_questions():
    m = _run("Quote_Sent", "12/12/2026", state="AWAITING_DATE")
    m["date"].assert_not_awaited()
    m["interactive"].assert_not_called()               # no resume prompt either
    assert len(_alerts(m)) == 2


def test_on_media_message_preview():
    body = _alerts(_run("Processing", "[IMAGE RECEIVED]", media_url="https://x/i.jpg"))[0][2]
    assert "[מדיה]" in body


def test_on_alert_not_sent_to_the_customer_itself():
    m = _run("Processing", admins=f"{PHONE},972500000002")
    assert [to for to, _, _ in _alerts(m)] == ["972500000002"]


def test_on_no_admin_numbers_still_records_activity():
    m = _run("Processing", admins="")
    assert _alerts(m) == []
    assert len(_activities(m)) == 1


def test_on_muted_chat_keeps_the_muted_alert_only():
    m = _run("Manual", muted=True)
    assert {t for _, t, _ in _alerts(m)} == {"הודעה חדשה בצאט ידני"}
    m["svc"].create_activity.assert_not_called()


def test_on_musician_button_is_not_escalated():
    m = _run("Processing", "תפסתי", interactive_id="claim_rec9")
    m["svc"].create_activity.assert_not_called()
    m["musician"].assert_awaited_once()


def test_on_failures_in_alert_or_activity_do_not_break_processing():
    fields = {"Phone": PHONE, "Name": "דנה", "Status": "Processing", "Conversation_State": "COMPLETED"}
    svc = _svc(fields)
    svc.create_activity.side_effect = RuntimeError("db down")
    bl = logic.bot_logic
    with patch.object(logic, "airtable_service", svc), \
         patch.object(logic.settings, "NOTIFICATION_NUMBERS", ADMINS), \
         patch.object(logic.settings, "ESCALATION_ENABLED", True), \
         patch.object(logic.settings, "ESCALATION_CUSTOMER_ACK", False), \
         patch.object(logic.whatsapp_service, "send_template", side_effect=RuntimeError("meta down")), \
         patch.object(logic.email_service, "send_notification", new=AsyncMock(side_effect=RuntimeError("smtp"))), \
         patch.object(bl, "_send_message") as send:
        sent = asyncio.run(bl._escalate(PHONE, "Dana", "????", "rec1", fields, kind="human"))
    assert sent is True
    send.assert_not_called()


# ── flag on: mid-intake unchanged ────────────────────────────────────────────────────
@pytest.mark.parametrize("state", ["AWAITING_SERVICE", "AWAITING_DATE", "AWAITING_LOCATION", "AWAITING_GUESTS"])
def test_on_greeting_mid_intake_still_reasks_without_reset_or_alert(state):
    m = _run("New", "היי", state=state)
    m["reset"].assert_not_awaited()
    m["reask"].assert_awaited_once()
    assert _alerts(m) == []
    m["svc"].create_activity.assert_not_called()


def test_on_answer_mid_intake_goes_to_the_question_handler():
    m = _run("New", "12/12/2026", state="AWAITING_DATE")
    m["date"].assert_awaited_once()
    assert _alerts(m) == []


def test_on_menu_word_mid_intake_restarts_as_before():
    m = _run("New", "תפריט", state="AWAITING_LOCATION")
    m["reset"].assert_awaited_once()
    assert _alerts(m) == []


# ── "talk to someone" ────────────────────────────────────────────────────────────────
def _talk(enabled=True, cooldown=60, recent_activity=False):
    fields = {"Phone": PHONE, "Name": "דנה", "Status": "New", "Conversation_State": "COMPLETED"}
    svc = _svc(fields, recent_activity)
    bl = logic.bot_logic
    with patch.object(logic, "airtable_service", svc), \
         patch.object(logic.settings, "NOTIFICATION_NUMBERS", ADMINS), \
         patch.object(logic.settings, "ESCALATION_ENABLED", enabled), \
         patch.object(logic.settings, "ESCALATION_CUSTOMER_ACK", True), \
         patch.object(logic.settings, "ESCALATION_ALERT_COOLDOWN_MINUTES", cooldown), \
         patch.object(bl, "_send_message") as send, \
         patch.object(bl, "notify_admins", new=AsyncMock()) as notify, \
         patch.object(logic.whatsapp_service, "send_template") as tpl, \
         patch.object(logic.email_service, "send_notification", new=AsyncMock()) as email:
        asyncio.run(bl.handle_service_selection(PHONE, "rec1", "SVC_TALK", "לדבר עם מישהו 📞"))
    return svc, send, notify, tpl, email


def test_on_talk_sets_new_no_service_and_sends_distinct_human_request_alert():
    svc, send, notify, tpl, email = _talk()
    ups = [c.args[1] for c in svc.update_lead.call_args_list]
    assert all(u.service is None for u in ups)
    assert ups[-1].status == LeadStatus.NEW and ups[-1].conversation_state == ConversationState.COMPLETED
    # customer: only the reply that was already part of the flow (no extra acknowledgement)
    assert [c.args[1] for c in send.call_args_list] == [logic.TALK_REPLY_TEXT]
    notify.assert_not_awaited()                        # not the generic admin_new_lead alert
    assert {c.args[0] for c in tpl.call_args_list} == ADMIN_SET
    for c in tpl.call_args_list:
        assert c.args[1:3] == ("admin_system_alert_v2", "he")
        title, body = c.kwargs["parameters"]
        assert title == logic.ALERT_TITLE_HUMAN_REQUEST
        assert "לדבר עם מישהו" in body and PHONE in body and "דנה" in body and "חדש" in body
    email.assert_awaited_once()
    acts = [c.args[0] for c in svc.create_activity.call_args_list]
    assert len(acts) == 1 and acts[0].action_type == logic.ACTIVITY_HUMAN_REQUEST


def test_on_talk_full_flow_through_the_webhook_handler():
    m = _run("New", "לדבר עם מישהו 📞", state="AWAITING_SERVICE", interactive_id="SVC_TALK")
    assert {t for _, t, _ in _alerts(m)} == {logic.ALERT_TITLE_HUMAN_REQUEST}
    assert [c.args[1] for c in m["send"].call_args_list] == [logic.TALK_REPLY_TEXT]
    m["notify"].assert_not_awaited()


def test_on_talk_pressed_again_after_intake_is_a_human_request():
    m = _run("New", "לדבר עם מישהו 📞", state="COMPLETED", interactive_id="SVC_TALK")
    assert {t for _, t, _ in _alerts(m)} == {logic.ALERT_TITLE_HUMAN_REQUEST}
    m["send"].assert_not_called()


def test_other_services_still_saved():
    svc = _svc()
    bl = logic.bot_logic
    with patch.object(logic, "airtable_service", svc), \
         patch.object(logic.settings, "ESCALATION_ENABLED", True), \
         patch.object(bl, "_send_message"):
        asyncio.run(bl.handle_service_selection(PHONE, "rec1", "SVC_BAND", "להקה"))
    assert svc.update_lead.call_args_list[0].args[1].service == ServiceType.BAND


# ── end of intake ────────────────────────────────────────────────────────────────────
def _finish_intake(enabled=True, service="Band"):
    fields = {"Phone": PHONE, "Name": "דנה", "Status": "New", "Service": service}
    svc = _svc(fields)
    bl = logic.bot_logic
    with patch.object(logic, "airtable_service", svc), \
         patch.object(logic.settings, "ESCALATION_ENABLED", enabled), \
         patch.object(logic.ai_service, "analyze_input", return_value={"valid": True, "extracted_value": "200"}), \
         patch.object(bl, "check_and_trigger_bouzouki_protocol", new=AsyncMock(return_value=False)), \
         patch.object(bl, "notify_admins", new=AsyncMock()) as notify, \
         patch.object(bl, "_send_message"):
        asyncio.run(bl.handle_guests_input(PHONE, "rec1", "200"))
    notify.assert_awaited_once()                      # the "lead completed" alert is unchanged
    up = svc.update_lead.call_args_list[0].args[1]
    assert up.conversation_state == ConversationState.COMPLETED and up.guests == "200"
    return up.status


def test_on_finished_intake_goes_to_new():
    assert _finish_intake(enabled=True) == LeadStatus.NEW


def test_bouzouki_protocol_still_accepts_a_new_lead():
    fields = {"Service": "Bouzouki", "Status": "New", "Location": "חיפה", "Event_Date": "01.01.2027",
              "Guests": "200"}
    svc = _svc(fields)
    bl = logic.bot_logic
    with patch.object(logic, "airtable_service", svc), \
         patch.object(bl, "start_bouzouki_protocol", new=AsyncMock()) as start:
        assert asyncio.run(bl.check_and_trigger_bouzouki_protocol("rec1")) is True
    start.assert_awaited_once()


# ── optional customer acknowledgement ────────────────────────────────────────────────
def test_ack_sent_once_when_enabled():
    m = _run("Processing", ack=True)
    assert [c.args[1] for c in m["send"].call_args_list] == [logic.ESCALATION_ACK_TEXT]
    lead_id, content, since = m["svc"].has_recent_outbound.call_args.args
    assert lead_id == "rec1" and content == logic.ESCALATION_ACK_TEXT
    assert timedelta(hours=11, minutes=59) < datetime.now(timezone.utc) - since < timedelta(hours=12, minutes=1)


def test_ack_not_repeated_within_12h():
    m = _run("Processing", ack=True, recent_outbound=True)
    m["send"].assert_not_called()


def test_ack_needs_escalation_enabled():
    m = _run("Processing", enabled=False, ack=True)
    assert [c.args[1] for c in m["send"].call_args_list] == [logic.COMPLETED_REPLY_TEXT]
    m["svc"].has_recent_outbound.assert_not_called()


def test_ack_off_by_default():
    from app.core.config import Settings
    for name in ("ESCALATION_ENABLED", "ESCALATION_CUSTOMER_ACK"):
        assert Settings.model_fields[name].default is False
    assert Settings.model_fields["ESCALATION_ALERT_COOLDOWN_MINUTES"].default == 60


# ── helpers ──────────────────────────────────────────────────────────────────────────
@pytest.mark.parametrize("text,expected", [
    ("????", True), ("??", False), ("מה המחיר?", False), ("תודה רבה", False),
    ("אני מחכה כבר יומיים", True), ("Can someone call me", True), ("", False), (None, False),
])
def test_wants_human(text, expected):
    assert logic.HaydeBotLogic._wants_human(text) is expected


def test_wants_human_menu_button():
    assert logic.HaydeBotLogic._wants_human("x", "SVC_TALK") is True


def test_status_he_fallback():
    assert logic.status_he("Processing") == "בטיפול בוט"
    assert logic.status_he("Weird") == "Weird"
    assert logic.status_he("") == "לא ידוע"


# ── supabase helpers ─────────────────────────────────────────────────────────────────
def _chain(data=None, exc=None):
    q = MagicMock()
    for name in ("select", "eq", "gte", "limit", "contains"):
        getattr(q, name).return_value = q
    if exc:
        q.execute.side_effect = exc
    else:
        q.execute.return_value = MagicMock(data=data)
    client = MagicMock()
    client.table.return_value = q
    return client, q


def _service(client):
    from app.services.supabase_service import SupabaseService
    s = SupabaseService.__new__(SupabaseService)
    s.client = client
    return s


def test_has_recent_activity_query_and_results():
    since = datetime(2026, 10, 5, 6, 0, tzinfo=timezone.utc)
    client, q = _chain(data=[{"id": "a"}])
    assert _service(client).has_recent_activity("rec1", "בקשת נציג", since) is True
    client.table.assert_called_with("activities")
    q.eq.assert_any_call("lead_id", "rec1")
    q.eq.assert_any_call("action_type", "בקשת נציג")
    q.gte.assert_called_with("created_at", since.isoformat())
    client, _ = _chain(data=[])
    assert _service(client).has_recent_activity("rec1", "x", since) is False
    client, _ = _chain(exc=RuntimeError("boom"))
    assert _service(client).has_recent_activity("rec1", "x", since) is False   # alert rather than miss
    assert _service(None).has_recent_activity("rec1", "x", since) is False


def test_has_recent_outbound_query_and_results():
    since = datetime(2026, 10, 5, 6, 0, tzinfo=timezone.utc)
    client, q = _chain(data=[{"id": "m"}])
    assert _service(client).has_recent_outbound("rec1", "טקסט", since) is True
    client.table.assert_called_with("messages")
    q.contains.assert_called_with("Lead", ["rec1"])
    q.eq.assert_any_call("Direction", "Outbound")
    q.eq.assert_any_call("Content", "טקסט")
    client, _ = _chain(data=[])
    assert _service(client).has_recent_outbound("rec1", "x", since) is False
    client, _ = _chain(exc=RuntimeError("boom"))
    assert _service(client).has_recent_outbound("rec1", "x", since) is True    # stay silent on error
    assert _service(None).has_recent_outbound("rec1", "x", since) is True


# ── Ilan's rule: the end-of-intake confirmation goes out exactly once ────────────────
END_OF_INTAKE_PREFIX = "מגניב, רשמנו את כל הפרטים"


def _conversation(messages, *, enabled=True, start_state="AWAITING_GUESTS", service="Band"):
    """Feed messages [(text, interactive_id)] through handle_incoming_message against a lead whose
    fields really change with every update_lead (a small in-memory store). Returns (texts sent to
    the customer, admin alert titles, final fields)."""
    fields = {"Phone": PHONE, "Name": "דנה", "Status": "New", "Conversation_State": start_state,
              "Service": service}
    svc = _svc()

    def apply(_lead_id, update):
        fields.update(update.model_dump(by_alias=True, exclude_none=True, mode="json"))
        return {"id": "rec1", "fields": dict(fields)}

    svc.update_lead.side_effect = apply
    svc.leads_table.get.side_effect = lambda _id: {"id": "rec1", "fields": dict(fields)}
    bl = logic.bot_logic
    with patch.object(logic, "airtable_service", svc), \
         patch.object(logic.settings, "NOTIFICATION_NUMBERS", ADMINS), \
         patch.object(logic.settings, "ESCALATION_ENABLED", enabled), \
         patch.object(logic.settings, "ESCALATION_CUSTOMER_ACK", False), \
         patch.object(bl, "get_active_lead_robust",
                      side_effect=lambda _p: {"id": "rec1", "fields": dict(fields)}), \
         patch.object(logic.ai_service, "analyze_input",
                      return_value={"valid": True, "extracted_value": "200"}), \
         patch.object(bl, "check_and_trigger_bouzouki_protocol", new=AsyncMock(return_value=False)), \
         patch.object(bl, "notify_admins", new=AsyncMock()), \
         patch.object(bl, "send_welcome_menu", new=AsyncMock()) as menu, \
         patch.object(bl, "_send_message") as send, \
         patch.object(bl, "_send_interactive") as interactive, \
         patch.object(logic.whatsapp_service, "send_template") as tpl, \
         patch.object(logic.whatsapp_service, "send_message") as free, \
         patch.object(logic.whatsapp_service, "send_interactive_button") as button, \
         patch.object(logic.email_service, "send_notification", new=AsyncMock()):
        for text, iid in messages:
            asyncio.run(bl.handle_incoming_message(PHONE, "Dana", text, iid))
    sent = [c.args[1] for c in send.call_args_list]
    other_customer_sends = (interactive.call_count + free.call_count + button.call_count
                            + menu.await_count)
    titles = [c.kwargs["parameters"][0] for c in tpl.call_args_list]
    return sent, other_customer_sends, titles, fields


LATER_MESSAGES = [("תודה!", None), ("היי", None), ("תפריט", None), ("restart", None),
                  ("????", None), ("200", None), ("🔄 המשך מאיפה שעצרנו", "RESUME_YES"),
                  ("🆕 התחל מהתחלה", "RESUME_NO"), ("להקה", "SVC_BAND"), ("[IMAGE RECEIVED]", None)]


def test_on_end_of_intake_confirmation_sent_exactly_once_then_only_partner_alerts():
    sent, other, titles, fields = _conversation([("200", None)] + LATER_MESSAGES)
    assert len(sent) == 1 and sent[0].startswith(END_OF_INTAKE_PREFIX)
    assert other == 0                                  # no menu, buttons or free text either
    assert fields["Conversation_State"] == "COMPLETED" and fields["Status"] == "New"
    # every later message became a partner alert (throttling is off in this store: no rows read)
    assert len(titles) == 2 * len(LATER_MESSAGES)
    assert set(titles) <= {logic.ALERT_TITLE_WAITING_REPLY, logic.ALERT_TITLE_HUMAN_REQUEST}


def test_on_talk_reply_sent_exactly_once_then_only_partner_alerts():
    sent, other, titles, fields = _conversation(
        [("לדבר עם מישהו 📞", "SVC_TALK")] + LATER_MESSAGES, start_state="AWAITING_SERVICE", service=None)
    assert sent == [logic.TALK_REPLY_TEXT]
    assert other == 0
    assert fields["Status"] == "New" and "Service" not in {k for k, v in fields.items() if v}
    assert titles[:2] == [logic.ALERT_TITLE_HUMAN_REQUEST] * 2


def test_off_shows_the_old_loop_for_comparison():
    sent, *_ = _conversation([("200", None), ("תודה!", None), ("????", None)], enabled=False)
    assert sent[0].startswith(END_OF_INTAKE_PREFIX)
    assert sent[1:] == [logic.COMPLETED_REPLY_TEXT, logic.COMPLETED_REPLY_TEXT]
