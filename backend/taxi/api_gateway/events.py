"""Phase 38 — Partner webhook emission helper."""

from __future__ import annotations


def emit_partner_webhook(event_type: str, payload: dict, app_id: int | None = None):
    """Queue a partner webhook delivery via Celery."""
    from .tasks import dispatch_webhook_event_task

    dispatch_webhook_event_task.delay(event_type, payload, app_id)
