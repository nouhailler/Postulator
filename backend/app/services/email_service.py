"""
app/services/email_service.py
Envoi d'alertes email SMTP pour les bons matches Ollama.

Configuration dans .env :
  SMTP_HOST=smtp.gmail.com
  SMTP_PORT=587
  SMTP_USER=votre@gmail.com
  SMTP_PASSWORD=mot_de_passe_application
  ALERT_EMAIL_TO=destinataire@email.com
  ALERT_SCORE_THRESHOLD=80

Pour Gmail : créer un "mot de passe d'application" dans
  Compte Google → Sécurité → Connexion à Google → Mots de passe des applications
"""
import asyncio
import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

from loguru import logger

from app.core.config import get_settings


class EmailService:

    def __init__(self) -> None:
        self.settings = get_settings()

    @property
    def enabled(self) -> bool:
        return self.settings.email_configured

    async def send_match_alert(
        self,
        job_title:      str,
        job_company:    str,
        job_url:        Optional[str],
        score:          float,
        cv_name:        str,
        recommendation: str,
        strengths:      list[str],
        gaps:           list[str],
    ) -> bool:
        """
        Envoie une alerte email pour un match de haute qualité.
        Retourne True si l'email a été envoyé, False sinon.
        """
        if not self.enabled:
            logger.debug("[Email] Non configuré — alerte ignorée.")
            return False

        score_int = int(round(score))
        if score_int < self.settings.alert_score_threshold:
            logger.debug(f"[Email] Score {score_int} < seuil {self.settings.alert_score_threshold} — pas d'alerte.")
            return False

        try:
            msg = self._build_message(
                job_title=job_title,
                job_company=job_company,
                job_url=job_url,
                score=score_int,
                cv_name=cv_name,
                recommendation=recommendation,
                strengths=strengths,
                gaps=gaps,
            )
            # Envoyer dans un thread pour ne pas bloquer l'event loop
            await asyncio.to_thread(self._send_smtp, msg)
            logger.info(f"[Email] Alerte envoyée — {job_title} @ {job_company} ({score_int}/100)")
            return True
        except Exception as exc:
            logger.error(f"[Email] Échec envoi : {exc}")
            return False

    async def test_connection(self) -> dict:
        """Teste la connexion SMTP — appelé depuis l'endpoint /api/alerts/test."""
        if not self.enabled:
            return {"ok": False, "error": "SMTP non configuré dans .env"}
        try:
            await asyncio.to_thread(self._check_smtp)
            return {"ok": True, "message": f"Connexion SMTP OK → {self.settings.smtp_host}:{self.settings.smtp_port}"}
        except Exception as exc:
            return {"ok": False, "error": str(exc)}

    def _build_message(
        self,
        job_title: str,
        job_company: str,
        job_url: Optional[str],
        score: int,
        cv_name: str,
        recommendation: str,
        strengths: list[str],
        gaps: list[str],
    ) -> MIMEMultipart:
        s = self.settings
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"🎯 Postulator — Match {score}/100 : {job_title} @ {job_company}"
        msg["From"]    = s.smtp_user
        msg["To"]      = s.alert_email_to

        # ── Texte brut ────────────────────────────────────────────────────────
        strengths_txt = "\n".join(f"  • {s}" for s in strengths) or "  —"
        gaps_txt      = "\n".join(f"  • {g}" for g in gaps)      or "  —"
        url_line      = f"\nLien : {job_url}" if job_url else ""

        plain = f"""Postulator — Alerte Match IA

Score : {score}/100
Offre : {job_title}
Entreprise : {job_company}{url_line}
CV analysé : {cv_name}

Synthèse : {recommendation}

Points forts :
{strengths_txt}

Points de développement :
{gaps_txt}

---
Postulator · IA locale (Ollama) · Aucune donnée envoyée dans le cloud
"""

        # ── HTML ──────────────────────────────────────────────────────────────
        score_color = "#3cddc7" if score >= 80 else "#7bd0ff" if score >= 60 else "#888"
        strengths_html = "".join(f"<li>{s}</li>" for s in strengths) or "<li>—</li>"
        gaps_html      = "".join(f"<li>{g}</li>" for g in gaps)      or "<li>—</li>"
        url_btn        = (
            f'<p style="margin:16px 0">'
            f'<a href="{job_url}" style="background:#7bd0ff;color:#0b1326;padding:10px 20px;'
            f'border-radius:6px;text-decoration:none;font-weight:bold;font-size:14px">'
            f'Voir l\'offre ↗</a></p>'
        ) if job_url else ""

        html = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0b1326;font-family:'Segoe UI',Arial,sans-serif;color:#e8eaed">
  <div style="max-width:580px;margin:0 auto;padding:24px 16px">

    <!-- Header -->
    <div style="background:#111c35;border-radius:12px;padding:24px;margin-bottom:16px;border:1px solid rgba(123,208,255,0.15)">
      <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#7bd0ff">
        Postulator · Alerte Match IA
      </p>
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:800;color:#fff;letter-spacing:-0.02em">
        {job_title}
      </h1>
      <p style="margin:0;font-size:15px;color:#aab4c4">{job_company}</p>
    </div>

    <!-- Score -->
    <div style="background:#111c35;border-radius:12px;padding:20px;margin-bottom:16px;text-align:center;border:1px solid {score_color}40">
      <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#aab4c4">Score de matching</p>
      <p style="margin:0;font-size:52px;font-weight:900;color:{score_color};line-height:1">{score}</p>
      <p style="margin:0;font-size:16px;color:{score_color}">/100</p>
      <p style="margin:12px 0 0;font-size:13px;color:#aab4c4;font-style:italic">{recommendation}</p>
      <p style="margin:8px 0 0;font-size:11px;color:#7bd0ff">CV analysé : {cv_name}</p>
    </div>

    <!-- Deux colonnes -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px">
      <tr>
        <td width="48%" valign="top" style="background:#111c35;border-radius:12px;padding:16px;border-top:3px solid #3cddc7">
          <p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#3cddc7">✦ Points forts</p>
          <ul style="margin:0;padding-left:18px;color:#aab4c4;font-size:13px;line-height:1.6">
            {strengths_html}
          </ul>
        </td>
        <td width="4%"></td>
        <td width="48%" valign="top" style="background:#111c35;border-radius:12px;padding:16px;border-top:3px solid #7bd0ff">
          <p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#7bd0ff">◎ À développer</p>
          <ul style="margin:0;padding-left:18px;color:#aab4c4;font-size:13px;line-height:1.6">
            {gaps_html}
          </ul>
        </td>
      </tr>
    </table>

    {url_btn}

    <!-- Footer -->
    <p style="margin:24px 0 0;font-size:11px;color:#555;text-align:center">
      Postulator · IA locale Ollama · Aucune donnée envoyée dans le cloud
    </p>
  </div>
</body>
</html>"""

        msg.attach(MIMEText(plain, "plain", "utf-8"))
        msg.attach(MIMEText(html,  "html",  "utf-8"))
        return msg

    def _send_smtp(self, msg: MIMEMultipart) -> None:
        s = self.settings
        context = ssl.create_default_context()
        with smtplib.SMTP(s.smtp_host, s.smtp_port) as server:
            server.ehlo()
            server.starttls(context=context)
            server.login(s.smtp_user, s.smtp_password)
            server.send_message(msg)

    def _check_smtp(self) -> None:
        s = self.settings
        context = ssl.create_default_context()
        with smtplib.SMTP(s.smtp_host, s.smtp_port, timeout=10) as server:
            server.ehlo()
            server.starttls(context=context)
            server.login(s.smtp_user, s.smtp_password)
            # Ne pas envoyer de message — juste vérifier la connexion


# Singleton
email_service = EmailService()
