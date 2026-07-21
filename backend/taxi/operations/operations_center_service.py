"""Real-time operations center aggregations for live dispatch monitoring."""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db.models import Count, Sum
from django.utils import timezone

from deliveries.models import Delivery
from payments.models import PaymentRecord, RefundRequest, WithdrawalRequest
from safety.models import SafetyIncident
from security.models import AuditLog, FraudFlag
from taxi.drivers.models import DriverDocument, DriverProfile
from taxi.rides.models import Ride
from taxi.rides.services.driver_dispatch_service import AVG_CITY_SPEED_KMH, haversine_km

from .executive_service import DELIVERY_ACTIVE, RIDE_ACTIVE, _dec

User = get_user_model()

OPEN_INCIDENT_STATUSES = ["open", "acknowledged", "investigating"]


def _user_contact(user) -> dict:
    if not user:
        return {}
    profile = getattr(user, "driver_profile", None)
    return {
        "id": user.id,
        "name": user.get_full_name() or user.email,
        "email": user.email,
        "phone": getattr(user, "phone_number", "") or "",
        "vehicle": (
            f"{profile.vehicle_make} {profile.vehicle_model} ({profile.vehicle_plate})"
            if profile and profile.vehicle_plate
            else None
        ),
    }


def _eta_minutes(from_lat, from_lng, to_lat, to_lng) -> float | None:
    if None in (from_lat, from_lng, to_lat, to_lng):
        return None
    distance = haversine_km(from_lat, from_lng, to_lat, to_lng)
    return round((distance / AVG_CITY_SPEED_KMH) * 60.0, 1)


def _waiting_seconds(ride: Ride) -> int | None:
    if ride.status == "driver_arrived" and ride.driver_arrived_at:
        return int((timezone.now() - ride.driver_arrived_at).total_seconds())
    if ride.status in {"requested", "driver_arriving"}:
        return int((timezone.now() - ride.created_at).total_seconds())
    return None


def build_fleet_snapshot(city_id=None) -> dict:
    profiles = DriverProfile.objects.filter(status="approved").select_related("user")
    if city_id:
        profiles = profiles.filter(user__city_id=city_id)

    busy_driver_ids = set(
        Ride.objects.filter(status__in=RIDE_ACTIVE, driver__isnull=False).values_list(
            "driver_id", flat=True
        )
    )
    online_courier_ids = set(
        Delivery.objects.filter(status__in=DELIVERY_ACTIVE, driver__isnull=False).values_list(
            "driver_id", flat=True
        )
    )

    online_drivers = []
    busy_drivers = []
    offline_drivers = []
    online_couriers = []

    for profile in profiles:
        user = profile.user
        entry = {
            "id": user.id,
            "name": user.get_full_name() or user.email,
            "lat": profile.current_lat,
            "lng": profile.current_lng,
            "is_available": profile.is_available,
            "vehicle_plate": profile.vehicle_plate or profile.plate_number,
        }
        if user.id in online_courier_ids:
            online_couriers.append({**entry, "status": "busy_courier"})
        elif user.id in busy_driver_ids:
            busy_drivers.append({**entry, "status": "busy"})
        elif profile.is_available:
            online_drivers.append({**entry, "status": "online"})
        else:
            offline_drivers.append({**entry, "status": "offline"})

    active_riders = Ride.objects.filter(status__in=RIDE_ACTIVE).values_list("rider_id", flat=True).distinct()
    waiting_riders = (
        Ride.objects.filter(status="requested", driver__isnull=True)
        .select_related("rider")
        .order_by("-created_at")[:100]
    )

    return {
        "generated_at": timezone.now().isoformat(),
        "counts": {
            "online_drivers": len(online_drivers),
            "busy_drivers": len(busy_drivers),
            "offline_drivers": len(offline_drivers),
            "online_couriers": len(online_couriers),
            "active_riders": len(set(active_riders)),
            "active_trips": Ride.objects.filter(status__in=RIDE_ACTIVE).count(),
            "active_deliveries": Delivery.objects.filter(status__in=DELIVERY_ACTIVE).count(),
            "waiting_riders": waiting_riders.count(),
        },
        "online_drivers": online_drivers[:200],
        "busy_drivers": busy_drivers[:200],
        "offline_drivers": offline_drivers[:100],
        "online_couriers": online_couriers[:200],
        "waiting_riders": [
            {
                "ride_id": ride.id,
                "rider": _user_contact(ride.rider),
                "pickup": ride.pickup,
                "pickup_lat": ride.pickup_lat,
                "pickup_lng": ride.pickup_lng,
                "waiting_seconds": int((timezone.now() - ride.created_at).total_seconds()),
            }
            for ride in waiting_riders
        ],
    }


