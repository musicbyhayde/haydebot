from fastapi import FastAPI
from app.core.config import get_settings
from app.api.routes import public_router, protected_router

settings = get_settings()

from contextlib import asynccontextmanager
from app.core.scheduler import scheduler

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    if settings.API_KEY and len(settings.API_KEY) < 32:
        print("SECURITY WARNING: API_KEY is shorter than 32 characters; use a strong random key")
    scheduler.start()
    
    # Weekly Summary (Sunday 10:00 Asia/Jerusalem). It never actually ran before (async job on
    # the threadpool executor). It messages admins AND musicians, so it is opt-in.
    from app.services.logic import bot_logic
    if settings.WEEKLY_SUMMARY_ENABLED:
        scheduler.add_job(bot_logic.send_weekly_summary, 'cron', day_of_week='sun', hour=10, minute=0,
                          id='weekly_summary', replace_existing=True, executor='asyncio')
        print("SCHEDULER: weekly summary enabled (Sun 10:00 Asia/Jerusalem)")
    else:
        print("SCHEDULER: weekly summary disabled (set WEEKLY_SUMMARY_ENABLED=true to enable)")
    
    # Register Google Calendar Watch for real-time RSVP push notifications
    try:
        from app.services.google_calendar_service import google_calendar
        webhook_url = "https://orca-app-g9jyu.ondigitalocean.app/api/v1/webhooks/calendar"
        result = google_calendar.watch_calendar(webhook_url)
        if result:
            print(f"STARTUP: Google Calendar Watch active until {result.get('expiration')}")
        else:
            print("STARTUP: Google Calendar Watch registration failed")
    except Exception as e:
        print(f"STARTUP: Could not register Calendar Watch: {e}")
    
    yield
    # Shutdown
    scheduler.shutdown()

from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://haydebot.vercel.app", "http://localhost:3000"], # For dev. In prod, specify domain.
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)

app.include_router(public_router, prefix="/api/v1")
app.include_router(protected_router, prefix="/api/v1")
from app.api.admin_users import admin_router  # admin "משתמשים" screen (viewer accounts)
app.include_router(admin_router, prefix="/api/v1")

# Bot API (/api/bot/v1): read-only, per-bot keys, audited, off unless BOT_API_ENABLED=true.
from app.api.bot_routes import bot_router
from app.bot import errors as bot_errors
from app.bot.middleware import BotAuditMiddleware
app.include_router(bot_router)
bot_errors.install(app)
app.add_middleware(BotAuditMiddleware)

@app.get("/")
async def root():
    return {"message": "HaydeBot is running", "status": "ok"}
