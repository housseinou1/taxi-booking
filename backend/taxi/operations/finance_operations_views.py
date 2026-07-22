"""Financial Operations & Reconciliation API views (Phase 24)."""

from django.http import HttpResponse
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from security.services.audit_service import log_from_request

from .executive_permissions import IsFinanceStaff, can_manage_finance
from .finance_operations_service import (
    ACCOUNTING_REPORT_TYPES,
    build_accounting_report,
    build_daily_reconciliation,
    build_finance_audit_trail,
    build_finance_operations_dashboard,
    build_finance_operations_export_rows,
    build_payment_provider_breakdown,
    build_revenue_analytics,
    build_withdrawal_export_rows,
    build_withdrawal_queue,
)
from .report_export import export_csv, export_excel, export_pdf


def _city_id(request):
    raw = request.query_params.get("city") or request.query_params.get("city_id")
    if not raw:
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


def _export_response(rows, export_format, filename, title="Yala Finance Operations"):
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


def _require_manage(request):
    if not can_manage_finance(request.user):
        return Response({"detail": "Finance management permission required."}, status=status.HTTP_403_FORBIDDEN)
    return None


@api_view(["GET"])
@permission_classes([IsFinanceStaff])
def finance_operations_dashboard(request):
    target_date = request.query_params.get("date")
    period = request.query_params.get("period", "daily")
    if period not in {"daily", "weekly", "monthly", "yearly"}:
        period = "daily"
    return Response(
        build_finance_operations_dashboard(
            date=target_date,
            period=period,
            city_id=_city_id(request),
            withdrawal_status=request.query_params.get("withdrawal_status") or None,
            withdrawal_method=request.query_params.get("withdrawal_method") or None,
        )
    )


@api_view(["GET"])
@permission_classes([IsFinanceStaff])
def finance_reconciliation(request):
    target_date = request.query_params.get("date")
    return Response(build_daily_reconciliation(target=target_date, city_id=_city_id(request)))


@api_view(["GET"])
@permission_classes([IsFinanceStaff])
def finance_payment_providers(request):
    date_from = request.query_params.get("date_from") or request.query_params.get("date")
    date_to = request.query_params.get("date_to") or date_from
    return Response(build_payment_provider_breakdown(start=date_from, end=date_to))


@api_view(["GET"])
@permission_classes([IsFinanceStaff])
def finance_withdrawals(request):
    return Response(
        build_withdrawal_queue(
            date_from=request.query_params.get("date_from"),
            date_to=request.query_params.get("date_to"),
            status=request.query_params.get("status") or None,
            payment_method=request.query_params.get("payment_method") or None,
            limit=min(int(request.query_params.get("limit", 200)), 1000),
        )
    )


@api_view(["GET"])
@permission_classes([IsFinanceStaff])
def finance_revenue_analytics(request):
    period = request.query_params.get("period", "daily")
    if period not in {"daily", "weekly", "monthly", "yearly"}:
        period = "daily"
    return Response(build_revenue_analytics(period=period, city_id=_city_id(request)))


@api_view(["GET"])
@permission_classes([IsFinanceStaff])
def finance_accounting_report(request):
    report_type = request.query_params.get("type", "daily")
    if report_type not in ACCOUNTING_REPORT_TYPES:
        return Response({"detail": "Invalid report type."}, status=status.HTTP_400_BAD_REQUEST)
    return Response(
        build_accounting_report(
            report_type,
            date_from=request.query_params.get("date_from"),
            date_to=request.query_params.get("date_to"),
            city_id=_city_id(request),
        )
    )


@api_view(["GET"])
@permission_classes([IsFinanceStaff])
def finance_audit_trail(request):
    return Response(
        build_finance_audit_trail(
            date_from=request.query_params.get("date_from"),
            date_to=request.query_params.get("date_to"),
            limit=min(int(request.query_params.get("limit", 100)), 500),
        )
    )


@api_view(["GET"])
@permission_classes([IsFinanceStaff])
def finance_operations_export(request):
    denied = _require_manage(request)
    if denied:
        return denied

    export_format = request.query_params.get("export_format", "csv")
    export_kind = request.query_params.get("kind", "accounting")
    report_type = request.query_params.get("type", "daily")

    if export_kind == "withdrawals":
        rows = build_withdrawal_export_rows(
            date_from=request.query_params.get("date_from"),
            date_to=request.query_params.get("date_to"),
            status=request.query_params.get("status") or None,
            payment_method=request.query_params.get("payment_method") or None,
        )
        title = "Yala Withdrawal Payout Report"
        filename = "withdrawal-payouts"
    else:
        if report_type not in ACCOUNTING_REPORT_TYPES:
            return Response({"detail": "Invalid report type."}, status=status.HTTP_400_BAD_REQUEST)
        rows = build_finance_operations_export_rows(
            report_type,
            date_from=request.query_params.get("date_from"),
            date_to=request.query_params.get("date_to"),
        )
        title = ACCOUNTING_REPORT_TYPES[report_type]
        filename = f"finance-{report_type}"

    log_from_request(
        request,
        action="admin_action",
        entity_type="system",
        summary=f"Exported finance report ({export_kind or report_type})",
        details={
            "kind": export_kind,
            "report_type": report_type,
            "export_format": export_format,
            "row_count": len(rows),
        },
    )
    return _export_response(rows, export_format, filename, title=title)
