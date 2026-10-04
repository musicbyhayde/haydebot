"""Fix #9: every message in a webhook payload is processed; failures are reported, not lost."""
import asyncio
from unittest.mock import patch, AsyncMock

from app.services import logic


def _payload(*msgs, entries=1):
    value = {"contacts": [{"wa_id": m["from"], "profile": {"name": f"N{m['from']}"}} for m in msgs],
             "messages": list(msgs)}
    return {"entry": [{"changes": [{"value": value}]} for _ in range(entries)]}


def _txt(i, frm="9725000000"):
    return {"id": f"wamid.{i}", "from": frm + str(i), "type": "text", "text": {"body": f"msg{i}"}}


def test_all_messages_processed_with_matching_contact():
    bl = logic.bot_logic
    with patch.object(bl, "handle_incoming_message", new=AsyncMock()) as h:
        asyncio.run(bl.process_webhook(_payload(_txt(1), _txt(2), _txt(3))))
    assert [c.args[2] for c in h.await_args_list] == ["msg1", "msg2", "msg3"]
    assert h.await_args_list[1].args[1] == "N97250000002"


def test_multiple_entries():
    bl = logic.bot_logic
    with patch.object(bl, "handle_incoming_message", new=AsyncMock()) as h:
        asyncio.run(bl.process_webhook(_payload(_txt(1), entries=2)))
    assert h.await_count == 2


def test_single_message_unchanged_signature():
    bl = logic.bot_logic
    with patch.object(bl, "handle_incoming_message", new=AsyncMock()) as h:
        asyncio.run(bl.process_webhook(_payload(_txt(7))))
    h.assert_awaited_once_with("97250000007", "N97250000007", "msg7", None, "wamid.7", None, None)


def test_failure_on_one_message_is_reported_and_others_continue():
    bl = logic.bot_logic
    calls = []

    async def h(phone, name, text, *a):
        calls.append(text)
        if text == "msg1":
            raise RuntimeError("supabase 503")

    bl.processed_messages["wamid.1"] = True
    with patch.object(bl, "handle_incoming_message", side_effect=h), \
         patch("app.services.email.email_service.send_notification", new=AsyncMock()) as mail, \
         patch.object(logic.whatsapp_service, "send_template") as tpl, \
         patch.object(logic.settings, "NOTIFICATION_NUMBERS", "972111,972222"):
        asyncio.run(bl.process_webhook(_payload(_txt(1), _txt(2))))
    assert calls == ["msg1", "msg2"]
    mail.assert_awaited_once()
    assert "msg1" in mail.await_args.args[1]
    assert tpl.call_count == 2
    assert "wamid.1" not in bl.processed_messages  # replayable


def test_status_only_and_malformed_payloads_are_ignored():
    bl = logic.bot_logic
    with patch.object(bl, "handle_incoming_message", new=AsyncMock()) as h:
        asyncio.run(bl.process_webhook({"entry": [{"changes": [{"value": {"statuses": [{}]}}]}]}))
        asyncio.run(bl.process_webhook({}))
        asyncio.run(bl.process_webhook({"entry": [None]}))
    h.assert_not_awaited()


def test_admin_messages_still_ignored():
    bl = logic.bot_logic
    with patch.object(bl, "handle_incoming_message", new=AsyncMock()) as h, \
         patch.object(logic.settings, "NOTIFICATION_NUMBERS", "97250000001"):
        asyncio.run(bl.process_webhook(_payload(_txt(1), _txt(2))))
    assert h.await_count == 1
