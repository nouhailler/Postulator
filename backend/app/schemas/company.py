"""app/schemas/company.py"""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class CompanyCreate(BaseModel):
    name   : str
    domain : Optional[str] = None
    notes  : Optional[str] = None


class CompanyUpdate(BaseModel):
    name        : Optional[str]  = None
    domain      : Optional[str]  = None
    careers_url : Optional[str]  = None
    ats_type    : Optional[str]  = None
    ats_slug    : Optional[str]  = None
    enabled     : Optional[bool] = None
    notes       : Optional[str]  = None


class CompanyRead(BaseModel):
    id              : int
    name            : str
    domain          : Optional[str]
    careers_url     : Optional[str]
    ats_type        : Optional[str]
    ats_slug        : Optional[str]
    enabled         : bool
    last_scraped_at : Optional[datetime]
    jobs_found      : int
    scrape_status   : str
    error_msg       : Optional[str]
    notes           : Optional[str]
    created_at      : datetime

    model_config = {"from_attributes": True}
