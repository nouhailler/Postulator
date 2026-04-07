"""
app/scrapers/jobspy_scraper.py
Scraper basé sur python-jobspy.

Points clés pour le scraping international :
- `country_indeed` dirige vers le bon Indeed national (ch.indeed.com, fr.indeed.com…)
- Sans ce paramètre, jobspy scrape indeed.com (US) → 0 résultats hors US
- La localisation doit être dans la langue/format du pays cible
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

# ── Mapping pays → code country_indeed pour jobspy ───────────────────────────
INDEED_COUNTRY_MAP = {
    "France":               "france",
    "Switzerland":          "switzerland",
    "Germany":              "germany",
    "Belgium":              "belgium",
    "Spain":                "spain",
    "Netherlands":          "netherlands",
    "Italy":                "italy",
    "Portugal":             "portugal",
    "Sweden":               "sweden",
    "Denmark":              "denmark",
    "Norway":               "norway",
    "Finland":              "finland",
    "Austria":              "austria",
    "Poland":               "poland",
    "Czech Republic":       "czech republic",
    "Ireland":              "ireland",
    "United Kingdom":       "uk",
    "Luxembourg":           "luxembourg",
    "Canada":               "canada",
    "Australia":            "australia",
    "United States":        "usa",
    "Singapore":            "singapore",
    "Japan":                "japan",
    "United Arab Emirates": "uae",
    "":                     "usa",
}


def _extract_country_from_location(location: Optional[str]) -> str:
    if not location:
        return "usa"
    parts = [p.strip() for p in location.split(",")]
    country_name = parts[-1]
    return INDEED_COUNTRY_MAP.get(country_name, "usa")


def _strip_country_from_location(location: Optional[str]) -> str:
    if not location:
        return ""
    parts = [p.strip() for p in location.split(",")]
    if parts[-1] in INDEED_COUNTRY_MAP:
        return ", ".join(parts[:-1])
    return location


class JobSpyScraper(BaseScraper):

    def __init__(self, source: str = "indeed") -> None:
        super().__init__()
        if source not in SUPPORTED_SOURCES:
            raise ValueError(f"Source '{source}' non supportée. Disponibles : {list(SUPPORTED_SOURCES)}")
        self.source_name = source
        self._jobspy_site = SUPPORTED_SOURCES[source]

    async def _fetch(self, keywords, location, results, hours_old, remote_only, job_types):
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None,
            lambda: self._sync_fetch(keywords, location, results, hours_old, remote_only, job_types),
        )

    def _sync_fetch(self, keywords, location, results, hours_old, remote_only, job_types):
        try:
            from jobspy import scrape_jobs
        except ImportError:
            logger.error("python-jobspy non installé")
            return []

        type_map = {"fulltime": "fulltime", "parttime": "parttime",
                    "contract": "contract", "internship": "internship"}
        jobspy_types = [type_map[jt] for jt in job_types if jt in type_map]
        is_remote_bool: bool = bool(remote_only)
        proxy = self.proxy or None

        # ── Préparer localisation Indeed ─────────────────────────────────────
        if self.source_name == "indeed":
            country_indeed = _extract_country_from_location(location)
            location_clean = _strip_country_from_location(location)
        else:
            country_indeed = None
            location_clean = location or ""

        logger.info(
            f"[{self.source_name}] scrape_jobs("
            f"search_term={keywords!r}, location={location_clean!r}, "
            f"country_indeed={country_indeed!r}, results_wanted={results}, "
            f"hours_old={hours_old}, is_remote={is_remote_bool}, proxy={'oui' if proxy else 'non'})"
        )

        # ── Tentative 1 : avec country_indeed ────────────────────────────────
        df = self._try_scrape(
            scrape_jobs=scrape_jobs,
            keywords=keywords,
            location=location_clean,
            results=results,
            hours_old=hours_old,
            is_remote=is_remote_bool,
            job_types=jobspy_types,
            proxy=proxy,
            country_indeed=country_indeed,
        )

        # ── Tentative 2 : sans country_indeed si échec (compatibilité versions) ──
        if (df is None or df.empty) and country_indeed and country_indeed != "usa":
            logger.warning(
                f"[{self.source_name}] 0 résultat avec country_indeed={country_indeed!r}. "
                f"Nouvelle tentative sans country_indeed (location complète)…"
            )
            df = self._try_scrape(
                scrape_jobs=scrape_jobs,
                keywords=keywords,
                location=location or "",   # ← localisation complète cette fois
                results=results,
                hours_old=hours_old,
                is_remote=is_remote_bool,
                job_types=jobspy_types,
                proxy=proxy,
                country_indeed=None,       # ← sans country_indeed
            )

        if df is None or df.empty:
            logger.info(f"[{self.source_name}] DataFrame vide — 0 offres.")
            return []

        logger.debug(f"[{self.source_name}] Colonnes DataFrame : {list(df.columns)}")
        return self._parse_dataframe(df)

    def _try_scrape(self, scrape_jobs, keywords, location, results, hours_old,
                    is_remote, job_types, proxy, country_indeed):
        """Lance scrape_jobs avec gestion d'erreur. Retourne None si échec."""
        kwargs = dict(
            site_name=[self._jobspy_site],
            search_term=keywords,
            location=location,
            results_wanted=results,
            is_remote=is_remote,
            job_type=job_types[0] if job_types else None,
            proxy=proxy,
            linkedin_fetch_description=(self.source_name == "linkedin"),
            verbose=0,
        )
        if country_indeed:
            kwargs["country_indeed"] = country_indeed
        # hours_old : on ne l'applique que si <= 720h (30 jours max)
        if hours_old is not None and hours_old <= 720:
            kwargs["hours_old"] = hours_old

        try:
            return scrape_jobs(**kwargs)
        except TypeError as exc:
            # country_indeed non supporté par cette version de jobspy
            if "country_indeed" in str(exc) and "country_indeed" in kwargs:
                logger.warning(f"[{self.source_name}] country_indeed non supporté par cette version de jobspy : {exc}")
                del kwargs["country_indeed"]
                try:
                    return scrape_jobs(**kwargs)
                except Exception as exc2:
                    logger.error(f"[{self.source_name}] jobspy error (fallback) : {exc2}")
                    return None
            logger.error(f"[{self.source_name}] jobspy TypeError : {exc}")
            return None
        except Exception as exc:
            logger.error(f"[{self.source_name}] jobspy error : {exc}")
            return None

    def _parse_dataframe(self, df):
        """Convertit le DataFrame jobspy en liste de RawJob."""
        jobs = []
        for _, row in df.iterrows():
            try:
                pub = row.get("date_posted")
                if pub is not None and not isinstance(pub, datetime):
                    try:
                        pub = datetime.fromisoformat(str(pub))
                    except (ValueError, TypeError):
                        pub = None

                sal_min  = float(row["min_amount"]) if row.get("min_amount") else None
                sal_max  = float(row["max_amount"]) if row.get("max_amount") else None
                currency = str(row["currency"])     if row.get("currency")   else None

                url = str(row.get("job_url") or row.get("job_url_direct") or "").strip()
                if not url:
                    continue

                company_url = _first_valid(row, [
                    "company_url", "company_url_direct",
                    "linkedin_company_url", "company_website",
                ])

                jobs.append(RawJob(
                    title=str(row.get("title")   or "").strip(),
                    company=str(row.get("company") or "").strip(),
                    url=url,
                    source=self.source_name,
                    location=str(row.get("location") or "").strip() or None,
                    company_url=company_url,
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

        logger.info(f"[{self.source_name}] {len(jobs)} offres parsées.")
        return jobs


def _first_valid(row, keys):
    for key in keys:
        val = row.get(key)
        if val and str(val).strip() not in ("", "nan", "None", "NaN"):
            v = str(val).strip()
            if v.startswith("http"):
                return v
    return None
