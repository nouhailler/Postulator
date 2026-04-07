"""
app/scrapers/jobup_scraper.py
Scraper pour Jobup.ch — principal job board suisse (Michael Page, Adecco, etc.)

Stratégie : API JSON interne utilisée par le site jobup.ch
URL : https://www.jobup.ch/fr/emplois/?term={keywords}&location={location}
L'endpoint JSON interne : https://www.jobup.ch/api/v1/jobs/search/

Jobup.ch est opéré par JobCloud (groupe Ringier / TX Group).
"""
import asyncio
import re
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import quote_plus

from loguru import logger

from app.scrapers.base import BaseScraper, RawJob

JOBUP_BASE    = "https://www.jobup.ch"
JOBUP_API     = "https://www.jobup.ch/api/v1/jobs/search/"
JOBUP_HEADERS = {
    "User-Agent":      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36",
    "Accept":          "application/json, text/javascript, */*; q=0.01",
    "Accept-Language": "fr-CH,fr;q=0.9,en;q=0.8",
    "Referer":         "https://www.jobup.ch/fr/emplois/",
    "X-Requested-With": "XMLHttpRequest",
}
TIMEOUT = 20.0


class JobupScraper(BaseScraper):
    """
    Scraper Jobup.ch via l'API JSON interne.
    Fonctionne sans clé API — utilise les mêmes endpoints que le navigateur.
    Spécifique à la Suisse : jobup.ch ne couvre que CH.
    """

    def __init__(self, source: str = "jobup") -> None:
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

        # Extraire la ville depuis "Ville, Pays"
        city = _extract_city(location)

        # Proxy si disponible
        proxy_url = getattr(self, "proxy", None)
        proxies   = {"http://": proxy_url, "https://": proxy_url} if proxy_url else None

        all_jobs: list[RawJob] = []
        page     = 1
        per_page = min(results, 20)  # Jobup retourne max ~20 par page

        with httpx.Client(
            timeout=TIMEOUT,
            headers=JOBUP_HEADERS,
            proxies=proxies,
            follow_redirects=True,
        ) as client:

            while len(all_jobs) < results:
                params = {
                    "term":          keywords,
                    "publication_date": _days_to_jobup_filter(hours_old),
                    "page":          page,
                    "sort":          "date",
                }
                if city:
                    params["location"] = city

                try:
                    resp = client.get(JOBUP_API, params=params)
                    logger.info(f"[jobup] GET {resp.url} → HTTP {resp.status_code}")

                    if resp.status_code == 403:
                        logger.warning("[jobup] 403 — essai sans proxy")
                        # Retry sans proxy
                        resp = httpx.get(JOBUP_API, params=params, headers=JOBUP_HEADERS,
                                         timeout=TIMEOUT, follow_redirects=True)
                        logger.info(f"[jobup] Retry sans proxy → HTTP {resp.status_code}")

                    if not resp.is_success:
                        logger.warning(f"[jobup] HTTP {resp.status_code} — arrêt.")
                        break

                    data = resp.json()

                except httpx.RequestError as exc:
                    logger.error(f"[jobup] Erreur réseau page {page} : {exc}")
                    break
                except Exception as exc:
                    logger.error(f"[jobup] Erreur inattendue page {page} : {exc}")
                    break

                # Jobup peut retourner {"documents": [...]} ou {"jobs": [...]}
                items = (
                    data.get("documents") or
                    data.get("jobs")      or
                    data.get("results")   or
                    []
                )
                total = data.get("total") or data.get("count") or 0
                logger.info(f"[jobup] Page {page} : {len(items)} offres (total={total})")

                if not items:
                    break

                for item in items:
                    job = self._parse_item(item)
                    if job:
                        all_jobs.append(job)
                    if len(all_jobs) >= results:
                        break

                # Pagination
                if len(all_jobs) >= results or len(items) < per_page or len(all_jobs) >= total:
                    break
                page += 1

        logger.info(f"[jobup] Total : {len(all_jobs)} offres.")
        return all_jobs

    def _parse_item(self, item: dict) -> Optional[RawJob]:
        try:
            # Jobup peut avoir différentes structures selon la version de l'API
            title   = (item.get("title") or item.get("job_title") or "").strip()
            company = (
                item.get("company_name") or
                (item.get("company") or {}).get("name") or
                item.get("employer_name") or
                ""
            ).strip()

            # URL de l'offre
            slug    = item.get("slug") or item.get("id") or item.get("job_id") or ""
            job_id  = item.get("id") or item.get("job_id") or ""
            url = (
                item.get("url") or
                item.get("apply_url") or
                (f"{JOBUP_BASE}/fr/emplois/detail/{slug}/" if slug else "") or
                (f"{JOBUP_BASE}/fr/emplois/detail/{job_id}/" if job_id else "")
            )
            if not url or not url.startswith("http"):
                return None

            # Localisation
            loc = (
                item.get("location") or
                item.get("place") or
                item.get("city") or
                ""
            )
            if isinstance(loc, dict):
                loc = loc.get("name") or loc.get("city") or ""
            if loc:
                loc = f"{loc}, Switzerland"

            # Date
            pub = None
            for date_key in ("publication_date", "published_at", "created_at", "date"):
                d = item.get(date_key)
                if d:
                    try:
                        pub = datetime.fromisoformat(str(d).replace("Z", "+00:00"))
                        break
                    except (ValueError, TypeError):
                        pass

            # Contrat
            contract = item.get("workload") or item.get("contract_type") or item.get("employment_type") or ""
            if isinstance(contract, list):
                contract = ", ".join(str(c) for c in contract)

            description = item.get("description") or item.get("summary") or ""

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
            logger.warning(f"[jobup] Parsing échoué : {exc} | item keys: {list(item.keys())[:8]}")
            return None


def _extract_city(location: Optional[str]) -> Optional[str]:
    if not location:
        return None
    parts = [p.strip() for p in location.split(",")]
    city = parts[0] if parts else None
    # Filtrer si c'est le nom du pays seul
    if city and city.lower() in ("switzerland", "suisse", "schweiz"):
        return None
    return city


def _days_to_jobup_filter(hours_old: Optional[int]) -> str:
    """Convertit hours_old en filtre Jobup (publication_date)."""
    if not hours_old:
        return ""
    days = hours_old // 24
    if days <= 1:   return "1"
    if days <= 3:   return "3"
    if days <= 7:   return "7"
    if days <= 14:  return "14"
    if days <= 30:  return "30"
    return ""  # Pas de filtre si > 30 jours
