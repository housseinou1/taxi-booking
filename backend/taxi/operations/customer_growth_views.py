"""Customer Growth & Loyalty Platform API views (Phase 33)."""

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from loyalty.services.loyalty_service import FEATURE_FLAG_KEY
from operations.executive_permissions import IsCeoStaff, IsFinanceStaff, IsLaunchCommandStaff
from security.services.audit_service import log_from_request

from .cache_utils import invalidate_ops_cache
from .customer_growth_service import (
    build_cached_customer_growth_dashboard,
    build_customer_growth_ceo_dashboard,
    build_customer_growth_finance_dashboard,
    create_marketing_campaign,
    create_promo_campaign,
    update_growth_flags,
)


@api_view(["GET"])
@permission_classes([IsLaunchCommandStaff])
def customer_growth_dashboard(request):
    return Response(build_cached_customer_growth_dashboard())


@api_view(["GET"])
@permission_classes([IsCeoStaff])
def customer_growth_ceo(request):
    return Response(build_customer_growth_ceo_dashboard())


@api_view(["GET"])
@permission_classes([IsFinanceStaff])
def customer_growth_finance(request):
    return Response(build_customer_growth_finance_dashboard())


@api_view(["PATCH"])
@permission_classes([IsLaunchCommandStaff])
def customer_growth_flags(request):
    flags = update_growth_flags(request.data, request.user)
    log_from_request(
        request,
        action="admin_action",
        entity_type="platform_setting",
        entity_id=FEATURE_FLAG_KEY,
        summary="Updated customer growth feature flags",
        details=flags,
    )
    return Response({"feature_flags": flags})


@api_view(["POST"])
@permission_classes([IsLaunchCommandStaff])
def customer_growth_promo_create(request):
    try:
        result = create_promo_campaign(request.data, request.user)
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    except Exception as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    log_from_request(
        request,
        action="admin_action",
        entity_type="promo_code",
        entity_id=str(result["id"]),
        summary=f"Created promo campaign {result['code']}",
        details=request.data,
    )
    return Response(result, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([IsLaunchCommandStaff])
def customer_growth_campaign_create(request):
    if not request.data.get("name"):
        return Response({"detail": "name is required."}, status=status.HTTP_400_BAD_REQUEST)

    result = create_marketing_campaign(request.data, request.user)
    log_from_request(
        request,
        action="admin_action",
        entity_type="marketing_campaign",
        entity_id=str(result["id"]),
        summary=f"Created marketing campaign {result['name']}",
        details=request.data,
    )
    return Response(result, status=status.HTTP_201_CREATED)
