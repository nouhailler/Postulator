"""
app/models/job_question.py
Historique des questions posées sur une offre via Offres Intelligence.
"""
from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from app.db.database import Base


class JobQuestion(Base):
    __tablename__ = "job_questions"

    id:          Mapped[int]      = mapped_column(Integer, primary_key=True, index=True)
    job_id:      Mapped[int]      = mapped_column(Integer, ForeignKey("jobs.id", ondelete="CASCADE"), index=True)
    question:    Mapped[str]      = mapped_column(Text, nullable=False)
    answer:      Mapped[str]      = mapped_column(Text, nullable=False)
    model:       Mapped[str]      = mapped_column(String(128), nullable=True)
    desc_source: Mapped[str]      = mapped_column(String(32), nullable=True)   # database | fetched | none
    duration_ms: Mapped[int]      = mapped_column(Integer, nullable=True)
    asked_at:    Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    def __repr__(self) -> str:
        return f"<JobQuestion id={self.id} job_id={self.job_id} asked_at={self.asked_at}>"
