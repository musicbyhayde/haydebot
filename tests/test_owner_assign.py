"""Improvement #4 (owner assignment, Ilan 2026-10-05):
- first assignment of a lead without an owner needs no note, in any status;
- a transfer between partners (or removing the owner) needs a hand-over note;
- the dashboard's "make you the owner?" prompt assigns through the same endpoint (via=note_prompt);
- a generic PATCH can only do a first assignment; unchanged Owner is a no-op (no History noise)."""
import pytest

from app.services import activity_text

API = "/api/v1"


def _seed(svc, lead_id="rec_lead_own", **fields):
    svc._stores["leads"].append({"id": lead_id, "Phone": "972500000001", "Name": "Lead", "Status": "New", **fields})
    return lead_id


def _lead(svc, lead_id):
    return next(r for r in svc._stores["leads"] if r["id"] == lead_id)


def _acts(svc, lead_id):
    return [a for a in svc._stores.get("activities", []) if a.get("lead_id") == lead_id]


def _notes(svc, lead_id):
    return [n for n in svc._stores["notes"] if n.get("Lead_ID") == lead_id]


# ── helper ──────────────────────────────────────────────

def test_owner_change_needs_note():
    assert activity_text.owner_change_needs_note("", "אילן") is False
    assert activity_text.owner_change_needs_note(None, "קובי") is False
    assert activity_text.owner_change_needs_note("קובי", "אילן") is True
    assert activity_text.owner_change_needs_note("קובי", "") is True
    assert activity_text.owner_change_needs_note("קובי", "קובי") is False


# ── POST /leads/{id}/transfer ───────────────────────────

@pytest.mark.parametrize("status", ["New", "Contacted", "Quote Sent", "Won", "Lost"])
def test_first_assignment_without_note_any_status(test_client, mock_service, status):
    lid = _seed(mock_service, Status=status)
    r = test_client.post(f"{API}/leads/{lid}/transfer",
                         json={"new_owner": "קובי", "previous_owner": "", "handover_note": "", "actor": "קובי"})
    assert r.status_code == 200, r.text
    assert _lead(mock_service, lid)["Owner"] == "קובי"
    acts = _acts(mock_service, lid)
    assert len(acts) == 1 and acts[0]["action_type"] == "שיוך מוביל" and acts[0]["actor"] == "קובי"
    notes = _notes(mock_service, lid)
    assert len(notes) == 1 and "שיוך מוביל" in notes[0]["Content"] and "הערת העברה" not in notes[0]["Content"]


def test_first_assignment_via_note_prompt_marks_history(test_client, mock_service):
    lid = _seed(mock_service, Status="Contacted")
    r = test_client.post(f"{API}/leads/{lid}/transfer",
                         json={"new_owner": "אילן", "previous_owner": "", "handover_note": "", "actor": "אילן",
                               "via": "note_prompt"})
    assert r.status_code == 200, r.text
    act = _acts(mock_service, lid)[0]
    assert act["description"].endswith(activity_text.OWNER_VIA_SUFFIX["note_prompt"])
    assert act["description"].startswith("שייך/ה את הליד ל-אילן")


def test_unknown_via_adds_nothing(test_client, mock_service):
    lid = _seed(mock_service)
    test_client.post(f"{API}/leads/{lid}/transfer", json={"new_owner": "אילן", "actor": "אילן", "via": "zzz"})
    assert _acts(mock_service, lid)[0]["description"] == "שייך/ה את הליד ל-אילן"


def test_transfer_requires_note_in_every_status(test_client, mock_service):
    for i, status in enumerate(["New", "Contacted"]):
        lid = _seed(mock_service, lead_id=f"rec_t{i}", Status=status, Owner="קובי")
        r = test_client.post(f"{API}/leads/{lid}/transfer",
                             json={"new_owner": "אילן", "previous_owner": "קובי", "handover_note": "", "actor": "קובי"})
        assert r.status_code == 400
        assert _lead(mock_service, lid)["Owner"] == "קובי"
        assert _acts(mock_service, lid) == [] and _notes(mock_service, lid) == []


def test_transfer_with_note(test_client, mock_service):
    lid = _seed(mock_service, Status="Contacted", Owner="קובי")
    r = test_client.post(f"{API}/leads/{lid}/transfer",
                         json={"new_owner": "אילן", "previous_owner": "קובי", "handover_note": "סוכם מחיר", "actor": "קובי"})
    assert r.status_code == 200, r.text
    assert _lead(mock_service, lid)["Owner"] == "אילן"
    assert _acts(mock_service, lid)[0]["action_type"] == "העברת מוביל"
    assert "סוכם מחיר" in _notes(mock_service, lid)[0]["Content"]


def test_transfer_without_previous_owner_key_still_uses_db_owner(test_client, mock_service):
    """A client that omits previous_owner cannot skip the note: the DB owner decides."""
    lid = _seed(mock_service, Status="Contacted", Owner="קובי")
    r = test_client.post(f"{API}/leads/{lid}/transfer", json={"new_owner": "אילן", "actor": "אילן"})
    assert r.status_code == 400
    assert _lead(mock_service, lid)["Owner"] == "קובי"


