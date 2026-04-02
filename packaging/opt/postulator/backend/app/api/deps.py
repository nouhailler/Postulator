"""
app/api/deps.py
Dépendances FastAPI réutilisables (DB session, settings…).
"""
from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.db.database import get_db

# Raccourcis typés pour l'injection de dépendances
DBSession = Annotated[AsyncSession, Depends(get_db)]
AppSettings = Annotated[Settings, Depends(get_settings)]
