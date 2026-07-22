"""Closed beta feedback API views."""

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, parser_classes
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from security.services.audit_service import log_from_request

from .beta_feedback_service import (
    build_beta_feedback_dashboard,
    create_beta_feedback,
    get_beta_feedback,
    list_beta_feedback,
    update_beta_feedback,
)
from .executive_permissions import IsExecutiveStaff


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser])
def beta_feedback_list_create(request):
    if request.method == "GET":
        if not IsExecutiveStaff().has_permission(request, None):
            return Response({"detail": "Executive staff required."}, status=status.HTTP_403_FORBIDDEN)
        filters = {
            "app_type": request.query_params.get("app"),
            "severity": request.query_params.get("severity"),
            "priority": request.query_params.get("priority"),
            "category": request.query_params.get("category"),
            "status": request.query_params.get("status"),
            "queue": request.query_params.get("queue"),
            "owner_id": request.query_params.get("owner_id"),
            "emergency": request.query_params.get("emergency"),
        }
        dashboard = build_beta_feedback_dashboard()
        return Response(
            {
                "dashboard": dashboard,
                "reports": list_beta_feedback(filters, request=request),
            }
        )

    description = (request.data.get("description") or "").strip()
    if not description:
        return Response({"detail": "description is required."}, status=status.HTTP_400_BAD_REQUEST)

    feedback = create_beta_feedback(
        request.user,
        request.data,
        screenshot=request.FILES.get("screenshot"),
    )
    log_from_request(
        request,
        action="beta_feedback_create",
        entity_type="beta_feedback",
        entity_id=feedback.id,
        summary=f"Submitted {feedback.reference}",
    )
    return Response(get_beta_feedback(feedback.id, request=request), status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([IsExecutiveStaff])
def beta_feedback_dashboard(request):
    return Response(build_beta_feedback_dashboard())


@api_view(["GET", "PATCH"])
@permission_classes([IsExecutiveStaff])
def beta_feedback_detail(request, feedback_id):
    if request.method == "GET":
        detail = get_beta_feedback(feedback_id, request=request)
        if not detail:
            return Response({"detail": "Report not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(detail)

    row = update_beta_feedback(feedback_id, request.data or {}, request.user)
    if not row:
        return Response({"detail": "Report not found."}, status=status.HTTP_404_NOT_FOUND)
    log_from_request(
        request,
        action="beta_feedback_update",
        entity_type="beta_feedback",
        entity_id=row.id,
        summary=f"Updated {row.reference} → {row.status}",
    )
    return Response(get_beta_feedback(row.id, request=request))
