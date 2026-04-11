# CONTEXT.md – Postulator
> Dernière mise à jour : session du 11 avril 2026 — **v1.5.1**
> À lire **en début de chaque session Claude** pour reprendre sans perte de temps.

---

## 1. Présentation

**Postulator** — agrégateur de recherche d'emploi open source, self-hosted, IA locale (Ollama).
- Stack : React 18 + Vite · FastAPI + SQLAlchemy async · SQLite · Celery + Redis · Ollama
- Design : dark slate `#0b1326`, primary `#7bd0ff`, tertiary IA `#3cddc7`
- Logo : carré dégradé teal/bleu avec "P" — "Postulator · Job Intelligence Platform"
- Chemin : `/home/patrick/Documents/Claude/Projects/Postulator/`
- Repo : `https://github.com/nouhailler/postulator`
- Version courante : **1.5.1**

---

## 2. Commandes de démarrage

```bash
# Terminal 1 — Redis
sudo systemctl start redis-server && redis-cli ping  # → PONG

# Terminal 2 — API FastAPI
cd /home/patrick/Documents/Claude/Projects/Postulator/backend
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000

# Terminal 3 — Celery (requis pour le scraping)
source .venv/bin/activate
celery -A app.workers.celery_app.celery_app worker --loglevel=info

# Terminal 4 — Frontend
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
| Offres Intelligence | `/jobs-intelligence` | MessageSquare |
| Scrapers | `/scrapers` | Radio |
| **Automatisation** | **`/automation`** | **Zap** |
| CV Intelligence | `/analysis` | Brain |
| CV Matching | `/cv-matching` | Sparkles |
| Pipeline | `/board` | Kanban |
| Historique | `/history` | History |
| Paramètres | `/settings` | Settings |

Bouton `?` flottant (bas droite) → aide contextuelle par route + raccourci clavier `?`.
Pages **Support** et **Sign Out** supprimées (v1.3.0).

---

## 4. Architecture fichiers

### Backend
```
app/
├── main.py                    ← lifespan : init_automation_scheduler() au démarrage (v1.5.1)
├── core/config.py             ← Settings (SMTP, Ollama, Adzuna, Cloud AI, proxies)
├── models/
│   ├── job.py                 ← +ai_summary (résumé IA / JSON score batch)
│   ├── job_question.py        ← Q&A Offres Intelligence (job_id, question, answer, model, duration_ms)
│   ├── cv.py · scrape_log.py · stored_cv.py · generated_cv.py
│   ├── match_history.py · user_profile.py · search_profiles.py
├── api/routes/
│   ├── jobs.py                ← GET filtres: q, source, status, location (ILIKE), is_remote, min_score
│   │                            DELETE purge (keep_recent + keep_selected)
│   ├── jobs_intelligence.py   ← POST /chat + GET /questions/{job_id} — sauvegarde Q&A en BDD
│   ├── scrapers.py            ← run + run-with-proxies + logs/{id} (détail proxy)
│   ├── analysis.py            ← score-sync + summarize-jobs + score-batch + score-batch/status
│   ├── automation.py          ← config JSON + APScheduler + scraping→scoring auto (v1.5.1)
│   ├── cv_store.py · cv_matching.py · cvs.py · history.py · alerts.py · esco.py
├── scrapers/
│   ├── jobspy_scraper.py      ← INDEED_COUNTRY_MAP (24 pays), company_url, country_indeed
│   ├── adzuna_scraper.py      ← API officielle (ADZUNA_APP_ID/KEY)
│   ├── jobup_scraper.py       ← HTML SSR BeautifulSoup (jobup.ch)
│   ├── jobsch_scraper.py      ← API JSON jobs.ch/api/v1/public/search
│   └── jobteaser_scraper.py   ← RemoteOK (JobTeaser inaccessible publiquement)
├── services/
│   ├── scraper_service.py · ollama_service.py · email_service.py
└── workers/
    └── celery_app.py · scrape_task.py
