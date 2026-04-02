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
) -> StoredCVFull:
    """
    Importe un PDF, extrait le texte brut via PyMuPDF,
    puis envoie le texte à Ollama qui remplit chaque section du CV.
    Retourne un StoredCV pré-rempli que l'utilisateur peut ensuite valider/corriger.
    """
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

    # Parser via Ollama
    sections = await _parse_cv_with_ollama(raw_text, model or settings.ollama_model, settings.ollama_base_url)

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


async def _parse_cv_with_ollama(raw_text: str, model: str, base_url: str) -> dict:
    """
    Envoie le texte brut du CV à Ollama et demande de remplir
    chaque section en JSON structuré.
    """
    prompt = f"""Tu es un expert en analyse de CV. Extrais les informations du CV ci-dessous
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

    try:
        import httpx
        import ollama as ol
        client = ol.AsyncClient(
            host=base_url,
            timeout=httpx.Timeout(connect=10, read=300, write=10, pool=5),
        )
        response = await client.generate(
            model=model,
            prompt=prompt,
            stream=False,
            options={"temperature": 0.1, "num_predict": 1500},
        )
        raw = response["response"].strip()
        # Nettoyer le JSON
        if "```" in raw:
            parts = raw.split("```")
            for p in parts:
                p = p.strip()
                if p.startswith("json"): p = p[4:].strip()
                if p.startswith("{"): raw = p; break
        start = raw.find("{")
        end   = raw.rfind("}")
        if start != -1 and end > start:
            raw = raw[start:end+1]
        data = json.loads(raw)
        # Filtrer uniquement les clés attendues
        allowed = {"full_name","title","email","phone","location","linkedin_url",
                   "github_url","website_url","summary","experiences","education",
                   "skills","languages","certifications","projects","interests"}
        return {k: (v if isinstance(v, str) else None) for k, v in data.items() if k in allowed}
    except Exception as e:
        from loguru import logger
        logger.error(f"[CVStore] Ollama parse error: {e}")
        return {}
