"""Admin and driver/courier APIs for platform withdrawal accounts."""

from __future__ import annotations

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from security.services.audit_service import log_from_request

from .withdrawal_accounts_service import (
    get_platform_withdrawal_accounts,
    serialize_platform_withdrawal_accounts,
)


def _require_staff(request):
    if not request.user.is_authenticated or not request.user.is_staff:
        return Response(
            {"detail": "Admin authentication required."},
            status=status.HTTP_403_FORBIDDEN,
        )
    return None


def _require_superuser(request):
    if not request.user.is_authenticated or not request.user.is_superuser:
        return Response(
            {"detail": "Only a super admin can modify withdrawal accounts."},
            status=status.HTTP_403_FORBIDDEN,
        )
    return None


@api_view(["GET", "PUT"])
@permission_classes([IsAuthenticated])
def admin_withdrawal_accounts_view(request):
    """GET/PUT /admin/withdrawal-accounts/ — admin configuration."""
    if request.method == "GET":
        denied = _require_staff(request)
        if denied:
            return denied
        accounts = get_platform_withdrawal_accounts()
        return Response(serialize_platform_withdrawal_accounts(accounts, include_meta=True))

    denied = _require_superuser(request)
    if denied:
        return denied

    bankily_number = str(request.data.get("bankily_number", "")).strip()
    seddad_number = str(request.data.get("seddad_number", "")).strip()
    masravi_number = str(request.data.get("masravi_number", "")).strip()

    missing = [
        label
        for label, value in (
            ("bankily_number", bankily_number),
            ("seddad_number", seddad_number),
            ("masravi_number", masravi_number),
        )
        if not value
    ]
    if missing:
        return Response(
            {"detail": f"Missing required fields: {', '.join(missing)}"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    accounts = get_platform_withdrawal_accounts()
    previous = {
        "bankily_number": accounts.bankily_number,
        "seddad_number": accounts.seddad_number,
        "masravi_number": accounts.masravi_number,
    }
    accounts.bankily_number = bankily_number
    accounts.seddad_number = seddad_number
    accounts.masravi_number = masravi_number
    accounts.updated_by = request.user
    accounts.save(
        update_fields=[
            "bankily_number",
            "seddad_number",
            "masravi_number",
            "updated_by",
            "updated_at",
        ]
    )

    log_from_request(
        request,
        action="admin_action",
        entity_type="payment",
        entity_id=accounts.id,
        summary="Platform withdrawal accounts updated",
        details={
            "previous": previous,
            "new": {
                "bankily_number": accounts.bankily_number,
                "seddad_number": accounts.seddad_number,
                "masravi_number": accounts.masravi_number,
            },
            "changed_by": request.user.email,
            "changed_at": accounts.updated_at.isoformat(),
        },
    )

    return Response(serialize_platform_withdrawal_accounts(accounts, include_meta=True))


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def platform_withdrawal_accounts_view(request):
    """GET /payments/withdrawal-accounts/ — read-only for drivers and couriers."""
    accounts = get_platform_withdrawal_accounts()
    return Response(serialize_platform_withdrawal_accounts(accounts))
