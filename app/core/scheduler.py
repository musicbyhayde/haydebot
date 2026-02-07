from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.jobstores.memory import MemoryJobStore

# Using MemoryJobStore for now. 
# For persistence across restarts in production, we should use SQLAlchemyJobStore with SQLite/Postgres.
jobstores = {
    'default': MemoryJobStore()
}

executors = {
    'default': {'type': 'threadpool', 'max_workers': 20}
}

job_defaults = {
    'coalesce': False,
    'max_instances': 3
}

scheduler = AsyncIOScheduler(jobstores=jobstores, executors=executors, job_defaults=job_defaults, timezone="Asia/Jerusalem")
