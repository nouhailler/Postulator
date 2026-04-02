"""
app/workers/analysis_task.py
Tâche Celery pour l'analyse IA (scoring CV ↔ offre) en arrière-plan.
"""
import asyncio

from loguru import logger

from app.workers.celery_app import celery_app


@celery_app.task(
    bind=True,
    name="app.workers.analysis_task.analyze_job",
    max_retries=1,
    default_retry_delay=30,
)
def analyze_job(self, cv_id: int, job_id: int, model: str | None = None) -> dict:
    """
    Score une offre contre un CV via Ollama.
    Appelée par POST /api/analysis/score
    """
    from sqlalchemy import select

    from app.db.database import AsyncSessionLocal
    from app.models.cv import CV
    from app.models.job import Job
    from app.services.cv_service import CVService

    async def _run() -> dict:
        async with AsyncSessionLocal() as db:
            cv = await db.scalar(select(CV).where(CV.id == cv_id))
            job = await db.scalar(select(Job).where(Job.id == job_id))
            if not cv or not job:
                raise ValueError(f"CV {cv_id} ou Job {job_id} introuvable.")
            svc = CVService(db)
            result = await svc.score_against_job(cv, job, model=model)
            await db.commit()
            return result

    try:
        result = asyncio.run(_run())
        logger.info(f"[AnalysisTask] Job {job_id} scoré : {result.get('score')}/100")
        return result
    except Exception as exc:
        logger.error(f"[AnalysisTask] Erreur : {exc}")
        raise self.retry(exc=exc)
