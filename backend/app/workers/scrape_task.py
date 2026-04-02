"""
app/workers/scrape_task.py
Tâches Celery pour le scraping en arrière-plan.
"""
import asyncio
from typing import Optional

from loguru import logger

from app.workers.celery_app import celery_app


@celery_app.task(
    bind=True,
    name="app.workers.scrape_task.run_scrape",
    max_retries=2,
    default_retry_delay=60,
)
def run_scrape(
    self,
    keywords: str,
    sources: list[str],
    location: Optional[str] = None,
    results_per_source: int = 50,
    hours_old: Optional[int] = None,
    remote_only: bool = False,
    job_types: Optional[list[str]] = None,
    search_profile_id: Optional[int] = None,
) -> dict:
    """Scraping standard sans proxy."""
    from app.db.database import AsyncSessionLocal
    from app.services.scraper_service import ScraperService

    async def _run() -> dict:
        async with AsyncSessionLocal() as db:
            svc = ScraperService(db)
            return await svc.run_search(
                keywords=keywords,
                sources=sources,
                location=location,
                results_per_source=results_per_source,
                hours_old=hours_old,
                remote_only=remote_only,
                job_types=job_types,
                search_profile_id=search_profile_id,
            )

    try:
        result = asyncio.run(_run())
        logger.info(f"[ScrapeTask] Terminé : {result}")
        return result
    except Exception as exc:
        logger.error(f"[ScrapeTask] Erreur : {exc}")
        raise self.retry(exc=exc)


@celery_app.task(
    bind=True,
    name="app.workers.scrape_task.run_scrape_with_proxies",
    max_retries=1,         # moins de retries en mode proxy (les erreurs sont souvent liées au proxy)
    default_retry_delay=30,
)
def run_scrape_with_proxies(
    self,
    keywords: str,
    sources: list[str],
    proxy_lines: list[str],
    location: Optional[str] = None,
    results_per_source: int = 50,
    hours_old: Optional[int] = None,
    remote_only: bool = False,
    job_types: Optional[list[str]] = None,
    search_profile_id: Optional[int] = None,
) -> dict:
    """Scraping avec rotation de proxies résidentiels."""
    from app.db.database import AsyncSessionLocal
    from app.services.scraper_service import ScraperService

    async def _run() -> dict:
        async with AsyncSessionLocal() as db:
            svc = ScraperService(db)
            return await svc.run_search_with_proxies(
                keywords=keywords,
                sources=sources,
                proxy_lines=proxy_lines,
                location=location,
                results_per_source=results_per_source,
                hours_old=hours_old,
                remote_only=remote_only,
                job_types=job_types,
                search_profile_id=search_profile_id,
            )

    try:
        result = asyncio.run(_run())
        logger.info(f"[ScrapeTask-Proxy] Terminé : {result}")
        return result
    except Exception as exc:
        logger.error(f"[ScrapeTask-Proxy] Erreur : {exc}")
        raise self.retry(exc=exc)
