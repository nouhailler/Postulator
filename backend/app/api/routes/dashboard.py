"""
app/api/routes/dashboard.py
GET /api/dashboard/overview  →  KPIs + velocity + logs pour le Dashboard React.
"""
from datetime import datetime, timedelta

from fastapi import APIRouter
from sqlalchemy import func, select

from app.api.deps import DBSession
from app.models.job import Job
from app.models.scrape_log import ScrapeLog
from app.schemas.dashboard import (
    DashboardKpi,
    DashboardOverview,
    LogEntry,
    SourceStat,
    VelocityPoint,
)

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

DAY_NAMES = ["LUN", "MAR", "MER", "JEU", "VEN", "SAM", "DIM"]


@router.get("/overview", response_model=DashboardOverview)
async def get_overview(db: DBSession) -> DashboardOverview:
    """Agrégats pour le tableau de bord — appelé au montage du DashboardPage."""

    now = datetime.utcnow()

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
    ) or 1  # évite division par zéro
    delta_pct = round((jobs_this_week - jobs_last_week) / jobs_last_week * 100, 1)

    kpi = DashboardKpi(
        total_jobs=total_jobs,
        matches_above_80=matches_80,
        active_scrapers=5,          # TODO: intégrer Celery inspect
        in_progress=in_progress,
        total_jobs_delta_pct=delta_pct,
    )

    # ── Velocity 7 jours ─────────────────────────────────────────────────────
    velocity: list[VelocityPoint] = []
    for i in range(6, -1, -1):
        day_start = (now - timedelta(days=i)).replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day_start + timedelta(days=1)
        count = (
            await db.scalar(
                select(func.count(Job.id)).where(
                    Job.scraped_at >= day_start, Job.scraped_at < day_end
                )
            )
        ) or 0
        label = DAY_NAMES[day_start.weekday()]
        velocity.append(VelocityPoint(day=label, jobs=count))

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

    # ── Logs récents (derniers ScrapeLog + scores IA) ─────────────────────────
    recent_scrape_logs = (
        await db.execute(
            select(ScrapeLog)
            .order_by(ScrapeLog.started_at.desc())
            .limit(3)
        )
    ).scalars().all()

    logs: list[LogEntry] = []
    log_id = 1

    # Dernière offre à score élevé
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
        velocity_7d=velocity,
        source_stats=source_stats,
        recent_logs=logs[:5],
    )
