"""Dispatch delivery lifecycle push notifications."""

import logging

logger = logging.getLogger(__name__)


def notify_delivery_status_change(delivery, previous_status=None):
    """Send customer push notifications for key delivery status transitions."""
    status = delivery.status
    if status == previous_status:
        return

    try:
        from notifications.push import (
            notify_delivery_accepted,
            notify_delivery_courier_arriving,
            notify_delivery_delivered,
            notify_delivery_picked_up,
        )

        customer = delivery.customer
        if status == "accepted":
            notify_delivery_accepted(customer, delivery)
        elif status == "courier_arriving":
            notify_delivery_courier_arriving(customer, delivery)
            _notify_merchant_for_delivery(delivery, "courier_arrived")
        elif status == "picked_up":
            notify_delivery_picked_up(customer, delivery)
            _notify_merchant_for_delivery(delivery, "picked_up")
        elif status == "delivered":
            notify_delivery_delivered(customer, delivery)
            _notify_merchant_for_delivery(delivery, "delivered")
    except Exception:
        logger.exception("Failed delivery status notification for delivery %s", delivery.id)


def notify_delivery_cancelled_event(delivery, cancelled_by):
    """Notify customer, courier, and linked merchant when a delivery is cancelled."""
    try:
        from notifications.push import (
            notify_courier_delivery_cancelled,
            notify_delivery_cancelled,
        )

        notify_delivery_cancelled(delivery, cancelled_by)
        if cancelled_by == "customer" and delivery.driver:
            notify_courier_delivery_cancelled(
                delivery.driver,
                delivery,
                reason="The customer cancelled this delivery.",
            )
        _notify_merchant_for_delivery(delivery, "cancelled")
        _send_cancel_sms(delivery, cancelled_by)
    except Exception:
        logger.exception("Failed delivery cancellation notification for delivery %s", delivery.id)


def notify_delivery_payment_event(delivery):
    """Notify customer after successful delivery payment."""
    try:
        from notifications.push import notify_delivery_payment

        notify_delivery_payment(delivery.customer, delivery)
    except Exception:
        logger.exception("Failed delivery payment notification for delivery %s", delivery.id)

    try:
        from notifications.email_service import send_delivery_receipt_email

        send_delivery_receipt_email(delivery)
    except Exception:
        logger.exception("Failed delivery receipt email for delivery %s", delivery.id)


def _send_cancel_sms(delivery, cancelled_by):
    try:
        from notifications.sms_fallback import send_critical_sms

        if cancelled_by == "customer":
            send_critical_sms(
                delivery.customer,
                f"Yala Delivery #{delivery.id} was cancelled.",
                notification_type="delivery_cancelled",
            )
            if delivery.driver:
                send_critical_sms(
                    delivery.driver,
                    f"Delivery #{delivery.id} was cancelled by the customer.",
                    notification_type="delivery_cancelled",
                )
        elif cancelled_by == "admin":
            send_critical_sms(
                delivery.customer,
                f"Yala Delivery #{delivery.id} was cancelled by support.",
                notification_type="delivery_cancelled",
            )
    except Exception:
        logger.exception("Failed cancel SMS for delivery %s", delivery.id)


def _notify_merchant_for_delivery(delivery, event_type):
    order = delivery.merchant_orders.select_related("merchant").first()
    if not order:
        return
    try:
        from merchants.services.notifications import notify_merchant_order_update

        notify_merchant_order_update(order, event_type)
    except Exception:
        logger.exception(
            "Failed merchant notification %s for delivery %s", event_type, delivery.id
        )