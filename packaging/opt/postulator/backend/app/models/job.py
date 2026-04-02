"""
app/models/job.py
Modèle SQLAlchemy pour une offre d'emploi scrapée.
"""
import hashlib
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    # Identifiant de déduplication (hash URL ou hash contenu)
    content_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)

    # Données brutes
    title: Mapped[str] = mapped_column(String(255), index=True)
    company: Mapped[str] = mapped_column(String(255), index=True)
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    job_type: Mapped[str | None] = mapped_column(String(64), nullable=True)   # fulltime, contract…
    is_remote: Mapped[bool] = mapped_column(Boolean, default=False)
    salary_min: Mapped[float | None] = mapped_column(Float, nullable=True)
    salary_max: Mapped[float | None] = mapped_column(Float, nullable=True)
    salary_currency: Mapped[str | None] = mapped_column(String(8), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)      # Markdown nettoyé
    url: Mapped[str] = mapped_column(String(2048), index=True)
    source: Mapped[str] = mapped_column(String(64), index=True)               # linkedin, indeed…
    published_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    scraped_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Scores IA (remplis après analyse Ollama)
    ai_score: Mapped[float | None] = mapped_column(Float, nullable=True)      # 0.0 – 100.0
    ai_summary: Mapped[str | None] = mapped_column(Text, nullable=True)       # JSON strengths/gaps
    cv_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("cvs.id", ondelete="SET NULL"), nullable=True
    )

    # Statut Kanban
    status: Mapped[str] = mapped_column(String(32), default="new", index=True)
    # new | to_review | to_apply | applied | interview | rejected

    # Relations
    cv: Mapped["CV | None"] = relationship("CV", back_populates="jobs")

    @staticmethod
    def make_hash(url: str) -> str:
        return hashlib.sha256(url.encode()).hexdigest()

    def __repr__(self) -> str:
        return f"<Job id={self.id} title={self.title!r} source={self.source}>"
