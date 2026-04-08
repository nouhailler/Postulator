"""
app/scrapers/jobteaser_scraper.py
Scraper RemoteOK — plateforme d'offres d'emploi entièrement remote.

NOTE : Ce scraper remplace l'ancien scraper JobTeaser (dont l'API est
inaccessible publiquement depuis avril 2026 — retourne 403/404).

API publique RemoteOK :
  GET https://remoteok.com/api?tag={keywords}
  → JSON array, premier élément = notice légale, reste = offres

RemoteOK est spécialisé dans les offres 100% remote, ce qui complète
les scrapers suisses (jobs.ch, jobup.ch) pour les profils ouverts au télétravail.
Pas d'authentification requise.
"""
import asyncio
from datetime import datetime, timezone
from typing import Optional

from loguru import logger

from app.scrapers.base import BaseScraper, RawJob

REMOTEOK_API     = "https://remoteok.com/api"
REMOTEOK_HEADERS = {
    "User-Agent":      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
    "Accept":          "application/json, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer":         "https://remoteok.com/",
}
TIMEOUT = 25.0


class JobTeaserScraper(BaseScraper):
    """
    Scraper RemoteOK (enregistré sous la clé 'jobteaser' pour compatibilité).
    Retourne des offres 100% remote sans restriction géographique.
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

        proxy_url = getattr(self, "proxy", None)
        proxies   = {"http://": proxy_url, "https://": proxy_url} if proxy_url else None

        # RemoteOK supporte un seul tag à la fois ; prendre le premier mot-clé
        tag = keywords.split()[0] if keywords else "dev"

        try:
            with httpx.Client(
                timeout=TIMEOUT,
                headers=REMOTEOK_HEADERS,
                proxies=proxies,
                follow_redirects=True,
            ) as client:
                resp = client.get(REMOTEOK_API, params={"tag": tag})
                logger.info(f"[remoteok] GET {resp.url} → HTTP {resp.status_code}")

                if not resp.is_success:
                    logger.warning(f"[remoteok] HTTP {resp.status_code} — arrêt.")
                    return []

                raw = resp.json()

        except httpx.RequestError as exc:
            logger.error(f"[remoteok] Erreur réseau : {exc}")
            return []
        except Exception as exc:
            logger.error(f"[remoteok] Erreur inattendue : {exc}")
            return []

        if not isinstance(raw, list):
            logger.warning("[remoteok] Réponse inattendue (pas un tableau)")
            return []

        # Le premier élément est une notice légale (pas une offre)
        items = [item for item in raw if isinstance(item, dict) and "position" in item]
        logger.info(f"[remoteok] {len(items)} offres reçues")

        all_jobs: list[RawJob] = []
        for item in items[:results]:
            job = self._parse_item(item)
            if job:
                all_jobs.append(job)

        logger.info(f"[remoteok] Total : {len(all_jobs)} offres.")
        return all_jobs

    def _parse_item(self, item: dict) -> Optional[RawJob]:
        try:
            title   = (item.get("position") or "").strip()
            company = (item.get("company")  or "").strip()

            # URL — slug = "remote-titre-company-id"
            slug = item.get("slug") or ""
            url  = f"https://remoteok.com/{slug}" if slug else ""
            if not url:
                return None

            # Localisation — souvent "Worldwide" ou une ville
            loc = (item.get("location") or "").strip() or "Remote"

            # Date
            pub = None
            date_str = item.get("date") or ""
            if date_str:
                try:
                    pub = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
                except (ValueError, TypeError):
                    pass

            # Description (HTML) → texte brut minimal
            desc_html = item.get("description") or ""
            description: Optional[str] = None
            if desc_html:
                try:
                    from bs4 import BeautifulSoup
                    description = BeautifulSoup(desc_html, "html.parser").get_text(" ", strip=True)[:1000]
                except Exception:
                    description = desc_html[:500]

            # Salaire
            salary_min = item.get("salary_min") or None
            salary_max = item.get("salary_max") or None

            return RawJob(
                title           = title or "—",
                company         = company,
                url             = url,
                source          = self.source_name,
                location        = loc,
                description     = description,
                job_type        = "remote",
                salary_min      = float(salary_min) if salary_min else None,
                salary_max      = float(salary_max) if salary_max else None,
                salary_currency = "USD",
                published_at    = pub,
            )
        except Exception as exc:
            logger.warning(f"[remoteok] Parsing échoué : {exc} | keys: {list(item.keys())[:6]}")
            return None
