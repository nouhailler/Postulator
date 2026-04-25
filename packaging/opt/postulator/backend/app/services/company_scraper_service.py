"""
app/services/company_scraper_service.py

Service de scraping des sites carrières des entreprises.

Pipeline :
  1. Découverte URL  : DuckDuckGo + LLM pour identifier la page carrières
  2. Détection ATS   : Greenhouse, Lever, Ashby, SmartRecruiters…
  3. Scraping ATS    : API publiques pour les ATS connus
  4. Scraping custom : Playwright (optionnel) ou httpx + BeautifulSoup + LLM
  5. Sauvegarde DB   : Insertion comme Job normaux (déduplication par content_hash)
"""
from __future__ import annotations

import asyncio
import json
import random
import re
import unicodedata
from datetime import datetime
from typing import Optional
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup
from loguru import logger

# ── ATS Detection ─────────────────────────────────────────────────────────────

ATS_PATTERNS: dict[str, list[str]] = {
    "greenhouse":      [r"boards\.greenhouse\.io/([a-zA-Z0-9_-]+)"],
    "lever":           [r"jobs\.lever\.co/([a-zA-Z0-9_-]+)"],
    "workday":         [r"([a-zA-Z0-9_-]+)\.wd\d+\.myworkdayjobs\.com",
                        r"([a-zA-Z0-9_-]+)\.myworkday\.com"],
    "taleo":           [r"([a-zA-Z0-9_-]+)\.taleo\.net"],
    "icims":           [r"([a-zA-Z0-9_-]+)\.icims\.com"],
    "smartrecruiters": [r"careers\.smartrecruiters\.com/([a-zA-Z0-9_-]+)"],
    "ashby":           [r"jobs\.ashbyhq\.com/([a-zA-Z0-9_-]+)"],
    "bamboohr":        [r"([a-zA-Z0-9_-]+)\.bamboohr\.com"],
    "teamtailor":      [r"([a-zA-Z0-9_-]+)\.teamtailor\.com"],
    "recruitee":       [r"([a-zA-Z0-9_-]+)\.recruitee\.com"],
    "welcometothejungle": [r"welcome\.to\.the\.jungle\.com/companies/([a-zA-Z0-9_-]+)",
                           r"welcometothejungle\.com/(?:fr/)?companies/([a-zA-Z0-9_-]+)"],
}

CAREERS_KEYWORDS = ["careers", "emplois", "jobs", "recrutement", "join", "work-with-us",
                    "offres", "postes", "vacancies", "openings", "talent"]


def detect_ats(url: str) -> tuple[str, Optional[str]]:
    """Détecte le type d'ATS et le slug depuis une URL. Retourne (ats_type, slug)."""
    for ats_type, patterns in ATS_PATTERNS.items():
        for pattern in patterns:
            m = re.search(pattern, url, re.IGNORECASE)
            if m:
                slug = m.group(1) if m.lastindex and m.lastindex >= 1 else None
                return ats_type, slug
    return "custom", None


# ── Proxy & Headers ───────────────────────────────────────────────────────────

def _fake_headers() -> dict:
    return {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
    }


def _format_proxy(line: str) -> Optional[str]:
    """Convertit IP:PORT:USER:PASS ou IP:PORT en URL httpx."""
    parts = line.strip().split(":")
    if len(parts) == 4:
        ip, port, user, pwd = parts
        return f"http://{user}:{pwd}@{ip}:{port}"
    if len(parts) == 2:
        ip, port = parts
        return f"http://{ip}:{port}"
    return None


def _pick_proxy(proxies: list[str] | None) -> Optional[str]:
    if not proxies:
        return None
    sample = random.sample(proxies, min(3, len(proxies)))
    for p in sample:
        fmt = _format_proxy(p)
        if fmt:
            return fmt
    return None


# ── DuckDuckGo ────────────────────────────────────────────────────────────────

def _ddgs_import():
    """Importe DDGS depuis ddgs (nouveau) ou duckduckgo_search (ancien) en fallback."""
    try:
        from ddgs import DDGS
        return DDGS, None
    except ImportError:
        pass
    try:
        from duckduckgo_search import DDGS
        return DDGS, None
    except ImportError:
        return None, "ddgs non installé — pip install ddgs"


def _ddg_sync_full(query: str, max_results: int = 10) -> tuple[list[dict], Optional[str]]:
    """Retourne (résultats complets avec title+url+snippet, erreur|None)."""
    DDGS, err = _ddgs_import()
    if err:
        return [], err
    try:
        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=max_results))
            return [
                {
                    "url":     r.get("href", ""),
                    "title":   r.get("title", ""),
                    "snippet": r.get("body", ""),
                }
                for r in results if r.get("href")
            ], None
    except Exception as exc:
        return [], str(exc)


