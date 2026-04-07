"""
app/scrapers/adzuna_scraper.py
Scraper basé sur l'API officielle Adzuna.

Adzuna API v1 :
  https://api.adzuna.com/v1/api/jobs/{country}/search/{page}

PAYS RÉELLEMENT SUPPORTÉS par Adzuna (liste officielle) :
  gb (UK), us, au, ca, de, fr, nl, pl, sg, at, be, br, in, it, mx, nz, za

⚠ La Suisse (ch) N'EST PAS supportée par Adzuna.
  Fallback automatique : ch → de (Allemagne) avec filtre "Switzerland" dans where.

Inscription gratuite : https://developer.adzuna.com/
Quota : 10 000 requêtes/mois sur le plan gratuit.
"""
import asyncio
from datetime import datetime
from typing import Optional

import httpx
from loguru import logger

from app.scrapers.base import BaseScraper, RawJob

ADZUNA_BASE = "https://api.adzuna.com/v1/api/jobs"
TIMEOUT     = 25.0

# ── Pays RÉELLEMENT supportés par Adzuna ─────────────────────────────────────
# Source : https://developer.adzuna.com/overview
ADZUNA_SUPPORTED = {
    "gb", "us", "au", "ca", "de", "fr",
    "nl", "pl", "sg", "at", "be", "br",
    "in", "it", "mx", "nz", "za",
}

# Mapping pays Postulator → code Adzuna
# Les pays non supportés ont un fallback (code pays le plus proche géographiquement)
ADZUNA_COUNTRY_MAP = {
    # Supportés nativement
    "United Kingdom":       ("gb", None),
    "United States":        ("us", None),
    "Australia":            ("au", None),
    "Canada":               ("ca", None),
    "Germany":              ("de", None),
    "France":               ("fr", None),
    "Netherlands":          ("nl", None),
    "Poland":               ("pl", None),
    "Singapore":            ("sg", None),
    "Austria":              ("at", None),
    "Belgium":              ("be", None),
    "Italy":                ("it", None),
    # Fallbacks : pays non supportés → code le plus proche + where forcé
    "Switzerland":          ("de", "Switzerland"),   # ch non supporté → de + where=Switzerland
    "Luxembourg":           ("be", "Luxembourg"),    # lu non supporté → be
    "Ireland":              ("gb", "Ireland"),       # ie non supporté → gb
    "Spain":                ("fr", "Spain"),         # es non supporté → fr + where=Spain
    "Sweden":               ("gb", "Sweden"),
    "Norway":               ("gb", "Norway"),
    "Denmark":              ("gb", "Denmark"),
    "Finland":              ("gb", "Finland"),
    "Czech Republic":       ("gb", "Czech Republic"),
    "Japan":                ("sg", "Japan"),
    "United Arab Emirates": ("gb", "United Arab Emirates"),
}

DEFAULT = ("gb", None)


def _resolve_country(location: Optional[str]) -> tuple[str, Optional[str]]:
    """
    Retourne (country_code_adzuna, where_override) depuis une location 'Ville, Pays'.
    - country_code : code pays Adzuna à utiliser
    - where_override : si non None, forcer ce where (pour les fallbacks)
    """
    if not location:
        return DEFAULT
    parts = [p.strip() for p in location.split(",")]
    country_name = parts[-1]
    city = parts[0] if len(parts) >= 2 else None

    code, forced_where = ADZUNA_COUNTRY_MAP.get(country_name, DEFAULT)

    # Si fallback, le where = "Ville, Pays" ou juste le pays
    if forced_where:
        where = f"{city}, {forced_where}" if city else forced_where
    else:
        where = city  # aucun fallback → utiliser la ville seule

    return code, where


