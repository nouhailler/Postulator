"""
app/models/generated_cv.py
CV généré par Ollama pour une offre spécifique, à partir d'un StoredCV source.
Sauvegardé en base pour traçabilité complète.
"""
from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.database import Base


class GeneratedCV(Base):
    __tablename__ = "generated_cvs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)

    # CV source utilisé
    source_cv_id:   Mapped[int | None] = mapped_column(
        Integer, ForeignKey("stored_cvs.id", ondelete="SET NULL"), nullable=True
    )
    source_cv_name: Mapped[str] = mapped_column(String(255))  # snapshot du nom

    # Snapshot du texte brut du CV original — pour le diff côté frontend
    source_cv_text: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Offre cible
    job_id:      Mapped[int | None] = mapped_column(
        Integer, ForeignKey("jobs.id", ondelete="SET NULL"), nullable=True
    )
    job_title:   Mapped[str] = mapped_column(String(255))   # snapshot
    job_company: Mapped[str] = mapped_column(String(255))   # snapshot
    job_url:     Mapped[str | None] = mapped_column(String(2048), nullable=True)

    # Résultat généré
    cv_markdown:  Mapped[str]        = mapped_column(Text)
    language:     Mapped[str]        = mapped_column(String(8), default="fr")
    ollama_model: Mapped[str | None] = mapped_column(String(128), nullable=True)

    # Note manuelle optionnelle
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Relations
    source_cv: Mapped["StoredCV | None"] = relationship(  # noqa: F821
        "StoredCV", back_populates="generated_cvs"
    )
    job: Mapped["Job | None"] = relationship("Job", foreign_keys=[job_id])  # noqa: F821

    def __repr__(self) -> str:
        return f"<GeneratedCV id={self.id} job={self.job_title!r} cv={self.source_cv_name!r}>"
