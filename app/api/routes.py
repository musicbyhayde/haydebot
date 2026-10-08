from datetime import datetime, timedelta
from fastapi import APIRouter, Request, BackgroundTasks, HTTPException, Query, UploadFile, Depends, Security, File as FastAPIFile
from app.models.schemas import LeadCreate, LeadUpdate, LeadStatus, NoteCreate, NoteUpdate, FinanceEntryCreate, FinanceEntryUpdate, VideoCreate, VideoUpdate, CalendarEventCreate, CalendarEventUpdate
from app.core.config import get_settings
from app.services.logic import bot_logic
from app.services import activity_text
from app.services.lead_source import LEAD_SOURCES, MANUAL_DETAIL, MANUAL_CREATE_DETAIL
from typing import List, Optional
from pydantic import BaseModel, ValidationError
import uuid
import os
import json

settings = get_settings()

from app.core.auth import require_auth, require_admin, is_admin_request
from app.core import audit_log
from app.services import finance_transfers
from app.core.permissions import is_viewer

public_router = APIRouter()
protected_router = APIRouter(dependencies=[Depends(require_auth)])

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
    from app.core.webhook_security import check_meta_signature
    raw = await request.body()
    if not check_meta_signature(raw, request.headers.get("x-hub-signature-256")):
        raise HTTPException(status_code=403, detail="Invalid signature")
    try:
        body = json.loads(raw)
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
    from app.core.webhook_security import check_calendar_token
    state = request.headers.get('x-goog-resource-state', '')
    channel_id = request.headers.get('x-goog-channel-id', '')
    print(f"WEBHOOK: Google Calendar push — state={state}, channel={channel_id}")
    if not check_calendar_token(request.headers.get('x-goog-channel-token')):
        raise HTTPException(status_code=403, detail="Invalid channel token")
    
    if state == 'sync':
        # Initial sync verification from Google — just acknowledge
        print("WEBHOOK: Sync verification received. Watch is active.")
        return {"status": "ok"}
    
    if state == 'exists':
        # An event was created/updated/deleted — sync RSVPs
        print("WEBHOOK: Event change detected! Triggering RSVP sync...")
        background_tasks.add_task(_debounced_calendar_sync)
    
    return {"status": "ok"}


# Coalesce bursts of calendar pushes: at most one RSVP sync per CALENDAR_SYNC_MIN_INTERVAL,
# and a change that arrives while a sync is running/waiting triggers exactly one more run.
_cal_sync = {"running": False, "dirty": False, "last": 0.0}


async def _debounced_calendar_sync():
    import asyncio, time
    if _cal_sync["running"]:
        _cal_sync["dirty"] = True
        return
    _cal_sync["running"] = True
    try:
        while True:
            _cal_sync["dirty"] = False
            wait = settings.CALENDAR_SYNC_MIN_INTERVAL - (time.monotonic() - _cal_sync["last"])
            if wait > 0:
                await asyncio.sleep(wait)
            _cal_sync["last"] = time.monotonic()
            try:
                await bot_logic.sync_calendar_rsvps()
            except Exception as e:
                print(f"WEBHOOK: calendar RSVP sync failed: {e}")
            if not _cal_sync["dirty"]:
                break
    finally:
        _cal_sync["running"] = False

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


@protected_router.get("/me")
async def get_me(request: Request):
    """Who is calling: email, role and display name from public.dashboard_users.
    The dashboard uses this instead of a hard-coded user map."""
    if getattr(request.state, "auth_method", None) == "jwt":
        return {
            "email": request.state.auth_user,
            "role": request.state.auth_role,
            "display_name": request.state.auth_display_name,
            "auth_method": "jwt",
        }
    return {"email": None, "role": "service", "display_name": None, "auth_method": "api_key"}


@protected_router.get("/activities")
async def get_activities(request: Request):
    acts = airtable_service.get_activities()
    if is_viewer(request):
        acts = [a for a in acts if activity_text.visible_to_viewer(a)]
    return acts

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

def _manual_source_update(body: dict, detail: str) -> Optional[dict]:
    """Lead_Source chosen by a person (dashboard). Unknown values are ignored."""
    src = (body or {}).get("Lead_Source")
    if src not in LEAD_SOURCES:
        return None
    return {
        "Lead_Source": src,
        "Source_Detail": ((body.get("Source_Detail") or "").strip()[:200] or detail),
        "Source_Detected_At": datetime.now().astimezone().isoformat(),
    }

