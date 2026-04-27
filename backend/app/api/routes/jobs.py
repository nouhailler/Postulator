"""
app/api/routes/jobs.py
CRUD + filtres + purge sur les offres d'emploi.

Routes :
  GET    /api/jobs              → liste paginée avec filtres + tri
  GET    /api/jobs/top-matches  → offres triées par score IA
  GET    /api/jobs/{id}         → détail complet
  PATCH  /api/jobs/{id}/status  → mise à jour statut Kanban
  DELETE /api/jobs/{id}         → suppression d'une offre
  DELETE /api/jobs              → purge : supprime les offres selon critères
  DELETE /api/jobs/by-criteria  → suppression en masse par critères (score, date, source)
"""
from datetime import datetime
from typing import Optional

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
    location:   str | None   = None,
    is_remote:  bool | None  = None,
    min_score:  float | None = None,
    sort_by:    str          = Query("scraped_at", description="Colonne de tri"),
    sort_order: str          = Query("desc", description="asc | desc"),
    limit:      int          = Query(50, ge=1, le=200),
    offset:     int          = Query(0, ge=0),
) -> list[JobSummary]:
    col      = SORT_COLUMNS.get(sort_by, Job.scraped_at)
    order_fn = desc if sort_order == "desc" else asc

    if sort_by == "published_at":
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
    if location:
        stmt = stmt.where(Job.location.ilike(f"%{location}%"))
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
    min_score: float = Query(60.0, ge=0, le=100),
    order_by:  str   = Query("date", description="date | score"),
) -> list[JobSummary]:
    stmt = select(Job).where(Job.ai_score >= min_score)

    if order_by == "score":
        stmt = stmt.order_by(desc(Job.ai_score))
    else:  # "date" (default)
        stmt = stmt.order_by(desc(Job.scraped_at), desc(Job.ai_score))

    stmt = stmt.limit(limit)
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


@router.delete("/by-criteria", status_code=200)
async def purge_jobs_by_criteria(
    db:            DBSession,
    max_score:     Optional[float] = Query(None, description="Supprimer les offres dont le score IA est INFÉRIEUR à ce seuil (%)"),
    min_score:     Optional[float] = Query(None, description="Supprimer les offres dont le score IA est SUPÉRIEUR à ce seuil (%)"),
    before_date:   Optional[str]   = Query(None, description="Supprimer les offres scrapées AVANT cette date (YYYY-MM-DD)"),
    after_date:    Optional[str]   = Query(None, description="Supprimer les offres scrapées APRÈS cette date (YYYY-MM-DD)"),
    source:        Optional[str]   = Query(None, description="Supprimer uniquement les offres de cette source"),
    status:        Optional[str]   = Query(None, description="Supprimer uniquement les offres avec ce statut"),
    no_score:      bool            = Query(False, description="Supprimer les offres sans score IA"),
    keep_selected: bool            = Query(True,  description="Protéger les offres dont le statut n'est pas 'new'"),
    dry_run:       bool            = Query(False,  description="Simulation : renvoie le nombre qui serait supprimé sans agir"),
) -> dict:
    """
    Suppression en masse d'offres selon des critères combinés.

    Critères disponibles (cumulables) :
    - max_score    : supprime les offres avec ai_score < max_score (et ai_score non nul)
    - min_score    : supprime les offres avec ai_score > min_score (et ai_score non nul)
    - before_date  : supprime les offres scrapées avant cette date
    - after_date   : supprime les offres scrapées après cette date
    - source       : limite la suppression à une source spécifique
    - status       : limite la suppression à un statut spécifique
    - no_score     : supprime les offres sans score IA (ai_score IS NULL)
    - keep_selected: protège les offres dont le statut != 'new' (défaut : true)

    Au moins un critère est requis.
    dry_run=true permet de simuler sans supprimer.
    """
    if (max_score is None and min_score is None and before_date is None
            and after_date is None and source is None and status is None
            and not no_score):
        raise HTTPException(
            status_code=422,
            detail="Au moins un critère est requis."
        )

    from sqlalchemy import and_, or_

    # Construire les conditions de suppression (OR entre critères de même nature,
    # puis AND global — ici toutes les conditions sont en AND pour cibler précisément)
    conditions = []

    if max_score is not None:
        conditions.append(
            (Job.ai_score.isnot(None)) & (Job.ai_score < max_score)
        )

    if min_score is not None:
        conditions.append(
            (Job.ai_score.isnot(None)) & (Job.ai_score > min_score)
        )

    if no_score:
        conditions.append(Job.ai_score.is_(None))

    if before_date is not None:
        try:
            dt = datetime.strptime(before_date, "%Y-%m-%d")
        except ValueError:
            raise HTTPException(status_code=422, detail="Format de date invalide — attendu YYYY-MM-DD.")
        conditions.append(Job.scraped_at < dt)

    if after_date is not None:
        try:
            dt_after = datetime.strptime(after_date, "%Y-%m-%d")
        except ValueError:
            raise HTTPException(status_code=422, detail="Format de date invalide — attendu YYYY-MM-DD.")
        conditions.append(Job.scraped_at > dt_after)

    if source is not None:
        conditions.append(Job.source == source)

    if status is not None:
        conditions.append(Job.status == status)

    # Construire la requête de sélection des IDs à supprimer
    stmt = select(Job.id)
    if len(conditions) == 1:
        stmt = stmt.where(conditions[0])
    else:
        stmt = stmt.where(and_(*conditions))

    # Protéger les offres sélectionnées (statut actif : to_apply, applied, interview)
    if keep_selected:
        stmt = stmt.where(Job.status.not_in(["to_apply", "applied", "interview"]))

    result = await db.execute(stmt)
    ids_to_delete = [row[0] for row in result.fetchall()]
    count = len(ids_to_delete)

    if dry_run or count == 0:
        total_remaining = await db.scalar(select(func.count()).select_from(Job))
        return {
            "deleted":   0 if dry_run else count,
            "would_delete": count,
            "remaining": total_remaining,
            "dry_run":   dry_run,
        }

    # Suppression effective
    await db.execute(delete(Job).where(Job.id.in_(ids_to_delete)))
    await db.commit()

    total_after = await db.scalar(select(func.count()).select_from(Job))
    return {
        "deleted":   count,
        "would_delete": count,
        "remaining": total_after,
        "dry_run":   False,
    }
