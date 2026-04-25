"""
app/api/routes/job_analysis.py
Analyse détaillée d'une offre par rapport à un contenu de poste défini par l'utilisateur.

Routes :
  POST /api/job-analysis/analyze          → analyse initiale ou question de suivi (+ sauvegarde auto)
  GET  /api/job-analysis/history/{job_id} → historique des analyses pour une offre
  DELETE /api/job-analysis/history/{job_id} → supprimer l'historique d'une offre
"""
import re
import time
from datetime import datetime
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, delete

from app.api.deps import AppSettings, DBSession

router = APIRouter(prefix="/job-analysis", tags=["Job Analysis"])

MAX_CONTEXT = 6000   # caractères max de la description transmise à l'IA


# ── Schémas ───────────────────────────────────────────────────────────────────

class HistoryMessage(BaseModel):
    role:    str   # "user" | "assistant"
    content: str


class AnalyzeRequest(BaseModel):
    job_id:   int
    criteria: str                             # contenu de poste cherché
    question: Optional[str] = None            # question de suivi (None = analyse initiale)
    history:  list[HistoryMessage] = []       # échanges précédents pour contexte


class AnalyzeResponse(BaseModel):
    answer:      str
    duration_ms: int
    model:       str
    provider:    str   # "openrouter" | "ollama"
    desc_source: str   # "database" | "fetched" | "none"
    history_id:  Optional[int] = None  # id de l'entrée sauvegardée en BDD


class AnalysisHistoryItem(BaseModel):
    id:          int
    job_id:      int
    criteria:    Optional[str]
    question:    Optional[str]
    answer:      str
    provider:    Optional[str]
    model:       Optional[str]
    duration_ms: int
    desc_source: Optional[str]
    created_at:  datetime
    model_config = {"from_attributes": True}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _strip_html(desc: str) -> str:
    text = re.sub(r'<br\s*/?>', '\n', desc)
    text = re.sub(r'</p>', '\n', text)
    text = re.sub(r'</li>', '\n', text)
    text = re.sub(r'<[^>]+>', ' ', text)
    for e, r in [('&amp;','&'),('&lt;','<'),('&gt;','>'),('&nbsp;',' ')]:
        text = text.replace(e, r)
    return re.sub(r'\s+', ' ', text).strip()


async def _fetch_job_page(url: str) -> Optional[str]:
    headers = {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
    }
    try:
        async with httpx.AsyncClient(timeout=15.0, headers=headers, follow_redirects=True) as client:
            resp = await client.get(url)
            if not resp.is_success:
                return None
            if "text/html" not in resp.headers.get("content-type", ""):
                return None
            html = resp.text
        try:
            from bs4 import BeautifulSoup
            soup = BeautifulSoup(html, "html.parser")
            for tag in soup(["script","style","nav","header","footer","noscript"]):
                tag.decompose()
            text = soup.get_text(separator="\n")
        except ImportError:
            text = re.sub(r'<[^>]+>', ' ', html)
        lines = [l.strip() for l in text.splitlines() if len(l.strip()) > 3]
        return re.sub(r'\n{3,}', '\n\n', '\n'.join(lines)).strip()
    except Exception:
        return None


def _build_analysis_prompt(job_title: str, job_company: str, description: str,
                            criteria: str, desc_source: str) -> str:
    desc_block = ""
    if description:
        src_label = "Contenu récupéré depuis la page de l'offre" if desc_source == "fetched" else "Description de l'offre"
        desc_block = f"\n**{src_label} :**\n{description}"
    else:
        desc_block = "\n**Description :** Non disponible — analyse basée sur le titre uniquement."

    return f"""Offre analysée :
- Titre : {job_title}
- Entreprise : {job_company}
{desc_block}

Contenu de poste recherché par l'utilisateur :
\"\"\"{criteria}\"\"\"

---

Analyse cette offre et évalue si elle correspond au contenu de poste demandé.
Applique une **interprétation sémantique fine** — ne te limite pas aux mots exacts.
Exemple : "encadrement d'une équipe de managers" correspond à "poste de Direction", même sans le mot "Directeur".

**RÈGLE CRITIQUE :** Entoure avec ==...== les éléments de l'offre qui correspondent au contenu recherché.
Exemple : ==Pilotage d'une équipe de 5 managers régionaux==

**Sois concis : maximum 400 mots au total.**

Structure ta réponse EXACTEMENT ainsi :

## Verdict
[Fort match / Match partiel / Faible match / Hors sujet] — Score estimé : X/10

## Correspondances détectées
[Pour chaque correspondance : ==élément de l'offre== → explication courte du lien sémantique]

## Analyse
[3-4 paragraphes. Intègre les ==correspondances== directement dans le texte, en contexte.]

## Points de vigilance
[Ce qui manque, ce qui ne correspond pas, ou les risques]

## Recommandation
[1-2 phrases de conclusion actionnables pour le candidat]"""


SYSTEM_PROMPT = """Tu es un expert senior en recrutement, analyse d'offres d'emploi et adéquation profil/poste.
Tu analyses avec finesse sémantique — tu identifies les correspondances même implicites entre un profil/contenu recherché et une offre.
Tu réponds en français, de façon structurée et concise. Tu n'inventes pas d'informations absentes de l'offre."""


