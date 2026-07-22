"""Growth & Expansion Dashboard API views (Phase 26 — CEO only)."""

from django.http import HttpResponse
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from security.services.audit_service import log_from_request

from .executive_permissions import IsCeoStaff
from .growth_expansion_service import build_growth_expansion_dashboard, build_growth_export_rows
from .report_export import export_csv, export_excel, export_pdf


def _city_id(request):
    raw = request.query_params.get("city") or request.query_params.get("city_id")
    if not raw:
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


def _export_response(rows, export_format, filename, title="Yala Growth & Expansion"):
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


@api_view(["GET"])
@permission_classes([IsCeoStaff])
def growth_dashboard(request):
    return Response(build_growth_expansion_dashboard(city_id=_city_id(request)))


@api_view(["GET"])
@permission_classes([IsCeoStaff])
def growth_export(request):
    export_format = request.query_params.get("export_format", "csv")
    rows = build_growth_export_rows(city_id=_city_id(request))
    log_from_request(
        request,
        action="admin_action",
        entity_type="system",
        entity_id="growth_expansion_export",
        summary=f"Exported growth dashboard ({export_format})",
        details={"row_count": len(rows), "format": export_format},
    )
    return _export_response(rows, export_format, "growth-expansion")
