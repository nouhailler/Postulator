"""
app/api/routes/companies.py

Gestion des entreprises cibles pour le scraping personnalisé.

Routes :
  GET    /api/companies                → liste des entreprises
  POST   /api/companies                → ajouter
  PATCH  /api/companies/{id}           → mettre à jour
  DELETE /api/companies/{id}           → supprimer
  POST   /api/companies/{id}/discover  → découvrir l'URL carrières (async)
  POST   /api/companies/{id}/scrape    → scraper les offres (async)
  POST   /api/companies/scrape-all     → scraper toutes les entreprises actives
  GET    /api/companies/run-status     → état des runs en cours
  GET    /api/companies/config         → config globale (proxy, AI)
  POST   /api/companies/config         → sauvegarder config globale
"""
import asyncio
import json
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import select

from app.api.deps import DBSession
from app.models.company import Company
from app.schemas.company import CompanyCreate, CompanyRead, CompanyUpdate

router = APIRouter(prefix="/companies", tags=["Companies"])

CONFIG_PATH = Path("companies_config.json")

# ── In-memory run status ──────────────────────────────────────────────────────
_run_status: dict[int, dict] = {}


# ── Config ────────────────────────────────────────────────────────────────────

class CompaniesConfig(BaseModel):
    proxies     : list[str]      = []
    ai_provider : str            = "ollama"
    or_model    : Optional[str]  = None


def _load_cfg() -> dict:
    if not CONFIG_PATH.exists():
        return {"proxies": [], "ai_provider": "ollama", "or_model": None}
    try:
        return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {"proxies": [], "ai_provider": "ollama", "or_model": None}


def _save_cfg(cfg: dict) -> None:
    CONFIG_PATH.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")


@router.get("/config")
async def get_config() -> dict:
    return _load_cfg()


@router.post("/config")
async def save_config(payload: CompaniesConfig) -> dict:
    cfg = payload.model_dump()
    _save_cfg(cfg)
    return {"ok": True, "config": cfg}


# ── Run status ────────────────────────────────────────────────────────────────

@router.get("/run-status")
async def get_run_status() -> dict:
    return _run_status


# ── DDG Search ────────────────────────────────────────────────────────────────

class DDGSearchPayload(BaseModel):
    company_name: str
    keyword: str


@router.post("/ddg-search")
async def ddg_search(payload: DDGSearchPayload) -> dict:
    """
    Recherche DuckDuckGo avec diagnostics détaillés.
    Retourne toujours un 200 avec debug_info même en cas d'échec.
    """
    from app.services.company_scraper_service import _ddg_sync_full, _normalize_search_query
    import time

    name_raw = payload.company_name.strip()
    name_normalized = _normalize_search_query(name_raw)
    keyword = payload.keyword.strip()
    query = f"{name_normalized} {keyword}".strip()

    debug: dict = {
        "company_name_raw":        name_raw,
        "company_name_normalized": name_normalized,
        "keyword":                 keyword,
        "query_sent":              query,
        "normalized":              name_normalized != name_raw,
        "ddg_module":              None,
        "duration_ms":             None,
        "error":                   None,
        "results_count":           0,
    }

    # Vérifier quel module est disponible
    try:
        from ddgs import DDGS  # noqa
        debug["ddg_module"] = "ddgs (nouveau) OK"
    except ImportError:
        try:
            from duckduckgo_search import DDGS  # noqa
            debug["ddg_module"] = "duckduckgo_search (ancien) OK — préférez pip install ddgs"
        except ImportError as e:
            debug["ddg_module"] = f"MANQUANT : {e}"

    t0 = time.monotonic()
    loop = asyncio.get_event_loop()
    results, err = await loop.run_in_executor(None, lambda: _ddg_sync_full(query, 10))
    debug["duration_ms"] = round((time.monotonic() - t0) * 1000)
    debug["error"] = err
    debug["results_count"] = len(results)

    return {"query": query, "results": results, "debug": debug}


