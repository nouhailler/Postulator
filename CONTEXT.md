# CONTEXT.md – Postulator
> Dernière mise à jour : session du 7 avril 2026 (session 20 — Résumé IA post-scraping, score en masse, icône ✨ résumé dans les offres, résultats dans AlertsDrawer)
> À lire **en début de chaque session Claude** pour reprendre sans perte de temps.

---

## 1. Présentation

**Postulator** — agrégateur de recherche d'emploi open source, self-hosted, IA locale (Ollama).
- Stack : React 18 + Vite · FastAPI + SQLAlchemy async · SQLite · Celery + Redis · Ollama
- Design : "The Command Center" — dark slate `#0b1326`, primary `#7bd0ff`, tertiary IA `#3cddc7`
- Chemin : `/home/patrick/Documents/Claude/Projects/Postulator/`
- Repo : `https://github.com/nouhailler/postulator`

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

Bouton `?` flottant (bas droite) → aide contextuelle + raccourci clavier `?`.

---

## 4. Architecture fichiers

### Backend
```
app/
├── main.py                    ← warmup Ollama auto + lifespan
├── core/config.py             ← Settings + email_configured + alert_score_threshold
├── models/
│   ├── __init__.py            ← importe TOUS les modèles
│   ├── job.py                 ← +company_url (site web entreprise)
│   ├── cv.py · scrape_log.py · search_profile.py
│   ├── stored_cv.py           ← CVs nommés/datés multi-sections
│   ├── generated_cv.py        ← CV généré + source_cv_text (snapshot pour diff)
│   ├── match_history.py       ← historique analyses CV↔offre
│   └── user_profile.py        ← profil utilisateur (id=1)
├── api/routes/
│   ├── jobs.py                ← DELETE /api/jobs (purge keep_recent/keep_selected)
│   ├── scrapers.py            ← run + run-with-proxies + status + logs
│   ├── cv_store.py            ← CRUD + import-pdf Ollama
│   ├── cv_matching.py         ← generate + _build_source_text + _build_cv_context + export/docx + notes
│   ├── history.py             ← save_match + alerte email auto si score ≥ seuil
│   ├── cvs.py                 ← upload + import-from-store/{id} (upsert par nom)
│   └── alerts.py              ← status + test SMTP + send/{id}
├── scrapers/
│   ├── base.py · __init__.py
│   ├── jobspy_scraper.py      ← INDEED_COUNTRY_MAP (24 pays) + _extract_country_from_location
│   │                             + _strip_country_from_location + company_url
│   └── proxy_manager.py       ← ProxyManager + ResidentialProxyManager
├── services/
│   ├── scraper_service.py     ← run_search + run_search_with_proxies (signatures simplifiées)
│   ├── ollama_service.py      ← keep_alive=600, timeout=300s, warmup()
│   └── email_service.py       ← SMTP async, email HTML responsive
└── workers/
    ├── celery_app.py
    └── scrape_task.py         ← run_scrape + run_scrape_with_proxies
```

### Frontend
```
src/
├── App.jsx                    ← 8 routes
├── data/helpContent.js        ← aide contextuelle par route
├── api/
│   ├── client.js · jobs.js · cvs.js · analysis.js · scrapers.js
│   ├── history.js · profile.js · cvStore.js
│   ├── cvMatching.js          ← fetchGenerated, fetchGeneratedOne, generateMatchingCV, exportDocx
│   └── alerts.js
├── hooks/
│   └── useAsync · useDashboard · useScraper · useProfile
├── components/
│   ├── layout/
│   │   ├── AppLayout.jsx      ← intègre HelpPanel
│   │   ├── HelpPanel.jsx      ← bouton ? + panneau aide contextuel
│   │   └── TopBar · SideBar
│   └── topbar/
│       ├── AlertsDrawer.jsx   ← statut email (actif/inactif + seuil), matches ≥ seuil%, logs scraping
│       ├── SettingsDrawer.jsx ← Ollama + seuil alerte + test SMTP
│       └── ProfileDrawer.jsx  ← preview + liens /cv et /cv-matching
└── pages/
    ├── DashboardPage · CVPage · BoardPage · HistoryPage
    ├── ScrapersPage           ← sélecteur pays (24 pays + drapeaux) + datalist villes,
    │                            daysOld→hours_old*24, buildLocation("Ville, Pays")
    ├── JobsPage               ← colonne #numéro, tri scraped_at DESC (défaut), CompanyLink
    │                            (lien direct ou Google Search), modal Réinitialiser (purge),
    │                            col "Scrapée" dans SORT_COLS, CSV enrichi (+num, +company_url, +scraped_at)
    ├── AnalysisPage           ← présélection ?job_id=, import stored_cvs→cvs (icône 📋 + tag),
    │                            tri scraped_at + numéros dans le select offres
    ├── HistoryPage            ← bouton 📧 par ligne (sendMatchAlert + états sending/sent/error)
    └── CVMatchingPage         ← génération CV adapté, historique (fetchGeneratedOne),
                                  diff visuel mots nouveaux en rouge, bouton Diff ON/OFF
```

