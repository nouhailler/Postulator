"""
scripts/migrate_add_source_cv_text.py
Ajoute la colonne source_cv_text à la table generated_cvs si elle n'existe pas.

    python scripts/migrate_add_source_cv_text.py
"""
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "postulator.db"

def migrate():
    if not DB_PATH.exists():
        print(f"Base de données introuvable : {DB_PATH}")
        return
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    cur.execute("PRAGMA table_info(generated_cvs)")
    columns = [row[1] for row in cur.fetchall()]
    if "source_cv_text" in columns:
        print("✓ Colonne source_cv_text déjà présente — rien à faire.")
    else:
        cur.execute("ALTER TABLE generated_cvs ADD COLUMN source_cv_text TEXT")
        con.commit()
        print("✓ Colonne source_cv_text ajoutée avec succès.")
    con.close()

if __name__ == "__main__":
    migrate()