def build_ops_map(city_id=None) -> dict:
    markers = {
        "drivers": [],
        "couriers": [],
        "riders_waiting": [],
        "trips": [],
        "deliveries": [],
        "sos": [],
    }

    busy_ids = set(
        Ride.objects.filter(status__in=RIDE_ACTIVE, driver__isnull=False).values_list(
            "driver_id", flat=True
        )
    )
    for profile in DriverProfile.objects.filter(
        status="approved",
        current_lat__isnull=False,
        current_lng__isnull=False,
    ).select_related("user")[:500]:
        if city_id and profile.user.city_id != city_id:
            continue
        kind = "driver_busy" if profile.user_id in busy_ids else "driver"
        markers["drivers"].append(
            {
                "id": profile.user_id,
                "kind": kind,
                "lat": profile.current_lat,
                "lng": profile.current_lng,
                "label": profile.user.get_full_name() or profile.user.email,
            }
        )

    for ride in Ride.objects.filter(status="requested", driver__isnull=True).exclude(
        pickup_lat__isnull=True
    )[:100]:
        markers["riders_waiting"].append(
            {
                "id": ride.id,
                "kind": "rider_waiting",
                "lat": ride.pickup_lat,
                "lng": ride.pickup_lng,
                "label": ride.rider.get_full_name() if ride.rider else f"Ride #{ride.id}",
            }
        )

    for ride in Ride.objects.filter(status__in=RIDE_ACTIVE).select_related("driver__driver_profile")[:200]:
        lat = ride.pickup_lat
        lng = ride.pickup_lng
        if ride.driver and ride.driver.driver_profile.current_lat is not None:
            lat = ride.driver.driver_profile.current_lat
            lng = ride.driver.driver_profile.current_lng
        markers["trips"].append(
            {
                "id": ride.id,
                "kind": "trip",
                "lat": lat,
                "lng": lng,
                "status": ride.status,
                "animated": ride.status in {"driver_arriving", "in_progress"},
            }
        )

    for delivery in Delivery.objects.filter(status__in=DELIVERY_ACTIVE).select_related(
        "driver__driver_profile"
    )[:200]:
        lat = delivery.pickup_lat
        lng = delivery.pickup_lng
        if delivery.driver and delivery.driver.driver_profile.current_lat is not None:
            lat = delivery.driver.driver_profile.current_lat
            lng = delivery.driver.driver_profile.current_lng
        markers["deliveries"].append(
            {
                "id": delivery.id,
                "kind": "delivery",
                "lat": lat,
                "lng": lng,
                "status": delivery.status,
            }
        )

    for courier in DriverProfile.objects.filter(
        user_id__in=Delivery.objects.filter(status__in=DELIVERY_ACTIVE, driver__isnull=False).values_list(
            "driver_id", flat=True
        ),
        current_lat__isnull=False,
        current_lng__isnull=False,
    ).select_related("user")[:200]:
        markers["couriers"].append(
            {
                "id": courier.user_id,
                "kind": "courier",
                "lat": courier.current_lat,
                "lng": courier.current_lng,
                "label": courier.user.get_full_name() or courier.user.email,
            }
        )

    for incident in SafetyIncident.objects.filter(status__in=OPEN_INCIDENT_STATUSES).exclude(
        latitude__isnull=True
    )[:50]:
        markers["sos"].append(
            {
                "id": incident.id,
                "kind": "sos",
                "lat": incident.latitude,
                "lng": incident.longitude,
                "reference": incident.reference,
                "severity": incident.severity,
            }
        )

    return {"generated_at": timezone.now().isoformat(), "markers": markers}


