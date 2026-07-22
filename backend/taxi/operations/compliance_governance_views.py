"""Phase 36 — Compliance & Governance Center API views.

Restricted to CEO and Compliance roles. All mutations are audited.
"""

from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from security.services.audit_service import log_from_request

from .compliance_governance_service import (
    build_audit_center,
    build_ceo_governance_dashboard,
    build_compliance_calendar,
    build_compliance_dashboard,
    build_compliance_governance_suite,
    build_policy_management,
    build_risk_register,
)
from .executive_permissions import IsComplianceOrCeoStaff
from .models import ComplianceAudit, ComplianceCalendarEvent, ComplianceRisk, PolicyDocument
from .report_export import export_csv, export_excel, export_pdf


@api_view(["GET"])
@permission_classes([IsComplianceOrCeoStaff])
def compliance_governance_suite(request):
    return Response(build_compliance_governance_suite())


@api_view(["GET"])
@permission_classes([IsComplianceOrCeoStaff])
def compliance_dashboard(request):
    return Response(build_compliance_dashboard())


@api_view(["GET"])
@permission_classes([IsComplianceOrCeoStaff])
def compliance_audit_center(request):
    return Response(build_audit_center())


@api_view(["GET"])
@permission_classes([IsComplianceOrCeoStaff])
def compliance_policy_management(request):
    return Response(build_policy_management())


@api_view(["GET"])
@permission_classes([IsComplianceOrCeoStaff])
def compliance_risk_register(request):
    return Response(build_risk_register())


@api_view(["GET"])
@permission_classes([IsComplianceOrCeoStaff])
def compliance_calendar(request):
    days = int(request.query_params.get("days", 90))
    return Response(build_compliance_calendar(days=days))


@api_view(["GET"])
@permission_classes([IsComplianceOrCeoStaff])
def compliance_ceo_governance(request):
    return Response(build_ceo_governance_dashboard())


@api_view(["POST"])
@permission_classes([IsComplianceOrCeoStaff])
def compliance_audit_action(request, audit_id):
    audit = get_object_or_404(ComplianceAudit, id=audit_id)
    new_status = request.data.get("status")
    note = str(request.data.get("note", "")).strip()

    if new_status:
        valid = {s[0] for s in ComplianceAudit.STATUS_CHOICES}
        if new_status not in valid:
            return Response({"detail": "Invalid status."}, status=status.HTTP_400_BAD_REQUEST)
        audit.status = new_status
        if new_status in ("in_progress",) and not audit.started_at:
            audit.started_at = timezone.now()
        if new_status == "closed":
            audit.completed_at = timezone.now()
    if note:
        actions = list(audit.corrective_actions or [])
        actions.append({"note": note, "updated_by": request.user.id, "updated_at": timezone.now().isoformat()})
        audit.corrective_actions = actions
    audit.save()

    log_from_request(
        request,
        action="admin_action",
        entity_type="compliance_audit",
        entity_id=str(audit_id),
        summary=f"Updated compliance audit {audit.reference}",
        details={"status": new_status, "note": note},
    )
    return Response({"id": audit.id, "reference": audit.reference, "status": audit.status})


@api_view(["POST"])
@permission_classes([IsComplianceOrCeoStaff])
def compliance_risk_action(request, risk_id):
    risk = get_object_or_404(ComplianceRisk, id=risk_id)
    new_status = request.data.get("status")
    mitigation = request.data.get("mitigation")

    if new_status:
        valid = {s[0] for s in ComplianceRisk.STATUS_CHOICES}
        if new_status not in valid:
            return Response({"detail": "Invalid status."}, status=status.HTTP_400_BAD_REQUEST)
        risk.status = new_status
    if mitigation:
        risk.mitigation = mitigation
    risk.save()

    log_from_request(
        request,
        action="admin_action",
        entity_type="compliance_risk",
        entity_id=str(risk_id),
        summary=f"Updated compliance risk {risk.reference}",
        details={"status": new_status, "mitigation": mitigation},
    )
    return Response({"id": risk.id, "reference": risk.reference, "status": risk.status})


@api_view(["POST"])
@permission_classes([IsComplianceOrCeoStaff])
def compliance_calendar_action(request, event_id):
    event = get_object_or_404(ComplianceCalendarEvent, id=event_id)
    new_status = request.data.get("status")
    if new_status:
        valid = {s[0] for s in ComplianceCalendarEvent.STATUS_CHOICES}
        if new_status not in valid:
            return Response({"detail": "Invalid status."}, status=status.HTTP_400_BAD_REQUEST)
        event.status = new_status
        if new_status == "completed":
            event.completed_at = timezone.now()
    event.save()

    log_from_request(
        request,
        action="admin_action",
        entity_type="compliance_calendar_event",
        entity_id=str(event_id),
        summary=f"Updated compliance calendar event {event.title}",
        details={"status": new_status},
    )
    return Response({"id": event.id, "title": event.title, "status": event.status})


