"""Improvement #2: lead source / attribution.

Detection samples are real first messages from production with the name and phone replaced
(structure, opener, line order, key spelling, NBSP / diacritics and the event values kept).
"""
import asyncio
import json
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services import lead_source as L

WA = "972501234567"

# ── anonymised real samples ───────────────────────────────────────────────────────────
HE_FORM = ("הי! השלמתי את הטופס שלך, וברצוני לדעת יותר על העסק שלך.\n\n"
           "מה סוג האירוע שלכם?: חתונה\nFull name: ישראל ישראלי\nPhone number: +972501234567")
HE_FORM_PHONE_FIRST = ("הי! השלמתי את הטופס שלך, וברצוני לדעת יותר על העסק שלך.\n\n"
                       "Phone number: +972501234567\nמה סוג האירוע שלכם?: בר מצווה\nFull name: Test Person")
HE_FORM_UNDERSCORE = ("הי! השלמתי את הטופס שלך, וברצוני לדעת יותר על העסק שלך.\n\n"
                      "מה_סוג_האירוע_שלכם?: יום_הולדת\nfull_name: דנה טסט\nphone_number: +972501234567")
EN_FORM = ("Hello! I filled out your form and would like to know more about your business.\n\n"
           "Full name: Dana Test\nPhone number: +972501234567\nמה סוג האירוע שלכם?: יום הולדת")
EN_FORM_IN = ("Hello! I filled in your form and would like to know more about your business.\n\n"
              "מה סוג האירוע שלכם?: אחר\nFull name: Avi Test\nPhone number: +972501234567")
FR_FORM = ("Bonjour\xa0! J’ai rempli votre formulaire et j’aimerais en savoir plus sur votre entreprise.\n\n"
           "Full name: Marie Test\nPhone number: +33612345678\nמה סוג האירוע שלכם?: חתונה")
AR_FORM = ("مرحبًا! لقد قمتُ بملء النموذج الخاص بك وأريد معرفة المزيد عن نشاطك التجاري.\n\n"
           "מה סוג האירוע שלכם?: אירוע חברה\nFull name: Test Person\nPhone number: +972501234567")
HE_OPENER_ONLY = "הי! השלמתי את הטופס שלך, וברצוני לדעת יותר על העסק שלך."
HE_FORM_TYPED = ("הי! השלמתי את הטופס שלך, וברצוני לדעת יותר על העסק שלך.\n\n"
                 "Phone number: +972501234567\nמה סוג האירוע שלכם?: אחר\nFull name: Test Person\n"
                 "מסעדה קטנה עם אווירה רוצים לעשות קבלת שבת: בערב")
HE_FORM_LOCAL_PHONE = ("הי! השלמתי את הטופס שלך, וברצוני לדעת יותר על העסק שלך.\n\n"
                       "מה סוג האירוע שלכם?: חתונה\nFull name: Test\nPhone number: 0501234567")
HE_FORM_OTHER_PHONE = ("הי! השלמתי את הטופס שלך, וברצוני לדעת יותר על העסק שלך.\n\n"
                       "מה סוג האירוע שלכם?: אירוע להנהלה כ60 אנשים\nFull name: Test\nphone_number: +972529998877")
NO_OPENER_FORM = "Full name: Test Person\nPhone number: +972501234567\nמה סוג האירוע שלכם?: חתונה"

WEB_BAND = "היי אני מגיע אליכם דרך האתר שלכם . אשמח לקבל מידע נוסף על להקת היידה ואיך אפשר לשלב אותה באירוע שלי?"
WEB_BOUZOUKI = "היי אני מגיע אליכם דרך האתר שלכם. אשמח לייעוץ לגבי נגן בוזוקי לאירוע שלי."
WEB_GENERAL = "היי אני מגיע אליכם דרך האתר שלכם. אשמח לייעוץ לגבי האירוע שלי."
WEB_ETHNO = "היי אני מגיע אליכם דרך האתר שלכם. אשמח לייעוץ לגבי EthnoBeat לאירוע שלי."
WEB_CODE = "היי אני מגיע אליכם דרך האתר שלכם. אשמח לייעוץ לגבי הלהקה לאירוע שלי. [web:summer26]"
WEB_UTM = "היי אני מגיע אליכם דרך האתר שלכם utm_source=google utm_medium=cpc utm_campaign=wedding"

