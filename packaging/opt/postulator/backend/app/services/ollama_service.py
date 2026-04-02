"""
app/services/ollama_service.py
Service d'analyse CV ↔ offre via Ollama (100% local).

Stratégie performance :
  - Nettoyage HTML des descriptions avant envoi (jobspy retourne du HTML brut)
  - CV tronqué à 1500 chars, description à 800 chars → prompt ~2500 chars total
  - num_predict=250 → limite la réponse JSON à l'essentiel
  - keep_alive=600s → modèle reste en VRAM
  - timeout=300s (5 min) → largement suffisant avec phi3.5 @ 2s/requête simple
  - generate() plutôt que chat() → plus direct
"""
import json
import re
from typing import Optional

from loguru import logger

from app.core.config import get_settings

settings = get_settings()

KEEP_ALIVE_SEC = 600   # 10 min en VRAM
OLLAMA_TIMEOUT = 300   # 5 min max

# ── Templates de prompts courts ───────────────────────────────────────────────

SCORING_PROMPT = """\
Tu es un recruteur. Score ce CV par rapport à cette offre.

CV (résumé):
{cv_text}

Offre: {job_title} chez {company}
{job_description}

Réponds UNIQUEMENT en JSON, sans texte autour:
{{"score":<entier 0-100>,"strengths":["...","..."],"gaps":["..."],"recommendation":"<une phrase>"}}"""

SKILLS_PROMPT = """\
Liste les compétences techniques de ce CV.
Réponds UNIQUEMENT avec un tableau JSON de strings, sans texte autour:
["compétence1","compétence2",...]

CV:
{cv_text}"""


def _make_client():
    try:
        import httpx
        import ollama
        return ollama.AsyncClient(
            host=settings.ollama_base_url,
            timeout=httpx.Timeout(
                connect=15.0,
                read=OLLAMA_TIMEOUT,
                write=15.0,
                pool=5.0,
            ),
        )
    except ImportError:
        return None


def _clean_html(text: str) -> str:
    """Supprime les balises HTML et décode les entités basiques."""
    if not text:
        return ""
    # Supprimer les balises HTML
    clean = re.sub(r'<[^>]+>', ' ', text)
    # Décoder entités HTML basiques
    clean = clean.replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>') \
                 .replace('&nbsp;', ' ').replace('&quot;', '"').replace('&#39;', "'")
    # Normaliser les espaces et sauts de ligne
    clean = re.sub(r'\s+', ' ', clean).strip()
    return clean


def _extract_json(text: str) -> str:
    """Extrait le JSON d'une réponse pouvant contenir du texte autour."""
    text = text.strip()

    # Cas 1 : bloc ```json ... ```
    if "```" in text:
        parts = text.split("```")
        for part in parts:
            p = part.strip()
            if p.startswith("json"):
                p = p[4:].strip()
            if p.startswith("{") or p.startswith("["):
                return p

    # Cas 2 : JSON direct
    if text.startswith("{") or text.startswith("["):
        return text

    # Cas 3 : chercher le premier { ou [
    for char, end_char in [("{", "}"), ("[", "]")]:
        start = text.find(char)
        if start != -1:
            end = text.rfind(end_char)
            if end > start:
                return text[start:end + 1]

    return text


class OllamaService:

    def __init__(self, model: Optional[str] = None) -> None:
        self.model = model or settings.ollama_model

    async def warmup(self) -> bool:
        """Précharge le modèle en mémoire."""
        client = _make_client()
        if not client:
            return False
        try:
            logger.info(f"[Ollama] Warmup {self.model}…")
            await client.generate(model=self.model, prompt="ok", keep_alive=KEEP_ALIVE_SEC)
            logger.info(f"[Ollama] {self.model} prêt ✓")
            return True
        except Exception as exc:
            logger.warning(f"[Ollama] Warmup échoué : {exc}")
            return False

    async def score_job(
        self,
        cv_text: str,
        job_title: str,
        company: str,
        job_description: str,
    ) -> dict:
        """Score un job contre un CV."""
        client = _make_client()
        if not client:
            return self._error_result("package ollama manquant")

        # Nettoyer et tronquer — garder court pour rester rapide
        cv_short   = cv_text[:1500].strip()
        desc_clean = _clean_html(job_description)[:800].strip()

        prompt = SCORING_PROMPT.format(
            cv_text=cv_short,
            job_title=job_title,
            company=company,
            job_description=desc_clean,
        )

        total_chars = len(prompt)
        logger.info(f"[Ollama] score_job — prompt {total_chars} chars → {self.model}")

        try:
            response = await client.generate(
                model=self.model,
                prompt=prompt,
                stream=False,
                keep_alive=KEEP_ALIVE_SEC,
                options={
                    "temperature": 0.1,
                    "num_predict": 250,
                    "stop": ["\n\n", "```"],
                },
            )
            raw = response["response"].strip()
            logger.debug(f"[Ollama] réponse brute : {raw[:300]}")

            raw = _extract_json(raw)
            result = json.loads(raw)
            result["score"] = max(0, min(100, int(result.get("score", 50))))
            result.setdefault("strengths", [])
            result.setdefault("gaps", [])
            result.setdefault("recommendation", "")
            logger.info(f"[Ollama] score_job OK : {result['score']}/100")
            return result

        except json.JSONDecodeError as exc:
            logger.warning(f"[Ollama] JSON invalide : {exc}\nRaw: {raw[:400]}")
            return self._error_result(f"Réponse non parsable : {exc}")
        except Exception as exc:
            logger.error(f"[Ollama] score_job error : {exc}")
            return self._error_result(str(exc))

    async def extract_skills(self, cv_text: str) -> list[str]:
        """Extrait les compétences d'un CV."""
        client = _make_client()
        if not client:
            return []

        cv_short = cv_text[:1500].strip()
        prompt   = SKILLS_PROMPT.format(cv_text=cv_short)

        logger.info(f"[Ollama] extract_skills — prompt {len(prompt)} chars → {self.model}")

        try:
            response = await client.generate(
                model=self.model,
                prompt=prompt,
                stream=False,
                keep_alive=KEEP_ALIVE_SEC,
                options={
                    "temperature": 0.0,
                    "num_predict": 200,
                    "stop": ["\n\n", "```"],
                },
            )
            raw = response["response"].strip()
            logger.debug(f"[Ollama] skills brut : {raw[:300]}")

            raw = _extract_json(raw)
            result = json.loads(raw)

            if isinstance(result, list):
                skills = [str(s) for s in result if s]
                logger.info(f"[Ollama] {len(skills)} compétences extraites")
                return skills

            if isinstance(result, dict):
                for key in ("skills", "competences", "competencies", "technologies"):
                    if key in result and isinstance(result[key], list):
                        return [str(s) for s in result[key] if s]
            return []

        except json.JSONDecodeError:
            # Fallback regex
            items = re.findall(r'"([^"]{2,50})"', raw)
            logger.info(f"[Ollama] fallback regex : {len(items)} items")
            return items[:30]
        except Exception as exc:
            logger.error(f"[Ollama] extract_skills error : {exc}")
            return []

    @staticmethod
    def _error_result(msg: str) -> dict:
        return {
            "score": 0,
            "strengths": [],
            "gaps": [],
            "recommendation": f"Erreur analyse : {msg}",
            "error": msg,
        }
