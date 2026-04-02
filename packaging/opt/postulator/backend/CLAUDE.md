# CLAUDE.md – Postulator Backend

## Projet
API FastAPI async pour **Postulator** — scraping multi-sources, scoring IA
via Ollama, gestion CVs, pipeline Kanban.

## Stack
- Python 3.12 · FastAPI 0.115 · Uvicorn
- SQLAlchemy 2 async + aiosqlite (SQLite en dev, PostgreSQL possible en prod)
- Alembic (migrations)
- Celery + Redis (tâches asynchrones)
- python-jobspy (scraping Indeed, LinkedIn, Glassdoor, ZipRecruiter, Google)
- Ollama (inférence locale — modèle configurable dans .env)
- PyMuPDF (extraction texte PDF)
- Pydantic v2 + pydantic-settings
- Loguru

## Architecture
```
app/
├── main.py                ← FastAPI app + lifespan (startup/shutdown)
├── core/
│   ├── config.py          ← Settings via .env (pydantic-settings)
│   └── logging.py         ← Loguru setup
├── db/
│   └── database.py        ← Engine async, session factory, Base, create_tables()
├── models/                ← SQLAlchemy ORM
│   ├── job.py             ← Job (offre scrapée + score IA + statut Kanban)
│   ├── cv.py              ← CV (fichier uploadé + skills extraits)
│   ├── search_profile.py  ← Profil de recherche sauvegardé
│   └── scrape_log.py      ← Journal des sessions de scraping
├── schemas/               ← Pydantic I/O (FastAPI)
│   ├── job.py
│   ├── cv.py
│   ├── scraper.py
│   └── dashboard.py
├── scrapers/              ← Moteurs de scraping
│   ├── base.py            ← BaseScraper (ABC) + RawJob dataclass
│   ├── jobspy_scraper.py  ← python-jobspy (5 sources)
│   ├── proxy_manager.py   ← Rotation proxies (round-robin / random)
│   └── __init__.py        ← SCRAPER_REGISTRY + get_scraper()
├── services/              ← Logique métier
│   ├── scraper_service.py ← Orchestration N scrapers + déduplication
│   ├── ollama_service.py  ← Scoring CV↔offre + extraction skills
│   └── cv_service.py      ← Upload, parse PDF, analyse Ollama
├── workers/               ← Celery
│   ├── celery_app.py      ← Config Celery
│   ├── scrape_task.py     ← Tâche scraping async
│   └── analysis_task.py   ← Tâche scoring Ollama async
└── api/
    ├── deps.py            ← Dépendances FastAPI (DBSession, AppSettings)
    ├── router.py          ← Agrège tous les routers sous /api
    └── routes/
        ├── dashboard.py   ← GET /api/dashboard/overview
        ├── jobs.py        ← CRUD /api/jobs
        ├── cvs.py         ← Upload/CRUD /api/cvs
        ├── scrapers.py    ← POST /api/scrapers/run + logs
        └── analysis.py    ← POST /api/analysis/score + Ollama ping
```

## Endpoints principaux
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | /api/dashboard/overview | KPIs + velocity + logs |
| GET | /api/jobs | Liste paginée + filtres |
| GET | /api/jobs/top-matches | Offres triées par score IA |
| PATCH | /api/jobs/{id}/status | Mise à jour Kanban |
| POST | /api/scrapers/run | Lance scraping (Celery) |
| GET | /api/scrapers/status/{task_id} | Polling tâche |
| GET | /api/scrapers/logs | Audit trail |
| POST | /api/cvs/upload | Upload CV (PDF/TXT/MD) |
| POST | /api/cvs/{id}/analyze | Extraction skills Ollama |
| POST | /api/analysis/score | Scoring async CV↔offre |
| POST | /api/analysis/score-sync | Scoring synchrone (dev) |
| GET | /api/analysis/ollama/ping | Vérif Ollama |
| GET | /api/analysis/ollama/models | Modèles installés |

## Variables .env importantes
```
OLLAMA_MODEL=qwen2.5:14b   # phi4-mini (rapide) ou qwen2.5:32b (qualité)
DATABASE_URL=sqlite+aiosqlite:///./postulator.db
REDIS_URL=redis://localhost:6379/0
PROXY_LIST=                 # vide = IP directe
```

## Commandes
```bash
cd backend

# Environnement virtuel
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Démarrage API
uvicorn app.main:app --reload --port 8000

# Worker Celery (terminal séparé)
celery -A app.workers.celery_app.celery_app worker --loglevel=info

# Migrations Alembic
alembic revision --autogenerate -m "init"
alembic upgrade head
```

## Conventions
- `write_file` pour réécrire un fichier entier (pas d'édition partielle)
- `read_multiple_files` pour charger plusieurs fichiers en batch
- Imports tardifs dans les tâches Celery (évite les imports circulaires)
- Tous les modèles importés dans `app/models/__init__.py` pour Alembic
- Schémas Pydantic séparés des modèles SQLAlchemy

## Ajouter un nouveau scraper
1. Créer `app/scrapers/mon_scraper.py` héritant de `BaseScraper`
2. Implémenter `_fetch()` retournant `list[RawJob]`
3. Ajouter l'entrée dans `SCRAPER_REGISTRY` dans `app/scrapers/__init__.py`
