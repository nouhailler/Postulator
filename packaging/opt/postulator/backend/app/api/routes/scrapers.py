"""
app/api/routes/scrapers.py
Lancement et monitoring des scrapers.
"""
from fastapi import APIRouter, HTTPException, Query

from app.api.deps import DBSession
from app.schemas.scraper import (
    ScrapeLogRead, ScrapeRequest, ScrapeStatus, ScrapeWithProxiesRequest
)
from app.scrapers import SCRAPER_REGISTRY

router = APIRouter(prefix="/scrapers", tags=["Scrapers"])


@router.get("/sources")
async def list_sources() -> list[str]:
    return list(SCRAPER_REGISTRY.keys())


@router.post("/run", response_model=ScrapeStatus, status_code=202)
async def run_scraper(payload: ScrapeRequest) -> ScrapeStatus:
    """Lance un scraping standard en arrière-plan via Celery."""
    try:
        from app.workers.scrape_task import run_scrape
        task = run_scrape.delay(
            keywords=payload.keywords,
            sources=payload.sources,
            location=payload.location,
            results_per_source=payload.results_per_source,
            hours_old=payload.hours_old,
            remote_only=payload.remote_only,
            job_types=payload.job_types,
        )
        return ScrapeStatus(
            task_id=task.id,
            status="queued",
            message=f"Scraping lancé sur {len(payload.sources)} source(s) · mots-clés : « {payload.keywords} »",
        )
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Worker Celery indisponible : {exc}")


@router.post("/run-with-proxies", response_model=ScrapeStatus, status_code=202)
async def run_scraper_with_proxies(payload: ScrapeWithProxiesRequest) -> ScrapeStatus:
    """
    Lance un scraping avec rotation de proxies résidentiels.
    Les proxies sont au format IP:PORT:USERNAME:PASSWORD (un par ligne).
    """
    from app.scrapers.proxy_manager import ResidentialProxyManager

    # Valider les proxies avant de lancer la tâche
    valid_count, errors = ResidentialProxyManager.validate_lines(payload.proxies)
    if valid_count == 0:
        raise HTTPException(
            status_code=422,
            detail=f"Aucun proxy valide. Erreurs : {errors[:3]}"
        )

    try:
        from app.workers.scrape_task import run_scrape_with_proxies
        task = run_scrape_with_proxies.delay(
            keywords=payload.keywords,
            sources=payload.sources,
            proxy_lines=payload.proxies,
            location=payload.location,
            results_per_source=payload.results_per_source,
            hours_old=payload.hours_old,
            remote_only=payload.remote_only,
            job_types=payload.job_types,
        )
        return ScrapeStatus(
            task_id=task.id,
            status="queued",
            message=(
                f"Scraping avec {valid_count} proxy(ies) résidentiel(s) lancé sur "
                f"{len(payload.sources)} source(s) · « {payload.keywords} »"
            ),
        )
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Worker Celery indisponible : {exc}")


@router.get("/status/{task_id}", response_model=ScrapeStatus)
async def task_status(task_id: str) -> ScrapeStatus:
    """Polling du statut d'une tâche Celery."""
    try:
        from celery.result import AsyncResult
        from app.workers.celery_app import celery_app

        result = AsyncResult(task_id, app=celery_app)
        state_map = {
            "PENDING": "queued",
            "STARTED": "running",
            "SUCCESS": "success",
            "FAILURE": "error",
            "RETRY":   "running",
        }
        status = state_map.get(result.state, result.state.lower())
        msg = str(result.info) if result.info else status
        return ScrapeStatus(task_id=task_id, status=status, message=msg)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/logs", response_model=list[ScrapeLogRead])
async def scrape_logs(
    db: DBSession,
    source: str | None = None,
    limit: int = Query(50, ge=1, le=200),
) -> list[ScrapeLogRead]:
    """Historique des sessions de scraping."""
    from sqlalchemy import select
    from app.models.scrape_log import ScrapeLog

    stmt = select(ScrapeLog).order_by(ScrapeLog.started_at.desc()).limit(limit)
    if source:
        stmt = stmt.where(ScrapeLog.source == source)
    result = await db.execute(stmt)
    return result.scalars().all()
