"""Phase 37 — Business Intelligence & Data Warehouse API views.

Provides a unified analytics layer that existing dashboards can consume.
Access restricted to CEO, Finance, Operations, and Analytics roles.
"""

from django.http import HttpResponse
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from security.services.audit_service import log_from_request

from .bi_data_warehouse_service import (
    SUBJECT_AREAS,
    build_bi_data_warehouse_overview,
    build_bi_export_rows,
    build_executive_analytics,
    build_geographic_intelligence,
    build_predictive_analytics,
    build_subject_area_summary,
    get_subject_area,
)
from .cache_utils import cached_ops_call
from .executive_permissions import IsAnalyticsStaff
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
    period = (request.query_params.get("period") or "monthly").lower()
    if period not in {"daily", "weekly", "monthly", "quarterly", "annual"}:
        period = "monthly"
    return period


@api_view(["GET"])
@permission_classes([IsAnalyticsStaff])
def bi_overview(request):
    city_id = _city_id(request)
    period = _period(request)
    return Response(
        cached_ops_call(
            "bi_overview",
            lambda: build_bi_data_warehouse_overview(city_id=city_id, period=period),
            city_id=city_id,
            period=period,
        )
    )


@api_view(["GET"])
@permission_classes([IsAnalyticsStaff])
def bi_subject_areas(request):
    areas_param = request.query_params.get("areas")
    areas = areas_param.split(",") if areas_param else None
    city_id = _city_id(request)
    period = _period(request)
    return Response(
        build_subject_area_summary(city_id=city_id, period=period, areas=areas)
    )


@api_view(["GET"])
@permission_classes([IsAnalyticsStaff])
def bi_subject_area_detail(request, area):
    if area not in SUBJECT_AREAS:
        return Response({"detail": "Invalid subject area."}, status=status.HTTP_400_BAD_REQUEST)
    return Response(get_subject_area(area, city_id=_city_id(request), period=_period(request)))


@api_view(["GET"])
@permission_classes([IsAnalyticsStaff])
def bi_executive_analytics(request):
    return Response(
        build_executive_analytics(city_id=_city_id(request), period=_period(request))
    )


@api_view(["GET"])
@permission_classes([IsAnalyticsStaff])
def bi_geographic_intelligence(request):
    return Response(build_geographic_intelligence(city_id=_city_id(request)))


@api_view(["GET"])
@permission_classes([IsAnalyticsStaff])
def bi_predictive_analytics(request):
    return Response(build_predictive_analytics(city_id=_city_id(request)))


@api_view(["GET"])
@permission_classes([IsAnalyticsStaff])
def bi_report_export(request, report_type):
    export_format = (
        request.query_params.get("export_format") or request.query_params.get("format") or "csv"
    ).lower()
    if export_format not in {"csv", "excel", "pdf"}:
        return Response({"detail": "Invalid format."}, status=status.HTTP_400_BAD_REQUEST)
    if report_type not in {"subject_areas", "executive_analytics", "geographic", "predictive"}:
        return Response({"detail": "Invalid report type."}, status=status.HTTP_400_BAD_REQUEST)

    period = _period(request)
    city_id = _city_id(request)
    rows = build_bi_export_rows(report_type=report_type, city_id=city_id, period=period)
    title = f"Yala BI {report_type.replace('_', ' ').title()} Report"

    if export_format == "csv":
        payload = export_csv(rows)
        content_type = "text/csv; charset=utf-8"
        ext = "csv"
    elif export_format == "excel":
        payload = export_excel(rows)
        content_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        ext = "xlsx"
    else:
        payload = export_pdf(rows, title=title)
        content_type = "application/pdf"
        ext = "pdf"

    log_from_request(
        request,
        action="admin_action",
        entity_type="system",
        entity_id=f"bi_report_{report_type}",
        summary=f"BI report exported ({report_type}, {export_format})",
        details={
            "report_type": report_type,
            "format": export_format,
            "period": period,
            "city_id": city_id,
            "rows": len(rows),
        },
    )

    response = HttpResponse(payload, content_type=content_type)
    response["Content-Disposition"] = (
        f'attachment; filename="yala-bi-{report_type}-{period}-{timezone.now():%Y%m%d}.{ext}"'
    )
    return response
