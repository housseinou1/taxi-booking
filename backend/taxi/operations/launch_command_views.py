"""Launch Operations Command Center API views (Phase 25)."""

from django.contrib.auth import get_user_model
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from safety.models import SafetyIncident, SafetyResponseLog
from security.services.audit_service import log_from_request

from .executive_permissions import (
    IsLaunchCommandStaff,
    can_ceo_actions,
    can_dispatch_operations,
)
from .launch_command_service import (
    build_ceo_summary_export_rows,
    build_launch_command_dashboard,
    get_onboarding_pause_state,
    set_onboarding_pause,
)
from .launch_service import acknowledge_launch_alert, create_ops_incident, resolve_launch_alert, update_ops_incident
from .operations_center_broadcast import broadcast_operations_update
from .report_export import export_csv, export_excel, export_pdf

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
        return Response({"detail": "Operations dispatch permission required."}, status=status.HTTP_403_FORBIDDEN)
    return None


def _export_response(rows, export_format, filename, title="Yala CEO Daily Summary"):
    if export_format == "xlsx":
        content = export_excel(rows)
        content_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        filename += ".xlsx"
    elif export_format == "pdf":
        content = export_pdf(rows, title=title)
        content_type = "application/pdf"
        filename += ".pdf"
    else:
        content = export_csv(rows)
        content_type = "text/csv"
        filename += ".csv"
    response = HttpResponse(content, content_type=content_type)
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response


@api_view(["GET"])
@permission_classes([IsLaunchCommandStaff])
def command_dashboard(request):
    period = request.query_params.get("period", "hour")
    payload = build_launch_command_dashboard(city_id=_city_id(request), period=period)
    payload["permissions"] = {
        "view": True,
        "dispatch": can_dispatch_operations(request.user),
        "ceo_actions": can_ceo_actions(request.user),
    }
    return Response(payload)


@api_view(["GET"])
@permission_classes([IsLaunchCommandStaff])
def command_ceo_export(request):
    export_format = request.query_params.get("export_format", "csv")
    rows = build_ceo_summary_export_rows(city_id=_city_id(request))
    log_from_request(
        request,
        action="admin_action",
        entity_type="system",
        entity_id="ceo_daily_summary",
        summary=f"Exported CEO daily summary ({export_format})",
        details={"row_count": len(rows), "format": export_format},
    )
    return _export_response(rows, export_format, "ceo-daily-summary")


@api_view(["POST"])
@permission_classes([IsLaunchCommandStaff])
def command_broadcast(request):
    denied = _require_dispatch(request)
    if denied:
        return denied

    audience = (request.data.get("audience") or "nearby").strip().lower()
    title = (request.data.get("title") or "Operations Alert").strip()
    message = (request.data.get("message") or request.data.get("body") or "").strip()
    if not message:
        return Response({"detail": "message is required."}, status=status.HTTP_400_BAD_REQUEST)

    if audience in {"all", "drivers", "riders", "couriers"}:
        if not can_ceo_actions(request.user) and audience == "all":
            return Response({"detail": "CEO permission required for platform-wide broadcast."}, status=status.HTTP_403_FORBIDDEN)
        from notifications.push import send_push_notification

        if audience == "all":
            users = User.objects.filter(is_active=True)
        elif audience == "riders":
            users = User.objects.filter(is_active=True, user_type="rider")
        elif audience == "couriers":
            users = User.objects.filter(is_active=True, user_type="driver")
        else:
            users = User.objects.filter(is_active=True, user_type="driver")

        sent = 0
        for user in users[:500]:
            try:
                send_push_notification(user, title, message, data={"type": "command_broadcast"})
                sent += 1
            except Exception:
                continue
        log_from_request(
            request,
            action="admin_action",
            entity_type="system",
            entity_id="command_broadcast",
            summary=f"Command broadcast to {audience}",
            details={"title": title, "sent": sent, "audience": audience},
        )
        broadcast_operations_update({"type": "command_broadcast", "audience": audience, "sent": sent})
        return Response({"message": "Broadcast sent.", "sent": sent})

    lat = request.data.get("lat")
    lng = request.data.get("lng")
    radius_km = float(request.data.get("radius_km") or 5)
    if lat is None or lng is None:
        return Response({"detail": "lat and lng required for nearby broadcast."}, status=status.HTTP_400_BAD_REQUEST)

    from taxi.rides.services.driver_dispatch_service import haversine_km
    from notifications.push import send_push_notification

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
                send_push_notification(profile, title, message, data={"type": "command_broadcast_nearby"})
                sent += 1
            except Exception:
                continue

    log_from_request(
        request,
        action="admin_action",
        entity_type="system",
        entity_id="command_broadcast_nearby",
        summary=f"Nearby command broadcast to {sent} drivers",
        details={"lat": lat, "lng": lng, "radius_km": radius_km, "sent": sent},
    )
    return Response({"message": "Nearby broadcast sent.", "sent": sent})


