"""
app/api/routes/analysis.py
Analyse IA : scoring CV ↔ offre, batch scoring, statut Ollama.

Routes :
  POST /api/analysis/score        → score un job contre un CV (async Celery)
  POST /api/analysis/score-sync   → score synchrone (dev / test)
  GET  /api/analysis/ollama/ping  → vérifie si Ollama est disponible
  GET  /api/analysis/ollama/models → liste des modèles Ollama installés
"""
import httpx
from fastapi import APIRouter, HTTPException

from app.api.deps import AppSettings, DBSession
from app.schemas.cv import CVAnalysisRequest

router = APIRouter(prefix="/analysis", tags=["Analysis"])


@router.post("/score", status_code=202)
async def score_async(payload: CVAnalysisRequest) -> dict:
    """
    Lance le scoring CV ↔ offre en tâche Celery.
    Non-bloquant — retourne un task_id.
    """
    try:
        from app.workers.analysis_task import analyze_job

        task = analyze_job.delay(
            cv_id=payload.cv_id,
            job_id=payload.job_id,
            model=payload.model,
        )
        return {
            "task_id": task.id,
            "status": "queued",
            "message": f"Analyse lancée (CV {payload.cv_id} ↔ Job {payload.job_id})",
        }
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Worker Celery indisponible : {exc}")


@router.post("/score-sync")
async def score_sync(payload: CVAnalysisRequest, db: DBSession) -> dict:
    """
    Scoring synchrone — pour tests ou si Celery n'est pas lancé.
    Attention : bloque la requête pendant l'inférence Ollama.
    """
    from app.models.cv import CV
    from app.models.job import Job
    from app.services.cv_service import CVService

    cv = await db.get(CV, payload.cv_id)
    job = await db.get(Job, payload.job_id)
    if not cv:
        raise HTTPException(status_code=404, detail=f"CV {payload.cv_id} introuvable.")
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {payload.job_id} introuvable.")

    svc = CVService(db)
    result = await svc.score_against_job(cv, job, model=payload.model)
    await db.commit()
    return result


@router.get("/ollama/ping")
async def ollama_ping(settings: AppSettings) -> dict:
    """Vérifie si le serveur Ollama est accessible."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{settings.ollama_base_url}/api/version")
            resp.raise_for_status()
            return {"status": "online", "version": resp.json()}
    except Exception as exc:
        return {"status": "offline", "error": str(exc)}


@router.get("/ollama/models")
async def ollama_models(settings: AppSettings) -> dict:
    """Liste les modèles disponibles sur l'instance Ollama locale."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{settings.ollama_base_url}/api/tags")
            resp.raise_for_status()
            data = resp.json()
            models = [m["name"] for m in data.get("models", [])]
            return {
                "models": models,
                "current": settings.ollama_model,
                "count": len(models),
            }
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Ollama inaccessible : {exc}")
