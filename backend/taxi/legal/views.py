"""Legal compliance API endpoints."""

from django.shortcuts import get_object_or_404, render
from django.utils import timezone
from django.views.decorators.http import require_GET
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAdminUser, IsAuthenticated
from rest_framework.response import Response

from deliveries.courier_onboarding import ensure_driver_profile_for_courier
from legal.constants import (
    COURIER_LEGAL_DECLARATION,
    COURIER_TERMS_VERSION,
    CUSTOMER_DELIVERY_TERMS_VERSION,
    CUSTOMER_PRIVACY_VERSION,
    DRIVER_AGREEMENT_VERSION,
    DRIVER_LEGAL_DECLARATION,
    MERCHANT_LEGAL_DECLARATION,
    MERCHANT_TERMS_VERSION,
    RIDER_PRIVACY_VERSION,
    RIDER_TERMS_VERSION,
    RIDE_PRIVACY_VERSION,
    RIDE_TERMS_VERSION,
    legal_versions_payload,
)
from legal.versioning import build_legal_gates
from legal.models import LegalComplianceLog
from legal.services import (
    apply_courier_e_sign,
    apply_driver_e_sign,
    apply_merchant_e_sign,
    customer_delivery_terms_current,
    customer_privacy_current,
    courier_has_complete_signature,
    courier_requires_resign,
    driver_has_complete_signature,
    get_client_ip,
    log_compliance_event,
    merchant_has_complete_signature,
    serialize_courier_signature,
    serialize_driver_signature,
    serialize_merchant_signature,
    serialize_ride_legal,
    serialize_rider_legal,
)
from merchants.models import Merchant
from security.services.audit_service import log_from_request


