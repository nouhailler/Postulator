# CONTEXT.md – Postulator
> Dernière mise à jour : session du 2 avril 2026 (session 6 — aide contextuelle + proxies résidentiels)
> À lire **en début de chaque session Claude** pour reprendre sans perte de temps.

---

## 1. Présentation

**Postulator** — agrégateur de recherche d'emploi open source, self-hosted, IA locale (Ollama).
- Stack : React 18 + Vite · FastAPI + SQLAlchemy async · SQLite · Celery + Redis · Ollama
- Design : "The Command Center" — dark slate `#0b1326`, primary `#7bd0ff`, tertiary IA `#3cddc7`
- Chemin : `/home/patrick/Documents/Claude/Projects/Postulator/`

---

## 2. Commandes de démarrage

```bash
# Terminal 1 — Redis
sudo systemctl start redis-server && redis-cli ping  # → PONG

# Terminal 2 — Ollama (préchargement VRAM)
curl -s http://localhost:11434/api/generate \
  -d '{"model":"phi3.5:3.8b","keep_alive":600,"prompt":""}' \
  -o /dev/null && echo "✓"

# Terminal 3 — API FastAPI
cd /home/patrick/Documents/Claude/Projects/Postulator/backend
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000

# Terminal 4 — Celery
source .venv/bin/activate
celery -A app.workers.celery_app.celery_app worker --loglevel=info

# Terminal 5 — Frontend
cd /home/patrick/Documents/Claude/Projects/Postulator/frontend
npm run dev   # → http://localhost:5173
```

---

## 3. Navigation (sidebar)

| Label | Route | Icône |
|-------|-------|-------|
| Overview | `/dashboard` | LayoutDashboard |
| CV | `/cv` | FileText |
| Offres | `/jobs` | Briefcase |
| Scrapers | `/scrapers` | Radio |
| CV Intelligence | `/analysis` | Brain |
| CV Matching | `/cv-matching` | Sparkles |
| Pipeline | `/board` | Kanban |
| Historique | `/history` | History |

CV et CV Matching utilisent `navHighlight` (bordure tertiary quand actifs).

**TopBar** : bouton `?` flottant (bas droite) → aide contextuelle par page. Raccourci clavier : touche `?`.

---

## 4. Architecture fichiers complète

### Backend
```
app/
├── main.py
├── models/
│   ├── __init__.py
│   ├── job.py · cv.py · scrape_log.py · search_profile.py
│   ├── stored_cv.py       ← CVs nommés/datés multi-sections
│   ├── generated_cv.py    ← CV généré pour une offre
│   ├── match_history.py   ← historique analyses CV↔offre
│   └── user_profile.py    ← profil utilisateur (id=1)
├── api/routes/
│   ├── jobs.py · cvs.py · dashboard.py · analysis.py
│   ├── scrapers.py        ← run + run-with-proxies + status + logs
│   ├── cv_store.py        ← CRUD + import-pdf Ollama
│   ├── cv_matching.py     ← generate + historique CVs générés
│   ├── history.py         ← historique matches
│   └── profile.py         ← GET/PUT profil
├── scrapers/
│   ├── base.py
│   ├── jobspy_scraper.py  ← is_remote=bool() fix
│   ├── proxy_manager.py   ← ProxyManager + ResidentialProxyManager (NOUVEAU)
│   └── __init__.py
├── services/
│   ├── scraper_service.py ← run_search + run_search_with_proxies (NOUVEAU)
│   └── ollama_service.py  ← keep_alive=600, timeout=300s, warmup()
└── workers/
    ├── celery_app.py
    └── scrape_task.py     ← run_scrape + run_scrape_with_proxies (NOUVEAU)
```

### Frontend
```
src/
├── App.jsx              ← 8 routes
├── data/
│   └── helpContent.js   ← NOUVEAU : contenu aide contextuelle par route
├── api/
│   ├── client.js · jobs.js · cvs.js · analysis.js · scrapers.js
│   ├── history.js · profile.js · cvStore.js · cvMatching.js
├── hooks/
│   ├── useAsync.js · useDashboard.js · useScraper.js · useProfile.js
├── components/
│   ├── layout/
│   │   ├── AppLayout.jsx     ← intègre HelpPanel
│   │   ├── HelpPanel.jsx     ← NOUVEAU : bouton ? + panneau aide contextuel
│   │   ├── HelpPanel.module.css
│   │   ├── TopBar.jsx · SideBar.jsx
│   └── topbar/
│       ├── AlertsDrawer.jsx · SettingsDrawer.jsx · ProfileDrawer.jsx (preview)
│       └── Drawer.module.css · ProfileDrawer.module.css
└── pages/
    ├── DashboardPage · CVPage · JobsPage · ScrapersPage
    ├── AnalysisPage · CVMatchingPage · BoardPage · HistoryPage
```

---

## 5. Modèles de base de données

| Table | Description |
|-------|-------------|
| `jobs` | Offres scrapées |
| `cvs` | CVs uploadés (page Analysis) |
| `stored_cvs` | CVs nommés/datés avec sections complètes |
| `generated_cvs` | CVs générés pour offres spécifiques |
| `match_history` | Historique analyses scoring CV↔offre |
| `user_profile` | Profil utilisateur (id=1) |
| `scrape_logs` | Logs sessions scraping |
| `search_profiles` | Profils de recherche |

---

## 6. Endpoints API

