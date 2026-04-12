from fastapi import FastAPI
from app.core.config import get_settings
from app.api.routes import public_router, protected_router

settings = get_settings()

from contextlib import asynccontextmanager
from app.core.scheduler import scheduler

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    scheduler.start()
    
    # Schedule Weekly Summary (Sunday at 10:00 AM)
    from app.services.logic import bot_logic
    scheduler.add_job(bot_logic.send_weekly_summary, 'cron', day_of_week='sun', hour=10, minute=0)
    
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
)

app.include_router(public_router, prefix="/api/v1")
app.include_router(protected_router, prefix="/api/v1")

@app.get("/")
async def root():
    return {"message": "HaydeBot is running", "status": "ok"}
