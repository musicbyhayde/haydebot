"""
Tests for Pydantic schemas — validate required fields, types, enums.
"""
import pytest
from pydantic import ValidationError
from app.models.schemas import (
    LeadCreate, LeadUpdate, LeadStatus, ConversationState, ServiceType,
    FinanceEntryCreate, FinanceEntryUpdate,
    NoteCreate, MessageCreate,
)
from datetime import datetime


# ═══════════════════════════════════════════════════════
#  LeadCreate
# ═══════════════════════════════════════════════════════

class TestLeadCreate:
    def test_valid_lead_minimal(self):
        lead = LeadCreate(Phone="972501234567")
        assert lead.phone == "972501234567"
        assert lead.status == LeadStatus.NEW
        assert lead.conversation_state == ConversationState.START

    def test_valid_lead_full(self):
        lead = LeadCreate(
            Phone="972501234567",
            Name="Test User",
            Status="Processing",
            Service="DJ",
            Event_Date="2026-06-15",
            Location="Tel Aviv",
            Guests="150",
            Owner="אילן",
        )
        assert lead.name == "Test User"
        assert lead.status == LeadStatus.PROCESSING
        assert lead.service == ServiceType.DJ

    def test_missing_phone_fails(self):
        with pytest.raises(ValidationError) as exc:
            LeadCreate()
        assert "Phone" in str(exc.value) or "phone" in str(exc.value)

    def test_invalid_status_fails(self):
        with pytest.raises(ValidationError):
            LeadCreate(Phone="1234", Status="InvalidStatus")

    def test_all_status_values_valid(self):
        for status in LeadStatus:
            lead = LeadCreate(Phone="1234", Status=status.value)
            assert lead.status == status

    def test_all_service_types_valid(self):
        for svc in ServiceType:
            lead = LeadCreate(Phone="1234", Service=svc.value)
            assert lead.service == svc


# ═══════════════════════════════════════════════════════
#  LeadUpdate
# ═══════════════════════════════════════════════════════

class TestLeadUpdate:
    def test_partial_update_status(self):
        update = LeadUpdate(Status="Closed")
        assert update.status == LeadStatus.CLOSED
        assert update.name is None

    def test_partial_update_closing_amount(self):
        update = LeadUpdate(Status="Closed", Closing_Amount=5000.0)
        assert update.closing_amount == 5000.0

    def test_empty_update_valid(self):
        update = LeadUpdate()
        assert update.name is None
        assert update.status is None

    def test_update_with_owner(self):
        update = LeadUpdate(Owner="קובי")
        assert update.owner == "קובי"


# ═══════════════════════════════════════════════════════
#  FinanceEntryCreate
# ═══════════════════════════════════════════════════════

class TestFinanceEntryCreate:
    def test_valid_income_entry(self):
        entry = FinanceEntryCreate(
            Owner="אילן",
            Type="income",
            Date="2026-03-01",
            Description="חתונה כהן",
            Event_Name="חתונה כהן",
            Amount=5000.0,
            Payment_Status="תשלום",
        )
        assert entry.owner == "אילן"
        assert entry.amount == 5000.0
        assert entry.lead_id is None

    def test_valid_expense_entry(self):
        entry = FinanceEntryCreate(
            Owner="קובי",
            Type="expense",
            Date="2026-03-15",
            Description="רכישת ציוד",
            Amount=800.0,
        )
        assert entry.entry_type == "expense"
        assert entry.payment_status == "לא שולם"  # default

    def test_with_lead_id(self):
        entry = FinanceEntryCreate(
            Owner="אילן",
            Type="income",
            Date="2026-03-01",
            Description="אירוע",
            Amount=3000.0,
            Lead_ID="rec_lead_001",
        )
        assert entry.lead_id == "rec_lead_001"

    def test_missing_required_fields(self):
        with pytest.raises(ValidationError):
            FinanceEntryCreate(Owner="אילן")  # missing Type, Date, Description, Amount

    def test_missing_amount_fails(self):
        with pytest.raises(ValidationError):
            FinanceEntryCreate(
                Owner="אילן",
                Type="income",
                Date="2026-03-01",
                Description="test",
            )


# ═══════════════════════════════════════════════════════
#  FinanceEntryUpdate
# ═══════════════════════════════════════════════════════

class TestFinanceEntryUpdate:
    def test_partial_update_amount(self):
        update = FinanceEntryUpdate(Amount=999.0)
        assert update.amount == 999.0
        assert update.description is None

    def test_partial_update_payment_status(self):
        update = FinanceEntryUpdate(Payment_Status="תשלום")
        assert update.payment_status == "תשלום"

    def test_empty_update_valid(self):
        update = FinanceEntryUpdate()
        assert update.amount is None


# ═══════════════════════════════════════════════════════
#  NoteCreate
# ═══════════════════════════════════════════════════════

class TestNoteCreate:
    def test_valid_note(self):
        note = NoteCreate(Lead_ID="rec001", Author="Ilan", Content="Test note")
        assert note.lead_id == "rec001"
        assert note.content == "Test note"
        assert note.file_url is None

    def test_note_with_file(self):
        note = NoteCreate(
            Lead_ID="rec001",
            Author="Ilan",
            Content="With attachment",
            File_URL="https://example.com/file.pdf",
            File_Name="file.pdf",
        )
        assert note.file_url == "https://example.com/file.pdf"
        assert note.file_name == "file.pdf"

    def test_missing_required_fields(self):
        with pytest.raises(ValidationError):
            NoteCreate(Lead_ID="rec001")  # missing Author and Content


# ═══════════════════════════════════════════════════════
#  MessageCreate
# ═══════════════════════════════════════════════════════

class TestMessageCreate:
    def test_valid_message(self):
        msg = MessageCreate(
            Lead=["rec001"],
            Direction="Inbound",
            Content="Hello",
            Timestamp=datetime.now(),
        )
        assert msg.direction == "Inbound"
        assert msg.content == "Hello"

    def test_missing_direction_fails(self):
        with pytest.raises(ValidationError):
            MessageCreate(Content="Hello", Timestamp=datetime.now())

    def test_optional_media(self):
        msg = MessageCreate(
            Direction="Outbound",
            Content="Photo",
            Timestamp=datetime.now(),
            Media_URL="https://example.com/img.jpg",
            Media_Type="image/jpeg",
        )
        assert msg.media_url == "https://example.com/img.jpg"
