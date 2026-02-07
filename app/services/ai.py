import google.generativeai as genai
from app.core.config import get_settings
import json

settings = get_settings()

class AIService:
    def __init__(self):
        self.enabled = False
        if settings.GOOGLE_API_KEY:
            try:
                genai.configure(api_key=settings.GOOGLE_API_KEY)
                self.model_id = 'models/gemini-2.5-flash' 
                self.client = genai.GenerativeModel(self.model_id)
                self.enabled = True
            except Exception as e:
                print(f"AI Model Init Error: {e}")
        
        self.cache = {}

    def analyze_input(self, question_type: str, user_text: str):
        if not self.enabled:
            return {"valid": True, "extracted_value": user_text, "reply": None}

        import datetime
        now = datetime.datetime.now()
        current_date_str = now.strftime("%A, %d.%m.%Y")

        # Use a versioned cache key to ensure prompt changes take effect
        prompt_version = "v3" 
        cache_key = f"{self.model_id}:{prompt_version}:{question_type}:{user_text.strip().lower()}"
        if cache_key in self.cache:
            return self.cache[cache_key]

        prompts = {
            "date": f"""המשתמש נשאל 'מתי האירוע?'. היום: {current_date_str}. חלץ את התאריך המדויק. 
            אם המשתמש אמר 'מחר', 'מחר בבוקר', 'שבוע הבא' וכדומה - חשב את התאריך המדויק לפי היום.
            דוגמה: אם היום יום שישי ה-06.02.2026 והמשתמש כתב 'מחר בערב', הערך המחולץ צריך להיות '07.02.2026 (מחר בערב)'.""",
            "location": "המשתמש נשאל 'איפה האירוע?'. חלץ את המקום (עיר/אולם).",
            "guests": "המשתמש נשאל 'כמה אורחים?'. חלץ את המספר או הטווח."
        }

        system_prompt = f"""
        Analyze the user's message in Hebrew.
        Context: {prompts.get(question_type)}
        
        Rules:
        1. If the user is asking about price, what you do, or anything other than the specific answer, set 'valid' to false.
        2. In 'extracted_value', return a string in this format: "VALUE (Original Text)". 
           Example for date: "20.06.2024 (מחר בבוקר)"
           Example for guests: "200 (בערך מאתיים)"
        3. If 'valid' is false, provide a polite Hebrew response in 'reply' that answers their off-topic query if possible, or gently moves them back to the questionnaire.
        4. Return ONLY valid JSON.

        Format:
        {{
            "valid": boolean,
            "extracted_value": "extracted string or null",
            "reply": "string or null"
        }}
        """

        try:
            print(f"DEBUG: Calling Gemini API (legacy SDK) with model: {self.model_id}")
            response = self.client.generate_content(
                f"{system_prompt}\n\nUser Message: {user_text}",
                generation_config={"response_mime_type": "application/json"}
            )
            raw_content = response.text
            print(f"DEBUG: Raw AI Response: {raw_content}")
            result = json.loads(raw_content)
            self.cache[cache_key] = result
            return result
        except Exception as e:
            print(f"AI Runtime Error: {e}")
            return {"valid": True, "extracted_value": user_text, "reply": None}

ai_service = AIService()
