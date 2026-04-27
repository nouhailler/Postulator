"""
app/services/openrouter_service.py
Service OpenRouter — alternative gratuite à Ollama via API REST compatible OpenAI.

Quand une clé OpenRouter est configurée, ce service remplace Ollama pour :
  - score_job        → scoring CV ↔ offre
  - extract_skills   → extraction compétences CV
  - generate_cv      → génération CV Markdown adapté à une offre
  - generate_ats_cv  → génération CV ATS-optimisé (JSON)
  - generate_summary → résumé d'offre en bullet points

API : https://openrouter.ai/api/v1  (compatible OpenAI chat/completions)
Modèles gratuits recommandés : deepseek/deepseek-r1:free, meta-llama/llama-4-maverick:free,
                                 google/gemma-3-27b-it:free, mistralai/mistral-7b-instruct:free
"""
import json
import re
from typing import Optional

import httpx
from loguru import logger

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
OPENROUTER_HEADERS  = {
    "HTTP-Referer": "https://postulator.local",
    "X-Title":      "Postulator",
}

# Modèles gratuits recommandés (affichés dans les paramètres)
FREE_MODELS_FALLBACK = [
    {"id": "deepseek/deepseek-r1:free",               "name": "DeepSeek R1 (raisonnement avancé)",    "context": "163k"},
    {"id": "meta-llama/llama-4-maverick:free",        "name": "Llama 4 Maverick (généraliste)",       "context": "1M"},
    {"id": "google/gemma-3-27b-it:free",              "name": "Gemma 3 27B (Google)",                 "context": "131k"},
    {"id": "mistralai/mistral-7b-instruct:free",      "name": "Mistral 7B Instruct",                  "context": "32k"},
    {"id": "nvidia/llama-3.1-nemotron-ultra-253b:free","name": "Nemotron Ultra 253B (NVIDIA)",        "context": "131k"},
    {"id": "qwen/qwen3-235b-a22b:free",               "name": "Qwen3 235B",                           "context": "131k"},
    {"id": "meta-llama/llama-3.3-70b-instruct:free",  "name": "Llama 3.3 70B Instruct",               "context": "131k"},
    {"id": "google/gemma-3-12b-it:free",              "name": "Gemma 3 12B (rapide)",                 "context": "131k"},
]


def _retryable(data: dict, status: int) -> bool:
    """Retourne True si la réponse justifie d'essayer le prochain modèle."""
    if status in (429, 503, 529):          # rate-limit / surcharge
        return True
    if status == 200:
        content = (data.get("choices") or [{}])[0].get("message", {}).get("content")
        if content is None:                 # modèle indisponible → content null
            return True
    return False


async def chat_with_fallback(
    api_key:     str,
    preferred:   str,
    messages:    list[dict],
    max_tokens:  int   = 500,
    temperature: float = 0.1,
    json_mode:   bool  = False,
    timeout:     float = 120.0,
) -> tuple[str, str]:
    """
    Envoie les messages à OpenRouter avec fallback automatique sur les modèles gratuits.

    Ordre d'essai : preferred_model en premier, puis les autres FREE_MODELS_FALLBACK
    dans l'ordre, en sautant ceux déjà essayés.

    Retourne (content, model_used).
    Lève RuntimeError si tous les modèles échouent.
    """
    # Construire la liste ordonnée : modèle préféré + reste de la liste statique
    model_ids = [preferred] + [m["id"] for m in FREE_MODELS_FALLBACK if m["id"] != preferred]

    headers = {
        **OPENROUTER_HEADERS,
        "Authorization": f"Bearer {api_key}",
        "Content-Type":  "application/json",
    }

    last_error = "Tous les modèles OpenRouter ont échoué."

    for model in model_ids:
        body: dict = {
            "model":       model,
            "messages":    messages,
            "max_tokens":  max_tokens,
            "temperature": temperature,
        }
        if json_mode:
            body["response_format"] = {"type": "json_object"}

        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.post(
                    f"{OPENROUTER_BASE_URL}/chat/completions",
                    headers=headers,
                    json=body,
                )
            data = resp.json() if resp.content else {}

            if _retryable(data, resp.status_code):
                err = (data.get("error") or {}).get("message") or \
                      data.get("message") or f"HTTP {resp.status_code}"
                logger.warning(f"[OpenRouter] {model} → {err} — passage au suivant")
                last_error = f"{model} : {err}"
                continue

            resp.raise_for_status()
            content = (data.get("choices") or [{}])[0].get("message", {}).get("content", "")
            if not content:
                last_error = f"{model} : réponse vide inattendue"
                continue

            if model != preferred:
                logger.info(f"[OpenRouter] fallback utilisé : {model}")
            return content.strip(), model

        except httpx.TimeoutException:
            last_error = f"{model} : timeout"
            logger.warning(f"[OpenRouter] {model} → timeout — passage au suivant")
            continue
        except Exception as exc:
            last_error = f"{model} : {exc}"
            logger.warning(f"[OpenRouter] {model} → {exc} — passage au suivant")
            continue

    raise RuntimeError(last_error)


