"""Phase 35 — Board & Investor Reporting Suite API views.

Access restricted to CEO and Board groups. Full audit logging on exports.
"""

from django.http import HttpResponse
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from security.services.audit_service import log_from_request

from .board_reporting_service import (
    build_board_report_rows,
    build_board_reporting_suite,
    build_business_kpis_report,
    build_executive_summary,
    build_financial_report,
    build_growth_report,
    build_operational_report,
    build_risk_dashboard,
    build_strategic_planning,
)
from .executive_permissions import IsBoardOrCeoStaff
from .report_export import export_csv, export_excel, export_pdf


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
    period = (request.query_params.get("period") or "weekly").lower()
    if period not in {"daily", "weekly", "monthly", "quarterly", "annual"}:
        period = "weekly"
    return period


@api_view(["GET"])
@permission_classes([IsBoardOrCeoStaff])
def board_reporting_suite(request):
    return Response(
        build_board_reporting_suite(period=_period(request), city_id=_city_id(request))
    )


@api_view(["GET"])
@permission_classes([IsBoardOrCeoStaff])
def board_executive_summary(request):
    return Response(
        build_executive_summary(period=_period(request), city_id=_city_id(request))
    )


@api_view(["GET"])
@permission_classes([IsBoardOrCeoStaff])
def board_business_kpis(request):
    return Response(build_business_kpis_report(city_id=_city_id(request)))


@api_view(["GET"])
@permission_classes([IsBoardOrCeoStaff])
def board_financial_report(request):
    return Response(
        build_financial_report(period=_period(request), city_id=_city_id(request))
    )


@api_view(["GET"])
@permission_classes([IsBoardOrCeoStaff])
def board_operational_report(request):
    return Response(build_operational_report(city_id=_city_id(request)))


@api_view(["GET"])
@permission_classes([IsBoardOrCeoStaff])
def board_growth_report(request):
    return Response(build_growth_report(city_id=_city_id(request)))


@api_view(["GET"])
@permission_classes([IsBoardOrCeoStaff])
def board_risk_dashboard(request):
    return Response(build_risk_dashboard())


@api_view(["GET"])
@permission_classes([IsBoardOrCeoStaff])
def board_strategic_planning(request):
    return Response(build_strategic_planning(city_id=_city_id(request)))


@api_view(["GET"])
@permission_classes([IsBoardOrCeoStaff])
def board_report_export(request, report_type):
    export_format = (request.query_params.get("export_format") or request.query_params.get("format") or "csv").lower()
    if export_format not in {"csv", "excel", "pdf", "presentation"}:
        return Response({"detail": "Invalid format."}, status=status.HTTP_400_BAD_REQUEST)

    if report_type not in {
        "executive",
        "business_kpis",
        "financial",
        "operational",
        "growth",
        "risk",
        "strategic",
        "full",
    }:
        return Response({"detail": "Invalid report type."}, status=status.HTTP_400_BAD_REQUEST)

    period = _period(request)
    city_id = _city_id(request)

    if report_type == "full":
        suite = build_board_reporting_suite(period=period, city_id=city_id)
        rows = []
        for section_name, section_data in suite.items():
            if isinstance(section_data, dict):
                for key, value in section_data.items():
                    if key in ("generated_at", "period", "export_formats"):
                        continue
                    rows.append({"section": section_name, "metric": key, "value": str(value)[:200]})
    else:
        rows = build_board_report_rows(report_type=report_type, period=period, city_id=city_id)

    title = f"Yala {report_type.replace('_', ' ').title()} Report — {period}"

    if export_format == "csv":
        payload = export_csv(rows)
        content_type = "text/csv; charset=utf-8"
        ext = "csv"
    elif export_format == "excel":
        payload = export_excel(rows)
        content_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        ext = "xlsx"
    else:  # pdf or presentation
        payload = export_pdf(rows, title=title)
        content_type = "application/pdf"
        ext = "pdf"

    log_from_request(
        request,
        action="admin_action",
        entity_type="system",
        entity_id=f"board_report_{report_type}",
        summary=f"Board report exported ({report_type}, {export_format})",
        details={"report_type": report_type, "format": export_format, "period": period, "rows": len(rows)},
    )

    response = HttpResponse(payload, content_type=content_type)
    response["Content-Disposition"] = (
        f'attachment; filename="yala-board-{report_type}-{period}-{timezone.now():%Y%m%d}.{ext}"'
    )
    return response
