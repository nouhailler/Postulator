# Postulator — Job Intelligence Platform

> Agrégateur de recherche d'emploi open source avec IA locale (Ollama) ou cloud gratuite (OpenRouter).  
> Vos données restent sur votre machine — aucune information personnelle n'est envoyée sans votre accord.

**Version 1.5.4** · [GitHub](https://github.com/nouhailler/Postulator) · [Releases](https://github.com/nouhailler/Postulator/releases)

---

## Fonctionnalités

| Page | Description |
|------|-------------|
| **Overview** | Tableau de bord : KPIs temps réel, graphique d'ingestion 7 jours, top matches IA |
| **CV** | Gestion de vos CVs par sections, import PDF avec extraction intelligente |
| **Offres** | Liste filtrée des offres scrapées (lieu, source, score, statut, remote…) |
| **Offres Intelligence** | Chat IA sur n'importe quelle offre — fetch URL automatique, 20 questions suggérées, historique Q&A |
| **Analyse de l'offre** ✨ | Analyse sémantique offre ↔ contenu de poste, correspondances surlignées en rouge, conversation multi-tour |
| **Scrapers** | Collecte depuis 8 sources (4 internationales + 4 suisses), proxies résidentiels, résumé IA |
| **Automatisation** ⚡ | Recherche quotidienne planifiée (Indeed + LinkedIn) + scoring automatique avec votre CV |
| **CV Intelligence** | Scoring CV ↔ offre, extraction de compétences, score en masse |
| **CV Matching** | Génération d'un CV adapté à une offre, diff visuel, export .txt/.md/.docx, mode ATS local ou Cloud |
| **Pipeline** | Kanban de suivi des candidatures (drag & drop) |
| **Historique** | Résultats d'analyses sauvegardés, filtres date/score |
| **Paramètres** | Configuration SMTP, Ollama, OpenRouter, Adzuna API, Cloud AI (Claude / OpenAI / Mistral), thèmes |

---

## Stack technique

**Backend** : FastAPI · SQLAlchemy async · SQLite · Celery + Redis · APScheduler  
**Frontend** : React 18 · Vite · CSS Modules  
**IA locale** : Ollama (100% local — aucune donnée envoyée sur internet)  
**IA cloud gratuite** : OpenRouter (modèles :free — DeepSeek R1, Llama 4, Gemma 3, Qwen3…)  
**IA cloud payante (optionnel)** : Anthropic Claude · OpenAI GPT · Mistral AI (pour CV ATS uniquement)

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
- [Ollama](https://ollama.com/) avec au moins un modèle installé (ou une clé OpenRouter gratuite)

```bash
# Modèles Ollama recommandés (16GB VRAM)
ollama pull phi4-mini        # ~120 t/s — scoring rapide
ollama pull qwen2.5:14b      # ~45 t/s  — analyse qualitative
ollama pull deepseek-r1:32b  # ~20 t/s  — raisonnement avancé
```

> **Sans GPU ?** Utilisez [OpenRouter](https://openrouter.ai/keys) — clé gratuite, accès à DeepSeek R1, Llama 4, Gemma 3 et bien d'autres.

---

## Installation

### Via paquet .deb (Ubuntu/Debian — recommandé)

```bash
# Télécharger la dernière release
wget https://github.com/nouhailler/Postulator/releases/latest/download/postulator_1.5.4_amd64.deb
sudo dpkg -i postulator_1.5.4_amd64.deb
sudo apt-get install -f   # résoudre les dépendances si nécessaire
```

### Via les sources

```bash
git clone https://github.com/nouhailler/Postulator
cd Postulator

# Backend
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env             # puis éditez les variables

# Frontend
cd ../frontend
npm install
```

---

## Configuration (`backend/.env`)

```env
# Ollama (IA locale — optionnel si OpenRouter configuré)
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

# Cloud AI — CV ATS CLOUD uniquement (optionnel)
# Priorité : Anthropic > OpenAI > Mistral
ANTHROPIC_API_KEY=   # https://console.anthropic.com/settings/keys
OPENAI_API_KEY=      # https://platform.openai.com/api-keys
MISTRAL_API_KEY=     # https://console.mistral.ai/home  (modèle français 🇫🇷)
```

> **OpenRouter** (scoring, analyse, chat) se configure directement dans l'interface Paramètres — pas besoin de `.env`.

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

## OpenRouter — IA gratuite en cloud

OpenRouter donne accès à des dizaines de modèles IA gratuits (suffix `:free`) sans GPU local.

**Configuration** : Paramètres → section OpenRouter → entrez votre clé API → Sauvegarder

**Clé gratuite** : [openrouter.ai/keys](https://openrouter.ai/keys)

**Modèles gratuits disponibles** (liste mise à jour dynamiquement depuis l'API) :
- `deepseek/deepseek-r1:free` — raisonnement avancé (recommandé)
- `meta-llama/llama-4-maverick:free` — généraliste, contexte 1M tokens
- `google/gemma-3-27b-it:free` — équilibré
- `qwen/qwen3-235b-a22b:free` — très grand modèle

**Comportement** : si OpenRouter est configuré, il remplace Ollama sur toutes les fonctions IA (scoring, analyse, chat, génération CV). En cas de rate limit ou d'erreur, Postulator essaie automatiquement le modèle gratuit suivant — de façon transparente.

---

## Flux de travail recommandé

### Manuel
```
1. Scrapers          → Lancer une recherche par mots-clés et sources
2. Offres            → Parcourir, filtrer par lieu/score, mettre à jour les statuts
3. Analyse de l'offre → Évaluer sémantiquement si une offre correspond à votre profil
4. Offres Intel.     → Interroger l'IA sur les offres intéressantes (compétences, culture…)
5. CV                → Créer ou importer votre CV
6. CV Intelligence   → Scorer les offres retenues contre votre CV
7. CV Matching       → Générer un CV adapté + analyse ATS
8. Pipeline          → Suivre vos candidatures en cours
9. Historique        → Retrouver et comparer vos analyses
```

### Automatisé ⚡
```
1. Automatisation → Configurer mots-clés + CV + heure de lancement
2. Activer        → Postulator scrape + score automatiquement chaque jour
3. Offres         → Retrouver les nouvelles offres scrapées et scorées
```

---

## Analyse de l'offre — fonctionnement

La page `/job-analysis` permet une **analyse sémantique approfondie** d'une offre par rapport à un contenu de poste décrit librement.

**Comment ça fonctionne :**
1. Sélectionnez une offre scrapée dans la liste
2. Décrivez librement le poste recherché ("un poste de direction avec management d'équipe", "développeur Python senior cloud"…)
3. Cliquez sur **Analyser cette offre**

**Ce que l'IA produit :**
- Les correspondances entre l'offre et votre description sont **surlignées en rouge**
- L'analyse est sémantique : "pilotage d'une équipe de managers" → détecté comme correspondance pour "poste de direction"
- 5 sections structurées : correspondances, écarts, signaux positifs, points de vigilance, recommandation
- Posez des **questions de suivi** pour approfondir — l'historique de conversation est conservé
- Cliquez sur une carte pour l'**ouvrir en plein écran** et lire confortablement

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

**Persistence** : la configuration est sauvegardée dans `automation_config.json`. À chaque redémarrage d'uvicorn, Postulator relit ce fichier et replanifie automatiquement le job APScheduler.

---

## CV ATS Cloud — fonctionnement

Le bouton **CV ATS CLOUD** dans la page CV Matching génère un CV optimisé ATS via un LLM Cloud — utile sur les PC sans GPU.

| Provider | Modèle | Priorité | Clé |
|----------|--------|----------|-----|
| Anthropic Claude | claude-haiku-4-5 | 1 | `ANTHROPIC_API_KEY` |
| OpenAI GPT | gpt-4o-mini | 2 | `OPENAI_API_KEY` |
| Mistral AI 🇫🇷 | mistral-small-latest | 3 | `MISTRAL_API_KEY` |

> Pour toutes les autres fonctions IA, préférez **OpenRouter** (gratuit, configurable dans l'UI).

---

## Offres Intelligence — fonctionnement

**Stratégie de récupération du contenu :**
1. **Description en BDD** — utilisée en priorité si disponible (nettoyage HTML automatique)
2. **Fetch de la page web** — si pas de description, le backend récupère automatiquement le contenu de l'URL
3. **Titre seul** — en dernier recours, l'IA est explicitement informée de la limitation

Les questions/réponses sont **sauvegardées en BDD** et accessibles via le panneau historique sous la fiche offre.

---

## Architecture

```
postulator/
├── backend/
│   ├── app/
│   │   ├── api/routes/       # FastAPI routes (13 modules)
│   │   │   ├── job_analysis.py   # Analyse sémantique offre ↔ poste (v1.5.4)
│   │   │   ├── settings.py       # Config OpenRouter API (v1.5.4)
│   │   │   └── …
│   │   ├── models/
│   │   │   ├── openrouter_config.py  # Config OpenRouter (id=1) (v1.5.4)
│   │   │   └── …
│   │   ├── scrapers/         # 8 scrapers sources
│   │   ├── services/
│   │   │   ├── openrouter_service.py  # chat_with_fallback() (v1.5.4)
│   │   │   └── …
│   │   └── workers/          # Celery tasks
│   ├── scripts/              # Migrations SQLite
│   │   ├── migrate_add_openrouter_config.py  # v1.5.4
│   │   └── …
│   └── .env                  # Configuration locale (jamais commité)
└── frontend/
    └── src/
        ├── pages/            # 12 pages React
        │   ├── JobAnalysisPage.jsx   # Analyse de l'offre (v1.5.4)
        │   └── …
        ├── components/       # Composants réutilisables
        ├── api/              # Clients API
        └── data/             # Dictionnaire ESCO offline, helpContent
```

---

## Migrations base de données

À exécuter une fois lors d'une mise à jour depuis une version précédente :

```bash
cd backend && source .venv/bin/activate

python scripts/migrate_add_company_url.py       # v1.1.x
python scripts/migrate_add_source_cv_text.py    # v1.2.x
python scripts/migrate_add_ats_fields.py        # v1.3.x
python scripts/migrate_add_proxies_tried.py     # v1.4.x
python scripts/migrate_add_job_questions.py     # v1.4.0
python scripts/migrate_add_openrouter_config.py # v1.5.4
```

> Sur une installation fraîche, ces tables sont créées automatiquement au démarrage.

---

## Changelog

### v1.5.4 (avril 2026)
- **OpenRouter** — intégration complète : scoring, analyse, chat, génération CV utilisent OpenRouter si configuré, sinon Ollama. Fallback automatique sur les modèles gratuits suivants en cas de rate limit ou erreur
- **Page "Analyse de l'offre"** — analyse sémantique offre ↔ contenu de poste, correspondances surlignées en rouge, conversation multi-tour, modale plein écran pour lire les réponses
- **Paramètres OpenRouter** — liste des modèles gratuits chargée dynamiquement depuis l'API OpenRouter, select natif, test de connexion (ping)
- **Offres Intelligence** — badge dynamique OpenRouter / Ollama selon la configuration active
- **Migration** : table `openrouter_config` (script `migrate_add_openrouter_config.py`)

### v1.5.3 (avril 2026)
- **Import PDF** — extraction par blocs PyMuPDF, suppression des bullets, jonction des lignes fragmentées, écran de validation avant import avec aperçu
- **Thèmes** — sombre (défaut) / clair / couleur personnalisée dans Paramètres
- **Scrapers** — 7 jours par défaut, mode date précise, toggle "Exclure les stages"
- **Offres** — suppression en masse par critères (score, date, source) avec simulation

### v1.5.2 (avril 2026)
- Opérateurs booléens étendus (AND/OR/NOT/parenthèses/guillemets) sur 8 sources
- Filtre post-scraping avancé
- Sécurité proxies renforcée

### v1.5.1 (avril 2026)
- **Nouvelle page : Automatisation** — recherche quotidienne planifiée, scoring automatique, proxies sauvegardés, rapport de résultats, annulation mid-run
- **APScheduler** — planification cron, reprise automatique au redémarrage
- **CV ATS CLOUD** — support Mistral AI (3ème provider)

### v1.5.0 (avril 2026)
- **CV ATS LOCAL / CLOUD** — Anthropic Claude (`claude-haiku-4-5`) et OpenAI (`gpt-4o-mini`)
- **Page Paramètres** — section Cloud AI avec statut du provider actif

### v1.4.0 (avril 2026)
- **Indicateur Ollama global** — bannière teal sticky visible depuis toutes les pages
- **Sauvegarde Q&A** — historique Offres Intelligence persisté en BDD

### v1.3.0 (avril 2026)
- **Nouvelle page : Offres Intelligence** — chat IA, fetch URL automatique, 20 questions suggérées, minuterie, AbortController
- **Filtre Lieu** dans la page Offres
- **Filtres date et score** dans la page Historique

### v1.2.0
- Score en masse (Celery), résumé IA, scrapers suisses, Adzuna API

### v1.1.0
- CV ATS avec score et diff visuel, alertes email SMTP, proxies résidentiels

### v1.0.0
- Scraping Indeed / LinkedIn / Glassdoor / ZipRecruiter
- CV Intelligence + scoring Ollama
- CV Matching + export
- Pipeline Kanban · Historique

---

## Licence

MIT — Open Source
