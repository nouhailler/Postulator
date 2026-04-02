"""
app/api/routes/alerts.py
Gestion des alertes email.

Routes :
  GET  /api/alerts/status   → état de la configuration SMTP
  POST /api/alerts/test     → envoie un email de test
  POST /api/alerts/send     → envoie une alerte pour un match spécifique
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from app.api.deps import AppSettings, DBSession
from app.services.email_service import email_service

router = APIRouter(prefix="/alerts", tags=["Alerts"])


class AlertTestResult(BaseModel):
    ok:      bool
    message: Optional[str] = None
    error:   Optional[str] = None


class SendAlertPayload(BaseModel):
    match_history_id: int


@router.get("/status")
async def alert_status(settings: AppSettings) -> dict:
    """Retourne l'état de la configuration email."""
    return {
        "email_configured": settings.email_configured,
        "smtp_host":        settings.smtp_host or None,
        "smtp_port":        settings.smtp_port,
        "smtp_user":        settings.smtp_user or None,
        "alert_email_to":   settings.alert_email_to or None,
        "score_threshold":  settings.alert_score_threshold,
    }


@router.post("/test", response_model=AlertTestResult)
async def test_smtp() -> AlertTestResult:
    """Teste la connexion SMTP et envoie un email de test."""
    result = await email_service.test_connection()
    if not result["ok"]:
        return AlertTestResult(ok=False, error=result["error"])

    # Envoyer un email de test
    sent = await email_service.send_match_alert(
        job_title="Développeur Python Senior [TEST]",
        job_company="Postulator — Test SMTP",
        job_url=None,
        score=95,
        cv_name="CV Test",
        recommendation="Ceci est un email de test envoyé depuis Postulator.",
        strengths=["Configuration SMTP correcte", "Emails fonctionnels"],
        gaps=["Aucun — test réussi !"],
    )
    if sent:
        return AlertTestResult(ok=True, message=f"Email de test envoyé vers {email_service.settings.alert_email_to}")
    return AlertTestResult(ok=False, error="Connexion OK mais envoi échoué — vérifiez les logs.")


@router.post("/send/{match_id}", response_model=AlertTestResult)
async def send_match_alert(match_id: int, db: DBSession) -> AlertTestResult:
    """Envoie une alerte email pour un match spécifique de l'historique."""
    import json
    from app.models.match_history import MatchHistory

    entry = await db.get(MatchHistory, match_id)
    if not entry:
        raise HTTPException(status_code=404, detail=f"Match {match_id} introuvable.")

    try:
        strengths = json.loads(entry.strengths or "[]")
        gaps      = json.loads(entry.gaps or "[]")
    except Exception:
        strengths, gaps = [], []

    sent = await email_service.send_match_alert(
        job_title=entry.job_title,
        job_company=entry.job_company,
        job_url=entry.job_url,
        score=entry.score,
        cv_name=entry.cv_name,
        recommendation=entry.recommendation or "",
        strengths=strengths,
        gaps=gaps,
    )

    if sent:
        return AlertTestResult(ok=True, message=f"Alerte envoyée pour : {entry.job_title}")
    return AlertTestResult(ok=False, error="Email non envoyé — vérifiez la configuration SMTP dans .env")
