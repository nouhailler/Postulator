"""
app/schemas/scraper.py
"""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class ScrapeRequest(BaseModel):
    keywords:           str
    location:           Optional[str] = None
    sources:            list[str]     = Field(default=["indeed"])
    results_per_source: int           = Field(default=50, ge=5, le=200)
    hours_old:          Optional[int] = None
    remote_only:        bool          = False
    job_types:          list[str]     = Field(default=[])


class ScrapeWithProxiesRequest(ScrapeRequest):
    """Même que ScrapeRequest + liste de proxies."""
    proxies: list[str] = Field(
        ...,
        description="Liste de proxies au format IP:PORT:USERNAME:PASSWORD",
        min_length=1,
    )


class ScrapeStatus(BaseModel):
    task_id: str
    status:  str
    message: str


class ScrapeLogRead(BaseModel):
    id:             int
    source:         str
    status:         str
    jobs_found:     int
    jobs_new:       int
    jobs_duplicate: int
    duration_sec:   Optional[float]  = None
    error_message:  Optional[str]    = None
    proxy_used:     Optional[str]    = None
    started_at:     datetime
    finished_at:    Optional[datetime] = None

    model_config = {"from_attributes": True}
