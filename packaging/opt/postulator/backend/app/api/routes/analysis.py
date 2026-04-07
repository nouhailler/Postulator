"""
app/api/routes/analysis.py
Analyse IA : scoring CV ↔ offre, résumé offre, batch scoring, statut Ollama.

Routes :
  POST /api/analysis/score              → score un job contre un CV (async Celery)
  POST /api/analysis/score-sync         → score synchrone (dev / test)
  POST /api/analysis/summarize-jobs     → résumé IA des N dernières offres (max 10)
  GET  /api/analysis/summarize-jobs/status → état du batch résumé en cours
  POST /api/analysis/score-batch        → score en masse (N offres vs CV)
  GET  /api/analysis/score-batch/status → état + résultats du dernier batch score
  GET  /api/analysis/ollama/ping        → vérifie si Ollama est disponible
  GET  /api/analysis/ollama/models      → liste des modèles Ollama installés
"""
import asyncio
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, desc

from app.api.deps import AppSettings, DBSession
from app.schemas.cv import CVAnalysisRequest

router = APIRouter(prefix="/analysis", tags=["Analysis"])

# ── État in-memory des batchs (simple, sans Redis) ───────────────────────────
# suffisant pour un usage mono-utilisateur
_summarize_state: dict = {"running": False, "done": 0, "total": 0, "errors": 0}
_score_batch_state: dict = {
    "running": False, "done": 0, "total": 0, "errors": 0,
    "results": [],   # list[{job_id, job_title, job_company, score, error}]
    "started_at": None,
    "finished_at": None,
}


# ── Schémas ───────────────────────────────────────────────────────────────────

class SummarizeRequest(BaseModel):
    """Résumé IA des N dernières offres scrapées."""
    limit: int = 10    # max 10


class ScoreBatchRequest(BaseModel):
    """Score en masse : N premières offres (new) contre un CV."""
    cv_id:  int
    limit:  int = 20   # nb d'offres à scorer
    model:  Optional[str] = None
    status_filter: str = "new"   # ne scorer que les offres "new" par défaut


# ── Routes scoring existantes ─────────────────────────────────────────────────

@router.post("/score", status_code=202)
async def score_async(payload: CVAnalysisRequest) -> dict:
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


# ── Résumé IA des offres ──────────────────────────────────────────────────────

@router.post("/summarize-jobs", status_code=202)
async def summarize_jobs(
    payload:  SummarizeRequest,
    db:       DBSession,
    settings: AppSettings,
) -> dict:
    """
    Génère un résumé IA (max 10 lignes) pour les N dernières offres scrapées.
    Stocke le résumé dans jobs.ai_summary.
    Traitement en arrière-plan (asyncio.create_task) — non bloquant.
    """
    global _summarize_state

    if _summarize_state["running"]:
        return {
            "status": "already_running",
            "done": _summarize_state["done"],
            "total": _summarize_state["total"],
        }

    from app.models.job import Job

    limit = min(payload.limit, 10)   # hard cap à 10
    stmt  = (
        select(Job)
        .where(Job.description.isnot(None))
        .where(Job.description != "")
        .order_by(desc(Job.scraped_at))
        .limit(limit)
    )
    result = await db.execute(stmt)
    jobs   = result.scalars().all()

    if not jobs:
        return {"status": "no_jobs", "done": 0, "total": 0}

    job_ids = [j.id for j in jobs]
    _summarize_state = {"running": True, "done": 0, "total": len(job_ids), "errors": 0}

    # Lancer en arrière-plan
    asyncio.create_task(_run_summarize_batch(job_ids, settings.ollama_model, settings.ollama_base_url))

    return {
        "status": "started",
        "total": len(job_ids),
        "message": f"Résumé IA lancé pour {len(job_ids)} offre(s) — max 10 lignes chacune.",
    }


@router.get("/summarize-jobs/status")
async def summarize_jobs_status() -> dict:
    return {
        "running": _summarize_state["running"],
        "done":    _summarize_state["done"],
        "total":   _summarize_state["total"],
        "errors":  _summarize_state["errors"],
    }


# ── Score en masse ────────────────────────────────────────────────────────────