DIRECT = ["היי", "עושים שבת חתן?", "ערב טוב  \nאשמח לדעת מה העלות שאתם גובים", "[AUDIO RECEIVED]",
          "Shalom, hope all is well! I’m Dan from Miami. \nCrazy question but do you play abroad?",
          "היי אשמח לקבל פרטים על גב במה", "", None]

REFERRAL = {
    "source_url": "https://fb.me/2abcDEF?utm_source=facebook&utm_campaign=wedding_oct",
    "source_id": "120211111111111111",
    "source_type": "ad",
    "headline": "להקה לחתונה שלכם",
    "body": "דברו איתנו בוואטסאפ",
    "media_type": "image",
    "image_url": "https://scontent.example/x.jpg",
    "ctwa_clid": "ARAkLkA8rmlFeiCktEJQ-QTwRiyYHAFDLMNDBH0CD3qpjd0HR4irJ6LEkR7J",
}


# ── Meta form ─────────────────────────────────────────────────────────────────────────
@pytest.mark.parametrize("text,lang,event", [
    (HE_FORM, "he", "חתונה"), (HE_FORM_PHONE_FIRST, "he", "בר מצווה"),
    (HE_FORM_UNDERSCORE, "he", "יום הולדת"), (EN_FORM, "en", "יום הולדת"), (EN_FORM_IN, "en", "אחר"),
    (FR_FORM, "fr", "חתונה"), (AR_FORM, "ar", "אירוע חברה"),
])
def test_meta_form_languages_and_line_orders(text, lang, event):
    form = L.parse_meta_form(text, WA)
    assert form["language"] == lang and form["event_type"] == event
    assert form["full_name"] and form["phone"].lstrip("+").isdigit()
    cols = L.detect_explicit(text, None, WA)
    assert cols["Lead_Source"] == "meta_form" and cols["Source_Detail"] == event
    assert cols["Form_Answers"] == form


def test_meta_form_arabic_without_diacritics_and_opener_only():
    assert L.meta_form_language("مرحبا! لقد قمت بملء النموذج الخاص بك") == "ar"
    form = L.parse_meta_form(HE_OPENER_ONLY)
    assert form == {"language": "he"}
    assert L.detect_explicit(HE_OPENER_ONLY)["Lead_Source"] == "meta_form"
    assert "Source_Detail" not in L.detect_explicit(HE_OPENER_ONLY)


def test_meta_form_fields():
    f = L.parse_meta_form(HE_FORM, WA)
    assert f["full_name"] == "ישראל ישראלי" and f["phone"] == "+972501234567"
    assert f["phone_matches_whatsapp"] is True
    assert L.parse_meta_form(HE_FORM_LOCAL_PHONE, WA)["phone_matches_whatsapp"] is True
    other = L.parse_meta_form(HE_FORM_OTHER_PHONE, WA)
    assert other["phone_matches_whatsapp"] is False and other["event_type"].startswith("אירוע להנהלה")
    typed = L.parse_meta_form(HE_FORM_TYPED, WA)
    assert typed["event_type"] == "אחר" and "קבלת שבת" in typed["note"]


def test_meta_form_without_opener_needs_two_form_lines():
    assert L.parse_meta_form(NO_OPENER_FORM)["event_type"] == "חתונה"
    assert L.parse_meta_form("Full name: someone") is None
    assert L.parse_meta_form("שלום: אשמח לפרטים") is None


@pytest.mark.parametrize("text", DIRECT)
def test_plain_messages_are_not_explicit(text):
    assert L.detect_explicit(text, None, WA) == {}


# ── Website ───────────────────────────────────────────────────────────────────────────
@pytest.mark.parametrize("text,topic", [
    (WEB_BAND, "להקת היידה"), (WEB_BOUZOUKI, "נגן בוזוקי"), (WEB_GENERAL, None), (WEB_ETHNO, "EthnoBeat"),
])
def test_website_prefilled_text(text, topic):
    cols = L.detect_explicit(text, None, WA)
    assert cols["Lead_Source"] == "website"
    assert cols.get("Source_Detail") == topic