@api_view(["POST"])
@permission_classes([IsComplianceOrCeoStaff])
def compliance_policy_action(request, policy_id):
    policy = get_object_or_404(PolicyDocument, id=policy_id)
    new_status = request.data.get("status")
    review_date = request.data.get("review_date")

    if new_status:
        valid = {s[0] for s in PolicyDocument.STATUS_CHOICES}
        if new_status not in valid:
            return Response({"detail": "Invalid status."}, status=status.HTTP_400_BAD_REQUEST)
        policy.status = new_status
        if new_status == "approved" and not policy.approval_date:
            policy.approval_date = timezone.localdate()
    if review_date:
        policy.review_date = review_date
    policy.save()

    log_from_request(
        request,
        action="admin_action",
        entity_type="policy_document",
        entity_id=str(policy_id),
        summary=f"Updated policy {policy.title}",
        details={"status": new_status, "review_date": review_date},
    )
    return Response({"id": policy.id, "title": policy.title, "status": policy.status})


@api_view(["GET"])
@permission_classes([IsComplianceOrCeoStaff])
def compliance_report_export(request, report_type):
    export_format = (
        request.query_params.get("export_format") or request.query_params.get("format") or "csv"
    ).lower()
    if export_format not in {"csv", "excel", "pdf"}:
        return Response({"detail": "Invalid format."}, status=status.HTTP_400_BAD_REQUEST)

    suite = build_compliance_governance_suite()
    rows = []

    if report_type == "monthly_compliance":
        d = suite["compliance_dashboard"]
        rows = [
            {"section": "Compliance", "metric": "overall_compliance_score", "value": d["overall_compliance_score"]},
            {"section": "Compliance", "metric": "open_compliance_issues", "value": d["open_compliance_issues"]},
            {"section": "Compliance", "metric": "expiring_driver_documents", "value": d["expiring_driver_documents"]},
            {"section": "Compliance", "metric": "expiring_licenses", "value": d["expiring_licenses"]},
            {"section": "Compliance", "metric": "expiring_insurance", "value": d["expiring_insurance"]},
        ]
    elif report_type == "quarterly_governance":
        d = suite["ceo_governance_dashboard"]
        rows = [
            {"section": "Governance", "metric": "compliance_score", "value": d["compliance_score"]},
            {"section": "Governance", "metric": "critical_risks", "value": d["critical_risks"]},
            {"section": "Governance", "metric": "pending_merchants", "value": d["outstanding_approvals"]["pending_merchants"]},
            {"section": "Governance", "metric": "pending_drivers", "value": d["outstanding_approvals"]["pending_drivers"]},
        ]
    elif report_type == "annual_audit_summary":
        d = suite["audit_center"]
        rows = [{"section": "Audit", "metric": f"status_{k}", "value": v} for k, v in d["summary"]["by_status"].items()]
        rows += [{"section": "Audit", "metric": f"type_{k}", "value": v} for k, v in d["summary"]["by_type"].items()]
    elif report_type == "risk_register":
        for r in suite["risk_register"]["risks"]:
            rows.append({"section": "Risk", "metric": r["reference"], "value": r["title"], "score": r["score"], "status": r["status"]})
    elif report_type == "board_compliance":
        d = suite["compliance_dashboard"]
        g = suite["ceo_governance_dashboard"]
        rows = [
            {"section": "Board", "metric": "compliance_score", "value": d["overall_compliance_score"]},
            {"section": "Board", "metric": "open_compliance_issues", "value": d["open_compliance_issues"]},
            {"section": "Board", "metric": "critical_risks", "value": g["critical_risks"]},
            {"section": "Board", "metric": "outstanding_policy_acknowledgements", "value": d["outstanding_policy_acknowledgements"]},
        ]
    else:
        return Response({"detail": "Invalid report type."}, status=status.HTTP_400_BAD_REQUEST)

    title = f"Yala {report_type.replace('_', ' ').title()} Report"
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
        entity_id=f"compliance_report_{report_type}",
        summary=f"Exported compliance report ({report_type}, {export_format})",
        details={"report_type": report_type, "format": export_format, "rows": len(rows)},
    )

    response = HttpResponse(payload, content_type=content_type)
    response["Content-Disposition"] = (
        f'attachment; filename="yala-compliance-{report_type}-{timezone.now():%Y%m%d}.{ext}"'
    )
    return response
