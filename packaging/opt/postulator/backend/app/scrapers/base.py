"""
app/scrapers/base.py
"""
import asyncio
import random
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

from loguru import logger

from app.core.config import get_settings
from app.scrapers.proxy_manager import proxy_manager

settings = get_settings()


@dataclass
class RawJob:
    """Représentation intermédiaire d'une offre avant insertion en BDD."""
    title:           str
    company:         str
    url:             str
    source:          str
    location:        Optional[str]   = None
    company_url:     Optional[str]   = None   # ← site web de l'entreprise (depuis jobspy)
    job_type:        Optional[str]   = None
    is_remote:       bool            = False
    salary_min:      Optional[float] = None
    salary_max:      Optional[float] = None
    salary_currency: Optional[str]   = None
    description:     Optional[str]   = None
    published_at:    Optional[datetime] = None
    extra:           dict            = field(default_factory=dict)


class BaseScraper(ABC):
    source_name: str = "unknown"

    def __init__(self) -> None:
        self.proxy = proxy_manager.get_random()

    async def run(
        self,
        keywords: str,
        location: Optional[str]    = None,
        results:  int              = 50,
        hours_old: Optional[int]   = None,
        remote_only: bool          = False,
        job_types: Optional[list[str]] = None,
    ) -> list[RawJob]:
        delay = random.uniform(settings.scraper_delay_min, settings.scraper_delay_max)
        logger.debug(f"[{self.source_name}] Délai anti-blocage : {delay:.1f}s")
        await asyncio.sleep(delay)
        try:
            jobs = await self._fetch(
                keywords=keywords,
                location=location,
                results=results,
                hours_old=hours_old,
                remote_only=remote_only,
                job_types=job_types or [],
            )
            logger.info(f"[{self.source_name}] {len(jobs)} offres récupérées.")
            return jobs
        except Exception as exc:
            logger.error(f"[{self.source_name}] Erreur scraping : {exc}")
            if self.proxy:
                proxy_manager.remove(self.proxy)
            raise

    @abstractmethod
    async def _fetch(
        self,
        keywords: str,
        location: Optional[str],
        results: int,
        hours_old: Optional[int],
        remote_only: bool,
        job_types: list[str],
    ) -> list[RawJob]:
        ...
