"""
app/schemas/cv.py
Schémas Pydantic pour les CVs.
"""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class CVRead(BaseModel):
    id: int
    name: str
    filename: str
    file_type: str
    skills: Optional[str] = None     # JSON brut list[str]
    summary: Optional[str] = None
    is_default: bool
    uploaded_at: datetime
    parsed_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class CVUpdate(BaseModel):
    name: Optional[str] = None
    is_default: Optional[bool] = None


class CVAnalysisRequest(BaseModel):
    cv_id: int
    job_id: int
    model: Optional[str] = None      # surcharge le modèle par défaut de .env