class AdzunaScraper(BaseScraper):
    """
    Scraper utilisant l'API officielle Adzuna.
    Nécessite ADZUNA_APP_ID et ADZUNA_APP_KEY dans le .env.
    """

    def __init__(self, source: str = "adzuna") -> None:
        super().__init__()
        self.source_name = source

    async def _fetch(self, keywords, location, results, hours_old, remote_only, job_types) -> list[RawJob]:
        from app.core.config import get_settings
        settings = get_settings()

        app_id  = getattr(settings, "adzuna_app_id",  "") or ""
        app_key = getattr(settings, "adzuna_app_key", "") or ""

        if not app_id or not app_key:
            logger.error(
                "[adzuna] ADZUNA_APP_ID et ADZUNA_APP_KEY non configurés dans .env. "
                "Inscription gratuite sur https://developer.adzuna.com/"
            )
            return []

        country_code, where = _resolve_country(location)

        # Log si fallback utilisé
        original_country = location.split(",")[-1].strip() if location else "?"
        if country_code not in ADZUNA_SUPPORTED or (location and original_country not in ["United Kingdom","United States","Australia","Canada","Germany","France","Netherlands","Poland","Singapore","Austria","Belgium","Italy"]):
            logger.info(
                f"[adzuna] Pays '{original_country}' non supporté nativement → "
                f"fallback sur '{country_code}' avec where='{where}'"
            )

        results_per_page = min(results, 50)
        pages_needed     = max(1, (results + results_per_page - 1) // results_per_page)

        loop = asyncio.get_event_loop()
        jobs = await loop.run_in_executor(
            None,
            lambda: self._sync_fetch(
                app_id, app_key, keywords, country_code, where,
                results_per_page, pages_needed, hours_old, remote_only
            )
        )
        return jobs

    def _sync_fetch(self, app_id, app_key, keywords, country_code, where,
                    results_per_page, pages_needed, hours_old, remote_only) -> list[RawJob]:
        import httpx as _httpx
        all_jobs: list[RawJob] = []

        # Proxy HTTP si disponible
        proxy_url = getattr(self, 'proxy', None)
        proxies = None
        if proxy_url:
            proxies = {"http://": proxy_url, "https://": proxy_url}

        with _httpx.Client(timeout=TIMEOUT, proxies=proxies) as client:
            for page in range(1, pages_needed + 1):
                params = {
                    "app_id":           app_id,
                    "app_key":          app_key,
                    "what":             keywords,
                    "results_per_page": results_per_page,
                }
                if where:
                    params["where"] = where
                if remote_only:
                    # Adzuna : ajouter "remote" aux termes de recherche
                    params["what_and"] = "remote"
                if hours_old and hours_old > 0:
                    params["max_days_old"] = max(1, hours_old // 24)

                url = f"{ADZUNA_BASE}/{country_code}/search/{page}"

                logger.info(
                    f"[adzuna] GET {url} | what={keywords!r} where={where!r} "
                    f"days={params.get('max_days_old','–')} results={results_per_page}"
                )

                try:
                    resp = client.get(url, params=params)
                    logger.info(f"[adzuna] Réponse HTTP {resp.status_code}")

                    if resp.status_code == 401:
                        logger.error("[adzuna] 401 — Clés API invalides.")
                        break
                    if resp.status_code == 403:
                        logger.error("[adzuna] 403 — Accès interdit (quota ou clés incorrectes).")
                        break
                    if resp.status_code == 404:
                        logger.error(f"[adzuna] 404 — Pays '{country_code}' non reconnu par Adzuna.")
                        break
                    if not resp.is_success:
                        logger.warning(f"[adzuna] HTTP {resp.status_code} : {resp.text[:200]}")
                        break

                    data = resp.json()
                    total_count  = data.get("count", 0)
                    results_data = data.get("results", [])

                    logger.info(
                        f"[adzuna] Page {page}/{pages_needed} : "
                        f"{len(results_data)} offres retournées (total Adzuna : {total_count})"
                    )

                    for item in results_data:
                        job = self._parse_item(item, country_code)
                        if job:
                            all_jobs.append(job)

                    if len(results_data) < results_per_page:
                        break  # Dernière page

                except _httpx.RequestError as exc:
                    logger.error(f"[adzuna] Erreur réseau page {page} : {exc}")
                    break
                except Exception as exc:
                    logger.error(f"[adzuna] Erreur inattendue page {page} : {exc}")
                    break

        logger.info(f"[adzuna] Total parsé : {len(all_jobs)} offres.")
        return all_jobs

    def _parse_item(self, item: dict, country_code: str) -> Optional[RawJob]:
        try:
            url = item.get("redirect_url") or ""
            if not url:
                return None

            created = item.get("created")
            published_at = None
            if created:
                try:
                    published_at = datetime.fromisoformat(created.replace("Z", "+00:00"))
                except (ValueError, TypeError):
                    pass

            sal_min = sal_max = None
            if item.get("salary_min"):
                try:    sal_min = float(item["salary_min"])
                except: pass
            if item.get("salary_max"):
                try:    sal_max = float(item["salary_max"])
                except: pass

            currency_map = {
                "ch": "CHF", "de": "EUR", "fr": "EUR", "at": "EUR",
                "be": "EUR", "nl": "EUR", "it": "EUR",
                "gb": "GBP", "us": "USD", "au": "AUD", "ca": "CAD",
                "sg": "SGD", "nz": "NZD",
            }
            currency = currency_map.get(country_code)

            location_data  = item.get("location", {})
            location_str   = location_data.get("display_name") or ""
            if not location_str:
                area = location_data.get("area", [])
                location_str = ", ".join(area) if area else ""

            company      = item.get("company", {}).get("display_name", "").strip()
            description  = item.get("description", "")
            contract_type = item.get("contract_type") or item.get("contract_time") or ""

            return RawJob(
                title        = item.get("title", "").strip(),
                company      = company,
                url          = url,
                source       = self.source_name,
                location     = location_str or None,
                description  = description or None,
                job_type     = contract_type or None,
                is_remote    = _remote_likely(item),
                salary_min   = sal_min,
                salary_max   = sal_max,
                salary_currency = currency,
                published_at = published_at,
            )
        except Exception as exc:
            logger.warning(f"[adzuna] Parsing item échoué : {exc}")
            return None


def _remote_likely(item: dict) -> bool:
    title = (item.get("title") or "").lower()
    desc  = (item.get("description") or "").lower()
    text  = f"{title} {desc}"
    return any(kw in text for kw in ["remote", "télétravail", "teletravail", "home office", "homeoffice", "hybrid"])
