"""
app/services/cv_service.py
Upload, parsing PDF/TXT/MD et analyse IA des CVs.

Améliorations PDF (v1.5.2) :
 - Extraction par blocs PyMuPDF (meilleure détection des paragraphes)
 - Suppression automatique des bullets/puces
 - Jonction des lignes fragmentées (sans ponctuation finale → next lowercase)
 - Détection d'avertissements : caractères isolés, texte très court, garbled chars
 - Endpoint /api/cvs/preview-pdf pour validation avant import
"""
import json
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import UploadFile
from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cv import CV
from app.models.job import Job
from app.services.ollama_service import OllamaService

UPLOAD_DIR = Path("uploads/cvs")
ALLOWED_TYPES = {
    "application/pdf": "pdf",
    "text/plain": "txt",
    "text/markdown": "md",
}

# Caractères de puces / bullets à supprimer en début de ligne
_BULLET_CHARS = frozenset('•▪○◆‣→►▸·◦–—▶✓✗✘✦✧❖❗►◉▷')
# Ponctuation marquant la fin d'une phrase complète
_SENTENCE_ENDERS = frozenset('.!?:;')


def _clean_pdf_block(block_raw: str) -> str:
    """
    Nettoie un bloc de texte issu de PyMuPDF :
     1. Supprime les bullets/puces en début de ligne
     2. Joint les lignes fragmentées (ligne sans ponctuation finale
        dont la suivante commence par une minuscule → même phrase)
    """
    lines = block_raw.split('\n')
    cleaned: list[str] = []

    for line in lines:
        line = line.strip()
        if not line:
            continue
        # ── Supprimer les bullets en début de ligne ──────────────────────────
        if line[0] in _BULLET_CHARS:
            line = line[1:].strip()
        elif len(line) >= 2 and line[0] in '-*+' and line[1] == ' ':
            line = line[2:].strip()
        if line:
            cleaned.append(line)

    if not cleaned:
        return ''

    # ── Joindre les lignes fragmentées ──────────────────────────────────────
    # Heuristique : si la ligne ne finit PAS par une ponctuation finale
    # ET que la suivante commence par une minuscule → continuation de phrase.
    # Cas spécial : tiret de césure (fin de mot tronqué) → coller sans espace.
    joined: list[str] = []
    i = 0
    while i < len(cleaned):
        current = cleaned[i]
        while i + 1 < len(cleaned) and current:
            nxt = cleaned[i + 1]
            if not nxt:
                break
            # Tiret de coupure de mot → coller directement
            if current.endswith('-'):
                current = current[:-1] + nxt
                i += 1
                continue
            # Ligne incomplète + début minuscule → même phrase
            if current[-1] not in _SENTENCE_ENDERS and nxt[0].islower():
                current = current + ' ' + nxt
                i += 1
                continue
            break
        joined.append(current)
        i += 1

    return '\n'.join(joined)