def _ddg_sync(query: str, max_results: int = 10) -> tuple[list[str], Optional[str]]:
    """Retourne (urls, error_msg|None)."""
    DDGS, err = _ddgs_import()
    if err:
        return [], err
    try:
        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=max_results))
            return [r["href"] for r in results if r.get("href")], None
    except Exception as exc:
        return [], str(exc)


async def _ddg_search(query: str, max_results: int = 10) -> tuple[list[str], Optional[str]]:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, lambda: _ddg_sync(query, max_results))


# ── LLM ───────────────────────────────────────────────────────────────────────

async def _call_llm(prompt: str, ai_key: Optional[str] = None, ai_model: Optional[str] = None) -> str:
    if ai_key and ai_model:
        return await _openrouter(prompt, ai_key, ai_model)
    return await _ollama(prompt, ai_model)


async def _openrouter(prompt: str, api_key: str, model: str) -> str:
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={"model": model, "messages": [{"role": "user", "content": prompt}], "max_tokens": 2000},
        )
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"]


async def _ollama(prompt: str, model: Optional[str] = None) -> str:
    from app.core.config import get_settings
    m = model or get_settings().ollama_model
    try:
        import ollama as _ollama_lib
        resp = _ollama_lib.chat(model=m, messages=[{"role": "user", "content": prompt}])
        return resp["message"]["content"]
    except Exception as exc:
        raise RuntimeError(f"Ollama indisponible: {exc}") from exc


# ── URL Discovery ─────────────────────────────────────────────────────────────

# Top 10 candidats ordonnés par probabilité décroissante.
# Chaque entrée : ("subdomain" | "path_www" | "path_bare", valeur)
# On teste EXACTEMENT ces 10 combinaisons pour un domaine donné.
PROBE_TOP10: list[tuple[str, str]] = [
    ("subdomain",  "careers"),          # careers.nestle.com
    ("subdomain",  "jobs"),             # jobs.nestle.com
    ("path_www",   "/jobs"),            # www.nestle.com/jobs
    ("path_www",   "/careers"),         # www.nestle.com/careers
    ("path_www",   "/en/careers"),      # www.nestle.com/en/careers
    ("path_www",   "/emplois"),         # www.nestle.com/emplois
    ("path_www",   "/en/jobs"),         # www.nestle.com/en/jobs
    ("path_www",   "/recrutement"),     # www.nestle.com/recrutement
    ("path_www",   "/offres-emploi"),   # www.nestle.com/offres-emploi
    ("subdomain",  "talent"),           # talent.nestle.com
]

# Mots-clés dans le corps d'une page → CAPTCHA / protection bot
CAPTCHA_BODY_MARKERS = [
    "captcha", "recaptcha", "hcaptcha",
    "cf-challenge", "ddos-guard",
    "please verify", "are you human", "bot detection",
    "enable javascript", "checking your browser",
]

# Headers HTTP indiquant un blocage Cloudflare ou WAF (la page EXISTE)
CAPTCHA_HEADER_KEYS = {"cf-mitigated", "cf-ray", "x-sucuri-id", "x-ddos-guard"}


def _normalize_search_query(text: str) -> str:
    """Supprime les accents et caractères spéciaux pour DDG (Nestlé → Nestle)."""
    nfkd = unicodedata.normalize("NFKD", text)
    return "".join(c for c in nfkd if not unicodedata.combining(c))

# ── Rate tracker CAPTCHA (module-level) ───────────────────────────────────────
_probe_stats: dict = {"ok": 0, "captcha": 0, "notfound": 0, "error": 0}


def _captcha_rate() -> float:
    total = sum(_probe_stats.values())
    return _probe_stats["captcha"] / total if total > 0 else 0.0


