from datetime import datetime, timedelta
from fastapi import APIRouter, Request, BackgroundTasks, HTTPException, Query, UploadFile, Depends, Security, File as FastAPIFile
from fastapi.security.api_key import APIKeyHeader
from app.models.schemas import LeadCreate, LeadUpdate, LeadStatus, NoteCreate, NoteUpdate, FinanceEntryCreate, FinanceEntryUpdate, VideoCreate, VideoUpdate, CalendarEventCreate, CalendarEventUpdate
from app.core.config import get_settings
from app.services.logic import bot_logic
from typing import List, Optional
from pydantic import BaseModel
import uuid
import os

settings = get_settings()

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)

async def verify_api_key(api_key: str = Security(api_key_header)):
    if api_key != settings.API_KEY:
        raise HTTPException(status_code=403, detail="Invalid API Key")
    return api_key

public_router = APIRouter()
protected_router = APIRouter(dependencies=[Depends(verify_api_key)])

# ─── WhatsApp Webhook ────────────────────────────────

@public_router.get("/webhook")
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

@public_router.post("/webhook")
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

@public_router.post("/webhooks/calendar")
async def google_calendar_webhook(request: Request, background_tasks: BackgroundTasks):
    """
    Receive push notifications from Google Calendar for event updates (e.g., RSVPs).
    Google sends:
      - 'sync' on initial watch registration (just acknowledge)
      - 'exists' when an event actually changes (trigger RSVP sync)
    """
    state = request.headers.get('x-goog-resource-state', '')
    channel_id = request.headers.get('x-goog-channel-id', '')
    print(f"WEBHOOK: Google Calendar push — state={state}, channel={channel_id}")
    
    if state == 'sync':
        # Initial sync verification from Google — just acknowledge
        print("WEBHOOK: Sync verification received. Watch is active.")
        return {"status": "ok"}
    
    if state == 'exists':
        # An event was created/updated/deleted — sync RSVPs
        print("WEBHOOK: Event change detected! Triggering RSVP sync...")
        background_tasks.add_task(bot_logic.sync_calendar_rsvps)
    
    return {"status": "ok"}

# ─── Leads ────────────────────────────────────────────

from app.services.supabase_service import airtable_service
from app.models.schemas import ActivityCreate

