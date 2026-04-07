"""
scripts/migrate_add_proxies_tried.py
Ajoute la colonne proxies_tried à la table scrape_logs si elle n'existe pas.

    python scripts/migrate_add_proxies_tried.py
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
    cur.execute("PRAGMA table_info(scrape_logs)")
    cols = {row[1] for row in cur.fetchall()}
    if "proxies_tried" in cols:
        print("✓ Colonne proxies_tried déjà présente — rien à faire.")
    else:
        cur.execute("ALTER TABLE scrape_logs ADD COLUMN proxies_tried TEXT")
        con.commit()
        print("✓ Colonne proxies_tried ajoutée avec succès.")
    con.close()

if __name__ == "__main__":
    migrate()