def build_active_trips(city_id=None) -> list[dict]:
    rides = (
        Ride.objects.filter(status__in=RIDE_ACTIVE)
        .select_related("rider", "driver", "driver__driver_profile", "city")
        .order_by("-created_at")
    )
    if city_id:
        rides = rides.filter(city_id=city_id)

    payload = []
    for ride in rides[:200]:
        driver_profile = getattr(ride.driver, "driver_profile", None) if ride.driver else None
        eta = None
        if driver_profile and driver_profile.current_lat is not None:
            target_lat = ride.pickup_lat if ride.status in {"requested", "driver_arriving", "driver_arrived"} else ride.destination_lat
            target_lng = ride.pickup_lng if ride.status in {"requested", "driver_arriving", "driver_arrived"} else ride.destination_lng
            eta = _eta_minutes(
                driver_profile.current_lat,
                driver_profile.current_lng,
                target_lat,
                target_lng,
            )
        payload.append(
            {
                "id": ride.id,
                "status": ride.status,
                "dispatch_status": ride.dispatch_status,
                "pickup": ride.pickup,
                "destination": ride.destination,
                "pickup_lat": ride.pickup_lat,
                "pickup_lng": ride.pickup_lng,
                "destination_lat": ride.destination_lat,
                "destination_lng": ride.destination_lng,
                "fare": _dec(ride.fare),
                "eta_minutes": eta,
                "waiting_seconds": _waiting_seconds(ride),
                "created_at": ride.created_at.isoformat(),
                "driver": _user_contact(ride.driver),
                "rider": _user_contact(ride.rider),
                "vehicle": (
                    {
                        "make": driver_profile.vehicle_make,
                        "model": driver_profile.vehicle_model,
                        "plate": driver_profile.vehicle_plate or driver_profile.plate_number,
                        "color": driver_profile.vehicle_color,
                    }
                    if driver_profile
                    else None
                ),
            }
        )
    return payload


def build_active_deliveries(city_id=None) -> list[dict]:
    deliveries = (
        Delivery.objects.filter(status__in=DELIVERY_ACTIVE)
        .select_related("customer", "driver", "driver__driver_profile")
        .order_by("-created_at")
    )
    if city_id:
        deliveries = deliveries.filter(service_city__icontains=str(city_id))

    payload = []
    for delivery in deliveries[:200]:
        profile = getattr(delivery.driver, "driver_profile", None) if delivery.driver else None
        eta = None
        if profile and profile.current_lat is not None:
            target_lat = delivery.destination_lat or delivery.pickup_lat
            target_lng = delivery.destination_lng or delivery.pickup_lng
            eta = _eta_minutes(profile.current_lat, profile.current_lng, target_lat, target_lng)
        payload.append(
            {
                "id": delivery.id,
                "status": delivery.status,
                "pickup": delivery.pickup,
                "destination": delivery.destination,
                "pickup_lat": delivery.pickup_lat,
                "pickup_lng": delivery.pickup_lng,
                "destination_lat": delivery.destination_lat,
                "destination_lng": delivery.destination_lng,
                "pickup_status": delivery.status,
                "dropoff_status": delivery.status,
                "eta_minutes": eta,
                "fare": _dec(delivery.fare),
                "store": delivery.store_name or delivery.pickup,
                "courier": _user_contact(delivery.driver),
                "customer": _user_contact(delivery.customer),
                "created_at": delivery.created_at.isoformat(),
            }
        )
    return payload


def build_emergency_center() -> dict:
    incidents = (
        SafetyIncident.objects.filter(status__in=OPEN_INCIDENT_STATUSES)
        .select_related("reporter", "reported_user", "assigned_to", "ride", "delivery")
        .order_by("-created_at")[:100]
    )
    items = []
    for incident in incidents:
        items.append(
            {
                "id": incident.id,
                "reference": incident.reference,
                "incident_type": incident.incident_type,
                "severity": incident.severity,
                "status": incident.status,
                "description": incident.description,
                "lat": incident.latitude,
                "lng": incident.longitude,
                "created_at": incident.created_at.isoformat(),
                "reporter": _user_contact(incident.reporter),
                "reported_user": _user_contact(incident.reported_user),
                "assigned_to": _user_contact(incident.assigned_to),
                "ride_id": incident.ride_id,
                "delivery_id": incident.delivery_id,
            }
        )
    return {
        "generated_at": timezone.now().isoformat(),
        "open_count": len(items),
        "critical_count": sum(1 for i in items if i["severity"] == "critical"),
        "incidents": items,
    }


