"""
app/models/user_profile.py
Profil utilisateur — infos personnelles + sections CV modulaires.
Stocké en SQLite, une seule ligne (id=1).
"""
from datetime import datetime
from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from app.db.database import Base


class UserProfile(Base):
    __tablename__ = "user_profile"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)  # toujours id=1

    # Identité
    full_name:    Mapped[str | None] = mapped_column(String(255), nullable=True)
    initials:     Mapped[str | None] = mapped_column(String(4),   nullable=True)
    title:        Mapped[str | None] = mapped_column(String(255), nullable=True)
    email:        Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone:        Mapped[str | None] = mapped_column(String(64),  nullable=True)
    location:     Mapped[str | None] = mapped_column(String(255), nullable=True)
    linkedin_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    github_url:   Mapped[str | None] = mapped_column(String(512), nullable=True)
    website_url:  Mapped[str | None] = mapped_column(String(512), nullable=True)

    # Sections CV modulaires (JSON ou Markdown libre)
    summary:      Mapped[str | None] = mapped_column(Text, nullable=True)  # Résumé professionnel
    experiences:  Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON list[{title,company,dates,description}]
    education:    Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON list[{degree,school,dates}]
    skills:       Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON list[str]
    languages:    Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON list[{lang,level}]
    certifications: Mapped[str | None] = mapped_column(Text, nullable=True)
    projects:     Mapped[str | None] = mapped_column(Text, nullable=True)
    interests:    Mapped[str | None] = mapped_column(Text, nullable=True)

    # Alertes settings
    alert_score_threshold: Mapped[int] = mapped_column(Integer, default=80)
    alert_email_enabled:   Mapped[int] = mapped_column(Integer, default=0)  # 0=off,1=on

    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