```

### Frontend
```
src/
├── App.jsx                    ← 11 routes (+ /automation)
├── contexts/
│   └── OllamaStatusContext.jsx ← Context global statut Ollama (v1.4.0)
├── data/
│   ├── helpContent.js         ← aide contextuelle toutes pages (+ /automation v1.5.1)
│   └── esco_dictionary.json   ← 265 métiers + 212 compétences (offline)
├── api/
│   ├── client.js              ← postAI timeout 10min + support signal AbortController externe
│   ├── automation.js          ← fetchConfig/saveConfig/deleteConfig/status/runNow/cancel (v1.5.1)
│   ├── jobsIntelligence.js    ← fetchJobQuestions(jobId) (v1.4.0)
│   ├── jobs.js · history.js · alerts.js · analysis.js · scrapers.js
│   ├── cvs.js · cvStore.js · cvMatching.js · profile.js
├── components/
│   ├── layout/
│   │   ├── SideBar.jsx        ← 11 items nav dont Automatisation (Zap) (v1.5.1)
│   │   ├── HelpPanel.jsx      ← bouton ? + panneau aide contextuelle
│   │   ├── OllamaBanner.jsx   ← bannière teal sticky sous TopBar (v1.4.0)
│   │   └── TopBar · AppLayout ← AppLayout wrap OllamaStatusProvider (v1.4.0)
│   ├── topbar/
│   │   └── AlertsDrawer.jsx   ← statut SMTP, score en masse, logs scraping
│   └── jobs/
│       └── JobDetailDrawer.jsx ← ScorePanel (strengths/gaps/reco) + SummaryPanel (bullets)
└── pages/
    ├── DashboardPage · CVPage · BoardPage
    ├── AutomationPage         ← config quotidienne, opérateurs AND/OR, proxies, rapport run (v1.5.1)
    ├── JobsPage               ← filtres: texte, source, lieu (ILIKE), statut, score, remote
    │                            score en masse, icône ✨ si ai_summary, pagination
    ├── JobsIntelligencePage   ← combobox offres, chat Ollama, historique Q&A accordion (v1.4.0)
    │                            fetch URL si pas de desc BDD, badge desc_source, minuterie, Annuler
    ├── ScrapersPage           ← 8 sources groupées, 24 pays, toggle Résumé IA, proxies
    ├── AnalysisPage · CVMatchingPage · HistoryPage · SettingsPage
