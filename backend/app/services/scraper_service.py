"""
app/services/scraper_service.py

Rotation proxy améliorée :
- Avant chaque session, on lit le DERNIER proxy utilisé dans scrape_logs
- On démarre la rotation à l'index SUIVANT dans la liste
- En parallèle (asyncio.gather), chaque source reçoit un proxy différent
"""
import asyncio
import json
from datetime import datetime
from typing import Optional

from loguru import logger
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.job import Job
from app.models.scrape_log import ScrapeLog
from app.scrapers import get_scraper
from app.scrapers.base import RawJob


class ScraperService:

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def run_search(self, keywords, sources, location=None, results_per_source=10,
                         hours_old=None, remote_only=False, job_types=None, search_profile_id=None):
        return await self._run(keywords=keywords, sources=sources, location=location,
                               results_per_source=results_per_source, hours_old=hours_old,
                               remote_only=remote_only, job_types=job_types,
                               search_profile_id=search_profile_id, proxy_manager=None)

    async def run_search_with_proxies(self, keywords, sources, proxy_lines, location=None,
                                      results_per_source=10, hours_old=None, remote_only=False,
                                      job_types=None, search_profile_id=None):
        from app.scrapers.proxy_manager import ResidentialProxyManager

        mgr = ResidentialProxyManager(proxy_lines)
        if not mgr.has_proxies:
            raise ValueError("Aucun proxy valide fourni.")

        # ── Rotation intelligente : récupérer le dernier proxy utilisé ────────
        last_proxy = await self._get_last_used_proxy()
        if last_proxy:
            mgr.advance_past(last_proxy)
            logger.info(f"[ScraperService] Rotation : dernier proxy utilisé = {last_proxy!r}, démarrage au suivant.")
        else:
            logger.info(f"[ScraperService] Aucun proxy précédent trouvé, démarrage au proxy 0.")

        logger.info(f"[ScraperService] Mode proxy résidentiel : {mgr.count} proxy(ies) disponibles.")
        return await self._run(keywords=keywords, sources=sources, location=location,
                               results_per_source=results_per_source, hours_old=hours_old,
                               remote_only=remote_only, job_types=job_types,
                               search_profile_id=search_profile_id, proxy_manager=mgr)

    async def _get_last_used_proxy(self) -> Optional[str]:
        """
        Lit le dernier proxy utilisé dans l'Audit Trail (scrape_logs).
        Retourne l'IP:PORT du dernier proxy, ou None si aucun.
        """
        try:
            stmt = (
                select(ScrapeLog.proxy_used)
                .where(ScrapeLog.proxy_used.isnot(None))
                .order_by(desc(ScrapeLog.started_at))
                .limit(1)
            )
            result = await self.db.execute(stmt)
            row = result.scalar_one_or_none()
            return row  # IP:PORT ou None
        except Exception as exc:
            logger.warning(f"[ScraperService] Impossible de lire le dernier proxy : {exc}")
            return None

    async def _run(self, keywords, sources, location, results_per_source, hours_old,
                   remote_only, job_types, search_profile_id, proxy_manager):
        total_new = 0
        total_dup = 0
        logs: list[ScrapeLog] = []

        # Pré-attribuer un proxy par source AVANT le gather
        # (évite que toutes les coroutines parallèles prennent le même index)
        source_proxies: dict[str, Optional[str]] = {}
        for source in sources:
            proxy_url = proxy_manager.get_next() if proxy_manager else None
            source_proxies[source] = proxy_url
            if proxy_url:
                logger.info(f"[{source}] Proxy attribué : {_proxy_display(proxy_url)}")

        async def _scrape_one(source: str) -> None:
            nonlocal total_new, total_dup
            proxy_url     = source_proxies[source]
            proxy_display = _proxy_display(proxy_url)
            proxies_tried_list = [proxy_display] if proxy_display else []

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
                if proxy_url:
                    scraper.proxy = proxy_url

                raw_jobs = await scraper.run(
                    keywords=keywords, location=location, results=results_per_source,
                    hours_old=hours_old, remote_only=remote_only, job_types=job_types or [],
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
                # Proxy défaillant → retirer + noter le retry
                if proxy_url and proxy_manager:
                    proxy_manager.remove(proxy_url)
                    retry_proxy = proxy_manager.get_next() if proxy_manager.has_proxies else None
                    if retry_proxy:
                        retry_display = _proxy_display(retry_proxy)
                        proxies_tried_list.append(retry_display)
                        logger.info(f"[{source}] Retry avec proxy : {retry_display}")
            finally:
                log.finished_at = datetime.utcnow()
                log.duration_sec = (log.finished_at - t0).total_seconds()
                if proxies_tried_list:
                    log.proxies_tried = json.dumps(proxies_tried_list, ensure_ascii=False)
                logs.append(log)

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
                company_url=rj.company_url,
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


def _proxy_display(proxy_url: Optional[str]) -> Optional[str]:
    """Extrait IP:PORT depuis un proxy_url, sans les credentials."""
    if not proxy_url:
        return None
    if "@" in proxy_url:
        host_part = proxy_url.split("@")[-1]
        return host_part.rstrip("/")
    try:
        parts = proxy_url.split(":")
        if len(parts) >= 2:
            return f"{parts[0]}:{parts[1]}"
    except Exception:
        pass
    return proxy_url
