"""
app/models/cv.py
Modèle SQLAlchemy pour un CV uploadé par l'utilisateur.
"""
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class CV(Base):
    __tablename__ = "cvs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255))           # Ex: "CV_Senior_React_2025"
    filename: Mapped[str] = mapped_column(String(512))       # Nom du fichier original
    filepath: Mapped[str] = mapped_column(String(1024))      # Chemin sur disque (uploads/)
    file_type: Mapped[str] = mapped_column(String(16))       # pdf | txt | md
    raw_text: Mapped[str | None] = mapped_column(Text, nullable=True)   # Texte extrait
    skills: Mapped[str | None] = mapped_column(Text, nullable=True)     # JSON list[str]
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)    # Résumé IA
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)    # CV actif pour scoring
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    parsed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    # Relation inverse
    jobs: Mapped[list["Job"]] = relationship("Job", back_populates="cv")  # noqa: F821

    def __repr__(self) -> str:
        return f"<CV id={self.id} name={self.name!r} default={self.is_default}>"
