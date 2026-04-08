"""
app/scrapers/jobup_scraper.py
Scraper pour Jobup.ch — principal job board suisse (JobCloud / Ringier / TX Group)

Stratégie : scraping HTML de la page de résultats SSR (server-side rendered).
URL : https://www.jobup.ch/fr/emplois/?term={keywords}&location={city}&page={page}

Chaque page retourne 20 offres rendues côté serveur dans des éléments
[data-cy="serp-item"]. Pas d'API JSON publique accessible.
"""
import asyncio
import re
from datetime import datetime, timedelta, timezone
from typing import Optional

from loguru import logger

from app.scrapers.base import BaseScraper, RawJob

JOBUP_BASE    = "https://www.jobup.ch"
JOBUP_SEARCH  = "https://www.jobup.ch/fr/emplois/"
JOBUP_HEADERS = {
    "User-Agent":      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
    "Accept":          "text/html,application/xhtml+xml,*/*;q=0.9",
    "Accept-Language": "fr-CH,fr;q=0.9,en;q=0.8",
    "Referer":         "https://www.jobup.ch/fr/emplois/",
}
TIMEOUT      = 25.0
JOBS_PER_PAGE = 20

# Labels connus à ignorer lors du parsing du texte de carte
_KNOWN_LABELS = frozenset({
    "lieu de travail", "taux d'activité", "type de contrat",
    "offre pertinente ?", "candidature simplifiée", "new", ":",
    "quick apply", "lieu", "activité", "contrat",
})


class JobupScraper(BaseScraper):
    """
    Scraper Jobup.ch par parsing HTML SSR.
    La page de résultats est rendue côté serveur — les 20 premières offres
    sont présentes dans le HTML brut, pas besoin de JavaScript.
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
        try:
            from bs4 import BeautifulSoup
        except ImportError:
            logger.error("[jobup] beautifulsoup4 manquant — pip install beautifulsoup4")
            return []

        import httpx

        city = _extract_city(location)
        proxy_url = getattr(self, "proxy", None)
        proxies   = {"http://": proxy_url, "https://": proxy_url} if proxy_url else None

        all_jobs: list[RawJob] = []
        page = 1

        with httpx.Client(
            timeout=TIMEOUT,
            headers=JOBUP_HEADERS,
            proxies=proxies,
            follow_redirects=True,
        ) as client:

            while len(all_jobs) < results:
                params: dict = {"term": keywords, "page": page}
                if city:
                    params["location"] = city
                if hours_old:
                    params["publication_date"] = _days_to_jobup_filter(hours_old)
                if remote_only:
                    params["home_office"] = "full_time"

                try:
                    resp = client.get(JOBUP_SEARCH, params=params)
                    logger.info(f"[jobup] GET {resp.url} → HTTP {resp.status_code}")

                    if not resp.is_success:
                        logger.warning(f"[jobup] HTTP {resp.status_code} — arrêt.")
                        break

                    soup = BeautifulSoup(resp.text, "html.parser")

                except httpx.RequestError as exc:
                    logger.error(f"[jobup] Erreur réseau page {page} : {exc}")
                    break
                except Exception as exc:
                    logger.error(f"[jobup] Erreur inattendue page {page} : {exc}")
                    break

                # Les cartes sont dans [data-cy="serp-item"]
                cards = soup.find_all(attrs={"data-cy": "serp-item"})
                logger.info(f"[jobup] Page {page} : {len(cards)} cartes trouvées")

                if not cards:
                    break

                for card in cards:
                    job = self._parse_card(card)
                    if job:
                        all_jobs.append(job)
                    if len(all_jobs) >= results:
                        break

                if len(all_jobs) >= results or len(cards) < JOBS_PER_PAGE:
                    break
                page += 1

        logger.info(f"[jobup] Total : {len(all_jobs)} offres.")
        return all_jobs

    def _parse_card(self, card) -> Optional[RawJob]:
        try:
            # URL — depuis le premier lien /fr/emplois/detail/{uuid}/
            link = card.find("a", href=re.compile(r"/fr/emplois/detail/"))
            if not link:
                return None
            href = link.get("href", "")
            url  = href if href.startswith("http") else f"{JOBUP_BASE}{href}"
            if not url.startswith("http"):
                return None

            # Texte brut du card, séparé par "|" pour faciliter le parsing
            parts = [p.strip() for p in card.get_text(separator="|", strip=True).split("|") if p.strip()]

            # Le 1er élément est la date relative, le 2ème est le titre
            date_str = parts[0] if parts else ""
            title    = parts[1] if len(parts) > 1 else ""

            # Extraire localisation, contrat, entreprise depuis les parties
            location_str = _extract_after_label(parts, "lieu de travail")
            contract     = _extract_after_label(parts, "type de contrat")
            # L'entreprise est le dernier élément qui ne soit pas un label connu
            company = _extract_company(parts)

            pub = _parse_relative_date(date_str)

            if loc := location_str:
                loc = f"{loc}, Switzerland"

            return RawJob(
                title           = title or "—",
                company         = company or "",
                url             = url,
                source          = self.source_name,
                location        = loc or "Switzerland",
                description     = None,
                job_type        = contract or None,
                salary_currency = "CHF",
                published_at    = pub,
            )
        except Exception as exc:
            logger.warning(f"[jobup] Parsing carte échoué : {exc}")
            return None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _extract_after_label(parts: list[str], label: str) -> Optional[str]:
    """Retourne la première partie non-label après 'label'."""
    label_lower = label.lower()
    for i, p in enumerate(parts):
        if p.lower() == label_lower:
            # chercher la prochaine valeur non-label, non-":"
            for j in range(i + 1, min(i + 4, len(parts))):
                v = parts[j].strip()
                if v and v != ":" and v.lower() not in _KNOWN_LABELS:
                    return v
    return None


def _extract_company(parts: list[str]) -> Optional[str]:
    """L'entreprise est le dernier élément non-label significatif."""
    known = _KNOWN_LABELS | {
        "new", "sponsored", "annonce sponsorisée",
        "quick apply", "candidature en 1 clic",
    }
    # On ignore aussi les pourcentages (workload) et les labels de contrat connus
    candidates = []
    skip_next = False
    for p in parts:
        pl = p.lower()
        if pl in ("lieu de travail", "taux d'activité", "type de contrat"):
            skip_next = True
            continue
        if skip_next:
            skip_next = False
            continue
        if pl in known or pl == ":":
            continue
        if re.match(r"^\d+\s*[–-]\s*\d+\s*%$", p) or re.match(r"^\d+\s*%$", p):
            continue  # workload
        candidates.append(p)

    # Les 2 premiers sont date + titre
    if len(candidates) > 2:
        return candidates[-1]
    return None


