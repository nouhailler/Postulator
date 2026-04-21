# CONTEXT.md – Postulator
> Dernière mise à jour : session du 21 avril 2026 — **v1.5.3**
> À lire **en début de chaque session Claude** pour reprendre sans perte de temps.

---

## 1. Présentation

**Postulator** — agrégateur de recherche d'emploi open source, self-hosted, IA locale (Ollama).
- Stack : React 18 + Vite · FastAPI + SQLAlchemy async · SQLite · Celery + Redis · Ollama
- Design : dark slate `#0b1326`, primary `#7bd0ff`, tertiary IA `#3cddc7`
- Logo : carré dégradé teal/bleu avec "P" — "Postulator · Job Intelligence Platform"
- Chemin : `/home/patrick/Documents/Claude/Projects/Postulator/`
- Repo : `https://github.com/nouhailler/postulator`
- Version courante : **1.5.3**

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
│   │                            DELETE /api/jobs (keep_recent + keep_selected)
│   │                            DELETE /api/jobs/by-criteria (max_score, before_date, source, dry_run) ← v1.5.3
│   ├── cvs.py                 ← POST /api/cvs/preview-pdf (extraction sans sauvegarde) ← v1.5.3
│   ├── jobs_intelligence.py   ← POST /chat + GET /questions/{job_id} — sauvegarde Q&A en BDD
│   ├── scrapers.py            ← run + run-with-proxies + logs/{id} (détail proxy)
│   │                            payload + exclude_internships ← v1.5.3
│   ├── analysis.py            ← score-sync + summarize-jobs + score-batch + score-batch/status
│   ├── automation.py          ← config JSON + APScheduler + scraping→scoring auto (v1.5.1)
│   ├── cv_store.py · cv_matching.py · history.py · alerts.py · esco.py
├── schemas/
│   └── scraper.py             ← ScrapeRequest + exclude_internships: bool = False ← v1.5.3
├── scrapers/
│   ├── base.py                ← _match_keyword_query (AND/OR/NOT/""/()) + _is_internship() ← v1.5.3
│   │                            BaseScraper.run() + exclude_internships param
│   ├── jobspy_scraper.py      ← INDEED_COUNTRY_MAP (24 pays), company_url, country_indeed
│   ├── adzuna_scraper.py      ← API officielle (ADZUNA_APP_ID/KEY)
│   ├── jobup_scraper.py       ← HTML SSR BeautifulSoup (jobup.ch)
│   ├── jobsch_scraper.py      ← API JSON jobs.ch/api/v1/public/search
│   └── jobteaser_scraper.py   ← RemoteOK (JobTeaser inaccessible publiquement)
├── services/
│   ├── cv_service.py          ← _clean_pdf_block(), _extract_pdf() → (text, warnings) ← v1.5.3
│   │                            PyMuPDF blocs, suppression bullets, jonction lignes fragmentées
│   │                            4 types d'avertissements (isolés, courts, garbled, trop court)
│   ├── scraper_service.py     ← run_search() + exclude_internships ← v1.5.3
│   ├── ollama_service.py · email_service.py
└── workers/
    └── celery_app.py · scrape_task.py  ← run_scrape + exclude_internships ← v1.5.3
