"""
app/api/routes/cvs.py
Gestion des CVs : upload, liste, suppression, set default, import depuis stored_cvs.

Routes :
  GET    /api/cvs                         → liste des CVs
  POST   /api/cvs/upload                  → upload + parsing
  POST   /api/cvs/import-from-store/{id}  → import depuis un StoredCV (menu CV)
  GET    /api/cvs/{id}                    → détail d'un CV
  PATCH  /api/cvs/{id}                    → renommer / set default
  DELETE /api/cvs/{id}                    → suppression
  POST   /api/cvs/{id}/analyze            → extraction skills via Ollama
"""
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from sqlalchemy import select

from app.api.deps import DBSession
from app.models.cv import CV
from app.schemas.cv import CVRead, CVUpdate

router = APIRouter(prefix="/cvs", tags=["CVs"])

ALLOWED_CONTENT_TYPES = {
    "application/pdf",
    "text/plain",
    "text/markdown",
    "application/octet-stream",
}
MAX_SIZE_MB = 10


@router.get("", response_model=list[CVRead])
async def list_cvs(db: DBSession) -> list[CVRead]:
    result = await db.execute(select(CV).order_by(CV.uploaded_at.desc()))
    return result.scalars().all()


@router.post("/upload", response_model=CVRead, status_code=201)
async def upload_cv(
    db: DBSession,
    file: UploadFile = File(...),
    name: str = Form(..., description="Nom affiché dans l'UI"),
) -> CVRead:
    content = await file.read()
    if len(content) > MAX_SIZE_MB * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"Fichier trop volumineux (max {MAX_SIZE_MB} MB).")
    await file.seek(0)

    from app.services.cv_service import CVService
    svc = CVService(db)
    cv = await svc.upload(file, name)
    cv = await svc.parse(cv)
    await db.commit()
    await db.refresh(cv)
    return cv


@router.post("/import-from-store/{store_id}", response_model=CVRead, status_code=201)
async def import_from_store(store_id: int, db: DBSession) -> CVRead:
    """
    Importe un StoredCV (menu CV) dans la table cvs (CV Intelligence).
    Construit le texte brut à partir de toutes les sections du StoredCV
    et crée une entrée CV sans re-télécharger de fichier.
    Si un CV portant le même nom existe déjà, il est réutilisé (upsert par nom).
    """
    from app.models.stored_cv import StoredCV

    stored = await db.get(StoredCV, store_id)
    if not stored:
        raise HTTPException(status_code=404, detail=f"StoredCV {store_id} introuvable.")

    # Vérifier si un CV avec ce nom existe déjà → éviter les doublons
    existing = (await db.execute(
        select(CV).where(CV.name == stored.name)
    )).scalar_one_or_none()

    if existing:
        # On le renvoie tel quel (l'utilisateur peut cliquer "Activer" ensuite)
        return existing

    # Construire le texte brut à partir de toutes les sections du StoredCV
    raw_text = _build_raw_text(stored)

    # Créer l'entrée CV (sans fichier physique — raw_text directement)
    from datetime import datetime
    cv = CV(
        name=stored.name,
        filename=f"{stored.name}.txt",   # nom virtuel
        filepath="",                      # pas de fichier physique
        file_type="txt",
        raw_text=raw_text,
        parsed_at=datetime.utcnow(),
    )
    db.add(cv)
    await db.commit()
    await db.refresh(cv)
    return cv


@router.get("/{cv_id}", response_model=CVRead)
async def get_cv(cv_id: int, db: DBSession) -> CVRead:
    cv = await db.get(CV, cv_id)
    if not cv:
        raise HTTPException(status_code=404, detail=f"CV {cv_id} introuvable.")
    return cv


@router.patch("/{cv_id}", response_model=CVRead)
async def update_cv(cv_id: int, payload: CVUpdate, db: DBSession) -> CVRead:
    cv = await db.get(CV, cv_id)
    if not cv:
        raise HTTPException(status_code=404, detail=f"CV {cv_id} introuvable.")

    if payload.name is not None:
        cv.name = payload.name

    if payload.is_default is True:
        all_cvs = (await db.execute(select(CV))).scalars().all()
        for other in all_cvs:
            other.is_default = False
        cv.is_default = True

    await db.commit()
    await db.refresh(cv)
    return cv


@router.delete("/{cv_id}", status_code=204)
async def delete_cv(cv_id: int, db: DBSession) -> None:
    cv = await db.get(CV, cv_id)
    if not cv:
        raise HTTPException(status_code=404, detail=f"CV {cv_id} introuvable.")
    import os
    from pathlib import Path

    path = Path(cv.filepath)
    if path.exists():
        os.remove(path)
    await db.delete(cv)
    await db.commit()


@router.post("/{cv_id}/analyze", response_model=CVRead)
async def analyze_cv(cv_id: int, db: DBSession, model: str | None = None) -> CVRead:
    cv = await db.get(CV, cv_id)
    if not cv:
        raise HTTPException(status_code=404, detail=f"CV {cv_id} introuvable.")

    from app.services.cv_service import CVService
    svc = CVService(db)
    cv = await svc.analyze(cv, model=model)
    await db.commit()
    await db.refresh(cv)
    return cv


# ── Helper ────────────────────────────────────────────────────────────────────

def _build_raw_text(stored) -> str:
    """
    Construit un texte brut structuré à partir des sections d'un StoredCV.
    Ce texte est utilisé par Ollama pour le scoring et l'extraction de compétences.
    """
    parts = []

    # Identité
    if stored.full_name:    parts.append(f"Nom : {stored.full_name}")
    if stored.title:        parts.append(f"Titre : {stored.title}")
    if stored.email:        parts.append(f"Email : {stored.email}")
    if stored.phone:        parts.append(f"Téléphone : {stored.phone}")
    if stored.location:     parts.append(f"Localisation : {stored.location}")
    if stored.linkedin_url: parts.append(f"LinkedIn : {stored.linkedin_url}")
    if stored.github_url:   parts.append(f"GitHub : {stored.github_url}")

    # Sections texte
    if stored.summary:
        parts.append(f"\nRésumé professionnel :\n{stored.summary}")
    if stored.experiences:
        parts.append(f"\nExpériences professionnelles :\n{stored.experiences}")
    if stored.skills:
        parts.append(f"\nCompétences :\n{stored.skills}")
    if stored.education:
        parts.append(f"\nFormation :\n{stored.education}")
    if stored.languages:
        parts.append(f"\nLangues :\n{stored.languages}")
    if stored.certifications:
        parts.append(f"\nCertifications :\n{stored.certifications}")
    if stored.projects:
        parts.append(f"\nProjets :\n{stored.projects}")
    if stored.interests:
        parts.append(f"\nCentres d'intérêt :\n{stored.interests}")

    return "\n".join(parts)
