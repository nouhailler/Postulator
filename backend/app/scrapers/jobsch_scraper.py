"""
app/scrapers/jobsch_scraper.py
Scraper pour Jobs.ch — second job board suisse majeur (Adecco Group / Axel Springer)

Stratégie : API JSON interne utilisée par jobs.ch
URL de recherche : https://www.jobs.ch/fr/offres-emploi/?term={keywords}
L'endpoint JSON interne : https://www.jobs.ch/api/v1/public/search/

Jobs.ch couvre exclusivement la Suisse, avec de nombreuses offres exclusives
de grands groupes (banques, pharma, industrie).
"""
import asyncio
from datetime import datetime
from typing import Optional

from loguru import logger

from app.scrapers.base import BaseScraper, RawJob

JOBSCH_BASE    = "https://www.jobs.ch"
JOBSCH_API     = "https://www.jobs.ch/api/v1/public/search/"
JOBSCH_HEADERS = {
    "User-Agent":      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36",
    "Accept":          "application/json, text/javascript, */*; q=0.01",
    "Accept-Language": "fr-CH,fr;q=0.9,de-CH;q=0.8,en;q=0.7",
    "Referer":         "https://www.jobs.ch/fr/offres-emploi/",
    "X-Requested-With": "XMLHttpRequest",
}
TIMEOUT = 20.0


class JobschScraper(BaseScraper):
    """
    Scraper Jobs.ch via l'API JSON interne.
    Fonctionne sans clé API.
    Spécifique à la Suisse.
    """

    def __init__(self, source: str = "jobsch") -> None:
        super().__init__()
        self.source_name = source

    async def _fetch(self, keywords, location, results, hours_old, remote_only, job_types) -> list[RawJob]:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None,
            lambda: self._sync_fetch(keywords, location, results, hours_old, remote_only, job_types),
        )

    def _sync_fetch(self, keywords, location, results, hours_old, remote_only, job_types) -> list[RawJob]:
        import httpx

        city = _extract_city(location)

        proxy_url = getattr(self, "proxy", None)
        proxies   = {"http://": proxy_url, "https://": proxy_url} if proxy_url else None

        all_jobs: list[RawJob] = []
        page     = 1
        per_page = min(results, 25)

        with httpx.Client(
            timeout=TIMEOUT,
            headers=JOBSCH_HEADERS,
            proxies=proxies,
            follow_redirects=True,
        ) as client:

            while len(all_jobs) < results:
                params: dict = {
                    "term":     keywords,
                    "page":     page,
                    "per_page": per_page,
                    "sort":     "-date",      # plus récent en premier
                }
                if city:
                    params["location"] = city
                if hours_old:
                    params["age"] = max(1, hours_old // 24)
                if remote_only:
                    params["home_office"] = "true"

                try:
                    resp = client.get(JOBSCH_API, params=params)
                    logger.info(f"[jobsch] GET {resp.url} → HTTP {resp.status_code}")

                    if resp.status_code in (403, 429):
                        logger.warning(f"[jobsch] {resp.status_code} — retry sans proxy")
                        resp = httpx.get(JOBSCH_API, params=params, headers=JOBSCH_HEADERS,
                                         timeout=TIMEOUT, follow_redirects=True)
                        logger.info(f"[jobsch] Retry → HTTP {resp.status_code}")

                    if not resp.is_success:
                        logger.warning(f"[jobsch] HTTP {resp.status_code} — arrêt.")
                        break

                    data = resp.json()

                except httpx.RequestError as exc:
                    logger.error(f"[jobsch] Erreur réseau page {page} : {exc}")
                    break
                except Exception as exc:
                    logger.error(f"[jobsch] Erreur inattendue page {page} : {exc}")
                    break

                # Jobs.ch : {"documents": [...], "total": N} ou {"jobs": [...]}
                items = (
                    data.get("documents") or
                    data.get("jobs")      or
                    data.get("hits")      or
                    data.get("results")   or
                    []
                )
                total = data.get("total") or data.get("count") or 0
                logger.info(f"[jobsch] Page {page} : {len(items)} offres (total={total})")

                if not items:
                    break

                for item in items:
                    job = self._parse_item(item)
                    if job:
                        all_jobs.append(job)
                    if len(all_jobs) >= results:
                        break

                if len(all_jobs) >= results or len(items) < per_page or len(all_jobs) >= total:
                    break
                page += 1

        logger.info(f"[jobsch] Total : {len(all_jobs)} offres.")
        return all_jobs

    def _parse_item(self, item: dict) -> Optional[RawJob]:
        try:
            title = (
                item.get("title") or
                item.get("job_title") or
                item.get("name") or
                ""
            ).strip()

            company = (
                item.get("company_name") or
                (item.get("company") or {}).get("name") or
                item.get("employer") or
                ""
            ).strip()

            # URL
            slug   = item.get("slug") or ""
            job_id = item.get("id") or item.get("job_id") or ""
            url = (
                item.get("url") or
                item.get("apply_url") or
                item.get("external_url") or
                (f"{JOBSCH_BASE}/fr/offres-emploi/{slug}" if slug else "") or
                (f"{JOBSCH_BASE}/fr/offres-emploi/{job_id}" if job_id else "")
            )
            if not url or not url.startswith("http"):
                return None

            # Localisation
            loc = (
                item.get("location") or
                item.get("place") or
                item.get("city") or
                item.get("work_location") or
                ""
            )
            if isinstance(loc, dict):
                loc = loc.get("name") or loc.get("city") or loc.get("display_name") or ""
            if isinstance(loc, list) and loc:
                loc = loc[0] if isinstance(loc[0], str) else (loc[0].get("name") or "")
            if loc:
                loc = f"{loc}, Switzerland"

            # Date
            pub = None
            for key in ("publication_date", "published_at", "created_at", "date", "activation_date"):
                d = item.get(key)
                if d:
                    try:
                        pub = datetime.fromisoformat(str(d).replace("Z", "+00:00"))
                        break
                    except (ValueError, TypeError):
                        pass

            contract = item.get("employment_type") or item.get("contract_type") or item.get("workload") or ""
            if isinstance(contract, list):
                contract = ", ".join(str(c) for c in contract)

            description = item.get("description") or item.get("summary") or item.get("teaser") or ""

            return RawJob(
                title        = title or "—",
                company      = company,
                url          = url,
                source       = self.source_name,
                location     = loc or "Switzerland",
                description  = description or None,
                job_type     = str(contract) if contract else None,
                salary_currency = "CHF",
                published_at = pub,
            )
        except Exception as exc:
            logger.warning(f"[jobsch] Parsing échoué : {exc} | keys: {list(item.keys())[:8]}")
            return None


def _extract_city(location: Optional[str]) -> Optional[str]:
    if not location:
        return None
    parts = [p.strip() for p in location.split(",")]
    city = parts[0] if parts else None
    if city and city.lower() in ("switzerland", "suisse", "schweiz"):
        return None
    return city