async def _probe_url(url: str, proxy: Optional[str] = None) -> str:
    """
    Sonde une URL et retourne le statut :
      "ok"       → page accessible (2xx/3xx)
      "captcha"  → protection bot détectée (Cloudflare, CAPTCHA…) — la page EXISTE !
      "notfound" → 404 ou redirect vers page d'erreur
      "error"    → timeout, connexion refusée, DNS, etc.

    Détection bot/CAPTCHA (par ordre de priorité) :
      1. Headers Cloudflare (cf-ray, cf-mitigated) ou WAF → captcha
      2. Status 429 (rate-limit) → captcha
      3. Status 403 → captcha (la page existe, accès refusé aux robots)
      4. Corps HTML contenant des marqueurs CAPTCHA → captcha
    """
    global _probe_stats
    try:
        async with httpx.AsyncClient(
            proxy=proxy, timeout=10, follow_redirects=True,
            headers=_fake_headers(),
        ) as client:

            # ── HEAD rapide ────────────────────────────────────────────────────
            try:
                r = await client.head(url)
            except Exception:
                r = None

            if r is not None:
                # Headers WAF/Cloudflare = page existe mais protégée
                resp_headers_lower = {k.lower() for k in r.headers}
                if resp_headers_lower & CAPTCHA_HEADER_KEYS:
                    _probe_stats["captcha"] += 1
                    return "captcha"
                if r.status_code == 429:
                    _probe_stats["captcha"] += 1
                    return "captcha"
                if r.status_code == 403:
                    # 403 = interdit aux robots, la page existe
                    _probe_stats["captcha"] += 1
                    return "captcha"
                if r.status_code < 400:
                    _probe_stats["ok"] += 1
                    return "ok"

            # ── GET si HEAD échoue ou retourne autre 4xx/5xx ─────────────────
            r = await client.get(url)

            # Headers WAF sur GET
            resp_headers_lower = {k.lower() for k in r.headers}
            if resp_headers_lower & CAPTCHA_HEADER_KEYS:
                _probe_stats["captcha"] += 1
                return "captcha"

            if r.status_code == 429:
                _probe_stats["captcha"] += 1
                return "captcha"

            if r.status_code == 403:
                _probe_stats["captcha"] += 1
                return "captcha"

            if r.status_code == 404:
                _probe_stats["notfound"] += 1
                return "notfound"

            # 200/301/302/503 → analyser le corps
            body_lower = r.text[:4000].lower()
            if any(m in body_lower for m in CAPTCHA_BODY_MARKERS):
                _probe_stats["captcha"] += 1
                return "captcha"

            if r.status_code < 400:
                _probe_stats["ok"] += 1
                return "ok"

            # Autres 5xx sans marqueurs clairs → notfound par défaut
            _probe_stats["notfound"] += 1
            return "notfound"

    except Exception:
        _probe_stats["error"] += 1
        return "error"


def _extract_root_domain(url: str) -> Optional[str]:
    """Extrait le domaine racine (sans www ni sous-domaines carrières)."""
    try:
        netloc = urlparse(url).netloc
        if not netloc:
            return None
        for prefix in ("www.", "careers.", "jobs.", "talent.", "apply.", "recrutement.", "emplois."):
            if netloc.lower().startswith(prefix):
                netloc = netloc[len(prefix):]
                break
        return netloc.lower() or None
    except Exception:
        return None


def _build_probe_candidates(domain: str) -> list[str]:
    """Construit exactement 10 URLs à sonder, ordonnées par probabilité."""
    d = domain.strip().lstrip("www.").rstrip("/")
    candidates: list[str] = []
    for kind, value in PROBE_TOP10:
        if kind == "subdomain":
            candidates.append(f"https://{value}.{d}")
        elif kind == "path_www":
            candidates.append(f"https://www.{d}{value}")
        elif kind == "path_bare":
            candidates.append(f"https://{d}{value}")
    return candidates


