"""
scripts/migrate_add_openrouter_config.py
Crée la table openrouter_config pour stocker la clé API et le modèle OpenRouter.

Usage :
  cd /home/patrick/Documents/Claude/Projects/Postulator/backend
  source .venv/bin/activate
  python scripts/migrate_add_openrouter_config.py
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.database import engine, Base
from app.models.openrouter_config import OpenRouterConfig  # noqa: F401


async def migrate():
    async with engine.begin() as conn:
        await conn.run_sync(
            Base.metadata.create_all,
            tables=[Base.metadata.tables["openrouter_config"]],
        )
    print("✅ Table 'openrouter_config' créée (ou déjà existante).")


if __name__ == "__main__":
    asyncio.run(migrate())
