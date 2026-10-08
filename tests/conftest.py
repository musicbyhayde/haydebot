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
import app.api.routes


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
            "tasks": [],
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
        # like SupabaseService.update_lead: LeadUpdate or a raw dict of DB columns
        update_data = dict(data) if isinstance(data, dict) else data.model_dump(exclude_none=True, by_alias=True, mode='json')
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

    def create_musician(self, musician):
        data = musician.model_dump(exclude_none=True, by_alias=True, mode='json')
        data["id"] = self._gen_id()
        self._stores["musicians"].append(data)
        return self._to_airtable_format(data)

    def update_musician(self, musician_id, data):
        update_data = data.model_dump(exclude_none=True, by_alias=True, mode='json')
        for rec in self._stores["musicians"]:
            if rec["id"] == musician_id:
                rec.update(update_data)
                return self._to_airtable_format(rec)
        return {}

    def delete_musician(self, musician_id):
        self._stores["musicians"] = [m for m in self._stores["musicians"] if m["id"] != musician_id]

    # ── Notes ─────────────────────────

    def _insert(self, table, data):
        if any(r.get("id") == data["id"] for r in self._stores.setdefault(table, [])):
            raise Exception('duplicate key value violates unique constraint (23505)')
        self._stores[table].append(data)

    def create_note(self, note, record_id=None):
        data = note.model_dump(exclude_none=True, by_alias=True, mode='json')
        data["id"] = record_id or self._gen_id()
        data["Created_At"] = datetime.now().isoformat()
        self._insert("notes", data)
        return self._to_airtable_format(data)

    def get_notes_for_lead(self, lead_id):
        notes = [n for n in self._stores["notes"] if n.get("Lead_ID") == lead_id]
        return self._to_airtable_list(notes)

    def update_note(self, note_id, note):
        update_data = note.model_dump(exclude_none=True, by_alias=True, mode='json')
        for rec in self._stores["notes"]:
            if rec["id"] == note_id:
                rec.update(update_data)
                return self._to_airtable_format(rec)
        raise Exception(f"Note with id {note_id} not found or update failed")

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

    def get_finance_entries_for_lead(self, lead_id):
        rows = [e for e in self._stores["finance"] if e.get("Lead_ID") == lead_id]
        return self._to_airtable_list(sorted(rows, key=lambda e: e.get("Date") or "", reverse=True))

    def get_finance_entry(self, entry_id):
        for rec in self._stores["finance"]:
            if rec["id"] == entry_id:
                return self._to_airtable_format(dict(rec))
        return None

    def update_finance_entry(self, entry_id, data, clear=()):
        update_data = data.model_dump(exclude_none=True, by_alias=True, mode='json')
        for col in clear:
            update_data[col] = None
        for rec in self._stores["finance"]:
            if rec["id"] == entry_id:
                rec.update(update_data)
                return self._to_airtable_format(rec)
        return {}

    def delete_finance_entry(self, entry_id):
        self._stores["finance"] = [e for e in self._stores["finance"] if e["id"] != entry_id]

    # ── Partner transfers (public.finance_transfers) ──

    def get_finance_transfers(self, include_archived=False):
        rows = self._stores.setdefault("finance_transfers", [])
        if not include_archived:
            rows = [r for r in rows if not r.get("archived_at")]
        return [dict(r) for r in sorted(rows, key=lambda r: (r.get("transfer_date") or "", r.get("created_at") or ""), reverse=True)]

    def get_finance_transfer(self, transfer_id):
        for r in self._stores.setdefault("finance_transfers", []):
            if r["id"] == transfer_id:
                return dict(r)
        return None

    def create_finance_transfer(self, row):
        data = dict(row, id=self._gen_id(), created_at=datetime.now().isoformat())
        self._stores.setdefault("finance_transfers", []).append(data)
        return dict(data)

    def update_finance_transfer(self, transfer_id, changes):
        for r in self._stores.setdefault("finance_transfers", []):
            if r["id"] == transfer_id:
                r.update(changes)
                return dict(r)
        return {}

    def get_finance_summary(self):
        from app.services import finance_transfers
        return finance_transfers.apply_to_summary(self._finance_summary_without_transfers(),
                                                  self.get_finance_transfers())

    def _finance_summary_without_transfers(self):
        summary = {}
        for entry in self._stores["finance"]:
            owner = entry.get("Owner", "Unknown")
            if owner not in summary:
                summary[owner] = {"income": 0, "expenses": 0, "balance": 0, "cash_balance": 0, "bank_balance": 0}
            amount = float(entry.get("Amount", 0))
            if entry.get("Type") == "income":
                summary[owner]["income"] += amount
            else:
                summary[owner]["expenses"] += amount
            summary[owner]["balance"] = summary[owner]["income"] - summary[owner]["expenses"]
            signed = amount if entry.get("Type") == "income" else -amount
            pool = "cash_balance" if entry.get("Payment_Method") == "מזומן" else "bank_balance"
            summary[owner][pool] += signed
        return summary

    # ── Tasks ─────────────────────────

    def get_tasks(self):
        return self._to_airtable_list(self._stores["tasks"])

    def create_task(self, task, record_id=None):
        data = task.model_dump(exclude_none=True, by_alias=True, mode='json')
        data["id"] = record_id or self._gen_id()
        data["Created_At"] = datetime.now().isoformat()
        self._insert("tasks", data)
        return self._to_airtable_format(data)

    def update_task(self, task_id, data):
        update_data = data.model_dump(exclude_none=True, by_alias=True, mode='json')
        for rec in self._stores["tasks"]:
            if rec["id"] == task_id:
                rec.update(update_data)
                return self._to_airtable_format(rec)
        return {}

    def delete_task(self, task_id):
        self._stores["tasks"] = [t for t in self._stores["tasks"] if t["id"] != task_id]

    # ── Media ─────────────────────────

    def upload_media(self, file_bytes, file_name, mime_type):
        return f"https://mock-storage.supabase.co/media/{file_name}"

    # ── Activities ────────────────────

    def create_activity(self, activity, record_id=None):
        if hasattr(activity, 'model_dump'):
            data = activity.model_dump(exclude_none=True, mode='json')
        else:
            data = dict(activity)
        data["id"] = record_id or self._gen_id()
        data["created_at"] = datetime.now().isoformat()
        self._insert("activities", data)
        return self._to_airtable_format(data)

    def get_activities(self, lead_id=None, limit=50):
        acts = self._stores.get("activities", [])
        if lead_id:
            acts = [a for a in acts if a.get("lead_id") == lead_id]
        return self._to_airtable_list(acts[:limit])

    # ── Mock Table ────────────────────
    class _MockTable:
        def __init__(self, service, table_name):
            self.service = service
            self.table_name = table_name

        def get(self, record_id):
            for rec in self.service._stores.get(self.table_name, []):
                if rec["id"] == record_id:
                    return self.service._to_airtable_format(rec)
            return None

        def all(self, formula=None, sort=None):
            return self.service._to_airtable_list(self.service._stores.get(self.table_name, []))

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

    @property
    def tasks_table(self):
        return self._MockTable(self, "tasks")

    @property
    def activities_table(self):
        return self._MockTable(self, "activities")

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
            from app.core.config import get_settings
            settings = get_settings()
            if not settings.API_KEY:  # route tests authenticate as a server-to-server caller
                settings.API_KEY = "unit-test-server-key-" + "x" * 16
            client = TestClient(app, headers={"X-API-Key": settings.API_KEY})
            yield client


@pytest.fixture(autouse=True)
def audit_rows(monkeypatch):
    """Never write the dashboard audit log to a real database in tests; collect rows instead."""
    from app.core import audit_log
    rows = []
    monkeypatch.setattr(audit_log, "_insert", lambda row: rows.append(row))
    audit_log.reset_for_tests()
    yield rows
    audit_log.reset_for_tests()