```

### Frontend
```
src/
├── App.jsx                    ← 11 routes + init thème depuis localStorage au démarrage ← v1.5.3
├── styles/
│   └── design-system.css      ← :root (dark) + [data-theme="light"] complet ← v1.5.3
├── contexts/
│   └── OllamaStatusContext.jsx ← Context global statut Ollama (v1.4.0)
├── data/
│   ├── helpContent.js         ← aide contextuelle toutes pages (+ /automation v1.5.1)
│   └── esco_dictionary.json   ← 265 métiers + 212 compétences (offline)
├── api/
│   ├── client.js              ← postAI timeout 10min + support signal AbortController externe
│   ├── cvs.js                 ← +previewCVPdf(file) → POST /api/cvs/preview-pdf ← v1.5.3
│   ├── jobs.js                ← +purgeJobsByCriteria({maxScore, beforeDate, source, dryRun}) ← v1.5.3
│   ├── automation.js · jobsIntelligence.js · history.js · alerts.js
│   ├── analysis.js · scrapers.js · cvStore.js · cvMatching.js · profile.js
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
    │                            ResetModal 2 onglets : "Garder N récentes" / "Supprimer par critères" ← v1.5.3
    ├── JobsIntelligencePage   ← combobox offres, chat Ollama, historique Q&A accordion (v1.4.0)
    ├── ScrapersPage           ← 8 sources groupées, 24 pays, toggle Résumé IA, proxies
    │                            défaut 7 jours, mode date précise, toggle Exclure les stages ← v1.5.3
    ├── AnalysisPage           ← modal preview PDF avant import (avertissements + aperçu texte) ← v1.5.3
    ├── SettingsPage           ← +section Apparence : Dark/Light/Custom + color picker ← v1.5.3
    ├── CVMatchingPage · HistoryPage
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
| DELETE `/api/jobs/by-criteria` | Suppression par critères : max_score, before_date, source, dry_run ← v1.5.3 |
| POST `/api/cvs/upload` | Upload + parsing CV |
| POST `/api/cvs/preview-pdf` | Extraction texte PDF sans sauvegarde → {text, warnings, char_count, line_count} ← v1.5.3 |
| POST `/api/jobs-intelligence/chat` | Chat Ollama sur une offre — cascade BDD→fetch URL→titre |
| GET `/api/jobs-intelligence/questions/{job_id}` | Historique Q&A sauvegardées pour une offre (v1.4.0) |
| POST `/api/scrapers/run` | Scraping Celery async (+exclude_internships) ← v1.5.3 |
| POST `/api/scrapers/run-with-proxies` | Scraping avec proxies résidentiels (+exclude_internships) ← v1.5.3 |
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

## 7. Import PDF — CV Intelligence (v1.5.3)

**Service** : `app/services/cv_service.py`

**Extraction** via PyMuPDF (`fitz`) en mode blocs :
```python
blocks = page.get_text("blocks")  # (x0, y0, x1, y1, text, block_no, block_type)
text_blocks.sort(key=lambda b: (round(b[1] / 12) * 12, b[0]))  # lecture naturelle
```

**Nettoyage** par `_clean_pdf_block(block_raw)` :
1. Supprime les puces/bullets en début de ligne (`•▪○◆‣→►▸·◦–—▶✓✗✘` et `- `, `* `, `+ `)
2. Joint les lignes fragmentées : si la ligne ne finit pas par `.!?:;` **et** que la suivante commence par une minuscule → continuation de phrase
3. Gère les tirets de coupure de mot (`-` en fin de ligne → coller sans espace)

**Avertissements détectés** (4 types) :
1. > 3 caractères isolés (puces résiduelles)
2. > 5 lignes très courtes (< 5 chars)
3. Taux de caractères inhabituels > 0.5%
4. Texte total < 200 caractères

**Endpoint preview** : `POST /api/cvs/preview-pdf`
- Reçoit `file: UploadFile`
- Écrit dans un fichier temporaire (tempfile), extrait, supprime
- Retourne `{text, warnings, char_count, line_count}` sans sauvegarder en BDD

**Flow frontend** (`AnalysisPage.jsx`) :
1. Fichier PDF sélectionné → `previewCVPdf(file)` appelé
2. Si `warnings.length > 0` → modal de validation (texte extrait 2000 chars + liste warnings + Confirmer/Annuler)
3. Si aucun avertissement → upload direct sans modal
4. Fichiers non-PDF → upload direct (comportement inchangé)

---

## 8. Page Offres Intelligence — fonctionnement

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
- Minuterie temps réel + bouton Annuler → AbortController
- 20 questions suggérées en 4 catégories
- Sauvegarde Q&A en BDD (`job_questions`)
- Panneau historique : accordion avec questions déjà posées (v1.4.0)

---

## 9. Indicateur Ollama global (v1.4.0)