@api_view(["POST"])
@permission_classes([IsLaunchCommandStaff])
def command_notify(request):
    denied = _require_dispatch(request)
    if denied:
        return denied

    user_id = request.data.get("user_id")
    if not user_id:
        return Response({"detail": "user_id is required."}, status=status.HTTP_400_BAD_REQUEST)

    user = get_object_or_404(User, id=user_id)
    title = (request.data.get("title") or "Message from Yala Operations").strip()
    message = (request.data.get("message") or "").strip()
    app_type = (request.data.get("app_type") or "driver").strip().lower()
    if not message:
        return Response({"detail": "message is required."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        from notifications.push import send_push_to_user

        send_push_to_user(user, title, message, data={"type": "command_ops_message"}, app_type=app_type)
    except Exception:
        pass

    entity = "courier" if app_type == "delivery" else "driver"
    log_from_request(
        request,
        action="admin_action",
        entity_type=entity,
        entity_id=str(user.id),
        summary=f"Command center contacted {entity}",
        details={"title": title, "app_type": app_type},
    )
    return Response({"message": "Notification sent."})


@api_view(["GET", "POST"])
@permission_classes([IsLaunchCommandStaff])
def command_onboarding_pause(request):
    if request.method == "GET":
        return Response(get_onboarding_pause_state())

    denied = _require_dispatch(request)
    if denied:
        return denied

    enabled = bool(request.data.get("enabled", True))
    reason = (request.data.get("reason") or "").strip()
    payload = set_onboarding_pause(enabled, reason, request.user)
    log_from_request(
        request,
        action="admin_action",
        entity_type="system",
        entity_id="driver_onboarding",
        summary=f"Driver onboarding {'paused' if enabled else 'resumed'}",
        details={"before": not enabled, "after": enabled, "reason": reason},
    )
    return Response(payload)


@api_view(["GET", "POST"])
@permission_classes([IsLaunchCommandStaff])
def command_incidents(request):
    if request.method == "GET":
        from .launch_service import list_ops_incidents

        return Response({"incidents": list_ops_incidents(request.query_params.dict())})

    denied = _require_dispatch(request)
    if denied:
        return denied

    payload = request.data or {}
    if not payload.get("title"):
        return Response({"detail": "title is required."}, status=status.HTTP_400_BAD_REQUEST)
    incident = create_ops_incident(payload, request.user)
    log_from_request(
        request,
        action="admin_action",
        entity_type="system",
        entity_id=str(incident.id),
        summary=f"Created ops incident {incident.reference}",
        details={"title": incident.title, "severity": incident.severity},
    )
    broadcast_operations_update({"type": "ops_incident_created", "incident_id": incident.id})
    return Response({"id": incident.id, "reference": incident.reference, "status": incident.status}, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([IsLaunchCommandStaff])
def command_incident_action(request, incident_id):
    denied = _require_dispatch(request)
    if denied:
        return denied

    incident_type = (request.data.get("incident_type") or "ops").strip().lower()
    action = (request.data.get("action") or "").strip().lower()

    if incident_type == "safety":
        incident = get_object_or_404(SafetyIncident, id=incident_id)
        before_status = incident.status
        if action == "acknowledge":
            incident.status = "acknowledged"
            incident.acknowledged_at = timezone.now()
            incident.assigned_to = request.user
        elif action == "assign":
            operator_id = request.data.get("operator_id") or request.user.id
            incident.assigned_to = get_object_or_404(User, id=operator_id)
            incident.status = "investigating"
        elif action == "resolve":
            incident.status = "resolved"
            incident.resolution_notes = str(request.data.get("notes") or incident.resolution_notes).strip()
            incident.resolved_at = timezone.now()
        elif action == "escalate":
            incident.severity = "critical"
            incident.status = "investigating"
            incident.assigned_to = request.user
        else:
            return Response({"detail": "Invalid action."}, status=status.HTTP_400_BAD_REQUEST)

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
            entity_type="system",
            entity_id=str(incident.id),
            summary=f"Safety incident #{incident.id} — {action}",
            details={"before": before_status, "after": incident.status, "action": action},
        )
        broadcast_operations_update({"type": "safety_incident_updated", "incident_id": incident.id})
        return Response({"message": "Safety incident updated.", "status": incident.status})

    update_data = {}
    if action == "resolve":
        update_data["status"] = "resolved"
        update_data["resolution"] = request.data.get("resolution") or request.data.get("notes")
    elif action == "escalate":
        update_data["severity"] = "critical"
        update_data["status"] = "investigating"
    elif request.data.get("status"):
        update_data["status"] = request.data.get("status")
    if request.data.get("resolution"):
        update_data["resolution"] = request.data.get("resolution")

    incident = update_ops_incident(incident_id, update_data, request.user)
    if not incident:
        return Response({"detail": "Incident not found."}, status=status.HTTP_404_NOT_FOUND)

    log_from_request(
        request,
        action="admin_action",
        entity_type="system",
        entity_id=str(incident.id),
        summary=f"Ops incident {incident.reference} — {action or 'updated'}",
        details={"action": action, "status": incident.status},
    )
    broadcast_operations_update({"type": "ops_incident_updated", "incident_id": incident.id})
    return Response({"message": "Incident updated.", "status": incident.status, "reference": incident.reference})


@api_view(["POST"])
@permission_classes([IsLaunchCommandStaff])
def command_alert_action(request, alert_id):
    denied = _require_dispatch(request)
    if denied:
        return denied

    action = (request.data.get("action") or "ack").strip().lower()
    if action == "resolve":
        alert = resolve_launch_alert(alert_id)
    else:
        alert = acknowledge_launch_alert(alert_id, request.user)
    if not alert:
        return Response({"detail": "Alert not found."}, status=status.HTTP_404_NOT_FOUND)

    log_from_request(
        request,
        action="admin_action",
        entity_type="launch_alert",
        entity_id=str(alert_id),
        summary=f"Launch alert #{alert_id} {action}",
        details={"status": alert.status},
    )
    return Response({"id": alert.id, "status": alert.status})
