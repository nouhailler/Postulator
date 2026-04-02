"""
app/api/routes/cv_matching.py
Génération et gestion des CVs adaptés à des offres spécifiques.

Routes :
  GET    /api/cv-matching                  → liste des CVs générés
  POST   /api/cv-matching/generate         → génère + sauvegarde un CV pour une offre
  GET    /api/cv-matching/{id}             → détail d'un CV généré
  GET    /api/cv-matching/{id}/export/docx → export DOCX via pandoc
  PATCH  /api/cv-matching/{id}/notes       → ajouter une note
  DELETE /api/cv-matching/{id}             → suppression
"""
import re
import shutil
import subprocess
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import select

from app.api.deps import AppSettings, DBSession
from app.models.generated_cv import GeneratedCV
from app.models.job import Job
from app.models.stored_cv import StoredCV

router = APIRouter(prefix="/cv-matching", tags=["CV Matching"])


# ── Schémas ───────────────────────────────────────────────────────────────────

class GeneratedCVSummary(BaseModel):
    id:             int
    created_at:     datetime
    source_cv_id:   Optional[int]
    source_cv_name: str
    job_id:         Optional[int]
    job_title:      str
    job_company:    str
    job_url:        Optional[str]
    language:       str
    ollama_model:   Optional[str]
    notes:          Optional[str]
    model_config = {"from_attributes": True}


class GeneratedCVFull(GeneratedCVSummary):
    cv_markdown: str


class GenerateCVRequest(BaseModel):
    source_cv_id: int
    job_id:       int
    language:     Optional[str] = "fr"
    model:        Optional[str] = None


class NotesUpdate(BaseModel):
    notes: str


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("", response_model=list[GeneratedCVSummary])
async def list_generated(
    db:    DBSession,
    job_id: Optional[int] = None,
    cv_id:  Optional[int] = None,
    limit:  int = 50,
) -> list[GeneratedCVSummary]:
    stmt = select(GeneratedCV).order_by(GeneratedCV.created_at.desc()).limit(limit)
    if job_id: stmt = stmt.where(GeneratedCV.job_id == job_id)
    if cv_id:  stmt = stmt.where(GeneratedCV.source_cv_id == cv_id)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/generate", response_model=GeneratedCVFull, status_code=201)
async def generate_cv(
    payload:  GenerateCVRequest,
    db:       DBSession,
    settings: AppSettings,
) -> GeneratedCVFull:
    """Génère un CV Markdown adapté à l'offre et le sauvegarde en base."""
    source_cv = await db.get(StoredCV, payload.source_cv_id)
    if not source_cv:
        raise HTTPException(status_code=404, detail=f"CV source {payload.source_cv_id} introuvable.")

    job = await db.get(Job, payload.job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Offre {payload.job_id} introuvable.")

    model       = payload.model or settings.ollama_model
    cv_markdown = await _generate_with_ollama(
        source_cv, job, model, settings.ollama_base_url, payload.language or "fr"
    )

    gen = GeneratedCV(
        source_cv_id=source_cv.id,
        source_cv_name=source_cv.name,
        job_id=job.id,
        job_title=job.title,
        job_company=job.company,
        job_url=job.url,
        cv_markdown=cv_markdown,
        language=payload.language or "fr",
        ollama_model=model,
    )
    db.add(gen)
    await db.commit()
    await db.refresh(gen)
    return gen


@router.get("/{gen_id}", response_model=GeneratedCVFull)
async def get_generated(gen_id: int, db: DBSession) -> GeneratedCVFull:
    gen = await db.get(GeneratedCV, gen_id)
    if not gen:
        raise HTTPException(status_code=404, detail=f"CV généré {gen_id} introuvable.")
    return gen


@router.get("/{gen_id}/export/docx")
async def export_docx(gen_id: int, db: DBSession):
    """
    Exporte un CV généré en fichier Word (.docx) via pandoc.
    Requiert pandoc installé sur le système : apt install pandoc
    Si pandoc est absent, retourne une erreur 503 claire.
    """
    gen = await db.get(GeneratedCV, gen_id)
    if not gen:
        raise HTTPException(status_code=404, detail=f"CV généré {gen_id} introuvable.")

    # Vérifier que pandoc est disponible
    pandoc_path = shutil.which("pandoc")
    if not pandoc_path:
        raise HTTPException(
            status_code=503,
            detail=(
                "pandoc non installé sur le serveur. "
                "Installez-le avec : sudo apt install pandoc · "
                "L'export .md et .txt reste disponible depuis l'interface."
            ),
        )

    # Créer un répertoire temporaire pour les fichiers intermédiaires
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)
        md_file   = tmp / "cv.md"
        docx_file = tmp / "cv.docx"

        # Écrire le Markdown
        md_file.write_text(gen.cv_markdown or "", encoding="utf-8")

        # Nom de fichier sécurisé pour le téléchargement
        safe_company = re.sub(r'[^a-zA-Z0-9_\-]', '_', gen.job_company or "offre")
        safe_title   = re.sub(r'[^a-zA-Z0-9_\-]', '_', gen.job_title[:30] or "cv")
        filename     = f"CV_{safe_company}_{safe_title}.docx"

        try:
            # Conversion Markdown → DOCX avec pandoc
            result = subprocess.run(
                [pandoc_path, str(md_file), "-o", str(docx_file),
                 "--from=markdown", "--to=docx"],
                capture_output=True, text=True, timeout=30,
            )
            if result.returncode != 0:
                raise HTTPException(
                    status_code=500,
                    detail=f"Erreur pandoc : {result.stderr[:300]}"
                )
            if not docx_file.exists():
                raise HTTPException(status_code=500, detail="Le fichier DOCX n'a pas été généré.")

            # Copier dans /tmp pour que FastAPI puisse le servir
            # (le TemporaryDirectory est supprimé à la sortie du with)
            final_path = Path(tempfile.gettempdir()) / filename
            shutil.copy(docx_file, final_path)

        except subprocess.TimeoutExpired:
            raise HTTPException(status_code=504, detail="pandoc a mis trop de temps (timeout 30s).")

    return FileResponse(
        path=str(final_path),
        filename=filename,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        background=_cleanup_background(final_path),
    )


