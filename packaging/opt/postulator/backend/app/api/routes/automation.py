"""
app/api/routes/automation.py

Gestion de l'automatisation quotidienne : scraping (Indeed + LinkedIn) + scoring en masse.

Fonctionnement :
  - La config est persistée dans automation_config.json (même dossier que la DB).
  - Au démarrage de l'API (lifespan dans main.py), le scheduler vérifie si une automatisation
    est active et planifie le job APScheduler correspondant.
  - À l'heure planifiée, le système lance le scraping puis le scoring automatiquement.
  - L'état du run en cours est maintenu en mémoire (_run_state) et exposé via GET /status.

Routes :
  GET    /api/automation/config        -> config actuelle
  POST   /api/automation/config        -> sauvegarder / activer l'automatisation
  DELETE /api/automation/config        -> désactiver l'automatisation
  GET    /api/automation/status        -> état du run en cours ou dernier run
  POST   /api/automation/run-now       -> déclencher manuellement
  POST   /api/automation/cancel        -> annuler le run en cours
"""
import asyncio
import json
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/automation", tags=["Automation"])

# -- Chemin du fichier de config persistant --
CONFIG_PATH = Path("automation_config.json")

# -- État in-memory du run courant --
_run_state: dict = {
    "status":      "idle",
    "phase":       None,
    "message":     None,
    "started_at":  None,
    "finished_at": None,
    "scrape_result": None,
    "score_results": [],
    "score_total":   0,
    "score_done":    0,
    "cv_name":       None,
    "cancel_requested": False,
}

# -- Schémas --

class AutomationConfig(BaseModel):
    enabled:       bool
    keywords:      str
    location:      Optional[str]  = None
    cv_id:         int
    cv_name:       Optional[str]  = None
    proxies:       list[str]      = []
    run_hour:      int            = 8
    run_minute:    int            = 0
    start_date:    Optional[str]  = None
    end_date:      Optional[str]  = None
    or_model:       Optional[str]  = None
    created_at:    Optional[str]  = None
    updated_at:    Optional[str]  = None


class AutomationRunStatus(BaseModel):
    status:        str
    phase:         Optional[str]  = None
    message:       Optional[str]  = None
    started_at:    Optional[str]  = None
    finished_at:   Optional[str]  = None
    scrape_result: Optional[dict] = None
    score_results: list           = []
    score_total:   int            = 0
    score_done:    int            = 0
    cv_name:       Optional[str]  = None
    cancel_requested: bool        = False


# -- Helpers config --

def _load_config() -> Optional[dict]:
    if not CONFIG_PATH.exists():
        return None
    try:
        return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except Exception:
        return None


def _save_config(cfg: dict) -> None:
    CONFIG_PATH.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")


def _delete_config() -> None:
    if CONFIG_PATH.exists():
        CONFIG_PATH.unlink()


# -- Routes --

@router.get("/config")
async def get_config() -> dict:
    cfg = _load_config()
    if not cfg:
        return {"enabled": False}
    return cfg


@router.post("/config", status_code=201)
async def save_config(payload: AutomationConfig) -> dict:
    now = datetime.utcnow().isoformat()
    cfg = payload.model_dump()
    cfg["updated_at"] = now
    if not cfg.get("created_at"):
        cfg["created_at"] = now
    _save_config(cfg)
    _reschedule(cfg)
    return {"ok": True, "config": cfg}


@router.delete("/config", status_code=200)
async def delete_config() -> dict:
    _delete_config()
    _remove_schedule()
    return {"ok": True, "message": "Automatisation désactivée."}


@router.get("/status", response_model=AutomationRunStatus)
async def get_status() -> AutomationRunStatus:
    return AutomationRunStatus(**_run_state)


@router.post("/run-now", status_code=202)
async def run_now() -> dict:
    cfg = _load_config()
    if not cfg:
        raise HTTPException(status_code=404, detail="Aucune config d'automatisation configurée.")
    if _run_state["status"] in ("scraping", "scoring"):
        raise HTTPException(status_code=409, detail="Un run est déjà en cours.")
    asyncio.create_task(_execute_automation(cfg))
    return {"ok": True, "message": "Run déclenché manuellement."}


@router.post("/cancel", status_code=200)
async def cancel_run() -> dict:
    if _run_state["status"] not in ("scraping", "scoring"):
        return {"ok": False, "message": "Aucun run en cours à annuler."}
    _run_state["cancel_requested"] = True
    _run_state["message"] = "Annulation demandée…"
    return {"ok": True, "message": "Annulation en cours…"}


# -- Scheduler (APScheduler) --

_scheduler = None

def _get_scheduler():
    global _scheduler
    if _scheduler is None:
        try:
            from apscheduler.schedulers.asyncio import AsyncIOScheduler
            _scheduler = AsyncIOScheduler(timezone="Europe/Paris")
            _scheduler.start()
        except ImportError:
            from loguru import logger
            logger.warning("[Automation] APScheduler non installé. pip install apscheduler")
    return _scheduler