def test_removal_requires_note_and_really_clears(test_client, mock_service):
    lid = _seed(mock_service, Status="Contacted", Owner="קובי")
    r = test_client.post(f"{API}/leads/{lid}/transfer", json={"new_owner": "", "previous_owner": "קובי", "actor": "קובי"})
    assert r.status_code == 400
    r = test_client.post(f"{API}/leads/{lid}/transfer",
                         json={"new_owner": "", "previous_owner": "קובי", "handover_note": "לא רלוונטי לי", "actor": "קובי"})
    assert r.status_code == 200, r.text
    assert _lead(mock_service, lid)["Owner"] is None
    assert _acts(mock_service, lid)[0]["action_type"] == "הסרת מוביל"


def test_stale_previous_owner_conflict(test_client, mock_service):
    lid = _seed(mock_service, Status="Contacted", Owner="אילן")
    # the dashboard still thinks the lead has no owner (prompt / "assign to me" on a stale view)
    r = test_client.post(f"{API}/leads/{lid}/transfer",
                         json={"new_owner": "קובי", "previous_owner": "", "handover_note": "", "actor": "קובי",
                               "via": "note_prompt"})
    assert r.status_code == 409
    assert "המוביל השתנה בינתיים" in r.json()["detail"]
    assert _lead(mock_service, lid)["Owner"] == "אילן"
    assert _acts(mock_service, lid) == []


def test_unknown_owner_rejected(test_client, mock_service):
    lid = _seed(mock_service)
    for name in ("מנהל", "bot:hayde-office-bot", "someone"):
        r = test_client.post(f"{API}/leads/{lid}/transfer", json={"new_owner": name, "actor": name})
        assert r.status_code == 400
    assert "Owner" not in _lead(mock_service, lid)


def test_same_owner_rejected(test_client, mock_service):
    lid = _seed(mock_service, Owner="קובי")
    r = test_client.post(f"{API}/leads/{lid}/transfer",
                         json={"new_owner": "קובי", "previous_owner": "קובי", "handover_note": "x", "actor": "קובי"})
    assert r.status_code == 400


def test_missing_lead_404(test_client):
    r = test_client.post(f"{API}/leads/rec_nope/transfer", json={"new_owner": "קובי", "actor": "קובי"})
    assert r.status_code == 404


# ── PATCH /leads/{id} with Owner ─────────────────────────

def test_patch_unchanged_owner_is_noop(test_client, mock_service):
    lid = _seed(mock_service, Status="Contacted", Owner="קובי")
    r = test_client.patch(f"{API}/leads/{lid}", json={"Name": "Lead 2", "Owner": "קובי"})
    assert r.status_code == 200, r.text
    assert _lead(mock_service, lid)["Name"] == "Lead 2"
    assert not [a for a in _acts(mock_service, lid) if "מוביל" in a.get("action_type", "")]


def test_patch_first_assignment_allowed(test_client, mock_service):
    lid = _seed(mock_service, Status="Contacted")
    r = test_client.patch(f"{API}/leads/{lid}", json={"Owner": "אילן"})
    assert r.status_code == 200, r.text
    assert _lead(mock_service, lid)["Owner"] == "אילן"
    assert [a for a in _acts(mock_service, lid) if "אילן" in a.get("description", "")]


@pytest.mark.parametrize("new", ["אילן", ""])
def test_patch_transfer_or_removal_rejected(test_client, mock_service, new):
    lid = _seed(mock_service, Status="Contacted", Owner="קובי")
    r = test_client.patch(f"{API}/leads/{lid}", json={"Owner": new})
    assert r.status_code == 400
    assert _lead(mock_service, lid)["Owner"] == "קובי"


def test_patch_unknown_owner_rejected(test_client, mock_service):
    lid = _seed(mock_service)
    r = test_client.patch(f"{API}/leads/{lid}", json={"Owner": "מנהל"})
    assert r.status_code == 400
    assert "Owner" not in _lead(mock_service, lid)


def test_patch_without_owner_untouched(test_client, mock_service):
    lid = _seed(mock_service, Owner="קובי")
    r = test_client.patch(f"{API}/leads/{lid}", json={"Name": "X"})
    assert r.status_code == 200
    assert _lead(mock_service, lid)["Owner"] == "קובי"


# ── notes never assign owners server-side ───────────────

def test_creating_a_note_never_assigns_owner(test_client, mock_service):
    lid = _seed(mock_service, Status="Contacted")
    for author in ("קובי", "bot:hayde-office-bot"):
        r = test_client.post(f"{API}/leads/{lid}/notes", json={"content": "הערה", "author": author})
        assert r.status_code in (200, 201), r.text
    assert not _lead(mock_service, lid).get("Owner")
