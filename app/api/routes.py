from datetime import datetime, timedelta
from fastapi import APIRouter, Request, BackgroundTasks, HTTPException, Query, UploadFile, File as FastAPIFile
from app.models.schemas import LeadCreate, LeadUpdate, LeadStatus, NoteCreate, FinanceEntryCreate, FinanceEntryUpdate
from app.core.config import get_settings
from app.services.logic import bot_logic
from typing import List, Optional
from pydantic import BaseModel
import uuid

router = APIRouter()
settings = get_settings()

# ─── WhatsApp Webhook ────────────────────────────────

@router.get("/webhook")
async def verify_webhook(request: Request):
    """
    Verification endpoint for WhatsApp Webhook setup.
    """
    params = request.query_params
    mode = params.get("hub.mode")
    token = params.get("hub.verify_token")
    challenge = params.get("hub.challenge")

    if mode and token:
        if mode == "subscribe" and token == settings.WHATSAPP_VERIFY_TOKEN:
            return int(challenge)
        else:
            raise HTTPException(status_code=403, detail="Verification failed")
    return {"status": "ok"}

@router.post("/webhook")
async def receive_webhook(request: Request, background_tasks: BackgroundTasks):
    """
    Receive incoming events from WhatsApp.
    """
    try:
        body = await request.json()
        background_tasks.add_task(bot_logic.process_webhook, body)
        return {"status": "received"}
    except Exception as e:
        print(f"Error: {e}")
        return {"status": "error"}

# ─── Leads ────────────────────────────────────────────

from app.services.supabase_service import airtable_service

@router.get("/leads")
async def get_leads():
    return airtable_service.get_all_leads()

@router.post("/leads")
async def create_lead_manual(request: Request):
    """Create a lead manually from the dashboard."""
    body = await request.json()
    lead = LeadCreate(
        phone=body.get("Phone", ""),
        name=body.get("Name"),
        status=body.get("Status", "New"),
        service=body.get("Service"),
        event_date=body.get("Event_Date"),
        location=body.get("Location"),
        guests=body.get("Guests"),
        owner=body.get("Owner"),
    )
    result = airtable_service.create_lead(lead)
    return result

@router.patch("/leads/{lead_id}")
async def update_lead(lead_id: str, request: Request):
    """Update a lead's fields (status, owner, etc.)."""
    body = await request.json()
    data = LeadUpdate(**{k: v for k, v in body.items() if v is not None})
    result = airtable_service.update_lead(lead_id, data)

    # Trigger Bouzouki protocol check if needed
    from app.services.logic import bot_logic
    import asyncio
    asyncio.create_task(bot_logic.check_and_trigger_bouzouki_protocol(lead_id))

    # Auto-create finance entry when lead is closed with a closing amount
    if body.get("Status") == "Closed" and body.get("Closing_Amount"):
        try:
            lead = airtable_service.leads_table.get(lead_id)
            finance_entry = FinanceEntryCreate(
                owner=lead["fields"].get("Owner", ""),
                entry_type="income",
                date=datetime.now().strftime("%Y-%m-%d"),
                description=f"סגירת ליד: {lead['fields'].get('Name', 'ללא שם')}",
                event_name=lead["fields"].get("Service", ""),
                amount=float(body["Closing_Amount"]),
                payment_status="לא שולם",
                lead_id=lead_id,
            )
            airtable_service.create_finance_entry(finance_entry)
        except Exception as e:
            print(f"Error auto-creating finance entry: {e}")

    return result

# ─── Messages ─────────────────────────────────────────

@router.get("/leads/{lead_id}/messages")
async def get_messages(lead_id: str):
    return airtable_service.get_messages_for_lead(lead_id)

class SendMessageRequest(BaseModel):
    text: str