@router.post("/score-batch", status_code=202)
async def score_batch(
    payload:  ScoreBatchRequest,
    db:       DBSession,
    settings: AppSettings,
) -> dict:
    """
    Score en masse : score les N premières offres contre un CV.
    Traitement séquentiel en arrière-plan pour ne pas bloquer Ollama.
    """
    global _score_batch_state

    if _score_batch_state["running"]:
        return {
            "status": "already_running",
            "done":  _score_batch_state["done"],
            "total": _score_batch_state["total"],
        }

    from app.models.cv import CV
    from app.models.job import Job

    cv = await db.get(CV, payload.cv_id)
    if not cv:
        raise HTTPException(status_code=404, detail=f"CV {payload.cv_id} introuvable.")

    stmt = (
        select(Job)
        .order_by(desc(Job.scraped_at))
        .limit(min(payload.limit, 50))   # hard cap à 50
    )
    if payload.status_filter:
        stmt = stmt.where(Job.status == payload.status_filter)

    result = await db.execute(stmt)
    jobs   = result.scalars().all()

    if not jobs:
        return {"status": "no_jobs", "done": 0, "total": 0}

    from datetime import datetime
    job_ids = [j.id for j in jobs]
    _score_batch_state = {
        "running": True, "done": 0, "total": len(job_ids), "errors": 0,
        "results": [], "cv_name": cv.name,
        "started_at": datetime.utcnow().isoformat(),
        "finished_at": None,
    }

    asyncio.create_task(
        _run_score_batch(
            job_ids, payload.cv_id, payload.model or settings.ollama_model,
            settings.ollama_base_url
        )
    )

    return {
        "status": "started",
        "total": len(job_ids),
        "cv_id": payload.cv_id,
        "cv_name": cv.name,
        "message": f"Score en masse lancé : {len(job_ids)} offre(s) contre {cv.name}.",
    }


@router.get("/score-batch/status")
async def score_batch_status() -> dict:
    return {
        "running":     _score_batch_state["running"],
        "done":        _score_batch_state["done"],
        "total":       _score_batch_state["total"],
        "errors":      _score_batch_state["errors"],
        "results":     _score_batch_state.get("results", []),
        "cv_name":     _score_batch_state.get("cv_name", ""),
        "started_at":  _score_batch_state.get("started_at"),
        "finished_at": _score_batch_state.get("finished_at"),
    }


# ── Ollama ────────────────────────────────────────────────────────────────────

@router.get("/ollama/ping")
async def ollama_ping(settings: AppSettings) -> dict:
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{settings.ollama_base_url}/api/version")
            resp.raise_for_status()
            return {"status": "online", "version": resp.json()}
    except Exception as exc:
        return {"status": "offline", "error": str(exc)}


@router.get("/ollama/models")
async def ollama_models(settings: AppSettings) -> dict:
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{settings.ollama_base_url}/api/tags")
            resp.raise_for_status()
            data   = resp.json()
            models = [m["name"] for m in data.get("models", [])]
            return {"models": models, "current": settings.ollama_model, "count": len(models)}
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Ollama inaccessible : {exc}")


# ── Tâches arrière-plan ───────────────────────────────────────────────────────

async def _run_summarize_batch(job_ids: list[int], model: str, base_url: str) -> None:
    """Résumé IA séquentiel offre par offre."""
    global _summarize_state
    from app.db.database import AsyncSessionLocal
    from app.models.job import Job

    for job_id in job_ids:
        try:
            async with AsyncSessionLocal() as db:
                job = await db.get(Job, job_id)
                if not job or not job.description:
                    _summarize_state["errors"] += 1
                    _summarize_state["done"]   += 1
                    continue

                summary = await _generate_job_summary(job, model, base_url)
                if summary:
                    job.ai_summary = summary
                    await db.commit()
                    _summarize_state["done"] += 1
                else:
                    _summarize_state["errors"] += 1
                    _summarize_state["done"]   += 1

        except Exception as exc:
            from loguru import logger
            logger.error(f"[summarize] job {job_id} failed : {exc}")
            _summarize_state["errors"] += 1
            _summarize_state["done"]   += 1

    _summarize_state["running"] = False


