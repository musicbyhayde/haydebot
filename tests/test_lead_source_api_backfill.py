"""Improvement #2: lead source in the Bot API and the backfill script (dry run / SQL)."""
import json

import pytest

from app.services import lead_source as L
from scripts import backfill_lead_source as B
from tests.bot_helpers import bot_env, hdr  # noqa: F401
from tests.test_bot_api import api  # noqa: F401  (fixture)
from tests.test_lead_source import HE_FORM, HE_FORM_OTHER_PHONE, REFERRAL, WEB_BOUZOUKI, WA


# ── Bot API ───────────────────────────────────────────────────────────────────────────
@pytest.fixture
def src_api(api):  # noqa: F811
    leads = {l["id"]: l["fields"] for l in api.fake.leads}
    leads["L1"].update({"Lead_Source": "meta_form", "Source_Detail": "חתונה",
                        "Form_Answers": L.parse_meta_form(HE_FORM_OTHER_PHONE, WA)})
    leads["L2"].update({"Lead_Source": "ctwa", "Source_Detail": "להקה לחתונה שלכם", "Ad_ID": "120211111111111111",
                        "Source_Referral": REFERRAL, "CTWA_CLID": REFERRAL["ctwa_clid"], "UTM_Campaign": "wedding_oct"})
    leads["L3"].update({"Lead_Source": "website"})
    return api


def ids(r):
    return [x["id"] for x in r.json()["data"]]


def test_list_shows_source_and_filters(src_api):
    first = src_api("/leads").json()["data"][0]
    assert first["lead_source"] == "meta_form" and first["lead_source_he"] == "טופס מטא"
    assert ids(src_api("/leads", source="ctwa")) == ["L2"]
    assert set(ids(src_api("/leads", source="meta_form,ctwa"))) == {"L1", "L2"}
    assert set(ids(src_api("/leads", source="none"))) == {"L4", "L5"}
    r = src_api("/leads", source="facebook")
    assert r.status_code == 422 and "facebook" in r.text and r.json()["error"]["code"] == "invalid_request"


def test_detail_source_block_and_pii_masking(src_api):
    lead = src_api("/leads/L1").json()["data"]
    s = lead["source"]
    assert s["value"] == "meta_form" and s["value_he"] == "טופס מטא" and s["detail"] == "חתונה"
    assert s["form"]["event_type"].startswith("אירוע להנהלה") and s["form"]["phone_matches_whatsapp"] is False
    assert s["form"]["phone_masked"] == "***8877" and "phone" not in s["form"] and "full_name" not in s["form"]
    assert "ctwa_clid" not in s
    full = src_api("/leads/L1", key="full").json()["data"]["source"]
    assert full["form"]["phone"] == "+972529998877" and full["form"]["full_name"] == "Test"
    ad = src_api("/leads/L2").json()["data"]["source"]
    assert ad["ad_id"] == "120211111111111111" and ad["utm_campaign"] == "wedding_oct"
    assert ad["referral"]["headline"] == "להקה לחתונה שלכם" and "ctwa_clid" not in ad["referral"]
    assert "image_url" not in ad["referral"]
    assert src_api("/leads/L2", key="full").json()["data"]["source"]["ctwa_clid"] == REFERRAL["ctwa_clid"]
    none = src_api("/leads/L4").json()["data"]["source"]
    assert none["value"] is None and none["form"] is None and none["referral"] is None


def test_stats_by_source(src_api):
    s = src_api("/stats").json()["data"]
    by = {x["source"]: x["count"] for x in s["by_source"]}
    assert by == {"meta_form": 1, "ctwa": 1, "website": 1, "none": 2}
    assert {"source": "ctwa", "source_he": "מודעת וואטסאפ", "count": 1} in s["by_source"]


def test_guide_lists_sources(src_api):
    g = src_api.client.get("/api/bot/v1/guide", headers=hdr(src_api.keys["default"])).json()["data"]
    codes = [s["code"] for s in g["domain"]["lead_sources"]]
    assert codes == list(L.LEAD_SOURCES)
    md = src_api.client.get("/api/bot/v1/guide?format=markdown", headers=hdr(src_api.keys["default"])).text
    assert "Lead sources: meta_form (טופס מטא)" in md


