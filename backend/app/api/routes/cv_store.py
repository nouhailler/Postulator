"""
app/api/routes/cv_store.py
Gestion des CVs utilisateur nommés et datés.

Routes :
  GET    /api/cv-store              → liste tous les CVs
  POST   /api/cv-store              → crée un CV vide avec un nom
  GET    /api/cv-store/{id}         → détail d'un CV
  PUT    /api/cv-store/{id}         → sauvegarde toutes les sections
  DELETE /api/cv-store/{id}         → suppression
  POST   /api/cv-store/import-pdf   → importe un PDF et parse via Ollama
"""
import json
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import select

from app.api.deps import AppSettings, DBSession
from app.models.stored_cv import StoredCV

router = APIRouter(prefix="/cv-store", tags=["CV Store"])

UPLOAD_DIR = Path("uploads/cv-store")


# ── Schémas ───────────────────────────────────────────────────────────────────

class StoredCVSummary(BaseModel):
    id:         int
    name:       str
    created_at: datetime
    updated_at: datetime
    full_name:  Optional[str] = None
    title:      Optional[str] = None
    source_pdf: Optional[str] = None
    model_config = {"from_attributes": True}


class StoredCVFull(BaseModel):
    id:           int
    name:         str
    created_at:   datetime
    updated_at:   datetime
    source_pdf:   Optional[str] = None
    full_name:    Optional[str] = None
    title:        Optional[str] = None
    email:        Optional[str] = None
    phone:        Optional[str] = None
    location:     Optional[str] = None
    linkedin_url: Optional[str] = None
    github_url:   Optional[str] = None
    website_url:  Optional[str] = None
    summary:      Optional[str] = None
    experiences:  Optional[str] = None
    education:    Optional[str] = None
    skills:       Optional[str] = None
    languages:    Optional[str] = None
    certifications: Optional[str] = None
    projects:     Optional[str] = None
    interests:    Optional[str] = None
    model_config = {"from_attributes": True}


class StoredCVCreate(BaseModel):
    name: str


class StoredCVUpdate(BaseModel):
    name:         Optional[str] = None
    full_name:    Optional[str] = None
    title:        Optional[str] = None
    email:        Optional[str] = None
    phone:        Optional[str] = None
    location:     Optional[str] = None
    linkedin_url: Optional[str] = None
    github_url:   Optional[str] = None
    website_url:  Optional[str] = None
    summary:      Optional[str] = None
    experiences:  Optional[str] = None
    education:    Optional[str] = None
    skills:       Optional[str] = None
    languages:    Optional[str] = None
    certifications: Optional[str] = None
    projects:     Optional[str] = None
    interests:    Optional[str] = None


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("", response_model=list[StoredCVSummary])
async def list_cvs(db: DBSession) -> list[StoredCVSummary]:
    result = await db.execute(select(StoredCV).order_by(StoredCV.created_at.desc()))
    return result.scalars().all()


@router.post("", response_model=StoredCVFull, status_code=201)
async def create_cv(payload: StoredCVCreate, db: DBSession) -> StoredCVFull:
    cv = StoredCV(name=payload.name)
    db.add(cv)
    await db.commit()
    await db.refresh(cv)
    return cv


@router.get("/{cv_id}", response_model=StoredCVFull)
async def get_cv(cv_id: int, db: DBSession) -> StoredCVFull:
    cv = await db.get(StoredCV, cv_id)
    if not cv:
        raise HTTPException(status_code=404, detail=f"CV {cv_id} introuvable.")
    return cv


@router.put("/{cv_id}", response_model=StoredCVFull)
async def update_cv(cv_id: int, payload: StoredCVUpdate, db: DBSession) -> StoredCVFull:
    cv = await db.get(StoredCV, cv_id)
    if not cv:
        raise HTTPException(status_code=404, detail=f"CV {cv_id} introuvable.")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(cv, field, value)
    cv.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(cv)
    return cv


@router.delete("/{cv_id}", status_code=204)
async def delete_cv(cv_id: int, db: DBSession) -> None:
    cv = await db.get(StoredCV, cv_id)
    if not cv:
        raise HTTPException(status_code=404, detail=f"CV {cv_id} introuvable.")
    await db.delete(cv)
    await db.commit()


