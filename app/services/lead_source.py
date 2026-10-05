"""Lead source / attribution detection (improvement #2).

Pure standard-library code (no app imports) so scripts/backfill_lead_source.py can run it
anywhere. It works on plain dicts whose keys are the DB column names (Lead_Source, ...).

Precedence for a NEW lead (first inbound message):
    1. WhatsApp ``referral`` object (click-to-WhatsApp ad / post)   -> ctwa
    2. Meta lead-form "thank you" auto message (he/en/fr/ar)        -> meta_form
    3. Website prefilled text ("... דרך האתר שלכם ...", [web:code])  -> website
    4. Same phone already had a lead -> keep that lead's original source (or "repeat")
    5. Anything else                                                -> whatsapp_direct
An explicit signal (1-3) always wins over 4-5. A source that was set by hand (dashboard /
manual lead) or by an explicit signal is never overwritten. An automatic guess (4-5) may be
upgraded by an explicit signal that arrives within UPGRADE_WINDOW of the lead's creation
(customers sometimes type a word before the prefilled text is sent).
"""
from __future__ import annotations

import re
import unicodedata
from datetime import datetime, timedelta, timezone
from typing import Iterable, Optional
from urllib.parse import parse_qsl, urlparse

# ── Values ────────────────────────────────────────────────────────────────────
LEAD_SOURCES = (
    "meta_form", "ctwa", "whatsapp_direct", "website", "referral", "repeat", "phone", "other",
)
LEAD_SOURCE_HE = {
    "meta_form": "טופס מטא",
    "ctwa": "מודעת וואטסאפ",
    "whatsapp_direct": "וואטסאפ ישיר",
    "website": "אתר",
    "referral": "המלצה",
    "repeat": "לקוח חוזר",
    "phone": "טלפון",
    "other": "אחר",
}
EXPLICIT_SOURCES = ("ctwa", "meta_form", "website")

# Text columns (nullable) + jsonb + timestamptz, see migrations/add_lead_source_columns.sql
SOURCE_TEXT_COLUMNS = (
    "Lead_Source", "Source_Detail",
    "Campaign_ID", "Campaign_Name", "Adset_ID", "Adset_Name", "Ad_ID", "Ad_Name",
    "Form_ID", "Form_Name",
    "UTM_Source", "UTM_Medium", "UTM_Campaign", "UTM_Content",
    "CTWA_CLID", "Meta_Lead_ID",
)
SOURCE_JSON_COLUMNS = ("Source_Referral", "Form_Answers")
SOURCE_COLUMNS = SOURCE_TEXT_COLUMNS + SOURCE_JSON_COLUMNS + ("Source_Detected_At",)
# Attribution a repeat lead inherits from the customer's earlier lead (never the per-touch ids).
INHERITED_COLUMNS = (
    "Lead_Source", "Campaign_ID", "Campaign_Name", "Adset_ID", "Adset_Name", "Ad_ID", "Ad_Name",
    "Form_ID", "Form_Name", "UTM_Source", "UTM_Medium", "UTM_Campaign", "UTM_Content",
)

AUTO_DIRECT_DETAIL = "זוהה אוטומטית"
REPEAT_DETAIL_PREFIX = "לקוח חוזר"
MANUAL_DETAIL = "עודכן ידנית"
MANUAL_CREATE_DETAIL = "ליד ידני"
UPGRADE_WINDOW = timedelta(hours=48)
MAX_DETAIL = 200

# ── Text normalisation ───────────────────────────────────────────────────────
_ARABIC_MARKS = re.compile(r"[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]")
_BIDI = re.compile(r"[\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]")


def normalize_text(text: Optional[str]) -> str:
    """NFKC, no bidi marks / Arabic diacritics, straight quotes, NBSP -> space."""
    if not text:
        return ""
    t = unicodedata.normalize("NFKC", str(text))
    t = _BIDI.sub("", t)
    t = _ARABIC_MARKS.sub("", t)
    t = t.replace("\u00a0", " ").replace("’", "'").replace("‘", "'").replace("`", "'")
    return t


def _clip(value, n: int = MAX_DETAIL) -> Optional[str]:
    if value is None:
        return None
    s = re.sub(r"\s+", " ", str(value)).strip()
    return s[:n] if s else None


def _digits(phone) -> str:
    return re.sub(r"\D", "", str(phone or ""))


