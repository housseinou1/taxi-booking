"""Driver Incentive Engine API views (Phase 30)."""

from django.http import HttpResponse
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from security.services.audit_service import log_from_request

from .cache_utils import invalidate_ops_cache
from .executive_permissions import IsCeoStaff, IsFinanceStaff, IsLaunchCommandStaff, can_dispatch_operations, can_manage_finance
from .incentive_engine_service import (
    approve_bonus_payout,
    build_bonus_report_rows,
    build_ceo_dashboard,
    build_finance_dashboard,
    build_incentive_engine_dashboard,
    build_ops_dashboard,
    create_campaign,
    list_campaigns,
    reject_bonus_payout,
    update_campaign,
)
from .report_export import export_csv


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


def _require_finance(request):
    if not can_manage_finance(request.user):
        return Response({"detail": "Finance permission required."}, status=status.HTTP_403_FORBIDDEN)
    return None


@api_view(["GET"])
@permission_classes([IsLaunchCommandStaff])
def incentive_engine_dashboard(request):
    return Response(build_incentive_engine_dashboard(city_id=_city_id(request)))


@api_view(["GET", "POST"])
@permission_classes([IsLaunchCommandStaff])
def incentive_campaigns(request):
    if request.method == "GET":
        status_filter = request.query_params.get("status")
        return Response({"campaigns": list_campaigns(status=status_filter)})

    denied = _require_ops(request)
    if denied:
        return denied

    campaign = create_campaign(request.data or {}, request.user)
    log_from_request(
        request,
        action="admin_action",
        entity_type="system",
        entity_id=str(campaign["id"]),
        summary=f"Created incentive campaign {campaign['name']}",
        details=request.data,
    )
    return Response(campaign, status=status.HTTP_201_CREATED)


@api_view(["GET", "PATCH"])
@permission_classes([IsLaunchCommandStaff])
def incentive_campaign_detail(request, campaign_id):
    if request.method == "GET":
        campaigns = list_campaigns()
        match = next((c for c in campaigns if c["id"] == campaign_id), None)
        if not match:
            return Response({"detail": "Campaign not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(match)

    denied = _require_ops(request)
    if denied:
        return denied

    updated = update_campaign(campaign_id, request.data or {}, request.user)
    if not updated:
        return Response({"detail": "Campaign not found."}, status=status.HTTP_404_NOT_FOUND)

    log_from_request(
        request,
        action="admin_action",
        entity_type="system",
        entity_id=str(campaign_id),
        summary=f"Updated incentive campaign {updated['name']}",
        details=request.data,
    )
    invalidate_ops_cache("incentive_engine_dashboard")
    return Response(updated)


@api_view(["GET"])
@permission_classes([IsLaunchCommandStaff])
def incentive_ops_dashboard(request):
    return Response(build_ops_dashboard(city_id=_city_id(request)))


@api_view(["GET"])
@permission_classes([IsCeoStaff])
def incentive_ceo_dashboard(request):
    return Response(build_ceo_dashboard(city_id=_city_id(request)))


@api_view(["GET"])
@permission_classes([IsFinanceStaff])
def incentive_finance_dashboard(request):
    return Response(build_finance_dashboard())


@api_view(["POST"])
@permission_classes([IsFinanceStaff])
def incentive_payout_action(request, payment_id):
    denied = _require_finance(request)
    if denied:
        return denied

    action = (request.data.get("action") or "approve").strip().lower()
    note = str(request.data.get("note") or request.data.get("admin_note") or "").strip()

    if action == "reject":
        result = reject_bonus_payout(payment_id, request.user, note=note)
    else:
        pay_now = request.data.get("pay_now", True)
        result = approve_bonus_payout(payment_id, request.user, note=note, pay_now=bool(pay_now))

    if not result:
        return Response({"detail": "Payout not found or not actionable."}, status=status.HTTP_404_NOT_FOUND)

    log_from_request(
        request,
        action="admin_action",
        entity_type="payment",
        entity_id=str(payment_id),
        summary=f"Incentive payout {action} — {result['amount']} MRU",
        details={"action": action, "note": note},
    )
    invalidate_ops_cache("incentive_engine_dashboard")
    return Response(result)


@api_view(["GET"])
@permission_classes([IsFinanceStaff])
def incentive_bonus_export(request):
    days = int(request.query_params.get("days", 30))
    rows = build_bonus_report_rows(since_days=days)
    log_from_request(
        request,
        action="admin_action",
        entity_type="system",
        entity_id="incentive_export",
        summary=f"Exported incentive bonus report ({len(rows)} rows)",
        details={"days": days},
    )
    response = HttpResponse(export_csv(rows), content_type="text/csv; charset=utf-8")
    response["Content-Disposition"] = f'attachment; filename="incentive-bonuses-{timezone.now():%Y%m%d}.csv"'
    return response
