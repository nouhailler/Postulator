"""
scripts/migrate_add_ats_fields.py
Ajoute les colonnes ATS à la table generated_cvs.

    python scripts/migrate_add_ats_fields.py
"""
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "postulator.db"

NEW_COLUMNS = [
    ("is_ats",               "INTEGER DEFAULT 0"),   # booléen : CV généré via mode ATS
    ("ats_total",            "REAL"),                # score global 0-100
    ("ats_score_json",       "TEXT"),                # JSON des 5 sous-scores
    ("ats_keywords_json",    "TEXT"),                # JSON liste keyword_gaps
    ("ats_suggestions_json", "TEXT"),                # JSON liste suggestions
]

def migrate():
    if not DB_PATH.exists():
        print(f"Base de données introuvable : {DB_PATH}")
        return
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    cur.execute("PRAGMA table_info(generated_cvs)")
    existing = {row[1] for row in cur.fetchall()}
    added = []
    for col_name, col_def in NEW_COLUMNS:
        if col_name not in existing:
            cur.execute(f"ALTER TABLE generated_cvs ADD COLUMN {col_name} {col_def}")
            added.append(col_name)
        else:
            print(f"  · {col_name} déjà présente — ignorée.")
    if added:
        con.commit()
        print(f"✓ Colonnes ajoutées : {', '.join(added)}")
    else:
        print("✓ Toutes les colonnes ATS étaient déjà présentes — rien à faire.")
    con.close()

if __name__ == "__main__":
    migrate()
