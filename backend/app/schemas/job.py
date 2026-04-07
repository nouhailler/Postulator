"""
app/schemas/job.py
"""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class JobBase(BaseModel):
    title:           str
    company:         str
    company_url:     Optional[str]   = None   # site web de l'entreprise
    location:        Optional[str]   = None
    job_type:        Optional[str]   = None
    is_remote:       bool            = False
    salary_min:      Optional[float] = None
    salary_max:      Optional[float] = None
    salary_currency: Optional[str]   = None
    url:             str
    source:          str
    published_at:    Optional[datetime] = None


class JobRead(JobBase):
    id:          int
    scraped_at:  datetime
    ai_score:    Optional[float] = None
    ai_summary:  Optional[str]   = None
    status:      str
    description: Optional[str]   = None

    model_config = {"from_attributes": True}


class JobSummary(BaseModel):
    """Version allégée pour les listes / tableau."""
    id:              int
    title:           str
    company:         str
    company_url:     Optional[str]   = None   # ← site web pour la colonne "Lien web"
    location:        Optional[str]   = None
    source:          str
    is_remote:       bool
    url:             str
    ai_score:        Optional[float] = None
    status:          str
    published_at:    Optional[datetime] = None
    scraped_at:      datetime
    salary_min:      Optional[float] = None
    salary_max:      Optional[float] = None
    salary_currency: Optional[str]   = None

    model_config = {"from_attributes": True}


class JobStatusUpdate(BaseModel):
    status: str


class JobFilters(BaseModel):
    q:         Optional[str]   = None
    source:    Optional[str]   = None
    status:    Optional[str]   = None
    is_remote: Optional[bool]  = None
    min_score: Optional[float] = None
    max_score: Optional[float] = None
    limit:     int             = 50
    offset:    int             = 0
