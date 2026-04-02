"""
app/models/match_history.py
Historique des analyses CV ↔ offre effectuées via Ollama.
"""
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class MatchHistory(Base):
    __tablename__ = "match_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    # Quand
    analyzed_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)

    # CV utilisé
    cv_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("cvs.id", ondelete="SET NULL"), nullable=True
    )
    cv_name: Mapped[str] = mapped_column(String(255))         # snapshot du nom au moment de l'analyse
    cv_skills: Mapped[str | None] = mapped_column(Text)       # JSON list[str] — snapshot des skills

    # Offre analysée
    job_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("jobs.id", ondelete="SET NULL"), nullable=True
    )
    job_title: Mapped[str] = mapped_column(String(255))       # snapshot
    job_company: Mapped[str] = mapped_column(String(255))     # snapshot
    job_url: Mapped[str | None] = mapped_column(String(2048)) # snapshot
    job_source: Mapped[str | None] = mapped_column(String(64))

    # Résultat Ollama
    score: Mapped[float] = mapped_column(Float)
    strengths: Mapped[str | None] = mapped_column(Text)       # JSON list[str]
    gaps: Mapped[str | None] = mapped_column(Text)            # JSON list[str]
    recommendation: Mapped[str | None] = mapped_column(Text)

    # Modèle utilisé
    ollama_model: Mapped[str | None] = mapped_column(String(128))

    # Relations (optionnelles — les FK peuvent être NULL si CV/Job supprimés)
    cv: Mapped["CV | None"] = relationship("CV", foreign_keys=[cv_id])   # noqa: F821
    job: Mapped["Job | None"] = relationship("Job", foreign_keys=[job_id])  # noqa: F821

    def __repr__(self) -> str:
        return f"<MatchHistory id={self.id} score={self.score} cv={self.cv_name!r}>"
