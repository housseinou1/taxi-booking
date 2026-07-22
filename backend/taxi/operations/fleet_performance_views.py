"""Fleet & Driver Performance Center API views (Phase 22)."""

from django.contrib.auth import get_user_model
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from security.services.audit_service import log_from_request
from taxi.drivers.models import DriverDocument, DriverProfile
from taxi.drivers.services.document_service import DocumentService

from .executive_permissions import IsFleetStaff, can_manage_fleet
from .fleet_performance_service import (
    build_document_monitoring,
    build_driver_performance_rows,
    build_fleet_ceo_metrics,
    build_fleet_dashboard,
    build_fleet_overview,
    build_fleet_report_rows,
)
from .ops_dispatch_service import pause_driver
from .report_export import export_csv, export_pdf

User = get_user_model()

REPORT_TITLES = {
    "daily_fleet": "Daily Fleet Report",
    "weekly_driver": "Weekly Driver Report",
    "monthly_revenue": "Monthly Revenue Report",
    "document_expiration": "Document Expiration Report",
    "performance_rankings": "Performance Rankings",
}


def _city_id(request):
    raw = request.query_params.get("city_id")
    return int(raw) if raw else None


def _require_manage(request):
    if not can_manage_fleet(request.user):
        return Response({"detail": "Fleet management permission required."}, status=status.HTTP_403_FORBIDDEN)
    return None


@api_view(["GET"])
@permission_classes([IsFleetStaff])
def fleet_dashboard(request):
    return Response(build_fleet_dashboard(city_id=_city_id(request)))


@api_view(["GET"])
@permission_classes([IsFleetStaff])
def fleet_overview(request):
    from .fleet_performance_service import build_fleet_map_bundle

    return Response(
        {
            "overview": build_fleet_overview(city_id=_city_id(request)),
            "map": build_fleet_map_bundle(city_id=_city_id(request)),
        }
    )


@api_view(["GET"])
@permission_classes([IsFleetStaff])
def fleet_drivers(request):
    limit = min(int(request.query_params.get("limit", 500)), 1000)
    return Response(
        {
            "generated_at": timezone.now().isoformat(),
            "drivers": build_driver_performance_rows(city_id=_city_id(request), limit=limit),
        }
    )


@api_view(["GET"])
@permission_classes([IsFleetStaff])
def fleet_documents(request):
    return Response(build_document_monitoring())


@api_view(["GET"])
@permission_classes([IsFleetStaff])
def fleet_ceo(request):
    return Response(build_fleet_ceo_metrics(city_id=_city_id(request)))


@api_view(["GET"])
@permission_classes([IsFleetStaff])
def fleet_report_export(request):
    report_type = (request.query_params.get("type") or "daily_fleet").strip()
    export_format = (request.query_params.get("export_format") or "csv").strip().lower()
    rows = build_fleet_report_rows(report_type, city_id=_city_id(request))
    title = REPORT_TITLES.get(report_type, "Fleet Report")

    if export_format == "pdf":
        content = export_pdf(rows, title=title)
        content_type = "application/pdf"
        filename = f"{report_type}.pdf"
    else:
        content = export_csv(rows)
        content_type = "text/csv"
        filename = f"{report_type}.csv"

    log_from_request(
        request,
        action="fleet_report_export",
        entity_type="fleet_report",
        entity_id=report_type,
        summary=f"Exported {title} ({export_format})",
    )
    response = HttpResponse(content, content_type=content_type)
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response


@api_view(["POST"])
@permission_classes([IsFleetStaff])
def fleet_document_approve(request, document_id):
    denied = _require_manage(request)
    if denied:
        return denied

    document = get_object_or_404(DriverDocument, id=document_id)
    if document.status == "approved":
        return Response({"detail": "Document is already approved."}, status=status.HTTP_400_BAD_REQUEST)

    service = DocumentService()
    document = service.approve_document(document, reviewer=request.user)
    log_from_request(
        request,
        action="document_approval",
        entity_type="document",
        entity_id=document.id,
        summary=f"Fleet center approved {document.document_type}",
    )
    return Response({"message": "Document approved.", "document_id": document.id})


