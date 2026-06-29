"""SMS fallback for critical delivery notifications."""

import logging

from django.conf import settings

logger = logging.getLogger(__name__)

CRITICAL_TYPES = {
    "delivery_cancelled",
    "delivery_payment_failed",
    "delivery_sos",
}


def send_critical_sms(user, message: str, notification_type: str = ""):
    """Send SMS for critical events when provider is configured."""
    if notification_type and notification_type not in CRITICAL_TYPES:
        return False

    phone = getattr(user, "phone_number", "") or ""
    if not phone:
        return False

    provider = getattr(settings, "YALA_SMS_PROVIDER", "")
    if not provider:
        return False

    try:
        from authapp.phone_views import send_sms

        send_sms(phone, message[:320])
        return True
    except Exception:
        logger.exception("Critical SMS failed for user %s", getattr(user, "id", None))
        return False
