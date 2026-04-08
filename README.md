# Postulator — Job Intelligence Platform

> Agrégateur de recherche d'emploi open source avec IA 100% locale via Ollama.  
> Aucune donnée personnelle n'est envoyée sur internet.

**Version 1.3.0** · [GitHub](https://github.com/nouhailler/postulator)

---

## Fonctionnalités

| Page | Description |
|------|-------------|
| **Overview** | Tableau de bord : KPIs temps réel, graphique d'ingestion 7 jours, top matches IA |
| **CV** | Gestion de vos CVs par sections, import PDF via Ollama |
| **Offres** | Liste filtrée des offres scrapées (lieu, source, score, statut, remote…) |
| **Offres Intelligence** | Chat IA avec Ollama sur n'importe quelle offre — fetch URL automatique si pas de description |
| **Scrapers** | Collecte automatique depuis 8 sources (4 internationales + 4 suisses), proxies résidentiels, résumé IA |
| **CV Intelligence** | Scoring CV ↔ offre avec Ollama, extraction de compétences, score en masse |
| **CV Matching** | Génération d'un CV adapté à une offre, diff visuel, export .txt/.md/.docx, mode ATS |
| **Pipeline** | Kanban de suivi des candidatures (drag & drop) |
| **Historique** | Résultats d'analyses sauvegardés, filtres date/score |
| **Paramètres** | Configuration SMTP, modèle Ollama, Adzuna API |

---

## Stack technique

**Backend** : FastAPI · SQLAlchemy async · SQLite · Celery + Redis · Ollama  
**Frontend** : React 18 · Vite · CSS Modules  
**IA** : Ollama (100% local — aucune donnée envoyée sur internet)

---

## Sources de scraping

### Internationales
| Source | Type | Couverture |
|--------|------|------------|
| Indeed | jobspy | Mondial — meilleure couverture |
| LinkedIn | jobspy | Mondial |
| Glassdoor | jobspy | US/EU |
| ZipRecruiter | jobspy | US |
| Adzuna | API officielle | GB, US, DE, FR, AU, CA, NL, AT, BE, IT, PL, SG |

### Suisses
| Source | Type | Notes |
|--------|------|-------|
| Jobup.ch | HTML BeautifulSoup | JobCloud (Ringier/TX Group) |
| Jobs.ch | API JSON interne | Axel Springer |
| JobTeaser | RemoteOK | Offres 100% remote |

> **Note** : Adzuna ne supporte pas la Suisse. Pour CH, utilisez Indeed + Jobup.ch + Jobs.ch.

---

## Prérequis

- Python 3.11+
- Node.js 18+
- Redis
- [Ollama](https://ollama.com/) avec au moins un modèle installé

```bash
# Modèles recommandés (16GB VRAM)
ollama pull phi4-mini        # ~120 t/s — scroring rapide
ollama pull qwen2.5:14b      # ~45 t/s  — analyse qualitative
ollama pull deepseek-r1:32b  # ~20 t/s  — raisonnement avancé
```

---

## Installation

```bash
git clone https://github.com/nouhailler/postulator
cd postulator

# Backend
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # puis éditez les variables

# Frontend
cd ../frontend
npm install
```

---

## Configuration (`backend/.env`)

```env
# Ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=phi4-mini

# Base de données
DATABASE_URL=sqlite+aiosqlite:///./postulator.db

# Redis / Celery
REDIS_URL=redis://localhost:6379/0

# Alertes email (optionnel)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=votre@email.com
SMTP_PASSWORD=mot_de_passe_application
ALERT_EMAIL_TO=alertes@email.com
ALERT_SCORE_THRESHOLD=80

# Adzuna API (optionnel — inscription gratuite sur developer.adzuna.com)
ADZUNA_APP_ID=
ADZUNA_APP_KEY=
```

> Pour Gmail : créez un **mot de passe d'application** dans votre compte Google (Sécurité → Validation en deux étapes → Mots de passe d'application).

---

## Lancement

```bash
# Terminal 1 — Redis
sudo systemctl start redis-server

# Terminal 2 — Backend FastAPI
cd backend && source .venv/bin/activate
uvicorn app.main:app --reload --port 8000

# Terminal 3 — Worker Celery (requis pour le scraping)
cd backend && source .venv/bin/activate
celery -A app.workers.celery_app.celery_app worker --loglevel=info

# Terminal 4 — Frontend
cd frontend && npm run dev
# → http://localhost:5173
```

---

## Flux de travail recommandé

```
1. Scrapers          → Lancer une recherche par mots-clés et sources
2. Offres            → Parcourir, filtrer par lieu/score, mettre à jour les statuts
3. Offres Intel.     → Interroger Ollama sur les offres intéressantes
4. CV                → Créer ou importer votre CV (import PDF via Ollama)
5. CV Intelligence   → Scorer les offres retenues contre votre CV
6. CV Matching       → Générer un CV adapté + analyse ATS
7. Pipeline          → Suivre vos candidatures en cours
8. Historique        → Retrouver et comparer vos analyses
```

---

## Offres Intelligence — fonctionnement

La page `/jobs-intelligence` permet d'interroger Ollama en langage naturel sur n'importe quelle offre scrapée.

**Stratégie de récupération du contenu :**
1. **Description en BDD** — utilisée en priorité si disponible (nettoyage HTML automatique)
2. **Fetch de la page web** — si pas de description, le backend récupère automatiquement le contenu de l'URL de l'offre (httpx + BeautifulSoup)
3. **Titre seul** — en dernier recours, Ollama est explicitement informé de la limitation

Chaque réponse indique la source utilisée (🔗 contenu récupéré depuis le site · ⚠️ pas de description).

**20 questions suggérées** couvrent : compétences techniques, responsabilités, culture d'entreprise, préparation entretien, mots-clés pour la candidature, salaire, remote…

---

## Architecture

```
postulator/
├── backend/
│   ├── app/
│   │   ├── api/routes/       # FastAPI routes (10 modules)
│   │   │   └── jobs_intelligence.py  # Chat IA + fetch URL
│   │   ├── models/           # SQLAlchemy models
│   │   ├── scrapers/         # 8 scrapers sources
│   │   ├── services/         # Business logic (CV, email, Ollama)
│   │   └── workers/          # Celery tasks
│   ├── scripts/              # Migrations SQLite
│   └── .env                  # Configuration locale
└── frontend/
    └── src/
        ├── pages/            # 10 pages React
        ├── components/       # Composants réutilisables
        ├── api/              # Clients API + AbortController
        └── data/             # Dictionnaire ESCO offline, helpContent
```

---

## Changelog

### v1.3.0 (avril 2026)
- **Nouvelle page : Offres Intelligence** — chat IA sur les offres, fetch URL automatique, 20 questions suggérées, minuterie, bouton Annuler (AbortController)
- **Filtre Lieu** dans la page Offres (ILIKE côté backend)
- **Filtres date et score** dans la page Historique
- **Page Paramètres** — configuration SMTP, Ollama, Adzuna (accessible depuis le menu latéral)
- **Logo Postulator** — remplacement du label "Command Center · The Sovereign Architect"
- **Suppression** des entrées Support et Sign Out du menu
- **Panneau détail offre amélioré** — ScorePanel structuré (strengths/gaps/reco) + SummaryPanel bullets
- **Tooltip score en masse** — affichage lisible (plus de JSON brut)

### v1.2.0
- Score en masse (Celery) avec polling et résultats dans AlertsDrawer
- Résumé IA bullet points (toggle ScrapersPage)
- Scrapers suisses : Jobup.ch (HTML BeautifulSoup), Jobs.ch (API JSON), RemoteOK
- Adzuna API officielle (10 000 req/mois gratuit)

### v1.1.0
- CV ATS avec score, mots-clés manquants, suggestions
- Diff visuel CV généré vs source (mots nouveaux en rouge)
- Alertes email SMTP automatiques (seuil configurable)
- Proxies résidentiels avec rotation round-robin
- CompanyLink (site web entreprise ou Google Search)

### v1.0.0
- Scraping Indeed / LinkedIn / Glassdoor / ZipRecruiter (24 pays)
- CV Intelligence : extraction compétences + scoring Ollama
- CV Matching : génération CV adapté + export
- Pipeline Kanban
- Historique des analyses

---

## Licence

MIT — Open Source
