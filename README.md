<div align="center">

# 💼 Postulator

### Agrégateur de recherche d'emploi — Open Source · Self-Hosted · IA 100% locale

[![Version](https://img.shields.io/badge/version-1.1.0-7bd0ff?style=for-the-badge&logo=github)](https://github.com/nouhailler/postulator/releases)
[![Python](https://img.shields.io/badge/Python-3.13+-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=for-the-badge&logo=fastapi)](https://fastapi.tiangolo.com)
[![Licence](https://img.shields.io/badge/Licence-MIT-3cddc7?style=for-the-badge)](LICENSE)

---

**Postulator** collecte automatiquement des offres d'emploi depuis Indeed, LinkedIn, Glassdoor et plus,
analyse leur correspondance avec votre CV via **Ollama** (IA 100% locale),
et génère des CVs adaptés à chaque offre — **sans envoyer une seule donnée dans le cloud.**

[⚡ Installation rapide](#-installation-rapide) · [📦 Télécharger le .deb](https://github.com/nouhailler/postulator/releases/latest) · [📖 Documentation](#-démarrage-5-terminaux)

</div>

---

## ✨ Fonctionnalités

<table>
<tr>
<td width="50%">

### 🔍 Collecte intelligente
- **5 sources simultanées** : Indeed, LinkedIn, Glassdoor, ZipRecruiter, Google Jobs
- **Scraping international** : 24 pays avec sélecteur ville/pays
- Déduplication automatique (SHA-256)
- Rotation de proxies résidentiels
- Scraping asynchrone via Celery + Redis

</td>
<td width="50%">

### 🤖 IA 100% locale
- Scoring CV ↔ offre (0-100) via **Ollama**
- Extraction automatique des compétences
- Génération de CVs adaptés à chaque offre
- **Diff visuel** des mots ajoutés par l'IA (surlignage rouge)
- Compatible `phi3.5:3.8b`, `qwen2.5:14b` et tous modèles Ollama

</td>
</tr>
<tr>
<td width="50%">

### 📋 Gestion des candidatures
- Pipeline Kanban 5 colonnes (À voir → Rejeté)
- **Lien web entreprise** direct (ou recherche Google auto)
- Export CSV enrichi (numéro, date scraping, URL entreprise)
- **Purge intelligente** des offres (conserve les offres sélectionnées)
- Historique complet de toutes les analyses
- Alertes email auto + bouton d'envoi manuel par analyse

</td>
<td width="50%">

### 🛡️ Privacy-first
- **Zéro donnée envoyée dans le cloud**
- Tout tourne en local sur votre machine
- Base de données SQLite locale
- Open source, auditable, auto-hébergeable

</td>
</tr>
</table>

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      POSTULATOR                          │
│                                                         │
│  ┌──────────┐    ┌──────────────┐    ┌───────────────┐  │
│  │ React 18 │◄──►│  FastAPI     │◄──►│  Ollama (IA)  │  │
│  │  + Vite  │    │  + SQLAlch.  │    │  Local LLM    │  │
│  └──────────┘    └──────┬───────┘    └───────────────┘  │
│                         │                               │
│                  ┌──────▼───────┐    ┌───────────────┐  │
│                  │   SQLite     │    │  Celery+Redis  │  │
│                  │   (local)    │    │  (async jobs)  │  │
│                  └──────────────┘    └───────────────┘  │
└─────────────────────────────────────────────────────────┘
```

| Couche | Technologies |
|--------|-------------|
| **Frontend** | React 18 · Vite · CSS Modules · Recharts · Lucide Icons |
| **Backend** | FastAPI · SQLAlchemy async · Alembic · Pydantic v2 |
| **IA** | Ollama (local) — phi3.5:3.8b ou qwen2.5:14b |
| **Scraping** | python-jobspy · BeautifulSoup4 · Proxies résidentiels |
| **Async** | Celery 5 · Redis |
| **Stockage** | SQLite (dev) · PostgreSQL-ready (prod) |

---

## 📦 Installation rapide

### Option A — Package Debian (recommandé)

```bash
# Télécharger la dernière release
wget https://github.com/nouhailler/postulator/releases/latest/download/postulator_1.0.0_all.deb

# Installer
sudo dpkg -i postulator_1.0.0_all.deb
sudo apt-get install -f   # résoudre les dépendances si besoin

# Lancer
postulator
```

> Le script `postinst` installe automatiquement les dépendances Python et Node.js.

---

### Option B — Installation manuelle

#### Prérequis

| Outil | Version | Installation |
|-------|---------|-------------|
| Python | 3.13+ | `sudo apt install python3.13 python3.13-venv` |
| Node.js | 18+ | `sudo apt install nodejs npm` |
| Redis | — | `sudo apt install redis-server` |
| Ollama | latest | [ollama.ai](https://ollama.ai) |
| pandoc | — | `sudo apt install pandoc` *(optionnel, pour export .docx)* |

#### Backend

```bash
cd backend

# Environnement virtuel
python3 -m venv .venv
source .venv/bin/activate

# greenlet doit être installé en premier (Python 3.13)
pip install "greenlet>=3.1.0"
pip install -r requirements.txt

# Configuration
cp .env.example .env
# Éditer .env : choisir le modèle Ollama, configurer Redis
```

#### Frontend

```bash
cd frontend
npm install
```

---

## 🚀 Démarrage (5 terminaux)

```bash
# Terminal 1 — Redis
sudo systemctl start redis-server
redis-cli ping                    # → PONG

# Terminal 2 — Préchauffer Ollama (évite le timeout à la 1ère requête)
ollama pull phi3.5:3.8b           # si pas encore téléchargé
curl -s http://localhost:11434/api/generate \
  -d '{"model":"phi3.5:3.8b","keep_alive":600,"prompt":""}' \
  -o /dev/null && echo "✓ Modèle en VRAM"

# Terminal 3 — API FastAPI
cd backend && source .venv/bin/activate
uvicorn app.main:app --reload --port 8000
# → http://localhost:8000/docs

# Terminal 4 — Worker Celery
cd backend && source .venv/bin/activate
celery -A app.workers.celery_app.celery_app worker --loglevel=info

# Terminal 5 — Frontend
cd frontend && npm run dev
# → http://localhost:5173
```

---

## ⚙️ Configuration `.env`

```ini
# Modèle Ollama (phi3.5:3.8b = rapide, qwen2.5:14b = meilleure qualité)
OLLAMA_MODEL=phi3.5:3.8b
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_TIMEOUT=300

DATABASE_URL=sqlite+aiosqlite:///./postulator.db
REDIS_URL=redis://localhost:6379/0
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
DEBUG=true

# Email alerts (optionnel)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=votre@email.com
SMTP_PASSWORD=votre_mot_de_passe
ALERT_EMAIL_TO=votre@email.com
ALERT_SCORE_THRESHOLD=80

# Proxies résidentiels statiques (optionnel)
PROXY_LIST=
```

---

## 🔄 Flux de travail recommandé

```
1. 🔍 Scrapers       → Choisir pays + ville, lancer le scraping (Indeed + LinkedIn…)
        ↓
2. 💼 Offres         → Parcourir (tri date scraping), consulter le lien entreprise,
                        changer le statut pipeline, purger les offres obsolètes
        ↓
3. 📄 CV             → Créer ou importer votre CV (PDF → parsing Ollama)
        ↓
4. 🧠 CV Intelligence → Importer votre CV, scorer les offres prometteuses (0-100)
        ↓
5. ✨ CV Matching    → Générer un CV adapté, activer le diff visuel, exporter en .docx
        ↓
6. 📊 Historique     → Retrouver toutes vos analyses, envoyer des alertes email
```

---

## 🌍 Scraping international

La page **Scrapers** propose un sélecteur de **24 pays** (avec drapeaux) et un champ ville avec suggestions automatiques :

| Pays favoris | Autres pays disponibles |
|---|---|
| 🇫🇷 France · 🇨🇭 Suisse | 🇩🇪 🇧🇪 🇪🇸 🇳🇱 🇮🇹 🇵🇹 🇸🇪 🇩🇰 🇳🇴 🇫🇮 🇦🇹 🇵🇱 🇨🇿 🇮🇪 🇬🇧 🇱🇺 🇺🇸 🇨🇦 🇦🇺 🇸🇬 🇯🇵 🇦🇪 |

Le backend envoie automatiquement le bon paramètre `country_indeed` à jobspy selon le pays sélectionné (ex: `ch.indeed.com` pour la Suisse, `fr.indeed.com` pour la France).

---

## 🛡️ Scraping avec proxies résidentiels

Dans la page **Scrapers**, cliquez sur **"Lancer le scraping avec Proxy"** pour utiliser des proxies résidentiels.

Format des proxies : `IP:PORT:USERNAME:PASSWORD` (une ligne par proxy)

```
31.59.20.176:6754:username:password
45.12.34.56:8080:user2:pass2
```

La rotation est automatique en **round-robin** — chaque source utilise un proxy différent, avec retrait automatique des proxies défaillants.

---

## 📱 Pages de l'interface

| Page | Description | Raccourci |
|------|-------------|-----------|
| 📊 **Overview** | KPIs, velocity, dernières activités | `/dashboard` |
| 📄 **CV** | Gestion CVs nommés/datés, import PDF | `/cv` |
| 💼 **Offres** | Table filtrée, lien entreprise, export CSV, purge | `/jobs` |
| 🔍 **Scrapers** | Scraping international (24 pays), proxies, historique | `/scrapers` |
| 🧠 **CV Intelligence** | Scoring CV ↔ offre, extraction skills, import CV | `/analysis` |
| ✨ **CV Matching** | Générer CVs adaptés, diff visuel, export .docx | `/cv-matching` |
| 📋 **Pipeline** | Kanban 5 colonnes, suivi candidatures | `/board` |
| 📜 **Historique** | Archive analyses, alertes email par ligne | `/history` |

> **Tip :** Appuyez sur `?` sur n'importe quelle page pour afficher l'aide contextuelle.

---

## 🐳 Docker (alternative)

```bash
# Démarrer toute la stack en une commande
docker-compose up -d

# Services lancés :
# → Redis        : localhost:6379
# → API FastAPI  : localhost:8000
# → Worker Celery : (background)
# → Frontend     : localhost:5173
```

---

## 🤝 Contribution

Les contributions sont les bienvenues ! Pour contribuer :

1. Forkez le dépôt
2. Créez une branche : `git checkout -b feature/ma-fonctionnalite`
3. Committez vos changements : `git commit -m "feat: ajouter X"`
4. Poussez : `git push origin feature/ma-fonctionnalite`
5. Ouvrez une Pull Request

---

## 📄 Licence

**MIT** — Patrick Nouhailler — 2025-2026

---

<div align="center">

Fait avec ❤️ pour les chercheurs d'emploi qui veulent garder le contrôle de leurs données.

[⬆ Retour en haut](#-postulator)

</div>
