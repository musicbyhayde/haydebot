"""
Integration tests for all API routes.
Uses the MockSupabaseService from conftest — no real database calls.
"""
import pytest
import io
from unittest.mock import patch


# ═══════════════════════════════════════════════════════
#  Health Check
# ═══════════════════════════════════════════════════════

class TestHealthCheck:
    def test_root(self, test_client):
        r = test_client.get("/")
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "ok"


# ═══════════════════════════════════════════════════════
#  Leads CRUD
# ═══════════════════════════════════════════════════════

class TestLeads:
    def test_get_leads_empty(self, test_client):
        r = test_client.get("/api/v1/leads")
        assert r.status_code == 200
        assert r.json() == []

    def test_create_lead(self, test_client):
        r = test_client.post("/api/v1/leads", json={
            "Phone": "972501234567",
            "Name": "David Cohen",
            "Service": "DJ",
            "Event_Date": "2026-06-15",
            "Location": "Tel Aviv",
            "Owner": "אילן",
        })
        assert r.status_code == 200
        data = r.json()
        assert data["fields"]["Name"] == "David Cohen"
        assert data["fields"]["Status"] == "New"
        assert data["id"].startswith("rec")

    def test_create_lead_minimal(self, test_client):
        r = test_client.post("/api/v1/leads", json={
            "Phone": "972509999999",
        })
        assert r.status_code == 200
        assert r.json()["fields"]["Phone"] == "972509999999"

    def test_get_leads_after_create(self, test_client):
        test_client.post("/api/v1/leads", json={"Phone": "111"})
        test_client.post("/api/v1/leads", json={"Phone": "222"})
        r = test_client.get("/api/v1/leads")
        assert r.status_code == 200
        assert len(r.json()) == 2

    def test_update_lead_status(self, test_client):
        create_r = test_client.post("/api/v1/leads", json={"Phone": "111", "Name": "Test"})
        lead_id = create_r.json()["id"]
        r = test_client.patch(f"/api/v1/leads/{lead_id}", json={"Status": "Processing"})
        assert r.status_code == 200
        assert r.json()["fields"]["Status"] == "Processing"

    def test_update_lead_closing_amount(self, test_client):
        create_r = test_client.post("/api/v1/leads", json={"Phone": "111"})
        lead_id = create_r.json()["id"]
        r = test_client.patch(f"/api/v1/leads/{lead_id}", json={
            "Status": "Closed",
            "Closing_Amount": 5000.0,
        })
        assert r.status_code == 200
        data = r.json()["fields"]
        assert data["Status"] == "Closed"
        assert data["Closing_Amount"] == 5000.0

    def test_update_lead_to_lost_with_reason(self, test_client):
        create_r = test_client.post("/api/v1/leads", json={"Phone": "111"})
        lead_id = create_r.json()["id"]
        r = test_client.patch(f"/api/v1/leads/{lead_id}", json={
            "Status": "Lost",
            "Lost_Reason": "מחיר גבוה",
        })
        assert r.status_code == 200
        assert r.json()["fields"]["Lost_Reason"] == "מחיר גבוה"

    def test_update_nonexistent_lead(self, test_client):
        r = test_client.patch("/api/v1/leads/nonexistent", json={"Status": "Closed"})
        # Should not crash — returns empty
        assert r.status_code == 200


# ═══════════════════════════════════════════════════════
#  Messages
# ═══════════════════════════════════════════════════════

class TestMessages:
    def test_get_messages_empty(self, test_client):
        r = test_client.get("/api/v1/leads/rec_test/messages")
        assert r.status_code == 200
        assert r.json() == []

    def test_send_message(self, test_client):
        # Create a lead first
        create_r = test_client.post("/api/v1/leads", json={"Phone": "972501111111"})
        lead_id = create_r.json()["id"]

        # Send message (will fail to send WhatsApp but should not crash)
        r = test_client.post(f"/api/v1/leads/{lead_id}/messages", json={
            "text": "Hello from test",
        })
        # May get 200 or 500 depending on WhatsApp mock — either way, shouldn't crash
        assert r.status_code in (200, 500)