**Context React** : `src/contexts/OllamaStatusContext.jsx`
**Composant** : `OllamaBanner.jsx` — barre teal fine sticky sous le TopBar

```js
const { setOllamaStatus, clearOllamaStatus } = useOllamaStatus()
setOllamaStatus('Nom de la tâche')  // avant appel Ollama
clearOllamaStatus()                  // dans finally
```

**Labels utilisés** :
- `'Offres Intelligence'` | `'CV Intelligence — Extraction'` | `'CV Intelligence — Scoring'`
- `'CV Matching'` | `'CV Matching ATS'` | `'CV Matching ATS Cloud'`

---

## 10. Page Offres — v1.5.3

Barre de filtres : **texte** · **source** · **lieu** (ILIKE) · **statut** · **Score min %** · **Remote**

**Modal de nettoyage** (2 onglets) :
- **Onglet "Garder N récentes"** : conserve les N plus récentes parmi les `status='new'`
- **Onglet "Supprimer par critères"** :
  - Score IA inférieur à X% (supprime les scorées en dessous du seuil)
  - Scrapées avant une date (YYYY-MM-DD)
  - Source spécifique
  - Bouton **Simuler** (`dry_run=true`) avant suppression effective
  - Les offres sélectionnées (`status != 'new'`) toujours protégées

Score en masse : modal (sélection CV + nb offres), polling toutes les 4s, résultats dans AlertsDrawer.

---

## 11. Page Historique — filtres v1.3.0

Barre de filtres : **texte** (client-side: CV/offre/entreprise) · **Du/Au** (date_from/date_to, backend) · **Score min–max %** (backend)

Bouton ✕ "Réinitialiser" visible uniquement si filtre actif.

---

## 12. Page Paramètres — v1.5.3

5 sections :
1. **Alertes email** : statut SMTP, instructions `.env`, bouton "Tester"
2. **IA (Ollama)** : OLLAMA_BASE_URL + OLLAMA_MODEL, tableau 3 modèles recommandés
3. **Cloud AI** : Anthropic / OpenAI / Mistral — statut provider actif
4. **Scrapers & Sources** : liste 8 sources, config Adzuna
5. **Proxies** : explique que la config est dans l'interface Scrapers
6. **Apparence** ← v1.5.3 : 3 cartes de thème + color picker

**Thèmes** (`design-system.css` + `App.jsx`) :
- **Sombre** (défaut) : fond `#0b1326`
- **Clair** : `[data-theme="light"]` — palette complète inversée (fond `#f0f4ff`, textes sombres)
- **Personnalisé** : color picker → `--surface` surchargé via `style.setProperty`
- Persistance : `localStorage.postulator_theme` + `localStorage.postulator_custom_color`
- Application au démarrage : `App.jsx` `useEffect` lit localStorage et appelle `applyTheme()`
- `applyTheme()` dupliquée dans `SettingsPage.jsx` (changement en temps réel) et `App.jsx` (init)

---

## 13. Scrapers — v1.5.3

| Source | Méthode | État |
|--------|---------|------|
| **jobs.ch** | API JSON `/api/v1/public/search` | ✅ Fonctionnel |
| **jobup.ch** | HTML SSR BeautifulSoup | ✅ Fonctionnel |
| **jobteaser** | RemoteOK (JobTeaser inaccessible) | ✅ Offres remote |
| **Adzuna** | API officielle (ne supporte pas CH) | ✅ Int'l seulement |

**Paramètres ScrapersPage** :
- **Durée** : défaut **7 jours** (était 5)
- **Mode date** : toggle "Nb de jours" ↔ "Date précise" — la date est convertie en `hours_old` côté frontend
- **Exclure les stages** : filtre post-scraping via `_is_internship(job)` dans `BaseScraper.run()`
  - Détecte via `job.job_type` (`internship`, `stage`, `intern`)
  - Détecte via mots-clés dans le titre : `intern`, `internship`, `stage`, `stagiaire`, `apprenti`, `apprentice`, `trainee`, `werkstudent`, `praktikant`, `praktikum`
  - Paramètre `exclude_internships: bool` propagé : `ScrapeRequest` → route → task Celery → `ScraperService._run()` → `BaseScraper.run()`