def _check_owner_patch(lead_id: str, body: dict) -> tuple[dict, Optional[str]]:
    """Owner in a generic PATCH: unchanged -> ignored (no History noise); first assignment of a
    lead without an owner -> allowed; anything else (transfer / removal) must go through
    POST /leads/{id}/transfer with a hand-over note. -> (body without a no-op Owner, assigned owner)."""
    new_owner = (body.get("Owner") or "").strip()
    try:
        current = ((airtable_service.leads_table.get(lead_id) or {}).get("fields") or {}).get("Owner") or ""
    except Exception as e:
        print(f"patch owner: could not read lead {lead_id}: {e}")
        raise HTTPException(status_code=503, detail="לא ניתן לבדוק את המוביל הנוכחי, נסו שוב")
    current = current.strip()
    if new_owner == current:
        return {k: v for k, v in body.items() if k != "Owner"}, None
    if activity_text.owner_change_needs_note(current, new_owner):
        raise HTTPException(status_code=400, detail="העברת מוביל מחייבת הערת העברה (העברת מוביל)")
    if new_owner not in activity_text.PARTNERS:
        raise HTTPException(status_code=400, detail=f"מוביל לא מוכר: {new_owner}")
    return {**body, "Owner": new_owner}, new_owner

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

    # Source chosen in the manual-lead form (improvement #2). Separate tolerant update so the
    # lead is created even if the source columns do not exist yet.
    source_update = _manual_source_update(body, MANUAL_CREATE_DETAIL)
    if source_update and result and result.get("id"):
        updated = airtable_service.update_lead(result["id"], LeadUpdate(**source_update))
        if updated:
            result = updated
    
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
    if body.get("Lead_Source") is not None and body.get("Lead_Source") not in LEAD_SOURCES:
        raise HTTPException(status_code=400, detail="Invalid Lead_Source")
    if body.get("Lead_Source") and not body.get("Source_Detail"):
        body = {**body, **(_manual_source_update(body, MANUAL_DETAIL) or {})}
    owner_assigned = None
    if "Owner" in body:
        body, owner_assigned = _check_owner_patch(lead_id, body)
    data = LeadUpdate(**{k: v for k, v in body.items() if v is not None})
    result = airtable_service.update_lead(lead_id, data)

    if body.get("Status"):
        action_type, description = activity_text.status_changed(body.get("Status"))
        airtable_service.create_activity(ActivityCreate(
            actor="מערכת",
            action_type=action_type,
            description=description,
            lead_id=lead_id
        ))

    if owner_assigned and not body.get("Status"):
        action_type, description = activity_text.owner_updated(owner_assigned)
        airtable_service.create_activity(ActivityCreate(
            actor="מערכת",
            action_type=action_type,
            description=description,
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

@protected_router.post("/leads/{lead_id}/transfer")
async def transfer_lead_owner(lead_id: str, request: Request):
    """Assign or transfer lead ownership, with a note and an activity row (History).
    Rules (activity_text.owner_change_needs_note): the first assignment of a lead without an owner
    needs no note, in any status; a transfer between partners or removing the owner needs a
    hand-over note. The current owner is read from the database, not trusted from the client."""
    body = await request.json()
    new_owner = (body.get("new_owner") or "").strip()
    client_previous = (body.get("previous_owner") or "").strip()
    handover_note = (body.get("handover_note") or "").strip()
    via = (body.get("via") or "").strip()

    try:
        current_lead = airtable_service.leads_table.get(lead_id)
    except Exception as e:
        print(f"transfer: could not read lead {lead_id}: {e}")
        current_lead = None
    if current_lead is None:
        raise HTTPException(status_code=404, detail="הליד לא נמצא")
    previous_owner = ((current_lead.get("fields") or {}).get("Owner") or "").strip()
    actor = (body.get("actor") or "").strip() or previous_owner or new_owner or "מערכת"

    if new_owner and new_owner not in activity_text.PARTNERS:
        raise HTTPException(status_code=400, detail=f"מוביל לא מוכר: {new_owner}")
    if new_owner == previous_owner:
        raise HTTPException(status_code=400, detail="לא ניתן להעביר מוביל לאותו מוביל")
    if "previous_owner" in body and client_previous != previous_owner:
        # the owner changed since the dashboard loaded the lead: never act on a stale view
        raise HTTPException(status_code=409, detail=f"המוביל השתנה בינתיים: {previous_owner or 'ללא מוביל'}")
    if activity_text.owner_change_needs_note(previous_owner, new_owner) and not handover_note:
        raise HTTPException(status_code=400, detail="חובה להזין הערת העברה או תיעוד")

    # Update lead Owner in database
    # raw dict so that removing the owner really writes NULL (LeadUpdate drops None values)
    result = airtable_service.update_lead(lead_id, {"Owner": new_owner or None})

    # Format the note text (shared with the Bot API: app/services/activity_text.py)
    action_type, activity_desc, note_content = activity_text.owner_transfer(previous_owner, new_owner, handover_note)
    activity_desc += activity_text.OWNER_VIA_SUFFIX.get(via, "")

    created_note = None
    try:
        note = NoteCreate(
            lead_id=lead_id,
            author=actor,
            content=note_content,
        )
        created_note = airtable_service.create_note(note)
    except Exception as e:
        print(f"Error creating handover note for lead {lead_id}: {e}")

    try:
        airtable_service.create_activity(ActivityCreate(
            actor=actor,
            action_type=action_type,
            description=activity_desc,
            lead_id=lead_id
        ))
    except Exception as e:
        print(f"Error creating activity for lead {lead_id}: {e}")

    return {
        "status": "success",
        "lead": result,
        "note": created_note
    }

@protected_router.post("/leads/{lead_id}/read")
async def mark_lead_as_read(lead_id: str, request: Request):
    """Mark all messages in a lead as read by updating Last_Read_At.
    Last_Read_At is shared by the whole team, so for a viewer this is a no-op."""
    if is_viewer(request):
        return {"status": "skipped", "reason": "viewer"}
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
    """Physically delete a lead and optionally its calendar event. Also deletes linked tasks."""
    if delete_calendar:
        try:
            await delete_calendar_event(lead_id)
        except Exception as e:
            print(f"Error deleting calendar event while deleting lead: {e}")

    # Delete all tasks linked to this lead
    try:
        deleted_count = airtable_service.delete_tasks_by_lead(lead_id)
        if deleted_count > 0:
            print(f"Cleaned up {deleted_count} tasks when deleting lead {lead_id}")
    except Exception as e:
        print(f"Error cleaning up tasks while deleting lead: {e}")

    airtable_service.delete_lead(lead_id)
    return {"status": "deleted"}

# ─── Messages ─────────────────────────────────────────

@protected_router.get("/leads/{lead_id}/messages")
async def get_messages(lead_id: str):
    return airtable_service.get_messages_for_lead(lead_id)

# Statuses a manual reply may switch to "Manual" (fix #8). Anything else keeps its status.
MANUAL_SWITCHABLE_STATUSES = {
    LeadStatus.NEW.value, LeadStatus.PROCESSING.value, LeadStatus.TALKING.value,
    LeadStatus.COLD.value, LeadStatus.LOST.value, LeadStatus.MANUAL.value,
}

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

    from app.services.whatsapp import send_failed, describe_send_error
    res = bot_logic._send_message(phone, payload.text, lead_id)
    if send_failed(res):
        # fix #3: don't report success, don't mute the bot / change status for a message
        # the customer never received. The message is stored with Status=Failed.
        raise HTTPException(status_code=502, detail=describe_send_error(res))

    # fix #8: always mute the bot for 24h, but only move early-stage leads to Manual;
    # never reopen Closed/Completed or overwrite Quote_Sent/Waiting_Payment/bouzouki states.
    mute_time = datetime.now() + timedelta(hours=24)
    current = lead["fields"].get("Status")
    update = LeadUpdate(bot_mute_until=mute_time)
    if current in MANUAL_SWITCHABLE_STATUSES or not current:
        update = LeadUpdate(status=LeadStatus.MANUAL, bot_mute_until=mute_time)
    try:
        airtable_service.update_lead(lead_id, update)
    except Exception as e:
        print(f"Manual message sent but lead update failed for {lead_id}: {e}")
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
    from app.services.whatsapp import send_failed, describe_send_error
    if send_failed(res):  # fix #3
        print(f"send-intro failed for {lead_id}: {res}")
        raise HTTPException(status_code=502, detail=describe_send_error(res))
    
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

@protected_router.get("/notes/pending")
async def get_pending_followups():
    return airtable_service.get_pending_followups()

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
        follow_up_date=body.get("follow_up_date"),
        follow_up_completed=body.get("follow_up_completed", False),
    )
    result = airtable_service.create_note(note)
    
    action_type, description = activity_text.note_added(note.content)
    airtable_service.create_activity(ActivityCreate(
        actor=note.author or "מערכת",
        action_type=action_type,
        description=description,
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

# what a viewer gets from /musicians: crew names on a lead only (no phone, email, bank details)
VIEWER_MUSICIAN_FIELDS = ("Name", "Type", "Is_Active")

@protected_router.get("/musicians")
async def get_musicians(request: Request):
    musicians = airtable_service.get_all_musicians()
    if is_viewer(request):
        musicians = [{"id": m.get("id"),
                      "fields": {k: (m.get("fields") or {}).get(k) for k in VIEWER_MUSICIAN_FIELDS}}
                     for m in musicians]
    return musicians

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
        type=body.get("Type", "REFERRER"),
        email=body.get("Email"),
        bank_account_name=body.get("Bank_Account_Name"),
        bank_name=body.get("Bank_Name"),
        bank_branch=body.get("Bank_Branch"),
        bank_account_number=body.get("Bank_Account_Number"),
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

    from app.services.whatsapp import send_failed, describe_send_error
    res = bot_logic._send_message(phone, payload.text, musician_id=musician_id)
    if send_failed(res):  # fix #3
        raise HTTPException(status_code=502, detail=describe_send_error(res))
    return {"status": "sent"}

# ─── Finance ─────────────────────────────────────────

@protected_router.get("/leads/{lead_id}/finance")
async def get_lead_finance(lead_id: str):
    """Finance rows of one lead (deal income/expenses), newest first. The lead panel uses this
    instead of downloading the whole finance table; viewers may read it, not /finance."""
    return airtable_service.get_finance_entries_for_lead(lead_id)

@protected_router.get("/finance/summary")
async def get_finance_summary():
    """Get aggregated totals per partner."""
    return airtable_service.get_finance_summary()

@protected_router.get("/finance")
async def get_finance_entries(owner: Optional[str] = Query(None)):
    return airtable_service.get_finance_entries(owner=owner)

@protected_router.post("/finance")
async def create_finance_entry(request: Request):
    """Create a finance entry. Owner must be one of the partners (activity_text.PARTNERS);
    the admin account ('מנהל') has to pick a partner."""
    body = await _transfer_body(request)
    owner = str(body.get("Owner") or "").strip()
    if owner not in activity_text.PARTNERS:
        raise HTTPException(status_code=400, detail="יש לבחור שותף")
    try:
        amount = float(body.get("Amount", 0))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="סכום לא תקין")
    entry = FinanceEntryCreate(
        owner=owner,
        entry_type=body.get("Type", "income"),
        date=body.get("Date", datetime.now().strftime("%Y-%m-%d")),
        description=body.get("Description", ""),
        event_name=body.get("Event_Name"),
        musician=body.get("Musician"),
        amount=amount,
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

# Values of these fields are written to the audit log on edit (others: only the field name).
FINANCE_AUDIT_FIELDS = ("Owner", "Lead_ID", "Amount", "Type", "Date", "Payment_Method", "Payment_Status")


def _same_value(a, b) -> bool:
    if isinstance(a, (int, float)) or isinstance(b, (int, float)):
        try:
            return float(a) == float(b)
        except (TypeError, ValueError):
            return False
    return (a or None) == (b or None)


@protected_router.patch("/finance/{entry_id}")
async def update_finance_entry(entry_id: str, request: Request):
    """Edit a finance entry. Owner must be one of the partners (activity_text.PARTNERS);
    Lead_ID "" or null unlinks the entry from its lead. Changes are audited (before/after)."""
    body = await _transfer_body(request)
    current = airtable_service.get_finance_entry(entry_id)
    if not current:
        raise HTTPException(status_code=404, detail="התנועה לא נמצאה")
    cur = current.get("fields") or {}
    fields = {k: v for k, v in body.items() if v is not None and k not in ("Owner", "Lead_ID")}
    clear: tuple = ()
    if "Owner" in body:
        owner = str(body.get("Owner") or "").strip()
        if owner not in activity_text.PARTNERS:
            raise HTTPException(status_code=400, detail="שותף לא מוכר")
        # Moving an entry to the other partner's pool: admin only (Ilan 2026-10-08).
        if owner != (cur.get("Owner") or "") and not is_admin_request(request):
            raise HTTPException(status_code=403, detail="רק מנהל יכול להעביר תנועה בין שותפים")
        fields["Owner"] = owner
    if "Lead_ID" in body:
        lead_id = str(body.get("Lead_ID") or "").strip()
        if lead_id:
            if lead_id != cur.get("Lead_ID") and not airtable_service.leads_table.get(lead_id):
                raise HTTPException(status_code=400, detail="הליד לא נמצא")
            fields["Lead_ID"] = lead_id
        elif cur.get("Lead_ID"):
            clear = ("Lead_ID",)
    try:
        data = FinanceEntryUpdate(**fields)
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=f"ערך לא תקין: {e.errors()[0].get('loc', [''])[-1]}")
    new = data.model_dump(exclude_none=True, by_alias=True, mode="json")
    new.update({c: None for c in clear})
    changed = [k for k, v in new.items() if not _same_value(cur.get(k), v)]
    if not changed:
        return current
    updated = airtable_service.update_finance_entry(entry_id, data, clear=clear)
    audit_log.record(
        "finance_entry_updated", email=getattr(request.state, "auth_user", None),
        role=getattr(request.state, "auth_role", None), method=request.method, path=request.url.path,
        detail={"entry_id": entry_id, "fields": sorted(changed),
                "before": {k: cur.get(k) for k in FINANCE_AUDIT_FIELDS if k in changed},
                "after": {k: new.get(k) for k in FINANCE_AUDIT_FIELDS if k in changed}})
    return updated

@protected_router.delete("/finance/{entry_id}")
async def delete_finance_entry(entry_id: str):
    airtable_service.delete_finance_entry(entry_id)
    return {"status": "deleted"}

# ─── Partner transfers (app/services/finance_transfers.py) ─────────
# Read: admin + partner (viewers are denied by permissions.VIEWER_GET_DENIED).
# Create / edit / archive: admin only (role admin, JWT). Archive instead of delete.

def _transfer_actor(request: Request) -> tuple[str, str]:
    email = getattr(request.state, "auth_user", None) or "unknown"
    name = getattr(request.state, "auth_display_name", None) or email
    return email, name


def _transfer_audit(request: Request, event: str, transfer_id: str, detail: dict) -> None:
    email, _ = _transfer_actor(request)
    audit_log.record(event, email=email, role=getattr(request.state, "auth_role", None),
                     method=request.method, path=request.url.path,
                     detail={"transfer_id": transfer_id, **detail})


def _transfer_activity(request: Request, prefix: str, row: dict) -> None:
    _, name = _transfer_actor(request)
    try:
        airtable_service.create_activity(ActivityCreate(
            actor=name, action_type=finance_transfers.ACTION_TYPE,
            description=f"{prefix}{finance_transfers.activity_description(row)}"))
    except Exception as e:  # the activity feed must never fail the money write
        print(f"FINANCE_TRANSFERS: activity not written: {type(e).__name__}")


async def _transfer_body(request: Request) -> dict:
    try:
        body = await request.json()
    except Exception:
        body = None
    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="גוף הבקשה חייב להיות JSON")
    return body


def _existing_transfer(transfer_id: str) -> dict:
    row = airtable_service.get_finance_transfer(transfer_id)
    if not row:
        raise HTTPException(status_code=404, detail="העברה לא נמצאה")
    return row


@protected_router.get("/finance/transfers")
async def list_finance_transfers(include_archived: bool = Query(False)):
    try:
        return airtable_service.get_finance_transfers(include_archived=include_archived)
    except Exception as e:
        finance_transfers.warn_unavailable(e)
        raise HTTPException(status_code=503, detail="טבלת ההעברות לא זמינה")


@protected_router.post("/finance/transfers", status_code=201, dependencies=[Depends(require_admin)])
async def create_finance_transfer(request: Request):
    try:
        row = finance_transfers.validate_new(await _transfer_body(request))
    except finance_transfers.TransferError as e:
        raise HTTPException(status_code=e.status, detail=e.detail)
    row["created_by"] = _transfer_actor(request)[0]
    created = airtable_service.create_finance_transfer(row)
    if not created:
        raise HTTPException(status_code=503, detail="שמירת ההעברה נכשלה")
    _transfer_audit(request, "finance_transfer_created", created.get("id"),
                    {k: row[k] for k in finance_transfers.EDITABLE})
    _transfer_activity(request, "", row)
    return created


@protected_router.patch("/finance/transfers/{transfer_id}", dependencies=[Depends(require_admin)])
async def update_finance_transfer(transfer_id: str, request: Request):
    body = await _transfer_body(request)
    current = _existing_transfer(transfer_id)
    if current.get("archived_at"):
        raise HTTPException(status_code=409, detail="העברה מאורכבת — יש לשחזר לפני עריכה")
    try:
        changes = finance_transfers.validate_update(current, body)
    except finance_transfers.TransferError as e:
        raise HTTPException(status_code=e.status, detail=e.detail)
    if not changes:
        return current
    changes["updated_by"] = _transfer_actor(request)[0]
    changes["updated_at"] = datetime.now().astimezone().isoformat()
    updated = airtable_service.update_finance_transfer(transfer_id, changes)
    _transfer_audit(request, "finance_transfer_updated", transfer_id, {
        "before": {k: current.get(k) for k in finance_transfers.EDITABLE if k in changes},
        "after": {k: changes[k] for k in finance_transfers.EDITABLE if k in changes}})
    _transfer_activity(request, "עודכנה: ", {**current, **changes})
    return updated


@protected_router.post("/finance/transfers/{transfer_id}/archive", dependencies=[Depends(require_admin)])
async def archive_finance_transfer(transfer_id: str, request: Request):
    try:
        body = await request.json()
    except Exception:
        body = {}
    reason = (body.get("reason") if isinstance(body, dict) else None) or None
    if reason is not None:
        reason = str(reason).strip()[:finance_transfers.MAX_NOTE] or None
    current = _existing_transfer(transfer_id)
    if current.get("archived_at"):
        return current
    updated = airtable_service.update_finance_transfer(transfer_id, {
        "archived_at": datetime.now().astimezone().isoformat(),
        "archived_by": _transfer_actor(request)[0], "archive_reason": reason})
    _transfer_audit(request, "finance_transfer_archived", transfer_id, {"reason": reason})
    _transfer_activity(request, "אורכבה: ", current)
    return updated


@protected_router.post("/finance/transfers/{transfer_id}/unarchive", dependencies=[Depends(require_admin)])
async def unarchive_finance_transfer(transfer_id: str, request: Request):
    current = _existing_transfer(transfer_id)
    if not current.get("archived_at"):
        return current
    updated = airtable_service.update_finance_transfer(transfer_id, {
        "archived_at": None, "archived_by": None, "archive_reason": None})
    _transfer_audit(request, "finance_transfer_unarchived", transfer_id, {})
    _transfer_activity(request, "שוחזרה: ", current)
    return updated

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
    
    action_type, description = activity_text.task_created(task.title)
    airtable_service.create_activity(ActivityCreate(
        actor=task.assignee or "מערכת",
        action_type=action_type,
        description=description,
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

@protected_router.post("/leads/{lead_id}/handle-tasks")
async def handle_lead_tasks(lead_id: str, request: Request):
    """Handle linked tasks when a lead status changes (e.g. set to Lost).
    Body: { "action": "complete" | "delete" }
    """
    body = await request.json()
    action = body.get("action", "complete")
    
    if action == "delete":
        count = airtable_service.delete_tasks_by_lead(lead_id)
    elif action == "complete":
        count = airtable_service.complete_tasks_by_lead(lead_id)
    else:
        raise HTTPException(status_code=400, detail=f"Invalid action: {action}")
    
    return {"status": "success", "action": action, "affected_count": count}

@protected_router.post("/tasks/cleanup-orphaned")
async def cleanup_orphaned_tasks():
    """Find and handle tasks linked to deleted or Lost leads.
    - Tasks linked to a deleted lead → deleted
    - Incomplete tasks linked to a Lost lead → marked as completed
    """
    result = airtable_service.cleanup_orphaned_tasks()
    return result

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
    Called daily (e.g. at 8:00 AM) by an external cron service (like cron-job.org).
    Sends a summary of follow-up reminders, new leads, and starred tasks to admins via WhatsApp.
    """
    import hmac as _hmac
    auth = request.headers.get("Authorization") or ""
    secret = os.getenv("CRON_SECRET")
    if not secret:  # no hard-coded fallback: refuse instead of accepting a value from the repo
        print("CRON: CRON_SECRET is not set - /cron/reminders disabled")
        raise HTTPException(status_code=503, detail="Cron not configured")
    if not _hmac.compare_digest(auth.encode(), f"Bearer {secret}".encode()):
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    from app.services.supabase_service import supabase_service
    from app.services.whatsapp import whatsapp_service
    
    tasks = supabase_service.get_tasks()
    leads = supabase_service.get_all_leads()
    followup_notes = supabase_service.get_notes_due_today()
    
    # Create a lookup for lead names
    lead_lookup = {l.get("id"): l.get("fields", {}) for l in leads}
    
    open_tasks = [t for t in tasks if not t.get("fields", {}).get("Is_Completed")]
    new_leads = [l for l in leads if l.get("fields", {}).get("Status") in ["New", "Processing"]]
    
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
            
        # Filter tasks for this specific user or "כולם"
        u_tasks = [t for t in open_tasks if user_name in (t.get("fields", {}).get("Starred_By") or []) or "כולם" in (t.get("fields", {}).get("Starred_By") or [])]
        
        # Build message sections
        sections = []
        
        # Section 1: Follow-up reminders (for all admins)
        if followup_notes:
            fu_parts = []
            for note in followup_notes:
                note_fields = note.get("fields", {})
                lead_id = note_fields.get("Lead_ID", "")
                lead_fields = lead_lookup.get(lead_id, {})
                lead_name = lead_fields.get("Name", "לקוח")
                author = note_fields.get("Author", "")
                content_preview = (note_fields.get("Content", "") or "")[:30]
                fu_parts.append(f"🔔 {lead_name}: \"{content_preview}\" ({author})")
            sections.append(f"פולו-אפ להיום: {' | '.join(fu_parts)}")
        
        # Section 2: New/Processing leads (for all admins)
        if new_leads:
            lead_parts = []
            for l in new_leads:
                name = l.get("fields", {}).get("Name", "ללא שם")
                date = l.get("fields", {}).get("Event_Date", "ללא תאריך")
                lead_parts.append(f"👤 {name} ({date})")
            sections.append(f"לידים חדשים: {' | '.join(lead_parts)}")
                
        # Section 3: Starred tasks (per user)
        if u_tasks:
            task_parts = []
            for t in u_tasks:
                title = t.get("fields", {}).get("Title", "משימה")
                lead_id = t.get("fields", {}).get("Lead_ID")
                lead_info = ""
                if lead_id:
                    if isinstance(lead_id, list) and lead_id:
                        lead_id = lead_id[0]
                    lead = lead_lookup.get(lead_id, {})
                    lead_name = lead.get("Name")
                    if lead_name:
                        lead_info = f" (מקושרת לליד \"{lead_name}\")"
                task_parts.append(f"✅ {title}{lead_info}")
            sections.append(f"משימות: {' | '.join(task_parts)}")
        
        if not sections:
            send_results.append({"phone": phone, "status": "No items for this user"})
            continue
        
        final_text = " • ".join(sections)
            
        # Limit text length as Meta has limits
        if len(final_text) > 500:
            final_text = final_text[:497] + "..."
            
        from app.services.logic import HaydeBotLogic
        sanitized_text = HaydeBotLogic._sanitize_template_param(final_text)
            
        res = whatsapp_service.send_template(phone, "admin_system_alert_v2", "he", ["תזכורת יומית 🔔", sanitized_text])
        from app.services.whatsapp import send_failed
        send_results.append({"phone": f"***{str(phone)[-4:]}", "user": user_name,
                             "ok": not send_failed(res)})
            
    return {
        "status": "Reminders processing complete", 
        "whatsapp_results": send_results,
        "followup_notes_count": len(followup_notes)
    }


# ─── Admin Backup ─────────────────────────────────────

import requests
import json
from fastapi.responses import JSONResponse

@protected_router.get("/backup/full")
async def get_full_database_backup(request: Request):
    """Admin endpoint to backup Supabase schema and all data.
    Full dump of every table -> not available with the (public) legacy key: requires an
    admin dashboard session (Supabase JWT) or the server-to-server API_KEY."""
    from app.core.auth import is_admin_request
    if not is_admin_request(request):
        raise HTTPException(status_code=403, detail="גיבוי מלא זמין רק למנהל מחובר. התחברו מחדש ונסו שוב.")
    if not settings.SUPABASE_URL or not settings.SUPABASE_KEY:
        raise HTTPException(status_code=500, detail="Supabase credentials missing")
        
    try:
        # 1. Fetch OpenAPI Schema
        schema_url = f"{settings.SUPABASE_URL}/rest/v1/?apikey={settings.SUPABASE_KEY}"
        schema_resp = requests.get(schema_url, timeout=(settings.HTTP_CONNECT_TIMEOUT, settings.SUPABASE_TIMEOUT))
        schema_resp.raise_for_status()
        schema_data = schema_resp.json()
        
        definitions = schema_data.get("definitions", {})
        table_names = list(definitions.keys())
        
        # 2. Fetch Data for each table (with pagination to get ALL records)
        data = {}
        for table in table_names:
            table_records = []
            offset = 0
            limit = 1000
            
            while True:
                # Query the table via REST directly to easily pass limits and offsets
                # We could use the python client, but raw REST gives us explicit control
                headers = {
                    "apikey": settings.SUPABASE_KEY,
                    "Authorization": f"Bearer {settings.SUPABASE_KEY}",
                    "Range": f"{offset}-{offset + limit - 1}"
                }
                table_url = f"{settings.SUPABASE_URL}/rest/v1/{table}?select=*"
                resp = requests.get(table_url, headers=headers, timeout=(settings.HTTP_CONNECT_TIMEOUT, settings.SUPABASE_TIMEOUT))
                
                if resp.status_code != 200:
                    print(f"Failed to fetch {table}: {resp.text}")
                    break
                    
                chunk = resp.json()
                table_records.extend(chunk)
                
                if len(chunk) < limit:
                    break
                    
                offset += limit
                
            data[table] = table_records
            
        backup = {
            "schema": schema_data,
            "data": data,
            "timestamp": datetime.now().isoformat()
        }
        
        # Return as downloadable JSON file
        headers = {
            "Content-Disposition": f"attachment; filename=haydebot_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        }
        return JSONResponse(content=backup, headers=headers)
        
    except Exception as e:
        print(f"Backup Error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Backup failed: {str(e)}")

# ─── Business Contacts ───────────────────────────────

@protected_router.get("/business-contacts")
async def get_business_contacts():
    return airtable_service.get_business_contacts()

@protected_router.post("/business-contacts")
async def create_business_contact(request: Request):
    body = await request.json()
    from app.models.schemas import BusinessContactCreate
    contact = BusinessContactCreate(**body)
    return airtable_service.create_business_contact(contact)

@protected_router.patch("/business-contacts/{contact_id}")
async def update_business_contact(contact_id: str, request: Request):
    body = await request.json()
    from app.models.schemas import BusinessContactUpdate
    data = BusinessContactUpdate(**{k: v for k, v in body.items() if v is not None})
    return airtable_service.update_business_contact(contact_id, data)

@protected_router.delete("/business-contacts/{contact_id}")
async def delete_business_contact(contact_id: str):
    airtable_service.delete_business_contact(contact_id)
    return {"status": "deleted"}

@protected_router.post("/business-contacts/from-lead/{lead_id}")
async def create_business_contact_from_lead(lead_id: str):
    # 1. Fetch lead
    lead = airtable_service.leads_table.get(lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
        
    # 2. Fetch notes
    notes = airtable_service.get_notes_for_lead(lead_id)
    notes_text = ""
    for n in notes:
        author = n.get("fields", {}).get("Author", "")
        content = n.get("fields", {}).get("Content", "")
        date = n.get("fields", {}).get("Created_At", "")
        notes_text += f"[{date}] {author}: {content}\n"
        
    # 3. Generate summary
    from app.services.ai import ai_service
    summary = ai_service.summarize_lead_notes(notes_text)
    
    # 4. Create contact
    from app.models.schemas import BusinessContactCreate
    contact = BusinessContactCreate(
        Name=lead.get("fields", {}).get("Name", "ללא שם"),
        Phone=lead.get("fields", {}).get("Phone", ""),
        Role="מפיק / איש תרבות",
        Company="",
        Summary=summary,
        Lead_ID=lead_id
    )
    result = airtable_service.create_business_contact(contact)
    return result
