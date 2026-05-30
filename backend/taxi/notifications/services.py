"""
Push notification service.
Uses pywebpush for Web Push API notifications.
Falls back silently if pywebpush is not installed or keys are not configured.
"""
import json
import logging

from django.conf import settings

logger = logging.getLogger(__name__)


def send_push_notification(user, title, body, data=None):
    """Send a push notification to all of a user's subscribed devices."""
    try:
        from pywebpush import webpush, WebPushException
    except ImportError:
        logger.debug("pywebpush not installed, skipping push notification")
        return 0

    vapid_private_key = getattr(settings, "PUSH_PRIVATE_KEY", "")
    vapid_claims_email = getattr(settings, "PUSH_CLAIMS_EMAIL", "mailto:admin@yala.mr")

    if not vapid_private_key:
        logger.debug("PUSH_PRIVATE_KEY not configured, skipping push")
        return 0

    from .models import PushSubscription

    subscriptions = PushSubscription.objects.filter(user=user)
    sent = 0

    payload = json.dumps({
        "title": title,
        "body": body,
        "data": data or {},
    })

    for sub in subscriptions:
        try:
            webpush(
                subscription_info={
                    "endpoint": sub.endpoint,
                    "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
                },
                data=payload,
                vapid_private_key=vapid_private_key,
                vapid_claims={"sub": vapid_claims_email},
            )
            sent += 1
        except Exception as e:
            logger.warning("Push notification failed for %s: %s", sub.endpoint, e)
            # Remove invalid subscriptions
            if "410" in str(e) or "404" in str(e):
                sub.delete()

    return sent


def notify_ride_requested(ride):
    """Notify all available drivers about a new ride request."""
    from taxi.drivers.models import DriverProfile

    online_drivers = DriverProfile.objects.filter(
        is_available=True, status="approved"
    ).select_related("user")

    for profile in online_drivers:
        send_push_notification(
            profile.user,
            "New ride request",
            f"{ride.pickup} → {ride.destination} · {ride.fare} MRU",
            {"type": "ride_request", "ride_id": ride.id},
        )


def notify_ride_accepted(ride):
    """Notify rider that a driver accepted their ride."""
    driver_name = f"{ride.driver.first_name} {ride.driver.last_name}".strip() or "Your driver"
    send_push_notification(
        ride.rider,
        "Driver on the way",
        f"{driver_name} accepted your ride and is heading to pickup.",
        {"type": "ride_accepted", "ride_id": ride.id},
    )


def notify_ride_completed(ride):
    """Notify rider that the ride is complete."""
    send_push_notification(
        ride.rider,
        "Trip completed",
        f"You arrived at {ride.destination}. Fare: {ride.fare} MRU",
        {"type": "ride_completed", "ride_id": ride.id},
    )
