# CLAUDE.md – Postulator Frontend

## Projet
Application web React (Vite) pour **Postulator** – agrégateur de recherche d'emploi
avec IA locale (Ollama).

## Stack
- React 18 + Vite 5
- React Router DOM v6 (routes : `/dashboard`, `/scrapers`, `/analysis`, `/board`)
- Recharts (graphiques)
- Lucide React (icônes)
- CSS Modules (un `.module.css` par composant, jamais de CSS global sauf `design-system.css`)

## Design System – "The Command Center"
Fichier de référence : `src/styles/design-system.css`

### Règles absolues
- **Pas de bordures 1px** pour séparer les sections → utiliser les décalages de background
- **Couleur tertiaire `#3cddc7`** → réservée exclusivement aux features IA / Ollama
- **Font headlines** : Manrope (`var(--font-headline)`)
- **Font body/data** : Inter (`var(--font-body)`)
- **Pas de noir pur** → surface minimale = `#0b1326` (`var(--surface)`)
- Le bouton primaire utilise le gradient `linear-gradient(135deg, var(--primary), var(--primary-container))`

### Variables CSS principales
```
--surface               #0b1326
--surface-container-low #131b2e
--surface-container     #171f33
--primary               #7bd0ff
--tertiary              #3cddc7
--on-surface            #dae2fd
--outline               #88929b
```

## Structure fichiers
```
src/
├── App.jsx                    ← Router principal
├── main.jsx                   ← Entry point
├── styles/
│   └── design-system.css      ← Tokens CSS + utilitaires globaux
├── data/
│   └── mockData.js            ← Données fictives (remplacer par appels API)
├── components/
│   ├── layout/
│   │   ├── AppLayout.jsx/.module.css
│   │   ├── TopBar.jsx/.module.css
│   │   └── SideBar.jsx/.module.css
│   └── dashboard/
│       ├── KpiCard.jsx/.module.css
│       ├── IngestionChart.jsx/.module.css  ← Recharts BarChart
│       ├── RecentLogs.jsx/.module.css
│       └── JobCard.jsx/.module.css
└── pages/
    ├── DashboardPage.jsx/.module.css  ← Page principale implémentée
    ├── ScrapersPage.jsx               ← Stub
    ├── AnalysisPage.jsx               ← Stub
    ├── BoardPage.jsx                  ← Stub (Kanban skeleton)
    └── PlaceholderPage.module.css     ← CSS partagé stubs
```

## Backend (à venir)
- API FastAPI sur `http://localhost:8000`
- Proxy Vite configuré : `/api` → `http://localhost:8000`
- Remplacer `src/data/mockData.js` par des appels `fetch('/api/...')`

## Commandes
```bash
cd frontend
npm install
npm run dev     # http://localhost:5173
npm run build
```

## Conventions
- Nommage composants : PascalCase
- CSS Modules : `.module.css` systématique, jamais de `style={{}}` sauf exceptions
- `write_file` pour réécrire un fichier entier (pas d'édition partielle)
- `read_multiple_files` pour charger plusieurs fichiers en batch
