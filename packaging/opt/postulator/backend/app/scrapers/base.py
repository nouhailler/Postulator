"""
app/scrapers/base.py
"""
import asyncio
import random
import re
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

from loguru import logger

from app.core.config import get_settings
from app.scrapers.proxy_manager import proxy_manager

settings = get_settings()


# ── Moteur de filtrage booléen post-scraping ──────────────────────────────────
# Appliqué APRÈS le scraping pour garantir la cohérence sur toutes les sources,
# notamment celles qui ignorent les opérateurs (RemoteOK, jobs.ch, jobup.ch…).
#
# Syntaxe supportée :
#   AND   — les deux termes obligatoires       : Python AND senior
#   OR    — l'un ou l'autre                   : DevOps OR SRE
#   NOT   — exclure le terme                  : Python NOT junior
#   ( )   — groupement                        : (Python OR Java) AND NOT stage
#   " "   — phrase exacte                     : "machine learning" AND Python

def _tokenize_query(query: str) -> list[str]:
    """Découpe la requête en tokens : phrases entre guillemets, opérateurs, parenthèses, mots."""
    return re.findall(r'"[^"]*"|\bAND\b|\bOR\b|\bNOT\b|[()]|\S+', query, re.IGNORECASE)


def _parse_or(tokens: list[str], pos: int, text: str) -> tuple[bool, int]:
    left, pos = _parse_and(tokens, pos, text)
    while pos < len(tokens) and tokens[pos].upper() == "OR":
        pos += 1
        right, pos = _parse_and(tokens, pos, text)
        left = left or right
    return left, pos


def _parse_and(tokens: list[str], pos: int, text: str) -> tuple[bool, int]:
    left, pos = _parse_not(tokens, pos, text)
    while pos < len(tokens) and tokens[pos].upper() == "AND":
        pos += 1
        right, pos = _parse_not(tokens, pos, text)
        left = left and right
    return left, pos


def _parse_not(tokens: list[str], pos: int, text: str) -> tuple[bool, int]:
    if pos < len(tokens) and tokens[pos].upper() == "NOT":
        pos += 1
        val, pos = _parse_primary(tokens, pos, text)
        return not val, pos
    return _parse_primary(tokens, pos, text)


def _parse_primary(tokens: list[str], pos: int, text: str) -> tuple[bool, int]:
    if pos >= len(tokens):
        return True, pos
    tok = tokens[pos]
    if tok == "(":
        pos += 1
        val, pos = _parse_or(tokens, pos, text)
        if pos < len(tokens) and tokens[pos] == ")":
            pos += 1
        return val, pos
    # Phrase entre guillemets → correspondance exacte
    if tok.startswith('"') and tok.endswith('"'):
        phrase = tok[1:-1].lower()
        return (phrase in text), pos + 1
    # Opérateur orphelin ou parenthèse fermante non consommée → ne filtre pas
    if tok.upper() in ("AND", "OR", "NOT", ")"):
        return True, pos
    # Mot simple → présence dans le texte (insensible à la casse)
    return (tok.lower() in text), pos + 1


def _match_keyword_query(query: str, text: str) -> bool:
    """Évalue une requête booléenne contre un texte. Retourne True si l'offre correspond."""
    text = text.lower()
    tokens = _tokenize_query(query)
    if not tokens:
        return True
    try:
        result, _ = _parse_or(tokens, 0, text)
        return result
    except Exception:
        return True  # En cas d'erreur de parsing → ne pas filtrer


def _keyword_matches(keywords: str, job: "RawJob") -> bool:
    """Applique le filtre booléen sur le titre + la description d'une offre."""
    if not keywords or not keywords.strip():
        return True
    text = f"{job.title or ''} {job.description or ''}"
    return _match_keyword_query(keywords, text)


# Mots-clés indiquant un stage / internship dans le titre
_INTERNSHIP_TITLE_KEYWORDS = (
    'intern', 'internship', 'stage', 'stagiaire', 'apprenti', 'apprentice',
    'trainee', 'werkstudent', 'praktikant', 'praktikum',
)

def _is_internship(job: "RawJob") -> bool:
    """Détecte si une offre est un stage/internship via son type ou son titre."""
    if job.job_type and job.job_type.lower() in ('internship', 'stage', 'intern'):
        return True
    title_lower = (job.title or '').lower()
    return any(kw in title_lower for kw in _INTERNSHIP_TITLE_KEYWORDS)


@dataclass
class RawJob:
    """Représentation intermédiaire d'une offre avant insertion en BDD."""
    title:           str
    company:         str
    url:             str
    source:          str
    location:        Optional[str]   = None
    company_url:     Optional[str]   = None   # ← site web de l'entreprise (depuis jobspy)
    job_type:        Optional[str]   = None
    is_remote:       bool            = False
    salary_min:      Optional[float] = None
    salary_max:      Optional[float] = None
    salary_currency: Optional[str]   = None
    description:     Optional[str]   = None
    published_at:    Optional[datetime] = None
    extra:           dict            = field(default_factory=dict)


class BaseScraper(ABC):
    source_name: str = "unknown"

    def __init__(self) -> None:
        self.proxy = proxy_manager.get_random()

    async def run(
        self,
        keywords: str,
        location: Optional[str]    = None,
        results:  int              = 50,
        hours_old: Optional[int]   = None,
        remote_only: bool          = False,
        job_types: Optional[list[str]] = None,
        exclude_internships: bool  = False,
    ) -> list[RawJob]:
        delay = random.uniform(settings.scraper_delay_min, settings.scraper_delay_max)
        logger.debug(f"[{self.source_name}] Délai anti-blocage : {delay:.1f}s")
        await asyncio.sleep(delay)
        try:
            jobs = await self._fetch(
                keywords=keywords,
                location=location,
                results=results,
                hours_old=hours_old,
                remote_only=remote_only,
                job_types=job_types or [],
            )
            logger.info(f"[{self.source_name}] {len(jobs)} offres récupérées.")
            # Filtre booléen post-scraping (cohérence sur toutes les sources)
            if keywords and keywords.strip():
                before = len(jobs)
                jobs = [j for j in jobs if _keyword_matches(keywords, j)]
                if len(jobs) < before:
                    logger.info(
                        f"[{self.source_name}] Filtre booléen : {before} → {len(jobs)} offres "
                        f"(requête : {keywords!r})"
                    )
            # Filtre stages/internships
            if exclude_internships:
                before = len(jobs)
                jobs = [j for j in jobs if not _is_internship(j)]
                if len(jobs) < before:
                    logger.info(
                        f"[{self.source_name}] Exclusion stages : {before} → {len(jobs)} offres"
                    )
            return jobs
        except Exception as exc:
            logger.error(f"[{self.source_name}] Erreur scraping : {exc}")
            if self.proxy:
                proxy_manager.remove(self.proxy)
            raise

    @abstractmethod
    async def _fetch(
        self,
        keywords: str,
        location: Optional[str],
        results: int,
        hours_old: Optional[int],
        remote_only: bool,
        job_types: list[str],
    ) -> list[RawJob]:
        ...