@router.post("/import-pdf", response_model=StoredCVFull, status_code=201)
async def import_pdf(
    db: DBSession,
    settings: AppSettings,
    file: UploadFile = File(...),
    name: str = Form(...),
    model: Optional[str] = Form(None),
    provider: Optional[str] = Form(None),  # 'auto' | 'ollama' | 'openrouter'
) -> StoredCVFull:
    """
    Importe un PDF, extrait le texte brut via PyMuPDF,
    puis envoie le texte à Ollama ou OpenRouter qui remplit chaque section du CV.
    Retourne un StoredCV pré-rempli que l'utilisateur peut ensuite valider/corriger.
    """
    from loguru import logger
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    content = await file.read()
    if len(content) > 15 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Fichier trop volumineux (max 15 MB).")

    # Sauvegarder le PDF
    ts  = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
    dest = UPLOAD_DIR / f"{ts}_{file.filename}"
    dest.write_bytes(content)

    # Extraire le texte
    raw_text = _extract_pdf_text(dest)
    if not raw_text.strip():
        raise HTTPException(status_code=422, detail="Impossible d'extraire le texte du PDF.")

    # Choisir le moteur IA selon le paramètre provider
    from app.services.openrouter_service import load_openrouter_config
    or_cfg = await load_openrouter_config(db)

    effective_provider = provider or 'auto'
    sections: dict = {}

    if effective_provider == 'ollama':
        # Forcer Ollama
        logger.info("[CVStore] import PDF → Ollama (force)")
        sections = await _parse_cv_with_ollama(raw_text, model or settings.ollama_model, settings.ollama_base_url)

    elif effective_provider == 'openrouter':
        # Forcer OpenRouter — erreur si non configuré
        if not or_cfg:
            raise HTTPException(status_code=400, detail="OpenRouter non configuré. Allez dans Paramètres → OpenRouter.")
        logger.info(f"[CVStore] import PDF → OpenRouter (force, model={or_cfg.model})")
        sections = await _parse_cv_with_openrouter(raw_text, or_cfg.api_key, or_cfg.model or "")

    else:
        # Auto : OR si dispo, sinon Ollama ; fallback Ollama si OR échoue
        if or_cfg:
            logger.info(f"[CVStore] import PDF → OpenRouter (auto, model={or_cfg.model})")
            sections = await _parse_cv_with_openrouter(raw_text, or_cfg.api_key, or_cfg.model or "")
        if not sections:
            if or_cfg:
                logger.warning("[CVStore] OpenRouter retourné vide → fallback Ollama")
            else:
                logger.info("[CVStore] import PDF → Ollama (auto)")
            sections = await _parse_cv_with_ollama(raw_text, model or settings.ollama_model, settings.ollama_base_url)

    # Si toutes les sections sont vides, retourner une erreur claire
    if not sections:
        logger.error(f"[CVStore] Aucune section parsée — sections vides après IA. provider={effective_provider}")
        raise HTTPException(
            status_code=503,
            detail=(
                "Le modèle IA n'a pas pu analyser le CV (réponse vide ou invalide). "
                "Vérifiez qu'Ollama est actif et que le modèle est chargé, "
                "ou configurez un modèle OpenRouter plus puissant dans Paramètres."
            ),
        )

    # Créer le StoredCV
    cv = StoredCV(
        name=name,
        source_pdf=str(dest),
        **sections,
    )
    db.add(cv)
    await db.commit()
    await db.refresh(cv)
    return cv


# ── Helpers ───────────────────────────────────────────────────────────────────

def _extract_pdf_text(path: Path) -> str:
    try:
        import fitz
        doc = fitz.open(str(path))
        return "\n".join(page.get_text() for page in doc)
    except Exception as e:
        from loguru import logger
        logger.error(f"[CVStore] PDF extraction error: {e}")
        return ""


_ALLOWED_SECTIONS = {
    "full_name","title","email","phone","location","linkedin_url",
    "github_url","website_url","summary","experiences","education",
    "skills","languages","certifications","projects","interests",
}

def _cv_parse_prompt(raw_text: str, compact: bool = False) -> str:
    if compact:
        # Version courte pour modèles lents (CPU)
        return f"""Extract CV info as JSON. Keys: full_name, title, email, phone, location, summary, skills, experiences, education, languages. Use null if absent. Only JSON, no markdown.

CV:
{raw_text[:3000]}"""
    return f"""Tu es un expert en analyse de CV. Extrais les informations du CV ci-dessous
et retourne un objet JSON avec exactement ces clés (chaînes de texte, null si absent).
Ne traduis pas, conserve la langue d'origine.

Clés attendues :
- full_name : prénom et nom
- title : titre professionnel actuel
- email : adresse email
- phone : téléphone
- location : ville/pays
- linkedin_url : URL LinkedIn complète
- github_url : URL GitHub complète
- website_url : site web personnel
- summary : résumé/profil professionnel (paragraphe complet)
- experiences : toutes les expériences professionnelles en Markdown structuré (## Poste · Entreprise (dates)\\n- réalisation...)
- education : formations et diplômes en Markdown (## Diplôme · École (dates))
- skills : compétences techniques séparées par des virgules
- languages : langues parlées avec niveau (ex: Français natif, Anglais C1)
- certifications : certifications obtenues
- projects : projets personnels/open source
- interests : centres d'intérêt

CV à analyser :
{raw_text[:4000]}

Réponds UNIQUEMENT avec l'objet JSON, sans texte autour, sans markdown."""