**Opérateurs booléens** (moteur post-scraping `base.py`) :
- `AND` · `OR` · `NOT` · `" "` (phrase exacte) · `( )` (groupement)
- Évaluation : parenthèses > NOT > AND > OR
- Appliqué sur `title + description` après chaque `_fetch()` pour cohérence sur toutes les sources

---

## 14. CV Matching & ATS

**Standard** : prompt 3 étapes (analyse → décision → génération), `temperature:0.25`, `num_predict:2500`
**ATS** : prompt renforcé (keyword mirroring, reformulation obligatoire), `num_predict:4000`
**Diff visuel** : `tokenize()` + `isNewWord()` → mots nouveaux en rouge `#ff6b6b`
**Export** : .txt · .md · .docx (via pandoc — `sudo apt install pandoc`)

---

## 15. Alertes email

```ini
SMTP_HOST=smtp.gmail.com | SMTP_PORT=587 | SMTP_USER | SMTP_PASSWORD | ALERT_EMAIL_TO | ALERT_SCORE_THRESHOLD=80
```
- **Auto** : POST /api/history → alerte si score ≥ seuil (`asyncio.create_task`)
- **Manuel** : bouton 📧 dans chaque ligne de l'Historique

---

## 16. Variables d'environnement

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

## 17. Bugs connus / règles importantes

1. **Celery** : doit être redémarré après toute modification d'un scraper
2. `is_remote=None` → jobspy crash : toujours `bool(remote_only)`
3. Ollama ≥ 0.5 : `format="json"` obligatoire dans `score_job()` et `extract_skills()`
4. `stop` incompatible avec `format="json"` → supprimé
5. `country_indeed` requis pour Indeed international — retry auto sans si 0 résultats
6. CVs menu CV (`stored_cvs`) ≠ CVs CV Intelligence (`cvs`) — bridge via `import-from-store/{id}`
7. `handleSelect` historique CVMatching → appelle `fetchGeneratedOne(id)` (pas le summary)
8. Tri offres inter-pages : toujours `sort_by=scraped_at&sort_order=desc&limit=200`
9. `OllamaStatusProvider` est dans `AppLayout` — toute page utilisant `useOllamaStatus` doit être enfant de ce layout
10. **PDF PyMuPDF** : `_extract_pdf()` retourne un `tuple[str, list[str]]` (texte, avertissements) — ne pas oublier le dépacking dans `parse()`

---

## 18. Backlog

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
- Automatisation : étendre aux 8 sources (actuellement Indeed + LinkedIn uniquement)

### Priorité basse
- Export JSON Resume (format ATS)
- Automatisation : historique des runs (logs persistants en BDD)

---

## 19. Automatisation (v1.5.1)

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

**Opérateurs mots-clés supportés** :
- `AND` : les deux termes obligatoires — `Python AND senior`
- `OR` : l'un ou l'autre — `DevOps OR SRE`
- `NOT` : exclure un terme — `Python NOT junior`
- `" "` : phrase exacte — `"machine learning" AND Python`
- `( )` : groupement prioritaire — `(Python OR Java) AND NOT stage`
- Ordre d'évaluation : parenthèses > NOT > AND > OR
- **Filtre post-scraping** (v1.5.2) : Postulator évalue lui-même la requête booléenne sur title+description après chaque scraping → cohérence garantie sur toutes les sources, y compris celles qui ignorent les opérateurs (RemoteOK, jobs.ch, jobup.ch)
- RemoteOK : envoie le premier mot significatif comme tag, le filtre Postulator s'occupe du reste

**Endpoints** :
```
GET    /api/automation/config   → config actuelle (ou {enabled: false})
POST   /api/automation/config   → sauvegarder + activer + replanifier
DELETE /api/automation/config   → désactiver + supprimer + unschedule
GET    /api/automation/status   → état run courant + score_results
POST   /api/automation/run-now  → déclencher manuellement
POST   /api/automation/cancel   → annuler le run en cours (cancel_requested flag)
```