| Route | Description |
|-------|-------------|
| POST `/api/scrapers/run` | Scraping standard (Celery async) |
| POST `/api/scrapers/run-with-proxies` | **NOUVEAU** — Scraping avec rotation proxies résidentiels |
| GET `/api/scrapers/status/{id}` | État tâche Celery |
| GET `/api/scrapers/logs` | Historique sessions |
| GET `/api/cv-store` · POST · GET/{id} · PUT/{id} · DELETE/{id} | CRUD CVs |
| POST `/api/cv-store/import-pdf` | Import PDF + parse Ollama |
| GET `/api/cv-matching` · POST `/generate` · DELETE/{id} · PATCH/{id}/notes | CV Matching |
| GET/POST/DELETE `/api/history` | Historique matches |
| GET/PUT `/api/profile` | Profil utilisateur |
| GET `/api/jobs` (sort_by, sort_order) · GET/{id} · PATCH/{id}/status | Jobs |
| POST `/api/cvs/{id}/analyze` | Extraction skills Ollama |
| POST `/api/analysis/score-sync` | Scoring CV↔offre |

---

## 7. Scraping avec proxies résidentiels (NOUVEAU — session 6)

### Format des proxies
```
IP:PORT:USERNAME:PASSWORD
Exemple : 31.59.20.176:6754:nbnzyhqa:xmqbrwxlh5ov
```

### Architecture
- **`ResidentialProxyManager`** dans `proxy_manager.py` :
  - Parse la liste des proxies au format `IP:PORT:USER:PASS`
  - Construit l'URL `http://USER:PASS@IP:PORT`
  - Rotation **round-robin** entre toutes les IPs (jamais deux fois la même consécutivement)
  - Méthode `remove(proxy)` pour retirer une IP défaillante
  - Méthode `get_next()` → retourne la prochaine URL proxy

- **`run_search_with_proxies()`** dans `scraper_service.py` :
  - Accepte `proxy_list: list[str]` (lignes brutes IP:PORT:USER:PASS)
  - Instancie un `ResidentialProxyManager` temporaire (non global)
  - Passe un proxy différent à chaque scraper lancé
  - Délai aléatoire entre 5-15s (plus conservateur qu'en direct)

- **Tâche Celery** `run_scrape_with_proxies` dans `scrape_task.py`

- **Route** `POST /api/scrapers/run-with-proxies` dans `scrapers.py`
  - Body : `ScrapeRequest` + `proxies: list[str]`

### UI (ScrapersPage)
- Bouton **"Lancer le scraping avec Proxy"** (Shield icon, couleur tertiary)
- Zone dépliable (toggle) sous le bouton : textarea pour saisir les proxies
  - Format : une ligne par proxy `IP:PORT:USERNAME:PASSWORD`
  - Validation côté frontend : au moins 1 proxy valide
  - Affichage du nombre de proxies détectés
- Les 10 proxies de test sont pré-remplis dans la textarea (modifiables)
- Badge "🛡️ Proxy" dans les logs d'audit si scraping avec proxy

---

## 8. Bugs corrigés (à ne pas réintroduire)

1. `is_remote=None` → jobspy crash : toujours `bool(remote_only)`
2. `api.post('/cvs/{id}/analyze', {})` → FastAPI 422 : utiliser `api.postEmptyAI()`
3. Timeout Ollama → `OLLAMA_TIMEOUT=300` + timeout client 10min + warmup au démarrage
4. Descriptions HTML brutes → `_clean_html()` dans ollama_service
5. Prompt trop long → CV tronqué 1500 chars, description 800 chars nettoyée

---

## 9. Aide contextuelle (session 6)

- **`HelpPanel.jsx`** : bouton rond bleu `?` (fixed, bas droite), panneau flottant
- **`helpContent.js`** : contenu par route (`/dashboard`, `/cv`, `/jobs`, `/scrapers`, `/analysis`, `/cv-matching`, `/board`, `/history`)
- Raccourci clavier : touche `?` (hors champ de saisie)
- Fermeture : Escape, clic hors panneau, ou changement de page
- Première section ouverte par défaut, autres en accordéon

---

## 10. Variables d'environnement

```ini
# backend/.env
OLLAMA_MODEL=phi3.5:3.8b
OLLAMA_BASE_URL=http://localhost:11434
DATABASE_URL=sqlite+aiosqlite:///./postulator.db
REDIS_URL=redis://localhost:6379/0
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
DEBUG=true
# Proxies statiques optionnels (format HTTP) — pour les proxies saisis en UI, utiliser /run-with-proxies
PROXY_LIST=
```

---

## 11. Prochaines étapes (backlog)

### Priorité haute
1. ✅ Aide contextuelle (session 6)
2. ✅ Scraping avec proxies résidentiels (session 6)
3. Init Git + push `https://github.com/nouhailler/postulator`

### Priorité moyenne
4. Export DOCX réel via pandoc côté backend
5. Lier `/analysis` → présélectionner offre via `?job_id=X`
6. Alertes email SMTP

### Priorité basse
7. Scraper Wellfound
8. Packaging `.deb`
9. Export JSON Resume (format ATS)

---

## 12. Conventions

- CSS Modules, `var(--tertiary)` = couleur IA uniquement
- `AutoTextarea` = textarea auto-resize, aucune limite de hauteur
- `write_file` pour réécrire un fichier entier
- `postEmptyAI` pour endpoints sans body JSON + timeout 10min
- Snapshots obligatoires dans les modèles liés (job_title, cv_name…)
- Proxies résidentiels : format `IP:PORT:USER:PASS`, rotation round-robin, retrait si défaillant
