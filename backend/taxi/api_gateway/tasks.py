"""Phase 38 — Celery tasks for partner webhook delivery."""

import logging

from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(
    bind=True,
    name="api_gateway.tasks.dispatch_webhook_event_task",
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=600,
    retry_jitter=True,
    max_retries=5,
)
def dispatch_webhook_event_task(self, event_type: str, payload: dict, app_id: int | None = None):
    """Deliver a signed webhook POST with exponential backoff retries."""
    from .utils import dispatch_webhook_event_sync

    try:
        return dispatch_webhook_event_sync(event_type, payload, app_id=app_id)
    except Exception:
        logger.exception("Webhook dispatch failed for %s", event_type)
        raise
