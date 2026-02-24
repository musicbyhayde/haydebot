import asyncio
from datetime import datetime, timedelta
from typing import Optional
from app.services.supabase_service import airtable_service
from app.services.whatsapp import whatsapp_service
from app.models.schemas import LeadCreate, LeadUpdate, LeadStatus, ServiceType, ConversationState, MessageCreate
from app.core.scheduler import scheduler
from app.core.config import get_settings
from app.services.ai import ai_service
from app.services.email import email_service

settings = get_settings()

class HaydeBotLogic:
    def __init__(self):
        self.processed_messages = set()
        self.pending_musician_actions = {}

    async def process_webhook(self, body: dict):
        """
        Main entry point for webhook events.
        """
        try:
            entry = body.get("entry", [])[0]
            changes = entry.get("changes", [])[0]
            value = changes.get("value", {})
            
            # 1. Check for incoming messages
            if "messages" in value:
                message = value["messages"][0]
                contact = value.get("contacts", [{}])[0]
                sender_phone = message.get("from")
                sender_name = contact.get("profile", {}).get("name", "Unknown")
                
                # Identify message type and content
                msg_type = message.get("type")
                text_content = ""
                interactive_id = None
                media_url = None
                media_type = None
                
                if msg_type == "text":
                    text_content = message["text"]["body"]
                elif msg_type == "interactive":
                    interaction = message["interactive"]
                    if interaction["type"] == "button_reply":
                        interactive_id = interaction["button_reply"]["id"]
                        text_content = interaction["button_reply"]["title"] 
                    elif interaction["type"] == "list_reply":
                        interactive_id = interaction["list_reply"]["id"]
                        text_content = interaction["list_reply"]["title"]
                elif msg_type in ["image", "audio", "video", "document", "voice"]:
                    media_obj = message.get(msg_type, {})
                    media_id = media_obj.get("id")
                    if media_id:
                        import uuid
                        file_bytes, mime_type = whatsapp_service.download_media(media_id)
                        if file_bytes:
                            ext = mime_type.split('/')[-1].split(';')[0] if mime_type else "bin"
                            file_name = f"{uuid.uuid4().hex}.{ext}"
                            media_url = airtable_service.upload_media(file_bytes, file_name, mime_type)
                            media_type = mime_type
                            text_content = f"[{msg_type.upper()} RECEIVED]"
                        else:
                            text_content = f"[Failed to download {msg_type.upper()}]"
                    else:
                        text_content = f"[{msg_type.upper()} RECEIVED]"
                else:
                    text_content = f"[{msg_type.upper()} RECEIVED]"

                # Process
                await self.handle_incoming_message(sender_phone, sender_name, text_content, interactive_id, message.get("id"), media_url, media_type)

        except Exception as e:
            print(f"Error processing webhook: {e}")

    async def handle_incoming_message(self, phone: str, name: str, text: str, interactive_id: str, whatsapp_id: str = None, media_url: str = None, media_type: str = None):
        if whatsapp_id:
            if whatsapp_id in self.processed_messages:
                print(f"DEBUG: Skipping already processed message (local cache): {whatsapp_id}")
                return
            if airtable_service.is_message_processed(whatsapp_id):
                print(f"DEBUG: Skipping already processed message (Airtable): {whatsapp_id}")
                self.processed_messages.add(whatsapp_id)
                return
            
            # Add to local cache
            self.processed_messages.add(whatsapp_id)
            # Max cache size 500 to prevent memory leak
            if len(self.processed_messages) > 500:
                self.processed_messages.pop()

        # 1. Musician/Lead Detection Logic
        all_musicians = airtable_service.get_all_musicians()
        musician_record = next((m for m in all_musicians if self._phones_match(m["fields"].get("Phone"), phone)), None)
        is_musician = musician_record is not None
        musician_id = musician_record["id"] if is_musician else None

        active_lead = self.get_active_lead_robust(phone)
        
        # Determine if this is a musician interaction
        is_musician_interaction = False
        if interactive_id and any(interactive_id.startswith(p) for p in ["claim_", "unavailable_", "contacted_", "closed_", "lost_"]):
            is_musician_interaction = True
        
        # If they are a musician AND no lead is in progress, treat as musician
        # IF they are a musician BUT they have a lead in progress, treat as customer UNLESS it's a claim button
        if is_musician and (is_musician_interaction or not active_lead):
            airtable_service.create_message(MessageCreate(
                musician=[musician_id],
                direction="Inbound",
                content=text,
                media_url=media_url,
                media_type=media_type,
                timestamp=datetime.now(),
                id=whatsapp_id,
                status="Delivered"
            ))
            if is_musician_interaction:
                await self.handle_musician_interaction(phone, interactive_id)
            else:
                # Check if this musician has a pending action (Closing Amount or Lost Reason)
                if phone in self.pending_musician_actions:
                    pending = self.pending_musician_actions[phone]
                    p_lead_id = pending["lead_id"]
                    action = pending["action"]
                    
                    if action == "AWAITING_AMOUNT":
                        try:
                            # Clean string and extract numbers
                            import re
                            amount_str = re.sub(r'[^\d.]', '', text)
                            amount = float(amount_str)
                            commission = max(amount * 0.15, 400.0) # 15% or 400 ILS
                            airtable_service.update_lead(p_lead_id, LeadUpdate(closing_amount=amount))
                            del self.pending_musician_actions[phone]
                            self._send_message(phone, f"נקלט בהצלחה ({amount} ₪). העמלה המחושבת היא ₪{commission:.0f} כולל מע״מ. תודה! 💸", musician_id=musician_id)
                        except ValueError:
                            self._send_message(phone, "אנא הזן מספר בלבד (לדוגמה: 2500).", musician_id=musician_id)
                        return # Stop processing
                        
                    elif action == "AWAITING_REASON":
                        airtable_service.update_lead(p_lead_id, LeadUpdate(lost_reason=text))
                        del self.pending_musician_actions[phone]
                        self._send_message(phone, "תודה, העדכון נשמר במערכת. 🙏", musician_id=musician_id)
                        
                        # Notify Admins with the lost reason
                        lead_failed = airtable_service.leads_table.get(p_lead_id)
                        if lead_failed:
                            lf_fields = lead_failed["fields"]
                            alert_msg = f"🚨 ליד מת (בוזוקי) ברח לנו!\n\nהלקוח: {lf_fields.get('Name')} / {lf_fields.get('Phone')}\nנגן דיווח סיבת הפסד:\n\"{text}\"\n\nהיכנס עכשיו לפנל לראות אם אפשר להציל אותו עם הצעת מחיר חלופית."
                            if settings.NOTIFICATION_NUMBERS:
                                for admin_phone in settings.NOTIFICATION_NUMBERS.split(","):
                                    if admin_phone.strip():
                                        whatsapp_service.send_message(admin_phone.strip(), alert_msg)
                        return # Stop processing
            return

        # 2. Identify or Create Lead
        lead = active_lead
        lead_id = lead["id"] if lead else None

        # 3. Handle New User Case
        if not lead:
             lead_id = await self.start_new_conversation(phone, name)
             # Log the initial message that started it
             airtable_service.create_message(MessageCreate(
                lead=[lead_id],
                direction="Inbound",
                content=text,
                media_url=media_url,
                media_type=media_type,
                timestamp=datetime.now(),
                id=whatsapp_id,
                status="Delivered"
             ))
             return 

        # 3. Log Message for Existing User
        airtable_service.create_message(MessageCreate(
            lead=[lead_id],
            direction="Inbound",
            content=text,
            media_url=media_url,
            media_type=media_type,
            timestamp=datetime.now(),
            id=whatsapp_id,
            status="Delivered"
        ))

        # EXISTING ACTIVE LEAD
        fields = lead["fields"]
        state = fields.get("Conversation_State", ConversationState.START)
        
        # 3. Detect Bot Mute (Human Takeover)
        bot_mute_until = fields.get("Bot_Mute_Until")
        if bot_mute_until:
            try:
                mute_time = datetime.fromisoformat(bot_mute_until.replace('Z', '+00:00'))
                if datetime.now(mute_time.tzinfo) < mute_time:
                    # Bot is muted, just log the message and don't reply
                    print(f"Bot is muted for lead {lead_id}, ignoring automated response.")
                    
                    # Notify Admin that the human-taken-over lead replied
                    if settings.NOTIFICATION_NUMBERS:
                        for idx, admin_phone in enumerate(settings.NOTIFICATION_NUMBERS.split(",")):
                            if admin_phone.strip() and phone != admin_phone.strip():
                                preview = f"[מדיה]" if media_url else f'"{text}"'
                                alert_msg = f"🔔 הודעה חדשה מ-{name or phone} (בצאט ידני):\n\n{preview}\n\nהיכנס עכשיו לפנל הניהול כדי להשיב."
                                whatsapp_service.send_message(admin_phone.strip(), alert_msg)
                    return
            except Exception as e:
                print(f"Error parsing bot_mute_until: {e}")

        # 4. Detect Global Commands (e.g., Restart/Menu)
        clean_text = text.lower().strip()
        if clean_text in ["התחל מחדש", "תפריט", "שלום", "היי", "menu", "restart"]:
             await self.handle_reset_command(phone, lead_id)
             return
        
        # 4. Smart Resume Check
        last_interaction_str = fields.get("Last_Interaction")
        if last_interaction_str and not interactive_id and state not in [ConversationState.COMPLETED, ConversationState.START]:
             try:
                 # Airtable dates are sometimes strings with Z or +00:00
                 ts = last_interaction_str.replace('Z', '+00:00')
                 last_time = datetime.fromisoformat(ts)
                 if datetime.now(last_time.tzinfo) - last_time > timedelta(hours=4):
                      self._send_interactive(
                          phone, 
                          "שמנו לב שהפסקנו באמצע השיחה הקודמת... תרצה להמשיך או שנתחיל מהתחלה?", 
                          "RESUME_YES", 
                          "המשך", 
                          lead_id, 
                          buttons=[
                            ("RESUME_YES", "🔄 המשך מאיפה שעצרנו"),
                            ("RESUME_NO", "🆕 התחל מהתחלה")
                          ]
                      )

                      return
             except Exception as e:
                 print(f"Resume check error: {e}")

        # 5. Update Last Interaction Time
        airtable_service.update_lead(lead_id, LeadUpdate(last_interaction=datetime.now()))

        # 6. State Machine Router
        if interactive_id == "RESUME_YES":
             await self.send_state_question(phone, state)
             return
        elif interactive_id == "RESUME_NO":
             await self.handle_reset_command(phone, lead_id)
             return

        # Router based on CURRENT State (processing the ANSWER)
        if state == ConversationState.START:
             await self.handle_start_state(phone, lead_id, interactive_id, text)
        elif state == ConversationState.AWAITING_SERVICE:
             await self.handle_service_selection(phone, lead_id, interactive_id, text)
        elif state == ConversationState.AWAITING_DATE:
             await self.handle_date_input(phone, lead_id, text)
        elif state == ConversationState.AWAITING_LOCATION:
             await self.handle_location_input(phone, lead_id, text)
        elif state == ConversationState.AWAITING_GUESTS:
             await self.handle_guests_input(phone, lead_id, text)
        elif state == ConversationState.COMPLETED:
             self._send_message(phone, "פרטי האירוע נשמרו! אם תרצו לשנות משהו או להתחיל מחדש, רשמו לנו 'תפריט'. 🎸", lead_id)

        # 6. Musician Protocol (Separated)
        if interactive_id and (
            interactive_id.startswith("claim_") or 
            interactive_id.startswith("unavailable_") or
            interactive_id.startswith("contacted_") or 
            interactive_id.startswith("closed_") or 
            interactive_id.startswith("lost_")
        ):
             await self.handle_musician_interaction(phone, interactive_id)

    async def start_new_conversation(self, phone: str, name: str) -> str:
        # Create Lead
        lead_data = LeadCreate(
            phone=phone,
            name=name,
            conversation_state=ConversationState.AWAITING_SERVICE, # Jump straight to awaiting service after welcome
            last_interaction=datetime.now()
        )
        new_lead = airtable_service.create_lead(lead_data)
        lead_id = new_lead["id"]
        
        await self.send_welcome_menu(phone)
        return lead_id

    async def send_welcome_menu(self, phone: str):
        # Need lead_id to log?
        lead = airtable_service.get_active_lead_by_phone(phone)
        lead_id = lead["id"] if lead else None

        # Send Service Menu
        sections = [
            {
                "title": "בחרו שירות",
                "rows": [
                    {"id": "SVC_BOUZOUKI", "title": "נגן בוזוקי 🎸", "description": "בוזוקי לחתונה/אירוע"},
                    {"id": "SVC_RECEPTION", "title": "קבלת פנים 🎻", "description": "מוזיקת אווירה לקבלת פנים"},
                    {"id": "SVC_BAND", "title": "להקה 🥁", "description": "להקה מלאה"},
                    {"id": "SVC_DJ", "title": "דיג'יי 🎧", "description": "מוזיקה לכל הערב"},
                    {"id": "SVC_TALK", "title": "לדבר עם מישהו 📞", "description": "שיחה עם נציג"},
                    {"id": "SVC_OTHER", "title": "אחר ✨", "description": "משהו מיוחד"}
                ]
            }
        ]
        whatsapp_service.send_list_message(
            phone, 
            "איזה כיף שפנית אלינו! במה נוכל לעזור?", 
            "לחצו לבחירה", 
            "תפריט שירותים", 
            sections
        )
        
        # Log outgoing (manually constructing for list message)
        if lead_id:
            airtable_service.create_message(MessageCreate(
                lead=[lead_id],
                direction="Outbound",
                content="Welcome Menu Sent",
                timestamp=datetime.now()
            ))

    async def handle_start_state(self, phone: str, lead_id: str, interactive_id: str, text: str):
        # If they wrote text instead of button, resend menu
        await self.send_welcome_menu(phone)
        # Update state just in case
        airtable_service.update_lead(lead_id, LeadUpdate(conversation_state=ConversationState.AWAITING_SERVICE))

    async def handle_service_selection(self, phone: str, lead_id: str, interactive_id: str, text: str):
        service_map = {
            "SVC_BOUZOUKI": ServiceType.BOUZOUKI,
            "SVC_BAND": ServiceType.BAND,
            "SVC_DJ": ServiceType.DJ,
            "SVC_RECEPTION": ServiceType.RECEPTION,
            "SVC_TALK": ServiceType.TALK,
            "SVC_OTHER": ServiceType.OTHER
        }
        
        selected_service = service_map.get(interactive_id)
        if not selected_service:
            # Fallback if they typed it manually? For MVP force menu.
            self._send_message(phone, "אנא בחרו מהתפריט כדי שנוכל להתקדם. 🙏", lead_id)
            await self.send_welcome_menu(phone)
            return

        # Update Lead (Wrap in try because Airtable SingleSelect might block new values)
        try:
            airtable_service.update_lead(lead_id, LeadUpdate(
                service=selected_service
            ))
        except Exception as e:
            print(f"Error updating service in Airtable: {e}. Suggest changing field to Single Line Text.")

        if selected_service == ServiceType.TALK:
             airtable_service.update_lead(lead_id, LeadUpdate(
                 conversation_state=ConversationState.COMPLETED,
                 status=LeadStatus.MANUAL
             ))
             self._send_message(phone, "אין בעיה! כבר מעביר את הפנייה שלך לאחד הנציגים שלנו שייצור איתך קשר בהקדם. 😊", lead_id)
             # Notify admins immediately
             lead = airtable_service.leads_table.get(lead_id)
             await self.notify_admins(lead["fields"])
             return

        # Continue flow
        airtable_service.update_lead(lead_id, LeadUpdate(
            conversation_state=ConversationState.AWAITING_DATE
        ))

        # Ask Date
        self._send_interactive(
            phone,
            "מעולה! 🤘\nמתי האירוע מתוכנן?",
            "DATE_UNKNOWN",
            "🤔 עדיין אין תאריך",
            lead_id
        )

    async def handle_date_input(self, phone: str, lead_id: str, text: str):
        print(f"DEBUG: handle_date_input for {phone}, text: {text}")
        if text == "🤔 עדיין אין תאריך" or text == "DATE_UNKNOWN":
            date_val = "TBD"
        else:
            # Use AI to extract or validate
            print(f"DEBUG: Calling AI for date analysis...")
            res = ai_service.analyze_input("date", text)
            print(f"DEBUG: AI Result: {res}")
            if not res["valid"]:
                # Gentle steer back
                self._send_message(phone, res.get("reply", "אני אשמח קודם כל להבין מתי האירוע כדי לתת לך את המענה הטוב ביותר. 😊"), lead_id)
                return
            date_val = res["extracted_value"]

        print(f"DEBUG: Updating Airtable for lead {lead_id} with date {date_val}")
        try:
            airtable_service.update_lead(lead_id, LeadUpdate(
                event_date=date_val,
                conversation_state=ConversationState.AWAITING_LOCATION
            ))
        except Exception as e:
            print(f"DEBUG: Airtable update failed: {e}")

        # Ask Location
        print(f"DEBUG: Sending location question to {phone}")
        self._send_interactive(
            phone,
            "ואיפה חוגגים? (עיר/אולם)",
            "LOC_UNKNOWN",
            "🤔 עדיין אין מיקום",
            lead_id
        )
        print(f"DEBUG: handle_date_input finished.")

    async def handle_location_input(self, phone: str, lead_id: str, text: str):
        if text == "🤔 עדיין אין מיקום" or text == "LOC_UNKNOWN":
            loc_val = "TBD"
        else:
            res = ai_service.analyze_input("location", text)
            if not res["valid"]:
                self._send_message(phone, res.get("reply", "אשמח לדעת איפה האירוע מתוכנן כדי שנוכל לבדוק זמינות. 📍"), lead_id)
                return
            loc_val = res["extracted_value"]

        airtable_service.update_lead(lead_id, LeadUpdate(
            location=loc_val,
            conversation_state=ConversationState.AWAITING_GUESTS
        ))

        # Ask Guests
        self._send_interactive(
            phone,
            "ואחרון חביב - לכמה אורחים האירוע?",
            "GUESTS_UNKNOWN",
            "🤔 עדיין לא בטוח",
            lead_id
        )

    async def handle_guests_input(self, phone: str, lead_id: str, text: str):
        if text == "🤔 עדיין לא בטוח" or text == "GUESTS_UNKNOWN":
            guests_val = "TBD"
        else:
            res = ai_service.analyze_input("guests", text)
            if not res["valid"]:
                self._send_message(phone, res.get("reply", "זה עוזר לנו מאוד להתאים את ההצעה - לכמה אורחים בערך האירוע? 👥"), lead_id)
                return
            guests_val = res["extracted_value"]

        # Finalize
        airtable_service.update_lead(lead_id, LeadUpdate(
            guests=guests_val,
            conversation_state=ConversationState.COMPLETED,
            status=LeadStatus.PROCESSING
        ))

        self._send_message(phone, "מגניב, רשמנו את כל הפרטים, בודקים זמינות וחוזרים אלייך תיק תק! 🎸", lead_id)

        # Trigger Protocol if Bouzouki
        lead = airtable_service.leads_table.get(lead_id)
        if lead["fields"].get("Service") == ServiceType.BOUZOUKI.value:
             await self.start_bouzouki_protocol(lead_id, lead["fields"])
        else:
            # For other services, human will handle - Notify Admins
            await self.notify_admins(lead["fields"])
            print(f"Lead {lead_id} completed. Admins notified.")

    async def send_state_question(self, phone: str, state: ConversationState):
        if state == ConversationState.AWAITING_SERVICE:
            await self.send_welcome_menu(phone)
        elif state == ConversationState.AWAITING_DATE:
             whatsapp_service.send_interactive_button(phone, "מתי האירוע מתוכנן?", "DATE_UNKNOWN", "🤔 עדיין אין תאריך")
        elif state == ConversationState.AWAITING_LOCATION:
             whatsapp_service.send_interactive_button(phone, "איפה חוגגים?", "LOC_UNKNOWN", "🤔 עדיין אין מיקום")
        elif state == ConversationState.AWAITING_GUESTS:
             whatsapp_service.send_interactive_button(phone, "לכמה אורחים האירוע?", "GUESTS_UNKNOWN", "🤔 עדיין לא בטוח")

    async def handle_musician_interaction(self, musician_phone: str, button_id: str):
        # Helper to get musician record
        all_musicians = airtable_service.get_all_musicians()
        musician_record = next((m for m in all_musicians if self._phones_match(m["fields"].get("Phone"), musician_phone)), None)
        if not musician_record: 
            print(f"Warning: Interaction from unknown phone {musician_phone}")
            return
        m_id = musician_record["id"]

        if button_id.startswith("claim_"):
            lead_id = button_id.split("_")[1]
            try:
                lead = airtable_service.leads_table.get(lead_id)
            except Exception as e:
                print(f"Warning: Lead {lead_id} not found: {e}")
                self._send_message(musician_phone, "סליחה, לא מצאתי את פרטי האירוע במערכת. 😔", musician_id=m_id)
                return
            fields = lead["fields"]
            
            # Check if already assigned or lead is no longer valid
            if fields.get("Musician_Assigned"):
                self._send_message(musician_phone, "סליחה, האירוע כבר נתפס ע\"י נגן אחר. 😔", musician_id=m_id)
                return
            
            if fields.get("Status") in [LeadStatus.CLOSED.value, LeadStatus.LOST.value]:
                self._send_message(musician_phone, "סליחה, האירוע הזה כבר לא רלוונטי. 🚫", musician_id=m_id)
                return

            airtable_service.assign_musician(lead_id, m_id)
            
            contact_info = f"פרטי הלקוח:\nשם: {fields.get('Name', 'ללא שם')}\nטלפון: {fields.get('Phone')}"
            self._send_interactive(
                musician_phone, 
                f"איזה כיף! האירוע שלך. 🎉\n{contact_info}\n\nאנא עדכן כשדיברת איתם:",
                f"contacted_{lead_id}",
                "📞 דיברתי איתם",
                musician_id=m_id
            )

            await self.schedule_musician_followups(lead_id, musician_phone, m_id)

        elif button_id.startswith("unavailable_"):
             lead_id = button_id.split("_")[1]
             try:
                 lead = airtable_service.leads_table.get(lead_id)
                 fields = lead["fields"]
                 if fields.get("Musician_Assigned") or fields.get("Status") in [LeadStatus.CLOSED.value, LeadStatus.LOST.value]:
                     self._send_message(musician_phone, "הבנתי, בכל מקרה האירוע הזה כבר לא רלוונטי או נתפס. נתראה בבא! 😊", musician_id=m_id)
                     return
             except Exception:
                 pass  # Lead not found, treat as unavailable anyway
             self._send_message(musician_phone, "הבנתי, תודה על העדכון! נתראה באירוע הבא. 😊", musician_id=m_id)

        elif button_id.startswith("contacted_"):
             lead_id = button_id.split("_")[1]
             try:
                 airtable_service.update_lead(lead_id, LeadUpdate(last_summary="Musician confirmed contact"))
             except Exception as e:
                 print(f"Warning: Failed to update lead {lead_id}: {e}")
             # Clear no_answer tracking if exists
             if musician_phone in self.pending_musician_actions and "no_answer_count" in self.pending_musician_actions.get(musician_phone, {}):
                 del self.pending_musician_actions[musician_phone]
             self._send_message(musician_phone, "מעולה! בהצלחה. נדבר עוד 24 שעות.", musician_id=m_id)

        elif button_id.startswith("noanswer_"):
             lead_id = button_id.split("_")[1]
             try:
                 lead = airtable_service.leads_table.get(lead_id)
             except Exception:
                 self._send_message(musician_phone, "לא מצאתי את הליד. 😔", musician_id=m_id)
                 return
             if not lead or lead["fields"].get("Status") != LeadStatus.ASSIGNED.value:
                 self._send_message(musician_phone, "הליד הזה כבר לא רלוונטי. 🚫", musician_id=m_id)
                 return

             # Track no-answer count
             if musician_phone not in self.pending_musician_actions or "no_answer_count" not in self.pending_musician_actions.get(musician_phone, {}):
                 self.pending_musician_actions[musician_phone] = {"no_answer_count": 0, "lead_id": lead_id}
             self.pending_musician_actions[musician_phone]["no_answer_count"] += 1
             count = self.pending_musician_actions[musician_phone]["no_answer_count"]

             if count == 1:
                 # First no-answer: 2-hour extension
                 airtable_service.update_lead(lead_id, LeadUpdate(last_summary="No answer - 2hr extension granted"))
                 self._send_message(musician_phone, "הבנתי, ניתנה לך הארכה של שעתיים. ⏰\nננסה לתזכר אותך שוב.", musician_id=m_id)
                 run_date = datetime.now() + timedelta(hours=2)
                 scheduler.add_job(self.remind_musician_contact, 'date', run_date=run_date, args=[lead_id, musician_phone, m_id])

             elif count == 2:
                 # Second no-answer: 22-hour extension + admin notification
                 airtable_service.update_lead(lead_id, LeadUpdate(last_summary="No answer - 22hr final extension"))
                 self._send_message(musician_phone, "הארכה אחרונה — 22 שעות. ⏰\nאם לא תצליח לדבר עם הלקוח, הליד יועבר הלאה.", musician_id=m_id)
                 run_date = datetime.now() + timedelta(hours=22)
                 scheduler.add_job(self.remind_musician_contact, 'date', run_date=run_date, args=[lead_id, musician_phone, m_id])

             else:
                 # Third+ no-answer: notify admin and revoke
                 lead_fields = lead["fields"]
                 musician_name = musician_record["fields"].get("Name", musician_phone)
                 lead_name = lead_fields.get("Name", lead_fields.get("Phone", "לא ידוע"))
                 await self.notify_admins(lead_fields, custom_msg=f"⚠️ הנגן {musician_name} לא הצליח ליצור קשר עם {lead_name} אחרי מספר נסיונות. הליד הועבר בחזרה להפצה.")
                 self._send_message(musician_phone, "לא הצלחת ליצור קשר אחרי מספר נסיונות. הליד הועבר בחזרה לכל הנגנים. 😔", musician_id=m_id)
                 airtable_service.update_lead(lead_id, LeadUpdate(status=LeadStatus.DISTRIBUTED, musician_assigned=[], last_summary="No answer - revoked after extensions"))
                 del self.pending_musician_actions[musician_phone]
                 import asyncio
                 asyncio.create_task(self.start_bouzouki_protocol(lead_id, lead_fields))
             
        elif button_id.startswith("revoke_"):
             lead_id = button_id.split("_")[1]
             lead = airtable_service.leads_table.get(lead_id)
             if lead and lead["fields"].get("Status") == LeadStatus.ASSIGNED.value:
                  self._send_message(musician_phone, "אין בעיה, הליד הועבר בחזרה לכל הנגנים. 😔", musician_id=m_id)
                  airtable_service.update_lead(lead_id, LeadUpdate(status=LeadStatus.DISTRIBUTED, musician_assigned=[]))
                  # The event loop needs to spawn start_bouzouki_protocol. This interacts directly:
                  import asyncio
                  asyncio.create_task(self.start_bouzouki_protocol(lead_id, lead["fields"]))

        elif button_id.startswith("closed_"):
             lead_id = button_id.split("_")[1]
             try:
                 airtable_service.update_lead(lead_id, LeadUpdate(status=LeadStatus.CLOSED))
             except Exception as e:
                 print(f"Warning: Failed to update lead {lead_id}: {e}")
             self.pending_musician_actions[musician_phone] = {"action": "AWAITING_AMOUNT", "lead_id": lead_id}
             self._send_message(musician_phone, "מעולה! מוזמן להזין עכשיו את סכום הסגירה (לדוגמה: 2500) לצורך מעקב עמלות (העמלה היא 15% או 400 שקל).", musician_id=m_id)

        elif button_id.startswith("lost_"):
             lead_id = button_id.split("_")[1]
             try:
                 airtable_service.update_lead(lead_id, LeadUpdate(status=LeadStatus.LOST))
             except Exception as e:
                 print(f"Warning: Failed to update lead {lead_id}: {e}")
             self.pending_musician_actions[musician_phone] = {"action": "AWAITING_REASON", "lead_id": lead_id}
             self._send_message(musician_phone, "חבל. מה סיבת ההפסד כדאי שנוכל ללמוד מזה? (למשל: יקר מדי / סגר עם הרכב אחר / ביטל אירוע)", musician_id=m_id)

    async def start_bouzouki_protocol(self, lead_id: str, lead_fields: dict):
        active_musicians = airtable_service.get_active_musicians()
        tier_a = [m for m in active_musicians if m["fields"].get("Score", 5) >= 8]
        
        msg_body = f"הזדמנות חדשה!\nבוזוקי ב{lead_fields.get('Location')}\nתאריך: {lead_fields.get('Event_Date')}"
        claim_btn_id = f"claim_{lead_id}"
        
        for mus in tier_a:
            phone = mus["fields"].get("Phone")
            m_id = mus["id"]
            if phone:
                self._send_interactive(
                    phone, 
                    msg_body, 
                    None, 
                    None, 
                    musician_id=m_id,
                    buttons=[
                        (claim_btn_id, "✅ אני פנוי"),
                        (f"unavailable_{lead_id}", "❌ לא פנוי")
                    ]
                )

        # Schedule step 2 (Tier B) after 10 minutes
        run_date = datetime.now() + timedelta(minutes=10)
        scheduler.add_job(self.continue_bouzouki_protocol_tier_b, 'date', run_date=run_date, args=[lead_id, msg_body, claim_btn_id])

    async def continue_bouzouki_protocol_tier_b(self, lead_id: str, msg_body: str, claim_btn_id: str):
        print(f"Running continue_bouzouki_protocol_tier_b for {lead_id}")
        lead = airtable_service.leads_table.get(lead_id)
        if lead["fields"].get("Musician_Assigned"): return

        active_musicians = airtable_service.get_active_musicians()
        tier_b = [m for m in active_musicians if 5 <= m["fields"].get("Score", 5) <= 7]
        
        for mus in tier_b:
             phone = mus["fields"].get("Phone")
             m_id = mus["id"]
             if phone: 
                  self._send_interactive(
                    phone, 
                    msg_body, 
                    None, 
                    None, 
                    musician_id=m_id,
                    buttons=[
                        (claim_btn_id, "✅ אני פנוי"),
                        (f"unavailable_{lead_id}", "❌ לא פנוי")
                    ]
                )

        # Schedule step 3 (Tier C) after 10 more minutes
        run_date_c = datetime.now() + timedelta(minutes=10)
        scheduler.add_job(self.continue_bouzouki_protocol_tier_c, 'date', run_date=run_date_c, args=[lead_id, msg_body, claim_btn_id])
        
    async def continue_bouzouki_protocol_tier_c(self, lead_id: str, msg_body: str, claim_btn_id: str):
        print(f"Running continue_bouzouki_protocol_tier_c for {lead_id}")
        lead = airtable_service.leads_table.get(lead_id)
        if lead["fields"].get("Musician_Assigned"): return

        active_musicians = airtable_service.get_active_musicians()
        tier_c = [m for m in active_musicians if m["fields"].get("Score", 5) < 5]
        
        for mus in tier_c:
             phone = mus["fields"].get("Phone")
             m_id = mus["id"]
             if phone: 
                  self._send_interactive(
                    phone, 
                    msg_body, 
                    None, 
                    None, 
                    musician_id=m_id,
                    buttons=[
                        (claim_btn_id, "✅ אני פנוי"),
                        (f"unavailable_{lead_id}", "❌ לא פנוי")
                    ]
                )

        # Schedule final check after 10 mins (30 mins total)
        run_date_final = datetime.now() + timedelta(minutes=10)
        scheduler.add_job(self.check_if_claimed, 'date', run_date=run_date_final, args=[lead_id])

    async def schedule_musician_followups(self, lead_id: str, musician_phone: str, musician_id: str = None):
        # 1. Remind in 15 mins (First Warning)
        run_date_1 = datetime.now() + timedelta(minutes=15)
        scheduler.add_job(self.remind_musician_contact, 'date', run_date=run_date_1, args=[lead_id, musician_phone, musician_id])

        # 2. Ask closing status in 24 hours
        run_date_2 = datetime.now() + timedelta(hours=24)
        scheduler.add_job(self.finalize_musician_check, 'date', run_date=run_date_2, args=[lead_id, musician_phone, musician_id])

    async def remind_musician_contact(self, lead_id: str, musician_phone: str, musician_id: str = None):
        lead = airtable_service.leads_table.get(lead_id)
        if not lead: return
        fields = lead["fields"]

        # Only remind if lead is still "Assigned" and not yet contacted or closed
        if fields.get("Status") == LeadStatus.ASSIGNED.value and "Musician confirmed contact" not in fields.get("Last_Summary", ""):
             self._send_interactive(
                 musician_phone,
                 "עברו 15 דקות. התקשרת פליז? 🙏",
                 btn_id=None, btn_title=None, musician_id=musician_id,
                 buttons=[
                     (f"contacted_{lead_id}", "✅ התקשרתי!"),
                     (f"noanswer_{lead_id}", "📵 לא עונה"),
                     (f"revoke_{lead_id}", "❌ ויתרתי")
                 ]
             )
             
             # Schedule final revocation check 15 mins from now
             run_date_final = datetime.now() + timedelta(minutes=15)
             scheduler.add_job(self.revoke_musician_contact, 'date', run_date=run_date_final, args=[lead_id, musician_phone])

    async def revoke_musician_contact(self, lead_id: str, musician_phone: str):
        lead = airtable_service.leads_table.get(lead_id)
        if not lead: return
        fields = lead["fields"]

        if fields.get("Status") == LeadStatus.ASSIGNED.value and "Musician confirmed contact" not in fields.get("Last_Summary", ""):
             self._send_message(musician_phone, "עברה חצי שעה ולא אישרת שחייגת ללקוח. הליד הועבר בחזרה לכל הנגנים. 😔")
             airtable_service.update_lead(lead_id, LeadUpdate(status=LeadStatus.DISTRIBUTED, musician_assigned=[]))
             import asyncio
             asyncio.create_task(self.start_bouzouki_protocol(lead_id, fields))

    async def finalize_musician_check(self, lead_id: str, musician_phone: str, musician_id: str = None):
        lead = airtable_service.leads_table.get(lead_id)
        if not lead: return
        
        # Only check if lead is still "Assigned" (not yet closed or lost)
        if lead["fields"].get("Status") == LeadStatus.ASSIGNED.value:
            buttons = [
                (f"closed_{lead_id}", "✅ סגרנו!"),
                (f"lost_{lead_id}", "❌ לא רלוונטי")
            ]
            self._send_interactive(musician_phone, "עברו 24 שעות... נסגר? 💰", None, None, musician_id=musician_id, buttons=buttons)

    def get_active_lead_robust(self, phone: str) -> Optional[dict]:
        """Find an active lead using robust phone matching."""
        # For efficiency, we only fetch leads that aren't closed/lost
        active_leads = airtable_service.get_all_leads() # Already sorted by last interaction
        return next((l for l in active_leads 
                    if l["fields"].get("Status") not in [LeadStatus.CLOSED.value, LeadStatus.LOST.value]
                    and self._phones_match(l["fields"].get("Phone"), phone)), None)

    async def handle_reset_command(self, phone: str, lead_id: str):
        """Reset lead state and show menu."""
        airtable_service.update_lead(lead_id, LeadUpdate(
            conversation_state=ConversationState.AWAITING_SERVICE,
            status=LeadStatus.NEW
        ))
        await self.send_welcome_menu(phone)

    async def notify_admins(self, lead_fields: dict, custom_msg: str = None):
        """Send notification to admins about a new non-bouzouki lead."""
        print(f"DEBUG: notify_admins called for {lead_fields.get('Phone')}")
        admin_numbers = settings.NOTIFICATION_NUMBERS
        
        def _get_display_val(key):
            val = lead_fields.get(key)
            if not val or val == "TBD":
                return "טרם נקבע"
            return val

        msg = custom_msg if custom_msg else (
            f"🔔 *ליד חדש הגיע (לא בוזוקי)*\n\n"
            f"👤 שם: {lead_fields.get('Name', 'לא צוין')}\n"
            f"📞 טלפון: {lead_fields.get('Phone')}\n"
            f"🎸 שירות: {lead_fields.get('Service')}\n"
            f"📅 תאריך: {_get_display_val('Event_Date')}\n"
            f"📍 מיקום: {_get_display_val('Location')}\n"
            f"👥 אורחים: {_get_display_val('Guests')}"
        )

        if admin_numbers:
            for num in admin_numbers.split(","):
                num = num.strip()
                if num:
                    whatsapp_service.send_message(num, msg)

        # Email Notification
        email_subject = "🔔 עדכון HaydeBot" if custom_msg else f"🔔 ליד חדש הגיע: {lead_fields.get('Name', 'לא צוין')} ({lead_fields.get('Service')})"
        email_body = f"<h2>עדכון ממערכת HaydeBot</h2><p>{msg.replace('\\n', '<br>')}</p>" if custom_msg else f"""
        <h2>ליד חדש במערכת HaydeBot</h2>
        <p><strong>שם:</strong> {lead_fields.get('Name', 'לא צוין')}</p>
        <p><strong>טלפון:</strong> {lead_fields.get('Phone')}</p>
        <p><strong>שירות:</strong> {lead_fields.get('Service')}</p>
        <p><strong>תאריך:</strong> {_get_display_val('Event_Date')}</p>
        <p><strong>מיקום:</strong> {_get_display_val('Location')}</p>
        <p><strong>אורחים:</strong> {_get_display_val('Guests')}</p>
        <hr>
        <p>זהו מייל אוטומטי ממערכת היידה.</p>
        """
        await email_service.send_notification(email_subject, email_body)

    async def send_weekly_summary(self):
        """Send a weekly summary of leads to admins and personalized reports to musicians."""
        print("DEBUG: Generating weekly summaries...")
        leads = airtable_service.get_all_leads()
        active_musicians = airtable_service.get_active_musicians()
        now = datetime.now()
        last_week = now - timedelta(days=7)

        # 1. Admin Summary Stats
        new_leads = 0
        total_closed_leads = 0
        total_lost_leads = 0
        
        # 2. Musician Personal Stats
        musician_stats = {m["id"]: {"phone": m["fields"].get("Phone"), "received": 0, "closed": 0, "closing_amount_sum": 0, "commission_sum": 0.0} for m in active_musicians}

        for l in leads:
             fields = l["fields"]
             # We rely on Last_Interaction as a reliable proxy for recent activity
             last_interaction_str = fields.get("Last_Interaction")
             if last_interaction_str:
                 try:
                     ts = last_interaction_str.replace('Z', '+00:00')
                     last_time = datetime.fromisoformat(ts)
                 except: 
                     continue
                 
                 if last_time.tzinfo:
                     if datetime.now(last_time.tzinfo) - last_time < timedelta(days=7):
                          new_leads += 1
                          status = fields.get("Status")
                          if status == LeadStatus.CLOSED.value: total_closed_leads += 1
                          elif status == LeadStatus.LOST.value: total_lost_leads += 1
                          
                          # Attribute to Musician
                          assigned_list = fields.get("Musician_Assigned", [])
                          if assigned_list and isinstance(assigned_list, list):
                              m_id = assigned_list[0]
                              if m_id in musician_stats:
                                  musician_stats[m_id]["received"] += 1
                                  if status == LeadStatus.CLOSED.value:
                                      musician_stats[m_id]["closed"] += 1
                                      amount = fields.get("Closing_Amount")
                                      if amount:
                                          musician_stats[m_id]["closing_amount_sum"] += float(amount)
                                          # Commission: 15% or 400 NIS (includes VAT)
                                          commission = max(float(amount) * 0.15, 400.0)
                                          musician_stats[m_id]["commission_sum"] += commission
        
        # Send Admin Summary
        admin_msg = (
            f"📊 *סיכום שבועי כללי ל-Hayde*\n\n"
            f"✨ לידים שטופלו השבוע: {new_leads}\n"
            f"✅ אירועים שנסגרו: {total_closed_leads}\n"
            f"❌ אירועים שאבדו: {total_lost_leads}\n\n"
            f"שיהיה שבוע אש! 🎸"
        )
        await self.notify_admins({}, custom_msg=admin_msg)
        
        # Send Musician Individual Reports
        for m_id, stats in musician_stats.items():
            if stats["phone"] and stats["received"] > 0: # Only send if they were active
                musician_msg = (
                    f"בוקר טוב מ-Hayde🎸!\nהנה סיכום הפעילות שלך לשבוע האחרון:\n\n"
                    f"📥 קיבלת מיונים ל: {stats['received']} אירועים\n"
                    f"🏆 סגרת בהצלחה: {stats['closed']} אירועים\n"
                    f"💰 סך עסקאות שנסגרו: ₪{stats['closing_amount_sum']:,.0f}\n"
                    f"💸 עמלת Hayde (משוערת): ₪{stats['commission_sum']:,.0f}\n\n"
                    f"שבוע מטורף ומלא במוזיקה פצצה! 🔥"
                )
                self._send_message(stats["phone"], musician_msg, musician_id=m_id)

    async def check_if_claimed(self, lead_id: str):
        lead = airtable_service.leads_table.get(lead_id)
        if not lead: return
        if not lead["fields"].get("Musician_Assigned"):
             # NO ONE CLAIMED - ALERT ADMIN
             print(f"ALERT: No musician claimed lead {lead_id} after 30 mins.")
             admin_msg = f"⚠️ *אף נגן לא תפס את האירוע!*\n\nפרטי האירוע:\nשם: {lead['fields'].get('Name')}\nטלפון: {lead['fields'].get('Phone')}\nשירות: בוזוקי\n\nכדאי ליצור קשר ידני עם נגנים."
             await self.notify_admins(lead["fields"], custom_msg=admin_msg)

    # Helpers
    def _normalize_phone(self, phone: str) -> str:
        if not phone: return ""
        # Remove any non-digits
        digits = "".join(filter(str.isdigit, phone))
        # If it starts with 00, remove it
        if digits.startswith("00"): digits = digits[2:]
        # If it's an Israeli number starting with 0, remove it (e.g. 054 -> 54)
        if digits.startswith("0") and not digits.startswith("00"):
            digits = digits[1:]
        # If it starts with 972, remove it for standard comparison
        if digits.startswith("972"):
            digits = digits[3:]
        return digits

    def _phones_match(self, p1: str, p2: str) -> bool:
        n1 = self._normalize_phone(p1)
        n2 = self._normalize_phone(p2)
        if not n1 or not n2: return False
        # Compare the last 9 digits (common for Israeli mobile)
        return n1[-9:] == n2[-9:]

    def _send_message(self, phone: str, text: str, lead_id: str = None, musician_id: str = None):
        whatsapp_service.send_message(phone, text)
        if lead_id or musician_id:
            airtable_service.create_message(MessageCreate(
                lead=[lead_id] if lead_id else None,
                musician=[musician_id] if musician_id else None,
                direction="Outbound",
                content=text,
                timestamp=datetime.now()
            ))

    def _send_interactive(self, phone: str, text: str, btn_id: str, btn_title: str, lead_id: str = None, musician_id: str = None, buttons: list = None):
        if buttons:
            whatsapp_service.send_interactive_buttons(phone, text, buttons)
            content = f"{text} (Buttons: {[b[1] for b in buttons]})"
        else:
            whatsapp_service.send_interactive_button(phone, text, btn_id, btn_title)
            content = f"{text} (Button: {btn_title})"

        if lead_id or musician_id:
            airtable_service.create_message(MessageCreate(
                lead=[lead_id] if lead_id else None,
                musician=[musician_id] if musician_id else None,
                direction="Outbound",
                content=content,
                timestamp=datetime.now()
            ))

bot_logic = HaydeBotLogic()
