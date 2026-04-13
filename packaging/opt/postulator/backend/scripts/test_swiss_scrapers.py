#!/usr/bin/env python3
"""
Script de diagnostic des scrapers suisses.
Lance depuis le venv backend :
  cd /home/patrick/Documents/Claude/Projects/Postulator/backend
  source .venv/bin/activate
  python scripts/test_swiss_scrapers.py
"""
import httpx
import json

HEADERS_BROWSER = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
    "Accept": "application/json, text/html, */*",
    "Accept-Language": "fr-CH,fr;q=0.9,en;q=0.8",
}

def test(name, url, params=None, headers=None):
    h = {**HEADERS_BROWSER, **(headers or {})}
    try:
        r = httpx.get(url, params=params, headers=h, timeout=15, follow_redirects=True)
        print(f"\n{'='*60}")
        print(f"[{name}] {r.url}")
        print(f"  Status : {r.status_code}")
        print(f"  Content-Type : {r.headers.get('content-type','?')}")
        if r.status_code == 200:
            try:
                data = r.json()
                keys = list(data.keys()) if isinstance(data, dict) else f"list[{len(data)}]"
                print(f"  JSON keys : {keys}")
                # Afficher un extrait
                text = json.dumps(data, ensure_ascii=False)[:600]
                print(f"  Aperçu : {text}")
            except Exception:
                print(f"  Pas du JSON — texte : {r.text[:300]}")
        else:
            print(f"  Body : {r.text[:200]}")
    except Exception as e:
        print(f"\n[{name}] ERREUR : {type(e).__name__} : {e}")

print("=" * 60)
print("DIAGNOSTIC SCRAPERS SUISSES")
print("=" * 60)

# ─── JOBUP.CH ────────────────────────────────────────────────
print("\n\n>>> JOBUP.CH")

# API v1 supposée (notre code actuel)
test("jobup api/v1", "https://www.jobup.ch/api/v1/jobs/search/",
     params={"term": "python", "sort": "date"})

# Autres endpoints possibles
test("jobup en-tete page", "https://www.jobup.ch/fr/emplois/",
     params={"term": "python"},
     headers={"Accept": "text/html"})

# API search directe
test("jobup search-api", "https://www.jobup.ch/fr/emplois/?term=python",
     headers={"Accept": "application/json, */*", "X-Requested-With": "XMLHttpRequest"})

# API candidats
test("jobup candidate-api", "https://www.jobup.ch/api/candidate/v1/jobs/",
     params={"q": "python"})

# jobcloud API (opérateur de jobup)
test("jobcloud api", "https://api.jobcloud.ch/v1/jobs/search",
     params={"term": "python"})

# ─── JOBS.CH ────────────────────────────────────────────────
print("\n\n>>> JOBS.CH")

# API v1 supposée (notre code actuel)
test("jobsch api/v1/public/search", "https://www.jobs.ch/api/v1/public/search/",
     params={"term": "python", "per_page": 5})

# Autres endpoints possibles
test("jobsch api/v2", "https://www.jobs.ch/api/v2/jobs/",
     params={"q": "python"})

test("jobsch search", "https://www.jobs.ch/fr/offres-emploi/",
     params={"term": "python"},
     headers={"Accept": "application/json, */*", "X-Requested-With": "XMLHttpRequest"})

# Axel Springer API
test("jobsch axel", "https://api.jobs.ch/v1/search",
     params={"query": "python"})

# ─── JOBTEASER ───────────────────────────────────────────────
print("\n\n>>> JOBTEASER")

# API supposée (notre code actuel)
test("jobteaser api public", "https://api.jobteaser.com/fr/public/jobs/search",
     params={"q": "python", "limit": 5})

# Autres endpoints
test("jobteaser api v2", "https://api.jobteaser.com/fr/jobs",
     params={"q": "python"})

test("jobteaser careers", "https://www.jobteaser.com/api/v1/jobs",
     params={"q": "python"})

test("jobteaser public2", "https://api.jobteaser.com/public/v1/jobs/search",
     params={"q": "python"})

# API GraphQL ?
test("jobteaser graphql", "https://api.jobteaser.com/graphql",
     headers={"Content-Type": "application/json"},
     params={"query": "{ jobs(q: \"python\") { id title } }"})

print("\n\n>>> FIN DU DIAGNOSTIC")
print("Copiez/collez les résultats pour analyser les bons endpoints.")
