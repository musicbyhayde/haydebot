"""Public quote links.

Each quote in leads.Quote_Data.quotes carries a random `token` (secrets.token_urlsafe, 24 bytes
-> 32 chars, ~192 bits). The public page /quote/<token> resolves only that quote and returns
the minimum the page renders. Old links (/quote/<lead id>?qid=...) keep working while
QUOTE_LEGACY_ID_LINKS is true (default) so links already sent to customers don't break;
set it to false to cut them off (run migrations/backfill_quote_tokens.sql first so every
existing quote has a token the dashboard can share).
"""
from __future__ import annotations

import re
import secrets
from typing import Any, Optional

TOKEN_RE = re.compile(r"^[A-Za-z0-9_-]{32,64}$")
LEAD_ID_RE = re.compile(r"^r[0-9a-f]{16}$")
# Fields of a quote the public page needs (QuotePreview + page title). Everything else stays private.
PUBLIC_QUOTE_FIELDS = ("id", "title", "description", "inclusions", "terms", "amount",
                       "notIncludingVat", "service", "date", "location", "addons")


def new_token() -> str:
    return secrets.token_urlsafe(24)


def quotes_of(quote_data: Any) -> list[dict]:
    if not isinstance(quote_data, dict):
        return []
    qs = quote_data.get("quotes")
    if isinstance(qs, list):
        return [q for q in qs if isinstance(q, dict)]
    # legacy single-quote shape: the object itself is the quote
    return [quote_data] if quote_data else []


def ensure_tokens(quote_data: Any) -> Any:
    """Give every quote in a `quotes` list its own token; valid existing tokens are kept.
    A duplicated token (e.g. a quote copied from another) is replaced so one token always
    resolves to exactly one quote. Returns a new object; non-list shapes are returned unchanged."""
    if not isinstance(quote_data, dict) or not isinstance(quote_data.get("quotes"), list):
        return quote_data
    seen: set = set()
    quotes = []
    for q in quote_data["quotes"]:
        if isinstance(q, dict):
            t = q.get("token")
            if not (isinstance(t, str) and TOKEN_RE.match(t)) or t in seen:
                t = new_token()
                q = {**q, "token": t}
            seen.add(t)
        quotes.append(q)
    return {**quote_data, "quotes": quotes}


def is_token(key: str) -> bool:
    return bool(TOKEN_RE.match(key or "")) and not LEAD_ID_RE.match(key or "")


def pick_by_token(quote_data: Any, token: str) -> Optional[dict]:
    for q in quotes_of(quote_data):
        t = q.get("token")
        if isinstance(t, str) and secrets.compare_digest(t, token):
            return q
    return None


def pick_legacy(quote_data: Any, qid: Optional[str]) -> Optional[dict]:
    qs = quotes_of(quote_data)
    if not qs:
        return None
    if qid:
        for q in qs:
            if q.get("id") == qid:
                return q
    return qs[-1]


def public_payload(lead_fields: dict, quote: dict) -> dict:
    return {
        "name": lead_fields.get("Name") or "",
        "date": lead_fields.get("Event_Date") or "",
        "quote": {k: quote[k] for k in PUBLIC_QUOTE_FIELDS if k in quote},
    }
