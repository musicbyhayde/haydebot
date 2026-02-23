from supabase import create_client, Client
from app.core.config import get_settings
from app.models.schemas import LeadCreate, LeadUpdate, LeadStatus, MessageCreate
from typing import List, Optional
import uuid

settings = get_settings()

class SupabaseService:
    def __init__(self):
        if settings.SUPABASE_URL and settings.SUPABASE_KEY:
            self.client: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
        else:
            print("Warning: Missing SUPABASE_URL or SUPABASE_KEY in environment variables.")
            self.client = None

    def _to_airtable_format(self, record: dict) -> dict:
        """Helper to format Supabase records like Airtable records"""
        if not record:
            return None
        formatted = {"id": record.get("id"), "fields": {}}
        for key, value in record.items():
            if key != "id" and key != "created_at":
                formatted["fields"][key] = value
        return formatted

    def _to_airtable_list(self, records: list) -> List[dict]:
        return [self._to_airtable_format(r) for r in records]

    def _generate_id(self) -> str:
        # Generate a unique text ID similar to Airtable "recXXXXXX"
        return "rec" + uuid.uuid4().hex[:14]

    def is_message_processed(self, whatsapp_id: str) -> bool:
        """Check if a message with this WhatsApp ID has already been processed."""
        if not whatsapp_id or not self.client:
            return False
        response = self.client.table("messages").select("id").eq("id", whatsapp_id).execute()
        return len(response.data) > 0

    def create_message(self, message: "MessageCreate") -> dict:
        """Log a message to the Messages table."""
        if not self.client: return {}
        data = message.model_dump(exclude_none=True, by_alias=True, mode='json')
        if "ID" in data:
            data["id"] = data.pop("ID") # WhatsApp ID or generated ID
        if not data.get("id"):
            data["id"] = self._generate_id()
        response = self.client.table("messages").insert(data).execute()
        return self._to_airtable_format(response.data[0]) if response.data else {}

    def get_active_lead_by_phone(self, phone: str) -> Optional[dict]:
        """
        Find an ACTIVE lead by their phone number.
        Meaning: Status is NOT 'Closed' or 'Lost'.
        """
        if not self.client: return None
        response = self.client.table("leads").select("*").eq("Phone", phone).neq("Status", LeadStatus.CLOSED.value).neq("Status", LeadStatus.LOST.value).order("Last_Interaction", desc=True).limit(1).execute()
        return self._to_airtable_format(response.data[0]) if response.data else None

    def create_lead(self, lead: LeadCreate) -> dict:
        """Create a new lead."""
        if not self.client: return {}
        data = lead.model_dump(exclude_none=True, by_alias=True, mode='json')
        data["id"] = self._generate_id()
        response = self.client.table("leads").insert(data).execute()
        return self._to_airtable_format(response.data[0]) if response.data else {}

    def update_lead(self, record_id: str, data: LeadUpdate) -> dict:
        """Update an existing lead by Record ID."""
        if not self.client: return {}
        update_data = data.model_dump(exclude_none=True, by_alias=True, mode='json')
        response = self.client.table("leads").update(update_data).eq("id", record_id).execute()
        return self._to_airtable_format(response.data[0]) if response.data else {}

    def get_all_leads(self) -> List[dict]:
        """Fetch all leads, sorted by Last Interaction."""
        if not self.client: return []
        response = self.client.table("leads").select("*").order("Last_Interaction", desc=True).execute()
        return self._to_airtable_list(response.data)

    def get_messages_for_lead(self, lead_id: str) -> List[dict]:
        """Fetch all messages linked to a lead."""
        if not self.client: return []
        try:
            # Using contains operator for array inclusion:
            response = self.client.table("messages").select("*").contains("Lead", [lead_id]).order("Timestamp", desc=False).execute()
            return self._to_airtable_list(response.data)
        except Exception as e:
            print(f"Error fetching messages for lead {lead_id}: {e}")
            return []

    def get_active_musicians(self) -> List[dict]:
        """Get all musicians marked as Is_Active."""
        if not self.client: return []
        response = self.client.table("musicians").select("*").eq("Is_Active", True).execute()
        return self._to_airtable_list(response.data)

    def get_all_musicians(self) -> List[dict]:
        """Fetch all musicians."""
        if not self.client: return []
        response = self.client.table("musicians").select("*").execute()
        return self._to_airtable_list(response.data)

    def get_messages_for_musician(self, musician_id: str) -> List[dict]:
        """Fetch all messages linked to a musician."""
        if not self.client: return []
        try:
            response = self.client.table("messages").select("*").contains("Musician", [musician_id]).order("Timestamp", desc=False).execute()
            return self._to_airtable_list(response.data)
        except Exception as e:
            print(f"Error fetching messages for musician {musician_id}: {e}")
            return []

    def assign_musician(self, lead_id: str, musician_id: str):
        """Link a musician to a lead."""
        if not self.client: return {}
        # In Supabase, Musician_Assigned is an array of strings
        response = self.client.table("leads").update({
            "Musician_Assigned": [musician_id],
            "Status": LeadStatus.ASSIGNED.value
        }).eq("id", lead_id).execute()
        return self._to_airtable_format(response.data[0]) if response.data else {}

    def upload_media(self, file_bytes: bytes, file_name: str, mime_type: str) -> Optional[str]:
        """Uploads a file to Supabase storage and returns public URL."""
        if not self.client: return None
        try:
            # Upsert overwrites if same file_name exists
            res = self.client.storage.from_("media").upload(
                path=file_name,
                file=file_bytes,
                file_options={"content-type": mime_type, "upsert": "true"}
            )
            
            # Fetch public URL after upload
            public_url = self.client.storage.from_("media").get_public_url(file_name)
            return public_url
        except Exception as e:
            print(f"Error uploading media to Supabase: {e}")
            return None

    # Compatibility methods to mimic Airtable's api.table(X).get / .all etc.
    class _MockTable:
        def __init__(self, service, table_name):
            self.service = service
            self.table_name = table_name
            
        def get(self, record_id):
            if not self.service.client: return None
            res = self.service.client.table(self.table_name).select("*").eq("id", record_id).execute()
            return self.service._to_airtable_format(res.data[0]) if res.data else None
            
        def all(self, formula=None, sort=None):
            # Simplistic fallback for dynamic Airtable queries used around the app.
            if not self.service.client: return []
            query = self.service.client.table(self.table_name).select("*")
            # For simplicity, we assume we fetch all and let the caller filter, except where formula mapped easily.
            # In logic.py we have a few places using .all(formula=f"{{Phone}}='{musician_phone}'")
            if formula and "{Phone}=" in formula:
                phone = formula.split("'")[1]
                query = query.eq("Phone", phone)
            
            res = query.execute()
            return self.service._to_airtable_list(res.data)

    @property
    def leads_table(self):
        return self._MockTable(self, "leads")

    @property
    def musicians_table(self):
        return self._MockTable(self, "musicians")

    @property
    def messages_table(self):
         return self._MockTable(self, "messages")

supabase_service = SupabaseService()
# Export it as airtable_service so we don't have to rewrite imports everywhere right now!
airtable_service = supabase_service
