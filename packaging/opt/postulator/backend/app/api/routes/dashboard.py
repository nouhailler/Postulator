"""
app/api/routes/dashboard.py
GET /api/dashboard/overview  →  KPIs + velocity + logs pour le Dashboard React.
GET /api/dashboard/chart     →  données de graphique pour navigation (offset)
"""
from datetime import datetime, timedelta

from fastapi import APIRouter, Query
from sqlalchemy import func, select

from app.api.deps import DBSession
from app.models.job import Job
from app.models.scrape_log import ScrapeLog
from app.schemas.dashboard import (
    DashboardKpi,
    DashboardOverview,
    LogEntry,
    ScoringPoint,
    SourceStat,
    VelocityPoint,
)

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

DAY_NAMES = ["LUN", "MAR", "MER", "JEU", "VEN", "SAM", "DIM"]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _label_7d(d: datetime) -> str:
    return DAY_NAMES[d.weekday()]


def _label_30d(d: datetime) -> str:
    return d.strftime("%d/%m")


async def _velocity_range(
    db: DBSession,
    start: datetime,
    end: datetime,
    label_fn,
) -> list[VelocityPoint]:
    """Calcule le nombre d'offres scrapées par jour dans [start, end)."""
    points: list[VelocityPoint] = []
    current = start
    while current < end:
        next_day = current + timedelta(days=1)
        count = (
            await db.scalar(
                select(func.count(Job.id)).where(
                    Job.scraped_at >= current, Job.scraped_at < next_day
                )
            )
        ) or 0
        points.append(VelocityPoint(
            day=label_fn(current),
            date=current.strftime("%Y-%m-%d"),
            jobs=count,
        ))
        current = next_day
    return points


async def _scoring_range(
    db: DBSession,
    start: datetime,
    end: datetime,
    label_fn,
) -> list[ScoringPoint]:
    """Calcule le nombre d'offres avec ai_score >= 80 par jour dans [start, end)."""
    points: list[ScoringPoint] = []
    current = start
    while current < end:
        next_day = current + timedelta(days=1)
        count = (
            await db.scalar(
                select(func.count(Job.id)).where(
                    Job.scraped_at >= current,
                    Job.scraped_at < next_day,
                    Job.ai_score >= 80,
                )
            )
        ) or 0
        avg_val = await db.scalar(
            select(func.avg(Job.ai_score)).where(
                Job.scraped_at >= current,
                Job.scraped_at < next_day,
                Job.ai_score >= 80,
            )
        )
        avg = round(float(avg_val), 1) if avg_val else 0.0
        points.append(ScoringPoint(
            day=label_fn(current),
            date=current.strftime("%Y-%m-%d"),
            count=count,
            avg_score=avg,
        ))
        current = next_day
    return points


# ── Overview ──────────────────────────────────────────────────────────────────