@router.post("/leads/{lead_id}/messages")
async def send_manual_message(lead_id: str, payload: SendMessageRequest):
    lead = airtable_service.leads_table.get(lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    phone = lead["fields"].get("Phone")
    if not phone:
         raise HTTPException(status_code=400, detail="Lead has no phone")

    mute_time = datetime.now() + timedelta(hours=24)
    airtable_service.update_lead(lead_id, LeadUpdate(status=LeadStatus.MANUAL, bot_mute_until=mute_time))

    bot_logic._send_message(phone, payload.text, lead_id)
    return {"status": "sent"}

# ─── Notes ────────────────────────────────────────────

@router.get("/leads/{lead_id}/notes")
async def get_notes(lead_id: str):
    return airtable_service.get_notes_for_lead(lead_id)

@router.post("/leads/{lead_id}/notes")
async def create_note(lead_id: str, request: Request):
    body = await request.json()
    note = NoteCreate(
        lead_id=lead_id,
        author=body.get("author", ""),
        content=body.get("content", ""),
        file_url=body.get("file_url"),
        file_name=body.get("file_name"),
    )
    return airtable_service.create_note(note)

# ─── File Upload ──────────────────────────────────────

@router.post("/upload")
async def upload_file(file: UploadFile = FastAPIFile(...)):
    """Upload a file to Supabase storage and return its public URL."""
    MAX_SIZE = 5 * 1024 * 1024  # 5MB
    ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"}

    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="סוג קובץ לא נתמך. ניתן לצרף תמונות (JPG, PNG, WebP) או PDF בלבד.")

    try:
        file_bytes = await file.read()
        if len(file_bytes) > MAX_SIZE:
            raise HTTPException(status_code=400, detail="הקובץ גדול מדי. מקסימום 5MB.")

        ext = file.filename.rsplit('.', 1)[-1] if '.' in file.filename else 'bin'
        unique_name = f"notes/{uuid.uuid4().hex[:12]}.{ext}"
        url = airtable_service.upload_media(file_bytes, unique_name, file.content_type or 'application/octet-stream')
        if not url:
            raise HTTPException(status_code=500, detail="Upload failed")
        return {"url": url, "filename": file.filename}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ─── Musicians ────────────────────────────────────────

@router.get("/musicians")
async def get_musicians():
    return airtable_service.get_all_musicians()

@router.get("/musicians/{musician_id}/messages")
async def get_musician_messages(musician_id: str):
    return airtable_service.get_messages_for_musician(musician_id)

@router.post("/musicians/{musician_id}/messages")
async def send_musician_manual_message(musician_id: str, payload: SendMessageRequest):
    musician = airtable_service.musicians_table.get(musician_id)
    if not musician:
        raise HTTPException(status_code=404, detail="Musician not found")
    phone = musician["fields"].get("Phone")
    if not phone:
         raise HTTPException(status_code=400, detail="Musician has no phone")

    bot_logic._send_message(phone, payload.text, musician_id=musician_id)
    return {"status": "sent"}

# ─── Finance ─────────────────────────────────────────

@router.get("/finance/summary")
async def get_finance_summary():
    """Get aggregated totals per partner."""
    return airtable_service.get_finance_summary()

@router.get("/finance")
async def get_finance_entries(owner: Optional[str] = Query(None)):
    return airtable_service.get_finance_entries(owner=owner)

@router.post("/finance")
async def create_finance_entry(request: Request):
    body = await request.json()
    entry = FinanceEntryCreate(
        owner=body.get("Owner", ""),
        entry_type=body.get("Type", "income"),
        date=body.get("Date", datetime.now().strftime("%Y-%m-%d")),
        description=body.get("Description", ""),
        event_name=body.get("Event_Name"),
        musician=body.get("Musician"),
        amount=float(body.get("Amount", 0)),
        payment_status=body.get("Payment_Status", "לא שולם"),
        lead_id=body.get("Lead_ID"),
    )
    return airtable_service.create_finance_entry(entry)

@router.patch("/finance/{entry_id}")
async def update_finance_entry(entry_id: str, request: Request):
    body = await request.json()
    data = FinanceEntryUpdate(**{k: v for k, v in body.items() if v is not None})
    return airtable_service.update_finance_entry(entry_id, data)

@router.delete("/finance/{entry_id}")
async def delete_finance_entry(entry_id: str):
    airtable_service.delete_finance_entry(entry_id)
    return {"status": "deleted"}
