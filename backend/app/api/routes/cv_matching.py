"""
app/api/routes/cv_matching.py
Génération et gestion des CVs adaptés à des offres spécifiques.

Routes :
  GET    /api/cv-matching                  → liste des CVs générés
  POST   /api/cv-matching/generate         → génère + sauvegarde un CV pour une offre
  POST   /api/cv-matching/generate-ats     → génère un CV ATS-optimisé + score + keywords (pas sauvegardé)
  POST   /api/cv-matching/save-ats         → sauvegarde un résultat ATS déjà calculé en base
  GET    /api/cv-matching/{id}             → détail d'un CV généré (avec source_cv_text)
  POST   /api/cv-matching/generate-ats-cloud → génère un CV ATS-optimisé via API Cloud (Claude/OpenAI)
  GET    /api/cv-matching/cloud-status       → retourne le provider Cloud disponible
  GET    /api/cv-matching/{id}/export/docx → export DOCX via pandoc
  PATCH  /api/cv-matching/{id}/notes       → ajouter une note
  DELETE /api/cv-matching/{id}             → suppression
"""
import json
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
    # Champs ATS optionnels
    is_ats:      Optional[bool]  = None
    ats_total:   Optional[float] = None
    model_config = {"from_attributes": True}


class GeneratedCVFull(GeneratedCVSummary):
    cv_markdown:    str
    source_cv_text: Optional[str] = None
    # Champs ATS dénormalisés pour affichage direct
    ats_score_json:       Optional[str] = None
    ats_keywords_json:    Optional[str] = None
    ats_suggestions_json: Optional[str] = None


class GenerateCVRequest(BaseModel):
    source_cv_id: int
    job_id:       int
    language:     Optional[str] = "fr"
    model:        Optional[str] = None


class NotesUpdate(BaseModel):
    notes: str


# ── Schémas ATS ───────────────────────────────────────────────────────────────

class KeywordGap(BaseModel):
    keyword:    str
    found:      bool
    importance: str   # "high" | "medium" | "low"
    category:   str   # "skill" | "tool" | "soft_skill" | "title" | "certification"


class ATSScore(BaseModel):
    score_keywords:   float   # 0-35
    score_experience: float   # 0-25
    score_skills:     float   # 0-20
    score_education:  float   # 0-10
    score_format:     float   # 0-10
    total:            float   # 0-100
    label:            str     # "rejet" | "possible" | "bon" | "top"


class ATSResult(BaseModel):
    cv_markdown:     str
    source_cv_text:  Optional[str]
    ats_score:       ATSScore
    keyword_gaps:    list[KeywordGap]
    missing_count:   int
    found_count:     int
    suggestions:     list[str]


class SaveATSRequest(BaseModel):
    """Payload pour sauvegarder un résultat ATS déjà calculé côté client."""
    source_cv_id: int
    job_id:       int
    language:     str
    model:        Optional[str] = None
    cv_markdown:  str
    source_cv_text: Optional[str] = None
    ats_score:    ATSScore
    keyword_gaps: list[KeywordGap]
    suggestions:  list[str]


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

    model          = payload.model or settings.ollama_model
    cv_markdown    = await _generate_with_ollama(
        source_cv, job, model, settings.ollama_base_url, payload.language or "fr"
    )
    source_cv_text = _build_source_text(source_cv)

    gen = GeneratedCV(
        source_cv_id=source_cv.id,
        source_cv_name=source_cv.name,
        source_cv_text=source_cv_text,
        job_id=job.id,
        job_title=job.title,
        job_company=job.company,
        job_url=job.url,
        cv_markdown=cv_markdown,
        language=payload.language or "fr",
        ollama_model=model,
        is_ats=False,
    )
    db.add(gen)
    await db.commit()
    await db.refresh(gen)
    return gen


