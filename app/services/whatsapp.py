import requests
from app.core.config import get_settings
import json

settings = get_settings()

class WhatsAppService:
    def __init__(self):
        self.token = settings.WHATSAPP_TOKEN
        self.phone_number_id = settings.WHATSAPP_PHONE_NUMBER_ID
        self.api_url = f"https://graph.facebook.com/v17.0/{self.phone_number_id}/messages"
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }

    def send_message(self, to_phone: str, text: str):
        """Send a standard text message."""
        payload = {
            "messaging_product": "whatsapp",
            "to": to_phone,
            "text": {"body": text}
        }
        return self._send(payload)

    def send_interactive_button(self, to_phone: str, body_text: str, button_id: str, button_title: str):
        """Send a message with a single button."""
        return self.send_interactive_buttons(to_phone, body_text, [(button_id, button_title)])

    def send_interactive_buttons(self, to_phone: str, body_text: str, buttons: list):
        """
        Send a message with up to 3 buttons.
        buttons format: [("id1", "title1"), ("id2", "title2")]
        """
        button_payload = []
        for b_id, b_title in buttons[:3]: # WhatsApp limit is 3 buttons
             button_payload.append({
                 "type": "reply",
                 "reply": {
                     "id": b_id,
                     "title": b_title
                 }
             })

        payload = {
            "messaging_product": "whatsapp",
            "to": to_phone,
            "type": "interactive",
            "interactive": {
                "type": "button",
                "body": {"text": body_text},
                "action": {
                    "buttons": button_payload
                }
            }
        }
        return self._send(payload)

    def send_list_message(self, to_phone: str, body_text: str, button_text: str, title: str, sections: list):
        """
        Send a list message (menu).
        sections format: [{"title": "Section Title", "rows": [{"id": "row_id", "title": "Row Title", "description": "Desc"}]}]
        """
        payload = {
            "messaging_product": "whatsapp",
            "to": to_phone,
            "type": "interactive",
            "interactive": {
                "type": "list",
                "header": {
                    "type": "text",
                    "text": title
                },
                "body": {
                    "text": body_text
                },
                "footer": {
                    "text": "HaydeBot 🎸"
                },
                "action": {
                    "button": button_text,
                    "sections": sections
                }
            }
        }
        return self._send(payload)
    
    def send_template(self, to_phone: str, template_name: str, language_code: str = "he"):
        """Send a template message (needed for initiating 24h window if it passed, though usually we reply)."""
        payload = {
            "messaging_product": "whatsapp",
            "to": to_phone,
            "type": "template",
            "template": {
                "name": template_name,
                "language": {"code": language_code}
            }
        }
        return self._send(payload)

    def _send(self, payload: dict):
        try:
            response = requests.post(self.api_url, headers=self.headers, json=payload)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.HTTPError as e:
            print(f"WhatsApp API Error: {e.response.text}")
            return {"error": str(e)}
        except Exception as e:
            print(f"WhatsApp Error: {e}")
            return {"error": str(e)}

whatsapp_service = WhatsAppService()