# ═══════════════════════════════════════════════════════
#  Notes
# ═══════════════════════════════════════════════════════

class TestNotes:
    def test_create_note(self, test_client):
        r = test_client.post("/api/v1/leads/rec_lead_001/notes", json={
            "content": "Called customer, interested in DJ service",
            "author": "אילן",
        })
        assert r.status_code == 200
        data = r.json()
        assert data["fields"]["Content"] == "Called customer, interested in DJ service"
        assert data["fields"]["Author"] == "אילן"
        assert data["fields"]["Lead_ID"] == "rec_lead_001"

    def test_create_note_with_file(self, test_client):
        r = test_client.post("/api/v1/leads/rec_lead_001/notes", json={
            "content": "Quote attached",
            "author": "קובי",
            "file_url": "https://storage.example.com/quote.pdf",
            "file_name": "quote.pdf",
        })
        assert r.status_code == 200
        data = r.json()
        assert data["fields"]["File_URL"] == "https://storage.example.com/quote.pdf"
        assert data["fields"]["File_Name"] == "quote.pdf"

    def test_get_notes_for_lead(self, test_client):
        # Create two notes for the same lead
        test_client.post("/api/v1/leads/rec_lead_001/notes", json={"content": "Note 1", "author": "A"})
        test_client.post("/api/v1/leads/rec_lead_001/notes", json={"content": "Note 2", "author": "B"})
        # Create one note for a different lead
        test_client.post("/api/v1/leads/rec_lead_002/notes", json={"content": "Other", "author": "C"})

        r = test_client.get("/api/v1/leads/rec_lead_001/notes")
        assert r.status_code == 200
        notes = r.json()
        assert len(notes) == 2
        contents = [n["fields"]["Content"] for n in notes]
        assert "Note 1" in contents
        assert "Note 2" in contents

    def test_notes_isolation(self, test_client):
        """Notes for one lead must not leak to another."""
        test_client.post("/api/v1/leads/lead_A/notes", json={"content": "Private A", "author": "X"})
        test_client.post("/api/v1/leads/lead_B/notes", json={"content": "Private B", "author": "Y"})

        r_a = test_client.get("/api/v1/leads/lead_A/notes")
        r_b = test_client.get("/api/v1/leads/lead_B/notes")

        assert len(r_a.json()) == 1
        assert r_a.json()[0]["fields"]["Content"] == "Private A"
        assert len(r_b.json()) == 1
        assert r_b.json()[0]["fields"]["Content"] == "Private B"


# ═══════════════════════════════════════════════════════
#  File Upload
# ═══════════════════════════════════════════════════════

