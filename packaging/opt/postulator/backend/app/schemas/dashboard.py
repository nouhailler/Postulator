"""
app/schemas/dashboard.py
Schémas pour l'endpoint GET /api/dashboard/overview
"""
from pydantic import BaseModel


class VelocityPoint(BaseModel):
    day: str        # "LUN", "MAR"… ou "18/04"…
    date: str = "" # ISO "2026-04-18" — utilisé pour le tooltip riche
    jobs: int


class ScoringPoint(BaseModel):
    day: str
    date: str = ""
    count: int          # offres avec ai_score >= 80
    avg_score: float    # score moyen de ces offres (0 si count=0)


class SourceStat(BaseModel):
    source: str
    count: int
    pct: float


class LogEntry(BaseModel):
    id: int
    type: str        # ai | scraper | system
    message: str
    meta: str


class DashboardKpi(BaseModel):
    total_jobs: int
    matches_above_80: int
    active_scrapers: int
    in_progress: int
    total_jobs_delta_pct: float      # variation vs cycle précédent


class DashboardOverview(BaseModel):
    kpi: DashboardKpi
    velocity_7d: list[VelocityPoint]
    velocity_30d: list[VelocityPoint]
    scoring_7d: list[ScoringPoint]
    scoring_30d: list[ScoringPoint]
    source_stats: list[SourceStat]
    recent_logs: list[LogEntry]
