"""Phase 38 — Celery tasks for partner webhook delivery."""

import logging
from datetime import timedelta

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


def deliver_outbox_row(outbox_pk: int) -> dict:
    """Deliver ONE outbox row, with durable attempt bookkeeping.

    Attempt counting lives on the ROW, not in Celery's retry machinery, because the row must
    survive a broker restart, a worker crash and a Redis outage. A row is only marked
    DELIVERED after the POST succeeds; otherwise it goes back to PENDING with an incremented
    attempt count and a backoff ``next_attempt_at``, until ``max_attempts`` is exhausted and
    it becomes FAILED (visible to operators, never silently dropped).

    Re-delivery is safe: the partner receives the same ``idempotency_key``-derived event, and
    the worker never touches financial state - it only POSTs a notification. A duplicate
    attempt can therefore never create a duplicate payment, commission or earning.
    """
    from django.utils import timezone

    from .models import PartnerWebhookOutbox

    try:
        row = PartnerWebhookOutbox.objects.get(pk=outbox_pk)
    except PartnerWebhookOutbox.DoesNotExist:
        logger.warning("Outbox row %s no longer exists.", outbox_pk)
        return {"status": "missing", "pk": outbox_pk}

    if row.status == PartnerWebhookOutbox.STATUS_DELIVERED:
        return {"status": "already_delivered", "pk": outbox_pk}

    # Claim it. Only PENDING rows that are due may be claimed, so two workers cannot both
    # deliver the same row.
    claimed = PartnerWebhookOutbox.objects.filter(
        pk=outbox_pk,
        status=PartnerWebhookOutbox.STATUS_PENDING,
        next_attempt_at__lte=timezone.now(),
    ).update(status=PartnerWebhookOutbox.STATUS_DELIVERING)
    if not claimed:
        return {"status": "not_claimed", "pk": outbox_pk}

    row.refresh_from_db()
    row.attempts += 1
    try:
        from .utils import dispatch_webhook_event_sync

        results = dispatch_webhook_event_sync(
            row.event_type, row.payload, app_id=row.application_id
        )
        row.status = PartnerWebhookOutbox.STATUS_DELIVERED
        row.delivered_at = timezone.now()
        row.last_error = ""
        row.response_status = 200
        row.save(
            update_fields=[
                "status", "attempts", "delivered_at", "last_error",
                "response_status", "updated_at",
            ]
        )
        logger.info("Outbox row %s delivered (%s).", outbox_pk, row.event_type)
        return {"status": "delivered", "pk": outbox_pk, "attempts": row.attempts}
    except Exception as exc:
        row.last_error = f"{type(exc).__name__}: {exc}"[:2000]
        exhausted = row.attempts >= row.max_attempts
        if exhausted:
            row.status = PartnerWebhookOutbox.STATUS_FAILED
            logger.error(
                "Outbox row %s FAILED after %s attempts: %s",
                outbox_pk, row.attempts, row.last_error,
            )
        else:
            row.status = PartnerWebhookOutbox.STATUS_PENDING
            # Exponential backoff, capped. 2**attempts seconds: 2,4,8,... max 600.
            delay = min(600, 2 ** min(row.attempts, 9))
            row.next_attempt_at = timezone.now() + timedelta(seconds=delay)
            logger.warning(
                "Outbox row %s attempt %s failed, retrying in %ss: %s",
                outbox_pk, row.attempts, delay, row.last_error,
            )
        row.save(
            update_fields=["status", "attempts", "next_attempt_at", "last_error", "updated_at"]
        )
        return {
            "status": row.status,
            "pk": outbox_pk,
            "attempts": row.attempts,
            "error": row.last_error,
        }


@shared_task(bind=True, name="api_gateway.tasks.deliver_outbox_row_task", max_retries=0)
def deliver_outbox_row_task(self, outbox_pk: int):
    """Deliver one outbox row. Retries are owned by the row, not by Celery."""
    return deliver_outbox_row(outbox_pk)


@shared_task(name="api_gateway.tasks.sweep_partner_webhook_outbox_task")
def sweep_partner_webhook_outbox_task(limit: int = 50):
    """Beat entry point: deliver every due PENDING outbox row.

    This is what guarantees delivery when Redis was unavailable at emit time - the rows sat
    PENDING and are picked up here as soon as a worker runs.
    """
    from django.utils import timezone

    from .models import PartnerWebhookOutbox

    due = list(
        PartnerWebhookOutbox.objects.filter(
            status=PartnerWebhookOutbox.STATUS_PENDING,
            next_attempt_at__lte=timezone.now(),
        ).order_by("next_attempt_at")[:limit]
    )
    results = [deliver_outbox_row(row.pk) for row in due]
    return {"due": len(due), "results": results}
