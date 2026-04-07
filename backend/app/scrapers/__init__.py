"""
app/scrapers/__init__.py
Registre des scrapers disponibles.
Ajouter un nouveau scraper ici suffit à le rendre accessible au ScraperService.
"""
from app.scrapers.adzuna_scraper    import AdzunaScraper
from app.scrapers.jobsch_scraper    import JobschScraper
from app.scrapers.jobspy_scraper    import JobSpyScraper
from app.scrapers.jobteaser_scraper import JobTeaserScraper
from app.scrapers.jobup_scraper     import JobupScraper

# Registre : source_name → classe scraper
SCRAPER_REGISTRY: dict[str, type] = {
    # ── Sources internationales (jobspy) ──────────────────────────────────────
    "indeed":        JobSpyScraper,
    "linkedin":      JobSpyScraper,
    "glassdoor":     JobSpyScraper,
    "ziprecruiter":  JobSpyScraper,
    # ── API officielle ────────────────────────────────────────────────────────
    "adzuna":        AdzunaScraper,      # GB, US, DE, FR, AU, CA, NL, AT, BE, IT, PL, SG
    # ── Job boards suisses ────────────────────────────────────────────────────
    "jobup":         JobupScraper,       # jobup.ch — Michael Page, Adecco (CH)
    "jobsch":        JobschScraper,      # jobs.ch — Axel Springer (CH)
    "jobteaser":     JobTeaserScraper,   # jobteaser.com — CH + FR + DE + BE
}


def get_scraper(source: str):
    """Instancie le scraper adapté à la source demandée."""
    cls = SCRAPER_REGISTRY.get(source)
    if cls is None:
        raise ValueError(
            f"Scraper inconnu : '{source}'. "
            f"Disponibles : {list(SCRAPER_REGISTRY)}"
        )
    return cls(source=source)
