"""
app/api/routes/settings.py
Paramètres de l'application — configuration OpenRouter.

Routes :
  GET  /api/settings/openrouter          → état de la config (clé masquée)
  POST /api/settings/openrouter          → sauvegarde clé + modèle
  GET  /api/settings/openrouter/models   → liste des modèles gratuits OpenRouter
"""
from datetime import datetime

from fastapi import APIRouter
from pydantic import BaseModel

from app.api.deps import DBSession
from app.models.openrouter_config import OpenRouterConfig

router = APIRouter(prefix="/settings", tags=["Settings"])


# ── Schémas ───────────────────────────────────────────────────────────────────

class OpenRouterStatus(BaseModel):
    configured:  bool
    masked_key:  str   # "sk-or-...****" ou ""
    model:       str
    updated_at:  str | None = None


class OpenRouterSave(BaseModel):
    api_key: str
    model:   str = "deepseek/deepseek-r1:free"


# ── Helpers ───────────────────────────────────────────────────────────────────

def _mask_key(key: str) -> str:
    if not key:
        return ""
    if len(key) <= 8:
        return "••••••••"
    return key[:8] + "••••" + key[-4:]


async def _get_or_create(db: DBSession) -> OpenRouterConfig:
    cfg = await db.get(OpenRouterConfig, 1)
    if not cfg:
        cfg = OpenRouterConfig(id=1, api_key="", model="deepseek/deepseek-r1:free")
        db.add(cfg)
        await db.flush()
    return cfg


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/openrouter", response_model=OpenRouterStatus)
async def get_openrouter_config(db: DBSession) -> OpenRouterStatus:
    """Retourne l'état de la configuration OpenRouter (clé masquée)."""
    cfg = await _get_or_create(db)
    return OpenRouterStatus(
        configured=bool(cfg.api_key),
        masked_key=_mask_key(cfg.api_key),
        model=cfg.model or "deepseek/deepseek-r1:free",
        updated_at=cfg.updated_at.isoformat() if cfg.updated_at else None,
    )


@router.post("/openrouter", response_model=OpenRouterStatus)
async def save_openrouter_config(
    payload: OpenRouterSave,
    db:      DBSession,
) -> OpenRouterStatus:
    """Sauvegarde la clé API et le modèle OpenRouter."""
    cfg = await _get_or_create(db)
    cfg.api_key    = payload.api_key.strip()
    cfg.model      = payload.model.strip() or "deepseek/deepseek-r1:free"
    cfg.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(cfg)
    return OpenRouterStatus(
        configured=bool(cfg.api_key),
        masked_key=_mask_key(cfg.api_key),
        model=cfg.model,
        updated_at=cfg.updated_at.isoformat() if cfg.updated_at else None,
    )


@router.get("/openrouter/ping")
async def ping_openrouter(db: DBSession) -> dict:
    """
    Vérifie qu'OpenRouter est joignable et que la clé est valide.
    Teste avec un appel minimal (1 token) pour valider clé + modèle.
    """
    import httpx as _httpx
    cfg = await db.get(OpenRouterConfig, 1)
    if not cfg or not cfg.api_key:
        return {"ok": False, "error": "Aucune clé configurée.", "latency_ms": None}

    try:
        t0 = __import__("time").monotonic()
        async with _httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {cfg.api_key}",
                    "Content-Type":  "application/json",
                    "HTTP-Referer":  "https://postulator.local",
                    "X-Title":       "Postulator",
                },
                json={
                    "model":      cfg.model or "deepseek/deepseek-r1:free",
                    "messages":   [{"role": "user", "content": "ok"}],
                    "max_tokens": 5,
                },
            )
        latency_ms = int((__import__("time").monotonic() - t0) * 1000)

        if resp.status_code == 401:
            return {"ok": False, "error": "Clé API invalide (401 Unauthorized).", "latency_ms": None}
        if resp.status_code == 402:
            return {"ok": False, "error": "Quota insuffisant (402).", "latency_ms": None}
        if resp.status_code == 429:
            return {"ok": False, "error": "Rate limit atteint (429) — réessayez dans quelques secondes.", "latency_ms": None}
        if not resp.is_success:
            body = resp.text[:200]
            return {"ok": False, "error": f"HTTP {resp.status_code} : {body}", "latency_ms": None}

        data    = resp.json()
        content = data.get("choices", [{}])[0].get("message", {}).get("content")
        model   = cfg.model or "deepseek/deepseek-r1:free"

        if content is None:
            err = data.get("error", {}).get("message", "Réponse vide — modèle indisponible ou rate limit.")
            return {"ok": False, "error": err, "latency_ms": latency_ms, "model": model}

        return {"ok": True, "model": model, "latency_ms": latency_ms}

    except _httpx.ConnectError:
        return {"ok": False, "error": "Impossible de joindre openrouter.ai — vérifiez votre connexion.", "latency_ms": None}
    except _httpx.TimeoutException:
        return {"ok": False, "error": "Timeout (15s) — OpenRouter ne répond pas.", "latency_ms": None}
    except Exception as exc:
        return {"ok": False, "error": str(exc), "latency_ms": None}


@router.get("/openrouter/models")
async def list_openrouter_models(db: DBSession) -> list[dict]:
    """Retourne la liste des modèles gratuits disponibles sur OpenRouter."""
    from app.services.openrouter_service import get_free_models
    cfg = await db.get(OpenRouterConfig, 1)
    api_key = cfg.api_key if cfg else None
    return await get_free_models(api_key)
