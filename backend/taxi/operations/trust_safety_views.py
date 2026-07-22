"""Trust & Safety Center API views (Phase 29)."""

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from safety.models import SafetyResponseLog
from safety.serializers import SafetyResponseLogSerializer
from security.services.audit_service import log_from_request

from .cache_utils import invalidate_ops_cache
from .executive_permissions import IsCeoStaff, IsLaunchCommandStaff, can_dispatch_operations
from .trust_safety_service import (
    build_ceo_safety_dashboard,
    build_daily_safety_report,
    build_driver_safety_profile,
    build_incident_queue,
    build_monitoring_panel,
    build_monthly_trust_report,
    build_rider_safety_profile,
    build_safety_kpi_dashboard,
    build_trust_safety_dashboard,
    build_weekly_incident_report,
    get_trust_safety_audit_trail,
    scan_safety_monitoring,
    update_incident,
)


def _city_id(request):
    raw = request.query_params.get("city_id") or request.query_params.get("city")
    if not raw and request.method in {"POST", "PATCH", "PUT"}:
        raw = (request.data or {}).get("city_id")
    if not raw:
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


def _require_ops(request):
    if not can_dispatch_operations(request.user):
        return Response({"detail": "Operations permission required."}, status=status.HTTP_403_FORBIDDEN)
    return None


@api_view(["GET"])
@permission_classes([IsLaunchCommandStaff])
def trust_safety_dashboard(request):
    return Response(build_trust_safety_dashboard(city_id=_city_id(request)))


@api_view(["GET"])
@permission_classes([IsLaunchCommandStaff])
def trust_safety_incidents(request):
    status_filter = request.query_params.get("status")
    priority = request.query_params.get("priority")
    limit = min(int(request.query_params.get("limit", 200)), 500)
    return Response(build_incident_queue(status=status_filter, priority=priority, limit=limit))


@api_view(["PATCH"])
@permission_classes([IsLaunchCommandStaff])
def trust_safety_incident_detail(request, incident_id):
    denied = _require_ops(request)
    if denied:
        return denied

    payload = request.data or {}
    updated = update_incident(incident_id, payload, request.user)
    if not updated:
        return Response({"detail": "Incident not found or invalid status."}, status=status.HTTP_404_NOT_FOUND)

    log_from_request(
        request,
        action="admin_action",
        entity_type="system",
        entity_id=str(incident_id),
        summary=f"Trust & Safety incident updated → {updated['status']}",
        details=payload,
    )
    invalidate_ops_cache("trust_safety_dashboard")
    return Response(updated)


@api_view(["GET", "POST"])
@permission_classes([IsLaunchCommandStaff])
def trust_safety_monitoring(request):
    city_id = _city_id(request)
    if request.method == "GET":
        return Response(build_monitoring_panel(city_id=city_id))

    denied = _require_ops(request)
    if denied:
        return denied

    alerts = scan_safety_monitoring(city_id=city_id)
    log_from_request(
        request,
        action="admin_action",
        entity_type="system",
        entity_id="monitoring_scan",
        summary=f"Safety monitoring scan — {len(alerts)} alerts",
        details={"alert_count": len(alerts)},
    )
    invalidate_ops_cache("trust_safety_dashboard")
    return Response({"generated_at": build_monitoring_panel(city_id=city_id)["generated_at"], "alerts": alerts})


@api_view(["GET"])
@permission_classes([IsLaunchCommandStaff])
def trust_safety_driver_profile(request, user_id):
    profile = build_driver_safety_profile(user_id)
    if not profile:
        return Response({"detail": "Driver not found."}, status=status.HTTP_404_NOT_FOUND)
    return Response(profile)


@api_view(["GET"])
@permission_classes([IsLaunchCommandStaff])
def trust_safety_rider_profile(request, user_id):
    profile = build_rider_safety_profile(user_id)
    if not profile:
        return Response({"detail": "Rider not found."}, status=status.HTTP_404_NOT_FOUND)
    return Response(profile)


@api_view(["GET"])
@permission_classes([IsCeoStaff])
def trust_safety_ceo_dashboard(request):
    from .cache_utils import cached_ops_call

    city_id = _city_id(request)

    def _builder():
        return build_ceo_safety_dashboard(city_id=city_id)

    return Response(cached_ops_call("trust_safety_ceo", _builder, city_id=city_id))


@api_view(["GET"])
@permission_classes([IsLaunchCommandStaff])
def trust_safety_reports(request):
    report_type = (request.query_params.get("type") or "kpi").strip().lower()
    city_id = _city_id(request)
    builders = {
        "daily": build_daily_safety_report,
        "weekly": build_weekly_incident_report,
        "monthly": build_monthly_trust_report,
        "kpi": build_safety_kpi_dashboard,
    }
    builder = builders.get(report_type)
    if not builder:
        return Response({"detail": "Invalid report type."}, status=status.HTTP_400_BAD_REQUEST)
    return Response(builder(city_id=city_id))


@api_view(["GET"])
@permission_classes([IsLaunchCommandStaff])
def trust_safety_audit(request):
    limit = min(int(request.query_params.get("limit", 50)), 200)
    logs = SafetyResponseLog.objects.select_related("incident", "actor").order_by("-created_at")[:limit]
    return Response(
        {
            "audit_trail": get_trust_safety_audit_trail(limit=limit),
            "response_logs": SafetyResponseLogSerializer(logs, many=True).data,
        }
    )