@api_view(["POST"])
@permission_classes([IsFleetStaff])
def fleet_document_reject(request, document_id):
    denied = _require_manage(request)
    if denied:
        return denied

    reason = (request.data.get("reason") or "Rejected by fleet supervisor").strip()
    document = get_object_or_404(DriverDocument, id=document_id)
    service = DocumentService()
    document = service.reject_document(document, reviewer=request.user, reason=reason)
    log_from_request(
        request,
        action="document_rejection",
        entity_type="document",
        entity_id=document.id,
        summary=f"Fleet center rejected {document.document_type}",
        details={"reason": reason},
    )
    return Response({"message": "Document rejected.", "document_id": document.id})


@api_view(["POST"])
@permission_classes([IsFleetStaff])
def fleet_driver_suspend(request, driver_id):
    denied = _require_manage(request)
    if denied:
        return denied

    user = get_object_or_404(User, id=driver_id)
    if not hasattr(user, "driver_profile"):
        return Response({"detail": "User is not a driver."}, status=status.HTTP_404_NOT_FOUND)

    user.is_active = False
    user.save(update_fields=["is_active"])
    profile = user.driver_profile
    profile.is_available = False
    profile.save(update_fields=["is_available"])
    log_from_request(
        request,
        action="admin_action",
        entity_type="driver",
        entity_id=str(user.id),
        summary="Driver suspended from fleet center",
    )
    return Response({"message": "Driver suspended.", "driver_id": user.id})


@api_view(["POST"])
@permission_classes([IsFleetStaff])
def fleet_driver_reactivate(request, driver_id):
    denied = _require_manage(request)
    if denied:
        return denied

    user = get_object_or_404(User, id=driver_id)
    if not hasattr(user, "driver_profile"):
        return Response({"detail": "User is not a driver."}, status=status.HTTP_404_NOT_FOUND)

    user.is_active = True
    user.save(update_fields=["is_active"])
    log_from_request(
        request,
        action="admin_action",
        entity_type="driver",
        entity_id=str(user.id),
        summary="Driver reactivated from fleet center",
    )
    return Response({"message": "Driver reactivated.", "driver_id": user.id})


@api_view(["POST"])
@permission_classes([IsFleetStaff])
def fleet_driver_pause(request, driver_id):
    denied = _require_manage(request)
    if denied:
        return denied

    user = get_object_or_404(User, id=driver_id)
    paused = bool(request.data.get("paused", True))
    profile = pause_driver(user, request.user, paused=paused)
    log_from_request(
        request,
        action="admin_action",
        entity_type="driver",
        entity_id=str(user.id),
        summary=f"Driver {'paused' if paused else 'resumed'} from fleet center",
    )
    return Response({"message": "Driver updated.", "is_available": profile.is_available})


@api_view(["POST"])
@permission_classes([IsFleetStaff])
def fleet_driver_notify(request, driver_id):
    denied = _require_manage(request)
    if denied:
        return denied

    user = get_object_or_404(User, id=driver_id)
    title = (request.data.get("title") or "Message from Yala Operations").strip()
    message = (request.data.get("message") or "").strip()
    if not message:
        return Response({"detail": "message is required."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        from notifications.push import send_push_to_user

        send_push_to_user(user, title, message, data={"type": "fleet_ops_message"}, app_type="driver")
    except Exception:
        pass

    log_from_request(
        request,
        action="admin_action",
        entity_type="driver",
        entity_id=str(user.id),
        summary="Fleet center notification sent",
        details={"title": title},
    )
    return Response({"message": "Notification sent."})


@api_view(["POST"])
@permission_classes([IsFleetStaff])
def fleet_driver_training(request, driver_id):
    denied = _require_manage(request)
    if denied:
        return denied

    user = get_object_or_404(User, id=driver_id)
    training_type = (request.data.get("training_type") or "general").strip()
    notes = (request.data.get("notes") or "").strip()
    title = "Training assigned"
    message = f"You have been assigned {training_type.replace('_', ' ')} training."
    if notes:
        message = f"{message} {notes}"

    try:
        from notifications.push import send_push_to_user

        send_push_to_user(
            user,
            title,
            message,
            data={"type": "fleet_training", "training_type": training_type},
            app_type="driver",
        )
    except Exception:
        pass

    log_from_request(
        request,
        action="admin_action",
        entity_type="driver",
        entity_id=str(user.id),
        summary=f"Training assigned: {training_type}",
        details={"training_type": training_type, "notes": notes},
    )
    return Response({"message": "Training assigned.", "training_type": training_type})