# ── CRUD ──────────────────────────────────────────────────────────────────────

@router.get("", response_model=list[CompanyRead])
async def list_companies(db: DBSession) -> list[Company]:
    result = await db.execute(select(Company).order_by(Company.created_at.desc()))
    return result.scalars().all()


@router.post("", response_model=CompanyRead, status_code=201)
async def create_company(payload: CompanyCreate, db: DBSession) -> Company:
    company = Company(
        name=payload.name.strip(),
        domain=(payload.domain or "").strip() or None,
        notes=payload.notes,
    )
    db.add(company)
    await db.commit()
    await db.refresh(company)
    return company


@router.patch("/{company_id}", response_model=CompanyRead)
async def update_company(company_id: int, payload: CompanyUpdate, db: DBSession) -> Company:
    company = await db.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Entreprise introuvable.")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(company, field, value)
    await db.commit()
    await db.refresh(company)
    return company


@router.delete("/{company_id}", status_code=200)
async def delete_company(company_id: int, db: DBSession) -> dict:
    company = await db.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Entreprise introuvable.")
    await db.delete(company)
    await db.commit()
    _run_status.pop(company_id, None)
    return {"ok": True}


# ── Helpers AI ────────────────────────────────────────────────────────────────

async def _resolve_ai_creds() -> tuple[Optional[str], Optional[str]]:
    """Charge clé + modèle OpenRouter si configurés."""
    cfg = _load_cfg()
    if cfg.get("ai_provider") == "openrouter" and cfg.get("or_model"):
        from app.services.openrouter_service import load_openrouter_config
        from app.db.database import AsyncSessionLocal
        async with AsyncSessionLocal() as db:
            or_cfg = await load_openrouter_config(db)
        if or_cfg:
            return or_cfg.api_key, cfg["or_model"]
    return None, cfg.get("or_model")


# ── Discover URL ──────────────────────────────────────────────────────────────

@router.post("/{company_id}/discover", status_code=202)
async def discover_url(company_id: int, db: DBSession) -> dict:
    company = await db.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Entreprise introuvable.")
    if _run_status.get(company_id, {}).get("running"):
        raise HTTPException(status_code=409, detail="Un run est déjà en cours pour cette entreprise.")

    cfg = _load_cfg()
    ai_key, ai_model = await _resolve_ai_creds()
    asyncio.create_task(_do_discover(
        company_id, company.name, company.domain,
        cfg.get("proxies") or [], ai_key, ai_model,
    ))
    return {"ok": True, "message": f"Découverte lancée pour « {company.name} »."}


async def _do_discover(
    company_id: int, name: str, domain: Optional[str],
    proxies: list[str], ai_key: Optional[str], ai_model: Optional[str],
) -> None:
    from app.db.database import AsyncSessionLocal
    from app.services.company_scraper_service import discover_careers_url

    logs: list[dict] = []
    _run_status[company_id] = {
        "running": True, "phase": "discovering",
        "message": f"Recherche de l'URL carrières pour « {name} »…",
        "logs": logs,
    }

    def log_cb(level: str, msg: str) -> None:
        logs.append({"level": level, "msg": msg})
        _run_status[company_id]["logs"] = logs[:]
        _run_status[company_id]["message"] = msg

    try:
        result = await discover_careers_url(name, domain, proxies, ai_key, ai_model, log_cb=log_cb)
        url = result.get("url")
        async with AsyncSessionLocal() as db:
            co = await db.get(Company, company_id)
            if co:
                co.careers_url   = url
                co.ats_type      = result.get("ats_type") or "unknown"
                co.ats_slug      = result.get("ats_slug")
                co.scrape_status = "discovered" if url else "error"
                co.error_msg     = None if url else "URL non trouvée — vérifiez le nom ou le domaine."
                await db.commit()
        _run_status[company_id] = {
            "running": False, "phase": "done" if url else "error",
            "message": f"URL trouvée ({result.get('method')}) : {url}" if url else "URL non trouvée.",
            "url": url, "ats_type": result.get("ats_type"), "method": result.get("method"),
            "logs": logs,
        }
    except Exception as exc:
        from loguru import logger
        logger.error(f"[Company-Discover] id={company_id}: {exc}")
        logs.append({"level": "error", "msg": f"Exception : {exc}"})
        _run_status[company_id] = {
            "running": False, "phase": "error", "message": str(exc)[:200],
            "logs": logs,
        }
        async with AsyncSessionLocal() as db:
            co = await db.get(Company, company_id)
            if co:
                co.scrape_status = "error"
                co.error_msg = str(exc)[:500]
                await db.commit()