def phones_match(p1, p2) -> bool:
    """Same rule as WhatsAppLogic._phones_match: last 9 digits."""
    a, b = _digits(p1), _digits(p2)
    if a.startswith("0"):
        a = "972" + a[1:]
    if b.startswith("0"):
        b = "972" + b[1:]
    return bool(a and b) and a[-9:] == b[-9:]


# ── Meta lead-form auto message ──────────────────────────────────────────────
_META_OPENERS = (
    ("he", re.compile(r"השלמתי\s+את\s+הטופס")),
    ("en", re.compile(r"\bi\s+filled\s+(?:out|in)\s+your\s+form", re.I)),
    ("fr", re.compile(r"j\s*'?\s*ai\s+rempli\s+votre\s+formulaire", re.I)),
    ("ar", re.compile(r"قمت\s+بملء\s+النموذج|بملء\s+النموذج\s+الخاص\s+بك")),
)
_FORM_KEYS = {
    "full name": "full_name", "name": "full_name", "שם מלא": "full_name",
    "phone number": "phone", "phone": "phone", "מספר טלפון": "phone", "טלפון": "phone",
    "email": "email", "אימייל": "email",
}
_EVENT_KEY = re.compile(r"סוג\s*ה?אירוע|event\s*type", re.I)
_LINE_KV = re.compile(r"^\s*([^:\n]{1,60}?)\s*:\s*(.*)$")


def _form_key(raw_key: str) -> Optional[str]:
    k = re.sub(r"[_\s]+", " ", raw_key).strip().lower()
    if k in _FORM_KEYS:
        return _FORM_KEYS[k]
    if _EVENT_KEY.search(k):
        return "event_type"
    return None


def meta_form_language(text: Optional[str]) -> Optional[str]:
    t = normalize_text(text)
    for lang, rx in _META_OPENERS:
        if rx.search(t):
            return lang
    return None


def parse_meta_form(text: Optional[str], whatsapp_phone: Optional[str] = None) -> Optional[dict]:
    """Parse the WhatsApp message Meta sends from a lead form's thank-you screen.

    Returns None when the text is not such a message. Otherwise a dict with language,
    full_name, phone, event_type, answers (other "question: answer" lines), note (free text
    the customer typed into the prefilled message) and phone_matches_whatsapp.
    Detection: the opener in he/en/fr/ar, or (opener deleted) at least two known form lines.
    """
    t = normalize_text(text)
    if not t.strip():
        return None
    lang = meta_form_language(t)
    out: dict = {"language": lang, "answers": {}}
    known = 0
    notes = []
    for i, line in enumerate(t.split("\n")):
        if not line.strip():
            continue
        if i == 0 and lang:
            continue  # the opener itself
        m = _LINE_KV.match(line)
        key = _form_key(m.group(1)) if m else None
        if key:
            known += 1
            val = m.group(2).strip()
            if key == "event_type":
                val = val.replace("_", " ").strip()
            if val and key not in out:
                out[key] = _clip(val, 120)
            continue
        if m and ("?" in m.group(1) or "_" in m.group(1)) and len(m.group(1)) <= 60:
            out["answers"][m.group(1).replace("_", " ").strip()] = _clip(m.group(2), 200) or ""
            continue
        notes.append(line.strip())
    if not lang and known < 2:
        return None
    if notes:
        out["note"] = _clip(" ".join(notes), 300)
    if out.get("phone"):
        out["phone"] = re.sub(r"[^\d+]", "", out["phone"]) or None
        if whatsapp_phone and out.get("phone"):
            out["phone_matches_whatsapp"] = phones_match(out["phone"], whatsapp_phone)
    if not out["answers"]:
        out.pop("answers")
    return out


# ── Website prefilled text / codes / UTM ─────────────────────────────────────
_WEBSITE_RX = re.compile(
    r"(?:מגיע(?:ה)?|הגעתי|פונה|פונים)\s+(?:אליכם\s+)?(?:דרך|מ)\s*ה?אתר"
    r"|via\s+your\s+website|from\s+your\s+website",
    re.I,
)
_WEB_CODE = re.compile(r"\[(?:web|site|src)\s*[:=]\s*([^\]\s]{1,80})\]", re.I)
_UTM_KV = re.compile(r"\butm_(source|medium|campaign|content)\s*[=:]\s*([^\s&\]\)]+)", re.I)
_TOPIC = re.compile(r"(?:לגבי|על)\s+(.+?)(?:\s+לאירוע\b|\s+ואיך\b|[.?!]|$)")


