"""
app/api/routes/jobs.py
CRUD + filtres + purge sur les offres d'emploi.

Routes :
  GET    /api/jobs              → liste paginée avec filtres + tri
  GET    /api/jobs/top-matches  → offres triées par score IA
  GET    /api/jobs/{id}         → détail complet
  PATCH  /api/jobs/{id}/status  → mise à jour statut Kanban
  DELETE /api/jobs/{id}         → suppression d'une offre
  DELETE /api/jobs              → purge : supprime TOUTES les offres (ou garde N récentes)
"""
from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import asc, desc, select, or_, delete, func

from app.api.deps import DBSession
from app.models.job import Job
from app.schemas.job import JobRead, JobSummary, JobStatusUpdate

router = APIRouter(prefix="/jobs", tags=["Jobs"])

VALID_STATUSES = {"new", "to_review", "to_apply", "applied", "interview", "rejected"}

SORT_COLUMNS = {
    "published_at": Job.published_at,
    "scraped_at":   Job.scraped_at,
    "ai_score":     Job.ai_score,
    "title":        Job.title,
    "company":      Job.company,
}


@router.get("", response_model=list[JobSummary])
async def list_jobs(
    db:         DBSession,
    q:          str | None   = Query(None),
    source:     str | None   = None,
    status:     str | None   = None,
    is_remote:  bool | None  = None,
    min_score:  float | None = None,
    sort_by:    str          = Query("scraped_at", description="Colonne de tri"),
    sort_order: str          = Query("desc", description="asc | desc"),
    limit:      int          = Query(50, ge=1, le=200),
    offset:     int          = Query(0, ge=0),
) -> list[JobSummary]:
    """
    Liste les offres.
    Tri par défaut : scraped_at DESC (les plus récemment scrapées en tête)
    — garantit que les nouvelles offres après un scraping apparaissent en premier.
    """
    col      = SORT_COLUMNS.get(sort_by, Job.scraped_at)
    order_fn = desc if sort_order == "desc" else asc

    if sort_by == "published_at":
        # NULLs en dernier pour published_at
        stmt = select(Job).order_by(
            desc(Job.published_at.isnot(None)),
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
    db:        DBSession,
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
    """Supprime une offre individuelle."""
    job = await db.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Offre {job_id} introuvable.")
    await db.delete(job)
    await db.commit()


@router.delete("", status_code=200)
async def purge_jobs(
    db:          DBSession,
    keep_recent: int  = Query(0, ge=0, description="Nombre d'offres récentes à conserver (0 = tout supprimer)"),
    keep_selected: bool = Query(True,  description="Garder les offres avec statut != 'new' (celles que l'utilisateur a sélectionnées)"),
) -> dict:
    """
    Purge la table jobs.

    Comportement :
    - Si keep_selected=True (défaut) : les offres avec un statut autre que 'new'
      (to_apply, applied, interview, rejected, to_review) sont TOUJOURS conservées.
    - keep_recent=20 : conserve les 20 offres les plus récentes parmi les 'new'.
    - keep_recent=0 : supprime toutes les offres 'new'.

    Retourne le nombre d'offres supprimées.
    """
    # 1. Compter le total avant
    total_before = await db.scalar(select(func.count()).select_from(Job))

    # 2. Identifier les IDs à conserver
    keep_ids: set[int] = set()

    # Garder les offres sélectionnées (statut != 'new')
    if keep_selected:
        result = await db.execute(
            select(Job.id).where(Job.status != "new")
        )
        keep_ids.update(row[0] for row in result.fetchall())

    # Garder les N plus récentes parmi les offres 'new'
    if keep_recent > 0:
        result = await db.execute(
            select(Job.id)
            .where(Job.status == "new")
            .order_by(Job.scraped_at.desc())
            .limit(keep_recent)
        )
        keep_ids.update(row[0] for row in result.fetchall())

    # 3. Supprimer tout ce qui n'est pas dans keep_ids
    if keep_ids:
        stmt = delete(Job).where(Job.id.notin_(keep_ids))
    else:
        stmt = delete(Job)

    await db.execute(stmt)
    await db.commit()

    # 4. Compter après
    total_after = await db.scalar(select(func.count()).select_from(Job))
    deleted     = (total_before or 0) - (total_after or 0)

    return {
        "deleted":   deleted,
        "remaining": total_after,
        "kept_selected": keep_selected,
        "kept_recent":   keep_recent,
    }
