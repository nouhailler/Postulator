"""
app/api/routes/esco.py
Proxy backend pour l'API REST publique ESCO (European Skills, Competences, Qualifications and Occupations).
Contourne le blocage CORS de esco.ec.europa.eu côté browser.

Routes :
  GET /api/esco/search?q=python&lang=fr&limit=12  → recherche unifiée métiers + compétences
  GET /api/esco/occupation/{uri_encoded}           → détail d'une profession (skills associées)
"""
import urllib.parse
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

router = APIRouter(prefix="/esco", tags=["ESCO"])

ESCO_BASE = "https://esco.ec.europa.eu/api"
TIMEOUT   = 8.0   # secondes


# ── Schémas ───────────────────────────────────────────────────────────────────

class ESCOItem(BaseModel):
    label:    str
    type:     str   # "occupation" | "skill"
    uri:      str
    description: Optional[str] = None


class ESCOSearchResult(BaseModel):
    items: list[ESCOItem]
    total: int


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/search", response_model=ESCOSearchResult)
async def esco_search(
    q:     str = Query(..., min_length=2, description="Termes de recherche"),
    lang:  str = Query("fr", description="Langue : fr, en, de…"),
    limit: int = Query(12, ge=1, le=30),
):
    """
    Recherche dans le dictionnaire ESCO (métiers + compétences).
    Appel côté serveur pour éviter les restrictions CORS du browser.
    """
    occ_limit   = min(limit, 8)
    skill_limit = min(limit - occ_limit, 6)

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        results: list[ESCOItem] = []

        # ── Professions / Métiers ─────────────────────────────────────────────
        try:
            resp = await client.get(
                f"{ESCO_BASE}/resource/occupation",
                params={
                    "language": lang,
                    "text":     q,
                    "limit":    occ_limit,
                    "isInScheme": "http://data.europa.eu/esco/concept-scheme/occupations",
                },
                headers={"Accept": "application/json"},
            )
            if resp.status_code == 200:
                data = resp.json()
                for item in data.get("_embedded", {}).get("results", []):
                    results.append(ESCOItem(
                        label=item.get("title") or item.get("preferredLabel") or "",
                        type="occupation",
                        uri=item.get("uri", ""),
                        description=item.get("description"),
                    ))
        except httpx.RequestError:
            pass  # ESCO temporairement indisponible → on continue avec les compétences

        # ── Compétences / Skills ──────────────────────────────────────────────
        if skill_limit > 0:
            try:
                resp = await client.get(
                    f"{ESCO_BASE}/resource/skill",
                    params={
                        "language": lang,
                        "text":     q,
                        "limit":    skill_limit,
                    },
                    headers={"Accept": "application/json"},
                )
                if resp.status_code == 200:
                    data = resp.json()
                    for item in data.get("_embedded", {}).get("results", []):
                        results.append(ESCOItem(
                            label=item.get("title") or item.get("preferredLabel") or "",
                            type="skill",
                            uri=item.get("uri", ""),
                            description=item.get("description"),
                        ))
            except httpx.RequestError:
                pass

    # Filtrer les items sans label
    results = [r for r in results if r.label.strip()]

    return ESCOSearchResult(items=results, total=len(results))
