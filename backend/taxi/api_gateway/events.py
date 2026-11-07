"""Phase 38 — Partner webhook emission helper."""

from __future__ import annotations


def emit_partner_webhook(event_type: str, payload: dict, app_id: int | None = None):
    """Record a partner notification durably, then hand delivery to a retrying worker.

    WHY THIS SHAPE
    --------------
    This is called from ``post_save`` receivers (``api_gateway/signals.py``), which fire
    INSIDE the financial settlement transaction.

    * The outbox row is written **inside** that transaction, so it commits atomically with
      the money: if the payment committed, the notification is recorded. Redis being down can
      therefore never lose a notification, and never holds the settlement open (a ``.delay()``
      inside the money transaction used to leave payments stuck 'pending' with the SQLite
      write lock held).
    * Actual delivery is a *separate* step performed by a beat-driven worker, so a slow or
      absent broker cannot block or fail a settled payment.
    * ``idempotency_key`` is derived from the event, so a repeated emit is a no-op rather than
      a second partner action.
    """
    import hashlib
    import json
    import logging

    from django.db import IntegrityError, transaction

    logger = logging.getLogger(__name__)

    try:
        from .models import PartnerWebhookOutbox
    except Exception:  # pragma: no cover - app not ready
        logger.exception("Outbox model unavailable; dropping %s notification.", event_type)
        return None

    raw = json.dumps(
        {"e": event_type, "p": payload, "a": app_id}, sort_keys=True, default=str
    )
    idempotency_key = hashlib.sha256(raw.encode("utf-8")).hexdigest()

    # Nested atomic: IntegrityError must not mark the caller's settlement/seed transaction dirty.
    try:
        with transaction.atomic():
            row = PartnerWebhookOutbox.objects.create(
                idempotency_key=idempotency_key,
                event_type=event_type,
                payload=payload,
                application_id=app_id,
            )
    except IntegrityError:
        logger.info(
            "Partner webhook %r already queued (idempotent); no second action taken.",
            event_type,
        )
        return None
    except Exception:
        logger.exception(
            "Could not record partner webhook %r in the outbox. payload=%r app_id=%r",
            event_type,
            payload,
            app_id,
        )
        return None

    row_pk = row.pk
    # Opportunistic nudge only. If the broker is down this logs and the row stays PENDING
    # for the worker; it can never fail the settlement.
    transaction.on_commit(lambda: _nudge_worker(row_pk))
    return row


def _nudge_worker(outbox_pk: int) -> None:
    """Best-effort immediate delivery attempt for one outbox row."""
    import logging

    logger = logging.getLogger(__name__)

    try:
        from .tasks import deliver_outbox_row_task

        deliver_outbox_row_task.delay(outbox_pk)
    except Exception:
        logger.warning(
            "Outbox row %s could not be nudged (broker unavailable); "
            "the beat worker will deliver it.",
            outbox_pk,
            exc_info=True,
        )
