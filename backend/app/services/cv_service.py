"""
app/services/cv_service.py
Upload, parsing PDF/TXT/MD et analyse IA des CVs.
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


class CVService:

    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    async def upload(self, file: UploadFile, name: str) -> CV:
        """Sauvegarde le fichier sur disque et crée l'entrée BDD."""
        content_type = file.content_type or ""
        file_type = ALLOWED_TYPES.get(content_type)
        if not file_type:
            # Fallback sur l'extension
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
            raw_text = self._extract_pdf(path)
        else:
            raw_text = path.read_text(encoding="utf-8", errors="replace")

        cv.raw_text = raw_text
        cv.parsed_at = datetime.utcnow()
        return cv

    async def analyze(self, cv: CV, model: Optional[str] = None) -> CV:
        """Lance l'extraction de compétences via Ollama."""
        if not cv.raw_text:
            await self.parse(cv)
        svc = OllamaService(model=model)
        skills = await svc.extract_skills(cv.raw_text or "")
        cv.skills = json.dumps(skills, ensure_ascii=False)
        return cv

    async def score_against_job(
        self, cv: CV, job: Job, model: Optional[str] = None
    ) -> dict:
        """Calcule le score IA CV ↔ offre et met à jour job.ai_score."""
        if not cv.raw_text:
            await self.parse(cv)
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

    @staticmethod
    def _extract_pdf(path: Path) -> str:
        try:
            import fitz  # PyMuPDF
            doc = fitz.open(str(path))
            return "\n".join(page.get_text() for page in doc)
        except ImportError:
            logger.warning("PyMuPDF non installé. Texte PDF non extrait.")
            return ""
        except Exception as exc:
            logger.error(f"[CVService] Erreur lecture PDF : {exc}")
            return ""
