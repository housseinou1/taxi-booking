from datetime import timedelta

from django.conf import settings
from django.db.models import Count
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAdminUser, IsAuthenticated
from rest_framework.response import Response

from taxi.rides.models import Ride

from deliveries.models import Delivery

from .models import (
    EmergencyContact,
    MAX_TRUSTED_CONTACTS,
    SafetyIncident,
    SafetyResponseLog,
    TripLocationPing,
    TripSafetyEvent,
    TripShare,
)
from .monitoring_service import record_trip_ping, respond_to_safety_event
from .serializers import (
    EmergencyContactSerializer,
    SafetyIncidentSerializer,
    SafetyResponseLogSerializer,
    TripSafetyEventSerializer,
)
from .services import delivery_snapshot, dispatch_emergency_alert, ride_snapshot
from security.services.audit_service import log_from_request


ACTIVE_RIDE_STATUSES = {
    "requested",
    "scheduled",
    "accepted",
    "driver_arriving",
    "driver_arrived",
    "in_progress",
}


ACTIVE_DELIVERY_STATUSES = {
    "accepted",
    "courier_arriving",
    "picked_up",
    "in_transit",
    "delivering",
}


def _delivery_for_user(user, delivery_id, require_active=False):
    if not delivery_id:
        return None
    delivery = get_object_or_404(
        Delivery.objects.select_related("customer", "driver"),
        id=delivery_id,
    )
    if not user.is_staff and user.id not in (delivery.customer_id, delivery.driver_id):
        return None
    if require_active and delivery.status not in ACTIVE_DELIVERY_STATUSES:
        return None
    return delivery


def _ride_for_user(user, ride_id, require_active=False):
    if not ride_id:
        return None
    ride = get_object_or_404(Ride.objects.select_related("rider", "driver", "city"), id=ride_id)
    if not user.is_staff and user.id not in (ride.rider_id, ride.driver_id):
        return None
    if require_active and ride.status not in ACTIVE_RIDE_STATUSES:
        return None
    return ride


