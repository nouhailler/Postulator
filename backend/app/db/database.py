"""
app/db/database.py
Moteur SQLAlchemy async (aiosqlite) + session factory.
"""
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import get_settings

settings = get_settings()

engine = create_async_engine(
    settings.database_url,
    echo=settings.debug,
    connect_args={"check_same_thread": False},
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    """Base déclarative partagée par tous les modèles SQLAlchemy."""
    pass


async def get_db() -> AsyncSession:
    """Dépendance FastAPI — fournit une session DB par requête."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def create_tables() -> None:
    """Crée toutes les tables au démarrage (dev). En prod : utiliser Alembic."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
