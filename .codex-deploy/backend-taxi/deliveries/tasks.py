"""Celery tasks for the Yala Delivery app.

Handles periodic background work: offer timeout enforcement, scheduled delivery
dispatch, stale request cleanup, and payment reminders.
"""

import logging

from celery import shared_task
from django.utils import timezone

logger = logging.getLogger(__name__)


@shared_task(name="deliveries.tasks.check_offer_timeouts")
def check_offer_timeouts():
    """Advance expired delivery offers to the next eligible courier.

    Should run every 10–15 seconds via Celery Beat.
    """
    from .models import Delivery
    from .services.assignment_service import assignment_service

    deliveries = Delivery.objects.filter(
        status="requested",
        driver__isnull=True,
        offered_driver__isnull=False,
        offer_sent_at__isnull=False,
    )

    advanced = 0
    for delivery in deliveries:
        timeout = assignment_service.get_offer_timeout_seconds(delivery)
        expiry = delivery.offer_sent_at + timezone.timedelta(seconds=timeout)
        if timezone.now() > expiry:
            try:
                assignment_service.process_expired_offer(delivery)
                advanced += 1
            except Exception:
                logger.exception(
                    "Failed to advance expired offer for delivery %s", delivery.id
                )

    if advanced:
        logger.info("Advanced %d expired delivery offers.", advanced)
    return {"advanced": advanced}


@shared_task(name="deliveries.tasks.dispatch_scheduled_deliveries")
def dispatch_scheduled_deliveries():
    """Broadcast scheduled deliveries to couriers 15 minutes before pickup.

    Also notifies customers of overdue unaccepted scheduled deliveries.
    Should run every 60 seconds via Celery Beat.
    """
    from .notifications import broadcast_new_delivery_request
    from .services.scheduling import ScheduledDeliveryService

    service = ScheduledDeliveryService()
    result = service.process_scheduled_deliveries()

    dispatched = 0
    for delivery_id in result.get("due_delivery_ids", []):
        try:
            from .models import Delivery

            delivery = Delivery.objects.get(id=delivery_id)
            if delivery.status == "requested" and not delivery.driver_id:
                broadcast_new_delivery_request(delivery)
                dispatched += 1
        except Exception:
            logger.exception(
                "Failed to dispatch scheduled delivery %s", delivery_id
            )

    # Notify customers of overdue scheduled deliveries
    notified = 0
    for delivery_id in result.get("overdue_delivery_ids", []):
        try:
            from .models import Delivery

            delivery = Delivery.objects.get(id=delivery_id)
            if delivery.status == "requested" and not delivery.driver_id:
                _notify_customer_no_courier(delivery)
                notified += 1
        except Exception:
            logger.exception(
                "Failed to notify overdue scheduled delivery %s", delivery_id
            )

    logger.info(
        "Scheduled delivery dispatch: %d dispatched, %d overdue notified.",
        dispatched,
        notified,
    )
    return {"dispatched": dispatched, "overdue_notified": notified}


@shared_task(name="deliveries.tasks.cleanup_stale_requests")
def cleanup_stale_requests():
    """Auto-cancel delivery requests that have been unaccepted for too long.

    - Non-scheduled: cancel after 15 minutes with no driver
    - Scheduled: cancel after 30 minutes past scheduled_pickup_at with no driver

    Should run every 5 minutes via Celery Beat.
    """
    from datetime import timedelta

    from .models import Delivery
    from .services.delivery_service import delivery_service

    now = timezone.now()
    cancelled = 0

    # Non-scheduled deliveries older than 15 minutes with no driver
    stale_immediate = Delivery.objects.filter(
        status="requested",
        driver__isnull=True,
        is_scheduled=False,
        created_at__lte=now - timedelta(minutes=15),
    )

    for delivery in stale_immediate:
        try:
            delivery.status = "cancelled"
            delivery.save(update_fields=["status"])
            _notify_customer_auto_cancelled(delivery)
            cancelled += 1
        except Exception:
            logger.exception(
                "Failed to auto-cancel stale delivery %s", delivery.id
            )

    # Scheduled deliveries 30 minutes past pickup time with no driver
    stale_scheduled = Delivery.objects.filter(
        status="requested",
        driver__isnull=True,
        is_scheduled=True,
        scheduled_pickup_at__isnull=False,
        scheduled_pickup_at__lte=now - timedelta(minutes=30),
    )

    for delivery in stale_scheduled:
        try:
            delivery.status = "cancelled"
            delivery.save(update_fields=["status"])
            _notify_customer_auto_cancelled(delivery)
            cancelled += 1
        except Exception:
            logger.exception(
                "Failed to auto-cancel stale scheduled delivery %s", delivery.id
            )

    if cancelled:
        logger.info("Auto-cancelled %d stale delivery requests.", cancelled)
    return {"cancelled": cancelled}


@shared_task(name="deliveries.tasks.remind_cash_settlement")
def remind_cash_settlement():
    """Remind drivers to confirm cash collection for completed deliveries.

    Targets deliveries completed over 30 minutes ago with payment_status still pending
    and payment_method == cash. Should run every 30 minutes via Celery Beat.
    """
    from datetime import timedelta

    from .models import Delivery

    now = timezone.now()
    pending_cash = Delivery.objects.filter(
        status="delivered",
        payment_method="cash",
        payment_status="pending",
        delivered_at__lte=now - timedelta(minutes=30),
    )

    reminded = 0
    for delivery in pending_cash:
        try:
            _notify_driver_cash_reminder(delivery)
            reminded += 1
        except Exception:
            logger.exception(
                "Failed to send cash reminder for delivery %s", delivery.id
            )

    if reminded:
        logger.info("Sent %d cash settlement reminders.", reminded)
    return {"reminded": reminded}


# ── Internal notification helpers ─────────────────────────────────────────────


def _notify_customer_no_courier(delivery):
    """Notify customer that no courier accepted their scheduled delivery."""
    try:
        from notifications.push import send_push_to_user

        send_push_to_user(
            delivery.customer,
            "No Courier Available",
            "No courier is available for your scheduled delivery. "
            "You can wait or cancel and try again later.",
            data={"delivery_id": str(delivery.id), "type": "delivery_no_courier"},
        )
    except Exception:
        logger.exception(
            "Failed to push no-courier notification for delivery %s", delivery.id
        )


def _notify_customer_auto_cancelled(delivery):
    """Notify customer that their delivery was auto-cancelled."""
    try:
        from notifications.push import send_push_to_user

        send_push_to_user(
            delivery.customer,
            "Delivery Cancelled",
            "Your delivery request was cancelled because no courier was available. "
            "Please try again.",
            data={"delivery_id": str(delivery.id), "type": "delivery_auto_cancelled"},
        )
    except Exception:
        logger.exception(
            "Failed to push auto-cancel notification for delivery %s", delivery.id
        )


def _notify_driver_cash_reminder(delivery):
    """Remind driver to confirm cash collection."""
    if not delivery.driver:
        return
    try:
        from notifications.push import send_push_to_user

        send_push_to_user(
            delivery.driver,
            "Confirm Cash Payment",
            f"Please confirm cash collection for delivery #{delivery.id}.",
            data={"delivery_id": str(delivery.id), "type": "cash_reminder"},
        )
    except Exception:
        logger.exception(
            "Failed to push cash reminder for delivery %s", delivery.id
        )
