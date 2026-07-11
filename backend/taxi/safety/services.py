import logging

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.contrib.auth import get_user_model

from notifications.push import send_push_to_user

from .models import EmergencyAlert

logger = logging.getLogger(__name__)


def delivery_snapshot(delivery):
    if not delivery:
        return {}
    return {
        "delivery_id": delivery.id,
        "status": delivery.status,
        "pickup": delivery.pickup,
        "destination": delivery.destination,
        "pickup_lat": delivery.pickup_lat,
        "pickup_lng": delivery.pickup_lng,
        "destination_lat": delivery.destination_lat,
        "destination_lng": delivery.destination_lng,
        "customer_id": delivery.customer_id,
        "customer_name": delivery.customer.get_full_name().strip() or delivery.customer.email,
        "driver_id": delivery.driver_id,
        "driver_name": (
            delivery.driver.get_full_name().strip() or delivery.driver.email
            if delivery.driver
            else ""
        ),
        "service_category": delivery.service_category,
        "service_city": delivery.service_city,
    }


def ride_snapshot(ride):
    if not ride:
        return {}
    driver_profile = (
        getattr(ride.driver, "driver_profile", None)
        if ride.driver
        else None
    )
    completed_trips = 0
    if ride.driver_id:
        try:
            from taxi.rides.models import Ride as RideModel

            completed_trips = RideModel.objects.filter(
                driver_id=ride.driver_id, status="completed"
            ).count()
        except Exception:
            pass
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
        "driver_verified": bool(
            ride.driver and getattr(ride.driver, "driver_status", "") == "approved"
        ),
        "driver_level": getattr(driver_profile, "driver_level", "") if driver_profile else "",
        "driver_avg_rating": float(getattr(driver_profile, "average_rating", 0) or 0)
        if driver_profile
        else 0,
        "completed_trips": completed_trips,
        "vehicle_make": getattr(driver_profile, "vehicle_make", "") if driver_profile else "",
        "vehicle_model": getattr(driver_profile, "vehicle_model", "") if driver_profile else "",
        "vehicle_color": getattr(driver_profile, "vehicle_color", "") if driver_profile else "",
        "plate_number": getattr(driver_profile, "plate_number", "") if driver_profile else "",
        "vehicle_photo_url": (
            driver_profile.vehicle_photo.url
            if driver_profile and getattr(driver_profile, "vehicle_photo", None)
            else ""
        ),
        "vehicle_verified": bool(
            driver_profile and getattr(driver_profile, "registration_status", "") == "approved"
        ),
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
        "delivery_id": incident.delivery_id or "",
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
    elif incident.delivery:
        counterpart = (
            incident.delivery.driver
            if incident.reporter_id == incident.delivery.customer_id
            else incident.delivery.customer
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
