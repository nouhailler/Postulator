"""
app/schemas/match_history.py
"""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class MatchHistoryCreate(BaseModel):
    """Corps du POST /api/history"""
    cv_id: int
    job_id: int
    score: float
    strengths: list[str]
    gaps: list[str]
    recommendation: str
    ollama_model: Optional[str] = None


class MatchHistoryRead(BaseModel):
    id: int
    analyzed_at: datetime

    cv_id: Optional[int] = None
    cv_name: str
    cv_skills: Optional[str] = None     # JSON brut

    job_id: Optional[int] = None
    job_title: str
    job_company: str
    job_url: Optional[str] = None
    job_source: Optional[str] = None

    score: float
    strengths: Optional[str] = None     # JSON brut
    gaps: Optional[str] = None          # JSON brut
    recommendation: Optional[str] = None

    ollama_model: Optional[str] = None

    model_config = {"from_attributes": True}