def parse_utm(text_or_url: Optional[str]) -> dict:
    """utm_* values from a URL query string or from free text (utm_source=x ...)."""
    out: dict = {}
    s = normalize_text(text_or_url)
    if not s:
        return out
    try:
        q = urlparse(s.strip()).query if "://" in s else ""
        for k, v in parse_qsl(q):
            k = k.lower()
            if k.startswith("utm_") and k[4:] in ("source", "medium", "campaign", "content") and v:
                out["UTM_" + k[4:].capitalize()] = _clip(v, 120)
    except ValueError:
        pass
    for k, v in _UTM_KV.findall(s):
        out.setdefault("UTM_" + k.lower().capitalize(), _clip(v, 120))
    return out


def parse_website(text: Optional[str]) -> Optional[dict]:
    """Website WhatsApp button text. Returns None if not a website message.
    Keys: topic, code (from [web:<code>]) and UTM_* fields."""
    t = normalize_text(text)
    code_m = _WEB_CODE.search(t)
    if not (_WEBSITE_RX.search(t) or code_m):
        return None
    out: dict = {"matched": True}
    if code_m:
        out["code"] = code_m.group(1)
    body = _WEB_CODE.sub(" ", t)
    tm = _TOPIC.search(body.split("האתר", 1)[-1])
    if tm:
        topic = tm.group(1).strip()
        if topic and topic not in ("האירוע שלי", "האירוע"):
            out["topic"] = _clip(topic, 120)
    out.update(parse_utm(t))
    return out


# ── Click-to-WhatsApp referral ───────────────────────────────────────────────
def parse_referral(referral) -> dict:
    """Source columns from the ``referral`` object of a WhatsApp Cloud API message
    (click-to-WhatsApp ad or post). Empty dict when there is no usable referral."""
    if not isinstance(referral, dict) or not referral:
        return {}
    src_type = str(referral.get("source_type") or "").lower()
    src_id = referral.get("source_id")
    url = referral.get("source_url")
    headline = referral.get("headline") or referral.get("body")
    detail_bits = []
    if src_type and src_type != "ad":
        detail_bits.append(src_type)
    if headline:
        detail_bits.append(str(headline))
    elif url:
        detail_bits.append(str(url))
    out = {
        "Lead_Source": "ctwa",
        "Source_Detail": _clip(" · ".join(detail_bits)),
        "Source_Referral": dict(referral),
        "CTWA_CLID": _clip(referral.get("ctwa_clid"), 500),
    }
    if src_id and src_type in ("ad", ""):
        out["Ad_ID"] = _clip(src_id, 64)
    if url:
        out.update(parse_utm(url))
    return {k: v for k, v in out.items() if v not in (None, "", {})}


# ── Classification ───────────────────────────────────────────────────────────
def _now(now: Optional[datetime]) -> datetime:
    return now or datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def detect_explicit(text: Optional[str], referral=None, whatsapp_phone: Optional[str] = None) -> dict:
    """Columns for an explicit source signal in one inbound message; {} when there is none."""
    out: dict = {}
    ref = parse_referral(referral)
    form = parse_meta_form(text, whatsapp_phone)
    web = parse_website(text) if form is None else None
    if ref:
        out.update(ref)
    if form is not None:
        if not ref:
            out["Lead_Source"] = "meta_form"
            out["Source_Detail"] = _clip(form.get("event_type"))
        out["Form_Answers"] = form
    elif web is not None:
        if not ref:
            out["Lead_Source"] = "website"
            out["Source_Detail"] = _clip(web.get("topic"))
            if web.get("code"):
                out["UTM_Campaign"] = _clip(web["code"], 120)
                out.setdefault("UTM_Source", "website")
        for k in ("UTM_Source", "UTM_Medium", "UTM_Campaign", "UTM_Content"):
            if web.get(k):
                out.setdefault(k, web[k])
    return {k: v for k, v in out.items() if v not in (None, "", {})}


def _created_at(rec: dict) -> Optional[datetime]:
    raw = rec.get("createdTime") or rec.get("created_at") or (rec.get("fields") or {}).get("created_at")
    if not raw:
        return None
    try:
        dt = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _fields(rec: dict) -> dict:
    return rec.get("fields", rec) if isinstance(rec, dict) else {}


