"""
scripts/migrate_add_company_url.py
Ajoute la colonne company_url à la table jobs si elle n'existe pas encore.
Exécuter une seule fois depuis le dossier backend/ :

    python scripts/migrate_add_company_url.py
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

    cur.execute("PRAGMA table_info(jobs)")
    columns = [row[1] for row in cur.fetchall()]

    if "company_url" in columns:
        print("✓ Colonne company_url déjà présente — rien à faire.")
    else:
        cur.execute("ALTER TABLE jobs ADD COLUMN company_url TEXT")
        con.commit()
        print("✓ Colonne company_url ajoutée avec succès.")

    con.close()

if __name__ == "__main__":
    migrate()