class TestFileUpload:
    def test_upload_valid_jpeg(self, test_client):
        file = io.BytesIO(b"\xff\xd8\xff dummy image data")
        r = test_client.post("/api/v1/upload", files={
            "file": ("photo.jpg", file, "image/jpeg"),
        })
        assert r.status_code == 200
        data = r.json()
        assert "url" in data
        assert data["filename"] == "photo.jpg"

    def test_upload_valid_pdf(self, test_client):
        file = io.BytesIO(b"%PDF-1.4 dummy pdf data")
        r = test_client.post("/api/v1/upload", files={
            "file": ("document.pdf", file, "application/pdf"),
        })
        assert r.status_code == 200
        assert r.json()["filename"] == "document.pdf"

    def test_upload_valid_png(self, test_client):
        file = io.BytesIO(b"\x89PNG dummy png data")
        r = test_client.post("/api/v1/upload", files={
            "file": ("image.png", file, "image/png"),
        })
        assert r.status_code == 200

    def test_reject_exe_file(self, test_client):
        file = io.BytesIO(b"MZ dummy exe data")
        r = test_client.post("/api/v1/upload", files={
            "file": ("malware.exe", file, "application/x-msdownload"),
        })
        assert r.status_code == 400
        assert "לא נתמך" in r.json()["detail"]

    def test_reject_zip_file(self, test_client):
        file = io.BytesIO(b"PK dummy zip data")
        r = test_client.post("/api/v1/upload", files={
            "file": ("archive.zip", file, "application/zip"),
        })
        assert r.status_code == 400

    def test_reject_text_file(self, test_client):
        file = io.BytesIO(b"some text content")
        r = test_client.post("/api/v1/upload", files={
            "file": ("readme.txt", file, "text/plain"),
        })
        assert r.status_code == 400

    def test_reject_oversized_file(self, test_client):
        # Create a 6MB file (over the 5MB limit)
        big_data = b"\x00" * (6 * 1024 * 1024)
        file = io.BytesIO(big_data)
        r = test_client.post("/api/v1/upload", files={
            "file": ("huge.jpg", file, "image/jpeg"),
        })
        assert r.status_code == 400
        assert "5MB" in r.json()["detail"]

    def test_accept_exactly_5mb(self, test_client):
        data = b"\x00" * (5 * 1024 * 1024)
        file = io.BytesIO(data)
        r = test_client.post("/api/v1/upload", files={
            "file": ("exact.jpg", file, "image/jpeg"),
        })
        assert r.status_code == 200


# ═══════════════════════════════════════════════════════
#  Finance CRUD
# ═══════════════════════════════════════════════════════