@router.get("/overview", response_model=DashboardOverview)
async def get_overview(db: DBSession) -> DashboardOverview:
    """Agrégats pour le tableau de bord — appelé au montage du DashboardPage."""

    now = datetime.utcnow()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    # ── KPIs ─────────────────────────────────────────────────────────────────
    total_jobs: int = await db.scalar(select(func.count(Job.id))) or 0
    matches_80: int = (
        await db.scalar(select(func.count(Job.id)).where(Job.ai_score >= 80))
    ) or 0
    in_progress: int = (
        await db.scalar(
            select(func.count(Job.id)).where(Job.status.in_(["applied", "interview"]))
        )
    ) or 0

    # Variation vs semaine précédente
    week_ago = now - timedelta(days=7)
    two_weeks_ago = now - timedelta(days=14)
    jobs_this_week = (
        await db.scalar(
            select(func.count(Job.id)).where(Job.scraped_at >= week_ago)
        )
    ) or 0
    jobs_last_week = (
        await db.scalar(
            select(func.count(Job.id)).where(
                Job.scraped_at >= two_weeks_ago, Job.scraped_at < week_ago
            )
        )
    ) or 1
    delta_pct = round((jobs_this_week - jobs_last_week) / jobs_last_week * 100, 1)

    kpi = DashboardKpi(
        total_jobs=total_jobs,
        matches_above_80=matches_80,
        active_scrapers=5,
        in_progress=in_progress,
        total_jobs_delta_pct=delta_pct,
    )

    # ── Velocity 7 jours ─────────────────────────────────────────────────────
    start_7d = today_start - timedelta(days=6)
    end_7d   = today_start + timedelta(days=1)
    velocity_7d = await _velocity_range(db, start_7d, end_7d, _label_7d)

    # ── Velocity 30 jours ────────────────────────────────────────────────────
    start_30d = today_start - timedelta(days=29)
    velocity_30d = await _velocity_range(db, start_30d, end_7d, _label_30d)

    # ── Scoring 7 jours ──────────────────────────────────────────────────────
    scoring_7d = await _scoring_range(db, start_7d, end_7d, _label_7d)

    # ── Scoring 30 jours ─────────────────────────────────────────────────────
    scoring_30d = await _scoring_range(db, start_30d, end_7d, _label_30d)

    # ── Stats par source ─────────────────────────────────────────────────────
    rows = (
        await db.execute(
            select(Job.source, func.count(Job.id).label("cnt"))
            .group_by(Job.source)
            .order_by(func.count(Job.id).desc())
        )
    ).all()
    total_for_pct = total_jobs or 1
    source_stats = [
        SourceStat(
            source=r.source,
            count=r.cnt,
            pct=round(r.cnt / total_for_pct * 100, 1),
        )
        for r in rows
    ]

    # ── Logs récents ─────────────────────────────────────────────────────────
    recent_scrape_logs = (
        await db.execute(
            select(ScrapeLog)
            .order_by(ScrapeLog.started_at.desc())
            .limit(3)
        )
    ).scalars().all()

    logs: list[LogEntry] = []
    log_id = 1

    top_job = await db.scalar(
        select(Job)
        .where(Job.ai_score.isnot(None))
        .order_by(Job.ai_score.desc())
    )
    if top_job:
        logs.append(LogEntry(
            id=log_id,
            type="ai",
            message=f"Match trouvé via Ollama : {top_job.title}",
            meta=f"MAINTENANT · SCORE: {int(top_job.ai_score or 0)}%",
        ))
        log_id += 1

    for sl in recent_scrape_logs:
        elapsed = now - sl.started_at
        mins = int(elapsed.total_seconds() / 60)
        ago = f"{mins}M" if mins < 60 else f"{mins // 60}H"
        logs.append(LogEntry(
            id=log_id,
            type="scraper",
            message=f"Scraper terminé : {sl.source.capitalize()}",
            meta=f"{ago} · {sl.jobs_new} NOUVELLES OFFRES",
        ))
        log_id += 1

    return DashboardOverview(
        kpi=kpi,
        velocity_7d=velocity_7d,
        velocity_30d=velocity_30d,
        scoring_7d=scoring_7d,
        scoring_30d=scoring_30d,
        source_stats=source_stats,
        recent_logs=logs[:5],
    )


# ── Chart (navigation offset) ─────────────────────────────────────────────────

@router.get("/chart")
async def get_chart_data(
    db:     DBSession,
    type:   str = Query("velocity", description="velocity | scoring"),
    days:   int = Query(7, ge=1, le=30),
    offset: int = Query(0, ge=0, le=52, description="0 = période courante, 1 = période précédente…"),
) -> dict:
    """
    Retourne les données de graphique pour une fenêtre temporelle décalée.
    offset=0 = période actuelle, offset=1 = période précédente, etc.
    Utilisé par les contrôles de navigation des graphiques.
    """
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    end_date   = today_start + timedelta(days=1) - timedelta(days=offset * days)
    start_date = end_date - timedelta(days=days)

    label_fn = _label_7d if days <= 7 else _label_30d

    if type == "scoring":
        points = await _scoring_range(db, start_date, end_date, label_fn)
        return {"points": [p.model_dump() for p in points]}
    else:
        points = await _velocity_range(db, start_date, end_date, label_fn)
        return {"points": [p.model_dump() for p in points]}
