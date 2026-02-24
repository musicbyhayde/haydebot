from fastapi import FastAPI
from app.core.config import get_settings
from app.api.routes import router

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
    allow_origins=["https://haydebot.vercel.app/","http://localhost:3000"], # For dev. In prod, specify domain.
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api/v1")

@app.get("/")
async def root():
    return {"message": "HaydeBot is running", "status": "ok"}
