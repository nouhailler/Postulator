"""
app/api/routes/cvs.py
Gestion des CVs : upload, liste, suppression, set default.

Routes :
  GET    /api/cvs               → liste des CVs
  POST   /api/cvs/upload        → upload + parsing
  GET    /api/cvs/{id}          → détail d'un CV
  PATCH  /api/cvs/{id}          → renommer / set default
  DELETE /api/cvs/{id}          → suppression
  POST   /api/cvs/{id}/analyze  → extraction skills via Ollama
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
    "application/octet-stream",   # fallback navigateurs
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
    # Vérification taille
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
        # Un seul CV peut être default → reset les autres
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
async def analyze_cv(
    cv_id: int,
    db: DBSession,
    model: str | None = None,
) -> CVRead:
    """Lance l'extraction de compétences Ollama sur un CV."""
    cv = await db.get(CV, cv_id)
    if not cv:
        raise HTTPException(status_code=404, detail=f"CV {cv_id} introuvable.")

    from app.services.cv_service import CVService

    svc = CVService(db)
    cv = await svc.analyze(cv, model=model)
    await db.commit()
    await db.refresh(cv)
    return cv
