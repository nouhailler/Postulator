# Postulator

> Agrégateur de recherche d'emploi open source, self-hosted, IA locale.

![Stack](https://img.shields.io/badge/stack-React%20%2B%20FastAPI%20%2B%20Ollama-7bd0ff?style=flat-square)
![Licence](https://img.shields.io/badge/licence-MIT-3cddc7?style=flat-square)
![Python](https://img.shields.io/badge/python-3.13-blue?style=flat-square)

**Postulator** collecte automatiquement des offres d'emploi depuis plusieurs sources (Indeed, LinkedIn, Glassdoor…), analyse leur correspondance avec votre CV via Ollama (IA 100% locale), et génère des CVs adaptés à chaque offre — sans envoyer une seule donnée dans le cloud.

---

## Fonctionnalités

| Module | Description |
|--------|-------------|
| **Scrapers** | Collecte multi-sources avec déduplication SHA-256, rotation de proxies résidentiels, Celery async |
| **Offres** | Tableau filtrable avec tri par colonne, export CSV, drawer détail avec description complète |
| **CV** | Gestion de plusieurs CVs nommés/datés, import PDF parsé automatiquement par Ollama |
| **CV Intelligence** | Extraction de compétences + scoring CV ↔ offre (0-100) avec points forts/gaps |
| **CV Matching** | Génération d'un CV adapté à une offre spécifique via Ollama, export .txt / .md / .docx |
| **Pipeline** | Kanban 5 colonnes (À voir → Rejeté), drag & drop |
| **Historique** | Archive des analyses CV ↔ offre avec stats et détail expandable |
| **Aide** | Panneau contextuel `?` sur chaque page, raccourci clavier `?` |

---

## Stack technique

```
Frontend  : React 18 + Vite + CSS Modules
Backend   : FastAPI + SQLAlchemy async + SQLite
IA        : Ollama (local) — phi3.5:3.8b ou qwen2.5:14b recommandé
Scraping  : python-jobspy (Indeed, LinkedIn, Glassdoor, ZipRecruiter, Google Jobs)
Async     : Celery + Redis
```

---

## Prérequis

- Python 3.13+
- Node.js 18+
- Redis
- [Ollama](https://ollama.ai) avec au moins un modèle installé (`ollama pull phi3.5:3.8b`)
- pandoc (optionnel, pour l'export .docx) : `sudo apt install pandoc`

---

## Installation

### Backend

```bash
cd backend

# Créer le venv et installer les dépendances
python3 -m venv .venv
source .venv/bin/activate

# Installer greenlet en premier (requis pour Python 3.13)
pip install "greenlet>=3.1.0"
pip install -r requirements.txt

# Configurer l'environnement
cp .env.example .env
# Éditer .env — choisir le modèle Ollama, configurer Redis
```

### Frontend

```bash
cd frontend
npm install
```

---

## Démarrage (5 terminaux)

```bash
# Terminal 1 — Redis
sudo systemctl start redis-server
redis-cli ping   # → PONG

# Terminal 2 — Préchauffer Ollama (évite le timeout à la 1ère requête)
curl -s http://localhost:11434/api/generate \
  -d '{"model":"phi3.5:3.8b","keep_alive":600,"prompt":""}' \
  -o /dev/null && echo "✓ Modèle en VRAM"

# Terminal 3 — API FastAPI
cd backend && source .venv/bin/activate
uvicorn app.main:app --reload --port 8000
# → http://localhost:8000/docs

# Terminal 4 — Worker Celery
source .venv/bin/activate
celery -A app.workers.celery_app.celery_app worker --loglevel=info

# Terminal 5 — Frontend
cd frontend && npm run dev
# → http://localhost:5173
```

---

## Configuration `.env`

```ini
DATABASE_URL=sqlite+aiosqlite:///./postulator.db
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=phi3.5:3.8b          # ou qwen2.5:14b pour meilleure qualité
REDIS_URL=redis://localhost:6379/0
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
DEBUG=true
```

---

## Scraping avec proxies résidentiels

Dans la page **Scrapers**, cliquez sur "Lancer le scraping avec Proxy" pour saisir vos proxies résidentiels. Format : `IP:PORT:USERNAME:PASSWORD` (une ligne par proxy). La rotation est automatique — chaque source utilise un proxy différent.

---

## Flux recommandé

```
1. Scrapers      → collecter des offres (Indeed + LinkedIn)
2. Offres        → parcourir, filtrer, changer le statut pipeline
3. CV            → créer ou importer votre CV (PDF → parsing Ollama)
4. CV Intelligence → scorer les offres les plus prometteuses
5. CV Matching   → générer un CV adapté pour les meilleures offres
6. Historique    → retrouver toutes vos analyses
```

---

## Licence

MIT — Patrick Nouhailler — 2025-2026