@require_GET
def account_deletion_page(request):
    """Public Play Store account-deletion instructions. No login required to view."""
    return render(request, "legal/account_deletion.html")


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def legal_versions(request):
    return Response(
        {
            **legal_versions_payload(),
            "courier_terms_version": COURIER_TERMS_VERSION,
            "merchant_terms_version": MERCHANT_TERMS_VERSION,
            "customer_delivery_terms_version": CUSTOMER_DELIVERY_TERMS_VERSION,
            "customer_privacy_version": CUSTOMER_PRIVACY_VERSION,
            "ride_terms_version": RIDE_TERMS_VERSION,
            "ride_privacy_version": RIDE_PRIVACY_VERSION,
            "rider_terms_version": RIDER_TERMS_VERSION,
            "rider_privacy_version": RIDER_PRIVACY_VERSION,
            "driver_agreement_version": DRIVER_AGREEMENT_VERSION,
            "courier_declaration": COURIER_LEGAL_DECLARATION,
            "merchant_declaration": MERCHANT_LEGAL_DECLARATION,
            "driver_declaration": DRIVER_LEGAL_DECLARATION,
        }
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def legal_status(request):
    user = request.user
    profile = getattr(user, "driver_profile", None)
    merchant = getattr(user, "merchant_profile", None)
    gates = build_legal_gates(user, profile, merchant)

    ride_legal = {**serialize_ride_legal(user), **gates["ride"]}
    customer_delivery = {
        "terms_accepted": bool(user.delivery_terms_accepted),
        "terms_accepted_at": (
            user.delivery_terms_accepted_at.isoformat()
            if user.delivery_terms_accepted_at
            else None
        ),
        "terms_version": user.delivery_terms_version or "",
        "privacy_accepted": bool(user.privacy_policy_accepted),
        "privacy_accepted_at": (
            user.privacy_policy_accepted_at.isoformat()
            if user.privacy_policy_accepted_at
            else None
        ),
        "privacy_version": user.privacy_policy_version or "",
        "current_terms_version": CUSTOMER_DELIVERY_TERMS_VERSION,
        "current_privacy_version": CUSTOMER_PRIVACY_VERSION,
        "compliance_current": customer_delivery_terms_current(user)
        and customer_privacy_current(user),
        **gates["customer_delivery"],
    }

    return Response(
        {
            "versions": gates["versions"],
            "legal_version": gates["legal_version"],
            "ride_privacy_version": gates["ride_privacy_version"],
            "courier": {**serialize_courier_signature(profile, request), **gates["courier"]},
            "merchant": {**serialize_merchant_signature(merchant, request), **gates["merchant"]},
            "driver": {**serialize_driver_signature(profile, request), **gates["driver"]},
            "ride": ride_legal,
            "rider": ride_legal,
            "customer_delivery": customer_delivery,
        }
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def courier_e_sign(request):
    if getattr(request.user, "user_type", "") != "driver":
        return Response(
            {"detail": "Only courier accounts can sign the courier agreement."},
            status=status.HTTP_403_FORBIDDEN,
        )

    profile = ensure_driver_profile_for_courier(request.user)
    signature_file = request.FILES.get("signature_image")
    try:
        apply_courier_e_sign(profile, request=request, data=request.data, signature_file=signature_file)
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    log_from_request(
        request,
        action="admin_action",
        entity_type="courier",
        entity_id=profile.id,
        summary=f"Courier e-signature recorded for {request.user.email}",
        details={"terms_version": profile.terms_version},
    )
    return Response(serialize_courier_signature(profile, request))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def merchant_e_sign(request):
    merchant = getattr(request.user, "merchant_profile", None)
    if not merchant:
        return Response(
            {"detail": "Merchant profile not found."},
            status=status.HTTP_404_NOT_FOUND,
        )

    signature_file = request.FILES.get("signature_image")
    try:
        apply_merchant_e_sign(merchant, request=request, data=request.data, signature_file=signature_file)
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    log_from_request(
        request,
        action="admin_action",
        entity_type="merchant",
        entity_id=merchant.id,
        summary=f"Merchant e-signature recorded for {merchant.business_name}",
        details={"terms_version": merchant.terms_version},
    )
    return Response(serialize_merchant_signature(merchant, request))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def driver_e_sign(request):
    """Electronic signature for Yala Taxi Driver Agreement."""
    from taxi.drivers.views import get_or_create_driver_profile

    profile = get_or_create_driver_profile(request.user)
    signature_file = request.FILES.get("signature_image")
    try:
        apply_driver_e_sign(profile, request=request, data=request.data, signature_file=signature_file)
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    log_from_request(
        request,
        action="admin_action",
        entity_type="driver",
        entity_id=profile.id,
        summary=f"Driver e-signature recorded for {request.user.email}",
        details={"terms_version": profile.driver_terms_version},
    )
    return Response(serialize_driver_signature(profile, request))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def accept_customer_legal(request):
    """Checkbox acceptance for delivery customers (terms + privacy)."""
    terms = str(request.data.get("terms_accepted", "")).lower() in {"1", "true", "yes", "on"}
    privacy = str(request.data.get("privacy_accepted", "")).lower() in {"1", "true", "yes", "on"}
    if not terms or not privacy:
        return Response(
            {"detail": "You must accept both Terms & Conditions and Privacy Policy."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user = request.user
    now = timezone.now()
    user.delivery_terms_accepted = True
    user.delivery_terms_accepted_at = user.delivery_terms_accepted_at or now
    user.delivery_terms_version = CUSTOMER_DELIVERY_TERMS_VERSION
    user.privacy_policy_accepted = True
    user.privacy_policy_accepted_at = user.privacy_policy_accepted_at or now
    user.privacy_policy_version = CUSTOMER_PRIVACY_VERSION
    user.save(
        update_fields=[
            "delivery_terms_accepted",
            "delivery_terms_accepted_at",
            "delivery_terms_version",
            "privacy_policy_accepted",
            "privacy_policy_accepted_at",
            "privacy_policy_version",
        ]
    )

    log_compliance_event(
        user=user,
        agreement_type="customer_delivery",
        action="checkbox_accept",
        terms_version=CUSTOMER_DELIVERY_TERMS_VERSION,
        ip_address=get_client_ip(request),
        device_info=(request.data.get("device_info") or "")[:500],
        app_version=(request.data.get("app_version") or "")[:40],
        metadata={"privacy_version": CUSTOMER_PRIVACY_VERSION},
    )

    return Response(
        {
            "delivery_terms_accepted": True,
            "delivery_terms_version": user.delivery_terms_version,
            "privacy_policy_accepted": True,
            "privacy_policy_version": user.privacy_policy_version,
        }
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def accept_rider_legal(request):
    """Checkbox acceptance for Yala Ride taxi bookings (terms + privacy)."""
    terms = str(
        request.data.get(
            "ride_terms_accepted",
            request.data.get("rider_terms_accepted", request.data.get("terms_accepted", "")),
        )
    ).lower() in {"1", "true", "yes", "on"}
    privacy = str(request.data.get("privacy_accepted", request.data.get("privacy_policy_accepted", ""))).lower() in {
        "1",
        "true",
        "yes",
        "on",
    }
    if not terms or not privacy:
        return Response(
            {"detail": "You must accept the Yala Ride Terms & Conditions and Privacy Policy."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user = request.user
    now = timezone.now()
    was_resign = bool(
        user.ride_terms_accepted
        and user.ride_terms_version
        and user.ride_terms_version != RIDE_TERMS_VERSION
    )
    user.ride_terms_accepted = True
    user.ride_terms_accepted_at = now
    user.ride_terms_version = RIDE_TERMS_VERSION
    user.privacy_policy_accepted = True
    user.privacy_policy_accepted_at = now
    user.privacy_policy_version = RIDE_PRIVACY_VERSION
    user.save(
        update_fields=[
            "ride_terms_accepted",
            "ride_terms_accepted_at",
            "ride_terms_version",
            "privacy_policy_accepted",
            "privacy_policy_accepted_at",
            "privacy_policy_version",
        ]
    )

    log_compliance_event(
        user=user,
        agreement_type="ride",
        action="resign" if was_resign else "checkbox_accept",
        terms_version=RIDE_TERMS_VERSION,
        ip_address=get_client_ip(request),
        device_info=(request.data.get("device_info") or "")[:500],
        app_version=(request.data.get("app_version") or "")[:40],
        metadata={"privacy_version": RIDE_PRIVACY_VERSION},
    )

    return Response(serialize_ride_legal(user, include_audit=True))


accept_ride_legal = accept_rider_legal


@api_view(["GET"])
@permission_classes([IsAdminUser])
def admin_compliance_logs(request):
    agreement_type = request.query_params.get("type", "").strip()
    logs = LegalComplianceLog.objects.select_related("user").order_by("-created_at")[:200]
    if agreement_type:
        logs = logs.filter(agreement_type=agreement_type)

    return Response(
        {
            "results": [
                {
                    "id": log.id,
                    "user_id": log.user_id,
                    "user_email": log.user.email,
                    "agreement_type": log.agreement_type,
                    "action": log.action,
                    "terms_version": log.terms_version,
                    "signed_full_name": log.signed_full_name,
                    "signature_image_url": (
                        request.build_absolute_uri(log.signature_image.url)
                        if log.signature_image
                        else ""
                    ),
                    "ip_address": log.ip_address or "",
                    "device_info": log.device_info,
                    "app_version": log.app_version,
                    "created_at": log.created_at.isoformat(),
                }
                for log in logs
            ]
        }
    )


@api_view(["GET"])
@permission_classes([IsAdminUser])
def admin_signed_agreements(request):
    """Legal center summary for admin review."""
    from deliveries.models import DriverDeliverySettings
    from django.contrib.auth import get_user_model

    from taxi.drivers.models import DriverProfile

    User = get_user_model()
    courier_ids = DriverDeliverySettings.objects.values_list("driver_id", flat=True)
    couriers = DriverProfile.objects.filter(user_id__in=courier_ids).select_related("user")[:100]
    drivers = (
        DriverProfile.objects.filter(driver_terms_accepted=True)
        .select_related("user")
        .order_by("-driver_terms_accepted_at")[:100]
    )
    merchants = Merchant.objects.select_related("owner")[:100]
    riders = User.objects.filter(ride_terms_accepted=True).order_by("-ride_terms_accepted_at")[:100]

    return Response(
        {
            "versions": legal_versions_payload(),
            "riders": [
                {
                    **serialize_ride_legal(user, include_audit=True),
                    "user_id": user.id,
                    "email": user.email,
                    "name": user.get_full_name(),
                }
                for user in riders
            ],
            "drivers": [
                {
                    "driver_id": profile.id,
                    "email": profile.user.email,
                    "name": profile.user.get_full_name(),
                    **serialize_driver_signature(profile, request),
                }
                for profile in drivers
                if driver_has_complete_signature(profile) or profile.driver_terms_accepted
            ],
            "couriers": [
                {
                    "driver_id": profile.id,
                    "email": profile.user.email,
                    "name": profile.user.get_full_name(),
                    **serialize_courier_signature(profile, request),
                }
                for profile in couriers
                if courier_has_complete_signature(profile) or profile.terms_accepted
            ],
            "merchants": [
                {
                    "merchant_id": merchant.id,
                    "business_name": merchant.business_name,
                    "email": merchant.owner.email,
                    **serialize_merchant_signature(merchant, request),
                }
                for merchant in merchants
                if merchant_has_complete_signature(merchant) or merchant.terms_accepted
            ],
        }
    )
