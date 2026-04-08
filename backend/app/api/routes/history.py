"""
app/api/routes/history.py
Historique des analyses CV ↔ offre.

Routes :
  GET    /api/history          → liste paginée
  POST   /api/history          → sauvegarde + alerte email automatique si score ≥ seuil
  GET    /api/history/{id}     → détail
  DELETE /api/history/{id}     → suppression
"""
import json
from datetime import datetime

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select

from app.api.deps import DBSession
from app.core.config import get_settings
from app.models.cv import CV
from app.models.job import Job
from app.models.match_history import MatchHistory
from app.schemas.match_history import MatchHistoryCreate, MatchHistoryRead

router   = APIRouter(prefix="/history", tags=["History"])
settings = get_settings()


@router.get("", response_model=list[MatchHistoryRead])
async def list_history(
    db:         DBSession,
    cv_id:      int | None   = None,
    job_id:     int | None   = None,
    min_score:  float | None = None,
    max_score:  float | None = None,
    date_from:  str | None   = None,   # ISO date : "2025-01-01"
    date_to:    str | None   = None,   # ISO date : "2025-12-31"
    limit:      int          = Query(200, ge=1, le=500),
    offset:     int          = Query(0, ge=0),
) -> list[MatchHistoryRead]:
    stmt = select(MatchHistory).order_by(MatchHistory.analyzed_at.desc())
    if cv_id     is not None: stmt = stmt.where(MatchHistory.cv_id  == cv_id)
    if job_id    is not None: stmt = stmt.where(MatchHistory.job_id == job_id)
    if min_score is not None: stmt = stmt.where(MatchHistory.score  >= min_score)
    if max_score is not None: stmt = stmt.where(MatchHistory.score  <= max_score)
    if date_from is not None:
        from datetime import datetime
        try:
            dt = datetime.fromisoformat(date_from)
            stmt = stmt.where(MatchHistory.analyzed_at >= dt)
        except ValueError:
            pass
    if date_to is not None:
        from datetime import datetime
        try:
            dt = datetime.fromisoformat(date_to + "T23:59:59")
            stmt = stmt.where(MatchHistory.analyzed_at <= dt)
        except ValueError:
            pass
    stmt = stmt.limit(limit).offset(offset)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("", response_model=MatchHistoryRead, status_code=201)
async def save_match(payload: MatchHistoryCreate, db: DBSession) -> MatchHistoryRead:
    """
    Sauvegarde un résultat d'analyse.
    Si le score ≥ ALERT_SCORE_THRESHOLD et que SMTP est configuré,
    envoie automatiquement une alerte email en arrière-plan.
    """
    cv  = await db.get(CV,  payload.cv_id)
    job = await db.get(Job, payload.job_id)
    if not cv:  raise HTTPException(status_code=404, detail=f"CV {payload.cv_id} introuvable.")
    if not job: raise HTTPException(status_code=404, detail=f"Job {payload.job_id} introuvable.")

    entry = MatchHistory(
        analyzed_at=datetime.utcnow(),
        cv_id=cv.id,
        cv_name=cv.name,
        cv_skills=cv.skills,
        job_id=job.id,
        job_title=job.title,
        job_company=job.company,
        job_url=job.url,
        job_source=job.source,
        score=payload.score,
        strengths=json.dumps(payload.strengths,  ensure_ascii=False),
        gaps=json.dumps(payload.gaps,             ensure_ascii=False),
        recommendation=payload.recommendation,
        ollama_model=payload.ollama_model or settings.ollama_model,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)

    # ── Alerte email automatique ──────────────────────────────────────────────
    if payload.score >= settings.alert_score_threshold and settings.email_configured:
        import asyncio
        from app.services.email_service import email_service

        async def _send_alert():
            await email_service.send_match_alert(
                job_title=job.title,
                job_company=job.company,
                job_url=job.url,
                score=payload.score,
                cv_name=cv.name,
                recommendation=payload.recommendation or "",
                strengths=payload.strengths,
                gaps=payload.gaps,
            )

        # Lancer en tâche de fond sans bloquer la réponse API
        asyncio.create_task(_send_alert())

    return entry


@router.get("/{entry_id}", response_model=MatchHistoryRead)
async def get_match(entry_id: int, db: DBSession) -> MatchHistoryRead:
    entry = await db.get(MatchHistory, entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail=f"Entrée {entry_id} introuvable.")
    return entry


@router.delete("/{entry_id}", status_code=204)
async def delete_match(entry_id: int, db: DBSession) -> None:
    entry = await db.get(MatchHistory, entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail=f"Entrée {entry_id} introuvable.")
    await db.delete(entry)
    await db.commit()
