"""Firebase Cloud Messaging delivery and Yala notification helpers."""
import json
import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)
_firebase_app = None


def _load_firebase():
    try:
        import firebase_admin
        from firebase_admin import credentials, messaging
    except ImportError:
        logger.warning("firebase-admin is not installed; push notifications are disabled.")
        return None, None, None
    return firebase_admin, credentials, messaging


def _get_firebase_app():
    global _firebase_app
    if _firebase_app:
        return _firebase_app

    firebase_admin, credentials, _messaging = _load_firebase()
    if not firebase_admin:
        return None

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


def send_push_notification(fcm_token, title, body, data=None, android_channel_id="yala_rides"):
    """Return sent, invalid, or failed after attempting delivery."""
    app = _get_firebase_app()
    if not app:
        return "failed"

    _, _, messaging = _load_firebase()
    if not messaging:
        return "failed"

    payload = {key: str(value) for key, value in (data or {}).items()}
    try:
        messaging.send(            messaging.Message(
                notification=messaging.Notification(title=title, body=body),
                data=payload,
                token=fcm_token,
                android=messaging.AndroidConfig(
                    priority="high",
                    notification=messaging.AndroidNotification(
                        sound="default",
                        channel_id=android_channel_id,
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


def send_push_to_user(user, title, body, data=None, app_type=None, android_channel_id="yala_rides"):
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
        result = send_push_notification(
            token_obj.token, title, body, payload, android_channel_id=android_channel_id
        )
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


def _courier_notification_enabled(driver_user, field_name):
    """Return True when the courier has not disabled a notification category."""
    from taxi.drivers.models import DriverProfile, DriverSettings

    try:
        profile = DriverProfile.objects.select_related("settings").get(user=driver_user)
    except DriverProfile.DoesNotExist:
        return True

    settings = getattr(profile, "settings", None)
    if settings is None:
        settings = DriverSettings.objects.filter(driver=profile).first()
    if not settings:
        return True
    return bool(getattr(settings, field_name, True))


def _courier_display_name(delivery):
    driver = delivery.driver
    if not driver:
        return "Your courier"
    return driver.get_full_name() or "Your courier"


def notify_new_delivery_request(driver_user_id, delivery):
    """Alert a courier about a new delivery offer."""
    from django.contrib.auth import get_user_model

    User = get_user_model()
    try:
        driver_user = User.objects.get(id=driver_user_id)
    except User.DoesNotExist:
        return 0

    if not _courier_notification_enabled(driver_user, "notifications_rides"):
        return 0

    return send_push_to_user(
        driver_user,
        "New Delivery Request",
        f"{delivery.pickup} → {delivery.destination} · {delivery.fare} MRU",
        {
            "type": "delivery_new_request",
            "delivery_id": delivery.id,
            "deep_link": "/delivery/courier",
        },
        app_type="delivery",
        android_channel_id="yala_deliveries",
    )


def notify_delivery_accepted(customer_user, delivery):
    courier_name = _courier_display_name(delivery)
    return send_push_to_user(
        customer_user,
        "Courier Accepted",
        f"{courier_name} accepted your delivery and is heading to pickup.",
        {
            "type": "delivery_accepted",
            "delivery_id": delivery.id,
            "deep_link": "/delivery",
        },
        app_type="rider",
        android_channel_id="yala_deliveries",
    )


def notify_delivery_courier_arriving(customer_user, delivery):
    courier_name = _courier_display_name(delivery)
    return send_push_to_user(
        customer_user,
        "Courier Arriving",
        f"{courier_name} is on the way to {delivery.pickup}.",
        {
            "type": "delivery_courier_arriving",
            "delivery_id": delivery.id,
            "deep_link": "/delivery",
        },
        app_type="rider",
        android_channel_id="yala_deliveries",
    )


def notify_delivery_picked_up(customer_user, delivery):
    return send_push_to_user(
        customer_user,
        "Package Picked Up",
        f"Your delivery is on the way to {delivery.destination}.",
        {
            "type": "delivery_picked_up",
            "delivery_id": delivery.id,
            "deep_link": "/delivery",
        },
        app_type="rider",
        android_channel_id="yala_deliveries",
    )


def notify_delivery_delivered(customer_user, delivery):
    return send_push_to_user(
        customer_user,
        "Delivery Complete",
        f"Your package was delivered to {delivery.destination}. Rate your courier and pay.",
        {
            "type": "delivery_delivered",
            "delivery_id": delivery.id,
            "deep_link": "/delivery",
        },
        app_type="rider",
        android_channel_id="yala_deliveries",
    )


def notify_delivery_payment(customer_user, delivery):
    total = delivery.fare or 0
    tip = delivery.tip_amount or 0
    amount = total + tip
    return send_push_to_user(
        customer_user,
        "Payment Successful",
        f"Your payment of {amount} MRU for delivery #{delivery.id} was successful.",
        {
            "type": "delivery_payment_successful",
            "delivery_id": delivery.id,
            "deep_link": "/delivery",
        },
        app_type="rider",
        android_channel_id="yala_deliveries",
    )


def notify_delivery_cancelled(delivery, cancelled_by):
    """Notify the customer when a delivery is cancelled."""
    if cancelled_by == "customer":
        send_push_to_user(
            delivery.customer,
            "Delivery Cancelled",
            "Your delivery request was cancelled.",
            {
                "type": "delivery_cancelled",
                "delivery_id": delivery.id,
                "deep_link": "/delivery",
            },
            app_type="rider",
            android_channel_id="yala_deliveries",
        )
        return

    if cancelled_by == "admin":
        for user, app_type, deep_link in (
            (delivery.customer, "rider", "/delivery"),
            (delivery.driver, "delivery", "/delivery/courier"),
        ):
            if not user:
                continue
            if user == delivery.driver and not _courier_notification_enabled(
                user, "notifications_delivery_updates"
            ):
                continue
            send_push_to_user(
                user,
                "Delivery Cancelled",
                f"Delivery #{delivery.id} was cancelled by support.",
                {
                    "type": "delivery_cancelled",
                    "delivery_id": delivery.id,
                    "deep_link": deep_link,
                },
                app_type=app_type,
                android_channel_id="yala_deliveries",
            )


def notify_courier_delivery_cancelled(courier_user, delivery, reason=""):
    if not _courier_notification_enabled(courier_user, "notifications_delivery_updates"):
        return 0
    body = reason or f"Delivery #{delivery.id} from {delivery.pickup} was cancelled."
    return send_push_to_user(
        courier_user,
        "Delivery Cancelled",
        body,
        {
            "type": "delivery_cancelled",
            "delivery_id": delivery.id,
            "deep_link": "/delivery/courier",
        },
        app_type="delivery",
        android_channel_id="yala_deliveries",
    )


def notify_courier_payout(courier_user, withdrawal):
    if not _courier_notification_enabled(courier_user, "notifications_delivery_updates"):
        return 0
    return send_push_to_user(
        courier_user,
        "Payout Processed",
        f"Your withdrawal of {withdrawal.amount} MRU has been approved.",
        {
            "type": "delivery_payout",
            "withdrawal_id": withdrawal.id,
            "deep_link": "/delivery/bank",
        },
        app_type="delivery",
        android_channel_id="yala_deliveries",
    )


def notify_delivery_courier_nearby(customer_user, delivery, zone="pickup"):
    if zone == "dropoff":
        title = "Courier Nearby"
        body = f"Your courier is almost at {delivery.destination}."
        notif_type = "delivery_courier_near_dropoff"
    else:
        title = "Courier Nearby"
        body = f"Your courier is almost at the pickup point."
        notif_type = "delivery_courier_near_pickup"
    return send_push_to_user(
        customer_user,
        title,
        body,
        {
            "type": notif_type,
            "delivery_id": delivery.id,
            "deep_link": "/delivery",
        },
        app_type="rider",
        android_channel_id="yala_deliveries",
    )


def notify_delivery_chat_message(recipient_user, delivery, sender_name, text):
    is_courier = recipient_user_id_matches_driver(recipient_user, delivery)
    return send_push_to_user(
        recipient_user,
        f"Message from {sender_name}",
        text,
        {
            "type": "delivery_chat_message",
            "delivery_id": delivery.id,
            "deep_link": "/delivery/courier" if is_courier else "/delivery",
        },
        app_type="delivery" if is_courier else "rider",
        android_channel_id="yala_deliveries",
    )


def recipient_user_id_matches_driver(recipient_user, delivery):
    return delivery.driver_id == recipient_user.id


def notify_courier_bonus(courier_user, amount, reason, program_id=None):
    if not _courier_notification_enabled(courier_user, "notifications_promotions"):
        return 0
    payload = {
        "type": "delivery_bonus",
        "deep_link": "/delivery/earnings",
    }
    if program_id:
        payload["program_id"] = program_id
    return send_push_to_user(
        courier_user,
        "Bonus Earned!",
        f"{reason} +{amount} MRU",
        payload,
        app_type="delivery",
        android_channel_id="yala_deliveries",
    )


def notify_merchant_order_event(merchant_user_id, order, event_type):
    """Alert merchant about order lifecycle events."""
    from django.contrib.auth import get_user_model

    User = get_user_model()
    try:
        merchant_user = User.objects.get(id=merchant_user_id)
    except User.DoesNotExist:
        return 0

    titles = {
        "new_order": "New Order",
        "ready_for_pickup": "Ready for Courier",
        "courier_arrived": "Courier Arrived",
        "picked_up": "Order Picked Up",
        "delivered": "Order Delivered",
        "cancelled": "Order Cancelled",
        "payment_received": "Payment Received",
    }
    bodies = {
        "new_order": f"Order #{order.id} — {order.total} MRU from {order.recipient_name}",
        "ready_for_pickup": f"Order #{order.id} is ready — a courier is on the way.",
        "courier_arrived": f"Courier arrived for order #{order.id}",
        "picked_up": f"Courier picked up order #{order.id}",
        "delivered": f"Order #{order.id} was delivered successfully",
        "cancelled": f"Order #{order.id} was cancelled",
        "payment_received": f"Payment received for order #{order.id} — {order.total} MRU",
    }
    return send_push_to_user(
        merchant_user,
        titles.get(event_type, "Order Update"),
        bodies.get(event_type, f"Order #{order.id} updated"),
        {
            "type": f"merchant_{event_type}",
            "order_id": order.id,
            "deep_link": "/merchant/orders",
        },
        app_type="rider",
        android_channel_id="yala_merchants",
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
