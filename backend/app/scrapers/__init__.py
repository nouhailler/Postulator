"""
app/scrapers/__init__.py
Registre des scrapers disponibles.
Ajouter un nouveau scraper ici suffit à le rendre accessible au ScraperService.
"""
from app.scrapers.jobspy_scraper import JobSpyScraper

# Registre : source_name → classe scraper
SCRAPER_REGISTRY: dict[str, type] = {
    "indeed":      JobSpyScraper,
    "linkedin":    JobSpyScraper,
    "glassdoor":   JobSpyScraper,
    "ziprecruiter": JobSpyScraper,
    "google":      JobSpyScraper,
    # "wellfound":  WellfoundScraper,   ← à ajouter quand implémenté
    # "activitypub": ActivityPubScraper,
}


def get_scraper(source: str):
    """Instancie le scraper adapté à la source demandée."""
    cls = SCRAPER_REGISTRY.get(source)
    if cls is None:
        raise ValueError(f"Scraper inconnu : '{source}'. Disponibles : {list(SCRAPER_REGISTRY)}")
    return cls(source=source)