def test_website_code_and_utm():
    cols = L.detect_explicit(WEB_CODE)
    assert cols["Lead_Source"] == "website" and cols["UTM_Campaign"] == "summer26" and cols["UTM_Source"] == "website"
    assert cols["Source_Detail"] == "הלהקה"
    cols = L.detect_explicit(WEB_UTM)
    assert (cols["UTM_Source"], cols["UTM_Medium"], cols["UTM_Campaign"]) == ("google", "cpc", "wedding")
    assert L.detect_explicit("שלום [web:promo]")["Lead_Source"] == "website"


def test_parse_utm_from_url_and_text():
    assert L.parse_utm("https://x.co/p?utm_source=ig&utm_content=reel1&a=1") == {"UTM_Source": "ig", "UTM_Content": "reel1"}
    assert L.parse_utm("utm_campaign=abc") == {"UTM_Campaign": "abc"}
    assert L.parse_utm(None) == {}


# ── Referral (click-to-WhatsApp) ──────────────────────────────────────────────────────
def test_parse_referral_ad():
    cols = L.parse_referral(REFERRAL)
    assert cols["Lead_Source"] == "ctwa" and cols["Ad_ID"] == REFERRAL["source_id"]
    assert cols["CTWA_CLID"] == REFERRAL["ctwa_clid"] and cols["Source_Detail"] == "להקה לחתונה שלכם"
    assert cols["Source_Referral"] == REFERRAL                    # raw object kept as-is
    assert cols["UTM_Source"] == "facebook" and cols["UTM_Campaign"] == "wedding_oct"


def test_parse_referral_post_and_empty():
    cols = L.parse_referral({"source_type": "post", "source_id": "p1", "source_url": "https://fb.com/p/1"})
    assert cols["Lead_Source"] == "ctwa" and "Ad_ID" not in cols and cols["Source_Detail"].startswith("post")
    assert L.parse_referral(None) == {} and L.parse_referral({}) == {} and L.parse_referral("x") == {}


def test_referral_wins_over_text_but_form_answers_kept():
    cols = L.detect_explicit(HE_FORM, REFERRAL, WA)
    assert cols["Lead_Source"] == "ctwa" and cols["Form_Answers"]["event_type"] == "חתונה"
    # the ad's prefilled message is plain text
    assert L.detect_explicit("היי, אשמח לפרטים", REFERRAL)["Lead_Source"] == "ctwa"


# ── New lead classification / repeat ──────────────────────────────────────────────────
def _prev(id, source=None, days_ago=30, **extra):
    f = {"Phone": WA, **({"Lead_Source": source} if source else {}), **extra}
    return {"id": id, "createdTime": (datetime.now(timezone.utc) - timedelta(days=days_ago)).isoformat(), "fields": f}


def test_classify_new_lead_precedence():
    assert L.classify_new_lead("היי")["Lead_Source"] == "whatsapp_direct"
    assert L.classify_new_lead("היי")["Source_Detail"] == L.AUTO_DIRECT_DETAIL
    assert L.classify_new_lead(HE_FORM, None, WA, [_prev("old", "website")])["Lead_Source"] == "meta_form"
    assert L.classify_new_lead("היי", REFERRAL, WA, [_prev("old", "meta_form")])["Lead_Source"] == "ctwa"
    assert "Source_Detected_At" in L.classify_new_lead("היי")


def test_repeat_customer_keeps_original_source():
    prev = [_prev("newer", "whatsapp_direct", days_ago=10),
            _prev("oldest", "meta_form", days_ago=90, Campaign_Name="Wedding", CTWA_CLID="c1", Meta_Lead_ID="m1")]
    cols = L.classify_new_lead("היי שוב", None, WA, prev, lead_id="new")
    assert cols["Lead_Source"] == "meta_form" and cols["Campaign_Name"] == "Wedding"
    assert cols["Source_Detail"].startswith(L.REPEAT_DETAIL_PREFIX) and "oldest" in cols["Source_Detail"]
    assert "CTWA_CLID" not in cols and "Meta_Lead_ID" not in cols   # per-touch ids are not copied
    cols = L.classify_new_lead("היי", None, WA, [_prev("old")], lead_id="new")
    assert cols["Lead_Source"] == "repeat"
    # the new lead itself is not its own predecessor
    assert L.classify_new_lead("היי", None, WA, [_prev("new", "website")], lead_id="new")["Lead_Source"] == "whatsapp_direct"