async def _probe_direct(
    domain: str,
    proxy: Optional[str],
    log: "callable",
    label: str = "Sonde directe",
) -> tuple[Optional[str], bool]:
    """
    Sonde les 10 variantes prioritaires sur un domaine.
    Retourne (url_trouvée | None, is_captcha).

    Stratégie :
    - Un "ok" → retourné immédiatement (réponse certaine).
    - Un "captcha" (Cloudflare/WAF) → Cloudflare bloque TOUS les paths d'un domaine
      de la même façon, donc on NE s'arrête PAS : on teste toutes les variantes
      et on retourne la première selon la priorité PROBE_TOP10 (/jobs avant /careers).
    - Si tout est captcha, on retourne le premier de la liste de priorité.
    """
    candidates = _build_probe_candidates(domain)
    rate = _captcha_rate()

    log("info", f"🔍 {label} sur {domain} : {len(candidates)} variantes prioritaires"
        + (f" (⚠️ taux CAPTCHA session : {rate:.0%})" if rate > 0.10 else ""))

    # Si trop de CAPTCHAs en session, on ralentit
    inter_delay = 2.0 if rate > 0.10 else 0.3

    first_captcha: Optional[str] = None  # meilleure URL captcha (première dans la liste = plus prioritaire)

    for url in candidates:
        if inter_delay > 0.5:
            log("warn", f"   ⏳ Pause anti-CAPTCHA {inter_delay:.0f}s…")
            await asyncio.sleep(inter_delay)

        status = await _probe_url(url, proxy)

        if status == "ok":
            log("ok", f"   ✅ Répond : {url}")
            return url, False

        elif status == "captcha":
            # On continue — Cloudflare bloque tout le domaine pareil,
            # on veut trouver la variante la plus probable (/jobs > /careers)
            if first_captcha is None:
                first_captcha = url
            log("debug", f"   🤖 protégé (WAF/403) : {url}")

        elif status == "notfound":
            log("debug", f"   ✗ 404 : {url}")

        else:
            log("debug", f"   ✗ erreur réseau : {url}")

    if first_captcha:
        rate_now = _captcha_rate()
        log("warn",
            f"   🤖 Site protégé par WAF/Cloudflare sur {domain} — "
            f"toutes les variantes retournent 403. "
            f"URL retenue (priorité liste) : {first_captcha}")
        if rate_now > 0.10:
            log("warn", f"   ⚠️  Taux CAPTCHA session : {rate_now:.0%} — débit réduit automatiquement")
        return first_captcha, True

    log("warn", f"   ⚠️  Aucune des {len(candidates)} variantes ne répond sur {domain}")
    return None, False


