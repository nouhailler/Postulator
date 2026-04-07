"""
app/scrapers/jobteaser_scraper.py
Scraper pour JobTeaser — plateforme européenne orientée jeunes diplômés et PME.

Stratégie : API JSON publique de JobTeaser
Base URL : https://api.jobteaser.com/fr/public/jobs/search

JobTeaser est bien implanté en Suisse, France, Allemagne, Belgique, Autriche.
Contrairement à jobup.ch/jobs.ch, JobTeaser couvre aussi l'international
ce qui le rend utile pour les profils recherchant en Suisse ET en France.

L'API JobTeaser est semi-publique : elle est utilisée par le site public
et ne nécessite pas d'authentification pour les recherches basiques.
"""
import asyncio
from datetime import datetime
from typing import Optional

from loguru import logger

from app.scrapers.base import BaseScraper, RawJob

JOBTEASER_API     = "https://api.jobteaser.com/fr/public/jobs/search"
JOBTEASER_HEADERS = {
    "User-Agent":      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36",
    "Accept":          "application/json",
    "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
    "Origin":          "https://www.jobteaser.com",
    "Referer":         "https://www.jobteaser.com/fr/offres-d-emploi",
}
TIMEOUT = 20.0


class JobTeaserScraper(BaseScraper):
    """
    Scraper JobTeaser via l'API JSON publique.
    Bonne couverture CH + FR + DE.
    """

    def __init__(self, source: str = "jobteaser") -> None:
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

        city    = _extract_city(location)
        country = _extract_country(location)

        proxy_url = getattr(self, "proxy", None)
        proxies   = {"http://": proxy_url, "https://": proxy_url} if proxy_url else None

        all_jobs: list[RawJob] = []
        page     = 1
        per_page = min(results, 20)

        with httpx.Client(
            timeout=TIMEOUT,
            headers=JOBTEASER_HEADERS,
            proxies=proxies,
            follow_redirects=True,
        ) as client:

            while len(all_jobs) < results:
                params: dict = {
                    "q":       keywords,
                    "page":    page,
                    "limit":   per_page,
                }
                if city:
                    params["location"] = city
                if country:
                    params["country"] = country
                if remote_only:
                    params["remote"] = "true"

                try:
                    resp = client.get(JOBTEASER_API, params=params)
                    logger.info(f"[jobteaser] GET {resp.url} → HTTP {resp.status_code}")

                    if resp.status_code in (403, 429):
                        logger.warning(f"[jobteaser] {resp.status_code} — retry sans proxy")
                        resp = httpx.get(JOBTEASER_API, params=params, headers=JOBTEASER_HEADERS,
                                         timeout=TIMEOUT, follow_redirects=True)
                        logger.info(f"[jobteaser] Retry → HTTP {resp.status_code}")

                    if not resp.is_success:
                        logger.warning(f"[jobteaser] HTTP {resp.status_code} — arrêt.")
                        break

                    data = resp.json()

                except httpx.RequestError as exc:
                    logger.error(f"[jobteaser] Erreur réseau page {page} : {exc}")
                    break
                except Exception as exc:
                    logger.error(f"[jobteaser] Erreur inattendue page {page} : {exc}")
                    break

                items = (
                    data.get("jobs") or
                    data.get("results") or
                    data.get("items") or
                    data.get("data") or
                    []
                )
                total = data.get("total") or data.get("count") or data.get("total_count") or 0
                logger.info(f"[jobteaser] Page {page} : {len(items)} offres (total={total})")

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

        logger.info(f"[jobteaser] Total : {len(all_jobs)} offres.")
        return all_jobs

    def _parse_item(self, item: dict) -> Optional[RawJob]:
        try:
            title = (
                item.get("title") or
                item.get("name") or
                item.get("job_title") or
                ""
            ).strip()

            # Entreprise — JobTeaser a souvent une structure imbriquée
            company_data = item.get("company") or item.get("employer") or {}
            if isinstance(company_data, str):
                company = company_data
            else:
                company = (
                    company_data.get("name") or
                    company_data.get("display_name") or
                    item.get("company_name") or
                    ""
                )
            company = company.strip()

            # URL
            url = (
                item.get("url") or
                item.get("apply_url") or
                item.get("external_url") or
                item.get("link") or
                ""
            )
            if not url:
                slug = item.get("slug") or item.get("id") or ""
                if slug:
                    url = f"https://www.jobteaser.com/fr/offres-d-emploi/{slug}"
            if not url or not url.startswith("http"):
                return None

            # Localisation
            loc_data = item.get("location") or item.get("locations") or {}
            if isinstance(loc_data, list) and loc_data:
                loc_data = loc_data[0]
            if isinstance(loc_data, dict):
                city_name    = loc_data.get("city") or loc_data.get("name") or ""
                country_name = loc_data.get("country") or loc_data.get("country_name") or ""
                loc_str = ", ".join(filter(None, [city_name, country_name]))
            elif isinstance(loc_data, str):
                loc_str = loc_data
            else:
                loc_str = ""

            # Date
            pub = None
            for key in ("published_at", "publication_date", "created_at", "date", "start_date"):
                d = item.get(key)
                if d:
                    try:
                        pub = datetime.fromisoformat(str(d).replace("Z", "+00:00"))
                        break
                    except (ValueError, TypeError):
                        pass

            contract = item.get("contract_type") or item.get("employment_type") or ""
            if isinstance(contract, dict):
                contract = contract.get("name") or contract.get("label") or ""

            description = item.get("description") or item.get("summary") or item.get("teaser") or ""

            return RawJob(
                title        = title or "—",
                company      = company,
                url          = url,
                source       = self.source_name,
                location     = loc_str or None,
                description  = description or None,
                job_type     = str(contract) if contract else None,
                published_at = pub,
            )
        except Exception as exc:
            logger.warning(f"[jobteaser] Parsing échoué : {exc} | keys: {list(item.keys())[:8]}")
            return None


# Mapping pays → code ISO2 pour JobTeaser
_COUNTRY_CODES = {
    "Switzerland":   "CH",
    "France":        "FR",
    "Germany":       "DE",
    "Belgium":       "BE",
    "Austria":       "AT",
    "Luxembourg":    "LU",
    "Netherlands":   "NL",
    "Spain":         "ES",
    "Italy":         "IT",
    "United Kingdom":"GB",
    "United States": "US",
}


def _extract_city(location: Optional[str]) -> Optional[str]:
    if not location:
        return None
    parts = [p.strip() for p in location.split(",")]
    city = parts[0] if parts else None
    if city and city.lower() in ("switzerland", "suisse", "schweiz", "france", "germany", "allemagne"):
        return None
    return city


def _extract_country(location: Optional[str]) -> Optional[str]:
    if not location:
        return None
    parts = [p.strip() for p in location.split(",")]
    country_name = parts[-1]
    return _COUNTRY_CODES.get(country_name)
