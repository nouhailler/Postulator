"""
app/models/job.py
"""
import hashlib
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class Job(Base):
    __tablename__ = "jobs"

    id:           Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    content_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)

    # Données offre
    title:           Mapped[str]       = mapped_column(String(255), index=True)
    company:         Mapped[str]       = mapped_column(String(255), index=True)
    company_url:     Mapped[str | None] = mapped_column(String(2048), nullable=True)  # site web entreprise
    location:        Mapped[str | None] = mapped_column(String(255), nullable=True)
    job_type:        Mapped[str | None] = mapped_column(String(64),  nullable=True)
    is_remote:       Mapped[bool]      = mapped_column(Boolean, default=False)
    salary_min:      Mapped[float | None] = mapped_column(Float, nullable=True)
    salary_max:      Mapped[float | None] = mapped_column(Float, nullable=True)
    salary_currency: Mapped[str | None]   = mapped_column(String(8), nullable=True)
    description:     Mapped[str | None]   = mapped_column(Text, nullable=True)
    url:             Mapped[str]          = mapped_column(String(2048), index=True)
    source:          Mapped[str]          = mapped_column(String(64), index=True)
    published_at:    Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    scraped_at:      Mapped[datetime]        = mapped_column(DateTime, default=datetime.utcnow)

    # IA
    ai_score:   Mapped[float | None] = mapped_column(Float, nullable=True)
    ai_summary: Mapped[str | None]   = mapped_column(Text, nullable=True)
    cv_id:      Mapped[int | None]   = mapped_column(
        Integer, ForeignKey("cvs.id", ondelete="SET NULL"), nullable=True
    )

    # Kanban
    status: Mapped[str] = mapped_column(String(32), default="new", index=True)

    cv: Mapped["CV | None"] = relationship("CV", back_populates="jobs")

    @staticmethod
    def make_hash(url: str) -> str:
        return hashlib.sha256(url.encode()).hexdigest()

    def __repr__(self) -> str:
        return f"<Job id={self.id} title={self.title!r} source={self.source}>"
