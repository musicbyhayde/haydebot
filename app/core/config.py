from pydantic_settings import BaseSettings
from functools import lru_cache
from typing import Optional

class Settings(BaseSettings):
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "HaydeBot"
    # Optional server-to-server key (X-API-Key). Unset -> only dashboard users (Supabase JWT).
    # Set a strong random value in DigitalOcean for scripts/bots; never put it in the browser.
    # Removed transition settings (REQUIRE_USER_AUTH, LEGACY_DEFAULT_API_KEY_ENABLED) are
    # simply ignored if still present in the environment (extra="ignore").
    API_KEY: Optional[str] = None
    # Supabase JWT verification: if set (Supabase > Project Settings > JWT secret, legacy
    # HS256) tokens are verified locally; otherwise via Supabase Auth /auth/v1/user.
    SUPABASE_JWT_SECRET: Optional[str] = None
    # Dashboard users/roles live in the Supabase table public.dashboard_users
    # (app/core/dashboard_users.py). Old DASHBOARD_ALLOWED_EMAILS / DASHBOARD_ADMIN_EMAILS
    # env vars, if still set, are ignored.
    
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

    # Webhook authenticity (fix #4). Log-only until the *_ENFORCE flags are set.
    META_APP_SECRET: Optional[str] = None   # Meta App Dashboard > App settings > Basic > App secret
    WEBHOOK_SIGNATURE_ENFORCE: bool = False
    CALENDAR_WEBHOOK_TOKEN: Optional[str] = None  # optional; derived from WHATSAPP_VERIFY_TOKEN if unset
    CALENDAR_WEBHOOK_ENFORCE: bool = False
    CALENDAR_SYNC_MIN_INTERVAL: float = 60.0

    # Scheduled jobs (opt-in; see app/core/scheduler.py)
    WEEKLY_SUMMARY_ENABLED: bool = False

    # Outbound network timeouts (seconds). Optional; safe defaults.
    HTTP_CONNECT_TIMEOUT: float = 5.0
    HTTP_READ_TIMEOUT: float = 20.0
    MEDIA_DOWNLOAD_TIMEOUT: float = 60.0
    SUPABASE_TIMEOUT: float = 30.0
    # Page size for paginated selects; must be <= Supabase API "Max rows" (default 1000).
    SUPABASE_PAGE_SIZE: int = 1000

    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "ignore"

@lru_cache()
def get_settings():
    return Settings()
