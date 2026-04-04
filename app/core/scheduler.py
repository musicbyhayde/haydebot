from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore
import os

# Persistent SQLite job store — scheduled jobs survive server restarts/deploys.
# The DB file lives next to the application root.
db_path = os.path.join(os.path.dirname(__file__), '..', '..', 'scheduler_jobs.sqlite')
db_url = f'sqlite:///{os.path.abspath(db_path)}'

jobstores = {
    'default': SQLAlchemyJobStore(url=db_url)
}

executors = {
    'default': {'type': 'threadpool', 'max_workers': 20}
}

job_defaults = {
    'coalesce': True,       # If multiple missed runs, run only once
    'max_instances': 3,
    'misfire_grace_time': 3600  # Allow jobs delayed up to 1 hour to still run
}

scheduler = AsyncIOScheduler(jobstores=jobstores, executors=executors, job_defaults=job_defaults, timezone="Asia/Jerusalem")