---

## 5. Tables SQLite

| Table | Description |
|-------|-------------|
| `jobs` | Offres scrapées (+ company_url) |
| `cvs` | CVs uploadés (CV Intelligence) |
| `stored_cvs` | CVs nommés/datés (menu CV) |
| `generated_cvs` | CVs générés pour offres (+ source_cv_text pour diff) |
| `match_history` | Historique analyses scoring |
| `user_profile` | Profil utilisateur (id=1) |
| `scrape_logs` | Logs sessions scraping |
| `search_profiles` | Profils de recherche |

**Migrations nécessaires** (scripts dans `backend/scripts/`) :
```bash
python scripts/migrate_add_company_url.py
python scripts/migrate_add_source_cv_text.py   ← déjà appliquée session 12
```

---

## 6. Endpoints API complets

| Route | Description |
|-------|-------------|
| POST `/api/scrapers/run` | Scraping standard (Celery async) |
| POST `/api/scrapers/run-with-proxies` | Scraping avec proxies résidentiels |
| GET `/api/scrapers/status/{id}` | État tâche Celery |
| GET `/api/scrapers/logs` | Historique sessions |
| GET `/api/jobs` | Tri **scraped_at DESC** par défaut, limit 200 |
| DELETE `/api/jobs` | Purge (`keep_recent` + `keep_selected`) |
| DELETE `/api/jobs/{id}` | Suppression offre individuelle |
| GET `/api/cv-store` · POST · GET/{id} · PUT/{id} · DELETE/{id} | CRUD CVs |
| POST `/api/cv-store/import-pdf` | Import PDF + parse Ollama |
| GET `/api/cvs` | Liste CVs Intelligence |
| POST `/api/cvs/upload` | Upload CV |
| POST `/api/cvs/import-from-store/{id}` | Import StoredCV → table cvs (upsert par nom) |
| POST `/api/cvs/{id}/analyze` | Extraction skills Ollama |
| GET `/api/cv-matching` | Liste CVs générés (summary, sans cv_markdown) |
| POST `/api/cv-matching/generate` | Génère CV + sauvegarde source_cv_text |
| GET `/api/cv-matching/{id}` | Détail complet (cv_markdown + source_cv_text) |
| GET `/api/cv-matching/{id}/export/docx` | Export DOCX via pandoc |
| PATCH `/api/cv-matching/{id}/notes` · DELETE | Notes + suppression |
| GET/POST/DELETE `/api/history` | Historique matches — POST envoie alerte auto |
| GET `/api/alerts/status` | État config SMTP + score_threshold |
| POST `/api/alerts/test` | Test SMTP |
| POST `/api/alerts/send/{match_id}` | Alerte manuelle |
| GET/PUT `/api/profile` | Profil utilisateur |
| POST `/api/analysis/score-sync` | Scoring CV↔offre |
| GET `/api/analysis/ollama/ping` · `/models` | Statut Ollama |

---

## 7. Numérotation des offres — cohérence inter-pages