def _parse_json_sections(raw: str) -> dict:
    """Parse le JSON retourné par le LLM, avec récupération des JSONs tronqués."""
    # Extraire le contenu d'un bloc ```json...```
    if "```" in raw:
        parts = raw.split("```")
        for p in parts:
            p = p.strip()
            if p.startswith("json"): p = p[4:].strip()
            if p.startswith("{"): raw = p; break

    start = raw.find("{")
    end   = raw.rfind("}")
    if start != -1 and end > start:
        clean = raw[start:end+1]
    elif start != -1:
        clean = raw[start:]  # JSON tronqué : pas de } final
    else:
        clean = raw

    # Tentative 1 : JSON complet
    try:
        data = json.loads(clean)
        return {k: (v if isinstance(v, str) else None) for k, v in data.items() if k in _ALLOWED_SECTIONS}
    except json.JSONDecodeError:
        pass

    # Tentative 2 : JSON tronqué — extraire les paires clé-valeur complètes
    result: dict[str, str] = {}
    import re
    # Chercher les paires "clé": "valeur" (chaînes simples, sans \n dans la valeur pour éviter les faux positifs)
    pattern = re.compile(r'"([a-z_]+)"\s*:\s*"((?:[^"\\]|\\.)*?)"', re.DOTALL)
    for m in pattern.finditer(clean):
        key, val = m.group(1), m.group(2)
        if key in _ALLOWED_SECTIONS:
            # Décoder les séquences d'échappement JSON
            try:
                result[key] = json.loads(f'"{val}"')
            except Exception:
                result[key] = val
    return result


async def _parse_cv_with_openrouter(raw_text: str, api_key: str, model: str) -> dict:
    """Envoie le texte du CV à OpenRouter pour extraction JSON structuré."""
    prompt = _cv_parse_prompt(raw_text)
    try:
        import httpx
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://postulator.app",
            "X-Title": "Postulator",
        }
        body = {
            "model": model or "openai/gpt-4o-mini",
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.1,
            "max_tokens": 4096,
        }
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers=headers,
                json=body,
            )
            resp.raise_for_status()
            choice = resp.json()["choices"][0]["message"]
            raw = choice.get("content") or ""
            if not raw.strip():
                raise ValueError(f"OpenRouter a retourné un contenu vide (model={model or 'default'})")
            raw = raw.strip()
        return _parse_json_sections(raw)
    except Exception as e:
        from loguru import logger
        logger.error(f"[CVStore] OpenRouter parse error: {e}")
        return {}


# Ordre de préférence pour le parsing JSON structuré
_JSON_MODEL_PREFERENCE = ["qwen2.5", "qwen", "llama3", "llama", "mistral", "gemma"]

async def _best_ollama_model(base_url: str, configured: str) -> str:
    """Retourne le meilleur modèle Ollama disponible pour la génération JSON."""
    from loguru import logger
    import httpx
    try:
        base = base_url.rstrip("/")
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(f"{base}/api/tags")
            models = [m["name"] for m in resp.json().get("models", [])]
        for pref in _JSON_MODEL_PREFERENCE:
            for m in models:
                if pref in m.lower():
                    if m != configured:
                        logger.info(f"[CVStore] Modèle JSON optimal: {m} (préféré à {configured})")
                    return m
    except Exception:
        pass
    return configured


async def _parse_cv_with_ollama(raw_text: str, model: str, base_url: str) -> dict:
    """Envoie le texte brut du CV à Ollama via REST et demande de remplir chaque section en JSON."""
    from loguru import logger
    import httpx
    prompt = _cv_parse_prompt(raw_text, compact=True)  # prompt court pour CPU
    # Choisir le meilleur modèle disponible
    effective_model = await _best_ollama_model(base_url, model)
    logger.info(f"[CVStore] Ollama parse → model={effective_model}")
    try:
        base = base_url.rstrip("/")
        payload = {
            "model": effective_model,
            "prompt": prompt,
            "stream": False,
            "options": {"temperature": 0.1, "num_predict": 1200},
        }
        async with httpx.AsyncClient(timeout=httpx.Timeout(connect=10, read=600, write=10, pool=5)) as client:
            resp = await client.post(f"{base}/api/generate", json=payload)
            resp.raise_for_status()
            raw = resp.json().get("response", "").strip()
        if not raw:
            raise ValueError("Ollama a retourné une réponse vide")
        logger.debug(f"[CVStore] Ollama raw (first 300): {raw[:300]}")
        return _parse_json_sections(raw)
    except Exception as e:
        logger.error(f"[CVStore] Ollama parse error: {e}")
        return {}
