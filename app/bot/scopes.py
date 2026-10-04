"""Scopes for per-bot API keys (Bot API, /api/bot/v1). Pure module: no settings, no I/O.

Read scopes cover the CRM data. Write scopes (phase 2) allow a few narrow, reversible actions and
only work while the server has BOT_API_WRITE_ENABLED=true. There is deliberately no scope for
sending WhatsApp / any message to customers, for deleting leads, for finance writes or for the
full backup; those endpoints do not exist on the Bot API at all.
"""
from __future__ import annotations

from typing import Iterable

READ_SCOPES: dict[str, str] = {
    "leads:read": "Leads (customers / events): list + filters, detail, upcoming events, stats, "
                  "'needs attention'. Phone numbers are masked.",
    "messages:read": "WhatsApp conversation history of a lead (read only).",
    "notes:read": "Internal notes on leads and follow-up reminders.",
    "tasks:read": "Team tasks.",
    "musicians:read": "Musicians: name, type, active, score. No phone / email / bank details.",
    "finance:summary": "Aggregated finance (totals per owner / month) and deal amounts on leads.",
    "finance:read": "Individual finance ledger entries, quotes and commissions (includes finance:summary).",
    "pii:read": "Unmasked phone numbers and emails, links to media files and note attachments.",
}

WRITE_SCOPES: dict[str, str] = {
    "notes:write": "Add a note / update to a lead (author bot:<name>); mark a follow-up done or postpone it.",
    "tasks:write": "Create a team task; mark it done / reopen, change due date or assignee.",
    "crew:write": "Add / remove a musician on an event's crew (lead Musician_Team). No calendar invites.",
    "leads:write": "Limited lead changes: pipeline status (not Closed), owner hand-over with a note, "
                   "event date / location / guests. No phone, name, amounts or deletes.",
}

SCOPES: dict[str, str] = {**READ_SCOPES, **WRITE_SCOPES}

# Planned, NOT implemented. Keys cannot be created with them.
RESERVED_SCOPES: dict[str, str] = {}

DEFAULT_SCOPES: tuple[str, ...] = (
    "leads:read", "messages:read", "notes:read", "tasks:read", "musicians:read", "finance:summary",
)

PRESETS: dict[str, tuple[str, ...]] = {
    "default": DEFAULT_SCOPES,
    "all-read": tuple(READ_SCOPES),
    "all-write": tuple(WRITE_SCOPES),
}

_IMPLIED: dict[str, tuple[str, ...]] = {"finance:read": ("finance:summary",)}


def is_write_scope(scope: str) -> bool:
    return scope in WRITE_SCOPES


def effective_scopes(granted: Iterable[str] | None) -> frozenset[str]:
    """Known scopes from a key row, plus implied ones. Unknown/reserved values are ignored."""
    out: set[str] = set()
    for s in granted or ():
        s = (s or "").strip()
        if s in SCOPES:
            out.add(s)
            out.update(_IMPLIED.get(s, ()))
    return frozenset(out)


def parse_scope_arg(arg: str) -> list[str]:
    """'default' | 'all-read' | 'all-write' | comma list of scopes and/or presets
    (e.g. 'default,notes:write,tasks:write') -> validated scope list (raises ValueError)."""
    out: list[str] = []
    for s in (x.strip() for x in (arg or "").split(",")):
        if not s:
            continue
        if s in PRESETS:
            items = list(PRESETS[s])
        elif s in RESERVED_SCOPES:
            raise ValueError(f"scope '{s}' is planned but not available yet")
        elif s in SCOPES:
            items = [s]
        else:
            raise ValueError(f"unknown scope '{s}'. Known: {', '.join(SCOPES)}; presets: {', '.join(PRESETS)}")
        out.extend(i for i in items if i not in out)
    if not out:
        raise ValueError("no scopes given")
    return out
