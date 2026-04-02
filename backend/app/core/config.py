"""
app/core/config.py
"""
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_name:    str  = "Postulator"
    app_version: str  = "0.1.0"
    debug:       bool = False

    database_url: str = "sqlite+aiosqlite:///./postulator.db"

    ollama_base_url: str = "http://localhost:11434"
    ollama_model:    str = "phi3.5:3.8b"

    redis_url:              str = "redis://localhost:6379/0"
    celery_broker_url:      str = "redis://localhost:6379/0"
    celery_result_backend:  str = "redis://localhost:6379/1"

    cors_origins: str = "http://localhost:5173"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",")]

    scraper_default_results: int = 50
    scraper_max_results:     int = 200
    scraper_delay_min:       int = 3
    scraper_delay_max:       int = 10

    proxy_list: str = ""

    @property
    def proxies(self) -> list[str]:
        if not self.proxy_list:
            return []
        return [p.strip() for p in self.proxy_list.split(",") if p.strip()]

    # ── Email / Alertes ───────────────────────────────────────────────────────
    smtp_host:     str = ""
    smtp_port:     int = 587
    smtp_user:     str = ""
    smtp_password: str = ""
    alert_email_to: str = ""
    alert_score_threshold: int = 80   # score minimum pour déclencher une alerte

    @property
    def email_configured(self) -> bool:
        """True si la configuration SMTP est complète."""
        return bool(self.smtp_host and self.smtp_user and self.alert_email_to)


@lru_cache
def get_settings() -> Settings:
    return Settings()