```

---

## 5. Tables SQLite

| Table | Description |
|-------|-------------|
| `jobs` | Offres scrapées (+company_url, +ai_summary) |
| `job_questions` | Q&A Offres Intelligence par offre (v1.4.0) |
| `cvs` | CVs uploadés (CV Intelligence) |
| `stored_cvs` | CVs nommés/datés (page CV) |
| `generated_cvs` | CVs générés (+source_cv_text pour diff, +is_ats, +ats_*) |
| `match_history` | Historique analyses CV↔offre |
| `user_profile` | Profil utilisateur (id=1) |
| `scrape_logs` | Logs sessions scraping (+proxies_tried) |
| `search_profiles` | Profils de recherche |

**Migrations** (backend/scripts/) :
```bash
python scripts/migrate_add_company_url.py
python scripts/migrate_add_source_cv_text.py
python scripts/migrate_add_ats_fields.py
python scripts/migrate_add_proxies_tried.py
python scripts/migrate_add_job_questions.py   # v1.4.0 — à lancer une fois
```

---

## 6. Endpoints API

| Route | Description |
|-------|-------------|
| GET `/api/jobs` | Filtres: q, source, status, **location** (ILIKE), is_remote, min_score, sort_by, sort_order |
| DELETE `/api/jobs` | Purge (keep_recent + keep_selected) |
| POST `/api/jobs-intelligence/chat` | Chat Ollama sur une offre — cascade BDD→fetch URL→titre |
| GET `/api/jobs-intelligence/questions/{job_id}` | Historique Q&A sauvegardées pour une offre (v1.4.0) |
| POST `/api/scrapers/run` | Scraping Celery async |
| POST `/api/scrapers/run-with-proxies` | Scraping avec proxies résidentiels |
| GET `/api/scrapers/logs/{id}` | Détail log (proxy IP, proxies tentés…) |
| POST `/api/analysis/score-sync` | Scoring CV↔offre |
| POST `/api/analysis/summarize-jobs` | Résumé IA bullet points (toggle ScrapersPage) |
| POST `/api/analysis/score-batch` | Score en masse (Celery) |
| GET `/api/analysis/score-batch/status` | Polling état score en masse |
| GET `/api/history` | Filtres: min_score, **max_score**, **date_from**, **date_to** |
| GET `/api/alerts/status` | État SMTP + score_threshold |
| POST `/api/alerts/test` | Test SMTP |
| POST `/api/cv-matching/generate-ats` | Génération CV ATS Ollama |
| POST `/api/cv-matching/generate-ats-cloud` | Génération CV ATS Cloud (Claude ou OpenAI) |
| GET  `/api/cv-matching/cloud-status` | Provider Cloud disponible + modèle utilisé |
| POST `/api/cv-matching/save-ats` | Sauvegarde ATSResult |

---

## 7. Page Offres Intelligence — fonctionnement

**Route** : `/jobs-intelligence` | **Composant** : `JobsIntelligencePage.jsx`

**Combobox** :
- Charge 200 offres triées par `scraped_at DESC`
- Filtre texte en temps réel (titre + entreprise)
- Clic flèche chevron → mode `browsingAll` (affiche tout sans filtre)
- Sélection → efface la conversation, charge l'historique Q&A de l'offre, focus sur le champ question
- Scrollbar combobox : 10px (cliquable à la souris)

**Fiche offre sélectionnée** :
- Initiales entreprise, titre, métadonnées, lien URL
- Si description disponible : aperçu 300 chars + badge teal "Description transmise à Ollama"
- Si pas de description : message jaune "contenu sera récupéré automatiquement depuis l'URL"

**Stratégie description → Ollama** (backend `jobs_intelligence.py`) :
1. **BDD** : `job.description` si `len > 50` (nettoyage HTML → `_strip_db_description()`)
2. **Fetch URL** : si pas de description, `httpx` récupère la page + `_clean_html()` (BeautifulSoup ou regex fallback), tronqué à 5000 chars
3. **Titre seul** : dernier recours, Ollama est explicitement informé
- `desc_source` retourné : `"database"` | `"fetched"` | `"none"`

**Chat** :
- Bulles user/assistant, rendu Markdown
- Badge 🔗 "Contenu récupéré depuis le site" si `desc_source=fetched`
- Badge ⚠️ si `desc_source=none`
- Minuterie temps réel (0s, 1s, 2s…) pendant réflexion Ollama
- Bouton "Annuler" → `AbortController` connecté au signal externe du `api.client.js`
- 20 questions suggérées en 4 catégories (compétences, responsabilités, entreprise, candidature)
- **Sauvegarde Q&A en BDD** (v1.4.0) : chaque question/réponse persistée dans `job_questions`
- **Panneau historique** (v1.4.0) : sous la fiche offre, accordion avec questions déjà posées, clic pour rejouer dans le chat

---

## 8. Indicateur Ollama global (v1.4.0)

**Context React** : `src/contexts/OllamaStatusContext.jsx` — `OllamaStatusProvider` wrappé dans `AppLayout`.

**Composant** : `OllamaBanner.jsx` — barre teal fine sticky sous le TopBar.
- Affiche : icône ✨ + **nom de la tâche** + points d'animation + compteur de secondes
- Animation `slideDown` à l'apparition, disparaît instantanément quand Ollama termine
- Pages instrumentalisées : Offres Intelligence, CV Intelligence (extraction + scoring), CV Matching (standard + ATS)

**Usage dans une page** :
```js
const { setOllamaStatus, clearOllamaStatus } = useOllamaStatus()
setOllamaStatus('Nom de la tâche')  // avant appel Ollama
clearOllamaStatus()                  // dans finally
```

**Labels utilisés** :
- `'Offres Intelligence'` — JobsIntelligencePage
- `'CV Intelligence — Extraction'` — AnalysisPage / handleAnalyze
- `'CV Intelligence — Scoring'` — AnalysisPage / handleScore
- `'CV Matching'` — CVMatchingPage / handleGenerate
- `'CV Matching ATS'` — CVMatchingPage / handleGenerateATS (Ollama local)
- `'CV Matching ATS Cloud'` — CVMatchingPage / handleGenerateATSCloud (Claude/OpenAI)

---

## 9. Page Offres — filtres v1.3.0

Barre de filtres : **texte** · **source** · **lieu** (ILIKE côté backend) · **statut** · **Score min %** · **Remote**

Filtre lieu : champ texte libre, s'élargit au focus (140px→170px), bouton ✕ pour effacer.
Exemples : "Zürich", "Switzerland", "Paris".

Score en masse : modal (sélection CV + nb offres), polling toutes les 4s, résultats dans AlertsDrawer.

---

## 10. Page Historique — filtres v1.3.0

Barre de filtres : **texte** (client-side: CV/offre/entreprise) · **Du/Au** (date_from/date_to, backend) · **Score min–max %** (backend)

Bouton ✕ "Réinitialiser" visible uniquement si filtre actif.
Compteur de résultats affiché quand filtres actifs.
Vide filtré : message "Aucun résultat" + bouton reset (différent de "Aucune analyse").

---

## 11. Page Paramètres — v1.3.0

**Route** : `/settings` — accessible depuis menu latéral (bas) et bouton "Configurer" de l'AlertsDrawer.

4 sections :
1. **Alertes email** : statut SMTP actuel (BDD), instructions `.env`, bouton "Tester" (désactivé si SMTP non configuré)
2. **IA (Ollama)** : OLLAMA_BASE_URL + OLLAMA_MODEL, tableau 3 modèles recommandés pour 16GB VRAM
3. **Scrapers & Sources** : liste 8 sources, config Adzuna
4. **Proxies** : explique que la config est dans l'interface Scrapers

---

## 12. Scrapers suisses

| Source | Méthode | État |
|--------|---------|------|
| **jobs.ch** | API JSON `/api/v1/public/search` | ✅ Fonctionnel |
| **jobup.ch** | HTML SSR BeautifulSoup | ✅ Fonctionnel |
| **jobteaser** | RemoteOK (JobTeaser inaccessible) | ✅ Offres remote |
| **Adzuna** | API officielle (ne supporte pas CH) | ✅ Int'l seulement |

---

## 13. CV Matching & ATS

**Standard** : prompt 3 étapes (analyse → décision → génération), `temperature:0.25`, `num_predict:2500`
**ATS** : prompt renforcé (keyword mirroring, reformulation obligatoire), `num_predict:4000`
**Diff visuel** : `tokenize()` + `isNewWord()` → mots nouveaux en rouge `#ff6b6b`
**Export** : .txt · .md · .docx (via pandoc — `sudo apt install pandoc`)

