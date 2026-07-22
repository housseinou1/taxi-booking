"""Smart Pricing & Dispatch Engine API views (Phase 28)."""

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from security.services.audit_service import log_from_request

from .executive_permissions import (
    IsLaunchCommandStaff,
    IsCeoStaff,
    can_dispatch_operations,
    can_ceo_actions,
)
from .smart_pricing_dispatch_service import (
    build_ceo_dashboard,
    build_dispatch_analytics,
    build_smart_engine_dashboard,
    build_surge_panel,
    get_audit_trail,
    get_dispatch_rules,
    get_engine_flags,
    get_pricing_rules,
    get_surge_config,
    set_dispatch_rules,
    set_engine_flags,
    set_pricing_rules,
    set_surge_config,
    simulate_pricing,
)


def _city_id(request):
    raw = request.query_params.get("city") or request.query_params.get("city_id")
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


def _require_ceo(request):
    if not can_ceo_actions(request.user):
        return Response({"detail": "CEO permission required."}, status=status.HTTP_403_FORBIDDEN)
    return None


@api_view(["GET"])
@permission_classes([IsLaunchCommandStaff])
def smart_engine_dashboard(request):
    return Response(build_smart_engine_dashboard(city_id=_city_id(request)))


@api_view(["GET", "PATCH"])
@permission_classes([IsLaunchCommandStaff])
def smart_engine_flags(request):
    if request.method == "GET":
        return Response(get_engine_flags())

    denied = _require_ops(request)
    if denied:
        return denied

    payload = request.data or {}
    if "surge_pricing_enabled" in payload or payload.get("enabled") is False:
        ceo_denied = _require_ceo(request)
        if ceo_denied and payload.get("surge_pricing_enabled") is True:
            return ceo_denied

    before = get_engine_flags()
    updated = set_engine_flags(payload, user=request.user)
    log_from_request(
        request,
        action="admin_action",
        entity_type="system",
        entity_id="smart_engine_flags",
        summary="Updated smart engine feature flags",
        details={"before": before, "after": updated},
    )
    return Response(updated)


@api_view(["GET", "PATCH"])
@permission_classes([IsLaunchCommandStaff])
def smart_dispatch_rules(request):
    city_id = _city_id(request)
    if request.method == "GET":
        return Response(get_dispatch_rules(city_id))

    denied = _require_ops(request)
    if denied:
        return denied

    before = get_dispatch_rules(city_id)
    updated = set_dispatch_rules(request.data or {}, city_id=city_id, user=request.user)
    log_from_request(
        request,
        action="admin_action",
        entity_type="system",
        entity_id="dispatch_rules",
        summary="Updated smart dispatch rules",
        details={"city_id": city_id, "before": before, "after": updated},
    )
    return Response(updated)


@api_view(["GET", "PATCH"])
@permission_classes([IsLaunchCommandStaff])
def smart_pricing_rules(request):
    city_id = _city_id(request)
    ride_type = request.query_params.get("ride_type") or (request.data or {}).get("ride_type")
    if request.method == "GET":
        return Response(get_pricing_rules(city_id, ride_type or "regular"))

    denied = _require_ops(request)
    if denied:
        return denied

    before = get_pricing_rules(city_id, ride_type or "regular")
    updated = set_pricing_rules(
        request.data or {},
        city_id=city_id,
        ride_type=ride_type,
        user=request.user,
    )
    log_from_request(
        request,
        action="admin_action",
        entity_type="system",
        entity_id="dynamic_pricing_rules",
        summary="Updated dynamic pricing rules",
        details={"city_id": city_id, "ride_type": ride_type, "before": before, "after": updated},
    )
    return Response(updated)


@api_view(["GET", "PATCH"])
@permission_classes([IsLaunchCommandStaff])
def smart_surge_config(request):
    if request.method == "GET":
        panel = build_surge_panel(city_id=_city_id(request))
        return Response({"config": get_surge_config(), "panel": panel})

    denied = _require_ceo(request)
    if denied:
        return denied

    before = get_surge_config()
    updated = set_surge_config(request.data or {}, user=request.user)
    log_from_request(
        request,
        action="admin_action",
        entity_type="system",
        entity_id="surge_engine_config",
        summary="Updated surge engine configuration",
        details={"before": before, "after": updated},
    )
    return Response({"config": updated, "panel": build_surge_panel(city_id=_city_id(request))})


@api_view(["GET"])
@permission_classes([IsLaunchCommandStaff])
def smart_dispatch_analytics(request):
    period = request.query_params.get("period", "today")
    if period not in {"today", "week", "day"}:
        period = "today"
    if period == "day":
        period = "today"
    return Response(build_dispatch_analytics(city_id=_city_id(request), period=period))


@api_view(["POST"])
@permission_classes([IsLaunchCommandStaff])
def smart_pricing_simulate(request):
    denied = _require_ops(request)
    if denied:
        return denied
    payload = request.data or {}
    result = simulate_pricing(payload, user=request.user)
    log_from_request(
        request,
        action="admin_action",
        entity_type="system",
        entity_id="pricing_simulator",
        summary="Ran pricing simulation (dry run)",
        details={"input": payload},
    )
    return Response(result)


@api_view(["GET"])
@permission_classes([IsCeoStaff])
def smart_engine_ceo_dashboard(request):
    period = request.query_params.get("period", "week")
    if period not in {"today", "week", "day"}:
        period = "week"
    if period == "day":
        period = "today"
    return Response(build_ceo_dashboard(city_id=_city_id(request), period=period))


@api_view(["GET"])
@permission_classes([IsLaunchCommandStaff])
def smart_engine_audit(request):
    limit = request.query_params.get("limit", 50)
    try:
        limit = min(int(limit), 200)
    except (TypeError, ValueError):
        limit = 50
    return Response({"entries": get_audit_trail(limit=limit)})
