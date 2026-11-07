"""Driver / courier operating city transfer requests — CEO approval required."""

from __future__ import annotations

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from cities.models import City as RegistryCity
from deliveries.cities import normalize_city_name
from deliveries.models import DriverDeliverySettings
from operations.executive_permissions import IsCeoStaff, IsExecutiveStaff
from operations.city_transfer_models import OperatingCityTransferRequest
from security.services.audit_service import log_from_request

User = get_user_model()

KIND_DRIVER = OperatingCityTransferRequest.KIND_DRIVER
KIND_COURIER = OperatingCityTransferRequest.KIND_COURIER


def _serialize_transfer(req: OperatingCityTransferRequest) -> dict:
    u = req.user
    return {
        "id": req.id,
        "user_id": req.user_id,
        "user_email": u.email,
        "user_name": u.get_full_name() or u.email,
        "kind": req.kind,
        "from_city_id": req.from_city_id,
        "from_city_name": req.from_city.name if req.from_city_id else None,
        "to_city_id": req.to_city_id,
        "to_city_name": req.to_city.name if req.to_city_id else None,
        "reason": req.reason,
        "status": req.status,
        "ceo_notes": req.ceo_notes,
        "requested_at": req.requested_at,
        "decided_at": req.decided_at,
        "decided_by_id": req.decided_by_id,
    }


def _is_courier_account(user) -> bool:
    return DriverDeliverySettings.objects.filter(driver_id=user.id).exists()


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def request_operating_city_transfer(request):
    """Applicant submits a pending transfer (does not change city until CEO approves)."""
    to_id = request.data.get("to_city_id") or request.data.get("city_id")
    reason = str(request.data.get("reason", "") or "").strip()
    try:
        to_id = int(to_id)
    except (TypeError, ValueError):
        return Response({"detail": "to_city_id is required (integer)."}, status=status.HTTP_400_BAD_REQUEST)

    user = request.user
    if user.is_staff:
        return Response(
            {"detail": "Staff accounts must use internal tooling, not self-service transfer."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    to_city = RegistryCity.objects.filter(pk=to_id).first()
    if to_city is None:
        return Response({"detail": "Target city not found."}, status=status.HTTP_404_NOT_FOUND)
    if not to_city.is_active:
        return Response({"detail": "Target city is not active for registration."}, status=status.HTTP_400_BAD_REQUEST)

    kind = KIND_COURIER if _is_courier_account(user) else KIND_DRIVER
    if kind == KIND_DRIVER and getattr(user, "user_type", "") != "driver":
        return Response(
            {"detail": "Only driver accounts may request driver city transfers."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if user.city_id == to_id:
        return Response({"detail": "You are already registered in this city."}, status=status.HTTP_400_BAD_REQUEST)

    pending = OperatingCityTransferRequest.objects.filter(
        user=user,
        status=OperatingCityTransferRequest.STATUS_PENDING,
    ).exists()
    if pending:
        return Response(
            {"detail": "You already have a pending city transfer request."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    req = OperatingCityTransferRequest.objects.create(
        user=user,
        kind=kind,
        from_city=user.city,
        to_city=to_city,
        reason=reason,
        status=OperatingCityTransferRequest.STATUS_PENDING,
    )
    log_from_request(
        request,
        action="create",
        entity_type="operating_city_transfer",
        entity_id=req.id,
        summary=f"Submitted {kind} city transfer request → {to_city.name}",
    )
    return Response(_serialize_transfer(req), status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([IsExecutiveStaff])
def list_operating_city_transfers(request):
    status_filter = (request.query_params.get("status") or "").strip()
    qs = OperatingCityTransferRequest.objects.select_related(
        "user", "from_city", "to_city", "decided_by"
    ).order_by("-requested_at")
    if status_filter:
        qs = qs.filter(status=status_filter)
    return Response({"results": [_serialize_transfer(r) for r in qs[:500]]})


@api_view(["POST"])
@permission_classes([IsCeoStaff])
def decide_operating_city_transfer(request, request_id: int):
    action = (request.data.get("action") or "").strip().lower()
    notes = str(request.data.get("notes") or "").strip()

    if action not in {"approve", "reject"}:
        return Response({"detail": 'action must be "approve" or "reject".'}, status=status.HTTP_400_BAD_REQUEST)

    with transaction.atomic():
        tr = (
            OperatingCityTransferRequest.objects.select_for_update()
            .select_related("user", "to_city", "from_city")
            .filter(pk=request_id)
            .first()
        )
        if tr is None:
            return Response({"detail": "Request not found."}, status=status.HTTP_404_NOT_FOUND)
        if tr.status != OperatingCityTransferRequest.STATUS_PENDING:
            return Response({"detail": "Request is no longer pending."}, status=status.HTTP_400_BAD_REQUEST)

        if action == "reject":
            tr.status = OperatingCityTransferRequest.STATUS_REJECTED
            tr.ceo_notes = notes
            tr.decided_at = timezone.now()
            tr.decided_by = request.user
            tr.save(update_fields=["status", "ceo_notes", "decided_at", "decided_by"])
            log_from_request(
                request,
                action="reject",
                entity_type="operating_city_transfer",
                entity_id=tr.id,
                summary=f"Rejected {tr.kind} city transfer for user {tr.user_id}",
            )
            return Response(_serialize_transfer(tr))

        # Approve: move registry city; sync delivery service cities for couriers.
        u = User.objects.select_for_update().get(pk=tr.user_id)
        u.city = tr.to_city
        u.save(update_fields=["city"])

        settings_obj = None
        if DriverDeliverySettings.objects.filter(driver=u).exists():
            settings_obj, _ = DriverDeliverySettings.objects.get_or_create(driver=u)
            canon = normalize_city_name(tr.to_city.name) or tr.to_city.name
            settings_obj.delivery_cities = [canon]
            settings_obj.save(update_fields=["delivery_cities"])

        tr.status = OperatingCityTransferRequest.STATUS_APPROVED
        tr.ceo_notes = notes
        tr.decided_at = timezone.now()
        tr.decided_by = request.user
        tr.save(update_fields=["status", "ceo_notes", "decided_at", "decided_by"])

        log_from_request(
            request,
            action="approve",
            entity_type="operating_city_transfer",
            entity_id=tr.id,
            summary=f"Approved {tr.kind} city transfer for user {tr.user_id} → {tr.to_city.name}",
        )

    return Response(_serialize_transfer(tr))