async def discover_careers_url(
    company_name: str,
    domain: Optional[str] = None,
    proxies: list[str] | None = None,
    ai_key: Optional[str] = None,
    ai_model: Optional[str] = None,
    log_cb: Optional["callable"] = None,
) -> dict:
    """
    Découvre la page carrières d'une entreprise.
    Pipeline :
      0. Sonde directe (domain/careers, careers.domain, …) si domaine fourni
      1. LLM en premier (si configuré) — connaissance directe pour les grandes entreprises
      2. DuckDuckGo avec requêtes courtes et simples (un mot-clé à la fois)
      3. Détection ATS dans les résultats DDG
      4. LLM pour choisir parmi les candidats DDG (si pas encore utilisé)
      5. Heuristique sur mots-clés
    Retourne : {url, ats_type, ats_slug, candidates, logs, method}
    """
    logs_list: list[dict] = []

    def log(level: str, msg: str) -> None:
        logs_list.append({"level": level, "msg": msg})
        logger.info(f"[Company] {msg}")
        if log_cb:
            log_cb(level, msg)

    log("info", f"🏢 Découverte URL pour « {company_name} »" + (f" (domaine : {domain})" if domain else ""))

    proxy = _pick_proxy(proxies)
    all_candidates: list[str] = []
    llm_used = False

    def _found(url: str, method: str, candidates: list) -> dict:
        ats_type, ats_slug = detect_ats(url)
        note = f" (ATS : {ats_type})" if ats_type != "custom" else ""
        log("ok", f"🎯 URL retenue{note} → {url}")
        return {"url": url, "ats_type": ats_type, "ats_slug": ats_slug,
                "candidates": candidates, "logs": logs_list, "method": method}

    # ── Étape 0 : Sonde directe si domaine fourni ─────────────────────────────
    if domain:
        probed, is_captcha = await _probe_direct(domain, proxy, log, label="Sonde domaine")
        if probed:
            return _found(probed, "direct_probe" if not is_captcha else "direct_probe_captcha", [probed])

    # ── Étape 1 : LLM en premier (connaissance intrinsèque) ───────────────────
    if ai_key or ai_model:
        engine = f"OpenRouter ({ai_model})" if ai_key else f"Ollama ({ai_model or 'défaut'})"
        log("info", f"🤖 Interrogation LLM ({engine}) — connaissance directe de l'entreprise…")
        llm_used = True
        try:
            domain_hint = f" (domain: {domain})" if domain else ""
            prompt = (
                f"What is the official careers / jobs page URL for the company « {company_name} »{domain_hint}?\n\n"
                f"Rules:\n"
                f"- Reply with ONE URL only, no explanation, no quotes\n"
                f"- Must be the direct careers page (e.g. https://www.nestle.com/jobs)\n"
                f"- If you are not sure, reply: UNKNOWN\n"
                f"- Do NOT invent a URL if you don't know it"
            )
            answer = (await _call_llm(prompt, ai_key, ai_model)).strip()
            log("info", f"   LLM répond : {answer[:150]}")

            llm_url = None
            for line in answer.split("\n"):
                line = line.strip(" -\"'`[]()<>")
                if line.startswith("http"):
                    llm_url = line
                    break

            if llm_url and "UNKNOWN" not in answer.upper():
                log("info", f"   Sonde de validation : {llm_url}")
                status = await _probe_url(llm_url, proxy)
                if status == "ok":
                    return _found(llm_url, "llm_direct", [llm_url])
                else:
                    # "captcha" ou "notfound" → dans les deux cas, on sonde le domaine complet.
                    # Cloudflare bloque tous les paths pareil : /careers et /jobs donnent tous les deux 403.
                    # La sonde complète testera /jobs, /careers, etc. dans l'ordre de priorité
                    # et retournera le premier "ok", ou à défaut le premier "captcha" selon la priorité.
                    reason = "protégé WAF" if status == "captcha" else "introuvable"
                    llm_domain = _extract_root_domain(llm_url)
                    log("warn", f"⚠️  URL LLM {reason} ({llm_url}) — sonde complète du domaine {llm_domain}…")
                    if llm_domain:
                        probed, is_captcha = await _probe_direct(
                            llm_domain, proxy, log, label="Sonde domaine LLM")
                        if probed:
                            return _found(probed,
                                          "llm_domain_probe_captcha" if is_captcha else "llm_domain_probe",
                                          [probed])
                    all_candidates.append(llm_url)
                    log("info", "   Poursuite avec DuckDuckGo…")
            else:
                log("warn", "⚠️  LLM ne connaît pas l'URL — poursuite avec DDG")
        except Exception as exc:
            log("error", f"❌ LLM error : {exc}")

    # ── Étape 2 : DuckDuckGo avec requêtes courtes (un mot-clé à la fois) ─────
    # DDG ne gère pas bien les accents → on normalise (Nestlé → Nestle)
    name_normalized = _normalize_search_query(company_name)
    name_ddg = name_normalized if name_normalized != company_name else company_name

    # "careers" en premier : DDG le gère mieux que "jobs" pour les entreprises
    keywords = ["careers", "jobs", "emplois", "recrutement"]
    queries = (
        [f"{name_ddg} site:{domain}"] + [f"{name_ddg} {kw}" for kw in keywords[:2]]
        if domain else
        [f"{name_ddg} {kw}" for kw in keywords]
    )
    if name_ddg != company_name:
        log("info", f"🔤 Normalisation : « {company_name} » → « {name_ddg} » (accents supprimés pour DDG)")

    log("info", f"🦆 DuckDuckGo — {len(queries)} requêtes courtes…")
    for query in queries:
        log("info", f"   Query : « {query} »")
        urls, err = await _ddg_search(query, max_results=6)
        if err:
            log("error", f"   → ❌ DDG erreur : {err}")
        elif urls:
            new = [u for u in urls if u not in all_candidates]
            log("ok" if new else "info",
                f"   → {len(urls)} résultat(s)" + (f" ({len(new)} nouveaux)" if new else ""))
            for u in urls:
                log("debug", f"      • {u}")
                if u not in all_candidates:
                    all_candidates.append(u)
        else:
            log("warn", "   → 0 résultat (DDG vide ou rate-limited)")
        if len(all_candidates) >= 20:
            break

    log("info", f"📋 Total candidats DDG : {len(all_candidates)}")

    if not all_candidates:
        log("error", "❌ Aucun résultat DDG — rate-limited ou entreprise introuvable")
        log("info", "💡 Ajoutez le domaine (ex: nestle.com) pour activer la sonde directe")
        return {"url": None, "ats_type": "unknown", "ats_slug": None,
                "candidates": [], "logs": logs_list, "method": "none"}

    # ── Étape 2b : Sonde des domaines extraits des résultats DDG ──────────────
    seen_domains: set[str] = set()
    if domain:
        seen_domains.add(_extract_root_domain(f"https://{domain}") or "")
    domains_to_probe: list[str] = []
    for u in all_candidates:
        d = _extract_root_domain(u)
        if d and d not in seen_domains:
            seen_domains.add(d)
            domains_to_probe.append(d)
        if len(domains_to_probe) >= 3:
            break

    if domains_to_probe:
        log("info", f"🔍 Sonde des domaines DDG : {', '.join(domains_to_probe)}")
        for d in domains_to_probe:
            probed, is_captcha = await _probe_direct(d, proxy, log, label=f"Sonde {d}")
            if probed:
                return _found(probed,
                              "ddg_domain_probe_captcha" if is_captcha else "ddg_domain_probe",
                              all_candidates)

    # ── Étape 3 : ATS connu directement dans les URLs DDG ────────────────────
    log("info", "🔎 Détection ATS dans les résultats DDG…")
    for url in all_candidates:
        ats_type, ats_slug = detect_ats(url)
        if ats_type != "custom":
            log("ok", f"✅ ATS {ats_type} détecté → {url}")
            return {"url": url, "ats_type": ats_type, "ats_slug": ats_slug,
                    "candidates": all_candidates, "logs": logs_list, "method": "ats_known"}
    log("info", "   Aucun ATS connu détecté")

    # ── Étape 4 : LLM choisit parmi les candidats DDG (si pas encore utilisé) ─
    careers_urls = [u for u in all_candidates if any(kw in u.lower() for kw in CAREERS_KEYWORDS)]
    pool = careers_urls[:10] if careers_urls else all_candidates[:10]
    log("info", f"🔗 {len(pool)} URL(s) dans le pool de sélection finale")

    if pool and not llm_used and (ai_key or ai_model):
        engine = f"OpenRouter ({ai_model})" if ai_key else f"Ollama ({ai_model or 'défaut'})"
        log("info", f"🤖 LLM ({engine}) — sélection parmi candidats DDG…")
        try:
            url_list = "\n".join(f"- {u}" for u in pool)
            prompt = (
                f"Here are URLs found for the company « {company_name} ».\n"
                f"Which one is the main careers/jobs page?\n\n"
                f"{url_list}\n\n"
                f"Reply ONLY with the exact chosen URL (one line, no explanation, no quotes)."
            )
            answer = await _call_llm(prompt, ai_key, ai_model)
            log("info", f"   LLM répond : {answer.strip()[:120]}")
            for line in answer.strip().split("\n"):
                line = line.strip(" -\"'`")
                if line.startswith("http"):
                    return _found(line, "llm_pick", all_candidates)
            log("warn", "⚠️  LLM n'a pas retourné d'URL valide")
        except Exception as exc:
            log("error", f"❌ LLM error : {exc}")

    # ── Étape 5 : Heuristique ─────────────────────────────────────────────────
    if careers_urls:
        return _found(careers_urls[0], "heuristic", all_candidates)

    log("error", "❌ Aucune URL carrières trouvée")
    log("info", "💡 Ajoutez le domaine (ex: nestle.com) pour activer la sonde directe")
    return {"url": None, "ats_type": "unknown", "ats_slug": None,
            "candidates": all_candidates, "logs": logs_list, "method": "none"}