**Principe** : les 3 selects "offre" utilisent exactement le même tri (`sort_by: scraped_at`, `sort_order: desc`, `limit: 200`) pour que le `#N` affiché soit identique partout.

- **Menu Offres (JobsPage)** : colonne `#` = `pageOffset + idx + 1`, tri scraped_at DESC par défaut ; colonne **Scrapée** affichée (date+heure)
- **CV Matching** : select `#1 · Titre · Entreprise` — même ordre
- **CV Intelligence** : select `#1 · Titre · Entreprise` — même ordre

**Tri par défaut dans le backend** : `sort_by=scraped_at` (remplace `published_at`) — garantit que les nouvelles offres post-scraping remontent en tête même si `published_at` est nul.

---

## 8. CV Matching — prompt Ollama (session 11)

Fichier : `backend/app/api/routes/cv_matching.py`, fonction `_generate_with_ollama()`

Stratégie prompt en **3 étapes explicites** :
1. Analyse mentale de l'offre (compétences requises, mots-clés, niveau)
2. Décision de pertinence (mettre en avant / conserver / omettre)
3. Génération section par section avec règles strictes :
   - **Résumé** : mentionner le titre du poste + 3 mots-clés de l'offre, réécrire entièrement
   - **Expériences** : trier par pertinence, reformuler avec vocabulaire de l'offre
   - **Compétences** : technologies de l'offre en premier, reste en "Autres compétences"
- `temperature: 0.25`, `num_predict: 2500`
- Nettoyage du préfixe parasite avant le `#`
- `source_cv_text` = snapshot texte brut du CV original sauvegardé en base à la génération

---

## 9. CV Matching — diff visuel (session 12)

**Backend** : `_build_source_text()` concatène toutes les sections du StoredCV → stocké dans `generated_cvs.source_cv_text` (TEXT, nullable).

**Frontend** (`CVMatchingPage.jsx`) :
- `tokenize()` : split en mots + ponctuations
- `isNewWord()` : mot absent du texte source ET non-stopword → rouge
- `MarkdownCV` : passe chaque ligne par `renderLineWithDiff()` → `<span className={styles.diffNew}>`
- Bouton **Diff ON/OFF** dans la toolbar (`.diffBtnActive` = contour rouge)
- Légende explicative sous la toolbar
- `.diffNew` : `color: #ff6b6b`, `background: rgba(255,107,107,0.10)`

**Important** : `handleSelect` dans l'historique appelle `fetchGeneratedOne(id)` → `GET /api/cv-matching/{id}` pour charger le `GeneratedCVFull` complet (cv_markdown + source_cv_text). La liste `genList` ne contient que les summaries.

---

## 10. Alertes email SMTP

```ini
SMTP_HOST=smtp.gmail.com · SMTP_PORT=587 · SMTP_USER · SMTP_PASSWORD (app password Gmail)
ALERT_EMAIL_TO · ALERT_SCORE_THRESHOLD=80
```

- **Auto** : POST /api/history → alerte si score ≥ seuil (asyncio.create_task)
- **Manuel** : bouton 📧 dans chaque ligne de l'Historique
- **Test** : Settings → bouton "Envoyer un email de test"

---

## 11. Scraping international — sélecteur pays/ville

**ScrapersPage** :
- Sélecteur **pays** (24 pays avec drapeaux, favoris : 🇫🇷 France + 🇨🇭 Suisse)
- Champ **ville** avec `<datalist>` de suggestions par pays (reset auto au changement de pays)
- `buildLocation(country, city)` → `"Ville, Pays"` ou `"Pays"` seul → envoyé dans `location`
- Champ `daysOld` (jours) converti en `hours_old = daysOld * 24` avant envoi API

**Backend — jobspy_scraper.py** :
- `INDEED_COUNTRY_MAP` : 24 pays → code jobspy (`france`, `switzerland`, `uk`, `usa`…)
- `_extract_country_from_location(location)` : extrait le pays depuis `"Ville, Pays"` → `country_indeed`
- `_strip_country_from_location(location)` : retire le pays → envoie seulement la ville à jobspy
- Sans `country_indeed` : jobspy scrape `indeed.com` (US) → 0 résultats hors US

