"""Real-time operations center API views."""

from django.contrib.auth import get_user_model
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from deliveries.models import Delivery
from notifications.services import send_push_notification
from safety.models import SafetyIncident, SafetyResponseLog
from security.services.audit_service import log_from_request
from taxi.rides.models import Ride

from .executive_permissions import IsExecutiveStaff, can_dispatch_operations, can_ceo_actions
from .operations_center_service import (
    build_active_deliveries,
    build_active_trips,
    build_emergency_center,
    build_fleet_snapshot,
    build_hourly_analytics,
    build_live_alerts,
    build_operations_center_dashboard,
    build_operations_timeline,
    build_ops_map,
)

User = get_user_model()


def _city_id(request):
    raw = request.query_params.get("city") or request.query_params.get("city_id")
    if not raw:
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


def _require_dispatch(request):
    if not can_dispatch_operations(request.user):
        return Response({"error": "Operations dispatch permission required."}, status=403)
    return None


def _permissions_payload(user):
    return {
        "view": True,
        "dispatch": can_dispatch_operations(user),
        "ceo_actions": can_ceo_actions(user),
    }


@api_view(["GET"])
@permission_classes([IsExecutiveStaff])
def operations_center_dashboard(request):
    city = _city_id(request)
    payload = build_operations_center_dashboard(city)
    payload["permissions"] = _permissions_payload(request.user)
    return Response(payload)


@api_view(["GET"])
@permission_classes([IsExecutiveStaff])
def operations_center_fleet(request):
    return Response(build_fleet_snapshot(_city_id(request)))


@api_view(["GET"])
@permission_classes([IsExecutiveStaff])
def operations_center_map(request):
    return Response(build_ops_map(_city_id(request)))


@api_view(["GET"])
@permission_classes([IsExecutiveStaff])
def operations_center_trips(request):
    return Response({"trips": build_active_trips(_city_id(request))})


@api_view(["GET"])
@permission_classes([IsExecutiveStaff])
def operations_center_deliveries(request):
    return Response({"deliveries": build_active_deliveries(_city_id(request))})


@api_view(["GET"])
@permission_classes([IsExecutiveStaff])
def operations_center_emergency(request):
    return Response(build_emergency_center())


@api_view(["GET"])
@permission_classes([IsExecutiveStaff])
def operations_center_alerts(request):
    return Response({"alerts": build_live_alerts()})


@api_view(["GET"])
@permission_classes([IsExecutiveStaff])
def operations_center_timeline(request):
    limit = int(request.query_params.get("limit") or 50)
    return Response({"timeline": build_operations_timeline(limit=limit)})


@api_view(["GET"])
@permission_classes([IsExecutiveStaff])
def operations_center_analytics(request):
    return Response(build_hourly_analytics(_city_id(request)))


@api_view(["POST"])
@permission_classes([IsExecutiveStaff])
def operations_force_assign(request, ride_id):
    from .ops_dispatch_service import force_assign_driver
    from .operations_center_broadcast import broadcast_operations_update

    denied = _require_dispatch(request)
    if denied:
        return denied
    ride = get_object_or_404(Ride, id=ride_id)
    driver_id = request.data.get("driver_id")
    if not driver_id:
        return Response({"error": "driver_id is required."}, status=400)
    driver = get_object_or_404(User, id=driver_id)
    try:
        ride = force_assign_driver(ride, driver, request.user)
    except ValueError as exc:
        return Response({"error": str(exc)}, status=400)
    log_from_request(
        request,
        action="admin_action",
        entity_type="ride",
        entity_id=str(ride.id),
        summary=f"Force-assigned ride #{ride.id} to driver {driver.email}",
        details={"driver_id": driver.id},
    )
    broadcast_operations_update({"type": "ride_assigned", "ride_id": ride.id})
    return Response({"message": "Driver assigned.", "ride_id": ride.id, "driver_id": driver.id})


