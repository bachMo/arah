from __future__ import annotations

import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from app.agent.pipeline import run_daily, run_reminders
from app.core.config import get_settings

log = logging.getLogger("arah.scheduler")


def build_scheduler() -> AsyncIOScheduler:
    settings = get_settings()
    scheduler = AsyncIOScheduler(timezone=settings.timezone)
    scheduler.add_job(
        run_daily,
        CronTrigger.from_crontab(settings.agent_cron, timezone=settings.timezone),
        id="veille",
        name="Veille du matin",
        max_instances=1,
        coalesce=True,
        misfire_grace_time=3600,
    )
    scheduler.add_job(
        run_reminders,
        CronTrigger.from_crontab(settings.reminders_cron, timezone=settings.timezone),
        id="rappels",
        name="Rappels de dates limites",
        max_instances=1,
        coalesce=True,
        misfire_grace_time=3600,
    )
    log.info(
        "Tâches planifiées : veille « %s », rappels « %s » (%s).",
        settings.agent_cron,
        settings.reminders_cron,
        settings.timezone,
    )
    return scheduler
