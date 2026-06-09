"""Firebase Cloud Messaging delivery and Yala notification helpers."""
import json
import logging
import os
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, messaging

logger = logging.getLogger(__name__)
_firebase_app = None


def _get_firebase_app():
    global _firebase_app
    if _firebase_app:
        return _firebase_app

    try:
        service_json = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON", "").strip()
        if service_json:
            cred = credentials.Certificate(json.loads(service_json))
        else:
            key_path = os.getenv(
                "FIREBASE_SERVICE_ACCOUNT_KEY",
                str(Path(__file__).resolve().parent.parent / "firebase-service-account.json"),
            )
            if not os.path.exists(key_path):
                logger.warning("Firebase service account key not found at %s", key_path)
                return None
            cred = credentials.Certificate(key_path)
        _firebase_app = firebase_admin.initialize_app(cred)
        return _firebase_app
    except Exception:
        logger.exception("Failed to initialize Firebase")
        return None


def send_push_notification(fcm_token, title, body, data=None):
    """Return sent, invalid, or failed after attempting delivery."""
    app = _get_firebase_app()
    if not app:
        return "failed"

    payload = {key: str(value) for key, value in (data or {}).items()}
    try:
        messaging.send(
            messaging.Message(
                notification=messaging.Notification(title=title, body=body),
                data=payload,
                token=fcm_token,
                android=messaging.AndroidConfig(
                    priority="high",
                    notification=messaging.AndroidNotification(
                        sound="default",
                        channel_id="yala_rides",
                        click_action="FCM_PLUGIN_ACTIVITY",
                        tag=payload.get("type"),
                    ),
                ),
                apns=messaging.APNSConfig(
                    headers={"apns-priority": "10"},
                    payload=messaging.APNSPayload(
                        aps=messaging.Aps(
                            sound="default",
                            content_available=True,
                        )
                    ),
                ),
            ),
            app=app,
        )
        return "sent"
    except messaging.UnregisteredError:
        return "invalid"
    except Exception:
        logger.exception("Failed to send push notification")
        return "failed"


def send_push_to_user(user, title, body, data=None, app_type=None):
    """Save notification history and deliver to the user's matching devices."""
    from .models import FCMToken, NotificationHistory

    payload = {key: str(value) for key, value in (data or {}).items()}
    deep_link = payload.get("deep_link", "")
    ride_id = payload.get("ride_id")
    NotificationHistory.objects.create(
        user=user,
        title=title,
        body=body,
        notification_type=payload.get("type", ""),
        ride_id=int(ride_id) if ride_id else None,
        data=payload,
        deep_link=deep_link,
    )

    tokens = FCMToken.objects.filter(user=user, is_active=True)
    if app_type:
        tokens = tokens.filter(app_type__in=(app_type, "web"))

    sent_count = 0
    for token_obj in tokens:
        result = send_push_notification(token_obj.token, title, body, payload)
        if result == "sent":
            sent_count += 1
        elif result == "invalid":
            token_obj.is_active = False
            token_obj.save(update_fields=["is_active"])
    return sent_count


def notify_new_ride_request(driver_user, ride):
    send_push_to_user(
        driver_user,
        "New Ride Request",
        f"Pickup: {ride.pickup} -> {ride.destination}",
        {"type": "ride_request", "ride_id": ride.id, "deep_link": "/driver"},
        app_type="driver",
    )


def notify_new_ride_request_to_drivers(ride):
    from taxi.drivers.models import DriverProfile

    profiles = DriverProfile.objects.filter(
        status="approved", is_available=True
    ).select_related("user")
    for profile in profiles:
        notify_new_ride_request(profile.user, ride)


def notify_ride_accepted(rider_user, ride):
    driver_name = ride.driver.get_full_name() if ride.driver else "A driver"
    send_push_to_user(
        rider_user,
        "Driver Accepted",
        f"{driver_name} is on the way to pick you up.",
        {"type": "ride_accepted", "ride_id": ride.id, "deep_link": "/rider-dashboard"},
        app_type="rider",
    )


def notify_driver_arriving(rider_user, ride):
    driver_name = ride.driver.get_full_name() if ride.driver else "Your driver"
    send_push_to_user(
        rider_user,
        "Driver is arriving",
        f"{driver_name} is heading to your pickup location.",
        {"type": "driver_arriving", "ride_id": ride.id, "deep_link": "/rider-dashboard"},
        app_type="rider",
    )


def notify_driver_arrived(rider_user, ride):
    send_push_to_user(
        rider_user,
        "Driver Arrived",
        f"Your driver has arrived at {ride.pickup}. Your PIN: {ride.pickup_pin}",
        {"type": "driver_arrived", "ride_id": ride.id, "deep_link": "/rider-dashboard"},
        app_type="rider",
    )


def notify_ride_started(rider_user, ride):
    send_push_to_user(
        rider_user,
        "Ride Started",
        f"Your ride to {ride.destination} has started.",
        {"type": "ride_started", "ride_id": ride.id, "deep_link": "/rider-dashboard"},
        app_type="rider",
    )


def notify_ride_completed(rider_user, ride):
    send_push_to_user(
        rider_user,
        "Ride Completed",
        f"You've arrived at {ride.destination}. Fare: {ride.fare} MRU",
        {"type": "ride_completed", "ride_id": ride.id, "deep_link": "/rider-history"},
        app_type="rider",
    )


def notify_payment_successful(rider_user, payment):
    ride = payment.ride
    send_push_to_user(
        rider_user,
        "Payment Successful",
        f"Your payment of {payment.amount} MRU was successful.",
        {"type": "payment_successful", "ride_id": ride.id, "deep_link": "/rider-payments"},
        app_type="rider",
    )


def notify_payment_completed(driver_user, ride):
    send_push_to_user(
        driver_user,
        "Payment Received",
        f"Earned {ride.driver_earning} MRU for ride to {ride.destination}.",
        {"type": "payment_completed", "ride_id": ride.id, "deep_link": "/driver/earnings"},
        app_type="driver",
    )


def notify_ride_cancelled(user, ride, cancelled_by):
    if cancelled_by == "rider" and ride.driver:
        recipient, app_type, deep_link = ride.driver, "driver", "/driver"
        body = f"The rider cancelled the ride from {ride.pickup}."
    elif cancelled_by == "driver":
        recipient, app_type, deep_link = ride.rider, "rider", "/rider-dashboard"
        body = "Your driver cancelled the ride. We'll find you another driver."
    else:
        return
    send_push_to_user(
        recipient,
        "Ride Cancelled",
        body,
        {"type": "ride_cancelled", "ride_id": ride.id, "deep_link": deep_link},
        app_type=app_type,
    )


def notify_new_message(recipient_user, sender_name, ride):
    is_driver = recipient_user == ride.driver
    send_push_to_user(
        recipient_user,
        f"New Message from {sender_name}",
        "Tap to view the message.",
        {
            "type": "chat_message",
            "ride_id": ride.id,
            "deep_link": "/driver" if is_driver else "/rider-dashboard",
        },
        app_type="driver" if is_driver else "rider",
    )


def save_notification_history(user, title, body, notification_type, ride_id=None):
    from .models import NotificationHistory

    NotificationHistory.objects.create(
        user=user,
        title=title,
        body=body,
        notification_type=notification_type,
        ride_id=ride_id,
    )
