"""
app/api/routes/profile.py
Profil utilisateur + génération de CV adapté via Ollama.

Routes :
  GET    /api/profile               → profil courant (crée si absent)
  PUT    /api/profile               → sauvegarde le profil complet
  POST   /api/profile/generate-cv   → génère un CV adapté à une offre via Ollama
"""
import json
from datetime import datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from typing import Optional

from app.api.deps import AppSettings, DBSession
from app.models.user_profile import UserProfile
from app.models.job import Job

router = APIRouter(prefix="/profile", tags=["Profile"])


# ── Schémas ──────────────────────────────────────────────────────────────────

class ProfileData(BaseModel):
    full_name:    Optional[str] = None
    initials:     Optional[str] = None
    title:        Optional[str] = None
    email:        Optional[str] = None
    phone:        Optional[str] = None
    location:     Optional[str] = None
    linkedin_url: Optional[str] = None
    github_url:   Optional[str] = None
    website_url:  Optional[str] = None
    summary:      Optional[str] = None
    experiences:  Optional[str] = None   # JSON
    education:    Optional[str] = None   # JSON
    skills:       Optional[str] = None   # JSON
    languages:    Optional[str] = None   # JSON
    certifications: Optional[str] = None
    projects:     Optional[str] = None
    interests:    Optional[str] = None
    alert_score_threshold: Optional[int] = 80
    alert_email_enabled:   Optional[int] = 0

    model_config = {"from_attributes": True}


class GenerateCVRequest(BaseModel):
    job_id: int
    model:  Optional[str] = None
    language: Optional[str] = "fr"   # fr | en


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_or_create_profile(db: DBSession) -> UserProfile:
    profile = await db.get(UserProfile, 1)
    if not profile:
        profile = UserProfile(id=1)
        db.add(profile)
        await db.flush()
    return profile


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("", response_model=ProfileData)
async def get_profile(db: DBSession) -> ProfileData:
    return await _get_or_create_profile(db)


@router.put("", response_model=ProfileData)
async def save_profile(payload: ProfileData, db: DBSession) -> ProfileData:
    profile = await _get_or_create_profile(db)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(profile, field, value)
    profile.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(profile)
    return profile


@router.post("/generate-cv")
async def generate_cv(
    payload: GenerateCVRequest,
    db: DBSession,
    settings: AppSettings,
) -> dict:
    """
    Génère un CV Markdown adapté à une offre spécifique via Ollama.
    Le CV est construit à partir du profil utilisateur en mettant en valeur
    les expériences et compétences les plus pertinentes pour l'offre.
    """
    # Récupérer le profil
    profile = await _get_or_create_profile(db)
    if not profile.full_name:
        raise HTTPException(status_code=400, detail="Profil incomplet — renseignez au moins votre nom.")

    # Récupérer l'offre
    job = await db.get(Job, payload.job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Offre {payload.job_id} introuvable.")

    # Construire le contexte profil pour Ollama
    profile_ctx = _build_profile_context(profile)

    # Prompt de génération
    lang_instruction = "en français" if payload.language == "fr" else "in English"
    prompt = f"""Tu es un expert en rédaction de CV et en recrutement.
À partir du profil ci-dessous, génère un CV complet {lang_instruction} en Markdown,
adapté à l'offre d'emploi cible. Ne mens pas et n'invente pas d'expériences — 
mets en valeur ce qui existe déjà dans le profil en lien avec l'offre.
Réorganise l'ordre des sections et reformule les descriptions pour maximiser
la pertinence avec l'offre. Commence par les éléments les plus pertinents.

=== PROFIL SOURCE ===
{profile_ctx}

=== OFFRE CIBLE ===
Titre : {job.title}
Entreprise : {job.company}
Description : {(job.description or '')[:1500]}

=== FORMAT DE SORTIE ===
Génère un CV Markdown structuré avec ces sections dans l'ordre optimal :
# [Prénom Nom]
## Contact | Titre professionnel
## Résumé / Profil
## Expériences professionnelles  
## Compétences techniques
## Formation
## Langues
(Sections optionnelles selon le profil : Projets, Certifications, Centres d'intérêt)

IMPORTANT : Réponds UNIQUEMENT avec le Markdown du CV, sans explication autour."""

    # Appel Ollama
    try:
        import httpx
        import ollama as ol

        model = payload.model or settings.ollama_model
        client = ol.AsyncClient(
            host=settings.ollama_base_url,
            timeout=httpx.Timeout(connect=10, read=300, write=10, pool=5),
        )
        response = await client.generate(
            model=model,
            prompt=prompt,
            stream=False,
            options={"temperature": 0.4, "num_predict": 1500},
        )
        cv_markdown = response["response"].strip()
        return {
            "cv_markdown": cv_markdown,
            "job_title":   job.title,
            "job_company": job.company,
            "model":       model,
        }
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Erreur Ollama : {exc}")


def _build_profile_context(p: UserProfile) -> str:
    """Construit un texte structuré du profil pour le prompt Ollama."""
    lines = []
    if p.full_name:    lines.append(f"Nom : {p.full_name}")
    if p.title:        lines.append(f"Titre : {p.title}")
    if p.email:        lines.append(f"Email : {p.email}")
    if p.phone:        lines.append(f"Téléphone : {p.phone}")
    if p.location:     lines.append(f"Localisation : {p.location}")
    if p.linkedin_url: lines.append(f"LinkedIn : {p.linkedin_url}")
    if p.github_url:   lines.append(f"GitHub : {p.github_url}")
    if p.summary:
        lines.append(f"\nRésumé :\n{p.summary}")
    if p.skills:
        try:
            skills = json.loads(p.skills)
            lines.append(f"\nCompétences : {', '.join(skills)}")
        except Exception:
            lines.append(f"\nCompétences : {p.skills}")
    if p.experiences:
        lines.append(f"\nExpériences :\n{p.experiences}")
    if p.education:
        lines.append(f"\nFormation :\n{p.education}")
    if p.languages:
        lines.append(f"\nLangues :\n{p.languages}")
    if p.certifications:
        lines.append(f"\nCertifications :\n{p.certifications}")
    if p.projects:
        lines.append(f"\nProjets :\n{p.projects}")
    return "\n".join(lines)