# ── Scrape ────────────────────────────────────────────────────────────────────

@router.post("/{company_id}/scrape", status_code=202)
async def scrape_one(company_id: int, db: DBSession) -> dict:
    company = await db.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Entreprise introuvable.")
    if not company.careers_url:
        raise HTTPException(status_code=422, detail="URL carrières manquante. Lancez d'abord la découverte.")
    if _run_status.get(company_id, {}).get("running"):
        raise HTTPException(status_code=409, detail="Un run est déjà en cours.")

    cfg = _load_cfg()
    ai_key, ai_model = await _resolve_ai_creds()
    asyncio.create_task(_do_scrape(
        company_id, company.name, company.careers_url,
        company.ats_type or "custom", company.ats_slug,
        cfg.get("proxies") or [], ai_key, ai_model,
    ))
    return {"ok": True, "message": f"Scraping lancé pour « {company.name} »."}


@router.post("/scrape-all", status_code=202)
async def scrape_all(db: DBSession) -> dict:
    result = await db.execute(select(Company).where(Company.enabled == True))
    companies = result.scalars().all()
    active = [c for c in companies if c.careers_url and not _run_status.get(c.id, {}).get("running")]
    if not active:
        return {"ok": False, "message": "Aucune entreprise active avec une URL configurée.", "launched": 0}

    cfg = _load_cfg()
    ai_key, ai_model = await _resolve_ai_creds()
    for c in active:
        asyncio.create_task(_do_scrape(
            c.id, c.name, c.careers_url,
            c.ats_type or "custom", c.ats_slug,
            cfg.get("proxies") or [], ai_key, ai_model,
        ))
    return {"ok": True, "message": f"{len(active)} scraping(s) lancés.", "launched": len(active)}


async def _do_scrape(
    company_id: int, name: str, careers_url: str,
    ats_type: str, ats_slug: Optional[str],
    proxies: list[str], ai_key: Optional[str], ai_model: Optional[str],
) -> None:
    from app.db.database import AsyncSessionLocal
    from app.services.company_scraper_service import scrape_company, save_jobs_to_db

    _run_status[company_id] = {
        "running": True, "phase": "scraping",
        "message": f"Scraping de « {name} » via {ats_type}…",
    }
    try:
        jobs = await scrape_company(name, careers_url, ats_type, ats_slug, proxies, ai_key, ai_model)
        count = await save_jobs_to_db(jobs, name, company_id)
        async with AsyncSessionLocal() as db:
            co = await db.get(Company, company_id)
            if co:
                co.last_scraped_at = datetime.utcnow()
                co.jobs_found      = count
                co.scrape_status   = "done"
                co.error_msg       = None
                await db.commit()
        _run_status[company_id] = {
            "running": False, "phase": "done",
            "message": f"{count} nouvelle(s) offre(s) ajoutée(s).",
            "jobs_found": count,
        }
    except Exception as exc:
        from loguru import logger
        logger.error(f"[Company-Scrape] id={company_id}: {exc}")
        _run_status[company_id] = {"running": False, "phase": "error", "message": str(exc)[:200]}
        async with AsyncSessionLocal() as db:
            co = await db.get(Company, company_id)
            if co:
                co.scrape_status = "error"
                co.error_msg = str(exc)[:500]
                await db.commit()