**Scraping avec proxies résidentiels** :
Format : `IP:PORT:USERNAME:PASSWORD` (une ligne par proxy)
Rotation round-robin automatique — badge 🛡️ dans les logs.
10 proxies de test pré-remplis dans la textarea de ScrapersPage.

---

## 12. Variables d'environnement

```ini
# backend/.env
OLLAMA_MODEL=phi3.5:3.8b
OLLAMA_BASE_URL=http://localhost:11434
DATABASE_URL=sqlite+aiosqlite:///./postulator.db
REDIS_URL=redis://localhost:6379/0
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
DEBUG=true
PROXY_LIST=
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
ALERT_EMAIL_TO=
ALERT_SCORE_THRESHOLD=80
```

---

## 13. Bugs corrigés (à ne pas réintroduire)

1. `is_remote=None` → jobspy crash : toujours `bool(remote_only)`
2. Ollama ≥ 0.5 : `format="json"` obligatoire dans `score_job()` et `extract_skills()`
3. `stop` incompatible avec `format="json"` → supprimé des options
4. Indeed international : `country_indeed` requis — `_extract_country_from_location()` extrait le pays
5. Retry automatique sans `country_indeed` si 0 résultats
6. `.deb` permissions : `postinst` fait `chown -R $SUDO_USER /opt/postulator` après install
7. Celery ne recharge pas le code à chaud → toujours redémarrer après modification scraper
8. CVs menu CV (stored_cvs) ≠ CVs CV Intelligence (cvs) → `POST /api/cvs/import-from-store/{id}` ajouté
9. `handleScore` dans Jobs → `alert()` remplacé par `navigate('/analysis?job_id=')`
10. **CVMatchingPage historique** : `handleSelect` appelait directement le summary (sans cv_markdown) → corrigé : appelle `fetchGeneratedOne(id)` pour charger le GeneratedCVFull complet
11. **JobsPage tri** : tri par défaut était `published_at` → changé en `scraped_at` DESC pour que les nouvelles offres post-scraping remontent même si `published_at` est nul
12. **AlertsDrawer seuil** : le filtre `≥ 80%` était hardcodé → utilise désormais `alertStatus.score_threshold` récupéré depuis `/api/alerts/status`

---

## 14. CompanyLink — lien web entreprise (JobsPage)

Composant `CompanyLink({ companyUrl, company })` dans `JobsPage.jsx` :
- Si `company_url` disponible → lien direct vers le site + icône Globe, domaine court affiché
- Sinon → lien Google Search `?q=company` (label "Google →")
- `_shortDomain(url)` : extrait le hostname, tronque à 22 chars
- `.companyLinkDirect` vs `.companyLinkGoogle` : styles distincts dans `JobsPage.module.css`
- `e.stopPropagation()` : évite d'ouvrir le drawer détail en cliquant sur le lien

Le champ `company_url` est rempli par jobspy → stocké dans `jobs.company_url` (migration `migrate_add_company_url.py` déjà appliquée).

---

## 15. Purge des offres — modal Réinitialiser (JobsPage)

**Frontend** : composant `ResetModal` avec champ `keepRecent` (défaut 20).
- Bouton "Réinitialiser" dans la toolbar (icône Trash2, classe `.btnReset`)
- Confirmation → appelle `purgeJobs({ keep_recent: N, keep_selected: true })`
- Offres avec statut ≠ `"new"` toujours conservées (keep_selected=true)

**Backend** `DELETE /api/jobs` :
- `keep_recent` (int, défaut 0) : N offres `"new"` les plus récentes à conserver
- `keep_selected` (bool, défaut true) : préserve les offres avec statut ≠ `"new"`
- Retourne `{ deleted, remaining }` en JSON

---

## 16. Import StoredCV → CV Intelligence

`POST /api/cvs/import-from-store/{store_id}` :
- Reconstruit le texte brut depuis toutes les sections du StoredCV via `_build_raw_text()`
- Upsert par nom : si un CV portant le même nom existe déjà → retourne l'existant (pas de doublon)
- Crée un `CV` avec `filepath=""`, `file_type="txt"` (pas de fichier physique)
- Frontend : icône 📋 + tag "Importé depuis CV" dans la CVCard, panneau latéral dans AnalysisPage

