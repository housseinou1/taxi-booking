"""Phase 34 — CEO Master Command Center API views.

CEO-only endpoints that expose a unified dashboard and executive actions.
All actions are audited via log_from_request.
"""

from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from notifications.services import send_push_notification
from security.services.audit_service import log_from_request

from .cache_utils import invalidate_ops_cache
from .ceo_master_command_service import (
    build_ceo_report_rows,
    build_executive_overview,
    build_financial_overview,
    build_fleet_overview,
    build_growth_overview,
    build_master_dashboard,
    build_operations_overview,
    build_ai_insights_summary,
    build_readiness_status,
)
from .executive_permissions import IsCeoStaff
from .incentive_engine_service import approve_bonus_payout
from .models import PlatformSetting
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


def _period(request):
    period = (request.query_params.get("period") or "daily").lower()
    if period not in {"daily", "weekly", "monthly", "yearly"}:
        period = "daily"
    return period


@api_view(["GET"])
@permission_classes([IsCeoStaff])
def ceo_master_dashboard(request):
    return Response(build_master_dashboard(city_id=_city_id(request), period=_period(request)))


@api_view(["GET"])
@permission_classes([IsCeoStaff])
def ceo_master_overview(request):
    return Response(build_executive_overview(city_id=_city_id(request), period=_period(request)))


@api_view(["GET"])
@permission_classes([IsCeoStaff])
def ceo_master_finance(request):
    return Response(build_financial_overview(city_id=_city_id(request)))


@api_view(["GET"])
@permission_classes([IsCeoStaff])
def ceo_master_operations(request):
    return Response(build_operations_overview(city_id=_city_id(request)))


@api_view(["GET"])
@permission_classes([IsCeoStaff])
def ceo_master_growth(request):
    return Response(build_growth_overview(city_id=_city_id(request)))


@api_view(["GET"])
@permission_classes([IsCeoStaff])
def ceo_master_fleet(request):
    return Response(build_fleet_overview(city_id=_city_id(request)))


@api_view(["GET"])
@permission_classes([IsCeoStaff])
def ceo_master_ai_insights(request):
    return Response(build_ai_insights_summary(city_id=_city_id(request)))


@api_view(["GET"])
@permission_classes([IsCeoStaff])
def ceo_master_readiness(request):
    return Response(build_readiness_status())


