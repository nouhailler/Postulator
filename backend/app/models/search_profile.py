"""
app/models/search_profile.py
Profil de recherche sauvegardé (mots-clés, lieu, filtres…).
"""
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class SearchProfile(Base):
    __tablename__ = "search_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255))           # Ex: "React Senior Remote"
    keywords: Mapped[str] = mapped_column(String(512))       # "react typescript vite"
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    remote_only: Mapped[bool] = mapped_column(Boolean, default=False)
    job_types: Mapped[str | None] = mapped_column(String(128), nullable=True)  # JSON list
    sources: Mapped[str | None] = mapped_column(String(256), nullable=True)    # JSON list
    results_per_source: Mapped[int] = mapped_column(Integer, default=50)
    hours_old: Mapped[int | None] = mapped_column(Integer, nullable=True)      # Offres < N heures
    min_salary: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    alert_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    alert_threshold: Mapped[int] = mapped_column(Integer, default=80)          # Score min alerte
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    def __repr__(self) -> str:
        return f"<SearchProfile id={self.id} name={self.name!r}>"