@router.post("/generate-ats", response_model=ATSResult, status_code=201)
async def generate_ats_cv(
    payload:  GenerateCVRequest,
    db:       DBSession,
    settings: AppSettings,
) -> ATSResult:
    """
    Génère un CV optimisé ATS + score ATS + analyse keywords.
    Ne sauvegarde PAS en base — utiliser /save-ats pour persister le résultat.
    """
    source_cv = await db.get(StoredCV, payload.source_cv_id)
    if not source_cv:
        raise HTTPException(status_code=404, detail=f"CV source {payload.source_cv_id} introuvable.")

    job = await db.get(Job, payload.job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Offre {payload.job_id} introuvable.")

    model          = payload.model or settings.ollama_model
    source_cv_text = _build_source_text(source_cv)

    return await _generate_ats_with_ollama(
        source_cv, job, model, settings.ollama_base_url, payload.language or "fr", source_cv_text
    )


@router.post("/save-ats", response_model=GeneratedCVFull, status_code=201)
async def save_ats_cv(
    payload: SaveATSRequest,
    db:      DBSession,
    settings: AppSettings,
) -> GeneratedCVFull:
    """
    Sauvegarde un résultat ATS déjà calculé (renvoyé par /generate-ats) en base.
    Aucun appel Ollama supplémentaire — simple persistance.
    """
    source_cv = await db.get(StoredCV, payload.source_cv_id)
    if not source_cv:
        raise HTTPException(status_code=404, detail=f"CV source {payload.source_cv_id} introuvable.")

    job = await db.get(Job, payload.job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Offre {payload.job_id} introuvable.")

    gen = GeneratedCV(
        source_cv_id=source_cv.id,
        source_cv_name=source_cv.name,
        source_cv_text=payload.source_cv_text,
        job_id=job.id,
        job_title=job.title,
        job_company=job.company,
        job_url=job.url,
        cv_markdown=payload.cv_markdown,
        language=payload.language,
        ollama_model=payload.model or settings.ollama_model,
        is_ats=True,
        ats_total=payload.ats_score.total,
        ats_score_json=payload.ats_score.model_dump_json(),
        ats_keywords_json=json.dumps([k.model_dump() for k in payload.keyword_gaps], ensure_ascii=False),
        ats_suggestions_json=json.dumps(payload.suggestions, ensure_ascii=False),
    )
    db.add(gen)
    await db.commit()
    await db.refresh(gen)
    return gen


@router.post("/generate-ats-cloud", response_model=ATSResult, status_code=201)
async def generate_ats_cv_cloud(
    payload:  GenerateCVRequest,
    db:       DBSession,
    settings: AppSettings,
) -> ATSResult:
    """
    Génère un CV optimisé ATS via un modèle Cloud (Anthropic Claude ou OpenAI).
    Provider sélectionné automatiquement selon ANTHROPIC_API_KEY / OPENAI_API_KEY dans .env.
    Ne sauvegarde PAS en base — utiliser /save-ats pour persister.
    """
    provider = settings.cloud_ai_provider
    if not provider:
        raise HTTPException(
            status_code=503,
            detail="Aucune clé API Cloud configurée. Ajoutez ANTHROPIC_API_KEY ou OPENAI_API_KEY dans backend/.env.",
        )

    source_cv = await db.get(StoredCV, payload.source_cv_id)
    if not source_cv:
        raise HTTPException(status_code=404, detail=f"CV source {payload.source_cv_id} introuvable.")

    job = await db.get(Job, payload.job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Offre {payload.job_id} introuvable.")

    source_cv_text = _build_source_text(source_cv)

    if provider == "anthropic":
        return await _generate_ats_with_claude(
            source_cv, job, settings.anthropic_api_key, payload.language or "fr", source_cv_text
        )
    elif provider == "openai":
        return await _generate_ats_with_openai(
            source_cv, job, settings.openai_api_key, payload.language or "fr", source_cv_text
        )
    else:
        return await _generate_ats_with_mistral(
            source_cv, job, settings.mistral_api_key, payload.language or "fr", source_cv_text
        )


@router.get("/cloud-status")
async def cloud_ai_status(settings: AppSettings):
    """Retourne le provider Cloud disponible et le modèle utilisé."""
    provider = settings.cloud_ai_provider
    models = {
        "anthropic": "claude-haiku-4-5-20251001",
        "openai":    "gpt-4o-mini",
        "mistral":   "mistral-small-latest",
    }
    return {
        "provider": provider,
        "model":    models.get(provider) if provider else None,
        "configured": provider is not None,
    }


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


def _ats_label(score: float) -> str:
    if score < 40:  return "rejet"
    if score < 60:  return "possible"
    if score < 80:  return "bon"
    return "top"


# ── Génération Ollama standard ────────────────────────────────────────────────

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


# ── Génération Ollama ATS ─────────────────────────────────────────────────────

async def _generate_ats_with_ollama(
    cv: StoredCV, job: Job, model: str, base_url: str, lang: str, source_cv_text: str
) -> ATSResult:
    import httpx
    import ollama as ol

    ctx = _build_cv_context(cv)
    desc_clean = _clean_html(job.description or "")[:2500]
    lang_label = "français" if lang == "fr" else "English"

    prompt = f"""Tu es un expert ATS optimizer, senior recruiter et HR data scientist.
Ta mission : produire le CV qui obtiendra le SCORE MAXIMUM dans un Applicant Tracking System (ATS)
ET qui sera le plus convaincant possible pour un recruteur humain.

=== OFFRE D'EMPLOI CIBLE ===
Poste : {job.title}
Entreprise : {job.company}
Description complète :
{desc_clean}

=== CV SOURCE DU CANDIDAT ===
{_section("IDENTITÉ", ctx["identity"])}
{_section("RÉSUMÉ PROFESSIONNEL", ctx["summary"])}
{_section("EXPÉRIENCES PROFESSIONNELLES", ctx["experiences"])}
{_section("COMPÉTENCES TECHNIQUES", ctx["skills"])}
{_section("FORMATION", ctx["education"])}
{_section("LANGUES", ctx["languages"])}
{_section("CERTIFICATIONS", ctx["certifications"])}
{_section("PROJETS", ctx["projects"])}

=== ÉTAPES OBLIGATOIRES ===

ÉTAPE 1 — Extraire les mots-clés critiques de l'offre :
  - Compétences obligatoires (poids 10), outils demandés (poids 7), soft skills (poids 3)
  - Titre exact du poste, synonymes acceptés, niveau d'expérience attendu

ÉTAPE 2 — Analyser le CV source :
  - Identifier quels mots-clés sont déjà présents (ou leurs synonymes)
  - Identifier les gaps (mots-clés manquants que le candidat POSSÈDE peut-être mais n'a pas mentionnés)

ÉTAPE 3 — Générer le CV optimisé ATS en {lang_label} selon ces règles STRICTES :

  STRUCTURE ATS-FRIENDLY OBLIGATOIRE (sections dans cet ordre) :
    1. En-tête : Nom, Titre (aligné sur le poste), coordonnées
    2. SUMMARY : 3-4 phrases, contient le titre du poste + 4-5 mots-clés de l'offre
    3. CORE SKILLS : liste dense, les mots-clés de l'offre EN PREMIER
    4. PROFESSIONAL EXPERIENCE : expériences reformulées (voir règles ci-dessous)
    5. EDUCATION
    6. LANGUAGES (si pertinent)

  RÈGLES POUR LE TITRE :
    - Aligner EXACTEMENT le titre sur le poste : "{job.title}"
    - Si le titre du CV source est différent, le modifier pour correspondre

  RÈGLES CRITIQUES POUR LES EXPÉRIENCES PROFESSIONNELLES :
    ⚠ OBLIGATION ABSOLUE : reformuler chaque bullet point des expériences PERTINENTES
    pour y intégrer le vocabulaire et les éléments de langage de l'offre.
    
    MÉTHODE pour chaque bullet :
    1. Identifier l'action réalisée dans le CV source
    2. Identifier le mot-clé ou concept correspondant dans l'offre
    3. Reformuler en utilisant EXACTEMENT le terme de l'offre, pas un synonyme
    
    EXEMPLES de reformulation :
    - CV source : "Géré les stocks du dépôt"
      Offre contient "Inventory Management" → REFORMULER : "Managed inventory optimization for 3 distribution centers"
    - CV source : "Travaillé avec les équipes ventes"
      Offre contient "S&OP" → REFORMULER : "Led S&OP process with cross-functional teams (Sales, Finance, Operations)"
    - CV source : "Réduit les coûts logistiques"
      Offre contient "Lean Six Sigma" → REFORMULER : "Applied Lean Six Sigma methodology to reduce logistics costs by X%"
    
    OBLIGATOIRE : chaque expérience PERTINENTE doit avoir AU MOINS 2 bullets reformulés
    avec des mots-clés tirés directement de l'offre.
    
    INTERDIT : copier-coller les bullets sans les reformuler.
    INTERDIT : inventer des réalisations absentes du CV source.
    AUTORISÉ : reformuler, préciser, enrichir avec le vocabulaire de l'offre.

  RÈGLES POUR CORE SKILLS :
    - Lister EN PREMIER les compétences qui apparaissent textuellement dans l'offre
    - Keyword mirroring : utiliser EXACTEMENT les termes de l'offre, pas des traductions
    - Si l'offre dit "Demand Planning", écrire "Demand Planning" (pas "planification de la demande")

  FORMAT TEXTE PUR (ATS parser-friendly) :
    - Aucune table, aucun tableau, aucune colonne, aucun graphique, aucune icône
    - Sections clairement titrées avec ##
    - Bullet points avec -
    - Pas de caractères spéciaux sauf | pour séparer les coordonnées

ÉTAPE 4 — Calculer le score ATS simulé :
  score_keywords (0-35) : % mots-clés importants présents dans le CV optimisé × 35
  score_experience (0-25) : alignement titre + années d'exp + progression
  score_skills (0-20) : densité et pertinence compétences vs offre
  score_education (0-10) : niveau diplôme vs requis
  score_format (0-10) : structure ATS-friendly respectée

ÉTAPE 5 — Lister 3-5 suggestions concrètes pour améliorer encore le score
(ex : "Ajouter la certification X si vous la possédez", "Mentionner explicitement Y dans l'expérience Z").

=== FORMAT DE RÉPONSE : JSON UNIQUEMENT ===
Réponds UNIQUEMENT avec ce JSON, sans backtick, sans commentaire, sans texte avant ou après :

{{"cv_markdown": "# NOM\\n**{job.title}** | Ville | email\\n\\n---\\n## SUMMARY\\n3-4 phrases avec mots-clés offre\\n\\n---\\n## CORE SKILLS\\n- Mot-clé offre 1\\n- Mot-clé offre 2\\n\\n---\\n## PROFESSIONAL EXPERIENCE\\n### Titre · Entreprise *(dates)*\\n- Bullet reformulé avec vocabulaire offre\\n- Autre bullet reformulé\\n\\n---\\n## EDUCATION\\n### Diplôme · École *(année)*\\n\\n---\\n## LANGUAGES\\n- Langue : Niveau", "keyword_gaps": [{{"keyword": "Supply Chain Management", "found": true, "importance": "high", "category": "skill"}}, {{"keyword": "SAP S/4HANA", "found": false, "importance": "high", "category": "tool"}}, {{"keyword": "Lean Six Sigma", "found": true, "importance": "medium", "category": "certification"}}], "ats_score": {{"score_keywords": 28, "score_experience": 20, "score_skills": 16, "score_education": 8, "score_format": 9, "total": 81}}, "suggestions": ["Ajouter Lean Six Sigma si certification réelle", "Mentionner SAP explicitement si utilisé"]}}

CONTRAINTES JSON STRICTES :
- cv_markdown : CV COMPLET en Markdown, sauts de ligne = \\n, guillemets = \\"
- keyword_gaps : TOUS les mots-clés importants de l'offre, minimum 8 entrées
- importance : "high" (obligatoire, poids 10), "medium" (outil, poids 7), "low" (soft skill, poids 3)
- category : skill | tool | soft_skill | title | certification
- found : true si présent dans le CV source OU dans le CV optimisé généré
- scores : entiers, plafonds stricts (keywords≤35, experience≤25, skills≤20, education≤10, format≤10)
- NE PAS inventer de compétences/expériences absentes du CV source
"""

    client = ol.AsyncClient(
        host=base_url,
        timeout=httpx.Timeout(connect=10, read=900, write=10, pool=5),
    )

    try:
        response = await client.generate(
            model=model,
            prompt=prompt,
            stream=False,
            format="json",
            options={"temperature": 0.2, "num_predict": 3000},
        )
        raw = response["response"].strip()

        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            json_match = re.search(r'\{.*\}', raw, re.DOTALL)
            if json_match:
                data = json.loads(json_match.group())
            else:
                raise RuntimeError("Réponse JSON invalide d'Ollama")

        cv_markdown = data.get("cv_markdown", "")
        if cv_markdown:
            md_start = cv_markdown.find("#")
            if md_start > 0:
                cv_markdown = cv_markdown[md_start:]

        keyword_gaps = [
            KeywordGap(
                keyword=k.get("keyword", ""),
                found=bool(k.get("found", False)),
                importance=k.get("importance", "medium"),
                category=k.get("category", "skill"),
            )
            for k in data.get("keyword_gaps", [])
        ]

        raw_score = data.get("ats_score", {})
        sk  = min(float(raw_score.get("score_keywords",   0)), 35)
        se  = min(float(raw_score.get("score_experience", 0)), 25)
        ssl = min(float(raw_score.get("score_skills",     0)), 20)
        sed = min(float(raw_score.get("score_education",  0)), 10)
        sf  = min(float(raw_score.get("score_format",     0)), 10)
        final_total = min(round(sk + se + ssl + sed + sf, 1), 100.0)

        ats_score = ATSScore(
            score_keywords=round(sk, 1),
            score_experience=round(se, 1),
            score_skills=round(ssl, 1),
            score_education=round(sed, 1),
            score_format=round(sf, 1),
            total=final_total,
            label=_ats_label(final_total),
        )

        suggestions = data.get("suggestions", [])
        if not isinstance(suggestions, list):
            suggestions = []

        found_count   = sum(1 for k in keyword_gaps if k.found)
        missing_count = sum(1 for k in keyword_gaps if not k.found)

        return ATSResult(
            cv_markdown=cv_markdown,
            source_cv_text=source_cv_text,
            ats_score=ats_score,
            keyword_gaps=keyword_gaps,
            missing_count=missing_count,
            found_count=found_count,
            suggestions=suggestions,
        )

    except RuntimeError:
        raise
    except Exception as e:
        raise RuntimeError(f"Ollama ATS error : {e}")


def _cleanup_background(path: Path):
    from starlette.background import BackgroundTask
    def _delete():
        try: path.unlink(missing_ok=True)
        except Exception: pass
    return BackgroundTask(_delete)


# ── Génération Cloud : prompt commun ────────────────────────────────────────────────────────────────────

def _build_ats_cloud_prompt(cv: StoredCV, job: Job, lang: str) -> str:
    """Prompt partagé entre Claude et OpenAI — identique au prompt Ollama ATS mais sans le format=json trick."""
    ctx       = _build_cv_context(cv)
    desc_clean = _clean_html(job.description or "")[:3000]   # Cloud : plus de contexte
    lang_label = "français" if lang == "fr" else "English"

    return f"""Tu es un expert ATS optimizer, senior recruiter et HR data scientist.
Ta mission : produire le CV qui obtiendra le SCORE MAXIMUM dans un Applicant Tracking System (ATS)
ET qui sera le plus convaincant possible pour un recruteur humain.

=== OFFRE D'EMPLOI CIBLE ===
Poste : {job.title}
Entreprise : {job.company}
Description complète :
{desc_clean}

=== CV SOURCE DU CANDIDAT ===
{_section("IDENTITÉ", ctx["identity"])}
{_section("RÉSUMÉ PROFESSIONNEL", ctx["summary"])}
{_section("EXPÉRIENCES PROFESSIONNELLES", ctx["experiences"])}
{_section("COMPÉTENCES TECHNIQUES", ctx["skills"])}
{_section("FORMATION", ctx["education"])}
{_section("LANGUES", ctx["languages"])}
{_section("CERTIFICATIONS", ctx["certifications"])}
{_section("PROJETS", ctx["projects"])}

=== INSTRUCTIONS ===
ÉTAPE 1 — Extraire les mots-clés critiques de l'offre :
  - Compétences obligatoires (poids 10), outils demandés (poids 7), soft skills (poids 3)
  - Titre exact du poste, synonymes acceptés, niveau d'expérience attendu

ÉTAPE 2 — Analyser le CV source :
  - Identifier quels mots-clés sont déjà présents (ou leurs synonymes)
  - Identifier les gaps (mots-clés manquants que le candidat POSSÈDE peut-être mais n'a pas mentionnés)

ÉTAPE 3 — Générer le CV optimisé ATS en {lang_label} :
  - Titre aligné EXACTEMENT sur le poste : "{job.title}"
  - SUMMARY : 3-4 phrases, contient le titre du poste + 4-5 mots-clés de l'offre
  - CORE SKILLS : mots-clés de l'offre EN PREMIER, keyword mirroring strict
  - PROFESSIONAL EXPERIENCE : reformuler OBLIGATOIREMENT chaque bullet des expériences
    pertinentes avec le vocabulaire de l'offre (pas de copier-coller du CV source)
  - FORMAT TEXTE PUR ATS (pas de tableau, pas d'icône, sections avec ##, bullets avec -)

ÉTAPE 4 — Calculer le score ATS simulé :
  score_keywords (0-35) · score_experience (0-25) · score_skills (0-20) · score_education (0-10) · score_format (0-10)

ÉTAPE 5 — Lister 3-5 suggestions concrètes pour améliorer encore le score.

=== FORMAT DE RÉPONSE : JSON UNIQUEMENT ===
Réponds UNIQUEMENT avec ce JSON valide, sans backtick, sans commentaire :

{{"cv_markdown": "# NOM\\n**{job.title}** | Ville | email\\n\\n---\\n## SUMMARY\\n...\\n\\n---\\n## CORE SKILLS\\n- Mot-clé 1\\n\\n---\\n## PROFESSIONAL EXPERIENCE\\n### Titre · Entreprise *(dates)*\\n- Bullet reformulé\\n\\n---\\n## EDUCATION\\n...", "keyword_gaps": [{{"keyword": "exemple", "found": true, "importance": "high", "category": "skill"}}], "ats_score": {{"score_keywords": 25, "score_experience": 20, "score_skills": 15, "score_education": 8, "score_format": 9}}, "suggestions": ["Suggestion 1", "Suggestion 2"]}}

CONTRAINTES :
- keyword_gaps : TOUS les mots-clés importants de l'offre, minimum 8 entrées
- importance : "high" (obligatoire) | "medium" (outil) | "low" (soft skill)
- category : skill | tool | soft_skill | title | certification
- found : true si présent dans le CV source OU dans le CV optimisé généré
- scores : entiers, plafonds stricts (keywords≤35, experience≤25, skills≤20, education≤10, format≤10)
- NE PAS inventer de compétences/expériences absentes du CV source
"""


def _parse_ats_cloud_response(raw: str, source_cv_text: str) -> ATSResult:
    """Parse la réponse JSON d'un LLM Cloud et construit un ATSResult."""
    clean = raw.strip()
    # Retirer les backticks markdown si le modèle en a ajouté malgré les instructions
    if clean.startswith("```"):
        lines = clean.split("\n")
        # Supprimer première ligne (```json ou ```) et dernière (```)
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        clean = "\n".join(lines).strip()

    try:
        data = json.loads(clean)
    except json.JSONDecodeError:
        match = re.search(r'\{.*\}', clean, re.DOTALL)
        if match:
            data = json.loads(match.group())
        else:
            raise RuntimeError(f"Réponse JSON invalide du modèle Cloud. Début : {clean[:200]}")

    cv_markdown = data.get("cv_markdown", "")
    if cv_markdown:
        md_start = cv_markdown.find("#")
        if md_start > 0:
            cv_markdown = cv_markdown[md_start:]

    keyword_gaps = [
        KeywordGap(
            keyword=k.get("keyword", ""),
            found=bool(k.get("found", False)),
            importance=k.get("importance", "medium"),
            category=k.get("category", "skill"),
        )
        for k in data.get("keyword_gaps", [])
    ]

    raw_score = data.get("ats_score", {})
    sk  = min(float(raw_score.get("score_keywords",   0)), 35)
    se  = min(float(raw_score.get("score_experience", 0)), 25)
    ssl = min(float(raw_score.get("score_skills",     0)), 20)
    sed = min(float(raw_score.get("score_education",  0)), 10)
    sf  = min(float(raw_score.get("score_format",     0)), 10)
    total = min(round(sk + se + ssl + sed + sf, 1), 100.0)

    ats_score = ATSScore(
        score_keywords=round(sk, 1),
        score_experience=round(se, 1),
        score_skills=round(ssl, 1),
        score_education=round(sed, 1),
        score_format=round(sf, 1),
        total=total,
        label=_ats_label(total),
    )

    suggestions = data.get("suggestions", [])
    if not isinstance(suggestions, list):
        suggestions = []

    found_count   = sum(1 for k in keyword_gaps if k.found)
    missing_count = sum(1 for k in keyword_gaps if not k.found)

    return ATSResult(
        cv_markdown=cv_markdown,
        source_cv_text=source_cv_text,
        ats_score=ats_score,
        keyword_gaps=keyword_gaps,
        missing_count=missing_count,
        found_count=found_count,
        suggestions=suggestions,
    )


# ── Génération via Anthropic Claude ────────────────────────────────────────────────────────────────────

async def _generate_ats_with_claude(
    cv: StoredCV, job: Job, api_key: str, lang: str, source_cv_text: str
) -> ATSResult:
    import httpx

    prompt = _build_ats_cloud_prompt(cv, job, lang)

    async with httpx.AsyncClient(timeout=httpx.Timeout(connect=10, read=300, write=10, pool=5)) as client:
        response = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key":         api_key,
                "anthropic-version": "2023-06-01",
                "content-type":      "application/json",
            },
            json={
                "model":      "claude-haiku-4-5-20251001",
                "max_tokens": 4096,
                "messages": [{"role": "user", "content": prompt}],
            },
        )

    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"[Claude] status={response.status_code} body_len={len(response.content)}")
    if response.status_code != 200:
        try:
            body = response.json()
            err = body.get('error', {}).get('message') or str(body)
        except Exception:
            err = response.text[:300] or f"HTTP {response.status_code}"
        raise RuntimeError(f"Anthropic API error {response.status_code}: {err}")

    try:
        data = response.json()
    except Exception:
        raise RuntimeError(f"Anthropic: réponse non-JSON — début: {response.text[:200]}")

    raw = data["content"][0]["text"]
    return _parse_ats_cloud_response(raw, source_cv_text)


