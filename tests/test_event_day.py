"""Event_Day / Due_Day: parser, write path (both columns), deploy-order fallback."""
from datetime import date

import pytest

from app.core import dates
from app.core.dates import parse_event_date as p
from app.services.supabase_service import SupabaseService


@pytest.mark.parametrize("text,want", [
    ("2026-06-20", date(2026, 6, 20)),
    ("2026-06-20T10:00:00", date(2026, 6, 20)),
    ("20.06.2026", date(2026, 6, 20)),
    ("20.6.26", date(2026, 6, 20)),
    ("20/6/26", date(2026, 6, 20)),
    ("20-06-2026", date(2026, 6, 20)),
    ("20.06.2026 (מחר בערב)", date(2026, 6, 20)),
    ("20.06.2026 21:00 (20/6 יום שבת 21:00)", date(2026, 6, 20)),
    ("(6/5) 06.05.2025", date(2025, 5, 6)),
    ("בערך 5.9.26", date(2026, 9, 5)),
    ("01.01.0001", None),          # placeholder year
    ("31.02.2026", None),          # impossible date
    ("120.06.2026", None),         # no partial-number matches
    ("ביום שישי", None),
    ("(14.9)", None),              # day/month without a year is ambiguous
    ("", None),
    (None, None),
])
def test_parse(text, want):
    assert p(text) == want


def test_with_parsed_days_only_touches_present_fields():
    assert dates.with_parsed_days({"Name": "x"}, dates.LEAD_DAY_FIELDS) == {"Name": "x"}
    out = dates.with_parsed_days({"Event_Date": "20.6.26"}, dates.LEAD_DAY_FIELDS)
    assert out == {"Event_Date": "20.6.26", "Event_Day": "2026-06-20"}
    # clearing / unparseable text clears the day too, so the two never disagree
    assert dates.with_parsed_days({"Event_Date": "בקיץ"}, dates.LEAD_DAY_FIELDS)["Event_Day"] is None
    assert dates.with_parsed_days({"Due_Date": "1.2.27"}, dates.TASK_DAY_FIELDS)["Due_Day"] == "2027-02-01"


def _svc():
    s = SupabaseService.__new__(SupabaseService)   # no network client needed for the helpers
    s._day_columns_missing = set()
    return s


def test_write_days_adds_day_column():
    s, sent = _svc(), []
    s._write_days("leads", {"Event_Date": "09.09.2026"}, lambda d: sent.append(d) or "ok")
    assert sent == [{"Event_Date": "09.09.2026", "Event_Day": "2026-09-09"}]


def test_write_days_falls_back_when_column_missing():
    """Before the migration runs, PostgREST rejects the unknown column: retry text-only, remember."""
    s, sent = _svc(), []

    def run(d):
        sent.append(d)
        if "Event_Day" in d:
            raise Exception("Could not find the 'Event_Day' column of 'leads' in the schema cache")
        return "ok"

    assert s._write_days("leads", {"Event_Date": "09.09.2026", "Name": "x"}, run) == "ok"
    assert sent[-1] == {"Event_Date": "09.09.2026", "Name": "x"}
    sent.clear()
    s._write_days("leads", {"Event_Date": "10.09.2026"}, run)   # no second failing attempt
    assert sent == [{"Event_Date": "10.09.2026"}]


def test_write_days_reraises_other_errors():
    s = _svc()
    with pytest.raises(RuntimeError):
        s._write_days("tasks", {"Due_Date": "1.1.27"}, lambda d: (_ for _ in ()).throw(RuntimeError("boom")))


def test_api_create_and_patch_write_both(test_client, mock_service):
    r = test_client.post("/api/v1/leads", json={"Phone": "972500000001", "Name": "T",
                                               "Event_Date": "05.11.2026 (ערב)", "Owner": "אילן"})
    assert r.status_code in (200, 201)
    lead_id = r.json()["id"]
    rec = next(x for x in mock_service._stores["leads"] if x["id"] == lead_id)
    assert rec["Event_Date"] == "05.11.2026 (ערב)" and rec["Event_Day"] == "2026-11-05"
    r = test_client.patch(f"/api/v1/leads/{lead_id}", json={"Event_Date": "06.11.2026"})
    assert r.status_code == 200
    assert rec["Event_Day"] == "2026-11-06" and rec["Event_Date"] == "06.11.2026"