---

## 14. Alertes email

```ini
SMTP_HOST=smtp.gmail.com | SMTP_PORT=587 | SMTP_USER | SMTP_PASSWORD | ALERT_EMAIL_TO | ALERT_SCORE_THRESHOLD=80
```
- **Auto** : POST /api/history → alerte si score ≥ seuil (`asyncio.create_task`)
- **Manuel** : bouton 📧 dans chaque ligne de l'Historique

---

## 15. Variables d'environnement

```ini
OLLAMA_MODEL=phi4-mini          # ou phi3.5:3.8b, qwen2.5:14b, deepseek-r1:32b
OLLAMA_BASE_URL=http://localhost:11434
DATABASE_URL=sqlite+aiosqlite:///./postulator.db
REDIS_URL=redis://localhost:6379/0
CORS_ORIGINS=http://localhost:5173
SMTP_HOST= | SMTP_PORT=587 | SMTP_USER= | SMTP_PASSWORD= | ALERT_EMAIL_TO= | ALERT_SCORE_THRESHOLD=80
ADZUNA_APP_ID= | ADZUNA_APP_KEY=
PROXY_LIST=
# Cloud AI (au moins une clé pour activer CV ATS CLOUD) — priorité : Anthropic > OpenAI > Mistral
ANTHROPIC_API_KEY=    # prioritaire
OPENAI_API_KEY=
MISTRAL_API_KEY=      # modèle français (mistral-small-latest)
```

---

## 16. Bugs connus / règles importantes