def _extract_json(text: str) -> str:
    """
    Extrait et répare le JSON d'une réponse pouvant contenir du texte autour
    ou être tronquée (max_tokens atteint).
    """
    text = text.strip()

    # 1. Bloc ```json ... ```
    if "```" in text:
        parts = text.split("```")
        for part in parts:
            p = part.strip()
            if p.startswith("json"):
                p = p[4:].strip()
            if p.startswith("{") or p.startswith("["):
                text = p
                break

    # 2. Trouver l'objet JSON le plus probable
    if not (text.startswith("{") or text.startswith("[")):
        for char in ("{", "["):
            start = text.find(char)
            if start != -1:
                text = text[start:]
                break

    # 3. Tenter parse direct
    try:
        json.loads(text)
        return text
    except json.JSONDecodeError:
        pass

    # 4. JSON tronqué : chercher la dernière accolade/crochet fermant valide
    for end_char in ("}", "]"):
        pos = text.rfind(end_char)
        if pos != -1:
            candidate = text[:pos + 1]
            try:
                json.loads(candidate)
                return candidate
            except json.JSONDecodeError:
                pass

    # 5. Réparer un JSON tronqué en fermant les structures ouvertes
    repaired = _repair_truncated_json(text)
    if repaired:
        return repaired

    return text


def _repair_truncated_json(text: str) -> str:
    """
    Tente de réparer un JSON tronqué en fermant les structures ouvertes.
    Stratégie : fermer les chaînes ouvertes puis ajouter les accolades/crochets manquants.
    """
    try:
        # Compter les structures ouvertes
        stack = []
        in_string = False
        escape_next = False
        result = []

        for ch in text:
            if escape_next:
                escape_next = False
                result.append(ch)
                continue
            if ch == '\\' and in_string:
                escape_next = True
                result.append(ch)
                continue
            if ch == '"':
                in_string = not in_string
                result.append(ch)
                continue
            if in_string:
                result.append(ch)
                continue
            if ch in ('{', '['):
                stack.append('}' if ch == '{' else ']')
            elif ch in ('}', ']'):
                if stack and stack[-1] == ch:
                    stack.pop()
            result.append(ch)

        # Fermer la chaîne si elle était ouverte
        if in_string:
            result.append('"')

        # Supprimer la virgule finale si présente avant la fermeture
        s = ''.join(result).rstrip()
        if s.endswith(','):
            s = s[:-1]

        # Fermer les structures dans l'ordre inverse
        s = s + ''.join(reversed(stack))

        json.loads(s)
        return s
    except Exception:
        return ""


def _clean_html(text: str) -> str:
    if not text:
        return ""
    clean = re.sub(r'<[^>]+>', ' ', text)
    clean = clean.replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>') \
                 .replace('&nbsp;', ' ').replace('&quot;', '"').replace('&#39;', "'")
    return re.sub(r'\s+', ' ', clean).strip()


