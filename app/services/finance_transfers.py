"""
Partner transfers ("העברה בין שותפים", Ilan 2026-10-08): money moved from one partner's pool to
another partner's pool. Stored in public.finance_transfers (migrations/add_finance_transfers.sql),
never in public.finance, so income / expenses / profit stay exactly as before.

A "pool" (מצבור) = partner (finance.Owner) x payment method. There are two pools per partner:
  "מזומן" (cash -> cash_balance) and "חשבון" (bank / credit / transfer / Bit -> bank_balance).

Effect on GET /finance/summary (per partner):
  balance      -= amount for the sender, += amount for the receiver  (יתרה = money held)
  cash/bank    -= / += in the chosen pools, so cash_balance + bank_balance == balance still holds
  income, expenses: unchanged. The sum over all partners is unchanged.

Rules (approved defaults): one source pool and one destination pool per transfer, sender and
receiver are different partners, amount > 0, a source pool may go negative (the UI warns),
archive instead of delete. Partners are validated against the existing PARTNERS list.
"""
from __future__ import annotations

import logging
import re
import time
from datetime import date
from typing import Iterable, Optional

from app.services.activity_text import PARTNERS, TRANSFER_ACTION_TYPE

logger = logging.getLogger("haydebot.finance_transfers")

TABLE = "finance_transfers"
POOL_CASH = "מזומן"
POOL_BANK = "חשבון"
POOLS = (POOL_CASH, POOL_BANK)
POOL_KEY = {POOL_CASH: "cash_balance", POOL_BANK: "bank_balance"}
ACTION_TYPE = TRANSFER_ACTION_TYPE   # activities.action_type (hidden from viewers: no lead)
MAX_AMOUNT = 10_000_000
MAX_NOTE = 500
EDITABLE = ("transfer_date", "amount", "from_partner", "from_pool", "to_partner", "to_pool", "note")

_last_warn = {"t": 0.0}


class TransferError(ValueError):
    def __init__(self, detail: str, status: int = 400):
        super().__init__(detail)
        self.detail = detail
        self.status = status


def _partner(value, field: str) -> str:
    v = (value or "").strip() if isinstance(value, str) else ""
    if v not in PARTNERS:
        raise TransferError(f"{field}: שותף לא מוכר")
    return v


def _pool(value, field: str) -> str:
    v = (value or "").strip() if isinstance(value, str) else ""
    if v not in POOLS:
        raise TransferError(f"{field}: מצבור חייב להיות מזומן או חשבון")
    return v


def _amount(value) -> float:
    try:
        a = round(float(value), 2)
    except (TypeError, ValueError):
        raise TransferError("סכום לא תקין")
    if not (a > 0) or a > MAX_AMOUNT or a != a:
        raise TransferError("הסכום חייב להיות גדול מ-0")
    return a


def _date(value) -> str:
    v = (value or "").strip() if isinstance(value, str) else ""
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", v):
        raise TransferError("תאריך לא תקין (YYYY-MM-DD)")
    try:
        date.fromisoformat(v)
    except ValueError:
        raise TransferError("תאריך לא תקין (YYYY-MM-DD)")
    return v


def _note(value) -> Optional[str]:
    if value is None:
        return None
    if not isinstance(value, str):
        raise TransferError("הערה לא תקינה")
    v = value.strip()
    if len(v) > MAX_NOTE:
        raise TransferError(f"הערה ארוכה מדי (עד {MAX_NOTE} תווים)")
    return v or None


def _check_pair(row: dict) -> None:
    if row["from_partner"] == row["to_partner"]:
        raise TransferError("העברה חייבת להיות בין שני שותפים שונים")


def validate_new(body: dict) -> dict:
    """Normalized columns for a new transfer, or TransferError (400)."""
    if not isinstance(body, dict):
        raise TransferError("גוף הבקשה חייב להיות JSON")
    row = {
        "transfer_date": _date(body.get("transfer_date") or date.today().isoformat()),
        "amount": _amount(body.get("amount")),
        "from_partner": _partner(body.get("from_partner"), "מאת"),
        "from_pool": _pool(body.get("from_pool"), "מצבור מקור"),
        "to_partner": _partner(body.get("to_partner"), "אל"),
        "to_pool": _pool(body.get("to_pool"), "מצבור יעד"),
        "note": _note(body.get("note")),
    }
    _check_pair(row)
    return row


def validate_update(current: dict, body: dict) -> dict:
    """Changed columns only (may be empty), validated against the merged row."""
    if not isinstance(body, dict):
        raise TransferError("גוף הבקשה חייב להיות JSON")
    unknown = set(body) - set(EDITABLE)
    if unknown:
        raise TransferError("שדות לא ניתנים לעריכה: " + ", ".join(sorted(unknown)))
    parsers = {"transfer_date": _date, "amount": _amount,
               "from_partner": lambda v: _partner(v, "מאת"), "from_pool": lambda v: _pool(v, "מצבור מקור"),
               "to_partner": lambda v: _partner(v, "אל"), "to_pool": lambda v: _pool(v, "מצבור יעד"),
               "note": _note}
    changes = {k: parsers[k](v) for k, v in body.items()}
    merged = {k: current.get(k) for k in EDITABLE} | changes
    _check_pair(merged)
    return {k: v for k, v in changes.items() if current.get(k) != v}


def _float(v) -> float:
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


def _blank() -> dict:
    return {"income": 0, "expenses": 0, "balance": 0, "cash_balance": 0, "bank_balance": 0}


def apply_to_summary(summary: dict, transfers: Iterable[dict]) -> dict:
    """Add non-archived transfers to a per-partner summary (in place, also returned).
    Adds transfers_in / transfers_out to every partner row; income / expenses never change."""
    for row in summary.values():
        row.setdefault("transfers_in", 0)
        row.setdefault("transfers_out", 0)
    for t in transfers:
        if t.get("archived_at"):
            continue
        amount = _float(t.get("amount"))
        if amount <= 0:
            continue
        for who, pool, sign, key in ((t.get("from_partner"), t.get("from_pool"), -1, "transfers_out"),
                                     (t.get("to_partner"), t.get("to_pool"), 1, "transfers_in")):
            if not who:
                continue
            row = summary.setdefault(who, _blank())
            row.setdefault("transfers_in", 0)
            row.setdefault("transfers_out", 0)
            row["balance"] = row.get("balance", 0) + sign * amount
            pool_key = POOL_KEY.get(pool, "bank_balance")
            row[pool_key] = row.get(pool_key, 0) + sign * amount
            row[key] += amount
    return summary


def warn_unavailable(e: Exception) -> None:
    """The summary works without the table (deploy order safety); log at most every 5 minutes."""
    now = time.monotonic()
    if now - _last_warn["t"] > 300:
        _last_warn["t"] = now
        logger.warning("FINANCE_TRANSFERS: table not readable, summary without transfers: %s", type(e).__name__)


def activity_description(row: dict) -> str:
    return (f"מ{row['from_partner']} ({row['from_pool']}) ל{row['to_partner']} ({row['to_pool']}): "
            f"{float(row['amount']):,.0f} ₪")
