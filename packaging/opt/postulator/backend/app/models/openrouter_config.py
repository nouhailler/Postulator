"""
app/models/openrouter_config.py
Configuration OpenRouter — clé API et modèle choisi.
Stocké en SQLite, une seule ligne (id=1).
"""
from datetime import datetime
from sqlalchemy import DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column
from app.db.database import Base


class OpenRouterConfig(Base):
    __tablename__ = "openrouter_config"

    id:       Mapped[int] = mapped_column(Integer, primary_key=True)  # toujours id=1
    api_key:  Mapped[str] = mapped_column(String(512), default="")
    model:    Mapped[str] = mapped_column(String(256), default="deepseek/deepseek-r1:free")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