# ── Existing lead: never overwrite, upgrade automatic guesses ─────────────────────────
def _lead(source=None, detail=None, hours_ago=1, **extra):
    f = {"Phone": WA}
    if source:
        f["Lead_Source"] = source
    if detail:
        f["Source_Detail"] = detail
    f.update(extra)
    return {"id": "rec1", "createdTime": (datetime.now(timezone.utc) - timedelta(hours=hours_ago)).isoformat(), "fields": f}


def test_refine_upgrades_auto_direct_within_window():
    upd = L.refine_existing_lead(_lead("whatsapp_direct", L.AUTO_DIRECT_DETAIL), HE_FORM, None, WA)
    assert upd["Lead_Source"] == "meta_form" and upd["Form_Answers"]["event_type"] == "חתונה"
    assert L.refine_existing_lead(_lead("whatsapp_direct", L.AUTO_DIRECT_DETAIL, hours_ago=72), HE_FORM) == {}


def test_refine_never_overwrites_manual_or_explicit_sources():
    for lead in (_lead("phone", L.MANUAL_CREATE_DETAIL), _lead("whatsapp_direct", L.MANUAL_DETAIL),
                 _lead("website", "נגן בוזוקי"), _lead("meta_form", "חתונה")):
        assert L.refine_existing_lead(lead, HE_FORM, None, WA) == {}


def test_refine_stores_raw_referral_without_changing_source():
    upd = L.refine_existing_lead(_lead("phone", L.MANUAL_CREATE_DETAIL, hours_ago=500), "היי", REFERRAL)
    assert upd == {"Source_Referral": REFERRAL, "CTWA_CLID": REFERRAL["ctwa_clid"]}
    assert L.refine_existing_lead(_lead("phone", Source_Referral={"a": 1}), "היי", REFERRAL) == {}


def test_refine_from_inherited_repeat_clears_copied_attribution():
    lead = _lead("meta_form", f"{L.REPEAT_DETAIL_PREFIX} · ליד קודם x", Campaign_Name="Old campaign")
    upd = L.refine_existing_lead(lead, WEB_BOUZOUKI)
    assert upd["Lead_Source"] == "website" and upd["Campaign_Name"] is None


def test_refine_unknown_created_time_only_when_no_source():
    assert L.refine_existing_lead({"id": "r", "fields": {}}, HE_FORM)["Lead_Source"] == "meta_form"
    assert L.refine_existing_lead({"id": "r", "fields": {"Lead_Source": "whatsapp_direct",
                                                        "Source_Detail": L.AUTO_DIRECT_DETAIL}}, HE_FORM) == {}
    old = {"id": "r", "createdTime": "2026-01-01T00:00:00+00:00", "fields": {}}
    assert L.refine_existing_lead(old, HE_FORM) == {}


def test_form_name_only_when_missing():
    form = {"full_name": "ישראל ישראלי"}
    assert L.form_name_if_useful("Unknown", form) == "ישראל ישראלי"
    assert L.form_name_if_useful("", form) == "ישראל ישראלי"
    assert L.form_name_if_useful("Dana", form) is None
    assert L.form_name_if_useful(None, None) is None


def test_values_match_schema_enum_and_labels():
    from app.models.schemas import LeadSource, LeadUpdate
    assert {s.value for s in LeadSource} == set(L.LEAD_SOURCES) == set(L.LEAD_SOURCE_HE)
    dumped = LeadUpdate(**L.classify_new_lead(HE_FORM, None, WA)).model_dump(exclude_none=True, by_alias=True, mode="json")
    assert dumped["Lead_Source"] == "meta_form" and dumped["Form_Answers"]["language"] == "he"
    sql = open("migrations/add_lead_source_columns.sql", encoding="utf-8").read()
    for v in L.LEAD_SOURCES:
        assert f"'{v}'" in sql
    for c in L.SOURCE_COLUMNS:
        assert f'"{c}"' in sql
        assert f'"{c}"' in open("migrations/rollback_add_lead_source_columns.sql", encoding="utf-8").read()


