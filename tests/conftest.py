"""
Shared test fixtures for HaydeBot backend tests.
Provides a MockSupabaseService that stores data in-memory (no real DB calls),
and a FastAPI TestClient wired to use it.
"""
import pytest
import uuid
from unittest.mock import patch, MagicMock
from datetime import datetime
from fastapi.testclient import TestClient
from copy import deepcopy


# ─── In-Memory Mock Service ──────────────────────────────

class MockSupabaseService:
    """Mimics SupabaseService with in-memory dict storage."""

    def __init__(self):
        self.client = True  # truthy so methods don't early-return
        self._stores = {
            "leads": [],
            "messages": [],
            "musicians": [],
            "notes": [],
            "finance": [],
        }

    def _gen_id(self):
        return "rec" + uuid.uuid4().hex[:14]

    def _to_airtable_format(self, record: dict) -> dict:
        if not record:
            return None
        formatted = {"id": record.get("id"), "fields": {}}
        for key, value in record.items():
            if key not in ("id", "created_at"):
                formatted["fields"][key] = value
        return formatted

    def _to_airtable_list(self, records: list) -> list:
        return [self._to_airtable_format(r) for r in records]

    # ── Leads ─────────────────────────

    def get_all_leads(self):
        return self._to_airtable_list(self._stores["leads"])

    def create_lead(self, lead):
        data = lead.model_dump(exclude_none=True, by_alias=True, mode='json')
        data["id"] = self._gen_id()
        self._stores["leads"].append(data)
        return self._to_airtable_format(data)

    def update_lead(self, record_id, data):
        update_data = data.model_dump(exclude_none=True, by_alias=True, mode='json')
        for rec in self._stores["leads"]:
            if rec["id"] == record_id:
                rec.update(update_data)
                return self._to_airtable_format(rec)
        return {}

    def get_active_lead_by_phone(self, phone):
        for rec in self._stores["leads"]:
            if rec.get("Phone") == phone and rec.get("Status") not in ("Closed", "Lost"):
                return self._to_airtable_format(rec)
        return None

    # ── Messages ──────────────────────

    def is_message_processed(self, whatsapp_id):
        for rec in self._stores["messages"]:
            if rec.get("id") == whatsapp_id:
                return True
        return False

    def create_message(self, message):
        data = message.model_dump(exclude_none=True, by_alias=True, mode='json')
        if "ID" in data:
            data["id"] = data.pop("ID")
        if not data.get("id"):
            data["id"] = self._gen_id()
        self._stores["messages"].append(data)
        return self._to_airtable_format(data)

    def get_messages_for_lead(self, lead_id):
        msgs = [m for m in self._stores["messages"] if lead_id in (m.get("Lead") or [])]
        return self._to_airtable_list(msgs)

    def get_messages_for_musician(self, musician_id):
        msgs = [m for m in self._stores["messages"] if musician_id in (m.get("Musician") or [])]
        return self._to_airtable_list(msgs)

    # ── Musicians ─────────────────────

    def get_all_musicians(self):
        return self._to_airtable_list(self._stores["musicians"])

    def get_active_musicians(self):
        active = [m for m in self._stores["musicians"] if m.get("Is_Active", True)]
        return self._to_airtable_list(active)

    # ── Notes ─────────────────────────

    def create_note(self, note):
        data = note.model_dump(exclude_none=True, by_alias=True, mode='json')
        data["id"] = self._gen_id()
        data["Created_At"] = datetime.now().isoformat()
        self._stores["notes"].append(data)
        return self._to_airtable_format(data)

    def get_notes_for_lead(self, lead_id):
        notes = [n for n in self._stores["notes"] if n.get("Lead_ID") == lead_id]
        return self._to_airtable_list(notes)

    # ── Finance ───────────────────────

    def create_finance_entry(self, entry):
        data = entry.model_dump(exclude_none=True, by_alias=True, mode='json')
        data["id"] = self._gen_id()
        data["Created_At"] = datetime.now().isoformat()
        self._stores["finance"].append(data)
        return self._to_airtable_format(data)

    def get_finance_entries(self, owner=None):
        entries = self._stores["finance"]
        if owner:
            entries = [e for e in entries if e.get("Owner") == owner]
        return self._to_airtable_list(entries)

    def update_finance_entry(self, entry_id, data):
        update_data = data.model_dump(exclude_none=True, by_alias=True, mode='json')
        for rec in self._stores["finance"]:
            if rec["id"] == entry_id:
                rec.update(update_data)
                return self._to_airtable_format(rec)
        return {}

    def delete_finance_entry(self, entry_id):
        self._stores["finance"] = [e for e in self._stores["finance"] if e["id"] != entry_id]

    def get_finance_summary(self):
        summary = {}
        for entry in self._stores["finance"]:
            owner = entry.get("Owner", "Unknown")
            if owner not in summary:
                summary[owner] = {"income": 0, "expenses": 0, "balance": 0}
            amount = float(entry.get("Amount", 0))
            if entry.get("Type") == "income":
                summary[owner]["income"] += amount
            else:
                summary[owner]["expenses"] += amount
            summary[owner]["balance"] = summary[owner]["income"] - summary[owner]["expenses"]
        return summary

    # ── Media ─────────────────────────

    def upload_media(self, file_bytes, file_name, mime_type):
        return f"https://mock-storage.supabase.co/media/{file_name}"

    # ── Mock Table ────────────────────
    class _MockTable:
        def __init__(self, service, table_name):
            self.service = service
            self.table_name = table_name

        def get(self, record_id):
            for rec in self.service._stores[self.table_name]:
                if rec["id"] == record_id:
                    return self.service._to_airtable_format(rec)
            return None

        def all(self, formula=None, sort=None):
            return self.service._to_airtable_list(self.service._stores[self.table_name])

    @property
    def leads_table(self):
        return self._MockTable(self, "leads")

    @property
    def musicians_table(self):
        return self._MockTable(self, "musicians")

    @property
    def messages_table(self):
        return self._MockTable(self, "messages")

    @property
    def notes_table(self):
        return self._MockTable(self, "notes")

    @property
    def finance_table(self):
        return self._MockTable(self, "finance")


# ─── Fixtures ─────────────────────────────────────────

@pytest.fixture
def mock_service():
    """Fresh in-memory service for each test."""
    svc = MockSupabaseService()
    # Seed sample musician
    svc._stores["musicians"].append({
        "id": "rec_mus_001",
        "Name": "Yossi",
        "Phone": "972501234567",
        "Is_Active": True,
        "Score": 8,
    })
    return svc


@pytest.fixture
def test_client(mock_service):
    """FastAPI TestClient with mocked service."""
    from unittest.mock import AsyncMock
    with patch("app.api.routes.airtable_service", mock_service), \
         patch("app.api.routes.bot_logic") as mock_logic_routes, \
         patch("app.services.logic.bot_logic") as mock_logic:
        
        mock_logic.check_and_trigger_bouzouki_protocol = AsyncMock()
        mock_logic_routes.check_and_trigger_bouzouki_protocol = AsyncMock()
        
        # Prevent scheduler from running
        with patch("app.core.scheduler.scheduler"):
            from app.main import app
            client = TestClient(app)
            yield client