# ── Backfill ──────────────────────────────────────────────────────────────────────────
def _row(id, created, phone="972501234567", inbound=(), manual=False, **extra):
    return {"id": id, "created_at": created, "Phone": phone, "manual_created": manual,
            "inbound": [{"content": c, "ts": t} for c, t in inbound], **extra}


EXPORT = [
    _row("A", "2026-05-01T10:00:00+00", inbound=[(HE_FORM, "2026-05-01T10:00:01+00")]),
    _row("B", "2026-05-02T10:00:00+00", phone="972520000002",
         inbound=[("היידה", "2026-05-02T10:00:01+00"), (WEB_BOUZOUKI, "2026-05-02T10:00:20+00")]),
    _row("C", "2026-05-03T10:00:00+00", phone="972520000003", inbound=[("היי", "2026-05-03T10:00:01+00")]),
    _row("D", "2026-06-01T10:00:00+00", phone="0501234567", inbound=[("היי שוב", "2026-06-01T10:00:01+00")]),
    _row("E", "2026-06-02T10:00:00+00", phone="972520000005", manual=True),
    _row("F", "2026-06-03T10:00:00+00", phone="972520000006", inbound=[("היי", "2026-06-03T10:00:01+00")],
         Lead_Source="phone"),
    _row("G", "2026-06-04T10:00:00+00", phone="972520000007", manual=True,
         inbound=[("תודה על השיחה", "2026-06-04T12:00:00+00")]),
    _row("H", "2026-02-27T10:00:00+00", phone="972520000008"),
    _row("I", "2026-06-05T10:00:00+00", phone="972520000003", inbound=[("שלום", "2026-06-05T10:00:00+00")]),
    _row("J", "2026-06-06T10:00:00+00", phone="972520000010",
         inbound=[("היי", "2026-06-06T10:00:00+00"), (HE_FORM, "2026-06-09T10:00:00+00")]),
]


def test_backfill_plan_rules():
    updates, reasons, extra = B.plan(EXPORT)
    got = {lid: cols["Lead_Source"] for lid, cols in updates}
    assert got == {"A": "meta_form", "B": "website", "C": "whatsapp_direct", "D": "meta_form",
                   "I": "whatsapp_direct", "J": "whatsapp_direct"}
    assert "D" in got and "recA" not in json.dumps(updates) and dict(updates)["D"]["Source_Detail"].endswith("A")
    assert reasons["skip_already_set"] == 1 and reasons["leave_null_manual"] == 2
    assert reasons["leave_null_no_inbound"] == 1 and reasons["repeat_inherited"] == 2
    assert extra["explicit_in_followup"] == 1             # B: website text in the 2nd message
    assert extra["event_type"] == {"חתונה": 1}            # repeat D is not counted as a form lead
    assert all("Source_Detected_At" in c for _, c in updates)


def test_backfill_dry_run_report_has_no_pii(capsys, tmp_path):
    path = tmp_path / "export.json"
    path.write_text(json.dumps(EXPORT, ensure_ascii=False), encoding="utf-8")
    assert B.main(["--input", str(path)]) == 0
    out = capsys.readouterr().out
    assert "DRY RUN" in out and "to update: 6" in out and "meta_form (טופס מטא): 2" in out
    assert "ישראל" not in out and "1234567" not in out


def test_backfill_sql_is_guarded_and_escaped(tmp_path):
    rows = [_row("X'1", "2026-05-01T10:00:00+00",
                 inbound=[(HE_FORM.replace("ישראל ישראלי", "O'Brien"), "2026-05-01T10:00:01+00")])]
    path, out = tmp_path / "e.json", tmp_path / "b.sql"
    path.write_text(json.dumps(rows), encoding="utf-8")
    B.main(["--input", str(path), "--sql", str(out)])
    sql = out.read_text(encoding="utf-8")
    assert sql.startswith("-- Lead source backfill") and "begin;" in sql and "commit;" in sql
    assert "where id = 'X''1' and \"Lead_Source\" is null;" in sql
    assert "O''Brien" in sql and "::jsonb" in sql and "::timestamptz" in sql
    assert oct(out.stat().st_mode & 0o777) == "0o600"


def test_backfill_apply_refuses_offline_input(tmp_path):
    path = tmp_path / "e.json"
    path.write_text("[]", encoding="utf-8")
    with pytest.raises(SystemExit):
        B.main(["--input", str(path), "--apply"])
