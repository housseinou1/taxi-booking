from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAdminUser, IsAuthenticated
from rest_framework.response import Response

from deliveries.courier_onboarding import (
    build_courier_onboarding_state,
    get_required_courier_document_types,
)
from deliveries.models import DriverDeliverySettings
from merchants.models import Merchant
from merchants.serializers import MerchantSerializer
from taxi.drivers.models import DriverDocument, DriverProfile
from taxi.drivers.services.document_service import (
    DocumentService,
    get_document_display_status,
)

from .merchant_onboarding import build_merchant_onboarding_state
from .models import (
    AuditLog,
    CustomerSavedAddress,
    FraudFlag,
    MerchantDocumentReview,
)
from .serializers import (
    AuditLogSerializer,
    CustomerSavedAddressSerializer,
    CustomerVerificationSerializer,
    FraudFlagSerializer,
    MerchantDocumentReviewSerializer,
)
from .services.audit_service import log_from_request
from .services.fraud_service import run_user_fraud_checks

DOCUMENT_FIELD_MAP = {
    "business_license": "business_license_status",
    "owner_id": "owner_id_status",
    "logo": "logo_status",
    "store_photo": "store_photo_status",
}

DOCUMENT_NOTE_MAP = {
    "business_license": "business_license_notes",
    "owner_id": "owner_id_notes",
    "logo": "logo_notes",
    "store_photo": "store_photo_notes",
}

COURIER_DOCUMENT_LABELS = {
    "national_id": "National ID",
    "license": "Driver License",
    "carte_grise": "Registration",
    "insurance": "Insurance",
    "profile_photo": "Profile Photo",
}


def _serialize_courier_document(document, request=None):
    file_url = ""
    if document.file:
        file_url = request.build_absolute_uri(document.file.url) if request else document.file.url
    return {
        "id": document.id,
        "type": document.document_type,
        "label": COURIER_DOCUMENT_LABELS.get(
            document.document_type,
            document.get_document_type_display(),
        ),
        "status": document.status,
        "display_status": get_document_display_status(document),
        "is_uploaded": bool(document.file),
        "uploaded_at": document.uploaded_at,
        "expires_at": document.expires_at,
        "rejection_reason": document.rejection_reason,
        "file_url": file_url,
    }


def _serialize_courier_admin_item(profile, request):
    settings = DriverDeliverySettings.objects.filter(driver=profile.user).first()
    vehicle_type = settings.delivery_vehicle_type if settings else "motorcycle"
    docs = DriverDocument.objects.filter(driver=profile).order_by("document_type", "-uploaded_at")
    state = build_courier_onboarding_state(profile.user)
    service = DocumentService()
    expired_alerts = service.get_expired_or_missing(
        profile,
        required_types=get_required_courier_document_types(vehicle_type),
    )
    is_suspended = bool(settings and settings.is_suspended)
    courier_status = "suspended" if is_suspended else profile.status
    return {
        "driver_id": profile.id,
        "user_id": profile.user_id,
        "name": profile.user.get_full_name(),
        "email": profile.user.email,
        "phone": profile.user.phone_number,
        "phone_verified": profile.user.is_phone_verified,
        "vehicle_type": vehicle_type,
        "status": profile.status,
        "courier_status": courier_status,
        "rejection_reason": profile.application_rejection_reason,
        "documents": [_serialize_courier_document(d, request) for d in docs],
        "required_document_types": get_required_courier_document_types(vehicle_type),
        "expired_document_alerts": [
            {
                "document_type": alert.document_type,
                "label": COURIER_DOCUMENT_LABELS.get(
                    alert.document_type,
                    alert.document_type.replace("_", " ").title(),
                ),
                "reason": alert.reason,
                "expires_at": alert.expires_at.isoformat() if alert.expires_at else None,
            }
            for alert in expired_alerts
            if alert.reason == "expired"
        ],
        "onboarding": state,
        "is_suspended": is_suspended,
        "suspension_reason": settings.suspension_reason if settings and is_suspended else "",
    }


