"""
app/models/stored_cv.py
CV utilisateur nommé et daté — plusieurs CV peuvent coexister.
Chaque CV contient les sections structurées prêtes pour la génération.
"""
from datetime import datetime
from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.database import Base


class StoredCV(Base):
    __tablename__ = "stored_cvs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    # Identifiant humain
    name:        Mapped[str]       = mapped_column(String(255))           # ex: "CV Senior Python 2025"
    created_at:  Mapped[datetime]  = mapped_column(DateTime, default=datetime.utcnow)
    updated_at:  Mapped[datetime]  = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Source d'import (optionnel)
    source_pdf:  Mapped[str | None] = mapped_column(String(512), nullable=True)  # chemin fichier PDF source

    # Identité
    full_name:    Mapped[str | None] = mapped_column(String(255), nullable=True)
    title:        Mapped[str | None] = mapped_column(String(255), nullable=True)
    email:        Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone:        Mapped[str | None] = mapped_column(String(64),  nullable=True)
    location:     Mapped[str | None] = mapped_column(String(255), nullable=True)
    linkedin_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    github_url:   Mapped[str | None] = mapped_column(String(512), nullable=True)
    website_url:  Mapped[str | None] = mapped_column(String(512), nullable=True)

    # Sections — texte libre (Markdown), sans limite de taille
    summary:        Mapped[str | None] = mapped_column(Text, nullable=True)
    experiences:    Mapped[str | None] = mapped_column(Text, nullable=True)
    education:      Mapped[str | None] = mapped_column(Text, nullable=True)
    skills:         Mapped[str | None] = mapped_column(Text, nullable=True)
    languages:      Mapped[str | None] = mapped_column(Text, nullable=True)
    certifications: Mapped[str | None] = mapped_column(Text, nullable=True)
    projects:       Mapped[str | None] = mapped_column(Text, nullable=True)
    interests:      Mapped[str | None] = mapped_column(Text, nullable=True)

    # CVs générés à partir de ce CV source
    generated_cvs: Mapped[list["GeneratedCV"]] = relationship(  # noqa: F821
        "GeneratedCV", back_populates="source_cv", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<StoredCV id={self.id} name={self.name!r}>"