---

## 17. Bouton email dans HistoryPage

Chaque ligne de l'historique a un bouton 📧 :
- `handleSendAlert(e)` → `POST /api/alerts/send/{id}` via `sendMatchAlert()`
- États : `sendingMail` (spinner Loader), `mailSent` (icône CheckCircle, 4s), `mailError` (message inline)
- `e.stopPropagation()` pour ne pas toggler l'accordéon

---

## 18. AlertsDrawer — statut email

L'AlertsDrawer affiche maintenant un bandeau statut email :
- `fetchAlertStatus()` → `GET /api/alerts/status` (chargé à l'ouverture)
- Si email configuré : texte vert `"Alertes email actives (≥ N%)"` avec icône Mail teal
- Sinon : texte grisé + bouton "Configurer" → navigate('/settings')
- Le filtre des matches utilise `alertStatus.score_threshold` (dynamique, plus hardcodé à 80)

---

## 19. Backlog restant

### Priorité haute
1. Pandoc : installer → `sudo apt install pandoc` (export DOCX réel)

### Priorité moyenne
2. Dashboard KPIs réels (partiellement mockés)
3. Scraper Wellfound
4. Packaging `.deb` v1.0.1 rebuild avec tous les correctifs

### Priorité basse
5. Export JSON Resume (format ATS)
6. Mode batch scoring (scorer toutes les offres en 1 clic)

---

## 21. CV ATS — architecture (session 15)

**Endpoint génération** : `POST /api/cv-matching/generate-ats` → appel Ollama avec prompt renforcé, retourne `ATSResult` (non sauvegardé).

**Endpoint sauvegarde** : `POST /api/cv-matching/save-ats` → reçoit l'ATSResult du frontend, sauvegarde en base sans appel Ollama supplémentaire.

**Modèle `generated_cvs`** — 5 colonnes ATS (nullable) :
```
is_ats               BOOLEAN  — true si mode ATS
ats_total            REAL     — score global 0-100
ats_score_json       TEXT     — JSON ATSScore {score_keywords, score_experience, …}
ats_keywords_json    TEXT     — JSON list[KeywordGap]
ats_suggestions_json TEXT     — JSON list[str]
```

**Migration** : `python scripts/migrate_add_ats_fields.py`

**Frontend** :
- Bouton `CV ATS` (teal) → déclenche `/generate-ats`
- `ATSPanel` avec 3 onglets : CV généré (diff), Score ATS (jauge + barres), Mots-clés (tableau présents/manquants)
- Bouton `Sauvegarder` dans l'ATSPanel → appelle `saveATSCV()` → `/save-ats`
- Sélection depuis l'historique d'un CV ATS → restaure l'`ATSPanel` via `atsResultFromFull()`
- Badge `ATS 82` dans les cartes historique (couleur selon score)

**Prompt ATS renforcé** :
- Obligation absolue de reformuler chaque bullet point des expériences pertinentes
- Keyword mirroring : utiliser EXACTEMENT les termes de l'offre
- Exemples concrets de reformulation dans le prompt
- `num_predict: 4000` (vs 2500 pour le standard)

---


- CSS Modules, `var(--tertiary)` = couleur IA uniquement
- `write_file` pour réécrire un fichier entier (jamais d'édition partielle)
- `postEmptyAI` pour endpoints sans body JSON + timeout 10min
- Ollama ≥ 0.5 : toujours `format="json"` dans `client.generate()` pour les endpoints JSON
- Snapshots obligatoires dans les modèles liés (job_title, cv_name, source_cv_text…)
- Proxies résidentiels : format `IP:PORT:USER:PASS`, rotation round-robin, retrait si défaillant
- Email : envoi async `asyncio.create_task` pour ne pas bloquer l'API
- Tri offres : toujours `sort_by=scraped_at&sort_order=desc&limit=200` dans les selects inter-pages