@router.patch("/{gen_id}/notes", response_model=GeneratedCVFull)
async def update_notes(gen_id: int, payload: NotesUpdate, db: DBSession) -> GeneratedCVFull:
    gen = await db.get(GeneratedCV, gen_id)
    if not gen:
        raise HTTPException(status_code=404, detail=f"CV généré {gen_id} introuvable.")
    gen.notes = payload.notes
    await db.commit()
    await db.refresh(gen)
    return gen


@router.delete("/{gen_id}", status_code=204)
async def delete_generated(gen_id: int, db: DBSession) -> None:
    gen = await db.get(GeneratedCV, gen_id)
    if not gen:
        raise HTTPException(status_code=404, detail=f"CV généré {gen_id} introuvable.")
    await db.delete(gen)
    await db.commit()


# ── Génération Ollama ─────────────────────────────────────────────────────────

async def _generate_with_ollama(
    cv: StoredCV, job: Job, model: str, base_url: str, lang: str
) -> str:
    lang_str = "en français" if lang == "fr" else "in English"

    ctx_parts = []
    if cv.full_name:    ctx_parts.append(f"Nom : {cv.full_name}")
    if cv.title:        ctx_parts.append(f"Titre : {cv.title}")
    if cv.email:        ctx_parts.append(f"Email : {cv.email}")
    if cv.phone:        ctx_parts.append(f"Tél : {cv.phone}")
    if cv.location:     ctx_parts.append(f"Lieu : {cv.location}")
    if cv.linkedin_url: ctx_parts.append(f"LinkedIn : {cv.linkedin_url}")
    if cv.github_url:   ctx_parts.append(f"GitHub : {cv.github_url}")
    if cv.summary:      ctx_parts.append(f"\nRésumé :\n{cv.summary}")
    if cv.skills:       ctx_parts.append(f"\nCompétences : {cv.skills}")
    if cv.experiences:  ctx_parts.append(f"\nExpériences :\n{cv.experiences}")
    if cv.education:    ctx_parts.append(f"\nFormation :\n{cv.education}")
    if cv.languages:    ctx_parts.append(f"\nLangues : {cv.languages}")
    if cv.certifications: ctx_parts.append(f"\nCertifications : {cv.certifications}")
    if cv.projects:     ctx_parts.append(f"\nProjets : {cv.projects}")

    desc_clean = re.sub(r'<[^>]+>', ' ', job.description or '')
    desc_clean = re.sub(r'\s+', ' ', desc_clean).strip()[:1200]

    prompt = f"""Tu es un expert RH senior et rédacteur de CV.
À partir du profil ci-dessous, génère un CV professionnel complet {lang_str} en Markdown,
parfaitement adapté à l'offre cible.

RÈGLES ABSOLUES :
- Ne jamais inventer ni falsifier une information
- Mettre en avant ce qui correspond à l'offre, sans mentir
- Réorganiser les expériences pour que les plus pertinentes apparaissent en premier
- Reformuler les descriptions pour utiliser les mots-clés de l'offre
- Rester concis et percutant (1-2 pages)

=== PROFIL SOURCE ===
{chr(10).join(ctx_parts)[:3000]}

=== OFFRE CIBLE ===
Titre : {job.title}
Entreprise : {job.company}
Description : {desc_clean}

=== FORMAT MARKDOWN REQUIS ===
# [Prénom NOM]
**[Titre adapté à l'offre]** | [Ville] | [Email] | [Tél]
[LinkedIn] | [GitHub si pertinent]

---
## Profil
[Résumé 3-4 phrases ciblées sur l'offre]

---
## Expériences
### [Poste] · [Entreprise] *(dates)*
- [Réalisation quantifiée en lien avec l'offre]

---
## Compétences
**[Catégorie]** : [skills pertinents pour l'offre en premier]

---
## Formation
### [Diplôme] · [École] *(année)*

---
## Langues
[Langue] (niveau)

[Sections Certifications/Projets si pertinents pour l'offre]

IMPORTANT : Réponds UNIQUEMENT avec le Markdown, aucun texte avant ou après."""

    try:
        import httpx
        import ollama as ol
        client = ol.AsyncClient(
            host=base_url,
            timeout=httpx.Timeout(connect=10, read=300, write=10, pool=5),
        )
        response = await client.generate(
            model=model, prompt=prompt, stream=False,
            options={"temperature": 0.3, "num_predict": 2000},
        )
        return response["response"].strip()
    except Exception as e:
        raise RuntimeError(f"Ollama error: {e}")


# ── Cleanup après FileResponse ────────────────────────────────────────────────

def _cleanup_background(path: Path):
    """Supprime le fichier temporaire après l'envoi de la réponse."""
    from starlette.background import BackgroundTask
    def _delete():
        try: path.unlink(missing_ok=True)
        except Exception: pass
    return BackgroundTask(_delete)