def _parse_relative_date(text: str) -> Optional[datetime]:
    """Convertit une date relative française en datetime UTC."""
    now = datetime.now(timezone.utc)
    t = text.lower().strip()
    if not t or "date" in t:
        return None
    if "aujourd" in t:
        return now
    if "avant-hier" in t:
        return now - timedelta(days=2)
    if "hier" in t:
        return now - timedelta(days=1)
    if "semaine dernière" in t or ("la semaine" in t and "dernière" in t):
        return now - timedelta(weeks=1)
    m = re.search(r"(\d+)\s*jour", t)
    if m:
        return now - timedelta(days=int(m.group(1)))
    m = re.search(r"(\d+)\s*semaine", t)
    if m:
        return now - timedelta(weeks=int(m.group(1)))
    m = re.search(r"(\d+)\s*mois", t)
    if m:
        return now - timedelta(days=int(m.group(1)) * 30)
    return None


def _extract_city(location: Optional[str]) -> Optional[str]:
    if not location:
        return None
    parts = [p.strip() for p in location.split(",")]
    city = parts[0] if parts else None
    if city and city.lower() in ("switzerland", "suisse", "schweiz"):
        return None
    return city


def _days_to_jobup_filter(hours_old: Optional[int]) -> str:
    """Convertit hours_old en valeur du filtre publication_date jobup."""
    if not hours_old:
        return ""
    days = hours_old // 24
    if days <= 1:  return "1"
    if days <= 3:  return "3"
    if days <= 7:  return "7"
    if days <= 14: return "14"
    if days <= 30: return "30"
    return ""