class CVService:

    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    async def upload(self, file: UploadFile, name: str) -> CV:
        """Sauvegarde le fichier sur disque et crée l'entrée BDD."""
        content_type = file.content_type or ""
        file_type = ALLOWED_TYPES.get(content_type)
        if not file_type:
            ext = Path(file.filename or "").suffix.lower().lstrip(".")
            file_type = ext if ext in ("pdf", "txt", "md") else "txt"

        dest = UPLOAD_DIR / f"{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}_{file.filename}"
        content = await file.read()
        dest.write_bytes(content)

        cv = CV(
            name=name,
            filename=file.filename or dest.name,
            filepath=str(dest),
            file_type=file_type,
        )
        self.db.add(cv)
        await self.db.flush()
        return cv

    async def parse(self, cv: CV) -> CV:
        """Extrait le texte brut du CV selon son type."""
        path = Path(cv.filepath)
        if not path.exists():
            logger.error(f"[CVService] Fichier introuvable : {path}")
            return cv

        if cv.file_type == "pdf":
            raw_text, warnings = self._extract_pdf(path)
            if warnings:
                logger.info(f"[CVService] PDF '{cv.filename}' — {len(warnings)} avertissement(s) : {warnings}")
        else:
            raw_text = path.read_text(encoding="utf-8", errors="replace")

        cv.raw_text = raw_text
        cv.parsed_at = datetime.utcnow()
        return cv

    async def analyze(
        self, cv: CV, model: Optional[str] = None,
        openrouter_key: Optional[str] = None,
        openrouter_model: Optional[str] = None,
    ) -> CV:
        """Lance l'extraction de compétences via OpenRouter (priorité) ou Ollama."""
        if not cv.raw_text:
            await self.parse(cv)
        if openrouter_key:
            from app.services.openrouter_service import OpenRouterService
            svc_or = OpenRouterService(openrouter_key, openrouter_model or "")
            skills = await svc_or.extract_skills(cv.raw_text or "")
        else:
            svc = OllamaService(model=model)
            skills = await svc.extract_skills(cv.raw_text or "")
        cv.skills = json.dumps(skills, ensure_ascii=False)
        return cv

    async def score_against_job(
        self, cv: CV, job: Job, model: Optional[str] = None,
        openrouter_key: Optional[str] = None,
        openrouter_model: Optional[str] = None,
    ) -> dict:
        """Calcule le score IA CV ↔ offre via OpenRouter (priorité) ou Ollama."""
        if not cv.raw_text:
            await self.parse(cv)
        if openrouter_key:
            from app.services.openrouter_service import OpenRouterService
            svc_or = OpenRouterService(openrouter_key, openrouter_model or "")
            result = await svc_or.score_job(
                cv_text=cv.raw_text or "",
                job_title=job.title,
                company=job.company,
                job_description=job.description or "",
            )
        else:
            svc = OllamaService(model=model)
            result = await svc.score_job(
                cv_text=cv.raw_text or "",
                job_title=job.title,
                company=job.company,
                job_description=job.description or "",
            )
        job.ai_score = float(result.get("score", 0))
        job.ai_summary = json.dumps(result, ensure_ascii=False)
        job.cv_id = cv.id
        return result

    # ── Extraction PDF ─────────────────────────────────────────────────────────

    @staticmethod
    def _extract_pdf(path: Path) -> tuple[str, list[str]]:
        """
        Extrait et nettoie le texte d'un PDF.
        Utilise PyMuPDF par blocs pour une meilleure détection des paragraphes.

        Retourne : (texte_nettoyé, liste_d_avertissements)
        """
        try:
            import fitz  # PyMuPDF
        except ImportError:
            return "", ["PyMuPDF (fitz) non installé — pip install pymupdf"]

        try:
            doc = fitz.open(str(path))
        except Exception as exc:
            return "", [f"Impossible d'ouvrir le PDF : {exc}"]

        all_block_texts: list[str] = []
        for page in doc:
            # "blocks" retourne : (x0, y0, x1, y1, text, block_no, block_type)
            # block_type 0 = texte, 1 = image
            blocks = page.get_text("blocks")
            text_blocks = [b for b in blocks if b[6] == 0 and b[4].strip()]
            # Tri lecture naturelle : par rangée (y arrondi à 10px), puis gauche→droite
            text_blocks.sort(key=lambda b: (round(b[1] / 12) * 12, b[0]))
            all_block_texts.extend(b[4] for b in text_blocks)

        if not any(t.strip() for t in all_block_texts):
            return "", [
                "Le PDF ne contient pas de texte extractible — "
                "il s'agit probablement d'un scan (image). "
                "Convertissez-le d'abord avec un outil OCR."
            ]

        # Nettoyer chaque bloc et assembler
        cleaned_blocks = [_clean_pdf_block(b) for b in all_block_texts]
        cleaned_blocks = [b for b in cleaned_blocks if b]
        full_text = '\n\n'.join(cleaned_blocks)

        # ── Détection d'avertissements ────────────────────────────────────────
        warnings: list[str] = []
        all_lines     = full_text.split('\n')
        non_empty     = [l for l in all_lines if l.strip()]
        total_chars   = len(full_text)

        # 1. Caractères isolés (puces résiduelles, symboles)
        isolated = [l for l in non_empty if len(l.strip()) == 1]
        if len(isolated) > 3:
            warnings.append(
                f"{len(isolated)} caractère(s) isolé(s) détecté(s) — "
                "possibles artefacts PDF (puces, symboles de mise en page). "
                "Vérifiez le texte ci-dessous."
            )

        # 2. Lignes très courtes (< 5 chars) — fragmentations suspectes
        very_short = [l for l in non_empty if 1 < len(l.strip()) < 5]
        if len(very_short) > 5:
            warnings.append(
                f"{len(very_short)} ligne(s) très courte(s) (<5 car.) — "
                "le PDF peut avoir fragmenté le texte. "
                "Le contenu sera quand même importé."
            )

        # 3. Caractères non imprimables / encodage corrompu
        if total_chars > 50:
            weird = sum(
                1 for c in full_text
                if ord(c) > 0xFFFD or (ord(c) < 32 and c not in '\n\t ')
            )
            if weird / total_chars > 0.005:
                warnings.append(
                    "Des caractères inhabituels ont été détectés — "
                    "le PDF utilise peut-être une police personnalisée ou un encodage non standard. "
                    "Vérifiez que le texte extrait est lisible."
                )

        # 4. Texte trop court
        if total_chars < 200:
            warnings.append(
                f"Le texte extrait est très court ({total_chars} caractères) — "
                "le PDF est peut-être un scan sans couche texte, ou protégé en écriture."
            )

        return full_text, warnings
