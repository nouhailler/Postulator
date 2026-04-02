"""
app/scrapers/proxy_manager.py
Gestionnaire de proxies avec rotation.

Deux classes :
- ProxyManager      : proxies statiques configurés dans .env (format HTTP URL)
- ResidentialProxyManager : proxies résidentiels saisis dynamiquement en UI
  Format attendu par ligne : IP:PORT:USERNAME:PASSWORD
  ex: 31.59.20.176:6754:nbnzyhqa:xmqbrwxlh5ov
"""
import random
import threading
from typing import Optional

from loguru import logger

from app.core.config import get_settings


# ── Proxy statique (fichier .env) ─────────────────────────────────────────────

class ProxyManager:
    """
    Proxies configurés statiquement via PROXY_LIST dans .env.
    Rotation round-robin + suppression des proxies défaillants.
    """

    def __init__(self) -> None:
        settings = get_settings()
        self._proxies: list[str] = settings.proxies
        self._index: int = 0
        self._lock = threading.Lock()
        if self._proxies:
            logger.info(f"ProxyManager: {len(self._proxies)} proxy(ies) statique(s).")
        else:
            logger.warning("ProxyManager: aucun proxy configuré — scraping en IP directe.")

    @property
    def has_proxies(self) -> bool:
        return bool(self._proxies)

    def get(self) -> Optional[str]:
        """Retourne le prochain proxy round-robin, ou None."""
        if not self._proxies:
            return None
        with self._lock:
            proxy = self._proxies[self._index % len(self._proxies)]
            self._index += 1
        return proxy

    def get_random(self) -> Optional[str]:
        """Retourne un proxy aléatoire, ou None."""
        if not self._proxies:
            return None
        return random.choice(self._proxies)

    def remove(self, proxy: str) -> None:
        """Retire un proxy défaillant."""
        with self._lock:
            if proxy in self._proxies:
                self._proxies.remove(proxy)
                logger.warning(f"Proxy retiré : {proxy}. Reste : {len(self._proxies)}")


# ── Proxy résidentiel (saisi dynamiquement en UI) ─────────────────────────────

class ResidentialProxyManager:
    """
    Proxies résidentiels saisis dynamiquement via l'UI.

    Format d'entrée (une ligne par proxy) :
        IP:PORT:USERNAME:PASSWORD
        ex: 31.59.20.176:6754:nbnzyhqa:xmqbrwxlh5ov

    Construit automatiquement les URLs HTTP authentifiées :
        http://USERNAME:PASSWORD@IP:PORT

    Rotation round-robin stricte : jamais deux fois la même IP consécutivement.
    """

    def __init__(self, raw_lines: list[str]) -> None:
        self._proxies: list[str] = []
        self._index: int = 0
        self._lock = threading.Lock()
        self._parse(raw_lines)

    def _parse(self, lines: list[str]) -> None:
        """Parse les lignes IP:PORT:USER:PASS → URLs HTTP."""
        parsed = 0
        for line in lines:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            parts = line.split(':')
            if len(parts) != 4:
                logger.warning(f"[ResidentialProxy] Format invalide ignoré : {line!r}")
                continue
            ip, port, user, password = parts
            url = f"http://{user}:{password}@{ip}:{port}"
            self._proxies.append(url)
            parsed += 1

        logger.info(f"[ResidentialProxy] {parsed} proxy(ies) résidentiel(s) configuré(s).")

    @property
    def count(self) -> int:
        return len(self._proxies)

    @property
    def has_proxies(self) -> bool:
        return bool(self._proxies)

    def get_next(self) -> Optional[str]:
        """
        Retourne le prochain proxy en rotation stricte round-robin.
        Garantit qu'on ne réutilise pas la même IP consécutivement.
        """
        if not self._proxies:
            return None
        with self._lock:
            proxy = self._proxies[self._index % len(self._proxies)]
            self._index += 1
        return proxy

    def get_all_urls(self) -> list[str]:
        """Retourne toutes les URLs proxy (pour debug/log)."""
        return list(self._proxies)

    def remove(self, proxy_url: str) -> None:
        """Retire un proxy défaillant de la rotation."""
        with self._lock:
            if proxy_url in self._proxies:
                self._proxies.remove(proxy_url)
                # Masquer les credentials dans le log
                masked = proxy_url.split('@')[-1] if '@' in proxy_url else proxy_url
                logger.warning(f"[ResidentialProxy] Retiré (défaillant) : {masked}. Reste : {len(self._proxies)}")

    @staticmethod
    def validate_lines(lines: list[str]) -> tuple[int, list[str]]:
        """
        Valide les lignes sans créer de manager.
        Retourne (nb_valides, liste_erreurs).
        """
        valid = 0
        errors = []
        for i, line in enumerate(lines, 1):
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            parts = line.split(':')
            if len(parts) != 4:
                errors.append(f"Ligne {i}: format invalide (attendu IP:PORT:USER:PASS)")
            else:
                valid += 1
        return valid, errors


# Singleton pour les proxies statiques (.env)
proxy_manager = ProxyManager()