def _reschedule(cfg: dict) -> None:
    from loguru import logger
    scheduler = _get_scheduler()
    if scheduler is None:
        return
    _remove_schedule()
    if not cfg.get("enabled"):
        return
    run_hour   = int(cfg.get("run_hour",   8))
    run_minute = int(cfg.get("run_minute", 0))
    try:
        scheduler.add_job(
            _scheduled_run,
            trigger="cron",
            hour=run_hour,
            minute=run_minute,
            id="automation_daily",
            replace_existing=True,
            misfire_grace_time=3600,
        )
        logger.info(f"[Automation] Job planifié tous les jours à {run_hour:02d}:{run_minute:02d}")
    except Exception as exc:
        logger.error(f"[Automation] Erreur planification : {exc}")


def _remove_schedule() -> None:
    scheduler = _get_scheduler()
    if scheduler is None:
        return
    try:
        scheduler.remove_job("automation_daily")
    except Exception:
        pass


async def _scheduled_run() -> None:
    from loguru import logger
    cfg = _load_config()
    if not cfg or not cfg.get("enabled"):
        logger.info("[Automation] Job ignoré : config désactivée.")
        return

    today = datetime.utcnow().date()

    if cfg.get("start_date"):
        try:
            sd = datetime.fromisoformat(cfg["start_date"]).date()
            if today < sd:
                logger.info(f"[Automation] Job ignoré : avant la date de début {sd}.")
                return
        except Exception:
            pass

    if cfg.get("end_date"):
        try:
            ed = datetime.fromisoformat(cfg["end_date"]).date()
            if today > ed:
                logger.info(f"[Automation] Job ignoré : après la date de fin {ed}.")
                cfg["enabled"] = False
                _save_config(cfg)
                _remove_schedule()
                return
        except Exception:
            pass

    await _execute_automation(cfg)


# -- Logique d'exécution --

async def _execute_automation(cfg: dict) -> None:
    from loguru import logger
    global _run_state

    if _run_state["status"] in ("scraping", "scoring"):
        logger.warning("[Automation] Run ignoré : déjà en cours.")
        return

    _run_state.update({
        "status":       "scraping",
        "phase":        "scraping",
        "message":      "Recherche des offres en cours (Indeed + LinkedIn)…",
        "started_at":   datetime.utcnow().isoformat(),
        "finished_at":  None,
        "scrape_result": None,
        "score_results": [],
        "score_total":   0,
        "score_done":    0,
        "cv_name":       cfg.get("cv_name"),
        "cancel_requested": False,
    })

    logger.info(f"[Automation] Démarrage run — mots-clés: {cfg['keywords']}")

    try:
        scrape_result = await _run_scraping(cfg)

        if _run_state["cancel_requested"]:
            _run_state.update({
                "status": "cancelled", "phase": None,
                "message": "Automatisation annulée par l'utilisateur.",
                "finished_at": datetime.utcnow().isoformat(),
            })
            return

        _run_state["scrape_result"] = scrape_result
        new_jobs_count = sum(s.get("new", 0) for s in (scrape_result.get("sources") or []))
        logger.info(f"[Automation] Scraping terminé : {new_jobs_count} nouvelle(s) offre(s)")

        _run_state["phase"]   = "scoring"
        _run_state["status"]  = "scoring"
        cv_name = cfg.get("cv_name") or f"CV #{cfg['cv_id']}"
        _run_state["message"] = f"Scoring des offres avec {cv_name}…"

        if _run_state["cancel_requested"]:
            _run_state.update({
                "status": "cancelled", "message": "Automatisation annulée avant le scoring.",
                "finished_at": datetime.utcnow().isoformat(),
            })
            return

        await _run_scoring(cfg)

        _run_state["status"]      = "done"
        _run_state["phase"]       = None
        _run_state["finished_at"] = datetime.utcnow().isoformat()
        score_count = len(_run_state["score_results"])
        _run_state["message"] = f"Terminé — {new_jobs_count} offre(s) scrapée(s), {score_count} scorée(s)."
        logger.info(f"[Automation] Run complet : {_run_state['message']}")

    except asyncio.CancelledError:
        _run_state.update({
            "status": "cancelled", "message": "Run annulé.",
            "finished_at": datetime.utcnow().isoformat(),
        })
    except Exception as exc:
        logger.error(f"[Automation] Erreur run : {exc}")
        _run_state.update({
            "status": "error", "phase": None,
            "message": f"Erreur : {str(exc)[:200]}",
            "finished_at": datetime.utcnow().isoformat(),
        })