class OpenRouterService:
    """Client OpenRouter — interface identique à OllamaService."""

    def __init__(self, api_key: str, model: str = "deepseek/deepseek-r1:free") -> None:
        self.api_key = api_key
        self.model   = model or "deepseek/deepseek-r1:free"

    # ── Helpers HTTP ──────────────────────────────────────────────────────────

    def _headers(self) -> dict:
        return {
            **OPENROUTER_HEADERS,
            "Authorization":  f"Bearer {self.api_key}",
            "Content-Type":   "application/json",
        }

    async def _chat(
        self,
        prompt:      str,
        max_tokens:  int   = 500,
        temperature: float = 0.1,
        json_mode:   bool  = False,
        timeout:     float = 120.0,
    ) -> str:
        """Appel OpenRouter avec fallback automatique sur les modèles gratuits."""
        content, used_model = await chat_with_fallback(
            api_key=self.api_key,
            preferred=self.model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=max_tokens,
            temperature=temperature,
            json_mode=json_mode,
            timeout=timeout,
        )
        self._last_model_used = used_model   # accessible pour les logs
        return content

    # ── Scoring CV ↔ offre ────────────────────────────────────────────────────

    SCORING_PROMPT = """\
Tu es un recruteur expert. Analyse la correspondance entre ce CV et cette offre d'emploi.

CV (extrait):
{cv_text}

Offre: {job_title} chez {company}
{job_description}

Réponds UNIQUEMENT avec un objet JSON valide et complet, sans aucun texte avant ou après.
Le JSON doit contenir exactement ces 4 clés :
- "score" : entier entre 0 et 100
- "strengths" : tableau de 3 à 5 points forts (strings)
- "gaps" : tableau de 2 à 4 points de développement (strings)
- "recommendation" : une phrase de recommandation (string)

JSON:"""

    async def score_job(
        self,
        cv_text:         str,
        job_title:       str,
        company:         str,
        job_description: str,
    ) -> dict:
        cv_short   = cv_text[:2000].strip()
        desc_clean = _clean_html(job_description)[:1000].strip()
        prompt = self.SCORING_PROMPT.format(
            cv_text=cv_short, job_title=job_title,
            company=company,  job_description=desc_clean,
        )
        logger.info(f"[OpenRouter] score_job — {len(prompt)} chars → {self.model}")
        try:
            # max_tokens augmenté à 800 pour éviter la troncature JSON
            # json_mode=False : certains modèles gratuits l'ignorent ou échouent avec
            raw = await self._chat(prompt, max_tokens=800, temperature=0.1, json_mode=False)
            logger.debug(f"[OpenRouter] réponse brute : {raw[:400]}")
            raw = _extract_json(raw)
            result = json.loads(raw)
            result["score"] = max(0, min(100, int(result.get("score", 50))))
            result.setdefault("strengths", [])
            result.setdefault("gaps", [])
            result.setdefault("recommendation", "")
            logger.info(f"[OpenRouter] score_job OK : {result['score']}/100")
            return result
        except json.JSONDecodeError as exc:
            logger.warning(f"[OpenRouter] JSON invalide : {exc}")
            return self._error_result(f"Réponse non parsable : {exc}")
        except Exception as exc:
            logger.error(f"[OpenRouter] score_job error : {exc}")
            return self._error_result(str(exc))

    # ── Extraction compétences ────────────────────────────────────────────────

    SKILLS_PROMPT = """\
Liste les compétences techniques de ce CV.
Réponds UNIQUEMENT avec un tableau JSON de strings, sans texte autour:
["compétence1","compétence2",...]

CV:
{cv_text}"""

    async def extract_skills(self, cv_text: str) -> list[str]:
        cv_short = cv_text[:1500].strip()
        prompt   = self.SKILLS_PROMPT.format(cv_text=cv_short)
        logger.info(f"[OpenRouter] extract_skills → {self.model}")
        try:
            raw = await self._chat(prompt, max_tokens=300, temperature=0.0, json_mode=False)
            raw = _extract_json(raw)
            result = json.loads(raw)
            if isinstance(result, list):
                return [str(s) for s in result if s][:50]
            if isinstance(result, dict):
                for key in ("skills", "competences", "competencies", "technologies"):
                    if key in result and isinstance(result[key], list):
                        return [str(s) for s in result[key] if s]
            return []
        except json.JSONDecodeError:
            items = re.findall(r'"([^"]{2,50})"', raw if 'raw' in dir() else "")
            return items[:30]
        except Exception as exc:
            logger.error(f"[OpenRouter] extract_skills error : {exc}")
            return []

    # ── Résumé d'offre ────────────────────────────────────────────────────────

    async def generate_summary(self, job_title: str, job_company: str, description: str) -> Optional[str]:
        desc_clean = _clean_html(description)[:3000]
        if len(desc_clean) < 50:
            return None
        prompt = f"""Tu es un expert en recrutement. Analyse cette offre d'emploi et fournis un résumé structuré.

Offre : {job_title} chez {job_company}
Description : {desc_clean}

Génère un résumé en exactement 8 à 10 points bullet, en français, couvrant :
1. Le rôle principal et les responsabilités clés
2. Les compétences techniques indispensables
3. L'expérience requise (années, domaines)
4. Les compétences soft skills attendues
5. Les avantages / points attractifs de ce poste

Format OBLIGATOIRE — uniquement des bullet points, sans titre, sans introduction, sans conclusion :
• [Point 1]
• [Point 2]
...

Maximum 10 bullet points. Chaque point : 1 ligne concise."""

        try:
            raw = await self._chat(prompt, max_tokens=700, temperature=0.2, timeout=60.0)
            lines = [l.strip() for l in raw.split('\n') if l.strip() and
                     (l.strip().startswith('•') or l.strip().startswith('-') or l.strip().startswith('*'))]
            lines = lines[:10]
            if not lines:
                lines = [l.strip() for l in raw.split('\n') if l.strip()][:10]
            return '\n'.join(lines) if lines else None
        except Exception as exc:
            logger.error(f"[OpenRouter] generate_summary error : {exc}")
            return None

    # ── Génération CV Markdown ────────────────────────────────────────────────

    async def generate_cv(self, prompt: str) -> str:
        """Génère un CV Markdown à partir d'un prompt déjà construit."""
        logger.info(f"[OpenRouter] generate_cv — {len(prompt)} chars → {self.model}")
        raw = await self._chat(prompt, max_tokens=3000, temperature=0.25, timeout=120.0)
        md_start = raw.find("#")
        if md_start > 0:
            raw = raw[md_start:]
        return raw

    # ── Génération CV ATS (JSON) ──────────────────────────────────────────────

    async def generate_ats_cv(self, prompt: str) -> str:
        """Génère un CV ATS en JSON à partir d'un prompt déjà construit."""
        logger.info(f"[OpenRouter] generate_ats_cv — {len(prompt)} chars → {self.model}")
        raw = await self._chat(
            prompt, max_tokens=4000, temperature=0.2,
            json_mode=True, timeout=180.0,
        )
        return raw

    # ── Helpers ───────────────────────────────────────────────────────────────

    @staticmethod
    def _error_result(msg: str) -> dict:
        return {
            "score": 0, "strengths": [], "gaps": [],
            "recommendation": f"Erreur analyse : {msg}",
            "error": msg,
        }


