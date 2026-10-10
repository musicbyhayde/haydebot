"""Parsing of free-text dates (Event_Date, Due_Date) into real calendar days.

The text columns stay the source of display; the parsed day is stored alongside
(leads.Event_Day, tasks.Due_Day) so sorting, filters and reports can rely on it.
Accepted: '2026-06-20', '20.06.2026', '20.6.26', '20/6/26', '20-06-2026', with any
extra text around it ('20.06.2026 (מחר בערב)', '(6/5) 06.05.2025', '20.06.2026 21:00').
The first date-like token wins; ISO is preferred when present. Placeholder years
(e.g. 01.01.0001) and impossible dates return None.
"""
from __future__ import annotations

import re
from datetime import date
from typing import Any, Optional

_DMY = re.compile(r"(?<!\d)(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})(?!\d)")
_YMD = re.compile(r"(?<!\d)(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)")
_LEAD_PAREN = re.compile(r"^\s*\([^)]*\)\s*")
MIN_YEAR, MAX_YEAR = 2000, 2100


def parse_event_date(value: Any) -> Optional[date]:
    if not value:
        return None
    if isinstance(value, date):
        return value
    s = str(value).strip()
    # '(6/5) 06.05.2025': the leading parenthetical is a note, not the date
    core = _LEAD_PAREN.sub("", s) or s
    for text in (core, s):
        for rx, order in ((_YMD, "ymd"), (_DMY, "dmy")):
            m = rx.search(text)
            if not m:
                continue
            try:
                if order == "ymd":
                    y, mo, d = int(m[1]), int(m[2]), int(m[3])
                else:
                    d, mo, y = int(m[1]), int(m[2]), int(m[3])
                    if len(m[3]) == 2:
                        y += 2000
                if not (MIN_YEAR <= y <= MAX_YEAR):
                    return None
                return date(y, mo, d)
            except ValueError:
                return None
    return None


def iso_day(value: Any) -> Optional[str]:
    """Parsed day as 'YYYY-MM-DD' for the DB, or None."""
    d = parse_event_date(value)
    return d.isoformat() if d else None


def with_parsed_days(data: dict, pairs: tuple[tuple[str, str], ...]) -> dict:
    """Copy of `data` where each present text field also writes its parsed day column.
    Only fields present in `data` are touched, so partial updates never clear the day."""
    out = dict(data)
    for text_key, day_key in pairs:
        if text_key in data and day_key not in data:
            out[day_key] = iso_day(data[text_key])
    return out


LEAD_DAY_FIELDS = (("Event_Date", "Event_Day"),)
TASK_DAY_FIELDS = (("Due_Date", "Due_Day"),)