async def _run_scraping(cfg: dict) -> dict:
    keywords = cfg["keywords"]
    location = cfg.get("location")
    proxies  = cfg.get("proxies") or []
    sources  = ["indeed", "linkedin"]

    try:
        if proxies:
            from app.workers.scrape_task import run_scrape_with_proxies
            task = run_scrape_with_proxies.delay(
                keywords=keywords, sources=sources, proxy_lines=proxies,
                location=location, results_per_source=10, hours_old=24, remote_only=False,
            )
        else:
            from app.workers.scrape_task import run_scrape
            task = run_scrape.delay(
                keywords=keywords, sources=sources,
                location=location, results_per_source=10, hours_old=24,
            )
    except Exception as exc:
        raise RuntimeError(f"Worker Celery indisponible : {exc}")

    from celery.result import AsyncResult
    from app.workers.celery_app import celery_app

    deadline = asyncio.get_event_loop().time() + 600
    while True:
        if _run_state.get("cancel_requested"):
            task.revoke(terminate=True)
            return {"cancelled": True, "sources": []}

        result = AsyncResult(task.id, app=celery_app)
        if result.ready():
            if result.successful():
                return result.get()
            else:
                raise RuntimeError(f"Scraping échoué : {result.info}")

        if asyncio.get_event_loop().time() > deadline:
            task.revoke(terminate=True)
            raise RuntimeError("Timeout scraping (10 min)")

        await asyncio.sleep(3)


async def _run_scoring(cfg: dict) -> None:
    from loguru import logger
    from app.db.database import AsyncSessionLocal
    from app.models.cv import CV
    from app.models.job import Job
    from app.services.cv_service import CVService
    from app.core.config import get_settings
    from sqlalchemy import select, desc

    settings  = get_settings()
    cv_id     = cfg["cv_id"]
    or_model  = cfg.get("or_model") or None

    # Charger la clé OpenRouter si nécessaire
    openrouter_key = None
    if or_model:
        from app.services.openrouter_service import load_openrouter_config
        async with AsyncSessionLocal() as db:
            or_cfg = await load_openrouter_config(db)
        if not or_cfg:
            raise RuntimeError(
                "OpenRouter non configuré — ajoutez votre clé API dans Paramètres."
            )
        openrouter_key = or_cfg.api_key
        logger.info(f"[Automation-Score] Utilisation d'OpenRouter · modèle : {or_model}")
    else:
        logger.info(f"[Automation-Score] Utilisation d'Ollama · modèle : {settings.ollama_model}")

    async with AsyncSessionLocal() as db:
        cv = await db.get(CV, cv_id)
        if not cv:
            raise RuntimeError(f"CV {cv_id} introuvable en base.")
        stmt   = (select(Job).where(Job.status == "new").order_by(desc(Job.scraped_at)).limit(20))
        result = await db.execute(stmt)
        jobs   = result.scalars().all()

    if not jobs:
        logger.info("[Automation-Score] Aucune nouvelle offre à scorer.")
        _run_state["message"] = "Aucune nouvelle offre à scorer."
        return

    _run_state["score_total"] = len(jobs)
    _run_state["score_done"]  = 0

    provider_label = f"OpenRouter · {or_model}" if or_model else f"Ollama · {settings.ollama_model}"

    for job in jobs:
        if _run_state.get("cancel_requested"):
            break
        try:
            async with AsyncSessionLocal() as db:
                cv      = await db.get(CV, cv_id)
                job_obj = await db.get(Job, job.id)
                if not cv or not job_obj:
                    _run_state["score_done"] += 1
                    continue
                svc = CVService(db)
                res = await svc.score_against_job(
                    cv, job_obj,
                    model=settings.ollama_model,
                    openrouter_key=openrouter_key,
                    openrouter_model=or_model,
                )
                await db.commit()
                score = res.get("score") or res.get("ai_score") or 0
                _run_state["score_results"].append({
                    "job_id": job.id, "job_title": job.title,
                    "job_company": job.company, "job_url": job.url,
                    "score": round(float(score), 1), "error": None,
                })
        except Exception as exc:
            logger.error(f"[Automation-Score] job {job.id} failed : {exc}")
            _run_state["score_results"].append({
                "job_id": job.id, "job_title": job.title,
                "job_company": job.company, "job_url": getattr(job, "url", None),
                "score": None, "error": str(exc)[:80],
            })
        _run_state["score_done"] += 1
        cv_name = cfg.get("cv_name") or f"CV #{cv_id}"
        _run_state["message"] = (
            f"Scoring ({provider_label}) avec {cv_name}"
            f" — {_run_state['score_done']}/{_run_state['score_total']} offre(s)…"
        )


# -- Point d'entrée appelé par main.py au démarrage --

def init_automation_scheduler() -> None:
    """
    À appeler dans le lifespan de FastAPI.
    Lit la config et planifie le job APScheduler si l'automatisation est active.
    """
    from loguru import logger
    cfg = _load_config()
    if not cfg:
        logger.info("[Automation] Aucune config trouvée — automatisation inactive.")
        return
    if not cfg.get("enabled"):
        logger.info("[Automation] Config présente mais désactivée.")
        return
    kw = cfg.get("keywords", "(non renseigné)")
    hr = cfg.get("run_hour", 8)
    mn = cfg.get("run_minute", 0)
    logger.info(f"[Automation] Reprise planification : {kw!r} à {hr:02d}:{mn:02d} Europe/Paris")
    _reschedule(cfg)