def _coordinate(value):
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def emergency_contacts(request):
    if request.method == "GET":
        return Response(
            EmergencyContactSerializer(
                EmergencyContact.objects.filter(user=request.user),
                many=True,
            ).data
        )
    serializer = EmergencyContactSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    existing_count = EmergencyContact.objects.filter(user=request.user).count()
    if existing_count >= MAX_TRUSTED_CONTACTS:
        return Response(
            {
                "detail": f"You can save up to {MAX_TRUSTED_CONTACTS} trusted contacts.",
                "max_contacts": MAX_TRUSTED_CONTACTS,
            },
            status=status.HTTP_400_BAD_REQUEST,
        )
    if serializer.validated_data.get("is_primary"):
        EmergencyContact.objects.filter(user=request.user).update(is_primary=False)
    serializer.save(user=request.user)
    return Response(serializer.data, status=status.HTTP_201_CREATED)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def emergency_contact_detail(request, contact_id):
    contact = get_object_or_404(EmergencyContact, id=contact_id, user=request.user)
    if request.method == "DELETE":
        contact.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    serializer = EmergencyContactSerializer(contact, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    if serializer.validated_data.get("is_primary"):
        EmergencyContact.objects.filter(user=request.user).exclude(id=contact.id).update(
            is_primary=False
        )
    serializer.save()
    return Response(serializer.data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def trigger_sos(request):
    delivery_id = request.data.get("delivery_id")
    ride_id = request.data.get("ride_id")

    if delivery_id:
        delivery = _delivery_for_user(request.user, delivery_id, require_active=True)
        if not delivery:
            return Response(
                {"detail": "SOS requires an active delivery belonging to this user."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        reported_user = (
            delivery.driver
            if request.user.id == delivery.customer_id
            else delivery.customer
        )
        incident = SafetyIncident.objects.create(
            reporter=request.user,
            delivery=delivery,
            reported_user=reported_user,
            incident_type="sos",
            severity="critical",
            description=str(request.data.get("description", "")).strip(),
            latitude=_coordinate(request.data.get("latitude")),
            longitude=_coordinate(request.data.get("longitude")),
            location_accuracy_meters=_coordinate(request.data.get("accuracy")),
            trip_snapshot=delivery_snapshot(delivery),
        )
    else:
        ride = _ride_for_user(request.user, ride_id, require_active=True)
        if not ride:
            return Response(
                {"detail": "SOS requires an active ride or delivery belonging to this user."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        incident = SafetyIncident.objects.create(
            reporter=request.user,
            ride=ride,
            reported_user=ride.driver if request.user.id == ride.rider_id else ride.rider,
            incident_type="sos",
            severity="critical",
            description=str(request.data.get("description", "")).strip(),
            latitude=_coordinate(request.data.get("latitude")),
            longitude=_coordinate(request.data.get("longitude")),
            location_accuracy_meters=_coordinate(request.data.get("accuracy")),
            trip_snapshot=ride_snapshot(ride),
        )
    alert = dispatch_emergency_alert(incident)
    log_from_request(
        request,
        action="verification_event",
        entity_type="payment" if delivery_id else "customer",
        entity_id=incident.id,
        summary=f"SOS triggered {incident.reference}",
        details={
            "ride_id": incident.ride_id,
            "delivery_id": incident.delivery_id,
            "latitude": incident.latitude,
            "longitude": incident.longitude,
        },
    )
    return Response(
        {
            "incident": SafetyIncidentSerializer(incident).data,
            "alert": {
                "dispatched_at": alert.dispatched_at,
                "admin_notifications_sent": alert.admin_notifications_sent,
                "counterpart_notified": alert.counterpart_notified,
            },
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def incidents(request):
    if request.method == "GET":
        queryset = SafetyIncident.objects.filter(reporter=request.user).select_related(
            "reporter", "reported_user", "assigned_to", "ride"
        )
        return Response(SafetyIncidentSerializer(queryset, many=True).data)

    ride = _ride_for_user(request.user, request.data.get("ride_id"))
    if request.data.get("ride_id") and not ride:
        return Response({"detail": "Ride not found."}, status=status.HTTP_404_NOT_FOUND)
    incident_type = request.data.get("incident_type", "safety_incident")
    allowed_types = {"safety_incident", "report_driver", "report_rider"}
    if incident_type not in allowed_types:
        return Response({"detail": "Invalid incident type."}, status=status.HTTP_400_BAD_REQUEST)
    reported_user = None
    if ride:
        reported_user = ride.driver if request.user.id == ride.rider_id else ride.rider
    incident = SafetyIncident.objects.create(
        reporter=request.user,
        ride=ride,
        reported_user=reported_user,
        incident_type=incident_type,
        severity=request.data.get("severity", "high"),
        description=str(request.data.get("description", "")).strip(),
        latitude=_coordinate(request.data.get("latitude")),
        longitude=_coordinate(request.data.get("longitude")),
        location_accuracy_meters=_coordinate(request.data.get("accuracy")),
        trip_snapshot=ride_snapshot(ride),
    )
    return Response(SafetyIncidentSerializer(incident).data, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def create_trip_share(request):
    ride = _ride_for_user(request.user, request.data.get("ride_id"), require_active=True)
    if not ride:
        return Response(
            {"detail": "Trip sharing requires an active ride belonging to this user."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    TripShare.objects.filter(ride=ride, created_by=request.user, is_active=True).update(
        is_active=False
    )
    share = TripShare.objects.create(
        ride=ride,
        created_by=request.user,
        expires_at=timezone.now() + timedelta(hours=24),
    )
    public_app_url = getattr(settings, "PUBLIC_APP_URL", "").rstrip("/")
    share_url = (
        f"{public_app_url}/trip-share/{share.token}"
        if public_app_url
        else request.build_absolute_uri(f"/trip-share/{share.token}")
    )
    return Response(
        {
            "share_url": share_url,
            "token": share.token,
            "expires_at": share.expires_at,
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["GET"])
@permission_classes([AllowAny])
def shared_trip(request, token):
    share = get_object_or_404(
        TripShare.objects.select_related("ride", "ride__driver", "ride__rider"),
        token=token,
    )
    if not share.is_available:
        return Response({"detail": "This trip sharing link has expired."}, status=status.HTTP_410_GONE)
    share.view_count += 1
    share.last_viewed_at = timezone.now()
    share.save(update_fields=["view_count", "last_viewed_at"])
    snapshot = ride_snapshot(share.ride)
    snapshot.pop("rider_id", None)
    snapshot.pop("driver_id", None)
    return Response(
        {
            "trip": snapshot,
            "expires_at": share.expires_at,
            "last_updated": timezone.now(),
        }
    )


@api_view(["GET"])
@permission_classes([IsAdminUser])
def admin_incidents(request):
    queryset = SafetyIncident.objects.select_related(
        "reporter", "reported_user", "assigned_to", "ride"
    )
    status_filter = request.query_params.get("status")
    incident_type = request.query_params.get("type")
    if status_filter:
        queryset = queryset.filter(status=status_filter)
    if incident_type:
        queryset = queryset.filter(incident_type=incident_type)
    counts = {
        row["status"]: row["count"]
        for row in SafetyIncident.objects.values("status").annotate(count=Count("id"))
    }
    return Response(
        {
            "summary": {
                "open": counts.get("open", 0),
                "acknowledged": counts.get("acknowledged", 0),
                "investigating": counts.get("investigating", 0),
                "resolved": counts.get("resolved", 0),
                "critical": SafetyIncident.objects.filter(
                    severity="critical",
                    status__in=["open", "acknowledged", "investigating"],
                ).count(),
            },
            "incidents": SafetyIncidentSerializer(queryset[:500], many=True).data,
        }
    )


@api_view(["PATCH"])
@permission_classes([IsAdminUser])
def admin_incident_detail(request, incident_id):
    incident = get_object_or_404(SafetyIncident, id=incident_id)
    next_status = request.data.get("status")
    if next_status not in dict(SafetyIncident.STATUS_CHOICES):
        return Response({"detail": "Invalid status."}, status=status.HTTP_400_BAD_REQUEST)
    incident.status = next_status
    incident.resolution_notes = str(
        request.data.get("resolution_notes", incident.resolution_notes)
    ).strip()
    incident.assigned_to = request.user
    if next_status in {"acknowledged", "investigating"} and not incident.acknowledged_at:
        incident.acknowledged_at = timezone.now()
    if next_status in {"resolved", "dismissed"}:
        incident.resolved_at = timezone.now()
    incident.save()
    if next_status in {"acknowledged", "investigating", "resolved", "dismissed"}:
        action_map = {
            "acknowledged": "acknowledged",
            "investigating": "investigating",
            "resolved": "resolved",
            "dismissed": "dismissed",
        }
        SafetyResponseLog.objects.create(
            incident=incident,
            actor=request.user,
            action=action_map[next_status],
            note=incident.resolution_notes,
        )
        log_from_request(
            request,
            action="admin_action",
            entity_type="system",
            entity_id=incident.id,
            summary=f"Safety incident {incident.reference} → {next_status}",
            details={"status": next_status},
        )
    return Response(SafetyIncidentSerializer(incident).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def monitoring_ping(request):
    ride = _ride_for_user(request.user, request.data.get("ride_id"), require_active=True)
    if not ride:
        return Response(
            {"detail": "Safety monitoring requires an active ride."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    lat = _coordinate(request.data.get("latitude"))
    lng = _coordinate(request.data.get("longitude"))
    if lat is None or lng is None:
        return Response({"detail": "GPS coordinates required."}, status=status.HTTP_400_BAD_REQUEST)
    _, event = record_trip_ping(
        ride,
        request.user,
        latitude=lat,
        longitude=lng,
        accuracy=_coordinate(request.data.get("accuracy")),
        speed_mps=_coordinate(request.data.get("speed")),
    )
    payload = {"recorded": True}
    if event:
        payload["safety_event"] = TripSafetyEventSerializer(event).data
    return Response(payload)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def monitoring_status(request):
    ride = _ride_for_user(request.user, request.query_params.get("ride_id"), require_active=True)
    if not ride:
        return Response({"open_event": None})
    event = (
        TripSafetyEvent.objects.filter(ride=ride, user=request.user, status="open")
        .order_by("-created_at")
        .first()
    )
    return Response({"open_event": TripSafetyEventSerializer(event).data if event else None})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def monitoring_respond(request):
    event = get_object_or_404(
        TripSafetyEvent,
        id=request.data.get("event_id"),
        user=request.user,
        status="open",
    )
    is_safe = bool(request.data.get("is_safe", True))
    event = respond_to_safety_event(
        event,
        is_safe=is_safe,
        note=str(request.data.get("note", "")).strip(),
    )
    return Response(TripSafetyEventSerializer(event).data)


@api_view(["GET"])
@permission_classes([IsAdminUser])
def admin_active_trips(request):
    rides = (
        Ride.objects.filter(status__in=ACTIVE_RIDE_STATUSES)
        .select_related("rider", "driver", "driver__driver_profile")
        .order_by("-created_at")[:100]
    )
    active_sos = {
        row["ride_id"]: row["count"]
        for row in SafetyIncident.objects.filter(
            incident_type="sos",
            status__in=["open", "acknowledged", "investigating"],
            ride_id__isnull=False,
        )
        .values("ride_id")
        .annotate(count=Count("id"))
    }
    payload = []
    for ride in rides:
        profile = getattr(ride.driver, "driver_profile", None) if ride.driver else None
        snapshot = ride_snapshot(ride)
        payload.append(
            {
                **snapshot,
                "active_sos_count": active_sos.get(ride.id, 0),
                "vehicle_make": getattr(profile, "vehicle_make", "") if profile else "",
                "vehicle_model": getattr(profile, "vehicle_model", "") if profile else "",
                "vehicle_color": getattr(profile, "vehicle_color", "") if profile else "",
                "plate_number": getattr(profile, "plate_number", "") if profile else "",
            }
        )
    return Response({"active_trips": payload})


@api_view(["GET"])
@permission_classes([IsAdminUser])
def admin_trip_replay(request, ride_id):
    ride = get_object_or_404(Ride, id=ride_id)
    pings = TripLocationPing.objects.filter(ride=ride).order_by("recorded_at")[:500]
    events = TripSafetyEvent.objects.filter(ride=ride).order_by("-created_at")[:50]
    incidents = SafetyIncident.objects.filter(ride=ride).order_by("-created_at")[:20]
    return Response(
        {
            "ride": ride_snapshot(ride),
            "pings": [
                {
                    "latitude": ping.latitude,
                    "longitude": ping.longitude,
                    "accuracy_meters": ping.accuracy_meters,
                    "recorded_at": ping.recorded_at,
                }
                for ping in pings
            ],
            "safety_events": TripSafetyEventSerializer(events, many=True).data,
            "incidents": SafetyIncidentSerializer(incidents, many=True).data,
        }
    )


@api_view(["GET"])
@permission_classes([IsAdminUser])
def admin_response_log(request):
    incident_id = request.query_params.get("incident_id")
    queryset = SafetyResponseLog.objects.select_related("incident", "actor").order_by("-created_at")
    if incident_id:
        queryset = queryset.filter(incident_id=incident_id)
    return Response(
        {
            "logs": SafetyResponseLogSerializer(queryset[:200], many=True).data,
        }
    )
