from pyairtable import Api
from app.core.config import get_settings
from app.models.schemas import LeadCreate, LeadUpdate, LeadStatus, MessageCreate
from typing import List, Optional
import datetime

settings = get_settings()

class AirtableService:
    def __init__(self):
        self.api = Api(settings.AIRTABLE_TOKEN)
        self.leads_table = self.api.table(settings.AIRTABLE_BASE_ID, settings.AIRTABLE_TABLE_LEADS)
        self.musicians_table = self.api.table(settings.AIRTABLE_BASE_ID, settings.AIRTABLE_TABLE_MUSICIANS)
        self.messages_table = self.api.table(settings.AIRTABLE_BASE_ID, settings.AIRTABLE_TABLE_MESSAGES)

    def is_message_processed(self, whatsapp_id: str) -> bool:
        """Check if a message with this WhatsApp ID has already been processed."""
        if not whatsapp_id:
            return False
        formula = f"{{ID}} = '{whatsapp_id}'"
        matches = self.messages_table.all(formula=formula)
        return len(matches) > 0

    def create_message(self, message: "MessageCreate") -> dict:
        """Log a message to the Messages table."""
        data = message.model_dump(exclude_none=True, by_alias=True, mode='json')
        # Ensure timestamp is ISO string if not handled by mode='json' (it usually is)
        return self.messages_table.create(data)

    def get_active_lead_by_phone(self, phone: str) -> Optional[dict]:
        """
        Find an ACTIVE lead by their phone number.
        Meaning: Status is NOT 'Closed' or 'Lost'.
        If multiple active leads exist, returns the most recently created one.
        """
        formula = f"AND({{Phone}} = '{phone}', {{Status}} != '{LeadStatus.CLOSED.value}', {{Status}} != '{LeadStatus.LOST.value}')"
        # Sort by Last_Interaction DESC to get the latest
        matches = self.leads_table.all(formula=formula, sort=['-Last_Interaction'])
        if matches:
            return matches[0] 
        return None

    def create_lead(self, lead: LeadCreate) -> dict:
        """Create a new lead."""
        # Convert Pydantic model to dict, exclude None to let Airtable defaults work
        data = lead.model_dump(exclude_none=True, by_alias=True, mode='json')
        return self.leads_table.create(data)

    def update_lead(self, record_id: str, data: LeadUpdate) -> dict:
        """Update an existing lead by Record ID."""
        update_data = data.model_dump(exclude_none=True, by_alias=True, mode='json')
        return self.leads_table.update(record_id, update_data)

    def get_all_leads(self) -> List[dict]:
        """Fetch all leads, sorted by Last Interaction."""
        return self.leads_table.all(sort=['-Last_Interaction'])

    def get_messages_for_lead(self, lead_id: str) -> List[dict]:
        """Fetch all messages linked to a lead."""
        try:
            # 1. Get the lead to find its primary field (Phone)
            # Because Airtable formulas use the primary field for linked records
            lead = self.leads_table.get(lead_id)
            if not lead: return []
            
            phone = lead["fields"].get("Phone")
            if not phone: return []

            # 2. Filter messages by the link value (Phone)
            formula = f"{{Lead}}='{phone}'" 
            return self.messages_table.all(formula=formula, sort=['Timestamp'])
        except Exception as e:
            print(f"Error fetching messages for lead {lead_id}: {e}")
            return []

    def get_active_musicians(self) -> List[dict]:
        """Get all musicians marked as Is_Active."""
        return self.musicians_table.all(formula="{Is_Active} = 1")

    def get_favorite_musicians(self) -> List[dict]:
        """Get all musicians marked as Is_Active AND Is_Favorite."""
        return self.musicians_table.all(formula="AND({Is_Active} = 1, {Is_Favorite} = 1)")
    
    def get_all_musicians(self) -> List[dict]:
        """Fetch all musicians."""
        return self.musicians_table.all()

    def get_messages_for_musician(self, musician_id: str) -> List[dict]:
        """Fetch all messages linked to a musician."""
        try:
            musician = self.musicians_table.get(musician_id)
            if not musician: return []
            
            phone = musician["fields"].get("Phone")
            if not phone: return []

            formula = f"{{Musician}}='{phone}'" 
            return self.messages_table.all(formula=formula, sort=['Timestamp'])
        except Exception as e:
            print(f"Error fetching messages for musician {musician_id}: {e}")
            return []

    def assign_musician(self, lead_id: str, musician_id: str):
        """Link a musician to a lead."""
        return self.leads_table.update(lead_id, {"Musician_Assigned": [musician_id], "Status": LeadStatus.ASSIGNED.value})

airtable_service = AirtableService()
