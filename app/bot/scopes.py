"""Scopes for per-bot API keys (Bot API, /api/bot/v1). Pure module: no settings, no I/O.

Phase 1 is READ-ONLY. There is deliberately no scope for sending WhatsApp messages to customers,
for the full backup, or for any write; those endpoints do not exist on the Bot API at all.
"""
from __future__ import annotations

from typing import Iterable

SCOPES: dict[str, str] = {
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

# Planned, NOT implemented. Keys cannot be created with them yet.
RESERVED_SCOPES: dict[str, str] = {
    "notes:write": "planned: add a note / follow-up to a lead",
    "tasks:write": "planned: create / complete a task",
}

DEFAULT_SCOPES: tuple[str, ...] = (
    "leads:read", "messages:read", "notes:read", "tasks:read", "musicians:read", "finance:summary",
)

PRESETS: dict[str, tuple[str, ...]] = {
    "default": DEFAULT_SCOPES,
    "all-read": tuple(SCOPES),
}

_IMPLIED: dict[str, tuple[str, ...]] = {"finance:read": ("finance:summary",)}


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
    """'default' | 'all-read' | comma list -> validated scope list (raises ValueError)."""
    arg = (arg or "").strip()
    if arg in PRESETS:
        return list(PRESETS[arg])
    out: list[str] = []
    for s in (x.strip() for x in arg.split(",")):
        if not s:
            continue
        if s in RESERVED_SCOPES:
            raise ValueError(f"scope '{s}' is planned but not available yet")
        if s not in SCOPES:
            raise ValueError(f"unknown scope '{s}'. Known: {', '.join(SCOPES)}")
        if s not in out:
            out.append(s)
    if not out:
        raise ValueError("no scopes given")
    return out
