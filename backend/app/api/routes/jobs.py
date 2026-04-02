"""
app/api/routes/jobs.py
CRUD + filtres sur les offres d'emploi.
"""
from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import asc, desc, select, or_

from app.api.deps import DBSession
from app.models.job import Job
from app.schemas.job import JobRead, JobSummary, JobStatusUpdate

router = APIRouter(prefix="/jobs", tags=["Jobs"])

VALID_STATUSES = {"new", "to_review", "to_apply", "applied", "interview", "rejected"}

# Colonnes autorisées pour le tri
SORT_COLUMNS = {
    "published_at": Job.published_at,
    "scraped_at":   Job.scraped_at,
    "ai_score":     Job.ai_score,
    "title":        Job.title,
    "company":      Job.company,
}


@router.get("", response_model=list[JobSummary])
async def list_jobs(
    db: DBSession,
    q:         str | None   = Query(None),
    source:    str | None   = None,
    status:    str | None   = None,
    is_remote: bool | None  = None,
    min_score: float | None = None,
    sort_by:   str          = Query("published_at", description="Colonne de tri"),
    sort_order: str         = Query("desc", description="asc | desc"),
    limit:     int          = Query(50, ge=1, le=200),
    offset:    int          = Query(0, ge=0),
) -> list[JobSummary]:

    col = SORT_COLUMNS.get(sort_by, Job.published_at)
    order_fn = desc if sort_order == "desc" else asc

    # Pour published_at, les valeurs NULL (non renseignées) vont en fin de liste
    if sort_by == "published_at":
        stmt = select(Job).order_by(
            desc(Job.published_at.isnot(None)),   # NULLs en dernier
            order_fn(col),
        )
    else:
        stmt = select(Job).order_by(order_fn(col))

    if q:
        stmt = stmt.where(or_(Job.title.ilike(f"%{q}%"), Job.company.ilike(f"%{q}%")))
    if source:
        stmt = stmt.where(Job.source == source)
    if status:
        stmt = stmt.where(Job.status == status)
    if is_remote is not None:
        stmt = stmt.where(Job.is_remote == is_remote)
    if min_score is not None:
        stmt = stmt.where(Job.ai_score >= min_score)

    stmt = stmt.limit(limit).offset(offset)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/top-matches", response_model=list[JobSummary])
async def top_matches(
    db: DBSession,
    limit:     int   = Query(10, ge=1, le=50),
    min_score: float = Query(80.0, ge=0, le=100),
) -> list[JobSummary]:
    stmt = (
        select(Job)
        .where(Job.ai_score >= min_score)
        .order_by(Job.ai_score.desc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/{job_id}", response_model=JobRead)
async def get_job(job_id: int, db: DBSession) -> JobRead:
    job = await db.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Offre {job_id} introuvable.")
    return job


@router.patch("/{job_id}/status", response_model=JobRead)
async def update_status(job_id: int, payload: JobStatusUpdate, db: DBSession) -> JobRead:
    if payload.status not in VALID_STATUSES:
        raise HTTPException(status_code=422, detail=f"Statut invalide. Valeurs : {VALID_STATUSES}")
    job = await db.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Offre {job_id} introuvable.")
    job.status = payload.status
    await db.commit()
    await db.refresh(job)
    return job


@router.delete("/{job_id}", status_code=204)
async def delete_job(job_id: int, db: DBSession) -> None:
    job = await db.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Offre {job_id} introuvable.")
    await db.delete(job)
    await db.commit()
