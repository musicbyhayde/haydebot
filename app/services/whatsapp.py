import requests
from app.core.config import get_settings
import json

settings = get_settings()

class WhatsAppService:
    def __init__(self):
        self.token = settings.WHATSAPP_TOKEN
        self.phone_number_id = settings.WHATSAPP_PHONE_NUMBER_ID
        self.api_url = f"https://graph.facebook.com/v20.0/{self.phone_number_id}/messages"
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
    
    def send_template(self, to_phone: str, template_name: str, language_code: str = "he", parameters: list = None):
        """Send a template message with optional parameters."""
        payload = {
            "messaging_product": "whatsapp",
            "to": to_phone,
            "type": "template",
            "template": {
                "name": template_name,
                "language": {"code": language_code}
            }
        }
        
        if parameters:
            # WhatsApp expects the parameters inside a component of type 'body'
            formatted_params = []
            for param in parameters:
                formatted_params.append({
                    "type": "text",
                    "text": str(param)
                })
                
            payload["template"]["components"] = [
                {
                    "type": "body",
                    "parameters": formatted_params
                }
            ]
            
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

    def download_media(self, media_id: str) -> tuple[bytes, str]:
        """Download media from WhatsApp using its media ID. Returns bytes and mime_type."""
        try:
            # Step 1: Query API for the media URL
            media_url_req = f"https://graph.facebook.com/v20.0/{media_id}"
            res = requests.get(media_url_req, headers=self.headers)
            res.raise_for_status()
            media_info = res.json()
            
            download_url = media_info.get("url")
            mime_type = media_info.get("mime_type", "application/octet-stream")
            
            if not download_url:
                raise Exception("Could not get download URL from Meta")

            # Step 2: Download the actual binary using the same Bearer token
            file_res = requests.get(download_url, headers=self.headers)
            file_res.raise_for_status()
            
            return file_res.content, mime_type
        except Exception as e:
            print(f"Error downloading WhatsApp media: {e}")
            return None, None

whatsapp_service = WhatsAppService()
