"""
app/schemas/dashboard.py
Schémas pour l'endpoint GET /api/dashboard/overview
"""
from pydantic import BaseModel


class VelocityPoint(BaseModel):
    day: str     # "LUN", "MAR"… ou "S-4"…
    jobs: int


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
    source_stats: list[SourceStat]
    recent_logs: list[LogEntry]