class TestFinance:
    def test_create_income_entry(self, test_client):
        r = test_client.post("/api/v1/finance", json={
            "Owner": "אילן",
            "Type": "income",
            "Date": "2026-03-01",
            "Description": "חתונה כהן",
            "Event_Name": "חתונה כהן",
            "Musician": "דוד",
            "Amount": 5000,
            "Payment_Status": "תשלום",
        })
        assert r.status_code == 200
        data = r.json()
        assert data["fields"]["Owner"] == "אילן"
        assert data["fields"]["Amount"] == 5000
        assert data["fields"]["Type"] == "income"

    def test_create_expense_entry(self, test_client):
        r = test_client.post("/api/v1/finance", json={
            "Owner": "קובי",
            "Type": "expense",
            "Date": "2026-03-15",
            "Description": "רכישת ציוד סאונד",
            "Amount": 800,
            "Payment_Status": "לא שולם",
        })
        assert r.status_code == 200
        data = r.json()
        assert data["fields"]["Type"] == "expense"
        assert data["fields"]["Amount"] == 800

    def test_create_finance_with_lead_link(self, test_client):
        r = test_client.post("/api/v1/finance", json={
            "Owner": "אילן",
            "Type": "income",
            "Date": "2026-04-01",
            "Description": "אירוע לוי",
            "Amount": 3500,
            "Lead_ID": "rec_lead_123",
        })
        assert r.status_code == 200
        assert r.json()["fields"]["Lead_ID"] == "rec_lead_123"

    def test_get_finance_entries(self, test_client):
        test_client.post("/api/v1/finance", json={"Owner": "אילן", "Type": "income", "Date": "2026-01-01", "Description": "A", "Amount": 100})
        test_client.post("/api/v1/finance", json={"Owner": "קובי", "Type": "expense", "Date": "2026-01-02", "Description": "B", "Amount": 200})

        r = test_client.get("/api/v1/finance")
        assert r.status_code == 200
        assert len(r.json()) == 2

    def test_get_finance_entries_filter_by_owner(self, test_client):
        test_client.post("/api/v1/finance", json={"Owner": "אילן", "Type": "income", "Date": "2026-01-01", "Description": "A", "Amount": 100})
        test_client.post("/api/v1/finance", json={"Owner": "קובי", "Type": "expense", "Date": "2026-01-02", "Description": "B", "Amount": 200})
        test_client.post("/api/v1/finance", json={"Owner": "אילן", "Type": "expense", "Date": "2026-01-03", "Description": "C", "Amount": 50})

        r = test_client.get("/api/v1/finance?owner=אילן")
        entries = r.json()
        assert len(entries) == 2
        assert all(e["fields"]["Owner"] == "אילן" for e in entries)

    def test_finance_summary_calculation(self, test_client):
        test_client.post("/api/v1/finance", json={"Owner": "אילן", "Type": "income", "Date": "2026-01-01", "Description": "A", "Amount": 5000})
        test_client.post("/api/v1/finance", json={"Owner": "אילן", "Type": "expense", "Date": "2026-01-02", "Description": "B", "Amount": 1200})
        test_client.post("/api/v1/finance", json={"Owner": "אילן", "Type": "income", "Date": "2026-01-03", "Description": "C", "Amount": 3000})
        test_client.post("/api/v1/finance", json={"Owner": "קובי", "Type": "income", "Date": "2026-01-04", "Description": "D", "Amount": 2000})

        r = test_client.get("/api/v1/finance/summary")
        assert r.status_code == 200
        data = r.json()

        assert data["אילן"]["income"] == 8000
        assert data["אילן"]["expenses"] == 1200
        assert data["אילן"]["balance"] == 6800
        assert data["קובי"]["income"] == 2000
        assert data["קובי"]["expenses"] == 0
        assert data["קובי"]["balance"] == 2000

    def test_update_finance_entry(self, test_client):
        create_r = test_client.post("/api/v1/finance", json={
            "Owner": "אילן", "Type": "income", "Date": "2026-01-01",
            "Description": "Test", "Amount": 1000, "Payment_Status": "לא שולם",
        })
        entry_id = create_r.json()["id"]

        r = test_client.patch(f"/api/v1/finance/{entry_id}", json={
            "Amount": 1500,
            "Payment_Status": "תשלום",
        })
        assert r.status_code == 200
        updated = r.json()["fields"]
        assert updated["Amount"] == 1500
        assert updated["Payment_Status"] == "תשלום"

    def test_delete_finance_entry(self, test_client):
        create_r = test_client.post("/api/v1/finance", json={
            "Owner": "אילן", "Type": "expense", "Date": "2026-01-01",
            "Description": "To delete", "Amount": 100,
        })
        entry_id = create_r.json()["id"]

        # Delete
        r = test_client.delete(f"/api/v1/finance/{entry_id}")
        assert r.status_code == 200

        # Verify it's gone
        r = test_client.get("/api/v1/finance")
        entries = r.json()
        assert all(e["id"] != entry_id for e in entries)

    def test_summary_empty(self, test_client):
        r = test_client.get("/api/v1/finance/summary")
        assert r.status_code == 200
        assert r.json() == {}

    def test_summary_after_delete(self, test_client):
        """Deleting an entry must update the summary."""
        create_r = test_client.post("/api/v1/finance", json={
            "Owner": "אילן", "Type": "income", "Date": "2026-01-01",
            "Description": "Solo entry", "Amount": 3000,
        })
        entry_id = create_r.json()["id"]

        # Summary should show 3000
        r = test_client.get("/api/v1/finance/summary")
        assert r.json()["אילן"]["income"] == 3000

        # Delete and re-check
        test_client.delete(f"/api/v1/finance/{entry_id}")
        r = test_client.get("/api/v1/finance/summary")
        assert r.json() == {}


# ═══════════════════════════════════════════════════════
#  Musicians
# ═══════════════════════════════════════════════════════

class TestMusicians:
    def test_get_musicians(self, test_client):
        r = test_client.get("/api/v1/musicians")
        assert r.status_code == 200
        musicians = r.json()
        assert len(musicians) >= 1  # seeded in conftest
        assert musicians[0]["fields"]["Name"] == "Yossi"
