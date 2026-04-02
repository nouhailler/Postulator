"""
app/schemas/job.py
Schémas Pydantic pour les offres d'emploi (API I/O).
"""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, HttpUrl


# ── Lecture (réponse API) ─────────────────────────────────────────────────────

class JobBase(BaseModel):
    title: str
    company: str
    location: Optional[str] = None
    job_type: Optional[str] = None
    is_remote: bool = False
    salary_min: Optional[float] = None
    salary_max: Optional[float] = None
    salary_currency: Optional[str] = None
    url: str
    source: str
    published_at: Optional[datetime] = None


class JobRead(JobBase):
    id: int
    scraped_at: datetime
    ai_score: Optional[float] = None
    ai_summary: Optional[str] = None
    status: str
    description: Optional[str] = None

    model_config = {"from_attributes": True}


class JobSummary(BaseModel):
    """Version allégée pour les listes / dashboard."""
    id: int
    title: str
    company: str
    location: Optional[str] = None
    source: str
    is_remote: bool
    ai_score: Optional[float] = None
    status: str
    published_at: Optional[datetime] = None
    scraped_at: datetime

    model_config = {"from_attributes": True}


# ── Mise à jour (PATCH) ───────────────────────────────────────────────────────

class JobStatusUpdate(BaseModel):
    status: str   # new | to_review | to_apply | applied | interview | rejected


# ── Filtres de recherche ──────────────────────────────────────────────────────

class JobFilters(BaseModel):
    q: Optional[str] = None            # full-text search
    source: Optional[str] = None
    status: Optional[str] = None
    is_remote: Optional[bool] = None
    min_score: Optional[float] = None
    max_score: Optional[float] = None
    limit: int = 50
    offset: int = 0
