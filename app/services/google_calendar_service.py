import os
import json
import base64
from datetime import datetime, timedelta
from google.oauth2 import service_account
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from typing import List, Optional

class GoogleCalendarService:
    def __init__(self):
        self.scopes = ['https://www.googleapis.com/auth/calendar']
        self.creds_val = os.getenv('GOOGLE_CALENDAR_CREDENTIALS')
        self.calendar_id = os.getenv('GOOGLE_CALENDAR_ID', 'primary')
        self.service = self._authenticate()

    def _authenticate(self):
        # 1. Try OAuth 2.0 (Direct User Auth - Supports Invitations)
        client_id = os.getenv('G_CLIENT_ID')
        client_secret = os.getenv('G_CLIENT_SECRET')
        refresh_token = os.getenv('G_REFRESH_TOKEN')

        if client_id and client_secret and refresh_token:
            try:
                creds = Credentials(
                    token=None,
                    refresh_token=refresh_token,
                    token_uri="https://oauth2.googleapis.com/token",
                    client_id=client_id,
                    client_secret=client_secret,
                    scopes=self.scopes
                )
                # Refresh the token immediately to verify
                creds.refresh(Request())
                print("GOOGLE_CALENDAR: Authenticated with OAuth 2.0 (Invitations supported)")
                return build('calendar', 'v3', credentials=creds)
            except Exception as e:
                print(f"GOOGLE_CALENDAR: Failed to authenticate with OAuth 2.0 Refresh Token: {e}")
                
        print("GOOGLE_CALENDAR: CRITICAL: No valid Google Calendar OAuth credentials found. Calendar synchronization and invitations will not work.")
        return None

    def create_event(self, lead_name: str, location: str, event_date_str: str, musician_emails: List[str], custom_description: Optional[str] = None, is_closed: bool = False) -> Optional[str]:
        if not self.service:
            return None

        # Parse date (Assuming DD.MM.YY or YYYY-MM-DD)
        start_date = self._parse_date(event_date_str)
        if not start_date:
            print(f"ERROR: Could not parse date {event_date_str}")
            return None

        summary = f'{lead_name} + {location}' if is_closed else f'(אופציה) - {lead_name} + {location}'
        event_body = {
            'summary': summary,
            'location': location,
            'description': custom_description or f'אירוע שנוצר מהיידהבוט עבור {lead_name}.',
            'start': {
                'date': start_date.strftime('%Y-%m-%d'),
                'timeZone': 'Asia/Jerusalem',
            },
            'end': {
                'date': (start_date + timedelta(days=1)).strftime('%Y-%m-%d'),
                'timeZone': 'Asia/Jerusalem',
            },
            'attendees': [{'email': email} for email in musician_emails if email],
            'reminders': {
                'useDefault': True,
            },
        }

        try:
            event = self.service.events().insert(calendarId=self.calendar_id, body=event_body, sendUpdates='all').execute()
            return event.get('id')
        except HttpError as error:
            print(f"An error occurred: {error}")
            return None

    def update_event_closed(self, event_id: str) -> bool:
        if not self.service or not event_id:
            return False

        try:
            event = self.service.events().get(calendarId=self.calendar_id, eventId=event_id).execute()
            summary = event.get('summary', '')
            if '(אופציה)' in summary:
                new_summary = summary.replace('(אופציה) - ', '').replace('(אופציה)', '').strip()
                event['summary'] = new_summary
                self.service.events().update(calendarId=self.calendar_id, eventId=event_id, body=event).execute()
                return True
            return False
        except HttpError as error:
            print(f"An error occurred in update_event_closed: {error}")
            return False

    def get_event(self, event_id: str) -> Optional[dict]:
        """Fetch an event's current details from Google Calendar."""
        if not self.service or not event_id:
            return None
        try:
            event = self.service.events().get(calendarId=self.calendar_id, eventId=event_id).execute()
            return {
                'summary': event.get('summary', ''),
                'location': event.get('location', ''),
                'description': event.get('description', ''),
                'date': event.get('start', {}).get('date', ''),
                'attendees': [a.get('email', '') for a in event.get('attendees', []) if a.get('email')],
            }
        except HttpError as error:
            print(f"An error occurred in get_event: {error}")
            return None

    def update_event(self, event_id: str, lead_name: str, location: str, event_date_str: str, musician_emails: List[str], description: Optional[str] = None) -> bool:
        if not self.service or not event_id:
            return False
        
        start_date = self._parse_date(event_date_str)
        if not start_date:
            return False

        try:
            event = self.service.events().get(calendarId=self.calendar_id, eventId=event_id).execute()
            
            # Simple check if prefix should be there
            prefix = "(אופציה) - " if "(אופציה)" in event.get('summary', '') else ""
            
            event['summary'] = f"{prefix}{lead_name} + {location}"
            event['location'] = location
            if description:
                event['description'] = description
            
            event['start'] = {
                'date': start_date.strftime('%Y-%m-%d'),
                'timeZone': 'Asia/Jerusalem',
            }
            event['end'] = {
                'date': (start_date + timedelta(days=1)).strftime('%Y-%m-%d'),
                'timeZone': 'Asia/Jerusalem',
            }
            existing_attendees = event.get('attendees', [])
            existing_attendees_map = {a.get('email', '').lower(): a for a in existing_attendees if a.get('email')}
            
            new_attendees = []
            for email in musician_emails:
                if not email:
                    continue
                email_lower = email.lower()
                if email_lower in existing_attendees_map:
                    new_attendees.append(existing_attendees_map[email_lower])
                else:
                    new_attendees.append({'email': email})
                    
            event['attendees'] = new_attendees

            self.service.events().update(calendarId=self.calendar_id, eventId=event_id, body=event, sendUpdates='all').execute()
            return True
        except HttpError as error:
            print(f"An error occurred in update_event: {error}")
            return False

    def delete_event(self, event_id: str) -> bool:
        if not self.service or not event_id:
            return False
        try:
            self.service.events().delete(calendarId=self.calendar_id, eventId=event_id).execute()
            return True
        except HttpError as error:
            # If already deleted (410) or not found (404), count as success
            if error.resp.status in [404, 410]:
                print(f"Event {event_id} already deleted or not found.")
                return True
            print(f"An error occurred in delete_event: {error}")
            return False

    def get_event_attendees_status(self, event_id: str) -> dict:
        """Fetch RSVPs of attendees for the event. Returns {email: status}"""
        if not self.service or not event_id:
            return {}
        try:
            event = self.service.events().get(calendarId=self.calendar_id, eventId=event_id).execute()
            attendees = event.get('attendees', [])
            return {a.get('email', '').lower(): a.get('responseStatus', 'needsAction') for a in attendees}
        except HttpError as error:
            if error.resp.status in [404, 410]:
                return {} # Event does not exist
            print(f"An error occurred in get_event_attendees_status: {error}")
            return {}

    def watch_calendar(self, webhook_url: str) -> Optional[dict]:
        """
        Register a push notification channel so Google notifies us 
        whenever any event on this calendar changes (including RSVP updates).
        The watch expires after ~7 days and needs to be renewed.
        """
        if not self.service:
            return None
        import uuid
        channel_id = str(uuid.uuid4())
        try:
            body = {
                'id': channel_id,
                'type': 'web_hook',
                'address': webhook_url,
            }
            result = self.service.events().watch(
                calendarId=self.calendar_id,
                body=body
            ).execute()
            print(f"GOOGLE_CALENDAR: Watch registered! channel_id={channel_id}, expiration={result.get('expiration')}")
            return result
        except HttpError as error:
            print(f"GOOGLE_CALENDAR: Failed to register watch: {error}")
            return None

    def stop_watch(self, channel_id: str, resource_id: str) -> bool:
        """Stop a previously registered push notification channel."""
        if not self.service:
            return False
        try:
            self.service.channels().stop(body={
                'id': channel_id,
                'resourceId': resource_id
            }).execute()
            return True
        except HttpError as error:
            print(f"GOOGLE_CALENDAR: Failed to stop watch: {error}")
            return False

    def _parse_date(self, date_str: str) -> Optional[datetime]:
        # Handle 25.12.24 or 2024-12-25
        formats = ['%d.%m.%y', '%d.%m.%Y', '%Y-%m-%d']
        for fmt in formats:
            try:
                return datetime.strptime(date_str, fmt)
            except ValueError:
                continue
        return None

# Singleton instance
google_calendar = GoogleCalendarService()

