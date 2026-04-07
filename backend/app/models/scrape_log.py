"""
app/models/scrape_log.py
Journal d'exécution de chaque session de scraping.
"""
from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class ScrapeLog(Base):
    __tablename__ = "scrape_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    source: Mapped[str] = mapped_column(String(64), index=True)      # indeed, linkedin…
    search_profile_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="running")
    # running | success | error | partial

    jobs_found: Mapped[int] = mapped_column(Integer, default=0)
    jobs_new: Mapped[int] = mapped_column(Integer, default=0)         # après déduplication
    jobs_duplicate: Mapped[int] = mapped_column(Integer, default=0)
    duration_sec: Mapped[float | None] = mapped_column(Float, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    proxy_used: Mapped[str | None] = mapped_column(String(256), nullable=True)   # IP:PORT du proxy utilisé
    proxies_tried: Mapped[str | None] = mapped_column(Text, nullable=True)         # JSON list des proxies tentés
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    def __repr__(self) -> str:
        return (
            f"<ScrapeLog id={self.id} source={self.source} "
            f"status={self.status} new={self.jobs_new}>"
        )
