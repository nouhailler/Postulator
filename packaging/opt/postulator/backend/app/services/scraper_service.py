"""
app/services/scraper_service.py
Orchestrateur de scraping : lance N scrapers en parallèle,
déduplique et persiste les offres en BDD.

Deux modes :
- run_search()              : scraping direct (IP machine)
- run_search_with_proxies() : scraping avec rotation de proxies résidentiels
"""
import asyncio
from datetime import datetime
from typing import Optional

from loguru import logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.job import Job
from app.models.scrape_log import ScrapeLog
from app.scrapers import get_scraper
from app.scrapers.base import RawJob


class ScraperService:

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # ── Mode direct ───────────────────────────────────────────────────────────

    async def run_search(
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
        return await self._run(
            keywords=keywords,
            sources=sources,
            location=location,
            results_per_source=results_per_source,
            hours_old=hours_old,
            remote_only=remote_only,
            job_types=job_types,
            search_profile_id=search_profile_id,
            proxy_manager=None,
        )

    # ── Mode proxy résidentiel ────────────────────────────────────────────────

    async def run_search_with_proxies(
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
        """
        Scraping avec rotation de proxies résidentiels.
        proxy_lines : liste de chaînes "IP:PORT:USERNAME:PASSWORD"
        Chaque source reçoit un proxy différent (round-robin).
        """
        from app.scrapers.proxy_manager import ResidentialProxyManager

        mgr = ResidentialProxyManager(proxy_lines)
        if not mgr.has_proxies:
            raise ValueError("Aucun proxy valide fourni.")

        logger.info(f"[ScraperService] Mode proxy résidentiel : {mgr.count} proxy(ies)")

        return await self._run(
            keywords=keywords,
            sources=sources,
            location=location,
            results_per_source=results_per_source,
            hours_old=hours_old,
            remote_only=remote_only,
            job_types=job_types,
            search_profile_id=search_profile_id,
            proxy_manager=mgr,
        )

    # ── Moteur commun ─────────────────────────────────────────────────────────

    async def _run(
        self,
        keywords: str,
        sources: list[str],
        location: Optional[str],
        results_per_source: int,
        hours_old: Optional[int],
        remote_only: bool,
        job_types: Optional[list[str]],
        search_profile_id: Optional[int],
        proxy_manager,  # ResidentialProxyManager | None
    ) -> dict:

        total_new = 0
        total_dup = 0
        logs: list[ScrapeLog] = []

        async def _scrape_one(source: str) -> None:
            nonlocal total_new, total_dup

            # Sélectionner le proxy pour cette source (round-robin)
            proxy_url = proxy_manager.get_next() if proxy_manager else None
            proxy_display = (proxy_url.split('@')[-1] if proxy_url and '@' in proxy_url else None)

            log = ScrapeLog(
                source=source,
                search_profile_id=search_profile_id,
                status="running",
                started_at=datetime.utcnow(),
                proxy_used=proxy_display,
            )
            self.db.add(log)
            await self.db.flush()

            t0 = datetime.utcnow()
            try:
                scraper = get_scraper(source)

                # Injecter le proxy directement dans le scraper
                if proxy_url:
                    scraper.proxy = proxy_url
                    logger.info(f"[{source}] Utilise proxy : {proxy_display}")

                raw_jobs = await scraper.run(
                    keywords=keywords,
                    location=location,
                    results=results_per_source,
                    hours_old=hours_old,
                    remote_only=remote_only,
                    job_types=job_types or [],
                )
                new, dup = await self._persist_jobs(raw_jobs)
                total_new += new
                total_dup += dup

                log.status = "success"
                log.jobs_found = len(raw_jobs)
                log.jobs_new = new
                log.jobs_duplicate = dup

            except Exception as exc:
                log.status = "error"
                log.error_message = str(exc)
                logger.error(f"[ScraperService] {source} failed : {exc}")

                # Retirer le proxy défaillant si on est en mode proxy
                if proxy_url and proxy_manager:
                    proxy_manager.remove(proxy_url)

            finally:
                log.finished_at = datetime.utcnow()
                log.duration_sec = (log.finished_at - t0).total_seconds()
                logs.append(log)

        # Lancer toutes les sources en parallèle
        await asyncio.gather(*[_scrape_one(s) for s in sources])
        await self.db.commit()

        return {
            "total_new": total_new,
            "total_duplicate": total_dup,
            "used_proxies": proxy_manager.count if proxy_manager else 0,
            "sources": [
                {
                    "source": lg.source,
                    "status": lg.status,
                    "new": lg.jobs_new,
                    "found": lg.jobs_found,
                    "proxy": lg.proxy_used,
                    "error": lg.error_message,
                }
                for lg in logs
            ],
        }

    # ── Persistance ───────────────────────────────────────────────────────────

    async def _persist_jobs(self, raw_jobs: list[RawJob]) -> tuple[int, int]:
        new = dup = 0
        for rj in raw_jobs:
            if not rj.url:
                continue
            h = Job.make_hash(rj.url)
            existing = await self.db.scalar(select(Job).where(Job.content_hash == h))
            if existing:
                dup += 1
                continue
            job = Job(
                content_hash=h,
                title=rj.title,
                company=rj.company,
                location=rj.location,
                job_type=rj.job_type,
                is_remote=rj.is_remote,
                salary_min=rj.salary_min,
                salary_max=rj.salary_max,
                salary_currency=rj.salary_currency,
                description=rj.description,
                url=rj.url,
                source=rj.source,
                published_at=rj.published_at,
            )
            self.db.add(job)
            new += 1
        return new, dup
