"""app/models/job_analysis.py — Historique des analyses d'offres."""
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text

from app.db.database import Base


class JobAnalysis(Base):
    __tablename__ = "job_analyses"

    id          = Column(Integer, primary_key=True, index=True)
    job_id      = Column(Integer, ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False, index=True)
    criteria    = Column(Text, nullable=True)    # contenu de poste (analyse initiale)
    question    = Column(Text, nullable=True)    # question de suivi
    answer      = Column(Text, nullable=False)
    provider    = Column(String(50), nullable=True)
    model       = Column(String(100), nullable=True)
    duration_ms = Column(Integer, default=0)
    desc_source = Column(String(50), nullable=True)
    created_at  = Column(DateTime, default=datetime.utcnow)
