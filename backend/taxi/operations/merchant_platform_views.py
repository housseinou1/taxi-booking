"""Merchant Platform API views (Phase 31)."""

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from security.services.audit_service import log_from_request

from .cache_utils import invalidate_ops_cache
from .executive_permissions import IsCeoStaff, IsFinanceStaff, IsLaunchCommandStaff, can_dispatch_operations, can_manage_finance
from .merchant_platform_service import (
    admin_merchant_action,
    approve_settlement,
    build_cached_platform_dashboard,
    build_merchant_ceo_dashboard,
    build_merchant_finance_dashboard,
    generate_weekly_settlement,
    update_merchant_commission,
)


def _require_ops(request):
    if not can_dispatch_operations(request.user):
        return Response({"detail": "Operations permission required."}, status=status.HTTP_403_FORBIDDEN)
    return None


def _require_finance(request):
    if not can_manage_finance(request.user):
        return Response({"detail": "Finance permission required."}, status=status.HTTP_403_FORBIDDEN)
    return None


@api_view(["GET"])
@permission_classes([IsLaunchCommandStaff])
def merchant_platform_dashboard(request):
    city = request.query_params.get("city")
    return Response(build_cached_platform_dashboard(city=city))


@api_view(["GET"])
@permission_classes([IsCeoStaff])
def merchant_platform_ceo(request):
    return Response(build_merchant_ceo_dashboard())


@api_view(["GET"])
@permission_classes([IsFinanceStaff])
def merchant_platform_finance(request):
    return Response(build_merchant_finance_dashboard())


@api_view(["POST"])
@permission_classes([IsLaunchCommandStaff])
def merchant_platform_merchant_action(request, merchant_id):
    denied = _require_ops(request)
    if denied:
        return denied

    action = (request.data.get("action") or "").strip().lower()
    result = admin_merchant_action(
        merchant_id,
        action,
        request.user,
        reason=str(request.data.get("reason") or "").strip(),
    )
    if not result:
        return Response({"detail": "Invalid merchant or action."}, status=status.HTTP_400_BAD_REQUEST)

    log_from_request(
        request,
        action="admin_action",
        entity_type="merchant",
        entity_id=str(merchant_id),
        summary=f"Merchant {action}: {result['business_name']}",
        details=request.data,
    )
    invalidate_ops_cache("merchant_platform_dashboard")
    return Response(result)


@api_view(["PATCH"])
@permission_classes([IsFinanceStaff])
def merchant_platform_commission(request, merchant_id):
    denied = _require_finance(request)
    if denied:
        return denied

    rate = request.data.get("commission_rate")
    result = update_merchant_commission(merchant_id, rate, request.user)
    if not result:
        return Response({"detail": "Merchant not found."}, status=status.HTTP_404_NOT_FOUND)

    log_from_request(
        request,
        action="admin_action",
        entity_type="merchant",
        entity_id=str(merchant_id),
        summary=f"Updated merchant commission → {rate}",
        details=request.data,
    )
    return Response(result)


@api_view(["POST"])
@permission_classes([IsFinanceStaff])
def merchant_platform_settlement_generate(request, merchant_id):
    denied = _require_finance(request)
    if denied:
        return denied

    result = generate_weekly_settlement(merchant_id, request.user)
    if not result:
        return Response({"detail": "Merchant not found."}, status=status.HTTP_404_NOT_FOUND)

    log_from_request(
        request,
        action="admin_action",
        entity_type="merchant",
        entity_id=str(merchant_id),
        summary=f"Generated settlement {result['invoice_reference']}",
        details=result,
    )
    return Response(result, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([IsFinanceStaff])
def merchant_platform_settlement_approve(request, settlement_id):
    denied = _require_finance(request)
    if denied:
        return denied

    result = approve_settlement(settlement_id, request.user)
    if not result:
        return Response({"detail": "Settlement not found or not pending."}, status=status.HTTP_404_NOT_FOUND)

    log_from_request(
        request,
        action="admin_action",
        entity_type="payment",
        entity_id=str(settlement_id),
        summary=f"Approved merchant settlement {result['net_payout']} MRU",
        details=result,
    )
    return Response(result)