def build_live_alerts() -> list[dict]:
    now = timezone.now()
    alerts = []

    for ride in Ride.objects.filter(status__in={"driver_arriving", "driver_arrived", "requested"}).select_related(
        "driver", "rider"
    )[:50]:
        waiting = _waiting_seconds(ride)
        if waiting and waiting > 600:
            alerts.append(
                {
                    "id": f"wait-ride-{ride.id}",
                    "type": "excessive_waiting",
                    "severity": "high",
                    "message": f"Ride #{ride.id} waiting {waiting // 60} min",
                    "entity_type": "ride",
                    "entity_id": ride.id,
                    "created_at": now.isoformat(),
                }
            )
        if ride.status in {"driver_arriving", "in_progress"} and ride.driver_id:
            profile = getattr(ride.driver, "driver_profile", None)
            if profile and not profile.is_available:
                alerts.append(
                    {
                        "id": f"offline-trip-{ride.id}",
                        "type": "driver_offline_during_trip",
                        "severity": "critical",
                        "message": f"Driver offline during ride #{ride.id}",
                        "entity_type": "ride",
                        "entity_id": ride.id,
                        "created_at": now.isoformat(),
                    }
                )

    expired_docs = DriverDocument.objects.filter(expires_at__lt=timezone.localdate())[:20]
    for doc in expired_docs:
        alerts.append(
            {
                "id": f"doc-{doc.id}",
                "type": "document_expiry",
                "severity": "medium",
                "message": f"Expired {doc.document_type} for driver profile #{doc.driver_id}",
                "entity_type": "driver_document",
                "entity_id": doc.id,
                "created_at": now.isoformat(),
            }
        )

    for flag in FraudFlag.objects.filter(status="open").order_by("-created_at")[:20]:
        alerts.append(
            {
                "id": f"fraud-{flag.id}",
                "type": "fraud_alert",
                "severity": flag.severity or "high",
                "message": flag.reason,
                "entity_type": "fraud_flag",
                "entity_id": flag.id,
                "created_at": flag.created_at.isoformat(),
            }
        )

    hour_ago = now - timedelta(hours=1)
    recent_requests = Ride.objects.filter(created_at__gte=hour_ago).count()
    if recent_requests >= 20:
        alerts.append(
            {
                "id": "surge-demand",
                "type": "surge_demand",
                "severity": "medium",
                "message": f"{recent_requests} ride requests in the last hour",
                "entity_type": "system",
                "entity_id": "surge",
                "created_at": now.isoformat(),
            }
        )

    return alerts[:100]


