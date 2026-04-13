"""
scripts/migrate_add_job_questions.py
Crée la table job_questions pour sauvegarder les Q&A de la page Offres Intelligence.

Usage :
  cd /home/patrick/Documents/Claude/Projects/Postulator/backend
  source .venv/bin/activate
  python scripts/migrate_add_job_questions.py
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.database import engine, Base
# Importer le modèle pour qu'il soit enregistré dans Base.metadata
from app.models.job_question import JobQuestion  # noqa: F401


async def migrate():
    async with engine.begin() as conn:
        await conn.run_sync(
            Base.metadata.create_all,
            tables=[Base.metadata.tables["job_questions"]],
        )
    print("✅ Table 'job_questions' créée (ou déjà existante).")


if __name__ == "__main__":
    asyncio.run(migrate())