@api_view(["POST"])
@permission_classes([IsExecutiveStaff])
def operations_reassign_ride(request, ride_id):
    from .ops_dispatch_service import reassign_ride
    from .operations_center_broadcast import broadcast_operations_update

    denied = _require_dispatch(request)
    if denied:
        return denied
    ride = get_object_or_404(Ride, id=ride_id)
    driver_id = request.data.get("driver_id")
    try:
        ride = reassign_ride(ride, int(driver_id) if driver_id else None, request.user)
    except ValueError as exc:
        return Response({"error": str(exc)}, status=400)
    log_from_request(
        request,
        action="admin_action",
        entity_type="ride",
        entity_id=str(ride.id),
        summary=f"Reassigned ride #{ride.id}",
        details={"driver_id": driver_id},
    )
    broadcast_operations_update({"type": "ride_reassigned", "ride_id": ride.id})
    return Response({"message": "Ride reassigned.", "ride_id": ride.id})


@api_view(["POST"])
@permission_classes([IsExecutiveStaff])
def operations_cancel_ride(request, ride_id):
    denied = _require_dispatch(request)
    if denied:
        return denied
    from taxi.rides.views import cancel_ride

    if not request.data.get("reason"):
        request._full_data = {**request.data, "reason": "ops_center_cancel"}
    return cancel_ride(request, ride_id)


@api_view(["POST"])
@permission_classes([IsExecutiveStaff])
def operations_reassign_delivery(request, delivery_id):
    from .ops_dispatch_service import reassign_delivery
    from .operations_center_broadcast import broadcast_operations_update

    denied = _require_dispatch(request)
    if denied:
        return denied
    delivery = get_object_or_404(Delivery, id=delivery_id)
    driver_id = request.data.get("driver_id")
    try:
        delivery = reassign_delivery(
            delivery, int(driver_id) if driver_id else None, request.user
        )
    except ValueError as exc:
        return Response({"error": str(exc)}, status=400)
    log_from_request(
        request,
        action="admin_action",
        entity_type="delivery",
        entity_id=str(delivery.id),
        summary=f"Reassigned delivery #{delivery.id}",
        details={"driver_id": driver_id},
    )
    broadcast_operations_update({"type": "delivery_reassigned", "delivery_id": delivery.id})
    return Response({"message": "Delivery reassigned.", "delivery_id": delivery.id})


@api_view(["POST"])
@permission_classes([IsExecutiveStaff])
def operations_cancel_delivery(request, delivery_id):
    denied = _require_dispatch(request)
    if denied:
        return denied
    from deliveries.views import cancel_delivery

    if not request.data.get("reason"):
        request._full_data = {**request.data, "reason": "ops_center_cancel"}
    return cancel_delivery(request, delivery_id)


@api_view(["POST"])
@permission_classes([IsExecutiveStaff])
def operations_pause_driver(request, driver_id):
    from .ops_dispatch_service import pause_driver
    from .operations_center_broadcast import broadcast_operations_update

    denied = _require_dispatch(request)
    if denied:
        return denied
    driver = get_object_or_404(User, id=driver_id)
    paused = bool(request.data.get("paused", True))
    profile = pause_driver(driver, request.user, paused=paused)
    log_from_request(
        request,
        action="admin_action",
        entity_type="driver",
        entity_id=str(driver.id),
        summary=f"Driver {'paused' if paused else 'resumed'} by operations",
        details={"paused": paused},
    )
    broadcast_operations_update({"type": "driver_paused" if paused else "driver_resumed", "driver_id": driver.id})
    return Response({"message": "Driver updated.", "driver_id": driver.id, "is_available": profile.is_available})