def _customer_verification_state(user) -> dict:
    missing = []
    if not user.is_phone_verified:
        missing.append("phone")
    if not user.email_verified:
        missing.append("email")
    complete = len(missing) == 0
    return {
        "phone_verified": user.is_phone_verified,
        "email_verified": user.email_verified,
        "profile_photo_uploaded": bool(user.profile_picture),
        "rider_status": getattr(user, "rider_status", "approved"),
        "verification_complete": complete,
        "missing_steps": missing,
    }


# ─── Customer verification ────────────────────────────────────────────────────


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def customer_verification(request):
    data = _customer_verification_state(request.user)
    return Response(CustomerVerificationSerializer(data).data)


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def customer_profile_photo(request):
    photo = request.FILES.get("profile_picture")
    if not photo:
        return Response(
            {"error": "profile_picture file is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    request.user.profile_picture = photo
    request.user.save(update_fields=["profile_picture"])
    log_from_request(
        request,
        action="verification_event",
        entity_type="customer",
        entity_id=request.user.id,
        summary="Customer profile photo updated",
    )
    return Response(_customer_verification_state(request.user))


# ─── Saved addresses ──────────────────────────────────────────────────────────


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def saved_addresses(request):
    if request.method == "GET":
        addresses = CustomerSavedAddress.objects.filter(user=request.user)
        return Response(CustomerSavedAddressSerializer(addresses, many=True).data)

    serializer = CustomerSavedAddressSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    if serializer.validated_data.get("is_default"):
        CustomerSavedAddress.objects.filter(user=request.user).update(is_default=False)
    address = serializer.save(user=request.user)
    return Response(
        CustomerSavedAddressSerializer(address).data,
        status=status.HTTP_201_CREATED,
    )


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def saved_address_detail(request, address_id):
    address = get_object_or_404(CustomerSavedAddress, id=address_id, user=request.user)
    if request.method == "DELETE":
        address.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    serializer = CustomerSavedAddressSerializer(address, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    if serializer.validated_data.get("is_default"):
        CustomerSavedAddress.objects.filter(user=request.user).exclude(
            id=address.id
        ).update(is_default=False)
    serializer.save()
    return Response(serializer.data)


# ─── Courier / merchant verification status ───────────────────────────────────


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def courier_verification(request):
    return Response(build_courier_onboarding_state(request.user, request))


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def merchant_verification(request):
    merchant = getattr(request.user, "merchant_profile", None)
    if not merchant and not request.user.is_staff:
        return Response(
            {"error": "Merchant profile not found."},
            status=status.HTTP_404_NOT_FOUND,
        )
    if request.user.is_staff and request.query_params.get("merchant_id"):
        merchant = get_object_or_404(Merchant, pk=request.query_params["merchant_id"])
    return Response(build_merchant_onboarding_state(request.user, merchant))


# ─── Admin: audit logs ────────────────────────────────────────────────────────


@api_view(["GET"])
@permission_classes([IsAdminUser])
def admin_audit_logs(request):
    logs = AuditLog.objects.select_related("actor").all()
    action = request.query_params.get("action")
    entity_type = request.query_params.get("entity_type")
    if action:
        logs = logs.filter(action=action)
    if entity_type:
        logs = logs.filter(entity_type=entity_type)
    limit = min(int(request.query_params.get("limit", 100)), 500)
    return Response(AuditLogSerializer(logs[:limit], many=True).data)


# ─── Admin: fraud flags ───────────────────────────────────────────────────────


@api_view(["GET"])
@permission_classes([IsAdminUser])
def admin_fraud_flags(request):
    flags = FraudFlag.objects.select_related("user").filter(
        status=request.query_params.get("status", "open")
        if request.query_params.get("status")
        else "open"
    )
    if request.query_params.get("all") == "1":
        flags = FraudFlag.objects.select_related("user").all()
    return Response(FraudFlagSerializer(flags[:200], many=True).data)


@api_view(["POST"])
@permission_classes([IsAdminUser])
def admin_fraud_flag_review(request, flag_id):
    flag = get_object_or_404(FraudFlag, pk=flag_id)
    new_status = request.data.get("status", "reviewed")
    if new_status not in {"reviewed", "dismissed", "action_taken"}:
        return Response({"error": "Invalid status."}, status=status.HTTP_400_BAD_REQUEST)
    flag.status = new_status
    flag.review_notes = request.data.get("notes", "")
    flag.reviewed_by = request.user
    flag.reviewed_at = timezone.now()
    flag.save()
    log_from_request(
        request,
        action="admin_action",
        entity_type="system",
        entity_id=flag.id,
        summary=f"Fraud flag {new_status}: {flag.get_reason_display()}",
        details={"flag_id": flag.id, "user_id": flag.user_id},
    )
    return Response(FraudFlagSerializer(flag).data)


# ─── Admin: courier review ────────────────────────────────────────────────────


@api_view(["GET"])
@permission_classes([IsAdminUser])
def admin_pending_couriers(request):
    queue = request.query_params.get("queue", "review").strip().lower()
    courier_user_ids = DriverDeliverySettings.objects.values_list("driver_id", flat=True)
    profiles = (
        DriverProfile.objects.select_related("user")
        .filter(user_id__in=courier_user_ids)
        .order_by("-user__date_joined")
    )

    if queue == "approved":
        profiles = profiles.filter(status="approved")
    elif queue == "rejected":
        profiles = profiles.filter(status="rejected")
    elif queue == "suspended":
        profile_ids = DriverDeliverySettings.objects.filter(is_suspended=True).values_list(
            "driver_id", flat=True
        )
        profiles = profiles.filter(user_id__in=profile_ids)
    elif queue == "expired":
        profiles = profiles.filter(status="approved")
    else:
        profiles = profiles.filter(status__in=["pending", "pending_review"])

    results = []
    for profile in profiles[:100]:
        item = _serialize_courier_admin_item(profile, request)
        if queue == "expired" and not item["expired_document_alerts"]:
            continue
        results.append(item)

    return Response(
        {
            "queue": queue,
            "count": len(results),
            "results": results,
        }
    )


@api_view(["POST"])
@permission_classes([IsAdminUser])
def admin_courier_action(request, driver_id):
    profile = get_object_or_404(DriverProfile, pk=driver_id)
    action = request.data.get("action", "").strip().lower()
    reason = request.data.get("reason", "").strip()

    if action == "approve":
        from taxi.drivers.driver_code import ensure_driver_code

        profile.status = "approved"
        profile.application_rejection_reason = ""
        ensure_driver_code(profile)
        try:
            profile.save(update_fields=["status", "application_rejection_reason", "driver_code"])
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        profile.user.is_active = True
        profile.user.save(update_fields=["is_active"])
        summary = f"Courier approved: {profile.user.email}"
    elif action == "reject":
        if len(reason) < 5:
            return Response(
                {"error": "Rejection reason required (min 5 chars)."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        profile.status = "rejected"
        profile.application_rejection_reason = reason
        profile.is_available = False
        profile.save(
            update_fields=["status", "application_rejection_reason", "is_available"]
        )
        profile.user.is_active = False
        profile.user.save(update_fields=["is_active"])
        summary = f"Courier rejected: {profile.user.email}"
    elif action == "suspend":
        settings, _ = DriverDeliverySettings.objects.get_or_create(driver=profile.user)
        settings.is_suspended = True
        settings.suspension_reason = reason or "Suspended by admin"
        settings.delivery_mode_enabled = False
        settings.save(
            update_fields=["is_suspended", "suspension_reason", "delivery_mode_enabled"]
        )
        summary = f"Courier suspended: {profile.user.email}"
    elif action == "unsuspend":
        settings = DriverDeliverySettings.objects.filter(driver=profile.user).first()
        if settings:
            settings.is_suspended = False
            settings.suspension_reason = ""
            settings.save(update_fields=["is_suspended", "suspension_reason"])
        summary = f"Courier unsuspended: {profile.user.email}"
    else:
        return Response({"error": "Invalid action."}, status=status.HTTP_400_BAD_REQUEST)

    log_from_request(
        request,
        action="admin_action",
        entity_type="courier",
        entity_id=profile.user_id,
        summary=summary,
        details={"action": action, "reason": reason},
    )
    return Response({"message": summary, "status": profile.status})


# ─── Admin: merchant review ───────────────────────────────────────────────────


@api_view(["GET"])
@permission_classes([IsAdminUser])
def admin_pending_merchants(request):
    merchants = Merchant.objects.select_related("owner").filter(
        status__in=["pending", "suspended"]
    )[:100]
    results = []
    for merchant in merchants:
        review, _ = MerchantDocumentReview.objects.get_or_create(merchant=merchant)
        results.append(
            {
                "merchant": MerchantSerializer(merchant, context={"request": request}).data,
                "document_review": MerchantDocumentReviewSerializer(review).data,
                "onboarding": build_merchant_onboarding_state(merchant.owner, merchant),
                "owner_phone_verified": merchant.owner.is_phone_verified,
            }
        )
    return Response(results)


@api_view(["POST"])
@permission_classes([IsAdminUser])
def admin_merchant_document_review(request, merchant_id):
    merchant = get_object_or_404(Merchant, pk=merchant_id)
    doc_field = request.data.get("document", "").strip()
    new_status = request.data.get("status", "approved").strip().lower()
    notes = request.data.get("notes", "")

    if doc_field not in DOCUMENT_FIELD_MAP:
        return Response({"error": "Invalid document field."}, status=status.HTTP_400_BAD_REQUEST)
    if new_status not in {"approved", "rejected", "pending"}:
        return Response({"error": "Invalid status."}, status=status.HTTP_400_BAD_REQUEST)

    review, _ = MerchantDocumentReview.objects.get_or_create(merchant=merchant)
    status_field = DOCUMENT_FIELD_MAP[doc_field]
    note_field = DOCUMENT_NOTE_MAP[doc_field]
    setattr(review, status_field, new_status)
    setattr(review, note_field, notes)
    review.save()

    log_from_request(
        request,
        action="document_approval",
        entity_type="merchant",
        entity_id=merchant.id,
        summary=f"Merchant {doc_field} {new_status}",
        details={"document": doc_field, "status": new_status, "notes": notes},
    )
    return Response(
        {
            "document_review": MerchantDocumentReviewSerializer(review).data,
            "onboarding": build_merchant_onboarding_state(merchant.owner, merchant),
        }
    )


@api_view(["POST"])
@permission_classes([IsAdminUser])
def admin_merchant_action(request, merchant_id):
    merchant = get_object_or_404(Merchant, pk=merchant_id)
    action = request.data.get("action", "").strip().lower()
    reason = request.data.get("reason", "").strip()

    if action == "approve":
        review = MerchantDocumentReview.objects.filter(merchant=merchant).first()
        if review and not review.all_approved():
            return Response(
                {"error": "All documents must be approved first."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        merchant.status = "approved"
        merchant.approved_at = timezone.now()
        merchant.rejection_reason = ""
        merchant.is_active = True
        merchant.save()
        summary = f"Merchant approved: {merchant.business_name}"
    elif action == "reject":
        merchant.status = "rejected"
        merchant.rejection_reason = reason
        merchant.save()
        summary = f"Merchant rejected: {merchant.business_name}"
    elif action == "suspend":
        merchant.status = "suspended"
        merchant.is_active = False
        merchant.rejection_reason = reason or "Suspended by admin"
        merchant.save()
        summary = f"Merchant suspended: {merchant.business_name}"
    elif action == "unsuspend":
        merchant.status = "approved"
        merchant.is_active = True
        merchant.rejection_reason = ""
        merchant.save()
        summary = f"Merchant unsuspended: {merchant.business_name}"
    else:
        return Response({"error": "Invalid action."}, status=status.HTTP_400_BAD_REQUEST)

    log_from_request(
        request,
        action="admin_action",
        entity_type="merchant",
        entity_id=merchant.id,
        summary=summary,
        details={"action": action, "reason": reason},
    )
    return Response(MerchantSerializer(merchant, context={"request": request}).data)


@api_view(["POST"])
@permission_classes([IsAdminUser])
def admin_run_fraud_scan(request, user_id):
    from django.contrib.auth import get_user_model

    User = get_user_model()
    user = get_object_or_404(User, pk=user_id)
    flags = run_user_fraud_checks(user)
    return Response(
        {
            "flags_created": len(flags),
            "flags": FraudFlagSerializer(flags, many=True).data,
        }
    )
