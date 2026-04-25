"""app/models/company.py"""
from datetime import datetime
from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from app.db.database import Base


class Company(Base):
    __tablename__ = "companies"

    id              : Mapped[int]          = mapped_column(Integer, primary_key=True)
    name            : Mapped[str]          = mapped_column(String(255), nullable=False)
    domain          : Mapped[str | None]   = mapped_column(String(255), nullable=True)
    careers_url     : Mapped[str | None]   = mapped_column(String(2048), nullable=True)
    ats_type        : Mapped[str | None]   = mapped_column(String(64),  nullable=True, default="unknown")
    ats_slug        : Mapped[str | None]   = mapped_column(String(255), nullable=True)
    enabled         : Mapped[bool]         = mapped_column(Boolean, default=True)
    last_scraped_at : Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    jobs_found      : Mapped[int]          = mapped_column(Integer, default=0)
    scrape_status   : Mapped[str]          = mapped_column(String(32), default="pending")
    error_msg       : Mapped[str | None]   = mapped_column(Text, nullable=True)
    notes           : Mapped[str | None]   = mapped_column(Text, nullable=True)
    created_at      : Mapped[datetime]     = mapped_column(DateTime, default=datetime.utcnow)

    def __repr__(self) -> str:
        return f"<Company id={self.id} name={self.name!r} ats={self.ats_type}>"
