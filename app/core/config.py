from pydantic_settings import BaseSettings
from functools import lru_cache
from typing import Optional

# Hard-coded key that production has used so far (API_KEY was never set in DigitalOcean)
# and that is shipped in the dashboard JS bundle, i.e. public. Accepted only during the
# transition window controlled by LEGACY_DEFAULT_API_KEY_ENABLED / REQUIRE_USER_AUTH.
LEGACY_DEFAULT_API_KEY = "hayde-security-key"


class Settings(BaseSettings):
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "HaydeBot"
    # Server-to-server key. Unset by default -> only JWT / legacy key work. Set a strong
    # random value in DigitalOcean for scripts/bots (never put it in the browser).
    API_KEY: Optional[str] = None
    # Transition flags for the key rotation (defaults = current behaviour).
    LEGACY_DEFAULT_API_KEY_ENABLED: bool = True
    REQUIRE_USER_AUTH: bool = False
    # Supabase JWT verification: if set (Supabase > Project Settings > JWT secret, legacy
    # HS256) tokens are verified locally; otherwise via Supabase Auth /auth/v1/user.
    SUPABASE_JWT_SECRET: Optional[str] = None
    DASHBOARD_ALLOWED_EMAILS: str = "ziv200@gmail.com,kobile@gmail.com,musicbyhayde@gmail.com"
    # Same as role 'admin' in frontend/lib/auth.ts USER_MAP. Needed for /backup/full.
    DASHBOARD_ADMIN_EMAILS: str = "ziv200@gmail.com,musicbyhayde@gmail.com"
    
    # OpenAI / Gemini
    OPENAI_API_KEY: Optional[str] = None
    GOOGLE_API_KEY: Optional[str] = None

    # Supabase
    SUPABASE_URL: Optional[str] = None
    SUPABASE_KEY: Optional[str] = None

    # Airtable (Deprecated, moving to Supabase)
    AIRTABLE_TOKEN: Optional[str] = None
    AIRTABLE_BASE_ID: Optional[str] = None
    AIRTABLE_TABLE_LEADS: str = "Leads"
    AIRTABLE_TABLE_MUSICIANS: str = "Musicians"
    AIRTABLE_TABLE_MESSAGES: str = "Messages"

    # WhatsApp
    WHATSAPP_TOKEN: str
    WHATSAPP_PHONE_NUMBER_ID: str
    WHATSAPP_VERIFY_TOKEN: str
    NOTIFICATION_NUMBERS: Optional[str] = None # Comma-separated list of numbers
    
    # Email
    SMTP_SERVER: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    NOTIFICATION_EMAIL: str = "musicbyhayde@gmail.com"

    # Outbound network timeouts (seconds). Optional; safe defaults.
    HTTP_CONNECT_TIMEOUT: float = 5.0
    HTTP_READ_TIMEOUT: float = 20.0
    MEDIA_DOWNLOAD_TIMEOUT: float = 60.0
    SUPABASE_TIMEOUT: float = 30.0

    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "ignore"

@lru_cache()
def get_settings():
    return Settings()
