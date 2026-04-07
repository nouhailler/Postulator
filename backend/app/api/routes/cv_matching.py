"""
app/api/routes/cv_matching.py
Génération et gestion des CVs adaptés à des offres spécifiques.

Routes :
  GET    /api/cv-matching                  → liste des CVs générés
  POST   /api/cv-matching/generate         → génère + sauvegarde un CV pour une offre
  GET    /api/cv-matching/{id}             → détail d'un CV généré (avec source_cv_text)
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
    cv_markdown:    str
    source_cv_text: Optional[str] = None   # ← snapshot du CV original pour le diff


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

    # Construire le texte brut du CV original pour le diff frontend
    source_cv_text = _build_source_text(source_cv)

    gen = GeneratedCV(
        source_cv_id=source_cv.id,
        source_cv_name=source_cv.name,
        source_cv_text=source_cv_text,   # ← snapshot pour le diff
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
    gen = await db.get(GeneratedCV, gen_id)
    if not gen:
        raise HTTPException(status_code=404, detail=f"CV généré {gen_id} introuvable.")

    pandoc_path = shutil.which("pandoc")
    if not pandoc_path:
        raise HTTPException(
            status_code=503,
            detail="pandoc non installé sur le serveur. Installez-le avec : sudo apt install pandoc",
        )

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)
        md_file   = tmp / "cv.md"
        docx_file = tmp / "cv.docx"
        md_file.write_text(gen.cv_markdown or "", encoding="utf-8")

        safe_company = re.sub(r'[^a-zA-Z0-9_\-]', '_', gen.job_company or "offre")
        safe_title   = re.sub(r'[^a-zA-Z0-9_\-]', '_', gen.job_title[:30] or "cv")
        filename     = f"CV_{safe_company}_{safe_title}.docx"

        try:
            result = subprocess.run(
                [pandoc_path, str(md_file), "-o", str(docx_file),
                 "--from=markdown", "--to=docx"],
                capture_output=True, text=True, timeout=30,
            )
            if result.returncode != 0:
                raise HTTPException(status_code=500, detail=f"Erreur pandoc : {result.stderr[:300]}")
            if not docx_file.exists():
                raise HTTPException(status_code=500, detail="Le fichier DOCX n'a pas été généré.")
            final_path = Path(tempfile.gettempdir()) / filename
            shutil.copy(docx_file, final_path)
        except subprocess.TimeoutExpired:
            raise HTTPException(status_code=504, detail="pandoc timeout 30s.")

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


# ── Helpers ───────────────────────────────────────────────────────────────────

def _clean_html(text: str) -> str:
    if not text:
        return ""
    clean = re.sub(r'<[^>]+>', ' ', text)
    clean = clean.replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>')
    clean = clean.replace('&nbsp;', ' ').replace('&quot;', '"').replace('&#39;', "'")
    return re.sub(r'\s+', ' ', clean).strip()


def _build_cv_context(cv: StoredCV) -> dict:
    return {
        "identity": "\n".join(filter(None, [
            f"Nom : {cv.full_name}" if cv.full_name else "",
            f"Titre : {cv.title}" if cv.title else "",
            f"Email : {cv.email}" if cv.email else "",
            f"Tél : {cv.phone}" if cv.phone else "",
            f"Lieu : {cv.location}" if cv.location else "",
            f"LinkedIn : {cv.linkedin_url}" if cv.linkedin_url else "",
            f"GitHub : {cv.github_url}" if cv.github_url else "",
        ])),
        "summary":        cv.summary or "",
        "experiences":    cv.experiences or "",
        "skills":         cv.skills or "",
        "education":      cv.education or "",
        "languages":      cv.languages or "",
        "certifications": cv.certifications or "",
        "projects":       cv.projects or "",
    }


def _build_source_text(cv: StoredCV) -> str:
    """
    Reconstruit le texte complet du CV original sous forme de texte brut.
    Utilisé pour le diff côté frontend afin de surligner les parties modifiées.
    """
    parts = []
    if cv.full_name:      parts.append(cv.full_name)
    if cv.title:          parts.append(cv.title)
    if cv.summary:        parts.append(cv.summary)
    if cv.experiences:    parts.append(cv.experiences)
    if cv.skills:         parts.append(cv.skills)
    if cv.education:      parts.append(cv.education)
    if cv.languages:      parts.append(cv.languages)
    if cv.certifications: parts.append(cv.certifications)
    if cv.projects:       parts.append(cv.projects)
    return "\n\n".join(parts)


def _section(title: str, content: str) -> str:
    if not content or not content.strip():
        return ""
    return f"[{title}]\n{content.strip()}\n"


# ── Génération Ollama ─────────────────────────────────────────────────────────

async def _generate_with_ollama(
    cv: StoredCV, job: Job, model: str, base_url: str, lang: str
) -> str:
    import httpx
    import ollama as ol

    ctx = _build_cv_context(cv)
    desc_clean = _clean_html(job.description or "")[:2000]
    lang_label = "français" if lang == "fr" else "English"

    prompt = f"""Tu es un consultant RH expert en optimisation de CV.

