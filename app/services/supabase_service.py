from supabase import create_client, Client
from app.core.config import get_settings
from app.models.schemas import LeadCreate, LeadUpdate, LeadStatus, MessageCreate, NoteCreate, NoteUpdate, FinanceEntryCreate, FinanceEntryUpdate, TaskCreate, TaskUpdate, ActivityCreate, VideoCreate, VideoUpdate
from typing import List, Optional
import uuid
from datetime import datetime, timedelta

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
        return "rec" + uuid.uuid4().hex[:14]

    # ─── Messages ─────────────────────────────────────────

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
            data["id"] = data.pop("ID")
        if not data.get("id"):
            data["id"] = self._generate_id()
        response = self.client.table("messages").insert(data).execute()
        return self._to_airtable_format(response.data[0]) if response.data else {}

    # ─── Leads ────────────────────────────────────────────

    def get_active_lead_by_phone(self, phone: str) -> Optional[dict]:
        """Find an ACTIVE lead by phone. Status is NOT 'Closed' or 'Lost'."""
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

    def delete_lead(self, record_id: str):
        """Physical deletion of a lead."""
        if not self.client: return
        self.client.table("leads").delete().eq("id", record_id).execute()

    def get_active_leads(self) -> List[dict]:
        """Fetch leads that are not Closed or Lost."""
        if not self.client: return []
        response = self.client.table("leads").select("*").neq("Status", "Closed").neq("Status", "Lost").order("Last_Interaction", desc=True).execute()
        return self._to_airtable_list(response.data)

    def get_all_leads(self) -> List[dict]:
        """Fetch all leads, sorted by Last Interaction."""
        if not self.client: return []
        response = self.client.table("leads").select("*").order("Last_Interaction", desc=True).execute()
        return self._to_airtable_list(response.data)

    def get_messages_for_lead(self, lead_id: str) -> List[dict]:
        """Fetch all messages linked to a lead."""
        if not self.client: return []
        try:
            response = self.client.table("messages").select("*").contains("Lead", [lead_id]).order("Timestamp", desc=False).execute()
            return self._to_airtable_list(response.data)
        except Exception as e:
            print(f"Error fetching messages for lead {lead_id}: {e}")
            return []

    def get_unread_status(self) -> dict:
        """Get unread message counts and latest inbound preview for all leads."""
        if not self.client: return {}
        try:
            # Get all leads with their Last_Read_At
            leads_resp = self.client.table("leads").select("id, Last_Read_At").neq("Status", "Closed").neq("Status", "Lost").execute()
            
            # Use 30 days as a reasonable cutoff to not fetch the entire DB
            cutoff = (datetime.now() - timedelta(days=30)).isoformat()
            messages_resp = self.client.table("messages").select("Lead, Timestamp, Content").eq("Direction", "Inbound").gte("Timestamp", cutoff).order("Timestamp", desc=True).execute()

            status = {}
            for lead in leads_resp.data:
                lead_id = lead["id"]
                last_read_str = lead.get("Last_Read_At")
                
                # Default unread logic: count messages strictly newer than Last_Read_At
                # If Last_Read_At is None, everything in last 30d is considered unread
                count = 0
                last_msg = None
                
                for msg in messages_resp.data:
                    msg_leads = msg.get("Lead") or []
                    if lead_id in msg_leads:
                        msg_time = msg.get("Timestamp")
                        
                        # Save the newest message content (messages are ordered desc)
                        if last_msg is None:
                            last_msg = {
                                "content": msg.get("Content"),
                                "time": msg_time
                            }
                        
                        if not last_read_str or msg_time > last_read_str:
                            count += 1
                
                if count > 0 or last_msg is not None:
                    status[lead_id] = {
                        "count": count,
                        "lastMessage": last_msg["content"] if last_msg else None,
                        "lastTime": last_msg["time"] if last_msg else None
                    }
                    
            return status
        except Exception as e:
            print(f"Error calculating unread status: {e}")
            return {}

    # ─── Musicians ────────────────────────────────────────

    def get_active_musicians(self, musician_type: Optional[str] = None) -> List[dict]:
        """Get all musicians marked as Is_Active."""
        if not self.client: return []
        query = self.client.table("musicians").select("*").eq("Is_Active", True)
        if musician_type:
            query = query.eq("Type", musician_type)
        response = query.execute()
        return self._to_airtable_list(response.data)

    def get_all_musicians(self) -> List[dict]:
        """Fetch all musicians."""
        if not self.client: return []
        response = self.client.table("musicians").select("*").execute()
        return self._to_airtable_list(response.data)

    def create_musician(self, musician: "MusicianCreate") -> dict:
        """Create a new musician."""
        if not self.client: return {}
        data = musician.model_dump(exclude_none=True, by_alias=True, mode='json')
        data["id"] = self._generate_id()
        response = self.client.table("musicians").insert(data).execute()
        return self._to_airtable_format(response.data[0]) if response.data else {}

    def update_musician(self, musician_id: str, data: "MusicianUpdate") -> dict:
        """Update a musician."""
        if not self.client: return {}
        update_data = data.model_dump(exclude_none=True, by_alias=True, mode='json')
        response = self.client.table("musicians").update(update_data).eq("id", musician_id).execute()
        return self._to_airtable_format(response.data[0]) if response.data else {}

    def delete_musician(self, musician_id: str):
        """Delete a musician."""
        if not self.client: return
        self.client.table("musicians").delete().eq("id", musician_id).execute()

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
        response = self.client.table("leads").update({
            "Musician_Assigned": [musician_id],
            "Status": LeadStatus.ASSIGNED.value
        }).eq("id", lead_id).execute()
        return self._to_airtable_format(response.data[0]) if response.data else {}

    # ─── Media ────────────────────────────────────────────

    def upload_media(self, file_bytes: bytes, file_name: str, mime_type: str) -> Optional[str]:
        """Uploads a file to Supabase storage and returns public URL."""
        if not self.client: return None
        try:
            self.client.storage.from_("media").upload(
                path=file_name,
                file=file_bytes,
                file_options={"content-type": mime_type, "upsert": "true"}
            )
            public_url = self.client.storage.from_("media").get_public_url(file_name)
            return public_url
        except Exception as e:
            print(f"Error uploading media to Supabase: {e}")
            return None

    # ─── Notes CRUD ───────────────────────────────────────

    def create_note(self, note: NoteCreate) -> dict:
        """Create a note for a lead."""
        if not self.client: return {}
        data = note.model_dump(exclude_none=True, by_alias=True, mode='json')
        data["id"] = self._generate_id()
        data["Created_At"] = datetime.now().isoformat()
        response = self.client.table("notes").insert(data).execute()
        return self._to_airtable_format(response.data[0]) if response.data else {}

    def get_notes_for_lead(self, lead_id: str) -> List[dict]:
        """Fetch all notes for a lead, newest first."""
        if not self.client: return []
        try:
            response = self.client.table("notes").select("*").eq("Lead_ID", lead_id).order("Created_At", desc=True).execute()
            return self._to_airtable_list(response.data)
        except Exception as e:
            print(f"Error fetching notes for lead {lead_id}: {e}")
            return []

    def update_note(self, note_id: str, note: NoteUpdate) -> dict:
        """Update a note entry."""
        if not self.client: return {}
        try:
            update_data = note.model_dump(exclude_none=True, by_alias=True, mode='json')
            response = self.client.table("notes").update(update_data).eq("id", note_id).execute()
            if not response.data:
                raise Exception(f"Note with id {note_id} not found or update failed")
            return self._to_airtable_format(response.data[0])
        except Exception as e:
            print(f"Error updating note {note_id}: {e}")
            raise e

    def delete_note(self, note_id: str):
        """Delete a note entry."""
        if not self.client: return
        try:
            self.client.table("notes").delete().eq("id", note_id).execute()
        except Exception as e:
            print(f"Error deleting note {note_id}: {e}")
            raise e

    # ─── Finance CRUD ─────────────────────────────────────

    def create_finance_entry(self, entry: FinanceEntryCreate) -> dict:
        """Create a finance ledger entry."""
        if not self.client: return {}
        data = entry.model_dump(exclude_none=True, by_alias=True, mode='json')
        data["id"] = self._generate_id()
        data["Created_At"] = datetime.now().isoformat()
        response = self.client.table("finance").insert(data).execute()
        return self._to_airtable_format(response.data[0]) if response.data else {}

    def get_finance_entries(self, owner: Optional[str] = None) -> List[dict]:
        """Fetch all finance entries, optionally filtered by owner."""
        if not self.client: return []
        query = self.client.table("finance").select("*")
        if owner:
            query = query.eq("Owner", owner)
        response = query.order("Date", desc=True).execute()
        return self._to_airtable_list(response.data)

    def update_finance_entry(self, entry_id: str, data: FinanceEntryUpdate) -> dict:
        """Update a finance entry."""
        if not self.client: return {}
        update_data = data.model_dump(exclude_none=True, by_alias=True, mode='json')
        response = self.client.table("finance").update(update_data).eq("id", entry_id).execute()
        return self._to_airtable_format(response.data[0]) if response.data else {}

    def delete_finance_entry(self, entry_id: str):
        """Delete a finance entry."""
        if not self.client: return
        self.client.table("finance").delete().eq("id", entry_id).execute()

    def get_finance_summary(self) -> dict:
        """Get aggregated totals per partner."""
        if not self.client: return {}
        entries = self.client.table("finance").select("*").execute()
        summary = {}
        for entry in entries.data:
            owner = entry.get("Owner", "Unknown")
            if owner not in summary:
                summary[owner] = {"income": 0, "expenses": 0, "balance": 0, "cash_balance": 0, "bank_balance": 0}
            amount = float(entry.get("Amount", 0))
            is_income = entry.get("Type") == "income"
            
            if is_income:
                summary[owner]["income"] += amount
            else:
                summary[owner]["expenses"] += amount
                
            summary[owner]["balance"] = summary[owner]["income"] - summary[owner]["expenses"]
            
            # Cash vs Bank tracking
            payment_method = entry.get("Payment_Method", "חשבון")
            method_amount = amount if is_income else -amount
            
            if payment_method == "מזומן":
                summary[owner]["cash_balance"] += method_amount
            else:
                summary[owner]["bank_balance"] += method_amount
                
        return summary

    # ─── Tasks CRUD ─────────────────────────────────────

    def get_tasks(self) -> List[dict]:
        """Fetch all tasks."""
        if not self.client: return []
        response = self.client.table("tasks").select("*").order("Due_Date", desc=True).execute()
        return self._to_airtable_list(response.data)

    def create_task(self, task: TaskCreate) -> dict:
        """Create a new task."""
        if not self.client: return {}
        data = task.model_dump(exclude_none=True, by_alias=True, mode='json')
        data["id"] = self._generate_id()
        data["Created_At"] = datetime.now().isoformat()
        response = self.client.table("tasks").insert(data).execute()
        return self._to_airtable_format(response.data[0]) if response.data else {}

    def update_task(self, task_id: str, data: TaskUpdate) -> dict:
        """Update a task."""
        if not self.client: return {}
        update_data = data.model_dump(exclude_none=True, by_alias=True, mode='json')
        response = self.client.table("tasks").update(update_data).eq("id", task_id).execute()
        return self._to_airtable_format(response.data[0]) if response.data else {}

    def delete_task(self, task_id: str):
        """Delete a task."""
        if not self.client: return
        self.client.table("tasks").delete().eq("id", task_id).execute()

    # ─── Activities CRUD ─────────────────────────────────────

    def get_activities(self) -> List[dict]:
        """Fetch all activities."""
        if not self.client: return []
        response = self.client.table("activities").select("*").order("created_at", desc=True).limit(100).execute()
        # Include created_at in fields for the frontend
        results = []
        for r in response.data:
            item = {"id": r.get("id"), "fields": {}}
            for key, value in r.items():
                if key != "id":
                    item["fields"][key] = value
            results.append(item)
        return results

    def create_activity(self, activity: ActivityCreate) -> dict:
        """Create a new activity log."""
        if not self.client: return {}
        data = activity.model_dump(exclude_none=True, mode='json')
        # Let Supabase auto-generate the UUID id
        response = self.client.table("activities").insert(data).execute()
        return self._to_airtable_format(response.data[0]) if response.data else {}

    # ─── Videos CRUD ─────────────────────────────────────

    def get_videos(self) -> List[dict]:
        """Fetch all videos."""
        if not self.client: 
            raise Exception("Supabase client not initialized")
        try:
            response = self.client.table("videos").select("*").order("created_at", desc=True).execute()
            return self._to_airtable_list(response.data)
        except Exception as e:
            print(f"Error fetching videos: {e}")
            raise e

    def create_video(self, video: VideoCreate) -> dict:
        """Create a new video entry."""
        if not self.client: 
            raise Exception("Supabase client not initialized")
        try:
            # Use lowercase field names for database compatibility
            data = {
                "label": video.label,
                "url": video.url,
                "category": video.category,
                "is_active": video.is_active,
                "id": self._generate_id(),
                "created_at": datetime.now().isoformat()
            }
            
            response = self.client.table("videos").insert(data).execute()
            if not response.data:
                raise Exception("No data returned from insert operation")
                
            return self._to_airtable_format(response.data[0])
        except Exception as e:
            print(f"Critical Error creating video: {e}")
            raise e

    def update_video(self, video_id: str, data: VideoUpdate) -> dict:
        """Update a video entry."""
        if not self.client: 
            raise Exception("Supabase client not initialized")
        try:
            # Map update data to lowercase keys for DB compatibility
            update_data = {}
            if data.label is not None: update_data["label"] = data.label
            if data.url is not None: update_data["url"] = data.url
            if data.category is not None: update_data["category"] = data.category
            if data.is_active is not None: update_data["is_active"] = data.is_active

            response = self.client.table("videos").update(update_data).eq("id", video_id).execute()
            
            if not response.data:
                raise Exception(f"Video with id {video_id} not found or update failed")
                
            return self._to_airtable_format(response.data[0])
        except Exception as e:
            print(f"Critical Error updating video {video_id}: {e}")
            raise e

    def delete_video(self, video_id: str):
        """Delete a video entry."""
        if not self.client: 
            raise Exception("Supabase client not initialized")
        try:
            self.client.table("videos").delete().eq("id", video_id).execute()
        except Exception as e:
            print(f"Critical Error deleting video {video_id}: {e}")
            raise e

    # ─── Compatibility (MockTable) ────────────────────────

    class _MockTable:
        def __init__(self, service, table_name):
            self.service = service
            self.table_name = table_name
            
        def get(self, record_id):
            if not self.service.client: return None
            res = self.service.client.table(self.table_name).select("*").eq("id", record_id).execute()
            return self.service._to_airtable_format(res.data[0]) if res.data else None
            
        def all(self, formula=None, sort=None):
            if not self.service.client: return []
            query = self.service.client.table(self.table_name).select("*")
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
    def videos_table(self):
        return self._MockTable(self, "videos")


supabase_service = SupabaseService()
# Export it as airtable_service so we don't have to rewrite imports everywhere right now!
airtable_service = supabase_service
