"""
app/scrapers/jobspy_scraper.py
Scraper basé sur python-jobspy — couvre Indeed, LinkedIn, Glassdoor,
ZipRecruiter, Google Jobs en un seul appel.

Doc python-jobspy : https://github.com/Bunsly/JobSpy
"""
import asyncio
from datetime import datetime
from typing import Optional

from loguru import logger

from app.scrapers.base import BaseScraper, RawJob

SUPPORTED_SOURCES = {
    "indeed":       "indeed",
    "linkedin":     "linkedin",
    "glassdoor":    "glassdoor",
    "ziprecruiter": "zip_recruiter",
    "google":       "google",
}


class JobSpyScraper(BaseScraper):

    def __init__(self, source: str = "indeed") -> None:
        super().__init__()
        if source not in SUPPORTED_SOURCES:
            raise ValueError(
                f"Source '{source}' non supportée. Disponibles : {list(SUPPORTED_SOURCES)}"
            )
        self.source_name = source
        self._jobspy_site = SUPPORTED_SOURCES[source]

    async def _fetch(
        self,
        keywords: str,
        location: Optional[str],
        results: int,
        hours_old: Optional[int],
        remote_only: bool,
        job_types: list[str],
    ) -> list[RawJob]:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None,
            lambda: self._sync_fetch(keywords, location, results, hours_old, remote_only, job_types),
        )

    def _sync_fetch(
        self,
        keywords: str,
        location: Optional[str],
        results: int,
        hours_old: Optional[int],
        remote_only: bool,
        job_types: list[str],
    ) -> list[RawJob]:
        try:
            from jobspy import scrape_jobs
        except ImportError:
            logger.error("python-jobspy non installé : pip install python-jobspy")
            return []

        # Mapping job_types
        type_map = {
            "fulltime":   "fulltime",
            "parttime":   "parttime",
            "contract":   "contract",
            "internship": "internship",
        }
        jobspy_types = [type_map[jt] for jt in job_types if jt in type_map]

        # ── CORRECTION BUG : is_remote doit être bool, jamais None ──────────
        # python-jobspy valide is_remote avec Pydantic strict bool.
        # Passer None provoque : "Input should be a valid boolean [type=bool_type]"
        # Solution : toujours passer un bool explicite.
        is_remote_bool: bool = bool(remote_only)

        proxy = self.proxy or None

        logger.debug(
            f"[{self.source_name}] scrape_jobs("
            f"search_term={keywords!r}, location={location!r}, "
            f"results_wanted={results}, hours_old={hours_old}, "
            f"is_remote={is_remote_bool}, job_type={jobspy_types[0] if jobspy_types else None})"
        )

        try:
            df = scrape_jobs(
                site_name=[self._jobspy_site],
                search_term=keywords,
                location=location or "",
                results_wanted=results,
                hours_old=hours_old,
                is_remote=is_remote_bool,          # ← TOUJOURS un bool
                job_type=jobspy_types[0] if jobspy_types else None,
                proxy=proxy,
                linkedin_fetch_description=(self.source_name == "linkedin"),
                verbose=0,
            )
        except Exception as exc:
            logger.error(f"[{self.source_name}] jobspy error : {exc}")
            return []

        if df is None or df.empty:
            logger.info(f"[{self.source_name}] DataFrame vide — 0 offres.")
            return []

        jobs: list[RawJob] = []
        for _, row in df.iterrows():
            try:
                # Date de publication
                pub = row.get("date_posted")
                if pub is not None and not isinstance(pub, datetime):
                    try:
                        pub = datetime.fromisoformat(str(pub))
                    except (ValueError, TypeError):
                        pub = None

                # Salaire
                sal_min = float(row["min_amount"]) if row.get("min_amount") else None
                sal_max = float(row["max_amount"]) if row.get("max_amount") else None
                currency = str(row["currency"]) if row.get("currency") else None

                # URL — s'assurer qu'elle est non vide
                url = str(row.get("job_url") or row.get("job_url_direct") or "").strip()
                if not url:
                    continue

                jobs.append(RawJob(
                    title=str(row.get("title") or "").strip(),
                    company=str(row.get("company") or "").strip(),
                    url=url,
                    source=self.source_name,
                    location=str(row.get("location") or "").strip() or None,
                    job_type=str(row.get("job_type") or "").strip() or None,
                    is_remote=bool(row.get("is_remote", False)),
                    salary_min=sal_min,
                    salary_max=sal_max,
                    salary_currency=currency,
                    description=str(row.get("description") or "").strip() or None,
                    published_at=pub,
                ))
            except Exception as exc:
                logger.warning(f"[{self.source_name}] Ligne ignorée : {exc}")
                continue

        logger.info(f"[{self.source_name}] {len(jobs)} offres parsées depuis le DataFrame.")
        return jobs