=== OFFRE D'EMPLOI CIBLE ===
Poste : {job.title}
Entreprise : {job.company}
Description complète :
{desc_clean}

=== CV SOURCE DU CANDIDAT ===
{_section("IDENTITÉ", ctx["identity"])}
{_section("RÉSUMÉ PROFESSIONNEL ACTUEL", ctx["summary"])}
{_section("EXPÉRIENCES PROFESSIONNELLES", ctx["experiences"])}
{_section("COMPÉTENCES TECHNIQUES", ctx["skills"])}
{_section("FORMATION", ctx["education"])}
{_section("LANGUES", ctx["languages"])}
{_section("CERTIFICATIONS", ctx["certifications"])}
{_section("PROJETS", ctx["projects"])}

=== TON TRAVAIL EN 3 ÉTAPES ===

ÉTAPE 1 — Analyse de l'offre (mentalement, ne pas écrire) :
Identifie : compétences techniques requises, mots-clés métier, niveau d'expérience attendu,
secteur d'activité, type de poste (management/technique/mixte).

ÉTAPE 2 — Décide ce qui est pertinent dans le CV :
- Ce qui correspond directement à l'offre → METTRE EN AVANT, reformuler avec les mots-clés de l'offre
- Ce qui est partiellement lié → CONSERVER mais reformuler pour créer un lien
- Ce qui est hors-sujet → MINIMISER ou OMETTRE

ÉTAPE 3 — Génère le CV adapté en {lang_label} avec ces règles STRICTES :

**RÉSUMÉ PROFESSIONNEL (3-4 phrases) :**
- Doit mentionner explicitement le type de poste visé ({job.title})
- Doit inclure au moins 3 compétences/mots-clés directement tirés de l'offre
- Doit valoriser l'expérience la plus pertinente pour ce poste
- Ne pas copier-coller le résumé original : le réécrire entièrement pour ce poste

**EXPÉRIENCES PROFESSIONNELLES :**
- Trier : l'expérience la plus pertinente pour l'offre en PREMIER
- Pour chaque expérience pertinente : reformuler les bullets pour utiliser le vocabulaire de l'offre
- Pour chaque bullet : préférer "Réalisé X, ce qui a produit Y" plutôt que "Responsable de X"
- Expériences non liées à l'offre : réduire à 1-2 lignes maximum ou omettre

**COMPÉTENCES TECHNIQUES :**
- Mettre EN PREMIER les compétences qui apparaissent dans l'offre
- Créer une catégorie dédiée pour les technologies/outils demandés dans l'offre
- Compétences non mentionnées dans l'offre : regrouper en "Autres compétences"
- Ne pas inventer de compétences absentes du CV source

**FORMAT DE SORTIE OBLIGATOIRE (Markdown strict) :**

# {cv.full_name or "[Prénom NOM]"}
**{job.title}** | {cv.location or "[Ville]"} | {cv.email or "[email]"}{" | " + cv.phone if cv.phone else ""}
{(cv.linkedin_url + " | ") if cv.linkedin_url else ""}{cv.github_url if cv.github_url else ""}

---
## Résumé professionnel
[Résumé réécrit pour ce poste]

---
## Expériences professionnelles
### [Titre poste] · [Entreprise] *(mois année – mois année)*
- [Réalisation avec impact mesurable]
- [Réalisation avec mots-clés de l'offre]

---
## Compétences techniques
**[Technologies demandées dans l'offre]** : [liste]
**[Autres domaines]** : [liste]

---
## Formation
### [Diplôme] · [Établissement] *(année)*

---
## Langues
- [Langue] : [Niveau]

RÈGLE ABSOLUE : Réponds UNIQUEMENT avec le Markdown du CV. Aucun commentaire, aucun texte introductif, aucune explication avant ou après le CV.
"""

    client = ol.AsyncClient(
        host=base_url,
        timeout=httpx.Timeout(connect=10, read=360, write=10, pool=5),
    )

    try:
        response = await client.generate(
            model=model, prompt=prompt, stream=False,
            options={"temperature": 0.25, "num_predict": 2500},
        )
        raw = response["response"].strip()
        md_start = raw.find("#")
        if md_start > 0:
            raw = raw[md_start:]
        return raw
    except Exception as e:
        raise RuntimeError(f"Ollama error : {e}")


def _cleanup_background(path: Path):
    from starlette.background import BackgroundTask
    def _delete():
        try: path.unlink(missing_ok=True)
        except Exception: pass
    return BackgroundTask(_delete)