# ── ATS Scrapers ──────────────────────────────────────────────────────────────

async def scrape_greenhouse(slug: str, proxies: list[str] | None = None) -> list[dict]:
    url = f"https://boards.greenhouse.io/v1/boards/{slug}/jobs?content=true"
    proxy = _pick_proxy(proxies)
    async with httpx.AsyncClient(proxy=proxy, timeout=30, follow_redirects=True) as client:
        r = await client.get(url, headers={"User-Agent": _fake_headers()["User-Agent"]})
        r.raise_for_status()
        data = r.json()
    return [
        {
            "title": j.get("title", ""),
            "location": (j.get("location") or {}).get("name") or "",
            "url": j.get("absolute_url") or "",
            "description": (j.get("content") or "")[:3000],
        }
        for j in data.get("jobs", [])
    ]


async def scrape_lever(slug: str, proxies: list[str] | None = None) -> list[dict]:
    url = f"https://api.lever.co/v0/postings/{slug}?mode=json"
    proxy = _pick_proxy(proxies)
    async with httpx.AsyncClient(proxy=proxy, timeout=30, follow_redirects=True) as client:
        r = await client.get(url, headers={"User-Agent": _fake_headers()["User-Agent"]})
        r.raise_for_status()
        data = r.json()
    jobs = data if isinstance(data, list) else []
    results = []
    for j in jobs:
        cats = j.get("categories") or {}
        loc = cats.get("location") or "" if isinstance(cats, dict) else ""
        if isinstance(loc, list):
            loc = ", ".join(loc)
        results.append({
            "title": j.get("text") or "",
            "location": str(loc),
            "url": j.get("hostedUrl") or j.get("applyUrl") or "",
            "description": (j.get("descriptionPlain") or j.get("description") or "")[:3000],
        })
    return results


