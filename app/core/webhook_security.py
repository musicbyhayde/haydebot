"""
Webhook authenticity checks (fix #4).

WhatsApp (Meta): X-Hub-Signature-256 = "sha256=" + HMAC_SHA256(app_secret, raw_body).
  - META_APP_SECRET unset           -> check skipped (logged once).
  - set, WEBHOOK_SIGNATURE_ENFORCE=false (default) -> mismatches are only logged.
  - set, WEBHOOK_SIGNATURE_ENFORCE=true            -> mismatches get 403.

Google Calendar: the watch channel is registered with a secret token that Google echoes
in X-Goog-Channel-Token. Derived from WHATSAPP_VERIFY_TOKEN unless CALENDAR_WEBHOOK_TOKEN is
set, so no new env var is required. Same log-only / enforce switch
(CALENDAR_WEBHOOK_ENFORCE).
"""
from __future__ import annotations

import hashlib
import hmac
from typing import Optional

from app.core.config import get_settings

_stats = {"ok": 0, "mismatch": 0, "missing": 0, "unchecked": 0}
_warned_no_secret = False


def _log_stats(kind: str) -> None:
    _stats[kind] += 1
    total = sum(_stats.values())
    if kind == "mismatch" or total % 100 == 1:
        print(f"WEBHOOK SIGNATURE stats since boot: {dict(_stats)}")


def check_meta_signature(raw_body: bytes, header: Optional[str]) -> bool:
    """Return True if the request should be accepted."""
    global _warned_no_secret
    s = get_settings()
    secret = s.META_APP_SECRET
    if not secret:
        if not _warned_no_secret:
            print("WEBHOOK SIGNATURE: META_APP_SECRET not set - WhatsApp webhook signature NOT checked")
            _warned_no_secret = True
        _log_stats("unchecked")
        return True
    if not header:
        _log_stats("missing")
        print("WEBHOOK SIGNATURE: missing X-Hub-Signature-256"
              + (" -> rejected" if s.WEBHOOK_SIGNATURE_ENFORCE else " (log-only)"))
        return not s.WEBHOOK_SIGNATURE_ENFORCE
    expected = "sha256=" + hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    if hmac.compare_digest(expected, header.strip()):
        _log_stats("ok")
        return True
    _log_stats("mismatch")
    print("WEBHOOK SIGNATURE: MISMATCH on WhatsApp webhook"
          + (" -> rejected" if s.WEBHOOK_SIGNATURE_ENFORCE else " (log-only)"))
    return not s.WEBHOOK_SIGNATURE_ENFORCE


def calendar_channel_token() -> str:
    s = get_settings()
    if s.CALENDAR_WEBHOOK_TOKEN:
        return s.CALENDAR_WEBHOOK_TOKEN
    return hmac.new(s.WHATSAPP_VERIFY_TOKEN.encode(), b"haydebot-calendar-webhook",
                    hashlib.sha256).hexdigest()


def check_calendar_token(header: Optional[str]) -> bool:
    s = get_settings()
    if header and hmac.compare_digest(header, calendar_channel_token()):
        return True
    print("WEBHOOK CALENDAR: bad/missing X-Goog-Channel-Token"
          + (" -> rejected" if s.CALENDAR_WEBHOOK_ENFORCE else " (log-only; old watch channels have no token)"))
    return not s.CALENDAR_WEBHOOK_ENFORCE