1. **Celery** : doit être redémarré après toute modification d'un scraper
2. `is_remote=None` → jobspy crash : toujours `bool(remote_only)`
3. Ollama ≥ 0.5 : `format="json"` obligatoire dans `score_job()` et `extract_skills()`
4. `stop` incompatible avec `format="json"` → supprimé
5. `country_indeed` requis pour Indeed international — retry auto sans si 0 résultats
6. CVs menu CV (`stored_cvs`) ≠ CVs CV Intelligence (`cvs`) — bridge via `import-from-store/{id}`
7. `handleSelect` historique CVMatching → appelle `fetchGeneratedOne(id)` (pas le summary)
8. Tri offres inter-pages : toujours `sort_by=scraped_at&sort_order=desc&limit=200`
9. `OllamaStatusProvider` est dans `AppLayout` — toute page utilisant `useOllamaStatus` doit être enfant de ce layout (c'est le cas de toutes les routes)

---

## 17. Backlog

### Priorité haute
- `sudo apt install pandoc` (export DOCX réel)
- Lancer `python scripts/migrate_add_job_questions.py` si pas encore fait (v1.4.0)
- **v1.5.1 Automatisation** : `pip install apscheduler --break-system-packages` dans le venv backend

### Priorité moyenne
- Dashboard KPIs entièrement réels
- Scraper Wellfound
- Jobup.ch et Jobs.ch : tester avec Claude Code + accès shell pour valider les parsers
- Sauvegarder en BDD la description fetchée (Offres Intelligence) pour éviter re-fetch
- Instrumenter `ScrapersPage` avec `useOllamaStatus` pour le résumé IA Celery (affichage différé via polling)
- Automatisation : notification email après chaque run (résultat du rapport par email)

### Priorité basse
- Packaging `.deb` v1.5.x
- Export JSON Resume (format ATS)
- Automatisation : historique des runs (logs persistants en BDD)

---

## 18. Automatisation (v1.5.1)

**Route** : `/automation` | **Composant** : `AutomationPage.jsx`  
**Backend** : `app/api/routes/automation.py` | **Config** : `automation_config.json` (racine backend)

**Principe** : recherche quotidienne automatique sur **Indeed + LinkedIn** avec scoring IA intégré.

**Paramètres fixés en dur** :
- Sources : Indeed + LinkedIn uniquement
- Offres publiées dans les **24h** (`hours_old=24`)
- **10 résultats par source**
- Max **20 offres scorées** par run

**Cycle d'exécution** :
1. APScheduler déclenche `_scheduled_run()` à l'heure configurée (Europe/Paris)
2. Vérification période de validité (start_date / end_date) — désactivation automatique à la fin
3. `_run_scraping()` : tâche Celery, polling résultat toutes les 3s, timeout 10 min
4. `_run_scoring()` : score séquentiel des offres `status='new'` contre le CV sélectionné
5. Rapport final exposé via `GET /api/automation/status`

**Fichier de config** (`automation_config.json`) :
```json
{
  "enabled": true,
  "keywords": "DevOps AND senior",
  "location": "Genève, Switzerland",
  "cv_id": 2,
  "cv_name": "Mon CV Principal",
  "proxies": ["IP:PORT:USER:PASS", "..."],
  "run_hour": 8,
  "run_minute": 0,
  "start_date": "2026-04-11",
  "end_date": "2026-05-31"
}
```

**État in-memory** (`_run_state`) : `idle` | `scraping` | `scoring` | `done` | `error` | `cancelled`

**Dépendance à installer** :
```bash
pip install apscheduler --break-system-packages
```

**Vérification logs uvicorn au démarrage** :
```
[Automation] Reprise planification : 'DevOps AND senior' à 08:00 Europe/Paris
[Automation] Job planifié tous les jours à 08:00
```

**Opérateurs mots-clés supportés** :
- `AND` : les deux termes obligatoires — `Python AND senior`
- `OR` : l'un ou l'autre — `DevOps OR SRE`
- `( )` : groupement prioritaire — `(Python OR Java) AND senior`
- Ordre d'évaluation : parenthèses > AND > OR

**Endpoints** :
```
GET    /api/automation/config   → config actuelle (ou {enabled: false})
POST   /api/automation/config   → sauvegarder + activer + replanifier
DELETE /api/automation/config   → désactiver + supprimer + unschedule
GET    /api/automation/status   → état run courant + score_results
POST   /api/automation/run-now  → déclencher manuellement
POST   /api/automation/cancel   → annuler le run en cours (cancel_requested flag)
```
