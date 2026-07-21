"""Commercial launch preparation API views."""

from django.http import HttpResponse
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from security.services.audit_service import log_from_request

from .executive_permissions import IsExecutiveStaff, can_ceo_actions
from .executive_views import _city_id
from .launch_service import (
    acknowledge_launch_alert,
    build_business_kpis,
    build_financial_reconciliation,
    build_launch_checklist,
    build_launch_control_dashboard,
    build_onboarding_dashboard,
    build_support_queue,
    create_ops_incident,
    export_ops_incident_rows,
    export_reconciliation_rows,
    get_ops_incident_detail,
    list_launch_alerts,
    list_ops_incidents,
    resolve_launch_alert,
    update_ops_incident,
)
from .report_export import export_csv, export_excel, export_pdf


def _parse_date(value):
    if not value:
        return None
    from django.utils.dateparse import parse_date

    return parse_date(value)


@api_view(["GET"])
@permission_classes([IsExecutiveStaff])
def launch_control_dashboard(request):
    return Response(build_launch_control_dashboard(city_id=_city_id(request)))


@api_view(["GET"])
@permission_classes([IsExecutiveStaff])
def launch_alerts_list(request):
    include_resolved = request.query_params.get("include_resolved") == "1"
    return Response({"alerts": list_launch_alerts(include_resolved=include_resolved)})


@api_view(["POST"])
@permission_classes([IsExecutiveStaff])
def launch_alert_ack(request, alert_id):
    alert = acknowledge_launch_alert(alert_id, request.user)
    if not alert:
        return Response({"detail": "Alert not found."}, status=status.HTTP_404_NOT_FOUND)
    log_from_request(
        request,
        action="launch_alert_ack",
        entity_type="launch_alert",
        entity_id=alert_id,
        summary=f"Acknowledged alert #{alert_id}",
    )
    return Response({"id": alert.id, "status": alert.status})


@api_view(["POST"])
@permission_classes([IsExecutiveStaff])
def launch_alert_resolve(request, alert_id):
    alert = resolve_launch_alert(alert_id)
    if not alert:
        return Response({"detail": "Alert not found."}, status=status.HTTP_404_NOT_FOUND)
    log_from_request(
        request,
        action="launch_alert_resolve",
        entity_type="launch_alert",
        entity_id=alert_id,
        summary=f"Resolved alert #{alert_id}",
    )
    return Response({"id": alert.id, "status": alert.status})


@api_view(["GET", "POST"])
@permission_classes([IsExecutiveStaff])
def launch_incidents(request):
    if request.method == "GET":
        filters = {
            "severity": request.query_params.get("severity"),
            "status": request.query_params.get("status"),
            "owner_id": request.query_params.get("owner_id"),
        }
        return Response({"incidents": list_ops_incidents(filters)})

    payload = request.data or {}
    if not payload.get("title"):
        return Response({"detail": "title is required."}, status=status.HTTP_400_BAD_REQUEST)
    incident = create_ops_incident(payload, request.user)
    log_from_request(
        request,
        action="ops_incident_create",
        entity_type="ops_incident",
        entity_id=incident.id,
        summary=f"Created {incident.reference}",
    )
    return Response(get_ops_incident_detail(incident.id), status=status.HTTP_201_CREATED)


@api_view(["GET", "PATCH"])
@permission_classes([IsExecutiveStaff])
def launch_incident_detail(request, incident_id):
    if request.method == "GET":
        detail = get_ops_incident_detail(incident_id)
        if not detail:
            return Response({"detail": "Incident not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(detail)

    incident = update_ops_incident(incident_id, request.data or {}, request.user)
    if not incident:
        return Response({"detail": "Incident not found."}, status=status.HTTP_404_NOT_FOUND)
    log_from_request(
        request,
        action="ops_incident_update",
        entity_type="ops_incident",
        entity_id=incident.id,
        summary=f"Updated incident {incident.reference}",
    )
    return Response(get_ops_incident_detail(incident.id))


@api_view(["GET"])
@permission_classes([IsExecutiveStaff])
def launch_incident_export(request, incident_id):
    rows = export_ops_incident_rows(incident_id)
    if not rows:
        return Response({"detail": "Incident not found."}, status=status.HTTP_404_NOT_FOUND)
    export_format = request.query_params.get("export_format", "csv")
    filename = f"incident-{incident_id}"
    if export_format == "xlsx":
        content = export_excel(rows)
        content_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        filename += ".xlsx"
    elif export_format == "pdf":
        content = export_pdf(rows, title=f"Incident Report #{incident_id}")
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
@permission_classes([IsExecutiveStaff])
def launch_support_queue(request):
    filters = {
        "status": request.query_params.get("status"),
        "priority": request.query_params.get("priority"),
        "city_id": _city_id(request),
        "category": request.query_params.get("category"),
        "date_from": _parse_date(request.query_params.get("date_from")),
        "date_to": _parse_date(request.query_params.get("date_to")),
    }
    return Response(build_support_queue(filters))


@api_view(["GET"])
@permission_classes([IsExecutiveStaff])
def launch_onboarding(request):
    return Response(build_onboarding_dashboard())


@api_view(["GET"])
@permission_classes([IsExecutiveStaff])
def launch_finance_reconciliation(request):
    target = _parse_date(request.query_params.get("date"))
    return Response(build_financial_reconciliation(date=target))


@api_view(["GET"])
@permission_classes([IsExecutiveStaff])
def launch_finance_export(request):
    target = _parse_date(request.query_params.get("date"))
    rows = export_reconciliation_rows(date=target)
    export_format = request.query_params.get("export_format", "csv")
    if export_format == "xlsx":
        content = export_excel(rows)
        content_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        filename = "reconciliation.xlsx"
    elif export_format == "pdf":
        content = export_pdf(rows, title="Daily Reconciliation")
        content_type = "application/pdf"
        filename = "reconciliation.pdf"
    else:
        content = export_csv(rows)
        content_type = "text/csv"
        filename = "reconciliation.csv"
    response = HttpResponse(content, content_type=content_type)
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response


@api_view(["GET"])
@permission_classes([IsExecutiveStaff])
def launch_kpis(request):
    return Response(build_business_kpis(city_id=_city_id(request)))


@api_view(["GET"])
@permission_classes([IsExecutiveStaff])
def launch_checklist(request):
    return Response(build_launch_checklist())


@api_view(["GET"])
@permission_classes([IsExecutiveStaff])
def launch_hub(request):
    """Single payload for the launch admin hub."""
    city = _city_id(request)
    return Response(
        {
            "control": build_launch_control_dashboard(city_id=city),
            "alerts": list_launch_alerts(),
            "incidents": list_ops_incidents(),
            "support": build_support_queue({}),
            "onboarding": build_onboarding_dashboard(),
            "finance": build_financial_reconciliation(),
            "kpis": build_business_kpis(city_id=city),
            "checklist": build_launch_checklist(),
            "permissions": {"ceo": can_ceo_actions(request.user)},
        }
    )