async def _run_score_batch(job_ids: list[int], cv_id: int, model: str, base_url: str) -> None:
    """Score en masse séquentiel."""
    global _score_batch_state
    from app.db.database import AsyncSessionLocal
    from app.models.cv import CV
    from app.models.job import Job
    from app.services.cv_service import CVService
    from datetime import datetime

    for job_id in job_ids:
        try:
            async with AsyncSessionLocal() as db:
                cv  = await db.get(CV, cv_id)
                job = await db.get(Job, job_id)
                if not cv or not job:
                    _score_batch_state["errors"] += 1
                    _score_batch_state["done"]   += 1
                    continue

                svc    = CVService(db)
                result = await svc.score_against_job(cv, job, model=model)
                await db.commit()

                score = result.get("score") or result.get("ai_score") or 0
                _score_batch_state["results"].append({
                    "job_id":      job_id,
                    "job_title":   job.title,
                    "job_company": job.company,
                    "score":       round(float(score), 1),
                    "error":       None,
                })
                _score_batch_state["done"] += 1

        except Exception as exc:
            from loguru import logger
            logger.error(f"[score-batch] job {job_id} cv {cv_id} failed : {exc}")
            _score_batch_state["errors"] += 1
            _score_batch_state["done"]   += 1
            # On essaie quand même de récupérer le titre pour le résultat
            try:
                async with AsyncSessionLocal() as db2:
                    j2 = await db2.get(Job, job_id)
                    _score_batch_state["results"].append({
                        "job_id":      job_id,
                        "job_title":   j2.title if j2 else "?",
                        "job_company": j2.company if j2 else "?",
                        "score":       None,
                        "error":       str(exc)[:80],
                    })
            except Exception:
                pass

    from datetime import datetime
    _score_batch_state["running"]     = False
    _score_batch_state["finished_at"] = datetime.utcnow().isoformat()


async def _generate_job_summary(job, model: str, base_url: str) -> Optional[str]:
    """Génère un résumé de 10 lignes max via Ollama."""
    import httpx as _httpx
    import ollama as ol

    desc_clean = (job.description or "")[:3000]
    # Nettoyer HTML basique
    import re
    desc_clean = re.sub(r'<[^>]+>', ' ', desc_clean)
    desc_clean = re.sub(r'\s+', ' ', desc_clean).strip()

    if len(desc_clean) < 50:
        return None

    prompt = f"""Tu es un expert en recrutement. Analyse cette offre d'emploi et fournis un résumé structuré.

Offre : {job.title} chez {job.company}
Description : {desc_clean}

Génère un résumé en exactement 8 à 10 points bullet, en français, couvrant :
1. Le rôle principal et les responsabilités clés
2. Les compétences techniques indispensables
3. L'expérience requise (années, domaines)
4. Les compétences soft skills attendues
5. Les avantages / points attractifs de ce poste

Format OBLIGATOIRE — uniquement des bullet points, sans titre, sans introduction, sans conclusion :
• [Point 1]
• [Point 2]
...

Maximum 10 bullet points. Chaque point : 1 ligne concise."""

    try:
        client = ol.AsyncClient(
            host=base_url,
            timeout=_httpx.Timeout(connect=10, read=120, write=10, pool=5),
        )
        response = await client.generate(
            model=model, prompt=prompt, stream=False,
            options={"temperature": 0.2, "num_predict": 600},
        )
        raw = response["response"].strip()
        # Garder seulement les lignes qui commencent par • ou -
        lines = [l.strip() for l in raw.split('\n') if l.strip() and (l.strip().startswith('•') or l.strip().startswith('-') or l.strip().startswith('*'))]
        lines = lines[:10]   # hard cap 10 lignes
        if not lines:
            # Si pas de bullets, prendre les 10 premières lignes non vides
            lines = [l.strip() for l in raw.split('\n') if l.strip()][:10]
        return '\n'.join(lines)
    except Exception as exc:
        from loguru import logger
        logger.error(f"[summarize] Ollama error job {job.id} : {exc}")
        return None
