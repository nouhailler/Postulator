# Postulator — Job Intelligence Platform

> Agrégateur de recherche d'emploi open source avec IA 100% locale via Ollama.  
> Aucune donnée personnelle n'est envoyée sur internet.

**Version 1.5.1** · [GitHub](https://github.com/nouhailler/postulator)

---

## Fonctionnalités

| Page | Description |
|------|-------------|
| **Overview** | Tableau de bord : KPIs temps réel, graphique d'ingestion 7 jours, top matches IA |
| **CV** | Gestion de vos CVs par sections, import PDF via Ollama |
| **Offres** | Liste filtrée des offres scrapées (lieu, source, score, statut, remote…) |
| **Offres Intelligence** | Chat IA avec Ollama sur n'importe quelle offre — fetch URL automatique si pas de description |
| **Scrapers** | Collecte automatique depuis 8 sources (4 internationales + 4 suisses), proxies résidentiels, résumé IA |
| **Automatisation** ⚡ | Recherche quotidienne planifiée (Indeed + LinkedIn) + scoring automatique avec votre CV |
| **CV Intelligence** | Scoring CV ↔ offre avec Ollama, extraction de compétences, score en masse |
| **CV Matching** | Génération d'un CV adapté à une offre, diff visuel, export .txt/.md/.docx, mode ATS local ou Cloud |
| **Pipeline** | Kanban de suivi des candidatures (drag & drop) |
| **Historique** | Résultats d'analyses sauvegardés, filtres date/score |
| **Paramètres** | Configuration SMTP, modèle Ollama, Adzuna API, Cloud AI (Claude / OpenAI / Mistral) |

---

## Stack technique

**Backend** : FastAPI · SQLAlchemy async · SQLite · Celery + Redis · Ollama · APScheduler  
**Frontend** : React 18 · Vite · CSS Modules  
**IA locale** : Ollama (100% local — aucune donnée envoyée sur internet)  
**IA cloud (optionnel)** : Anthropic Claude · OpenAI GPT · Mistral AI (pour CV ATS sur PC sans GPU)

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
ollama pull phi4-mini        # ~120 t/s — scoring rapide
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
pip install apscheduler          # requis pour l'automatisation planifiée
cp .env.example .env             # puis éditez les variables

# Frontend
cd ../frontend
npm install
```

---

## Configuration (`backend/.env`)

```env
# Ollama (IA locale)
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

# Cloud AI — CV ATS CLOUD (optionnel — au moins une clé pour activer le bouton)
# Priorité : Anthropic > OpenAI > Mistral
ANTHROPIC_API_KEY=   # https://console.anthropic.com/settings/keys
OPENAI_API_KEY=      # https://platform.openai.com/api-keys
MISTRAL_API_KEY=     # https://console.mistral.ai/home  (modèle français 🇫🇷)
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

# Terminal 3 — Worker Celery (requis pour le scraping et l'automatisation)
cd backend && source .venv/bin/activate
celery -A app.workers.celery_app.celery_app worker --loglevel=info

# Terminal 4 — Frontend
cd frontend && npm run dev
# → http://localhost:5173
```

---

## Flux de travail recommandé

### Manuel
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

### Automatisé ⚡
```
1. Automatisation → Configurer mots-clés + CV + heure de lancement
2. Activer        → Postulator scrape + score automatiquement chaque jour
3. Offres         → Retrouver les nouvelles offres scrapées et scorées
```

---

## Automatisation — fonctionnement

La page `/automation` permet de configurer une **recherche quotidienne automatique** :

**Sources** : Indeed + LinkedIn (uniquement, pour maximiser la fiabilité)  
**Volume** : 10 offres par source · offres publiées dans les 24h  
**Scoring** : jusqu'à 20 nouvelles offres scorées automatiquement par run

**Opérateurs logiques supportés dans les mots-clés** :
- `AND` : les deux termes obligatoires — `Python AND senior`
- `OR` : l'un ou l'autre — `DevOps OR SRE`
- `( )` : groupement prioritaire — `(Python OR Java) AND senior`
- Ordre d'évaluation : parenthèses > AND > OR

**Persistence** : la configuration est sauvegardée dans `automation_config.json`. À chaque redémarrage d'uvicorn, Postulator relit ce fichier et replanifie automatiquement le job APScheduler. Aucune intervention manuelle nécessaire.

---

## CV ATS Cloud — fonctionnement

Le bouton **CV ATS CLOUD** dans la page CV Matching permet de générer un CV optimisé ATS via un LLM Cloud, utile sur les PC sans GPU où Ollama ne peut pas tourner correctement.

| Provider | Modèle | Langue | Clé |
|----------|--------|--------|-----|
| Anthropic Claude (priorité 1) | claude-haiku-4-5 | Multi | `ANTHROPIC_API_KEY` |
| OpenAI GPT (priorité 2) | gpt-4o-mini | Multi | `OPENAI_API_KEY` |
| Mistral AI (priorité 3) 🇫🇷 | mistral-small-latest | Multi | `MISTRAL_API_KEY` |

Le provider actif est détecté automatiquement selon les clés présentes dans `.env`. Le résultat est identique au mode local : score ATS, mots-clés manquants, suggestions, diff visuel.

---

## Offres Intelligence — fonctionnement

La page `/jobs-intelligence` permet d'interroger Ollama en langage naturel sur n'importe quelle offre scrapée.

**Stratégie de récupération du contenu :**
1. **Description en BDD** — utilisée en priorité si disponible (nettoyage HTML automatique)
2. **Fetch de la page web** — si pas de description, le backend récupère automatiquement le contenu de l'URL de l'offre (httpx + BeautifulSoup)
3. **Titre seul** — en dernier recours, Ollama est explicitement informé de la limitation

Chaque réponse indique la source utilisée (🔗 contenu récupéré depuis le site · ⚠️ pas de description).

**20 questions suggérées** couvrent : compétences techniques, responsabilités, culture d'entreprise, préparation entretien, mots-clés pour la candidature, salaire, remote…

Les questions/réponses sont **sauvegardées en BDD** et accessibles via le panneau historique sous la fiche offre.

---

## Architecture

```
postulator/
├── backend/
│   ├── app/
│   │   ├── api/routes/       # FastAPI routes (11 modules dont automation.py)
│   │   ├── models/           # SQLAlchemy models
│   │   ├── scrapers/         # 8 scrapers sources
│   │   ├── services/         # Business logic (CV, email, Ollama)
│   │   └── workers/          # Celery tasks
│   ├── scripts/              # Migrations SQLite
│   ├── automation_config.json  # Config automatisation (généré par l'UI)
│   └── .env                  # Configuration locale (jamais commité)
└── frontend/
    └── src/
        ├── pages/            # 11 pages React
        ├── components/       # Composants réutilisables (layout, drawers)
        ├── api/              # Clients API (dont automation.js)
        └── data/             # Dictionnaire ESCO offline, helpContent
```

---

## Changelog

### v1.5.1 (avril 2026)
- **Nouvelle page : Automatisation** — recherche quotidienne planifiée (Indeed + LinkedIn), scoring automatique avec le CV sélectionné, opérateurs AND/OR/parenthèses, proxies sauvegardés, rapport de résultats, annulation mid-run
- **APScheduler** — planification cron via `automation_config.json`, reprise automatique au redémarrage d'uvicorn
- **CV ATS CLOUD** — support Mistral AI (3ème provider, modèle français `mistral-small-latest`)

### v1.5.0 (avril 2026)
- **CV ATS LOCAL / CLOUD** — renommage du bouton CV ATS en CV ATS LOCAL, nouveau bouton CV ATS CLOUD
- **Cloud AI** — support Anthropic Claude (`claude-haiku-4-5`) et OpenAI (`gpt-4o-mini`) pour générer des CVs ATS sans GPU
- **Page Paramètres** — nouvelle section Cloud AI avec statut du provider actif
- Correction robustesse parsing JSON des providers Cloud (backticks Markdown, body vide)

### v1.4.0 (avril 2026)
- **Indicateur Ollama global** — bannière teal sticky, visible depuis toutes les pages pendant un traitement IA
- **Sauvegarde Q&A** — historique des questions/réponses Offres Intelligence persisté en BDD
- **Panneau historique Q&A** — accordion sous la fiche offre, rejouer une question en un clic

### v1.3.0 (avril 2026)
- **Nouvelle page : Offres Intelligence** — chat IA sur les offres, fetch URL automatique, 20 questions suggérées, minuterie, bouton Annuler (AbortController)
- **Filtre Lieu** dans la page Offres (ILIKE côté backend)
- **Filtres date et score** dans la page Historique
- **Page Paramètres** — configuration SMTP, Ollama, Adzuna

### v1.2.0
- Score en masse (Celery) avec polling et résultats dans AlertsDrawer
- Résumé IA bullet points (toggle ScrapersPage)
- Scrapers suisses : Jobup.ch, Jobs.ch, RemoteOK
- Adzuna API officielle

### v1.1.0
- CV ATS avec score, mots-clés manquants, suggestions
- Diff visuel CV généré vs source
- Alertes email SMTP automatiques
- Proxies résidentiels avec rotation

### v1.0.0
- Scraping Indeed / LinkedIn / Glassdoor / ZipRecruiter
- CV Intelligence : extraction compétences + scoring Ollama
- CV Matching : génération CV adapté + export
- Pipeline Kanban · Historique des analyses

---

## Licence

MIT — Open Source
