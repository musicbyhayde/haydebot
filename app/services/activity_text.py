"""Texts of the activity log ("היסטוריה") and of system notes, shared by the dashboard API
(app/api/routes.py) and the Bot API write endpoints (app/bot/writes.py), so an action looks the
same in the dashboard whoever did it. Pure functions: (action_type, description[, note]).
"""
from __future__ import annotations

from typing import Optional

PARTNERS: tuple[str, ...] = ("אילן", "קובי")  # = frontend/lib/constants.ts OWNERS


def owner_change_needs_note(previous_owner: Optional[str], new_owner: Optional[str]) -> bool:
    """Owner rules (improvement #4, Ilan 2026-10-05): the first assignment of a lead without an
    owner needs no note, in any status; a hand-over to another partner or removing the owner
    needs a hand-over note. (The Bot API is stricter: it always requires a note.)"""
    prev = (previous_owner or "").strip()
    return bool(prev) and prev != (new_owner or "").strip()


OWNER_VIA_NOTE_PROMPT = "note_prompt"   # "you added a note, make you the owner?" in the dashboard
OWNER_VIA_SUFFIX = {OWNER_VIA_NOTE_PROMPT: " · אחרי הוספת הערה ראשונה"}


def note_added(content: Optional[str]) -> tuple[str, str]:
    return "הוספת עדכון", f"הוסיף/ה עדכון: {(content or '')[:30]}..."


def task_created(title: str) -> tuple[str, str]:
    return "משימה חדשה", f"יצר/ה משימה: {title}"


def status_changed(status: str) -> tuple[str, str]:
    return "שינוי סטטוס", f"הסטטוס שונה ל-{status}"


def owner_updated(new_owner: Optional[str]) -> tuple[str, str]:
    return "עדכון מוביל", f"מוביל עודכן ל-{new_owner if new_owner else 'ללא מוביל'}"


def owner_transfer(previous_owner: str, new_owner: str, handover_note: str = "") -> tuple[str, str, str]:
    """-> (action_type, activity description, note content) for an owner hand-over."""
    if previous_owner and new_owner:
        note = f"🔄 העברת מוביל: הטיפול בליד הועבר מ-{previous_owner} ל-{new_owner}"
        desc, action = f"העברת מוביל מ-{previous_owner} ל-{new_owner}", "העברת מוביל"
    elif new_owner and not previous_owner:
        note = f"👤 שיוך מוביל: {new_owner} הוגדר/ה כמוביל/ת הליד"
        desc, action = f"שייך/ה את הליד ל-{new_owner}", "שיוך מוביל"
    elif previous_owner and not new_owner:
        note = f"⚠️ הסרת מוביל: הוסר השיוך של {previous_owner}"
        desc, action = f"הסיר/ה את המוביל ({previous_owner})", "הסרת מוביל"
    else:
        note = "🔄 עדכון מוביל ליד"
        desc, action = "עדכון מוביל ליד", "עדכון מוביל"
    if handover_note:
        note += f"\n\n💬 הערת העברה: {handover_note}"
        desc += f" ({handover_note[:30]}...)" if len(handover_note) > 30 else f" ({handover_note})"
    return action, desc, note


# Activity rows written for finance entries (POST /finance). A viewer sees them only when the
# entry belongs to a lead (deal finance); general income/expenses stay hidden (viewer access).
FINANCE_ACTION_TYPES = frozenset({"הכנסה/הוצאה", "הוצאה"})


def visible_to_viewer(activity: dict) -> bool:
    f = activity.get("fields") or {}
    return not (f.get("action_type") in FINANCE_ACTION_TYPES and not f.get("lead_id"))
