"""Launch & Growth Sprint API views."""

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from operations.executive_permissions import IsLaunchCommandStaff
from security.services.audit_service import log_from_request

from .customer_growth_service import create_marketing_campaign, create_promo_campaign
from .launch_growth_service import (
    build_launch_growth_center,
    build_scaling_readiness,
    upsert_growth_partnership,
)


def _city_id(request):
    raw = request.query_params.get("city") or request.query_params.get("city_id")
    if not raw:
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


@api_view(["GET"])
@permission_classes([IsLaunchCommandStaff])
def launch_growth_dashboard(request):
    city = _city_id(request)
    payload = build_launch_growth_center(city_id=city)
    payload["scaling_readiness"] = build_scaling_readiness(city_id=city)
    return Response(payload)


@api_view(["GET"])
@permission_classes([IsLaunchCommandStaff])
def launch_growth_scaling(request):
    return Response(build_scaling_readiness(city_id=_city_id(request)))


@api_view(["POST"])
@permission_classes([IsLaunchCommandStaff])
def launch_growth_partnership(request):
    try:
        entry = upsert_growth_partnership(request.data or {}, actor=request.user)
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    log_from_request(
        request,
        action="admin_action",
        entity_type="growth_partnership",
        entity_id=str(entry.get("id")),
        summary=f"Saved partnership {entry.get('name')}",
        details=entry,
    )
    return Response(entry, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([IsLaunchCommandStaff])
def launch_growth_promo(request):
    try:
        result = create_promo_campaign(request.data or {}, request.user)
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    log_from_request(
        request,
        action="admin_action",
        entity_type="promo_code",
        entity_id=str(result.get("id")),
        summary=f"Created promo {result.get('code')}",
    )
    return Response(result, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([IsLaunchCommandStaff])
def launch_growth_campaign(request):
    data = request.data or {}
    if not data.get("name"):
        return Response({"detail": "name is required."}, status=status.HTTP_400_BAD_REQUEST)
    result = create_marketing_campaign(data, request.user)
    log_from_request(
        request,
        action="admin_action",
        entity_type="marketing_campaign",
        entity_id=str(result.get("id")),
        summary=f"Created campaign {result.get('name')}",
    )
    return Response(result, status=status.HTTP_201_CREATED)
