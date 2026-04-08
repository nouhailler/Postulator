## Postulator v1.3.0

> Agrégateur de recherche d'emploi open source · Self-hosted · IA 100% locale (Ollama)

---

## ⚡ Installation rapide

```bash
# 1. Télécharger
wget https://github.com/nouhailler/Postulator/releases/download/v1.3.0/postulator_1.3.0_all.deb

# 2. Installer
sudo dpkg -i postulator_1.3.0_all.deb
sudo apt-get install -f   # résoudre les dépendances si besoin

# 3. Lancer
postulator
# → http://localhost:5173
```

> Si vous avez des erreurs de permissions après install :
> `sudo chown -R $USER:$USER /opt/postulator && postulator`

---

## ✨ Nouveautés v1.3.0

### 💬 Offres Intelligence — chat IA sur vos offres

Nouvelle page accessible via **Offres Intelligence** (`/jobs-intelligence`) dans la sidebar.

- **Combobox offres** : recherche instantanée parmi les 200 dernières offres (titre + entreprise), mode "parcourir tout" au clic de la flèche
- **20 questions suggérées** classées par catégorie (compétences, culture, négociation, poste…) pour démarrer la conversation en un clic
- **Stratégie de description en cascade** : Ollama reçoit le meilleur contexte disponible
  1. Description BDD (si `len > 50` après nettoyage HTML)
  2. Fetch automatique de l'URL de l'offre (httpx + extraction texte, max 5 000 chars)
  3. Titre + entreprise seuls en dernier recours
- **Badge source** : indication teal "Description transmise à Ollama" / jaune "contenu récupéré depuis l'URL" / gris "titre uniquement"
- **Minuterie** : durée de chaque réponse Ollama affichée (ex: `12.4s`)
- **Bouton Annuler** : interrompt la requête Ollama en cours via `AbortController`
- **Scroll automatique** vers la dernière réponse

---

### 🔍 Filtre Lieu dans la page Offres

- Champ de recherche textuel **Lieu** dans la barre de filtres (JobsPage)
- Filtrage `ILIKE %valeur%` côté backend — compatible ville, pays, région
- Paramètre `location` ajouté à `GET /api/jobs`

---

### 📊 Filtres avancés dans l'Historique

Nouveaux filtres dans la page Historique :

| Filtre | Description |
|---|---|
| **Score min / max** | Plage de score IA (0-100) |
| **Date de début / fin** | Filtrage par date d'analyse (ISO `YYYY-MM-DD`) |

Ces filtres sont appliqués côté backend — `GET /api/history` accepte désormais `min_score`, `max_score`, `date_from`, `date_to`.

---

### ⚙️ Page Paramètres

Nouvelle page dédiée (`/settings`) accessible depuis la sidebar :

- **SMTP** : hôte, port, utilisateur, mot de passe, email destinataire, seuil d'alerte — avec bouton de test intégré
- **Ollama** : URL de base, modèle, bouton de vérification ping
- **Adzuna** : App ID et clé API (pour activer le scraper Adzuna)
- Persistance via `PUT /api/profile` (les clés SMTP/Adzuna sont dans `.env`)

---

### 🎨 Logo Postulator

- Nouveau logo carré dégradé **teal → bleu** avec lettre **P** dans la sidebar
- Titre "**Postulator**" en blanc, sous-titre "**Job Intelligence Platform**"
- Remplacement de l'ancien bandeau "Command Center · The Sovereign Architect"
- Pages **Support** et **Sign Out** supprimées du menu de navigation

---

### 📋 ScorePanel et SummaryPanel dans le détail offre

Le panneau de détail d'une offre (`JobDetailDrawer`) est restructuré :

- **ScorePanel** : affiche le score IA, les points forts, les points de développement et la recommandation Ollama
- **SummaryPanel** : affiche les bullet points du résumé IA (`ai_summary`) si disponibles — remplace l'affichage JSON brut
- Tooltip du score en masse : affiche le résumé lisible au lieu du JSON brut

---

## 🗂️ Toutes les fonctionnalités

| Page | Fonctionnalités clés |
|---|---|
| **Scrapers** | 8 sources (Indeed · LinkedIn · Glassdoor · ZipRecruiter · Google · Adzuna · Jobup.ch · Jobs.ch · JobTeaser), 24 pays, toggle Résumé IA, proxies résidentiels |
| **Offres** | Filtres texte / source / lieu / statut / score / remote, CompanyLink, score en masse, icône ✨ résumé, purge, export CSV |
| **Offres Intelligence** | Chat IA, fetch URL auto, 20 questions suggérées, minuterie, Annuler |
| **CV** | CVs nommés/datés, import PDF → Ollama, multi-sections |
| **CV Intelligence** | Scoring CV↔offre, import depuis menu CV |
| **CV Matching** | CV standard + CV ATS (score + keywords), diff visuel, export .docx |
| **Pipeline** | Kanban 5 colonnes (À voir → Rejeté) |
| **Historique** | Filtres score/date, alertes email par analyse, badge ATS |
| **Paramètres** | SMTP, Ollama, Adzuna — configuration centralisée |

---

## 📦 Dépendances

| Dépendance | Version min | Installation | Rôle |
|---|---|---|---|
| **Python** | 3.11+ | `sudo apt install python3.13 python3.13-venv` | Backend FastAPI |
| **Node.js** | 18+ | `sudo apt install nodejs npm` | Frontend React/Vite |
| **Redis** | — | `sudo apt install redis-server` | Queue Celery |
| **Ollama** | latest | [ollama.ai](https://ollama.ai) | IA locale (LLM) |
| **pandoc** | — | `sudo apt install pandoc` | Export .docx *(optionnel)* |

> Le paquet `.deb` installe Python, Node.js et Redis automatiquement via `apt`.
> Ollama doit être installé séparément.

### Modèles Ollama recommandés

| Modèle | VRAM | Usage recommandé |
|---|---|---|
| `phi3.5:3.8b` | ~3 GB | Usage quotidien — rapide |
| `qwen2.5:7b` | ~5 GB | Meilleur équilibre qualité/vitesse |
| `qwen2.5:14b` | ~9 GB | CV ATS — meilleure reformulation |

```bash
ollama pull phi3.5:3.8b
```

---

## 🔄 Mise à jour depuis v1.2.0

```bash
# Installer le nouveau paquet
sudo dpkg -i postulator_1.3.0_all.deb

# Aucune migration de base de données requise pour v1.3.0
# (toutes les migrations précédentes doivent avoir été appliquées)

# Relancer
postulator
```

> Les migrations v1.2.0 doivent avoir été appliquées :
> `migrate_add_ats_fields.py` · `migrate_add_proxies_tried.py`

---

**MIT License** · Patrick Nouhailler · 2025-2026
