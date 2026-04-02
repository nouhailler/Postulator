"""
app/workers/celery_app.py
Configuration de l'application Celery.
"""
from celery import Celery

from app.core.config import get_settings

settings = get_settings()

celery_app = Celery(
    "postulator",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=[
        "app.workers.scrape_task",
        "app.workers.analysis_task",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="Europe/Paris",
    enable_utc=True,
    # Retry automatique en cas d'erreur transitoire
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    # Limitation du débit global (anti-ban)
    task_annotations={
        "app.workers.scrape_task.run_scrape": {"rate_limit": "2/m"},
    },
)