async def scrape_ashby(slug: str, proxies: list[str] | None = None) -> list[dict]:
    proxy = _pick_proxy(proxies)
    query = """query Jobs($slug:String!){jobBoard:jobBoardWithTeams(organizationHostedJobsPageName:$slug){jobPostings{id title locationName externalLink descriptionSocial}}}"""
    async with httpx.AsyncClient(proxy=proxy, timeout=30, follow_redirects=True) as client:
        r = await client.post(
            "https://jobs.ashbyhq.com/api/non-user-graphql",
            json={"operationName": "Jobs", "variables": {"slug": slug}, "query": query},
            headers={"User-Agent": _fake_headers()["User-Agent"], "Content-Type": "application/json"},
        )
        r.raise_for_status()
        data = r.json()
    postings = ((data.get("data") or {}).get("jobBoard") or {}).get("jobPostings") or []
    return [
        {
            "title": p.get("title") or "",
            "location": p.get("locationName") or "",
            "url": p.get("externalLink") or f"https://jobs.ashbyhq.com/{slug}/{p.get('id', '')}",
            "description": p.get("descriptionSocial") or "",
        }
        for p in postings
    ]


async def scrape_smartrecruiters(slug: str, proxies: list[str] | None = None) -> list[dict]:
    url = f"https://api.smartrecruiters.com/v1/companies/{slug}/postings?limit=100"
    proxy = _pick_proxy(proxies)
    async with httpx.AsyncClient(proxy=proxy, timeout=30, follow_redirects=True) as client:
        r = await client.get(url, headers={"User-Agent": _fake_headers()["User-Agent"]})
        r.raise_for_status()
        data = r.json()
    return [
        {
            "title": j.get("name") or "",
            "location": (j.get("location") or {}).get("city") or "",
            "url": j.get("ref") or f"https://careers.smartrecruiters.com/{slug}/{j.get('id', '')}",
            "description": "",
        }
        for j in (data.get("content") or [])
    ]


# ── Custom Site Scraper ───────────────────────────────────────────────────────

async def _get_html(url: str, proxy: Optional[str] = None) -> str:
    """Charge HTML via Playwright si disponible, sinon httpx."""
    try:
        from playwright.async_api import async_playwright  # noqa: F401
        return await _playwright_html(url, proxy)
    except ImportError:
        pass
    return await _httpx_html(url, proxy)


async def _httpx_html(url: str, proxy: Optional[str] = None) -> str:
    async with httpx.AsyncClient(
        proxy=proxy, timeout=30, follow_redirects=True, headers=_fake_headers(),
    ) as client:
        r = await client.get(url)
        r.raise_for_status()
        return r.text


async def _playwright_html(url: str, proxy: Optional[str] = None) -> str:
    from playwright.async_api import async_playwright
    proxy_cfg = None
    if proxy:
        p = urlparse(proxy)
        proxy_cfg = {"server": f"{p.scheme}://{p.hostname}:{p.port}"}
        if p.username:
            proxy_cfg["username"] = p.username
            proxy_cfg["password"] = p.password or ""
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True, proxy=proxy_cfg)
        ctx = await browser.new_context(
            user_agent=_fake_headers()["User-Agent"],
            viewport={"width": 1280, "height": 720},
        )
        page = await ctx.new_page()
        await page.goto(url, wait_until="domcontentloaded", timeout=25000)
        await page.wait_for_timeout(2500)
        html = await page.content()
        await browser.close()
        return html


def _extract_text_and_links(html: str, base_url: str) -> tuple[str, list[dict]]:
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "nav", "footer", "header", "aside", "noscript"]):
        tag.decompose()

    # Job links
    job_links = []
    base = urlparse(base_url)
    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        text = a.get_text(strip=True)[:120]
        if any(kw in href.lower() for kw in ["job", "career", "offre", "poste", "position", "emploi"]):
            if href.startswith("http"):
                job_links.append({"text": text, "href": href})
            elif href.startswith("/"):
                job_links.append({"text": text, "href": f"{base.scheme}://{base.netloc}{href}"})
        if len(job_links) >= 25:
            break

    lines = [l.strip() for l in soup.get_text(separator="\n").split("\n") if l.strip()]
    text = "\n".join(lines[:350])[:9000]
    return text, job_links


def _parse_jobs_json(raw: str) -> list[dict]:
    m = re.search(r"\[.*?\]", raw, re.DOTALL)
    if not m:
        return []
    try:
        items = json.loads(m.group(0))
        if not isinstance(items, list):
            return []
        return [
            {
                "title": str(j.get("title") or "").strip(),
                "location": str(j.get("location") or "").strip(),
                "url": str(j.get("url") or "").strip(),
                "description": str(j.get("description") or "").strip(),
            }
            for j in items
            if isinstance(j, dict) and j.get("title")
        ]
    except json.JSONDecodeError:
        return []