# ── Génération via OpenAI ────────────────────────────────────────────────────────────────────────────

async def _generate_ats_with_openai(
    cv: StoredCV, job: Job, api_key: str, lang: str, source_cv_text: str
) -> ATSResult:
    import httpx

    prompt = _build_ats_cloud_prompt(cv, job, lang)

    async with httpx.AsyncClient(timeout=httpx.Timeout(connect=10, read=300, write=10, pool=5)) as client:
        response = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type":  "application/json",
            },
            json={
                "model":       "gpt-4o-mini",
                "max_tokens":  4096,
                "temperature": 0.2,
                "response_format": {"type": "json_object"},
                "messages": [{"role": "user", "content": prompt}],
            },
        )

    if response.status_code != 200:
        try:
            body = response.json()
            err = body.get('error', {}).get('message') or str(body)
        except Exception:
            err = response.text[:300] or f"HTTP {response.status_code}"
        raise RuntimeError(f"OpenAI API error {response.status_code}: {err}")

    try:
        data = response.json()
    except Exception:
        raise RuntimeError(f"OpenAI: réponse non-JSON — début: {response.text[:200]}")

    raw = data["choices"][0]["message"]["content"]
    return _parse_ats_cloud_response(raw, source_cv_text)


# ── Génération via Mistral AI ───────────────────────────────────────────────────────────────────────────

