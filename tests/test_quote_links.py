"""Public quote links: per-quote random token, 404 without a quote, minimal fields, legacy flag."""
import pytest

from app.services import quote_links as ql

LEAD = "r0123456789abcdef"
TOKEN = "A" * 32


def _lead(quotes, **extra):
    return {"id": LEAD, "Name": "דנה", "Phone": "972500000000", "Event_Date": "09.09.2026",
            "Location": "תל אביב", "Closing_Amount": 12000, "Owner": "אילן",
            "Quote_Data": {"quotes": quotes} if quotes is not None else None, **extra}


@pytest.fixture
def legacy(monkeypatch):
    from app.core.config import get_settings
    def set_(v):
        monkeypatch.setattr(get_settings(), "QUOTE_LEGACY_ID_LINKS", v)
    return set_


def test_tokens_are_random_unique_and_kept():
    t1, t2 = ql.new_token(), ql.new_token()
    assert t1 != t2 and len(t1) == 32 and ql.is_token(t1)
    data = {"quotes": [{"id": "a"}, {"id": "b", "token": TOKEN}, {"id": "c", "token": TOKEN}]}
    out = ql.ensure_tokens(data)
    toks = [q["token"] for q in out["quotes"]]
    assert toks[1] == TOKEN                      # existing kept
    assert len(set(toks)) == 3                   # copy of a quote gets its own token
    assert "token" not in data["quotes"][0]      # input not mutated
    assert ql.ensure_tokens({"title": "legacy"}) == {"title": "legacy"}


def test_lead_ids_are_not_tokens():
    assert not ql.is_token(LEAD) and not ql.is_token("short") and not ql.is_token("x" * 31)


def test_token_link_returns_only_that_quote_minimal(test_client, mock_service):
    mock_service._stores["leads"].append(_lead([
        {"id": "q1", "token": "B" * 32, "amount": 9000, "title": "ישנה"},
        {"id": "q2", "token": TOKEN, "amount": 10000, "title": "חדשה", "internal_note": "x"},
    ]))
    r = test_client.get(f"/api/v1/quote/{TOKEN}")
    assert r.status_code == 200
    body = r.json()
    assert set(body) == {"name", "date", "quote"}
    assert body["quote"]["title"] == "חדשה" and body["quote"]["amount"] == 10000
    assert "token" not in body["quote"] and "internal_note" not in body["quote"]
    for leaked in ("Phone", "phone", "Closing_Amount", "amount", "Owner", "id", "location"):
        assert leaked not in body


def test_unknown_token_404(test_client, mock_service):
    mock_service._stores["leads"].append(_lead([{"id": "q1", "token": TOKEN}]))
    assert test_client.get("/api/v1/quote/" + "C" * 32).status_code == 404


def test_lead_without_quote_404(test_client, mock_service, legacy):
    legacy(True)
    mock_service._stores["leads"].append(_lead(None))
    assert test_client.get(f"/api/v1/quote/{LEAD}").status_code == 404
    mock_service._stores["leads"][-1]["Quote_Data"] = {"quotes": []}
    assert test_client.get(f"/api/v1/quote/{LEAD}").status_code == 404


def test_legacy_link_works_while_flag_on(test_client, mock_service, legacy):
    legacy(True)
    mock_service._stores["leads"].append(_lead([{"id": "q1", "title": "א"}, {"id": "q2", "title": "ב"}]))
    assert test_client.get(f"/api/v1/quote/{LEAD}").json()["quote"]["title"] == "ב"        # latest
    assert test_client.get(f"/api/v1/quote/{LEAD}?qid=q1").json()["quote"]["title"] == "א"


def test_legacy_link_cut_when_flag_off(test_client, mock_service, legacy):
    legacy(False)
    mock_service._stores["leads"].append(_lead([{"id": "q1", "token": TOKEN}]))
    assert test_client.get(f"/api/v1/quote/{LEAD}").status_code == 404
    assert test_client.get(f"/api/v1/quote/{TOKEN}").status_code == 200    # token links unaffected


def test_garbage_key_404(test_client, legacy):
    legacy(True)
    assert test_client.get("/api/v1/quote/../../etc").status_code == 404
    assert test_client.get("/api/v1/quote/rec_x").status_code == 404


def test_saving_quotes_assigns_tokens(test_client, mock_service):
    mock_service._stores["leads"].append(_lead(None))
    r = test_client.patch(f"/api/v1/leads/{LEAD}", json={"Quote_Data": {"quotes": [{"id": "q1", "amount": 1}]}})
    assert r.status_code == 200
    tok = mock_service._stores["leads"][-1]["Quote_Data"]["quotes"][0]["token"]
    assert ql.is_token(tok)
    assert test_client.get(f"/api/v1/quote/{tok}").json()["quote"]["id"] == "q1"


def test_public_route_needs_no_auth(mock_service):
    from unittest.mock import patch
    from fastapi.testclient import TestClient
    mock_service._stores["leads"].append(_lead([{"id": "q1", "token": TOKEN}]))
    with patch("app.api.routes.airtable_service", mock_service), patch("app.core.scheduler.scheduler"):
        from app.main import app
        assert TestClient(app).get(f"/api/v1/quote/{TOKEN}").status_code == 200