@api_view(["POST"])
@permission_classes([IsExecutiveStaff])
def operations_broadcast_nearby(request):
    denied = _require_dispatch(request)
    if denied:
        return denied
    lat = request.data.get("lat")
    lng = request.data.get("lng")
    radius_km = float(request.data.get("radius_km") or 5)
    message = (request.data.get("message") or "").strip()
    title = (request.data.get("title") or "Dispatch Alert").strip()
    if not message or lat is None or lng is None:
        return Response({"error": "message, lat, and lng are required."}, status=400)

    from taxi.rides.services.driver_dispatch_service import haversine_km

    sent = 0
    for profile in User.objects.filter(
        driver_profile__status="approved",
        driver_profile__is_available=True,
        driver_profile__current_lat__isnull=False,
    ).select_related("driver_profile")[:500]:
        distance = haversine_km(
            float(lat),
            float(lng),
            profile.driver_profile.current_lat,
            profile.driver_profile.current_lng,
        )
        if distance <= radius_km:
            try:
                send_push_notification(profile, title, message, data={"type": "ops_broadcast"})
                sent += 1
            except Exception:
                continue

    log_from_request(
        request,
        action="admin_action",
        entity_type="system",
        entity_id="ops_broadcast_nearby",
        summary=f"Operations broadcast to {sent} nearby drivers",
        details={"lat": lat, "lng": lng, "radius_km": radius_km, "sent": sent},
    )
    return Response({"message": "Broadcast sent.", "sent": sent})


@api_view(["POST"])
@permission_classes([IsExecutiveStaff])
def operations_incident_action(request, incident_id):
    from .operations_center_broadcast import broadcast_operations_update

    denied = _require_dispatch(request)
    if denied:
        return denied
    incident = get_object_or_404(SafetyIncident, id=incident_id)
    action = (request.data.get("action") or "").strip().lower()

    if action == "acknowledge":
        incident.status = "acknowledged"
        incident.acknowledged_at = timezone.now()
        incident.assigned_to = request.user
    elif action == "assign":
        operator_id = request.data.get("operator_id") or request.user.id
        incident.assigned_to = get_object_or_404(User, id=operator_id)
        incident.status = "investigating"
    elif action == "close":
        incident.status = "resolved"
        incident.resolution_notes = str(request.data.get("notes") or incident.resolution_notes).strip()
        incident.resolved_at = timezone.now()
    elif action == "escalate":
        incident.severity = "critical"
        incident.status = "investigating"
        incident.assigned_to = request.user
    else:
        return Response({"error": "Invalid action."}, status=400)

    incident.save()
    SafetyResponseLog.objects.create(
        incident=incident,
        actor=request.user,
        action=action if action in dict(SafetyResponseLog.ACTION_CHOICES) else "investigating",
        note=str(request.data.get("notes") or request.data.get("note") or "").strip(),
    )
    log_from_request(
        request,
        action="admin_action",
        entity_type="incident",
        entity_id=str(incident.id),
        summary=f"Incident {incident.reference} — {action}",
        details={"action": action},
    )
    broadcast_operations_update({"type": "incident_updated", "incident_id": incident.id})
    return Response({"message": f"Incident {action}.", "incident_id": incident.id, "status": incident.status})


@api_view(["GET"])
@permission_classes([IsExecutiveStaff])
def operations_incident_export(request, incident_id):
    from .report_export import export_csv

    incident = get_object_or_404(
        SafetyIncident.objects.select_related("reporter", "reported_user", "assigned_to"),
        id=incident_id,
    )
    rows = [
        {
            "reference": incident.reference,
            "type": incident.incident_type,
            "severity": incident.severity,
            "status": incident.status,
            "description": incident.description,
            "reporter": incident.reporter.email if incident.reporter else "",
            "assigned_to": incident.assigned_to.email if incident.assigned_to else "",
            "created_at": incident.created_at.isoformat(),
            "resolved_at": incident.resolved_at.isoformat() if incident.resolved_at else "",
        }
    ]
    content = export_csv(rows)
    response = Response(content, content_type="text/csv", status=200)
    response["Content-Disposition"] = f'attachment; filename="incident-{incident.reference}.csv"'
    return response