async def scrape_custom(
    url: str,
    company_name: str,
    proxies: list[str] | None = None,
    ai_key: Optional[str] = None,
    ai_model: Optional[str] = None,
) -> list[dict]:
    proxy = _pick_proxy(proxies)
    try:
        html = await _get_html(url, proxy)
    except httpx.HTTPStatusError as e:
        status = e.response.status_code
        if status == 403:
            server = e.response.headers.get("server", "")
            is_cf = "cloudflare" in server.lower() or e.response.headers.get("cf-ray")
            if is_cf:
                raise RuntimeError(
                    f"Site protégé par Cloudflare Bot Management (403). "
                    f"Ce site bloque les scrapers automatiques. "
                    f"Solutions : (1) utiliser un proxy résidentiel dans la config, "
                    f"(2) installer Playwright (`pip install playwright && playwright install chromium`), "
                    f"(3) saisir manuellement les offres."
                )
            raise RuntimeError(
                f"Accès refusé (403 Forbidden) sur {url}. "
                f"Le site bloque les requêtes automatiques. "
                f"Essayez avec un proxy résidentiel."
            )
        raise RuntimeError(f"Erreur HTTP {status} sur {url}.")
    text, job_links = _extract_text_and_links(html, url)

    links_block = ""
    if job_links:
        links_block = "\n\nLiens détectés sur la page :\n" + "\n".join(
            f"- {l['text']} → {l['href']}" for l in job_links
        )

    prompt = (
        f"Tu es un expert en extraction d'offres d'emploi.\n"
        f"Entreprise : {company_name}\n"
        f"URL : {url}\n\n"
        f"Contenu de la page :{links_block}\n\n{text}\n\n"
        f"Extrais TOUTES les offres d'emploi listées.\n"
        f"Réponds UNIQUEMENT avec un tableau JSON valide (sans bloc markdown) :\n"
        f'[{{"title":"...", "location":"...", "url":"https://...", "description":"..."}}]\n'
        f"Si aucune offre n'est listée, réponds []."
    )
    try:
        answer = await _call_llm(prompt, ai_key, ai_model)
        return _parse_jobs_json(answer)
    except Exception as exc:
        logger.error(f"[Company-Custom] LLM error: {exc}")
        return []


# ── Main Dispatcher ───────────────────────────────────────────────────────────

async def scrape_company(
    company_name: str,
    careers_url: str,
    ats_type: str,
    ats_slug: Optional[str],
    proxies: list[str] | None = None,
    ai_key: Optional[str] = None,
    ai_model: Optional[str] = None,
) -> list[dict]:
    logger.info(f"[Company] Scraping '{company_name}' via {ats_type} (slug={ats_slug})")
    if ats_type == "greenhouse" and ats_slug:
        return await scrape_greenhouse(ats_slug, proxies)
    if ats_type == "lever" and ats_slug:
        return await scrape_lever(ats_slug, proxies)
    if ats_type == "ashby" and ats_slug:
        return await scrape_ashby(ats_slug, proxies)
    if ats_type == "smartrecruiters" and ats_slug:
        return await scrape_smartrecruiters(ats_slug, proxies)
    return await scrape_custom(careers_url, company_name, proxies, ai_key, ai_model)


# ── Save to DB ────────────────────────────────────────────────────────────────

async def save_jobs_to_db(jobs: list[dict], company_name: str, company_id: int) -> int:
    from app.db.database import AsyncSessionLocal
    from app.models.job import Job
    from sqlalchemy import select

    count = 0
    async with AsyncSessionLocal() as db:
        for j in jobs:
            url = (j.get("url") or "").strip()
            title = (j.get("title") or "").strip()
            if not url or not title:
                continue
            h = Job.make_hash(url)
            existing = await db.scalar(select(Job.id).where(Job.content_hash == h))
            if existing:
                continue
            db.add(Job(
                content_hash=h,
                title=title[:255],
                company=company_name[:255],
                location=(j.get("location") or "")[:255],
                description=j.get("description") or "",
                url=url[:2048],
                source=f"company_{company_id}",
                status="new",
                scraped_at=datetime.utcnow(),
            ))
            count += 1
        await db.commit()
    logger.info(f"[Company] {count} nouvelles offres insérées pour '{company_name}'")
    return count