def build_operations_timeline(limit: int = 50) -> list[dict]:
    events = []
    for ride in Ride.objects.order_by("-created_at")[: limit // 2]:
        events.append(
            {
                "at": ride.created_at.isoformat(),
                "type": "trip_started" if ride.status in RIDE_ACTIVE else f"trip_{ride.status}",
                "summary": f"Ride #{ride.id} — {ride.status}",
                "entity_type": "ride",
                "entity_id": ride.id,
            }
        )
        if ride.completed_at:
            events.append(
                {
                    "at": ride.completed_at.isoformat(),
                    "type": "trip_completed",
                    "summary": f"Ride #{ride.id} completed",
                    "entity_type": "ride",
                    "entity_id": ride.id,
                }
            )
    for delivery in Delivery.objects.order_by("-created_at")[: limit // 4]:
        events.append(
            {
                "at": delivery.created_at.isoformat(),
                "type": f"delivery_{delivery.status}",
                "summary": f"Delivery #{delivery.id} — {delivery.status}",
                "entity_type": "delivery",
                "entity_id": delivery.id,
            }
        )
    for withdrawal in WithdrawalRequest.objects.order_by("-created_at")[:10]:
        events.append(
            {
                "at": withdrawal.created_at.isoformat(),
                "type": "withdrawal",
                "summary": f"Withdrawal #{withdrawal.id} — {withdrawal.status}",
                "entity_type": "withdrawal",
                "entity_id": withdrawal.id,
            }
        )
    for refund in RefundRequest.objects.order_by("-created_at")[:10]:
        events.append(
            {
                "at": refund.created_at.isoformat(),
                "type": "refund",
                "summary": f"Refund #{refund.id} — {refund.status}",
                "entity_type": "refund",
                "entity_id": refund.id,
            }
        )
    for log in AuditLog.objects.filter(summary__icontains="broadcast").order_by("-created_at")[:10]:
        events.append(
            {
                "at": log.created_at.isoformat(),
                "type": "broadcast",
                "summary": log.summary,
                "entity_type": log.entity_type,
                "entity_id": log.entity_id,
            }
        )
    for incident in SafetyIncident.objects.order_by("-created_at")[:10]:
        events.append(
            {
                "at": incident.created_at.isoformat(),
                "type": "incident",
                "summary": f"{incident.reference} — {incident.incident_type}",
                "entity_type": "incident",
                "entity_id": incident.id,
            }
        )
    events.sort(key=lambda item: item["at"], reverse=True)
    return events[:limit]


def build_hourly_analytics(city_id=None) -> dict:
    now = timezone.now()
    hour_start = now.replace(minute=0, second=0, microsecond=0)

    rides = Ride.objects.filter(created_at__gte=hour_start)
    if city_id:
        rides = rides.filter(city_id=city_id)

    requests = rides.count()
    completed = rides.filter(status="completed").count()
    cancelled = rides.filter(status="cancelled").count()
    accepted = rides.filter(driver__isnull=False).count()
    acceptance_rate = round((accepted / requests) * 100, 1) if requests else 0.0
    completion_rate = round((completed / requests) * 100, 1) if requests else 0.0
    cancellation_rate = round((cancelled / requests) * 100, 1) if requests else 0.0

    revenue = (
        PaymentRecord.objects.filter(status="paid", created_at__gte=hour_start).aggregate(
            total=Sum("amount")
        )["total"]
        or Decimal("0")
    )

    avg_eta = None
    eta_samples = []
    for ride in rides.filter(status__in=RIDE_ACTIVE).select_related("driver__driver_profile")[:100]:
        profile = getattr(ride.driver, "driver_profile", None) if ride.driver else None
        if profile and profile.current_lat is not None:
            eta = _eta_minutes(profile.current_lat, profile.current_lng, ride.pickup_lat, ride.pickup_lng)
            if eta is not None:
                eta_samples.append(eta)
    if eta_samples:
        avg_eta = round(sum(eta_samples) / len(eta_samples), 1)
    waiting_rides = rides.filter(status__in={"requested", "driver_arriving", "driver_arrived"})
    wait_samples = [_waiting_seconds(ride) for ride in waiting_rides[:100]]
    wait_samples = [value for value in wait_samples if value is not None]
    avg_wait = round(sum(wait_samples) / len(wait_samples) / 60.0, 1) if wait_samples else None

    return {
        "hour_start": hour_start.isoformat(),
        "requests": requests,
        "acceptance_rate": acceptance_rate,
        "completion_rate": completion_rate,
        "cancellation_rate": cancellation_rate,
        "average_eta_minutes": avg_eta,
        "average_wait_minutes": avg_wait,
        "revenue_per_hour": _dec(revenue),
        "active_trips": rides.filter(status__in=RIDE_ACTIVE).count(),
        "active_deliveries": Delivery.objects.filter(status__in=DELIVERY_ACTIVE).count(),
    }


def build_operations_center_dashboard(city_id=None) -> dict:
    return {
        "generated_at": timezone.now().isoformat(),
        "fleet": build_fleet_snapshot(city_id),
        "map": build_ops_map(city_id),
        "trips": build_active_trips(city_id),
        "deliveries": build_active_deliveries(city_id),
        "emergency": build_emergency_center(),
        "alerts": build_live_alerts(),
        "timeline": build_operations_timeline(),
        "analytics": build_hourly_analytics(city_id),
    }
