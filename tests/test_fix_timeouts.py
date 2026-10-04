"""Fix #10: every outbound HTTP call must carry a timeout (no network used)."""
from unittest.mock import patch, MagicMock


def _ok_response(payload=None):
    r = MagicMock()
    r.json.return_value = payload or {"messages": [{"id": "wamid.X"}]}
    r.raise_for_status.return_value = None
    r.content = b"bytes"
    return r


def test_whatsapp_send_uses_timeout():
    from app.services.whatsapp import whatsapp_service
    with patch("app.services.whatsapp.requests.post", return_value=_ok_response()) as post:
        whatsapp_service.send_message("972500000000", "hi")
    assert post.call_args.kwargs["timeout"] == whatsapp_service.timeout
    assert all(t and t > 0 for t in whatsapp_service.timeout)


def test_whatsapp_media_download_uses_timeouts():
    from app.services.whatsapp import whatsapp_service
    meta = _ok_response({"url": "https://example.invalid/m", "mime_type": "image/png"})
    with patch("app.services.whatsapp.requests.get", side_effect=[meta, _ok_response()]) as get:
        data, mime = whatsapp_service.download_media("MEDIA_ID")
    assert data == b"bytes" and mime == "image/png"
    assert all("timeout" in c.kwargs and c.kwargs["timeout"] for c in get.call_args_list)


def test_whatsapp_timeout_returns_error_instead_of_hanging():
    import requests
    from app.services.whatsapp import whatsapp_service
    with patch("app.services.whatsapp.requests.post", side_effect=requests.exceptions.Timeout("slow")):
        res = whatsapp_service.send_message("972500000000", "hi")
    assert "error" in res


def test_smtp_uses_timeout():
    from app.services import email as email_mod
    with patch.object(email_mod.smtplib, "SMTP") as smtp:
        email_mod.email_service._send_email_sync(MagicMock())
    assert "timeout" in smtp.call_args.kwargs and smtp.call_args.kwargs["timeout"] > 0


def test_supabase_client_has_bounded_timeout():
    from app.services.supabase_service import supabase_service
    from app.core.config import get_settings
    assert supabase_service.client is not None
    assert supabase_service.client.options.postgrest_client_timeout == get_settings().SUPABASE_TIMEOUT