# ── Route ─────────────────────────────────────────────────────────────────────

@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze_job(
    payload:  AnalyzeRequest,
    db:       DBSession,
    settings: AppSettings,
) -> AnalyzeResponse:
    """
    Analyse une offre par rapport au contenu de poste demandé (ou répond à une question de suivi).
    Utilise OpenRouter si configuré, sinon Ollama.
    """
    from app.models.job import Job
    from app.services.openrouter_service import load_openrouter_config

    job = await db.get(Job, payload.job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Offre {payload.job_id} introuvable.")
    if not payload.criteria.strip():
        raise HTTPException(status_code=422, detail="Le contenu de poste ne peut pas être vide.")

    # ── Obtenir la description ────────────────────────────────────────────────
    desc_source = "none"
    description = ""

    if job.description and len(job.description.strip()) > 50:
        description = _strip_html(job.description)[:MAX_CONTEXT]
        desc_source = "database"

    if not description and job.url and job.url.startswith("http"):
        fetched = await _fetch_job_page(job.url)
        if fetched and len(fetched) > 100:
            description = fetched[:MAX_CONTEXT]
            desc_source = "fetched"

    # ── Construire les messages ───────────────────────────────────────────────
    # Premier message = l'analyse initiale avec l'offre complète en contexte
    initial_user_msg = _build_analysis_prompt(
        job.title, job.company or "N/A", description, payload.criteria, desc_source
    )

    messages = [{"role": "system", "content": SYSTEM_PROMPT}]

    if payload.history:
        # Inclure l'historique (première question = initial_user_msg, sinon tel quel)
        if payload.history[0].role == "user":
            # Remplacer le premier message user par le prompt complet
            messages.append({"role": "user", "content": initial_user_msg})
            for msg in payload.history[1:]:
                messages.append({"role": msg.role, "content": msg.content})
        else:
            messages.append({"role": "user", "content": initial_user_msg})
            for msg in payload.history:
                messages.append({"role": msg.role, "content": msg.content})
        # Ajouter la question de suivi
        if payload.question:
            messages.append({"role": "user", "content": payload.question})
    else:
        # Analyse initiale
        messages.append({"role": "user", "content": initial_user_msg})

    # ── Appel IA ─────────────────────────────────────────────────────────────
    or_cfg   = await load_openrouter_config(db)
    provider = "openrouter" if or_cfg else "ollama"
    model    = or_cfg.model if or_cfg else (settings.ollama_model)

    try:
        t0 = time.monotonic()

        if or_cfg:
            from app.services.openrouter_service import chat_with_fallback
            answer, model = await chat_with_fallback(
                api_key=or_cfg.api_key,
                preferred=or_cfg.model,
                messages=messages,
                max_tokens=1500,
                temperature=0.2,
                timeout=180.0,
            )

        else:
            import ollama as ol
            client = ol.AsyncClient(
                host=settings.ollama_base_url,
                timeout=httpx.Timeout(connect=10, read=300, write=10, pool=5),
            )
            response = await client.chat(
                model=model,
                messages=messages,
                stream=False,
                options={"temperature": 0.2, "num_predict": 1500},
            )
            answer = response["message"]["content"].strip()

        duration_ms = int((time.monotonic() - t0) * 1000)

        # ── Sauvegarder en BDD ────────────────────────────────────────────────
        from app.models.job_analysis import JobAnalysis
        entry = JobAnalysis(
            job_id      = payload.job_id,
            criteria    = payload.criteria.strip() if not payload.question else None,
            question    = payload.question.strip() if payload.question else None,
            answer      = answer,
            provider    = provider,
            model       = model,
            duration_ms = duration_ms,
            desc_source = desc_source,
        )
        db.add(entry)
        await db.commit()
        await db.refresh(entry)

        return AnalyzeResponse(
            answer=answer,
            duration_ms=duration_ms,
            model=model,
            provider=provider,
            desc_source=desc_source,
            history_id=entry.id,
        )

    except HTTPException:
        raise
    except Exception as exc:
        label = "OpenRouter" if or_cfg else "Ollama"
        raise HTTPException(status_code=503, detail=f"{label} indisponible : {exc}")


# ── Historique ────────────────────────────────────────────────────────────────

@router.get("/history/{job_id}", response_model=list[AnalysisHistoryItem])
async def get_analysis_history(job_id: int, db: DBSession) -> list:
    """Retourne l'historique des analyses pour une offre donnée, ordre chronologique."""
    from app.models.job_analysis import JobAnalysis
    result = await db.execute(
        select(JobAnalysis)
        .where(JobAnalysis.job_id == job_id)
        .order_by(JobAnalysis.created_at.asc())
    )
    return result.scalars().all()


@router.delete("/history/{job_id}", status_code=200)
async def delete_analysis_history(job_id: int, db: DBSession) -> dict:
    """Supprime tout l'historique des analyses pour une offre."""
    from app.models.job_analysis import JobAnalysis
    await db.execute(delete(JobAnalysis).where(JobAnalysis.job_id == job_id))
    await db.commit()
    return {"ok": True}