@public_router.get("/quote/{lead_id}")
async def get_quote_data(lead_id: str):
    """Public endpoint to fetch a lead's public quote template."""
    lead = airtable_service.leads_table.get(lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Quote not found")
        
    return {
        "id": lead["id"],
        "name": lead["fields"].get("Name", ""),
        "service": lead["fields"].get("Service", ""),
        "date": lead["fields"].get("Event_Date", ""),
        "location": lead["fields"].get("Location", ""),
        "amount": lead["fields"].get("Closing_Amount", 0),
        "quote_data": lead["fields"].get("Quote_Data", {})
    }


@protected_router.get("/activities")
async def get_activities():
    return airtable_service.get_activities()

@protected_router.post("/activities")
async def create_activity_log(request: Request):
    body = await request.json()
    activity = ActivityCreate(
        actor=body.get("actor", "מערכת"),
        action_type=body.get("action_type", "כללי"),
        description=body.get("description", ""),
        lead_id=body.get("lead_id")
    )
    return airtable_service.create_activity(activity)

@protected_router.get("/leads")
async def get_leads():
    return airtable_service.get_all_leads()

@protected_router.post("/leads")
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
    
    airtable_service.create_activity(ActivityCreate(
        actor=lead.owner or "מערכת",
        action_type="יצירת ליד",
        description=f"יצר/ה ליד חדש טלפון: {lead.phone} ({lead.name or 'ללא שם'})",
        lead_id=result.get("id") if result else None
    ))
    
    return result

@protected_router.patch("/leads/{lead_id}")
async def update_lead(lead_id: str, request: Request):
    """Update a lead's fields (status, owner, etc.)."""
    body = await request.json()
    data = LeadUpdate(**{k: v for k, v in body.items() if v is not None})
    result = airtable_service.update_lead(lead_id, data)

    if body.get("Status"):
        airtable_service.create_activity(ActivityCreate(
            actor="מערכת",
            action_type="שינוי סטטוס",
            description=f"הסטטוס שונה ל-{body.get('Status')}",
            lead_id=lead_id
        ))

    # Trigger Bouzouki protocol check if needed
    from app.services.logic import bot_logic
    import asyncio
    asyncio.create_task(bot_logic.check_and_trigger_bouzouki_protocol(lead_id))

    if body.get("Status") == "Closed":
        # Remove (אופציה) prefix from Google Calendar event if it exists
        try:
            lead = airtable_service.leads_table.get(lead_id)
            event_id = lead["fields"].get("Google_Event_ID")
            if event_id:
                from app.services.google_calendar_service import google_calendar
                google_calendar.update_event_closed(event_id)
        except Exception as e:
            print(f"Error updating Google Calendar on close: {e}")

    return result

@protected_router.post("/leads/{lead_id}/read")
async def mark_lead_as_read(lead_id: str):
    """Mark all messages in a lead as read by updating Last_Read_At."""
    now = datetime.now()
    result = airtable_service.update_lead(lead_id, LeadUpdate(last_read_at=now))
    return {"status": "success", "last_read_at": now.isoformat()}

@protected_router.get("/leads/unread-status")
async def get_unread_status():
    """Get unread message counts and latest message preview for all leads."""
    return airtable_service.get_unread_status()

@protected_router.post("/leads/{lead_id}/calendar-event")
async def create_calendar_event(lead_id: str, payload: Optional[CalendarEventCreate] = None):
    """Manually create a Google Calendar event for a lead."""
    from app.services.google_calendar_service import google_calendar
    
    lead = airtable_service.leads_table.get(lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    # Check if already exists
    if lead["fields"].get("Google_Event_ID"):
        return {"status": "exists", "event_id": lead["fields"].get("Google_Event_ID")}

    try:
        if payload:
            # Use provided details from modal
            name_to_use = payload.summary or lead["fields"].get("Name", "ללא שם")
            loc_to_use = payload.location or lead["fields"].get("Location", "לא צוין")
            date_to_use = payload.event_date
            emails_to_use = payload.team_emails
            desc_to_use = payload.description
        else:
            # Auto-detect from database
            team_ids = lead["fields"].get("Musician_Team") or []
            musicians = airtable_service.get_all_musicians()
            emails_to_use = [m["fields"].get("Email") for m in musicians if m["id"] in team_ids and m["fields"].get("Email")]
            name_to_use = lead["fields"].get("Name", "ללא שם")
            loc_to_use = lead["fields"].get("Location", "לא צוין")
            date_to_use = lead["fields"].get("Event_Date", "")
            desc_to_use = None

        print(f"DEBUG create_calendar_event: name={name_to_use}, loc={loc_to_use}, date='{date_to_use}', emails={emails_to_use}")

        if not date_to_use:
            raise HTTPException(status_code=400, detail="יש להזין תאריך אירוע בכדי ליצור אירוע ביומן")

        if not google_calendar.service:
            raise HTTPException(status_code=500, detail="שירות Google Calendar לא מחובר. בדוק את הגדרות OAuth.")

        is_closed = lead["fields"].get("Status") == "Closed"
        event_id = google_calendar.create_event(
            lead_name=name_to_use,
            location=loc_to_use,
            event_date_str=date_to_use,
            musician_emails=emails_to_use,
            custom_description=desc_to_use,
            is_closed=is_closed
        )

        if event_id:
            airtable_service.update_lead(lead_id, LeadUpdate(google_event_id=event_id))
            return {"status": "created", "event_id": event_id}
        else:
            raise HTTPException(status_code=500, detail=f"יצירת אירוע נכשלה. בדוק שהתאריך '{date_to_use}' בפורמט תקין (DD.MM.YY או YYYY-MM-DD)")
    except HTTPException:
        raise
    except Exception as e:
        print(f"ERROR in create_calendar_event: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"שגיאה ביצירת אירוע ביומן: {str(e)}")

@protected_router.get("/leads/{lead_id}/calendar-event")
async def get_calendar_event(lead_id: str):
    """Fetch current event details from Google Calendar for editing."""
    from app.services.google_calendar_service import google_calendar
    
    lead = airtable_service.leads_table.get(lead_id)
    event_id = lead["fields"].get("Google_Event_ID")
    if not event_id:
        raise HTTPException(status_code=404, detail="No calendar event for this lead")
    
    event_data = google_calendar.get_event(event_id)
    if not event_data:
        raise HTTPException(status_code=404, detail="Event not found in Google Calendar")
    
    return event_data

@protected_router.patch("/leads/{lead_id}/calendar-event")
async def update_calendar_event(lead_id: str, payload: CalendarEventUpdate):
    """Update an existing Google Calendar event."""
    from app.services.google_calendar_service import google_calendar
    
    lead = airtable_service.leads_table.get(lead_id)
    event_id = lead["fields"].get("Google_Event_ID")
    if not event_id:
        raise HTTPException(status_code=404, detail="No calendar event exists for this lead")

    # Use payload fields or fallback to current lead fields
    name_to_use = payload.summary or lead["fields"].get("Name", "ללא שם")
    loc_to_use = payload.location or lead["fields"].get("Location", "לא צוין")
    date_to_use = payload.event_date or lead["fields"].get("Event_Date", "")
    
    if not date_to_use:
        raise HTTPException(status_code=400, detail="יש להזין תאריך אירוע בכדי לסנכרן מול היומן")
    
    if payload.team_emails is not None:
        emails_to_use = payload.team_emails
    else:
        team_ids = lead["fields"].get("Musician_Team") or []
        musicians = airtable_service.get_all_musicians()
        emails_to_use = []
        for m in musicians:
            if m["id"] in team_ids:
                email = m["fields"].get("Email") or m["fields"].get("email")
                if email:
                    emails_to_use.append(email)
        
        print(f"DEBUG: Musician Team IDs: {team_ids}")
        print(f"DEBUG: Found {len(emails_to_use)} emails for the team: {emails_to_use}")

    success = google_calendar.update_event(
        event_id=event_id,
        lead_name=name_to_use,
        location=loc_to_use,
        event_date_str=date_to_use,
        musician_emails=emails_to_use,
        description=payload.description
    )

    if success:
        # After updating the calendar, immediately sync RSVPs so the frontend picks up initial statuses
        from app.services.logic import bot_logic
        import asyncio
        asyncio.create_task(bot_logic.sync_calendar_rsvps())
        return {"status": "updated"}
    else:
        raise HTTPException(status_code=500, detail="Failed to update calendar event")

@protected_router.post("/leads/{lead_id}/sync-rsvps")
async def sync_lead_rsvps(lead_id: str):
    """Manually sync RSVP statuses from Google Calendar for a specific lead."""
    from app.services.google_calendar_service import google_calendar
    
    lead = airtable_service.leads_table.get(lead_id)
    event_id = lead["fields"].get("Google_Event_ID")
    team_ids = lead["fields"].get("Musician_Team") or []
    
    if not event_id:
        raise HTTPException(status_code=404, detail="No calendar event for this lead")
    
    # Step 1: Get Google Calendar attendees
    status_map = google_calendar.get_event_attendees_status(event_id)
    print(f"DEBUG sync-rsvps: event_id={event_id}, google_attendees={status_map}")
    
    # Step 2: Get musician emails from DB
    musicians = airtable_service.get_all_musicians()
    musician_emails = {}
    debug_emails = {}
    for m in musicians:
        if m["id"] in team_ids:
            email = (m["fields"].get("Email") or m["fields"].get("email") or "").lower().strip()
            musician_emails[m["id"]] = email
            debug_emails[m["fields"].get("Name", m["id"])] = email or "(no email)"
    
    print(f"DEBUG sync-rsvps: team_musician_emails={debug_emails}")
    
    # Step 3: Match
    new_rsvps = {}
    for m_id in team_ids:
        email = musician_emails.get(m_id, "")
        if email and email in status_map:
            new_rsvps[m_id] = status_map[email]
        elif email:
            # Email exists but not found in Google — might be needsAction or not invited yet
            new_rsvps[m_id] = "needsAction"
    
    print(f"DEBUG sync-rsvps: result_rsvps={new_rsvps}")
    
    # Step 4: Always save (even if needsAction) so the UI shows something
    if new_rsvps:
        airtable_service.update_lead(lead_id, {"Musician_RSVPs": new_rsvps})
    
    return {
        "status": "synced", 
        "rsvps": new_rsvps,
        "debug": {
            "event_id": event_id,
            "google_attendees": status_map,
            "team_emails": debug_emails,
        }
    }

@protected_router.delete("/leads/{lead_id}/calendar-event")
async def delete_calendar_event(lead_id: str):
    """Delete the Google Calendar event associated with a lead."""
    from app.services.google_calendar_service import google_calendar
    
    lead = airtable_service.leads_table.get(lead_id)
    event_id = lead["fields"].get("Google_Event_ID")
    if not event_id:
        return {"status": "no_event"}

    success = google_calendar.delete_event(event_id)
    if success:
        # Reverting to the service method use to avoid issues with direct table access in some environments
        airtable_service.update_lead(lead_id, LeadUpdate(google_event_id=""))
        return {"status": "deleted"}
    else:
        raise HTTPException(status_code=500, detail="Failed to delete calendar event")

@protected_router.delete("/leads/{lead_id}")
async def delete_lead(lead_id: str, delete_calendar: bool = False):
    """Physically delete a lead and optionally its calendar event."""
    if delete_calendar:
        try:
            await delete_calendar_event(lead_id)
        except Exception as e:
            print(f"Error deleting calendar event while deleting lead: {e}")

    airtable_service.delete_lead(lead_id)
    return {"status": "deleted"}

# ─── Messages ─────────────────────────────────────────

@protected_router.get("/leads/{lead_id}/messages")
async def get_messages(lead_id: str):
    return airtable_service.get_messages_for_lead(lead_id)

class SendMessageRequest(BaseModel):
    text: str

class SendIntroRequest(BaseModel):
    custom_name: Optional[str] = None
    video_urls: List[str] = []

@protected_router.post("/leads/{lead_id}/messages")
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

@protected_router.post("/leads/{lead_id}/send-intro")
async def send_intro_template(lead_id: str, payload: SendIntroRequest):
    """Send the warming/intro WhatsApp template to a lead."""
    from app.services.whatsapp import whatsapp_service
    
    lead = airtable_service.leads_table.get(lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    phone = lead["fields"].get("Phone")
    if not phone:
        raise HTTPException(status_code=400, detail="Lead has no phone number")
    
    # Use custom name if provided, otherwise fallback to database name
    name_to_use = payload.custom_name or lead["fields"].get("Name") or "לקוח נכבד"
    
    # Format video links into a single string for template parameter {{2}}
    # Meta Compliance: Do NOT use \n in parameters. Use a space/symbol separator.
    video_text = ""
    if payload.video_urls:
        video_text = "  |  ".join([f"• {url}" for url in payload.video_urls])
    else:
        video_text = "האתר הרשמי: https://www.hayde.co.il"

    # WhatsApp templates do not allow actual newlines in parameters.
    
    res = whatsapp_service.send_template(
        phone, 
        "customer_warming_intro", 
        "he", 
        [name_to_use, video_text]
    )
    
    # Save the message to history so it appears in the chat
    try:
        # Construct a human-readable version of the template for the DB
        # Note: We must avoid backslashes inside f-string expressions for Python compatibility
        formatted_videos = video_text.replace('  |  ', '\n')
        readable_content = (
            f"היי {name_to_use}, איזה כיף שפנית אלינו! 🎸\n\n"
            f"הנה כמה סרטונים להתרשמות מהביצועים שלנו:\n"
            f"{formatted_videos}\n\n"
            f"נשמח להתאים לכם את החבילה המושלמת! 🎶"
        )
        
        from app.models.schemas import MessageCreate
        airtable_service.create_message(MessageCreate(
            Lead=[lead_id],
            Direction="Outbound",
            Content=readable_content,
            Timestamp=datetime.now(),
            Status="Sent"
        ))
    except Exception as e:
        print(f"Error saving intro message to history: {e}")

    # Log the action in activity history
    airtable_service.create_activity(ActivityCreate(
        actor="מערכת",
        action_type="שליחת חומרים",
        description=f"נשלחו חומרים ללקוח/ה: {name_to_use}",
        lead_id=lead_id
    ))
    
    return {"status": "success", "whatsapp_res": res}

# ─── Videos (Video Bank) ─────────────────────────────

@protected_router.get("/videos")
async def get_videos():
    try:
        return airtable_service.get_videos()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@protected_router.post("/videos")
async def create_video(video: VideoCreate):
    try:
        return airtable_service.create_video(video)
    except Exception as e:
        # Check for common database errors
        detail = str(e)
        if "column" in detail.lower():
            detail = f"שגיאת סכימה: אחד השדות לא תואם למסד הנתונים ({detail})"
        elif "policy" in detail.lower():
            detail = "בעיית הרשאות: וודא שהרצת את ה-SQL עם ה-POLICY"
        raise HTTPException(status_code=400, detail=detail)

@protected_router.patch("/videos/{video_id}")
async def update_video(video_id: str, video: VideoUpdate):
    try:
        return airtable_service.update_video(video_id, video)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@protected_router.delete("/videos/{video_id}")
async def delete_video(video_id: str):
    try:
        airtable_service.delete_video(video_id)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# ─── Notes ────────────────────────────────────────────

@protected_router.get("/leads/{lead_id}/notes")
async def get_notes(lead_id: str):
    return airtable_service.get_notes_for_lead(lead_id)

@protected_router.post("/leads/{lead_id}/notes")
async def create_note(lead_id: str, request: Request):
    body = await request.json()
    note = NoteCreate(
        lead_id=lead_id,
        author=body.get("author", ""),
        content=body.get("content", ""),
        file_url=body.get("file_url"),
        file_name=body.get("file_name"),
    )
    result = airtable_service.create_note(note)
    
    airtable_service.create_activity(ActivityCreate(
        actor=note.author or "מערכת",
        action_type="הוספת עדכון",
        description=f"הוסיף/ה עדכון: {(note.content or '')[:30]}...",
        lead_id=lead_id
    ))
    
    return result

@protected_router.patch("/notes/{note_id}")
async def update_note(note_id: str, note: NoteUpdate):
    try:
        return airtable_service.update_note(note_id, note)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@protected_router.delete("/notes/{note_id}")
async def delete_note(note_id: str):
    try:
        airtable_service.delete_note(note_id)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# ─── File Upload ──────────────────────────────────────

@protected_router.post("/upload")
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

@protected_router.get("/musicians")
async def get_musicians():
    return airtable_service.get_all_musicians()

@public_router.get("/videos/test")
async def public_test_videos():
    """Public test route to check if videos table is reachable."""
    from app.services.supabase_service import airtable_service
    if not airtable_service.client:
        return {"status": "error", "message": "Supabase client not initialized"}
    try:
        # Simple count query using exact count for test
        res = airtable_service.client.table("videos").select("*", count="exact").limit(1).execute()
        return {
            "status": "ok", 
            "count": res.count, 
            "message": "Connection to videos table successful!",
            "data_preview": res.data[0] if res.data else "No records found"
        }
    except Exception as e:
        return {"status": "error", "details": str(e)}

@protected_router.post("/musicians")
async def create_musician(request: Request):
    """Create a new musician from the dashboard."""
    body = await request.json()
    from app.models.schemas import MusicianCreate
    musician = MusicianCreate(
        name=body.get("Name", ""),
        phone=body.get("Phone", ""),
        is_active=body.get("Is_Active", True),
        score=body.get("Score", 5),
        type=body.get("Type", "REFERRER")
    )
    return airtable_service.create_musician(musician)

@protected_router.patch("/musicians/{musician_id}")
async def update_musician(musician_id: str, request: Request):
    """Update a musician's fields."""
    body = await request.json()
    from app.models.schemas import MusicianUpdate
    data = MusicianUpdate(**{k: v for k, v in body.items() if v is not None})
    return airtable_service.update_musician(musician_id, data)

@protected_router.delete("/musicians/{musician_id}")
async def delete_musician(musician_id: str):
    airtable_service.delete_musician(musician_id)
    return {"status": "deleted"}

@protected_router.get("/musicians/{musician_id}/stats")
async def get_musician_stats(musician_id: str):
    """Compute performance statistics for a specific musician."""
    leads = airtable_service.get_all_leads()
    stats = {"received": 0, "closed": 0, "lost": 0, "revenue": 0.0, "commission": 0.0}
    for lead in leads:
        fields = lead.get("fields", {})
        assigned = fields.get("Musician_Assigned") or []
        if musician_id in assigned:
            stats["received"] += 1
            status = fields.get("Status")
            if status == "Closed":
                stats["closed"] += 1
                amount = float(fields.get("Closing_Amount") or 0)
                stats["revenue"] += amount
                stats["commission"] += max(amount * 0.15, 400.0) if amount else 0
            elif status == "Lost":
                stats["lost"] += 1
    return stats

@protected_router.get("/musicians/{musician_id}/messages")
async def get_musician_messages(musician_id: str):
    return airtable_service.get_messages_for_musician(musician_id)

@protected_router.post("/musicians/{musician_id}/messages")
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

@protected_router.get("/finance/summary")
async def get_finance_summary():
    """Get aggregated totals per partner."""
    return airtable_service.get_finance_summary()

@protected_router.get("/finance")
async def get_finance_entries(owner: Optional[str] = Query(None)):
    return airtable_service.get_finance_entries(owner=owner)

@protected_router.post("/finance")
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
        payment_method=body.get("Payment_Method", "חשבון"),
        lead_id=body.get("Lead_ID"),
    )
    result = airtable_service.create_finance_entry(entry)
    
    airtable_service.create_activity(ActivityCreate(
        actor=entry.owner or "מערכת",
        action_type="הכנסה/הוצאה" if entry.entry_type == "income" else "הוצאה",
        description=f"הזין/ה {entry.amount} ₪ ({entry.description})",
        lead_id=entry.lead_id
    ))
    return result

@protected_router.patch("/finance/{entry_id}")
async def update_finance_entry(entry_id: str, request: Request):
    body = await request.json()
    data = FinanceEntryUpdate(**{k: v for k, v in body.items() if v is not None})
    return airtable_service.update_finance_entry(entry_id, data)

@protected_router.delete("/finance/{entry_id}")
async def delete_finance_entry(entry_id: str):
    airtable_service.delete_finance_entry(entry_id)
    return {"status": "deleted"}

# ─── Tasks ───────────────────────────────────────────

@protected_router.get("/tasks")
async def get_tasks():
    return airtable_service.get_tasks()

@protected_router.post("/tasks")
async def create_task(request: Request):
    body = await request.json()
    from app.models.schemas import TaskCreate
    task = TaskCreate(
        title=body.get("Title", ""),
        assignee=body.get("Assignee"),
        due_date=body.get("Due_Date"),
        is_completed=body.get("Is_Completed", False),
        lead_id=body.get("Lead_ID")
    )
    result = airtable_service.create_task(task)
    
    airtable_service.create_activity(ActivityCreate(
        actor=task.assignee or "מערכת",
        action_type="משימה חדשה",
        description=f"יצר/ה משימה: {task.title}",
        lead_id=task.lead_id
    ))
    return result

@protected_router.patch("/tasks/{task_id}")
async def update_task(task_id: str, request: Request):
    body = await request.json()
    from app.models.schemas import TaskUpdate
    data = TaskUpdate(**{k: v for k, v in body.items() if v is not None})
    return airtable_service.update_task(task_id, data)

@protected_router.delete("/tasks/{task_id}")
async def delete_task(task_id: str):
    airtable_service.delete_task(task_id)
    return {"status": "deleted"}

# ─── Analytics ───────────────────────────────────────

@protected_router.get("/analytics")
async def get_analytics():
    """Compute analytics from leads and musicians data."""
    leads = airtable_service.get_all_leads()
    musicians = airtable_service.get_all_musicians()

    now = datetime.now()

    # ─── Conversion Funnel ────────────────────────────
    total_leads = len(leads)
    completed_bot = sum(1 for l in leads if l["fields"].get("Conversation_State") == "COMPLETED")
    assigned = sum(1 for l in leads if l["fields"].get("Status") in ["Assigned", "Closed", "Lost", "Waiting_Payment"])
    closed = sum(1 for l in leads if l["fields"].get("Status") == "Closed")
    lost = sum(1 for l in leads if l["fields"].get("Status") == "Lost")

    funnel = {
        "total": total_leads,
        "completedBot": completed_bot,
        "assigned": assigned,
        "closed": closed,
        "lost": lost,
    }

    # ─── Monthly Trends (last 6 months) ──────────────
    monthly = {}
    for i in range(6):
        month_date = now - timedelta(days=30 * i)
        key = month_date.strftime("%Y-%m")
        monthly[key] = {"new": 0, "closed": 0, "lost": 0, "revenue": 0}

    for l in leads:
        li = l["fields"].get("Last_Interaction")
        if not li:
            continue
        try:
            ts = li.replace('Z', '+00:00') if isinstance(li, str) else li
            lead_month = datetime.fromisoformat(ts).strftime("%Y-%m") if isinstance(ts, str) else ts.strftime("%Y-%m")
        except Exception:
            continue
        if lead_month in monthly:
            monthly[lead_month]["new"] += 1
            status = l["fields"].get("Status")
            if status == "Closed":
                monthly[lead_month]["closed"] += 1
                monthly[lead_month]["revenue"] += float(l["fields"].get("Closing_Amount") or 0)
            elif status == "Lost":
                monthly[lead_month]["lost"] += 1

    # ─── Service Breakdown ────────────────────────────
    services = {}
    for l in leads:
        svc = l["fields"].get("Service") or "לא צוין"
        if svc not in services:
            services[svc] = {"count": 0, "closed": 0, "revenue": 0}
        services[svc]["count"] += 1
        if l["fields"].get("Status") == "Closed":
            services[svc]["closed"] += 1
            services[svc]["revenue"] += float(l["fields"].get("Closing_Amount") or 0)

    # ─── Musician Performance ─────────────────────────
    musician_perf = []
    musician_map = {m["id"]: m["fields"].get("Name", "ללא שם") for m in musicians}
    musician_stats_map = {}

    for l in leads:
        assigned_list = l["fields"].get("Musician_Assigned") or []
        if assigned_list and isinstance(assigned_list, list):
            m_id = assigned_list[0]
            if m_id not in musician_stats_map:
                musician_stats_map[m_id] = {"name": musician_map.get(m_id, "לא ידוע"), "received": 0, "closed": 0, "lost": 0, "revenue": 0}
            musician_stats_map[m_id]["received"] += 1
            status = l["fields"].get("Status")
            if status == "Closed":
                musician_stats_map[m_id]["closed"] += 1
                musician_stats_map[m_id]["revenue"] += float(l["fields"].get("Closing_Amount") or 0)
            elif status == "Lost":
                musician_stats_map[m_id]["lost"] += 1

    musician_perf = sorted(musician_stats_map.values(), key=lambda x: x["closed"], reverse=True)

    # ─── Revenue Summary ──────────────────────────────
    total_revenue = sum(float(l["fields"].get("Closing_Amount") or 0) for l in leads if l["fields"].get("Status") == "Closed")
    total_commission = sum(
        max(float(l["fields"].get("Closing_Amount") or 0) * 0.15, 400.0)
        for l in leads
        if l["fields"].get("Status") == "Closed" 
        and l["fields"].get("Closing_Amount")
        and str(l["fields"].get("Service")).lower() == "bouzouki"
        and str(l["fields"].get("Conversation_State")).upper() == "COMPLETED"
    )

    # ─── Lost Reasons ────────────────────────────────
    lost_reasons = {}
    for l in leads:
        if l["fields"].get("Status") == "Lost":
            reason = l["fields"].get("Lost_Reason") or "לא צוין"
            lost_reasons[reason] = lost_reasons.get(reason, 0) + 1

    return {
        "funnel": funnel,
        "monthly": monthly,
        "services": services,
        "musicianPerformance": musician_perf,
        "revenue": {"total": total_revenue, "commission": total_commission},
        "lostReasons": lost_reasons,
        "conversionRate": round((closed / total_leads * 100), 1) if total_leads > 0 else 0,
    }

# ─── Daily Reminders Cron Job ───────────────────────

@public_router.get("/cron/reminders")
async def send_daily_reminders(request: Request):
    """
    Called daily (e.g. at 9:00 AM) by an external cron service (like cron-job.org).
    Sends a summary of all starred items to the ADMIN_PHONES via WhatsApp.
    """
    auth = request.headers.get("Authorization")
    secret = os.getenv("CRON_SECRET", "haydebot_cron_secret")
    if not auth or auth != f"Bearer {secret}":
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    from app.services.supabase_service import supabase_service
    from app.services.whatsapp import whatsapp_service
    
    tasks = supabase_service.get_tasks()
    leads = supabase_service.get_all_leads()
    
    # Create a lookup for lead names and dates
    lead_lookup = {l.get("id"): l.get("fields", {}) for l in leads}
    
    open_tasks = [t for t in tasks if not t.get("fields", {}).get("Is_Completed")]
    open_leads = [l for l in leads if l.get("fields", {}).get("Status") not in ["Closed", "Lost"]]
    
    # Mapping numbers to names as defined in auth.ts
    admin_map = {
        "972544500529": "אילן",
        "972506794611": "קובי"
    }
    
    numbers = settings.NOTIFICATION_NUMBERS.split(",") if settings.NOTIFICATION_NUMBERS else []
    send_results = []
    
    for number in numbers:
        phone = number.strip()
        if not phone:
            continue
            
        user_name = admin_map.get(phone)
        if not user_name:
            continue
            
        # Filter items for this specific user or "כולם"
        u_tasks = [t for t in open_tasks if user_name in (t.get("fields", {}).get("Starred_By") or []) or "כולם" in (t.get("fields", {}).get("Starred_By") or [])]
        
        # New/Processing leads are ALWAYS included for everyone, plus user's starred leads
        u_leads = [l for l in open_leads if 
                   l.get("fields", {}).get("Status") in ["New", "Processing"] or
                   user_name in (l.get("fields", {}).get("Starred_By") or []) or 
                   "כולם" in (l.get("fields", {}).get("Starred_By") or [])]
        
        if not u_tasks and not u_leads:
            send_results.append({"phone": phone, "status": "No items for this user"})
            continue
            
        # Build detailed message (Single line, as Meta rejects newlines in template variables)
        lead_summary = ""
        if u_leads:
            parts = []
            for l in u_leads:
                name = l.get("fields", {}).get("Name", "ללא שם")
                date = l.get("fields", {}).get("Event_Date", "ללא תאריך")
                parts.append(f"👤 {name} ({date})")
            lead_summary = " | ".join(parts)
                
        task_summary = ""
        if u_tasks:
            parts = []
            for t in u_tasks:
                title = t.get("fields", {}).get("Title", "משימה")
                # Fix: In tasks table, the lead link is stored in 'Lead_ID'
                lead_id = t.get("fields", {}).get("Lead_ID")
                lead_info = ""
                if lead_id:
                    # lead_id is sometimes a string, sometimes a list in Airtable-emulated schemas
                    if isinstance(lead_id, list) and lead_id:
                        lead_id = lead_id[0]
                    
                    lead = lead_lookup.get(lead_id, {})
                    lead_name = lead.get("Name")
                    if lead_name:
                        lead_info = f" (מקושרת לליד \"{lead_name}\")"
                parts.append(f"✅ {title}{lead_info}")
            task_summary = " | ".join(parts)
        
        final_text = ""
        if lead_summary: final_text += f"לידים: {lead_summary}"
        if task_summary: 
            if final_text: final_text += " • "
            final_text += f"משימות: {task_summary}"
            
        # Limit text length as Meta has limits
        if len(final_text) > 500:
            final_text = final_text[:497] + "..."
            
        res = whatsapp_service.send_template(phone, "admin_system_alert", "en", ["תזכורת פריטים מסומנים", final_text])
        send_results.append({"phone": phone, "user": user_name, "result": res})
            
    return {
        "status": "Reminders processing complete", 
        "whatsapp_results": send_results,
        "raw_numbers_env": settings.NOTIFICATION_NUMBERS
    }
