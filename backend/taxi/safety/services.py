import logging

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.contrib.auth import get_user_model

from notifications.push import send_push_to_user

from .models import EmergencyAlert

logger = logging.getLogger(__name__)


def ride_snapshot(ride):
    if not ride:
        return {}
    driver_profile = (
        getattr(ride.driver, "driver_profile", None)
        if ride.driver
        else None
    )
    return {
        "ride_id": ride.id,
        "status": ride.status,
        "pickup": ride.pickup,
        "destination": ride.destination,
        "pickup_lat": ride.pickup_lat,
        "pickup_lng": ride.pickup_lng,
        "destination_lat": ride.destination_lat,
        "destination_lng": ride.destination_lng,
        "rider_id": ride.rider_id,
        "rider_name": ride.rider.get_full_name().strip() or ride.rider.email,
        "driver_id": ride.driver_id,
        "driver_name": (
            ride.driver.get_full_name().strip() or ride.driver.email
            if ride.driver
            else ""
        ),
        "driver_latitude": getattr(driver_profile, "current_lat", None),
        "driver_longitude": getattr(driver_profile, "current_lng", None),
        "city": ride.city.name if ride.city else "",
    }


def dispatch_emergency_alert(incident):
    contacts = list(
        incident.reporter.emergency_contacts.values(
            "name", "phone_number", "relationship", "is_primary"
        )
    )
    alert = EmergencyAlert.objects.create(
        incident=incident,
        contacts_snapshot=contacts,
    )
    payload = {
        "type": "safety_sos",
        "incident_id": incident.id,
        "reference": incident.reference,
        "ride_id": incident.ride_id or "",
        "latitude": incident.latitude or "",
        "longitude": incident.longitude or "",
        "deep_link": "/admin-dashboard",
    }
    User = get_user_model()
    admins = User.objects.filter(is_staff=True, is_active=True)
    sent = 0
    for admin in admins:
        sent += send_push_to_user(
            admin,
            f"EMERGENCY {incident.reference}",
            f"{incident.reporter.get_full_name() or incident.reporter.email} triggered SOS.",
            payload,
            app_type="web",
        )

    counterpart = None
    if incident.ride:
        counterpart = (
            incident.ride.driver
            if incident.reporter_id == incident.ride.rider_id
            else incident.ride.rider
        )
    counterpart_notified = False
    if counterpart:
        send_push_to_user(
            counterpart,
            "Ride safety alert",
            "An SOS was triggered for your active ride. Stop safely and await support.",
            {
                **payload,
                "deep_link": "/driver" if counterpart.user_type == "driver" else "/rider-dashboard",
            },
            app_type=counterpart.user_type,
        )
        counterpart_notified = True

    alert.admin_notifications_sent = sent
    alert.counterpart_notified = counterpart_notified
    alert.delivery_log = {
        "admin_user_count": admins.count(),
        "push_deliveries": sent,
        "emergency_contacts_recorded": len(contacts),
    }
    alert.save(
        update_fields=[
            "admin_notifications_sent",
            "counterpart_notified",
            "delivery_log",
        ]
    )

    try:
        async_to_sync(get_channel_layer().group_send)(
            "admin_safety",
            {
                "type": "safety_alert",
                "incident_id": incident.id,
                "reference": incident.reference,
            },
        )
    except Exception:
        logger.exception("Could not broadcast SOS alert %s", incident.reference)
    return alert
