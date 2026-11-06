"""Ops shift handover API views.

The service layer (`ops_handover_service.py`) and the `OpsShiftHandover` model
already existed but nothing was wired to them, so `GET/POST
/operations/center/handovers/` and `.../<id>/acknowledge/` returned 404 and the
Ops dashboard's handover panel stayed empty. These are thin, audited wrappers.

The frontend (`useOpsDashboardData.js`) reads `data.handovers`, so list/create
both respond with a `{"handovers": [...]}` envelope.
"""

from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from .executive_permissions import IsExecutiveStaff
from .models import OpsShiftHandover
from .ops_handover_service import (
    acknowledge_handover,
    create_handover,
    list_handovers,
    serialize_handover,
)


@api_view(["GET", "POST"])
@permission_classes([IsExecutiveStaff])
def ops_handovers(request):
    """List the shift-handover log, or submit a new handover."""
    if request.method == "GET":
        status_filter = request.query_params.get("status") or None
        try:
            limit = int(request.query_params.get("limit", 20))
        except (TypeError, ValueError):
            limit = 20
        limit = max(1, min(limit, 100))
        return Response({"handovers": list_handovers(status=status_filter, limit=limit)})

    payload = request.data if isinstance(request.data, dict) else {}
    row = create_handover(request, payload=payload)
    return Response(serialize_handover(row), status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([IsExecutiveStaff])
def ops_handover_acknowledge(request, handover_id):
    """Acknowledge a submitted handover, taking ownership as the incoming operator."""
    row = get_object_or_404(OpsShiftHandover, pk=handover_id)
    payload = request.data if isinstance(request.data, dict) else {}
    try:
        row = acknowledge_handover(
            request, row, follow_up_notes=payload.get("follow_up_notes", "")
        )
    except ValueError as exc:
        return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    return Response(serialize_handover(row))