@api_view(["POST"])
@permission_classes([IsCeoStaff])
def ceo_master_action_broadcast(request):
    """Broadcast an announcement to all users or a role segment."""
    title = str(request.data.get("title", "Yala Announcement")).strip()
    message = str(request.data.get("message", "")).strip()
    segment = str(request.data.get("segment", "all")).strip().lower()
    if not message:
        return Response({"detail": "Message is required."}, status=status.HTTP_400_BAD_REQUEST)

    # NOTE: send_push_notification is expected to support a list of tokens.
    # Fallback: push to a dummy broadcast topic if supported by your provider.
    from django.contrib.auth import get_user_model
    User = get_user_model()
    user_query = User.objects.filter(is_active=True)
    if segment == "drivers":
        user_query = user_query.filter(user_type="driver")
    elif segment == "riders":
        user_query = user_query.filter(user_type="rider")
    elif segment == "couriers":
        user_query = user_query.filter(user_type="courier")
    elif segment == "staff":
        user_query = user_query.filter(is_staff=True)

    tokens = list(
        user_query.exclude(device_token="").exclude(device_token__isnull=True)
        .values_list("device_token", flat=True)[:500]
    )
    failed = 0
    for token in tokens:
        try:
            send_push_notification(token, title, message, extra={"segment": segment})
        except Exception:
            failed += 1

    log_from_request(
        request,
        action="admin_action",
        entity_type="system",
        entity_id="broadcast",
        summary=f"CEO broadcast sent to {segment}",
        details={"title": title, "message": message, "segment": segment, "recipients": len(tokens), "failed": failed},
    )
    return Response({"sent": len(tokens) - failed, "failed": failed, "segment": segment}, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([IsCeoStaff])
def ceo_master_action_freeze(request):
    """Toggle platform emergency freeze (maintenance mode)."""
    enabled = bool(request.data.get("enabled", True))
    reason = str(request.data.get("reason", "CEO emergency freeze")).strip()

    payload = {
        "enabled": enabled,
        "reason": reason,
        "updated_at": timezone.now().isoformat(),
        "updated_by": request.user.id,
    }
    PlatformSetting.set_value("maintenance_mode", payload, user=request.user)

    log_from_request(
        request,
        action="admin_action",
        entity_type="system",
        entity_id="maintenance_mode",
        summary=f"Platform freeze set to {enabled}",
        details=payload,
    )
    return Response({"maintenance_mode": enabled, "reason": reason}, status=status.HTTP_200_OK)


@api_view(["POST"])
@permission_classes([IsCeoStaff])
def ceo_master_action_approve_payout(request):
    """CEO override to approve an incentive bonus payout."""
    payment_id = request.data.get("payment_id")
    if not payment_id:
        return Response({"detail": "payment_id required."}, status=status.HTTP_400_BAD_REQUEST)
    note = str(request.data.get("note", "CEO approval")).strip()
    result = approve_bonus_payout(payment_id, request.user, note=note, pay_now=True)
    if not result:
        return Response({"detail": "Payout not found or not actionable."}, status=status.HTTP_404_NOT_FOUND)
    log_from_request(
        request,
        action="admin_action",
        entity_type="payment",
        entity_id=str(payment_id),
        summary=f"CEO approved bonus payout {payment_id}",
        details={"amount": result["amount"], "note": note},
    )
    invalidate_ops_cache("incentive_engine_dashboard")
    return Response(result)


@api_view(["POST"])
@permission_classes([IsCeoStaff])
def ceo_master_action_approve_onboarding(request):
    """Approve merchant or driver/courier onboarding by entity ID."""
    entity_type = str(request.data.get("entity_type", "")).strip().lower()
    entity_id = request.data.get("entity_id")
    note = str(request.data.get("note", "")).strip()

    if not entity_id:
        return Response({"detail": "entity_id required."}, status=status.HTTP_400_BAD_REQUEST)

    approved = False
    if entity_type == "merchant":
        from merchants.models import Merchant
        merchant = get_object_or_404(Merchant, id=entity_id)
        merchant.status = "active"
        merchant.save(update_fields=["status"])
        approved = True
    elif entity_type in ("driver", "courier"):
        from taxi.drivers.models import DriverProfile
        profile = get_object_or_404(DriverProfile, user_id=entity_id)
        profile.status = "approved"
        profile.save(update_fields=["status"])
        approved = True
    elif entity_type == "partner":
        from partners.models import Partner
        partner = get_object_or_404(Partner, id=entity_id)
        partner.contract_status = "approved"
        partner.save(update_fields=["contract_status"])
        approved = True
    else:
        return Response(
            {"detail": "entity_type must be merchant, driver, courier, or partner."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    log_from_request(
        request,
        action="admin_action",
        entity_type=entity_type,
        entity_id=str(entity_id),
        summary=f"CEO approved {entity_type} onboarding",
        details={"note": note},
    )
    return Response({"approved": True, "entity_type": entity_type, "entity_id": entity_id})


@api_view(["POST"])
@permission_classes([IsCeoStaff])
def ceo_master_action_approve_incentive(request):
    """CEO override to activate an incentive campaign."""
    campaign_id = request.data.get("campaign_id")
    note = str(request.data.get("note", "")).strip()
    if not campaign_id:
        return Response({"detail": "campaign_id required."}, status=status.HTTP_400_BAD_REQUEST)

    from incentives.models import IncentiveProgram
    program = get_object_or_404(IncentiveProgram, id=campaign_id)
    program.status = "active"
    program.save(update_fields=["status"])

    log_from_request(
        request,
        action="admin_action",
        entity_type="system",
        entity_id=str(campaign_id),
        summary=f"CEO activated incentive campaign {program.name}",
        details={"note": note},
    )
    invalidate_ops_cache("incentive_engine_dashboard")
    return Response({"activated": True, "campaign_id": campaign_id, "name": program.name})


@api_view(["GET"])
@permission_classes([IsCeoStaff])
def ceo_master_report_export(request, report_type):
    """Export daily/weekly/monthly/quarterly/annual CEO report as CSV."""
    report_type = (report_type or "daily").strip().lower()
    if report_type not in {"daily", "weekly", "monthly", "quarterly", "annual"}:
        return Response({"detail": "Invalid report type."}, status=status.HTTP_400_BAD_REQUEST)

    rows = build_ceo_report_rows(report_type=report_type, city_id=_city_id(request))
    log_from_request(
        request,
        action="admin_action",
        entity_type="system",
        entity_id=f"ceo_report_{report_type}",
        summary=f"CEO exported {report_type} report",
        details={"rows": len(rows)},
    )
    response = HttpResponse(export_csv(rows), content_type="text/csv; charset=utf-8")
    response["Content-Disposition"] = f'attachment; filename="ceo-report-{report_type}-{timezone.now():%Y%m%d}.csv"'
    return response
