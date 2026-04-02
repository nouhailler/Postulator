"""
app/main.py
Point d'entrée FastAPI de Postulator.

Lancement dev :
    uvicorn app.main:app --reload --port 8000
"""
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger

from app.api.router import api_router
from app.core.config import get_settings
from app.core.logging import setup_logging
from app.db.database import create_tables

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ──────────────────────────────────────────────────────────────
    setup_logging(debug=settings.debug)
    logger.info(f"🚀 {settings.app_name} v{settings.app_version} démarrage…")

    # Dossiers nécessaires
    for folder in ("uploads/cvs", "logs"):
        Path(folder).mkdir(parents=True, exist_ok=True)

    # Tables SQLite
    import app.models  # noqa: F401 — enregistre tous les modèles auprès de Base
    await create_tables()
    logger.info("✅ Base de données initialisée.")
    logger.info(f"📡 CORS : {settings.cors_origins_list}")
    logger.info(f"🤖 Ollama : {settings.ollama_base_url}  modèle : {settings.ollama_model}")

    # Préchargement du modèle Ollama en VRAM (évite le timeout sur la 1ère requête)
    # Exécuté en tâche de fond pour ne pas bloquer le démarrage de l'API
    import asyncio
    from app.services.ollama_service import OllamaService

    async def _warmup():
        await asyncio.sleep(2)  # laisse le temps à uvicorn de finir son init
        svc = OllamaService()
        await svc.warmup()

    asyncio.create_task(_warmup())

    yield

    # ── Shutdown ─────────────────────────────────────────────────────────────
    logger.info("👋 Arrêt de Postulator.")


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description=(
        "API Postulator — Agrégateur de recherche d'emploi avec IA locale (Ollama). "
        "Open Source · Self-hosted · Privacy-first."
    ),
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.get("/", tags=["Health"])
async def root() -> dict:
    return {
        "app": settings.app_name,
        "version": settings.app_version,
        "status": "online",
        "docs": "/docs",
    }


@app.get("/health", tags=["Health"])
async def health() -> dict:
    return {"status": "ok"}
