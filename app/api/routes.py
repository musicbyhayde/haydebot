from datetime import datetime, timedelta
from fastapi import APIRouter, Request, BackgroundTasks, HTTPException
from app.models.schemas import LeadUpdate, LeadStatus
from app.core.config import get_settings
from app.services.logic import bot_logic

router = APIRouter()
settings = get_settings()

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
        # Process in background to avoid timeout
        background_tasks.add_task(bot_logic.process_webhook, body)
        return {"status": "received"}
    except Exception as e:
        print(f"Error: {e}")
        return {"status": "error"}

from typing import List
from app.services.supabase_service import airtable_service

@router.get("/leads")
async def get_leads():
    return airtable_service.get_all_leads()

@router.get("/leads/{lead_id}/messages")
async def get_messages(lead_id: str):
    return airtable_service.get_messages_for_lead(lead_id)

from pydantic import BaseModel

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

    # Mute the bot for 24 hours since the human is taking over the conversation
    mute_time = datetime.now() + timedelta(hours=24)
    airtable_service.update_lead(lead_id, LeadUpdate(status=LeadStatus.MANUAL, bot_mute_until=mute_time))

    bot_logic._send_message(phone, payload.text, lead_id)
    return {"status": "sent"}

# --- Musician Routes ---

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