def inherit_from_previous(previous_leads: Iterable[dict], exclude_id: Optional[str] = None) -> dict:
    """Columns for a repeat customer: the original (oldest) earlier lead's attribution, or
    plain "repeat" when no earlier lead has a source yet. {} when there is no earlier lead."""
    prev = [p for p in (previous_leads or []) if p and p.get("id") != exclude_id]
    if not prev:
        return {}
    prev.sort(key=lambda p: _created_at(p) or datetime.max.replace(tzinfo=timezone.utc))
    origin = next((p for p in prev if _fields(p).get("Lead_Source") not in (None, "", "repeat")), None)
    if not origin:
        return {"Lead_Source": "repeat", "Source_Detail": f"{REPEAT_DETAIL_PREFIX} · ליד קודם {prev[0].get('id')}"}
    f = _fields(origin)
    out = {c: f.get(c) for c in INHERITED_COLUMNS if f.get(c) not in (None, "")}
    out["Source_Detail"] = f"{REPEAT_DETAIL_PREFIX} · ליד קודם {origin.get('id')}"
    return out


def classify_new_lead(text: Optional[str], referral=None, whatsapp_phone: Optional[str] = None,
                      previous_leads: Iterable[dict] = (), lead_id: Optional[str] = None,
                      now: Optional[datetime] = None) -> dict:
    """All source columns for a lead created from its first inbound message. Always returns
    Lead_Source (+ Source_Detected_At)."""
    out = detect_explicit(text, referral, whatsapp_phone)
    if out.get("Lead_Source") not in EXPLICIT_SOURCES:
        rep = inherit_from_previous(previous_leads, exclude_id=lead_id)
        if rep:
            out.update(rep)
        else:
            out["Lead_Source"] = "whatsapp_direct"
            out["Source_Detail"] = AUTO_DIRECT_DETAIL
    out["Source_Detected_At"] = _iso(_now(now))
    return out


def is_weak_source(fields: dict) -> bool:
    """True when the current source is an automatic guess an explicit signal may replace."""
    src = fields.get("Lead_Source")
    if not src:
        return True
    detail = fields.get("Source_Detail") or ""
    return (src == "whatsapp_direct" and detail == AUTO_DIRECT_DETAIL) or detail.startswith(REPEAT_DETAIL_PREFIX)


def refine_existing_lead(lead: dict, text: Optional[str], referral=None, whatsapp_phone: Optional[str] = None,
                         now: Optional[datetime] = None) -> dict:
    """Update (possibly {}) for a later inbound message on an existing lead.
    - a referral is always kept: Source_Referral / CTWA_CLID are filled if still empty;
    - an explicit signal replaces a missing or automatic source while the lead is new
      (within UPGRADE_WINDOW of creation; unknown creation time: only when there is no source)."""
    f = _fields(lead)
    exp = detect_explicit(text, referral, whatsapp_phone)
    if not exp:
        return {}
    upd: dict = {}
    if exp.get("Source_Referral") and not f.get("Source_Referral"):
        upd["Source_Referral"] = exp["Source_Referral"]
        if exp.get("CTWA_CLID") and not f.get("CTWA_CLID"):
            upd["CTWA_CLID"] = exp["CTWA_CLID"]
    created = _created_at(lead)
    in_window = created is not None and _now(now) - created <= UPGRADE_WINDOW
    if created is None:
        in_window = not f.get("Lead_Source")
    if exp.get("Lead_Source") in EXPLICIT_SOURCES and is_weak_source(f) and in_window:
        inherited = (f.get("Source_Detail") or "").startswith(REPEAT_DETAIL_PREFIX)
        for k, v in exp.items():
            if k in ("Lead_Source", "Source_Detail") or inherited or not f.get(k):
                upd[k] = v
        if inherited:  # drop attribution copied from the customer's earlier lead
            for c in INHERITED_COLUMNS:
                if f.get(c) and c not in upd:
                    upd[c] = None
        upd["Source_Detected_At"] = _iso(_now(now))
    return upd


def source_label(value: Optional[str]) -> str:
    return LEAD_SOURCE_HE.get(value or "", value or "לא ידוע")


def form_name_if_useful(current_name: Optional[str], form: Optional[dict]) -> Optional[str]:
    """The form's full name, only when the lead has no real name (WhatsApp sent none)."""
    if not form or not form.get("full_name"):
        return None
    cur = (current_name or "").strip()
    if cur and cur.lower() not in ("unknown", "ללא שם"):
        return None
    return form["full_name"]
