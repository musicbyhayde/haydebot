"""Fix #2: coroutine jobs must actually run; weekly summary is opt-in; bouzouki unchanged."""
import asyncio
import inspect
from unittest.mock import patch, AsyncMock

from apscheduler.schedulers.asyncio import AsyncIOScheduler


def test_asyncio_executor_really_awaits_coroutines():
    from app.core import scheduler as sched_mod
    ran = []

    async def job():
        ran.append(1)

    async def main():
        import copy
        s = AsyncIOScheduler(executors=copy.deepcopy(sched_mod.executors), timezone="Asia/Jerusalem")
        s.start()
        s.add_job(job, 'date', executor='asyncio')
        await asyncio.sleep(0.3)
        s.shutdown(wait=False)

    asyncio.run(main())
    assert ran == [1]


def test_default_executor_is_unchanged_threadpool():
    from apscheduler.executors.pool import ThreadPoolExecutor
    from apscheduler.executors.asyncio import AsyncIOExecutor
    from app.core import scheduler as sched_mod
    assert sched_mod.executors['default']['type'] == 'threadpool'
    s = sched_mod.scheduler
    assert isinstance(s._executors['default'], ThreadPoolExecutor)
    assert isinstance(s._executors['asyncio'], AsyncIOExecutor)


def test_bouzouki_jobs_do_not_opt_into_asyncio_executor():
    from app.services import logic
    src = inspect.getsource(logic)
    assert "executor='asyncio'" not in src and 'executor="asyncio"' not in src


def _run_lifespan(enabled):
    from app import main
    from app.core.config import get_settings
    s = get_settings()
    added = []
    with patch.object(s, "WEEKLY_SUMMARY_ENABLED", enabled), \
         patch.object(main.scheduler, "start"), patch.object(main.scheduler, "shutdown"), \
         patch.object(main.scheduler, "add_job", side_effect=lambda *a, **k: added.append((a, k))), \
         patch("app.services.google_calendar_service.google_calendar.watch_calendar", return_value=None):
        async def go():
            async with main.lifespan(main.app):
                pass
        asyncio.run(go())
    return added


def test_weekly_summary_off_by_default():
    assert _run_lifespan(False) == []


def test_weekly_summary_on_uses_asyncio_and_fixed_id():
    added = _run_lifespan(True)
    assert len(added) == 1
    k = added[0][1]
    assert k["executor"] == "asyncio" and k["id"] == "weekly_summary" and k["replace_existing"]
