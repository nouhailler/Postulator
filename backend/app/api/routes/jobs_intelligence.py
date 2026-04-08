"""
app/api/routes/jobs_intelligence.py
Chat IA sur une offre — Offres Intelligence.

Routes :
  POST /api/jobs-intelligence/chat   → pose une question à Ollama sur une offre

Stratégie pour les offres sans description en BDD :
  Si job.description est vide, on tente de récupérer le contenu de l'URL de l'offre
  avec httpx + extraction de texte (BeautifulSoup si disponible, sinon regex).
  Le texte extrait est tronqué à 5000 caractères avant d'être passé à Ollama.
"""
import re
import asyncio
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from app.api.deps import AppSettings, DBSession

router = APIRouter(prefix="/jobs-intelligence", tags=["Jobs Intelligence"])

FETCH_TIMEOUT = 15.0   # secondes pour récupérer la page de l'offre
MAX_CONTEXT   = 5000   # caractères max transmis à Ollama

FETCH_HEADERS = {
    "User-Agent":      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
    "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
}


class ChatRequest(BaseModel):
    job_id:   int
    question: str
    model:    Optional[str] = None


class ChatResponse(BaseModel):
    answer:        str
    duration_ms:   int
    model:         str
    desc_source:   str   # "database" | "fetched" | "none"
    desc_length:   int   # nb de caractères transmis à Ollama


# ── Helpers d'extraction de texte ────────────────────────────────────────────

def _clean_html(html: str) -> str:
    """Extraction de texte depuis HTML — BeautifulSoup si disponible, sinon regex."""
    try:
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(html, "html.parser")
        # Supprimer les éléments inutiles
        for tag in soup(["script", "style", "nav", "header", "footer",
                          "noscript", "meta", "link", "img", "svg"]):
            tag.decompose()
        text = soup.get_text(separator="\n")
    except ImportError:
        # Fallback regex si bs4 non installé
        text = re.sub(r'<script[^>]*>.*?</script>', '', html, flags=re.DOTALL)
        text = re.sub(r'<style[^>]*>.*?</style>',  '', text,  flags=re.DOTALL)
        text = re.sub(r'<[^>]+>', ' ', text)
        text = re.sub(r'&amp;',  '&',  text)
        text = re.sub(r'&lt;',   '<',  text)
        text = re.sub(r'&gt;',   '>',  text)
        text = re.sub(r'&nbsp;', ' ',  text)
        text = re.sub(r'&#\d+;', ' ',  text)

    # Nettoyer les espaces/lignes vides multiples
    lines = [l.strip() for l in text.splitlines()]
    lines = [l for l in lines if len(l) > 2]          # ignorer lignes trop courtes
    text  = "\n".join(lines)
    text  = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


async def _fetch_job_page(url: str) -> Optional[str]:
    """
    Récupère le contenu textuel d'une page d'offre d'emploi.
    Retourne le texte nettoyé ou None si échec.
    """
    import httpx
    try:
        async with httpx.AsyncClient(
            timeout=FETCH_TIMEOUT,
            headers=FETCH_HEADERS,
            follow_redirects=True,
        ) as client:
            resp = await client.get(url)
            if not resp.is_success:
                return None
            content_type = resp.headers.get("content-type", "")
            if "text/html" not in content_type and "text/plain" not in content_type:
                return None
            return _clean_html(resp.text)
    except Exception:
        return None


def _strip_db_description(desc: str) -> str:
    """Nettoie la description stockée en BDD (peut contenir du HTML)."""
    text = re.sub(r'<br\s*/?>', '\n', desc)
    text = re.sub(r'</p>', '\n', text)
    text = re.sub(r'</li>', '\n', text)
    text = re.sub(r'<[^>]+>', ' ', text)
    text = re.sub(r'&amp;',  '&', text)
    text = re.sub(r'&lt;',   '<', text)
    text = re.sub(r'&gt;',   '>', text)
    text = re.sub(r'&nbsp;', ' ', text)
    text = re.sub(r'\s+', ' ', text)
    return text.strip()


# ── Endpoint principal ────────────────────────────────────────────────────────

@router.post("/chat", response_model=ChatResponse)
async def chat_about_job(payload: ChatRequest, db: DBSession, settings: AppSettings) -> ChatResponse:
    """
    Répond à une question sur une offre d'emploi via Ollama.

    Stratégie pour la description :
    1. Utiliser job.description de la BDD si disponible (nettoyé du HTML)
    2. Sinon, fetcher l'URL de l'offre et extraire le texte de la page
    3. Si les deux échouent, informer Ollama qu'il n'a que le titre/entreprise
    """
    import time
    from app.models.job import Job

    job = await db.get(Job, payload.job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Offre {payload.job_id} introuvable.")

    if not payload.question.strip():
        raise HTTPException(status_code=422, detail="La question ne peut pas être vide.")

    model = payload.model or settings.ollama_model

    # ── 1. Obtenir la description ─────────────────────────────────────────────
    desc_source  = "none"
    description  = ""

    # Tentative 1 : description en BDD
    if job.description and len(job.description.strip()) > 50:
        description = _strip_db_description(job.description)[:MAX_CONTEXT]
        desc_source = "database"

    # Tentative 2 : fetch de l'URL si pas de description en BDD
    if not description and job.url and job.url.startswith("http"):
        fetched = await _fetch_job_page(job.url)
        if fetched and len(fetched) > 100:
            description = fetched[:MAX_CONTEXT]
            desc_source = "fetched"

    # ── 2. Construire le prompt ───────────────────────────────────────────────
    system_prompt = """Tu es un assistant expert en recrutement et analyse d'offres d'emploi.
Tu réponds en français de manière claire, structurée et précise.
Tes réponses sont basées uniquement sur le contenu de l'offre fournie.
Si une information n'est pas disponible dans l'offre, dis-le clairement sans inventer."""

    if description:
        context_block = f"""**Description de l'offre** :
{description}"""
        if desc_source == "fetched":
            context_block = f"""**Contenu de la page de l'offre** (récupéré depuis {job.url}) :
{description}"""
    else:
        context_block = """**Description** : Non disponible.
Note : réponds uniquement à partir du titre et des informations connues sur ce type de poste en général."""

    user_prompt = f"""Voici une offre d'emploi :

**Titre** : {job.title}
**Entreprise** : {job.company or 'Non précisée'}
**Localisation** : {job.location or 'Non précisée'}
**Source** : {job.source}
**URL** : {job.url or 'Non disponible'}

{context_block}

---

Question : {payload.question}"""

    # ── 3. Appel Ollama ───────────────────────────────────────────────────────
    try:
        import httpx as _httpx
        import ollama

        client = ollama.AsyncClient(
            host=settings.ollama_base_url,
            timeout=_httpx.Timeout(connect=10, read=300, write=10, pool=5),
        )

        t0 = time.monotonic()
        response = await client.chat(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user",   "content": user_prompt},
            ],
            stream=False,
            options={"temperature": 0.3, "num_predict": 1200},
        )
        duration_ms = int((time.monotonic() - t0) * 1000)

        answer = response["message"]["content"].strip()
        return ChatResponse(
            answer=answer,
            duration_ms=duration_ms,
            model=model,
            desc_source=desc_source,
            desc_length=len(description),
        )

    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Ollama indisponible : {exc}. Vérifiez qu'Ollama est démarré sur {settings.ollama_base_url}."
        )