# ── Utilitaires globaux ───────────────────────────────────────────────────────

async def get_free_models(api_key: Optional[str] = None) -> list[dict]:
    """
    Récupère la liste des modèles gratuits disponibles sur OpenRouter.
    Si l'API est inaccessible, retourne la liste statique de repli.
    """
    try:
        headers = {"Content-Type": "application/json"}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{OPENROUTER_BASE_URL}/models", headers=headers)
            resp.raise_for_status()
            data = resp.json()

        models = []
        for m in data.get("data", []):
            mid = m.get("id", "")
            pricing = m.get("pricing", {})
            prompt_price = pricing.get("prompt", "1")
            # Modèle gratuit si :free dans l'id OU prix = "0"
            if ":free" in mid or str(prompt_price) == "0":
                models.append({
                    "id":      mid,
                    "name":    m.get("name", mid),
                    "context": str(m.get("context_length", "?")),
                })
        return models if models else FREE_MODELS_FALLBACK
    except Exception as exc:
        logger.warning(f"[OpenRouter] get_free_models failed : {exc} — utilisation liste statique")
        return FREE_MODELS_FALLBACK


async def load_openrouter_config(db) -> Optional["OpenRouterConfig"]:  # type: ignore[name-defined]
    """Charge la config OpenRouter depuis la DB. Retourne None si pas configuré."""
    from app.models.openrouter_config import OpenRouterConfig
    cfg = await db.get(OpenRouterConfig, 1)
    if cfg and cfg.api_key:
        return cfg
    return None
