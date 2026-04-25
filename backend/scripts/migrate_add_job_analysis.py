"""
scripts/migrate_add_job_analysis.py
Crée la table job_analyses pour l'historique des analyses d'offres.

Usage :
  cd /home/patrick/Documents/Claude/Projects/Postulator/backend
  source .venv/bin/activate
  python scripts/migrate_add_job_analysis.py
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.database import engine, Base
from app.models.job_analysis import JobAnalysis  # noqa: F401


async def migrate():
    async with engine.begin() as conn:
        await conn.run_sync(
            Base.metadata.create_all,
            tables=[Base.metadata.tables["job_analyses"]],
        )
    print("✅ Table 'job_analyses' créée (ou déjà existante).")


if __name__ == "__main__":
    asyncio.run(migrate())
