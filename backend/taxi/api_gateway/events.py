"""Phase 38 — Partner webhook emission helper."""

from __future__ import annotations


def emit_partner_webhook(event_type: str, payload: dict, app_id: int | None = None):
    """Queue a partner webhook delivery via Celery.

    Never blocks the caller. A Celery broker that is unreachable (for example a
    local environment without Redis) used to make ``.delay()`` retry on the
    connection for tens of seconds, which hung the originating HTTP request — the
    CEO suspend action appeared to fail while the state change had already been
    committed. Partner webhooks are best-effort: a broker outage is logged and the
    caller proceeds.
    """
    import logging

    logger = logging.getLogger(__name__)

    try:
        from .tasks import dispatch_webhook_event_task

        dispatch_webhook_event_task.delay(event_type, payload, app_id)
    except Exception:
        logger.warning(
            "Partner webhook '%s' could not be queued (broker unavailable); "
            "continuing without it.",
            event_type,
            exc_info=True,
        )
