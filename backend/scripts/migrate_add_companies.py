"""
scripts/migrate_add_companies.py
Crée la table companies pour le scraping ciblé des pages carrières.

Usage :
  cd /home/patrick/Documents/Claude/Projects/Postulator/backend
  source .venv/bin/activate
  python scripts/migrate_add_companies.py
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.database import engine, Base
from app.models.company import Company  # noqa: F401


async def migrate():
    async with engine.begin() as conn:
        await conn.run_sync(
            Base.metadata.create_all,
            tables=[Base.metadata.tables["companies"]],
        )
    print("✅ Table 'companies' créée (ou déjà existante).")


if __name__ == "__main__":
    asyncio.run(migrate())