# ── Webhook / logic integration ───────────────────────────────────────────────────────
from app.services import logic  # noqa: E402


def test_webhook_passes_referral_and_keeps_old_call_shape():
    bl = logic.bot_logic
    msg = {"from": WA, "id": "wamid.1", "type": "text", "text": {"body": "היי"}, "referral": REFERRAL}
    with patch.object(logic.settings, "NOTIFICATION_NUMBERS", ""), \
         patch.object(bl, "handle_incoming_message", new=AsyncMock()) as h:
        asyncio.run(bl._process_single_message(msg, {"profile": {"name": "Dana"}}))
        assert h.call_args.kwargs["referral"] == REFERRAL
        asyncio.run(bl._process_single_message({**msg, "referral": None}, {"profile": {"name": "Dana"}}))
        assert "referral" not in h.call_args.kwargs


def _new_lead_run(text, referral=None, previous=(), name="Unknown", update_side_effect=None, all_leads_error=None):
    svc = MagicMock()
    svc.get_all_musicians.return_value = []
    svc.is_message_processed.return_value = False
    if all_leads_error:
        svc.get_all_leads.side_effect = all_leads_error
    else:
        svc.get_all_leads.return_value = [{"id": "recNEW", "fields": {"Phone": WA}}] + list(previous)
    if update_side_effect:
        svc.update_lead.side_effect = update_side_effect
    bl = logic.bot_logic
    with patch.object(logic, "airtable_service", svc), \
         patch.object(bl, "get_active_lead_robust", return_value=None), \
         patch.object(bl, "_find_closed_lead_by_phone", return_value=None), \
         patch.object(bl, "start_new_conversation", new=AsyncMock(return_value="recNEW")):
        asyncio.run(bl.handle_incoming_message(WA, name, text, None, f"wamid.{uuid.uuid4().hex}", referral=referral))
    return svc


def _source_updates(svc):
    return [c.args[1] for c in svc.update_lead.call_args_list
            if isinstance(c.args[1], dict) and "Lead_Source" in c.args[1]]


def test_new_lead_from_meta_form_gets_source_and_name():
    svc = _new_lead_run(HE_FORM)
    (upd,) = _source_updates(svc)
    assert upd["Lead_Source"] == "meta_form" and upd["Source_Detail"] == "חתונה"
    assert upd["Name"] == "ישראל ישראלי"            # WhatsApp gave no name
    assert svc.create_message.call_count == 1         # the inbound message is still logged first
    assert "Name" not in _source_updates(_new_lead_run(HE_FORM, name="Dana WA"))[0]


def test_new_lead_ctwa_website_direct_and_repeat():
    assert _source_updates(_new_lead_run("היי", REFERRAL))[0]["Source_Referral"] == REFERRAL
    assert _source_updates(_new_lead_run(WEB_BOUZOUKI))[0]["Lead_Source"] == "website"
    assert _source_updates(_new_lead_run("היי"))[0]["Lead_Source"] == "whatsapp_direct"
    prev = [{"id": "recOLD", "createdTime": "2026-05-01T10:00:00+00:00",
             "fields": {"Phone": "0501234567", "Lead_Source": "meta_form", "Status": "Lost"}}]
    upd = _source_updates(_new_lead_run("היי", previous=prev))[0]
    assert upd["Lead_Source"] == "meta_form" and "recOLD" in upd["Source_Detail"]


def test_new_lead_source_failures_never_break_intake():
    svc = _new_lead_run(HE_FORM, update_side_effect=RuntimeError("column Lead_Source does not exist"))
    assert svc.create_message.call_count == 1
    svc = _new_lead_run(HE_FORM, all_leads_error=RuntimeError("db down"))
    assert _source_updates(svc)[0]["Lead_Source"] == "meta_form"