async def _generate_ats_with_mistral(
    cv: StoredCV, job: Job, api_key: str, lang: str, source_cv_text: str
) -> ATSResult:
    import httpx
    import logging
    logger = logging.getLogger(__name__)

    prompt = _build_ats_cloud_prompt(cv, job, lang)
    logger.info(f"[Mistral] prompt_len={len(prompt)} chars, api_key_prefix={api_key[:8]}...")

    # Mistral supporte json_object comme OpenAI
    async with httpx.AsyncClient(timeout=httpx.Timeout(connect=10, read=300, write=10, pool=5)) as client:
        response = await client.post(
            "https://api.mistral.ai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type":  "application/json",
            },
            json={
                "model":           "mistral-small-latest",
                "max_tokens":      4096,
                "temperature":     0.2,
                "response_format": {"type": "json_object"},
                "messages": [{"role": "user", "content": prompt}],
            },
        )

    if response.status_code != 200:
        try:
            body = response.json()
            err = body.get("message") or body.get("error", {}).get("message") or str(body)
        except Exception:
            err = response.text[:300] or f"HTTP {response.status_code}"
        raise RuntimeError(f"Mistral API error {response.status_code}: {err}")

    try:
        data = response.json()
    except Exception:
        raise RuntimeError(f"Mistral: réponse non-JSON — status={response.status_code} début: {response.text[:300]}")

    raw = data["choices"][0]["message"]["content"]
    return _parse_ats_cloud_response(raw, source_cv_text)