def test_existing_muted_lead_gets_upgraded_and_referral_kept():
    lead = _lead("whatsapp_direct", L.AUTO_DIRECT_DETAIL,
                 Bot_Mute_Until=(datetime.now(timezone.utc) + timedelta(hours=3)).isoformat(),
                 Status="Talking", Name="Dana")
    svc = MagicMock()
    svc.get_all_musicians.return_value = []
    svc.is_message_processed.return_value = False
    bl = logic.bot_logic
    with patch.object(logic, "airtable_service", svc), \
         patch.object(bl, "get_active_lead_robust", return_value=lead), \
         patch.object(bl, "_alert_admins_muted_chat_message"):
        asyncio.run(bl.handle_incoming_message(WA, "Dana", HE_FORM, None, f"wamid.{uuid.uuid4().hex}", referral=REFERRAL))
    upd = svc.update_lead.call_args_list[0].args[1]
    assert upd["Lead_Source"] == "ctwa" and upd["Source_Referral"] == REFERRAL


def test_refine_skips_strong_sources_without_referral():
    svc = MagicMock()
    with patch.object(logic, "airtable_service", svc):
        logic.bot_logic._refine_lead_source(_lead("phone", L.MANUAL_CREATE_DETAIL), WA, HE_FORM)
        logic.bot_logic._refine_lead_source(_lead("whatsapp_direct", L.AUTO_DIRECT_DETAIL), WA, "שאלה")
    svc.update_lead.assert_not_called()


def test_returning_closed_customer_source_untouched():
    closed = {"id": "recC", "createdTime": "2026-03-01T00:00:00+00:00",
              "fields": {"Phone": WA, "Status": "Closed", "Lead_Source": "meta_form", "Source_Detail": "חתונה"}}
    svc = MagicMock()
    svc.get_all_musicians.return_value = []
    svc.is_message_processed.return_value = False
    bl = logic.bot_logic
    with patch.object(logic, "airtable_service", svc), \
         patch.object(bl, "get_active_lead_robust", return_value=None), \
         patch.object(bl, "_find_closed_lead_by_phone", return_value=closed), \
         patch.object(bl, "_handle_returning_closed_customer", new=AsyncMock()) as ret, \
         patch.object(bl, "start_new_conversation", new=AsyncMock()) as start:
        asyncio.run(bl.handle_incoming_message(WA, "Dana", WEB_BAND, None, f"wamid.{uuid.uuid4().hex}"))
    ret.assert_awaited_once()
    start.assert_not_awaited()
    assert not _source_updates(svc)


# ── Dashboard routes ──────────────────────────────────────────────────────────────────
def _lead_fields(client, lead_id):
    return next(l for l in client.get("/api/v1/leads").json() if l["id"] == lead_id)["fields"]


def test_manual_lead_with_source(test_client):
    r = test_client.post("/api/v1/leads", json={"Phone": "972501111111", "Lead_Source": "phone"})
    f = _lead_fields(test_client, r.json()["id"])
    assert f["Lead_Source"] == "phone" and f["Source_Detail"] == L.MANUAL_CREATE_DETAIL
    r = test_client.post("/api/v1/leads", json={"Phone": "972501111112", "Lead_Source": "referral",
                                               "Source_Detail": "חבר של משפחת לוי"})
    assert _lead_fields(test_client, r.json()["id"])["Source_Detail"] == "חבר של משפחת לוי"


def test_manual_lead_without_or_bad_source_still_created(test_client):
    for body in ({"Phone": "972501111113"}, {"Phone": "972501111114", "Lead_Source": "facebook"}):
        r = test_client.post("/api/v1/leads", json=body)
        assert r.status_code == 200 and "Lead_Source" not in _lead_fields(test_client, r.json()["id"])


def test_patch_source_marks_manual_and_validates(test_client):
    lead_id = test_client.post("/api/v1/leads", json={"Phone": "972501111115"}).json()["id"]
    assert test_client.patch(f"/api/v1/leads/{lead_id}", json={"Lead_Source": "meta_form"}).status_code == 200
    f = _lead_fields(test_client, lead_id)
    assert f["Lead_Source"] == "meta_form" and f["Source_Detail"] == L.MANUAL_DETAIL
    assert test_client.patch(f"/api/v1/leads/{lead_id}", json={"Lead_Source": "tiktok"}).status_code == 400
    # unrelated edits leave the source alone
    test_client.patch(f"/api/v1/leads/{lead_id}", json={"Location": "חיפה"})
    assert _lead_fields(test_client, lead_id)["Source_Detail"] == L.MANUAL_DETAIL
