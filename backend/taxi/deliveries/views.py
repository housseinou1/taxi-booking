"""Delivery API views.

Handles delivery requests, driver workflow, disputes, admin analytics,
business accounts, and service category listings.
"""

from decimal import Decimal
from datetime import timedelta

from django.contrib.auth.hashers import check_password
from django.db import transaction
from django.db.models import Avg, Count, Q, Sum
from django.db.models.functions import TruncDate
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAdminUser, IsAuthenticated
from rest_framework.response import Response

from taxi.drivers.models import DriverDocument, DriverProfile
from authapp.validators import normalize_mauritania_phone, validate_plate_number, validate_vehicle_value

from legal.constants import COURIER_TERMS_VERSION
from legal.services import courier_has_complete_signature, serialize_courier_signature

from .customer_terms import (
    CUSTOMER_DELIVERY_TERMS_VERSION,
    ensure_customer_delivery_terms,
    truthy_flag,
)
from .courier_routing import get_courier_type_label
from .courier_onboarding import (
    build_courier_onboarding_state,
    courier_delivery_blocked_message,
    ensure_driver_profile_for_courier,
    get_courier_documents_review_state,
    get_required_courier_document_types,
    is_bicycle_courier,
    _courier_documents_complete,
    _profile_fields_complete,
    _vehicle_info_complete,
)
from .vehicle_types import normalize_delivery_vehicle_type

from .models import (
    BusinessAccount,
    Delivery,
    DeliveryDispute,
    DeliveryStop,
    DriverDeliverySettings,
)
from .serializers import (
    BusinessAccountSerializer,
    DeliveryCreateSerializer,
    DeliveryDisputeSerializer,
    DeliveryEstimateSerializer,
    DeliverySerializer,
    DeliveryStopSerializer,
    DisputeCreateSerializer,
    DisputeResolveSerializer,
    DriverDeliverySettingsSerializer,
    ServiceCategorySerializer,
)
from .services import DeliveryPricingService, DeliveryService, DisputeService
from .notifications import broadcast_new_delivery_request
from .services.delivery_service import DeliveryServiceError
from .services.dispute_service import DisputeServiceError
from payments.settlement_service import courier_balance_summary
from taxi.security.abuse import rate_limit
from admin_2fa.integrity import require_integrity
from taxi.security.upload_validation import validate_image_upload


def _validated_delivery_image(file, label="Image"):
    result = validate_image_upload(file)
    if not result.valid:
        return Response(
            {"detail": result.error, "code": "invalid_upload"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return None


ACTIVE_CUSTOMER_STATUSES = [
    "requested",
    "accepted",
    "courier_arriving",
    "picked_up",
    "in_transit",
    "delivering",
    "delivery_exception",
]

DELIVERY_EXCEPTION_REASONS = {
    "recipient_unavailable",
    "recipient_forgot_pin",
    "recipient_phone_unreachable",
    "recipient_refused_pin",
    "other",
}

delivery_service = DeliveryService()
pricing_service = DeliveryPricingService()
dispute_service = DisputeService()


# ─── Helper functions ─────────────────────────────────────────────────────────


def approved_driver_error(user):
    blocked = courier_delivery_blocked_message(user)
    if blocked:
        return blocked
    return ""


# ─── Rider endpoints ──────────────────────────────────────────────────────────


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def customer_delivery_terms(request):
    """Get or record customer delivery terms acceptance."""
    from legal.constants import CUSTOMER_PRIVACY_VERSION

    user = request.user
    if request.method == "GET":
        return Response(
            {
                "delivery_terms_accepted": bool(user.delivery_terms_accepted),
                "delivery_terms_accepted_at": (
                    user.delivery_terms_accepted_at.isoformat()
                    if user.delivery_terms_accepted_at
                    else None
                ),
                "delivery_terms_version": user.delivery_terms_version or "",
                "privacy_policy_accepted": bool(user.privacy_policy_accepted),
                "privacy_policy_accepted_at": (
                    user.privacy_policy_accepted_at.isoformat()
                    if user.privacy_policy_accepted_at
                    else None
                ),
                "privacy_policy_version": user.privacy_policy_version or "",
                "terms_version": CUSTOMER_DELIVERY_TERMS_VERSION,
                "current_privacy_version": CUSTOMER_PRIVACY_VERSION,
            }
        )

    terms_ok = truthy_flag(request.data.get("delivery_terms_accepted", True))
    privacy_ok = truthy_flag(request.data.get("privacy_accepted")) or truthy_flag(
        request.data.get("privacy_policy_accepted", True)
    )
    if not terms_ok or not privacy_ok:
        return Response(
            {"detail": "You must accept the Terms & Conditions and Privacy Policy."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user.delivery_terms_accepted = True
    user.delivery_terms_version = CUSTOMER_DELIVERY_TERMS_VERSION
    user.privacy_policy_accepted = True
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
    return Response(
        {
            "delivery_terms_accepted": True,
            "delivery_terms_accepted_at": (
                user.delivery_terms_accepted_at.isoformat()
                if user.delivery_terms_accepted_at
                else None
            ),
            "delivery_terms_version": user.delivery_terms_version,
            "privacy_policy_accepted": True,
            "privacy_policy_version": user.privacy_policy_version,
            "terms_version": CUSTOMER_DELIVERY_TERMS_VERSION,
        }
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def estimate_delivery_fare(request):
    """Return a full fare breakdown for the customer options screen."""
    serializer = DeliveryEstimateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    breakdown = pricing_service.calculate_fare(
        service_category=normalize_service_category(data.get("service_category", "package")),
        package_type=data.get("package_type", "small"),
        distance_km=data.get("distance_km", 0),
        courier_type=data.get("courier_type", "motorcycle"),
        fragile=data.get("is_fragile", False),
        urgent=data.get("is_urgent", False),
        weight_kg=data.get("weight_kg"),
        weather_surge_percent=data.get("weather_surge_percent", 0),
        demand_surge_percent=data.get("demand_surge_percent", 0),
        promo_code=data.get("promo_code", ""),
        rider=request.user,
    )
    return Response(breakdown.as_dict())


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def request_delivery(request):
    """Create a new delivery request with full category, stop, and scheduling support."""
    retry_after = rate_limit(request, "request-delivery", limit=5, window_seconds=600)
    if retry_after:
        return Response(
            {"detail": "Too many delivery requests. Please wait and try again."},
            status=status.HTTP_429_TOO_MANY_REQUESTS,
            headers={"Retry-After": str(retry_after)},
        )

    if not require_integrity(request.user.id):
        return Response(
            {
                "detail": "Device integrity check required. Update the app or use an official Play Store install.",
                "code": "integrity_required",
            },
            status=status.HTTP_403_FORBIDDEN,
        )

    if getattr(request.user, "rider_status", "approved") != "approved":
        return Response(
            {"detail": "Your account must be approved before requesting a delivery."},
            status=status.HTTP_403_FORBIDDEN,
        )
    if not request.user.is_phone_verified:
        return Response(
            {"detail": "Verify your phone number before requesting a delivery."},
            status=status.HTTP_403_FORBIDDEN,
        )

    terms_error = ensure_customer_delivery_terms(request.user, request.data)
    if terms_error is not None:
        return terms_error

    serializer = DeliveryCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    try:
        delivery, metadata = delivery_service.create_delivery(
            customer=request.user,
            data=serializer.validated_data,
        )
    except DeliveryServiceError as e:
        return Response(
            {"detail": e.message, "code": e.code},
            status=status.HTTP_400_BAD_REQUEST,
        )

    validated = serializer.validated_data
    if validated.get("save_address") or validated.get("save_instructions"):
        from security.services.delivery_preferences import persist_delivery_preferences

        persist_delivery_preferences(
            user=request.user,
            data=validated,
            delivery_address=validated.get("destination", ""),
            dropoff_instructions=validated.get("dropoff_instructions"),
            recipient_alt_phone=validated.get("recipient_alt_phone", ""),
        )

    response_data = DeliverySerializer(delivery, context={"request": request}).data
    response_data["recipient_code"] = metadata["recipient_code"]
    response_data["pickup_pin"] = metadata.get("pickup_pin", "")
    response_data["dropoff_pin"] = metadata.get("dropoff_pin", "")
    response_data["pickup_pin_note"] = "Share this PIN with your courier at pickup when required."
    response_data["dropoff_pin_note"] = "This PIN was sent to the recipient. They will share it with the courier at delivery."
    response_data["recipient_code_note"] = "Share this code only with the recipient."
    response_data["estimated_duration_minutes"] = metadata.get("estimated_duration_minutes")
    if metadata.get("stop_codes"):
        response_data["stop_codes"] = metadata["stop_codes"]
    response_data["fare_breakdown"] = metadata["fare_breakdown"]

    broadcast_new_delivery_request(delivery)

    return Response(response_data, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_deliveries(request):
    """List deliveries for the current user (rider, driver, or admin)."""
    if request.user.is_staff:
        deliveries = Delivery.objects.all()
    elif getattr(request.user, "user_type", "") == "driver":
        deliveries = Delivery.objects.filter(driver=request.user)
    else:
        deliveries = Delivery.objects.filter(customer=request.user)

    # Optional filters
    status_filter = request.query_params.get("status")
    category_filter = request.query_params.get("category")
    if status_filter:
        deliveries = deliveries.filter(status=status_filter)
    if category_filter:
        deliveries = deliveries.filter(service_category=category_filter)

    deliveries = deliveries.prefetch_related("stops")
    return Response(DeliverySerializer(deliveries, many=True, context={"request": request}).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def delivery_detail(request, delivery_id):
    """Get full delivery details including stops."""
    delivery = get_object_or_404(Delivery, id=delivery_id)

    if not request.user.is_staff:
        if delivery.customer_id != request.user.id and delivery.driver_id != request.user.id:
            return Response(
                {"detail": "You do not have access to this delivery."},
                status=status.HTTP_403_FORBIDDEN,
            )

    if delivery.status == "requested":
        from .services.assignment_service import assignment_service

        assignment_service.process_expired_offer(delivery)
        delivery.refresh_from_db()

    data = DeliverySerializer(delivery, context={"request": request}).data
    return Response(data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def delivery_tracking(request, delivery_id):
    """Get tracking info for a delivery (driver location, ETA)."""
    delivery = get_object_or_404(Delivery, id=delivery_id)

    if not request.user.is_staff:
        if delivery.customer_id != request.user.id:
            return Response(
                {"detail": "You do not have access to this delivery."},
                status=status.HTTP_403_FORBIDDEN,
            )

    if delivery.status == "requested":
        from .services.assignment_service import assignment_service

        assignment_service.process_expired_offer(delivery)
        delivery.refresh_from_db()

    serializer = DeliverySerializer(delivery, context={"request": request})
    eta = serializer.get_eta_minutes(delivery)
    data = {
        "delivery_id": delivery.id,
        "status": delivery.status,
        "customer_display_status": serializer.get_customer_display_status(delivery),
        "customer_display_label": serializer.get_customer_display_label(delivery),
        "arriving_soon": serializer.get_arriving_soon(delivery),
        "near_dropoff_notified": delivery.near_dropoff_notified,
        "merchant_order": serializer.get_merchant_order(delivery),
        "driver_name": "",
        "driver_lat": None,
        "driver_lng": None,
        "eta_minutes": eta,
        "estimated_duration_minutes": delivery.estimated_duration_minutes,
        "pickup_pin": serializer.get_pickup_pin(delivery),
        "payment_status": delivery.payment_status,
        "payment_method": delivery.payment_method,
    }

    if delivery.driver:
        data["driver_name"] = f"{delivery.driver.first_name} {delivery.driver.last_name}".strip()
        profile = getattr(delivery.driver, "driver_profile", None)
        settings = getattr(delivery.driver, "delivery_settings", None)
        if profile and profile.current_lat is not None and profile.current_lng is not None:
            data["driver_lat"] = profile.current_lat
            data["driver_lng"] = profile.current_lng
        elif delivery.status in ["accepted", "courier_arriving", "picked_up", "in_transit", "delivering"]:
            data["driver_lat"] = delivery.pickup_lat
            data["driver_lng"] = delivery.pickup_lng
        if settings:
            data["driver_rating"] = str(settings.delivery_rating)
        data["courier_vehicle_type"] = settings.delivery_vehicle_type if settings else ""
        data["courier_vehicle_label"] = get_courier_type_label(settings.delivery_vehicle_type) if settings else ""
        if profile:
            data["plate_number"] = profile.plate_number or profile.vehicle_plate or ""
            if profile.driver_photo and request:
                data["driver_photo"] = request.build_absolute_uri(profile.driver_photo.url)
            elif delivery.driver.profile_picture and request:
                data["driver_photo"] = request.build_absolute_uri(delivery.driver.profile_picture.url)

    return Response(data)


# ─── Driver endpoints ─────────────────────────────────────────────────────────


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def available_deliveries(request):
    """List available delivery requests for drivers."""
    error = approved_driver_error(request.user)
    if error:
        return Response({"detail": error}, status=status.HTTP_403_FORBIDDEN)

    settings_obj, _ = DriverDeliverySettings.objects.get_or_create(driver=request.user)

    deliveries = Delivery.objects.filter(
        status="requested", driver__isnull=True
    ).prefetch_related("stops")

    # Filter scheduled: only show if due
    # (non-scheduled always show; scheduled show if within 15 min of pickup)
    now = timezone.now()
    window = now + timedelta(minutes=15)
    deliveries = deliveries.filter(
        Q(is_scheduled=False) | Q(scheduled_pickup_at__lte=window)
    )

    from .notifications import _courier_accepts_delivery

    deliveries = [
        delivery
        for delivery in deliveries
        if _courier_accepts_delivery(settings_obj, delivery)
        and (not delivery.offered_driver_id or delivery.offered_driver_id == request.user.id)
    ]

    return Response(DeliverySerializer(deliveries, many=True, context={"request": request}).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def accept_delivery(request, delivery_id):
    """Driver accepts a delivery request."""
    error = approved_driver_error(request.user)
    if error:
        return Response({"detail": error}, status=status.HTTP_403_FORBIDDEN)

    with transaction.atomic():
        delivery = get_object_or_404(
            Delivery.objects.select_for_update(),
            id=delivery_id,
            status="requested",
            driver__isnull=True,
        )
        try:
            delivery = delivery_service.assign_driver(delivery, request.user)
        except DeliveryServiceError as e:
            http_status = (
                status.HTTP_403_FORBIDDEN
                if e.code in {"offer_not_available", "city_not_served"}
                else status.HTTP_400_BAD_REQUEST
            )
            return Response(
                {"detail": e.message, "code": e.code},
                status=http_status,
            )

    return Response(DeliverySerializer(delivery, context={"request": request}).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def decline_delivery(request, delivery_id):
    """Courier declines the current delivery offer."""
    error = approved_driver_error(request.user)
    if error:
        return Response({"detail": error}, status=status.HTTP_403_FORBIDDEN)

    delivery = get_object_or_404(Delivery, id=delivery_id, status="requested", driver__isnull=True)
    from .services.assignment_service import assignment_service

    try:
        assignment_service.decline_offer(delivery, request.user)
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_403_FORBIDDEN)

    return Response({"detail": "Offer declined.", "delivery_id": delivery_id})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def offer_timeout(request, delivery_id):
    """Mark an expired offer and move to the next courier."""
    delivery = get_object_or_404(Delivery, id=delivery_id, status="requested", driver__isnull=True)
    is_offered_courier = delivery.offered_driver_id == request.user.id
    if not request.user.is_staff and not is_offered_courier:
        return Response(
            {"detail": "Only the offered courier or admin can expire this offer."},
            status=status.HTTP_403_FORBIDDEN,
        )
    if is_offered_courier:
        error = approved_driver_error(request.user)
        if error:
            return Response({"detail": error}, status=status.HTTP_403_FORBIDDEN)

    from .services.assignment_service import assignment_service

    assignment_service.process_expired_offer(delivery)
    return Response({"detail": "Offer reassigned.", "delivery_id": delivery_id})


def get_assigned_delivery(request, delivery_id, allowed_statuses):
    error = approved_driver_error(request.user)
    if error:
        return None, Response({"detail": error}, status=status.HTTP_403_FORBIDDEN)
    delivery = get_object_or_404(Delivery, id=delivery_id, driver=request.user)
    if delivery.status not in allowed_statuses:
        return None, Response(
            {"detail": f"Delivery cannot be updated from status '{delivery.status}'."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return delivery, None


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def arrive_pickup(request, delivery_id):
    """Courier marks arrival at pickup location."""
    delivery, error_response = get_assigned_delivery(
        request, delivery_id, ["accepted", "courier_arriving", "picked_up", "in_transit", "delivering"]
    )
    if error_response:
        return error_response

    serializer_context = {"request": request}
    if delivery.status in {"courier_arriving", "picked_up", "in_transit", "delivering"}:
        return Response(DeliverySerializer(delivery, context=serializer_context).data)

    try:
        delivery = delivery_service.transition_status(delivery, "courier_arriving")
    except DeliveryServiceError as e:
        return Response({"detail": e.message}, status=status.HTTP_400_BAD_REQUEST)

    return Response(DeliverySerializer(delivery, context=serializer_context).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def pickup_delivery(request, delivery_id):
    """Driver confirms package pickup."""
    delivery, error_response = get_assigned_delivery(
        request,
        delivery_id,
        ["accepted", "courier_arriving", "picked_up", "in_transit", "delivering"],
    )
    if error_response:
        return error_response

    serializer_context = {"request": request}
    if delivery.status in {"picked_up", "in_transit", "delivering"}:
        return Response(DeliverySerializer(delivery, context=serializer_context).data)

    try:
        delivery_service.verify_pickup(
            delivery,
            pickup_pin=request.data.get("pickup_pin", ""),
            actor=request.user,
        )
        delivery = delivery_service.transition_status(delivery, "picked_up")
        if delivery.pickup_pin_verified_at:
            delivery.save(update_fields=["pickup_pin_verified_at"])
    except DeliveryServiceError as e:
        return Response({"detail": e.message, "code": e.code}, status=status.HTTP_400_BAD_REQUEST)

    return Response(DeliverySerializer(delivery, context=serializer_context).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def start_delivery(request, delivery_id):
    """Driver starts delivering (en route to destination)."""
    delivery, error_response = get_assigned_delivery(
        request, delivery_id, ["picked_up", "in_transit", "delivering"]
    )
    if error_response:
        return error_response

    serializer_context = {"request": request}
    if delivery.status in {"in_transit", "delivering"}:
        return Response(DeliverySerializer(delivery, context=serializer_context).data)

    try:
        delivery = delivery_service.transition_status(delivery, "in_transit")
    except DeliveryServiceError as e:
        return Response({"detail": e.message}, status=status.HTTP_400_BAD_REQUEST)

    return Response(DeliverySerializer(delivery, context=serializer_context).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def confirm_delivery(request, delivery_id):
    """Driver confirms delivery with dropoff PIN and optional proof."""
    delivery, error_response = get_assigned_delivery(
        request, delivery_id, ["picked_up", "in_transit", "delivering", "delivered"]
    )
    if error_response:
        return error_response

    serializer_context = {"request": request}
    if delivery.status == "delivered":
        return Response(DeliverySerializer(delivery, context=serializer_context).data)

    # Accept either 'recipient_code' (legacy) or 'dropoff_pin' (new)
    code = str(request.data.get("dropoff_pin") or request.data.get("recipient_code", "")).strip()

    # Try new dropoff_pin verification first, fall back to recipient_code_hash
    pin_valid = False
    if code and hasattr(delivery, "dropoff_pin") and delivery.dropoff_pin:
        try:
            delivery_service.verify_dropoff_pin(delivery, code, actor=request.user)
            pin_valid = True
        except DeliveryServiceError:
            pass

    if not pin_valid:
        if not code or not delivery_service.verify_recipient_code(delivery.recipient_code_hash, code):
            from security.services.fraud_service import log_verification_event

            log_verification_event(
                delivery,
                "dropoff_code_fail",
                actor=request.user,
                success=False,
            )
            return Response(
                {"detail": "Recipient confirmation code is incorrect.", "code": "invalid_code"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    from security.services.fraud_service import check_early_delivery, log_verification_event

    log_verification_event(
        delivery, "dropoff_code_success", actor=request.user, success=True
    )

    if not request.FILES.get("proof_of_delivery") and delivery_service.requires_proof_photo(delivery):
        return Response(
            {
                "detail": "A delivery photo is required to complete this order.",
                "code": "proof_required",
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    if request.FILES.get("proof_of_delivery"):
        upload_error = _validated_delivery_image(
            request.FILES["proof_of_delivery"],
            label="Proof photo",
        )
        if upload_error:
            return upload_error
        delivery.proof_of_delivery = request.FILES["proof_of_delivery"]
        log_verification_event(delivery, "proof_uploaded", actor=request.user)
    if request.FILES.get("recipient_signature"):
        upload_error = _validated_delivery_image(
            request.FILES["recipient_signature"],
            label="Signature image",
        )
        if upload_error:
            return upload_error
        delivery.recipient_signature = request.FILES["recipient_signature"]
        log_verification_event(delivery, "signature_uploaded", actor=request.user)

    delivery.driver_notes = request.data.get("driver_notes", delivery.driver_notes)

    # Save dropoff_pin_verified_at if PIN was verified
    if pin_valid and delivery.dropoff_pin_verified_at:
        delivery.save(update_fields=["dropoff_pin_verified_at"])

    try:
        delivery = delivery_service.transition_status(delivery, "delivered")
        check_early_delivery(delivery, request.user)
        from security.services.audit_service import log_from_request

        log_from_request(
            request,
            action="status_change",
            entity_type="delivery",
            entity_id=delivery.id,
            summary=f"Delivery #{delivery.id} delivered",
        )
    except DeliveryServiceError as e:
        return Response({"detail": e.message}, status=status.HTTP_400_BAD_REQUEST)

    return Response(DeliverySerializer(delivery, context={"request": request}).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def report_delivery_exception(request, delivery_id):
    """Courier reports a no-PIN drop-off issue with proof for admin review."""
    delivery, error_response = get_assigned_delivery(
        request, delivery_id, ["picked_up", "in_transit", "delivering"]
    )
    if error_response:
        return error_response

    reason = str(request.data.get("reason", "")).strip()
    if reason not in DELIVERY_EXCEPTION_REASONS:
        return Response(
            {
                "detail": "Select a valid reason before requesting admin review.",
                "code": "reason_required",
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    proof = request.FILES.get("proof_of_delivery")
    if not proof:
        return Response(
            {
                "detail": "A proof photo is required when the recipient has no PIN.",
                "code": "proof_required",
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    upload_error = _validated_delivery_image(proof, label="Proof photo")
    if upload_error:
        return upload_error

    if str(request.data.get("courier_confirmed", "")).lower() not in {"1", "true", "yes"}:
        return Response(
            {
                "detail": "Confirm that the recipient could not provide the PIN.",
                "code": "confirmation_required",
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    delivery.proof_of_delivery = proof
    delivery.exception_reason = reason
    delivery.exception_note = str(request.data.get("exception_note", "")).strip()
    delivery.exception_reported_at = timezone.now()
    delivery.exception_resolution = ""
    delivery.driver_notes = request.data.get("driver_notes", delivery.driver_notes)

    try:
        delivery = delivery_service.transition_status(delivery, "delivery_exception")
    except DeliveryServiceError as e:
        return Response({"detail": e.message, "code": e.code}, status=status.HTTP_400_BAD_REQUEST)

    from security.services.audit_service import log_from_request

    log_from_request(
        request,
        action="status_change",
        entity_type="delivery",
        entity_id=delivery.id,
        summary=f"Delivery #{delivery.id} submitted for admin review",
    )
    return Response(DeliverySerializer(delivery, context={"request": request}).data)


def _resolve_delivery_exception(request, delivery_id, resolution):
    delivery = get_object_or_404(Delivery, id=delivery_id, status="delivery_exception")
    note = str(request.data.get("note", "")).strip()
    delivery.exception_resolution = resolution
    delivery.exception_note = note or delivery.exception_note
    delivery.exception_resolved_at = timezone.now()
    delivery.exception_resolved_by = request.user
    delivery.save(
        update_fields=[
            "exception_resolution",
            "exception_note",
            "exception_resolved_at",
            "exception_resolved_by",
        ]
    )

    if resolution == "approved":
        try:
            delivery = delivery_service.transition_status(delivery, "delivered")
        except DeliveryServiceError as e:
            return Response({"detail": e.message, "code": e.code}, status=status.HTTP_400_BAD_REQUEST)
    else:
        delivery.status = "cancelled"
        if resolution == "refunded":
            delivery.payment_status = "failed"
            delivery.save(update_fields=["status", "payment_status"])
        else:
            delivery.save(update_fields=["status"])
        from .broadcast import broadcast_delivery_status
        from .services.notifications import notify_delivery_cancelled_event

        broadcast_delivery_status(delivery)
        notify_delivery_cancelled_event(delivery, cancelled_by="admin")

    from security.services.audit_service import log_from_request

    log_from_request(
        request,
        action="status_change",
        entity_type="delivery",
        entity_id=delivery.id,
        summary=f"Delivery #{delivery.id} exception {resolution}",
    )
    return Response(DeliverySerializer(delivery, context={"request": request}).data)


@api_view(["POST"])
@permission_classes([IsAdminUser])
def approve_delivery_exception(request, delivery_id):
    """Admin approves proof and marks a no-PIN delivery as delivered."""
    return _resolve_delivery_exception(request, delivery_id, "approved")


@api_view(["POST"])
@permission_classes([IsAdminUser])
def reject_delivery_exception(request, delivery_id):
    """Admin rejects proof and closes a no-PIN delivery."""
    return _resolve_delivery_exception(request, delivery_id, "rejected")


@api_view(["POST"])
@permission_classes([IsAdminUser])
def refund_delivery_exception(request, delivery_id):
    """Admin rejects proof and marks the delivery payment as failed/refund-needed."""
    return _resolve_delivery_exception(request, delivery_id, "refunded")


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def confirm_stop(request, delivery_id, stop_id):
    """Driver confirms delivery at a specific stop."""
    error = approved_driver_error(request.user)
    if error:
        return Response({"detail": error}, status=status.HTTP_403_FORBIDDEN)

    delivery = get_object_or_404(Delivery, id=delivery_id, driver=request.user)
    if delivery.status not in ["picked_up", "in_transit", "delivering"]:
        return Response(
            {"detail": "Delivery must be picked up or in transit to confirm stops."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    code = str(request.data.get("recipient_code", "")).strip()
    proof_photo = request.FILES.get("proof_photo")

    if not proof_photo:
        return Response(
            {
                "detail": "A delivery photo is required to complete this stop.",
                "code": "proof_required",
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    upload_error = _validated_delivery_image(proof_photo, label="Proof photo")
    if upload_error:
        return upload_error

    try:
        stop, all_done = delivery_service.complete_stop(
            delivery, stop_id, code, proof_photo
        )
    except DeliveryServiceError as e:
        return Response(
            {"detail": e.message, "code": e.code},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # If all stops done, mark delivery as delivered
    if all_done:
        try:
            delivery_service.transition_status(delivery, "delivered")
        except DeliveryServiceError:
            pass  # Already delivered or invalid transition

    data = DeliveryStopSerializer(stop).data
    data["all_stops_completed"] = all_done
    return Response(data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def rate_delivery(request, delivery_id):
    """Customer rates a completed delivery."""
    delivery = get_object_or_404(Delivery, id=delivery_id, customer=request.user)
    try:
        rating_value = int(request.data.get("rating"))
    except (TypeError, ValueError):
        return Response(
            {"detail": "Rating must be a number between 1 and 5."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        delivery = delivery_service.submit_rating(
            delivery,
            request.user,
            rating_value,
            request.data.get("review", ""),
            merchant_rating=request.data.get("merchant_rating"),
            experience_rating=request.data.get("experience_rating"),
        )
    except DeliveryServiceError as e:
        return Response({"detail": e.message, "code": e.code}, status=status.HTTP_400_BAD_REQUEST)

    return Response(DeliverySerializer(delivery, context={"request": request}).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def pay_delivery(request, delivery_id):
    """Customer settles payment for a completed delivery."""
    delivery = get_object_or_404(Delivery, id=delivery_id, customer=request.user)
    try:
        delivery = delivery_service.settle_payment(
            delivery,
            request.user,
            request.data.get("payment_method", "card"),
            request.data.get("tip_amount", 0),
            payment_timing=request.data.get("payment_timing", ""),
        )
    except DeliveryServiceError as e:
        return Response({"detail": e.message, "code": e.code}, status=status.HTTP_400_BAD_REQUEST)

    return Response(
        {
            "delivery_id": delivery.id,
            "payment_method": delivery.payment_method,
            "payment_status": delivery.payment_status,
            "fare": str(delivery.fare),
            "tip_amount": str(delivery.tip_amount),
            "driver_earning": str(delivery.driver_earning),
            "platform_commission": str(delivery.platform_commission),
        }
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def cancel_delivery(request, delivery_id):
    """Cancel a delivery (rider, courier, or admin)."""
    delivery = get_object_or_404(Delivery, id=delivery_id)

    is_customer = delivery.customer_id == request.user.id
    is_courier = delivery.driver_id == request.user.id
    is_admin = request.user.is_staff

    if not is_customer and not is_courier and not is_admin:
        return Response(
            {"detail": "You cannot cancel this delivery."},
            status=status.HTTP_403_FORBIDDEN,
        )

    # Couriers can cancel in accepted or courier_arriving
    if is_courier and delivery.status not in ["accepted", "courier_arriving"]:
        return Response(
            {"detail": "You can only cancel before picking up the package."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Customers can cancel in requested or accepted
    if is_customer and not is_admin and delivery.status not in ["requested", "accepted", "courier_arriving"]:
        return Response(
            {"detail": "This delivery can no longer be cancelled."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    delivery.status = "cancelled"
    delivery.driver = None
    delivery.save(update_fields=["status", "driver"])

    from .broadcast import broadcast_delivery_status
    from .services.notifications import notify_delivery_cancelled_event

    broadcast_delivery_status(delivery)
    if is_admin:
        cancelled_by = "admin"
    elif is_courier:
        cancelled_by = "courier"
    else:
        cancelled_by = "customer"
    notify_delivery_cancelled_event(delivery, cancelled_by=cancelled_by)

    from security.services.audit_service import log_from_request
    from security.services.fraud_service import check_excessive_cancellations

    log_from_request(
        request,
        action="status_change",
        entity_type="delivery",
        entity_id=delivery.id,
        summary=f"Delivery #{delivery.id} cancelled",
    )
    check_excessive_cancellations(delivery.customer)

    return Response(DeliverySerializer(delivery, context={"request": request}).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def customer_confirm_pickup(request, delivery_id):
    """Customer confirms pickup without sharing PIN (alternative verification)."""
    delivery = get_object_or_404(Delivery, id=delivery_id, customer=request.user)
    if delivery.status not in ["accepted", "courier_arriving"]:
        return Response(
            {"detail": "Pickup can only be confirmed while courier is en route."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    try:
        delivery_service.verify_pickup(
            delivery,
            pickup_confirmed=True,
            actor=request.user,
        )
        delivery.save(update_fields=["pickup_pin_verified_at"])
    except DeliveryServiceError as e:
        return Response({"detail": e.message, "code": e.code}, status=status.HTTP_400_BAD_REQUEST)
    return Response(
        {
            "delivery_id": delivery.id,
            "pickup_confirmed": True,
            "pickup_pin_verified_at": delivery.pickup_pin_verified_at,
        }
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def report_delivery_problem(request, delivery_id):
    """Report a problem during an active delivery (links to safety incident)."""
    delivery = get_object_or_404(Delivery, id=delivery_id)
    if not request.user.is_staff:
        if delivery.customer_id != request.user.id and delivery.driver_id != request.user.id:
            return Response(
                {"detail": "You do not have access to this delivery."},
                status=status.HTTP_403_FORBIDDEN,
            )

    from safety.models import SafetyIncident
    from safety.serializers import SafetyIncidentSerializer
    from safety.services import delivery_snapshot

    reported_user = None
    if delivery.driver_id and request.user.id == delivery.customer_id:
        reported_user_id = delivery.driver_id
    elif delivery.customer_id and request.user.id == delivery.driver_id:
        reported_user_id = delivery.customer_id
    else:
        reported_user_id = request.data.get("reported_user_id")

    if reported_user_id:
        from django.contrib.auth import get_user_model
        User = get_user_model()
        reported_user = User.objects.filter(pk=reported_user_id).first()

    incident = SafetyIncident.objects.create(
        reporter=request.user,
        reported_user=reported_user,
        delivery=delivery,
        incident_type=request.data.get("incident_type", "safety_incident"),
        severity=request.data.get("severity", "medium"),
        description=str(request.data.get("description", "")).strip(),
        latitude=request.data.get("latitude"),
        longitude=request.data.get("longitude"),
        trip_snapshot=delivery_snapshot(delivery),
    )

    from security.services.audit_service import log_from_request

    log_from_request(
        request,
        action="admin_action",
        entity_type="delivery",
        entity_id=delivery.id,
        summary=f"Delivery problem reported: #{delivery.id}",
        details={"incident_id": incident.id},
    )
    return Response(
        SafetyIncidentSerializer(incident).data,
        status=status.HTTP_201_CREATED,
    )


# ─── Courier onboarding ───────────────────────────────────────────────────────


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def courier_onboarding(request):
    """Return courier onboarding checklist and readiness state."""
    return Response(build_courier_onboarding_state(request.user, request))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def courier_vehicle_setup(request):
    """Save courier vehicle details during profile setup (no admin approval yet)."""
    if getattr(request.user, "user_type", "") != "driver":
        return Response(
            {"detail": "Only Yala Delivery courier accounts can complete vehicle setup."},
            status=status.HTTP_403_FORBIDDEN,
        )

    delivery_vehicle_type = normalize_delivery_vehicle_type(
        request.data.get("delivery_vehicle_type", "motorcycle")
    )
    profile = ensure_driver_profile_for_courier(request.user)

    phone_raw = (
        request.data.get("phone_number")
        or profile.phone_number
        or getattr(request.user, "phone_number", "")
    )
    if not str(phone_raw).strip():
        return Response(
            {"detail": "Phone number is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    profile.phone_number = normalize_mauritania_phone(phone_raw)

    if is_bicycle_courier(delivery_vehicle_type):
        profile.vehicle_make = ""
        profile.vehicle_model = ""
        profile.vehicle_color = ""
        profile.plate_number = ""
        profile.vehicle_plate = ""
    else:
        profile.vehicle_make = validate_vehicle_value(
            request.data.get("vehicle_make", profile.vehicle_make),
            "Vehicle make",
        )
        profile.vehicle_model = validate_vehicle_value(
            request.data.get("vehicle_model", profile.vehicle_model),
            "Vehicle model",
        )
        color = request.data.get("vehicle_color")
        if color is not None:
            profile.vehicle_color = validate_vehicle_value(color, "Vehicle color")
        elif not (profile.vehicle_color or "").strip():
            return Response(
                {"detail": "Vehicle color is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        plate_number = validate_plate_number(
            request.data.get("plate_number", profile.plate_number)
        )
        profile.plate_number = plate_number
        profile.vehicle_plate = plate_number

    from taxi.drivers.views import duplicate_driver_identity

    duplicate_error = duplicate_driver_identity(
        profile, profile.phone_number, profile.plate_number
    )
    if duplicate_error:
        return Response({"detail": duplicate_error}, status=status.HTTP_400_BAD_REQUEST)

    profile.car_type = "regular"
    profile.save()

    settings_obj, _ = DriverDeliverySettings.objects.get_or_create(driver=request.user)
    settings_obj.delivery_vehicle_type = delivery_vehicle_type
    settings_obj.save(update_fields=["delivery_vehicle_type"])

    return Response(build_courier_onboarding_state(request.user, request))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def courier_profile_setup_submit(request):
    """Validate courier profile setup and submit for admin approval."""
    if getattr(request.user, "user_type", "") != "driver":
        return Response(
            {"detail": "Only Yala Delivery courier accounts can submit profile setup."},
            status=status.HTTP_403_FORBIDDEN,
        )

    terms_accepted = str(request.data.get("terms_accepted", "")).lower() in [
        "1",
        "true",
        "yes",
        "on",
    ]
    profile = ensure_driver_profile_for_courier(request.user)

    if not courier_has_complete_signature(profile):
        return Response(
            {
                "detail": "Complete electronic signature before submitting your application.",
                "code": "courier_signature_required",
                "signature": serialize_courier_signature(profile, request),
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not terms_accepted and not profile.terms_accepted:
        return Response(
            {"detail": "You must accept the courier terms and conditions."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    settings_obj, _ = DriverDeliverySettings.objects.get_or_create(driver=request.user)
    delivery_vehicle_type = settings_obj.delivery_vehicle_type or ""

    if not delivery_vehicle_type:
        return Response(
            {"detail": "Choose a courier type before submitting."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not _profile_fields_complete(request.user, delivery_vehicle_type):
        return Response(
            {"detail": "Complete your personal information before submitting."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not _vehicle_info_complete(profile, delivery_vehicle_type):
        return Response(
            {"detail": "Complete your vehicle information before submitting."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    documents_state = _courier_documents_complete(profile, delivery_vehicle_type)
    if not documents_state["all_required_documents_uploaded"]:
        return Response(
            {
                "detail": "Upload all required documents before submitting.",
                "missing_document_types": documents_state["missing_document_types"],
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    profile.terms_version = profile.terms_version or COURIER_TERMS_VERSION
    if profile.status not in ("approved", "rejected"):
        profile.status = "pending_review"
    profile.save(update_fields=["status", "terms_version"])

    state = build_courier_onboarding_state(request.user, request)
    state["submitted"] = True
    state["message"] = (
        "Your courier application was submitted. An admin must approve your profile before you can go online."
    )
    return Response(state)


# ─── Driver delivery mode ────────────────────────────────────────────────────


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def driver_delivery_mode(request):
    """Get or toggle driver delivery mode settings."""
    settings_obj, _ = DriverDeliverySettings.objects.get_or_create(
        driver=request.user
    )

    if request.method == "GET":
        return Response(DriverDeliverySettingsSerializer(settings_obj).data)

    patch_keys = set(request.data.keys())
    preferences_only = patch_keys <= {"delivery_vehicle_type", "delivery_cities"}

    if not preferences_only:
        error = approved_driver_error(request.user)
        if error:
            return Response({"detail": error}, status=status.HTTP_403_FORBIDDEN)

    # PATCH
    new_enabled = request.data.get("delivery_mode_enabled")

    # Cannot disable if active delivery
    if new_enabled is False or (isinstance(new_enabled, str) and new_enabled.lower() == "false"):
        active = Delivery.objects.filter(
            driver=request.user,
            status__in=["accepted", "picked_up", "delivering"],
        ).exists()
        if active:
            return Response(
                {"detail": "Cannot disable delivery mode while a delivery is in progress."},
                status=status.HTTP_400_BAD_REQUEST,
            )

    serializer = DriverDeliverySettingsSerializer(
        settings_obj, data=request.data, partial=True
    )
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data)


# ─── Dispute endpoints ────────────────────────────────────────────────────────


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def create_dispute(request, delivery_id):
    """Rider raises a dispute for a delivery."""
    delivery = get_object_or_404(Delivery, id=delivery_id)

    serializer = DisputeCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    try:
        dispute = dispute_service.create_dispute(
            delivery=delivery,
            rider=request.user,
            reason=serializer.validated_data["reason"],
            description=serializer.validated_data["description"],
            photo_evidence=serializer.validated_data.get("photo_evidence"),
        )
    except DisputeServiceError as e:
        http_status = (
            status.HTTP_403_FORBIDDEN
            if e.code == "not_owner"
            else status.HTTP_400_BAD_REQUEST
        )
        return Response(
            {"detail": e.message, "code": e.code},
            status=http_status,
        )

    return Response(
        DeliveryDisputeSerializer(dispute).data,
        status=status.HTTP_201_CREATED,
    )


@api_view(["GET"])
@permission_classes([IsAdminUser])
def admin_disputes(request):
    """List all disputes with optional filters."""
    qs = DeliveryDispute.objects.select_related("delivery", "rider", "resolved_by")

    status_filter = request.query_params.get("status")
    reason_filter = request.query_params.get("reason")
    if status_filter:
        qs = qs.filter(status=status_filter)
    if reason_filter:
        qs = qs.filter(reason=reason_filter)

    return Response(DeliveryDisputeSerializer(qs, many=True).data)


@api_view(["POST"])
@permission_classes([IsAdminUser])
def resolve_dispute(request, dispute_id):
    """Admin resolves a dispute."""
    dispute = get_object_or_404(DeliveryDispute, id=dispute_id)

    serializer = DisputeResolveSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    try:
        dispute = dispute_service.resolve_dispute(
            dispute=dispute,
            admin_user=request.user,
            action=serializer.validated_data["action"],
            notes=serializer.validated_data.get("notes", ""),
            refund_amount=serializer.validated_data.get("refund_amount"),
        )
    except DisputeServiceError as e:
        return Response(
            {"detail": e.message, "code": e.code},
            status=status.HTTP_400_BAD_REQUEST,
        )

    return Response(DeliveryDisputeSerializer(dispute).data)


# ─── Admin analytics ──────────────────────────────────────────────────────────


@api_view(["GET"])
@permission_classes([IsAdminUser])
def admin_analytics(request):
    """Delivery analytics with optional filters."""
    qs = Delivery.objects.all()

    # Date range filters
    date_from = request.query_params.get("date_from")
    date_to = request.query_params.get("date_to")
    category = request.query_params.get("category")
    driver_id = request.query_params.get("driver_id")

    if date_from:
        qs = qs.filter(created_at__date__gte=date_from)
    if date_to:
        qs = qs.filter(created_at__date__lte=date_to)
    if category:
        qs = qs.filter(service_category=category)
    if driver_id:
        qs = qs.filter(driver_id=driver_id)

    total = qs.count()
    active = qs.filter(status__in=ACTIVE_CUSTOMER_STATUSES).count()
    completed = qs.filter(status="delivered").count()
    cancelled = qs.filter(status="cancelled").count()
    exceptions = qs.filter(status="delivery_exception").count()
    revenue = qs.filter(status="delivered").aggregate(total=Sum("fare"))["total"] or 0

    # Revenue by category
    revenue_by_category = dict(
        qs.filter(status="delivered")
        .values_list("service_category")
        .annotate(total=Sum("fare"))
        .values_list("service_category", "total")
    )

    # Average delivery time (from accepted to delivered)
    delivered_qs = qs.filter(
        status="delivered",
        accepted_at__isnull=False,
        delivered_at__isnull=False,
    )
    avg_delivery_minutes = None
    if delivered_qs.exists():
        total_minutes = sum(
            (d.delivered_at - d.accepted_at).total_seconds() / 60
            for d in delivered_qs.only("accepted_at", "delivered_at")[:100]
        )
        avg_delivery_minutes = round(total_minutes / min(delivered_qs.count(), 100), 1)

    # Dispute stats
    dispute_count = DeliveryDispute.objects.count()
    dispute_analytics = dispute_service.get_analytics(date_from, date_to)

    return Response({
        "total": total,
        "active": active,
        "completed": completed,
        "cancelled": cancelled,
        "exceptions": exceptions,
        "revenue": str(revenue),
        "revenue_by_category": {k: str(v) for k, v in revenue_by_category.items()},
        "avg_delivery_minutes": avg_delivery_minutes,
        "dispute_count": dispute_count,
        "dispute_analytics": dispute_analytics,
    })


# ─── Business account CRUD ────────────────────────────────────────────────────


@api_view(["GET", "POST"])
@permission_classes([IsAdminUser])
def business_accounts_list(request):
    """List or create business accounts."""
    if request.method == "GET":
        accounts = BusinessAccount.objects.all()
        active_filter = request.query_params.get("is_active")
        if active_filter is not None:
            accounts = accounts.filter(is_active=active_filter.lower() == "true")
        return Response(BusinessAccountSerializer(accounts, many=True).data)

    # POST
    serializer = BusinessAccountSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data, status=status.HTTP_201_CREATED)


@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([IsAdminUser])
def business_account_detail(request, account_id):
    """Retrieve, update, or deactivate a business account."""
    account = get_object_or_404(BusinessAccount, id=account_id)

    if request.method == "GET":
        return Response(BusinessAccountSerializer(account).data)

    if request.method == "PATCH":
        serializer = BusinessAccountSerializer(account, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    # DELETE → deactivate (not hard delete)
    account.is_active = False
    account.save(update_fields=["is_active"])
    return Response({"detail": "Business account deactivated."})


# ─── Service categories listing ───────────────────────────────────────────────


@api_view(["GET"])
def service_categories(request):
    """List available delivery service categories with pricing."""
    payload = [
        {**item, "base_fee": str(item["base_fee"])}
        for item in SERVICE_CATEGORIES
    ]
    serializer = ServiceCategorySerializer(payload, many=True)
    return Response(serializer.data)


# ─── Courier profile & earnings ────────────────────────────────────────────────

COURIER_DOCUMENT_LABELS = {
    "national_id": "National ID",
    "license": "Driver License",
    "carte_grise": "Vehicle Registration",
    "insurance": "Insurance",
    "profile_photo": "Profile Photo",
}

EXPIRING_SOON_DAYS = 30


def _courier_document_ui_status(document, display_status):
    today = timezone.localdate()
    if display_status == "expired":
        return "expired"
    if display_status == "rejected":
        return "rejected"
    if display_status == "pending_review":
        return "pending_review"
    if document and document.expires_at:
        days_remaining = (document.expires_at - today).days
        if 0 <= days_remaining <= EXPIRING_SOON_DAYS:
            return "expires_soon"
    if display_status == "approved":
        return "approved"
    return "missing"


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def courier_account_dashboard(request):
    """Rich courier account dashboard for the Yala Delivery profile screen."""
    user = request.user
    if getattr(user, "user_type", "") != "driver":
        return Response(
            {"detail": "Courier account required."},
            status=status.HTTP_403_FORBIDDEN,
        )

    profile = DriverProfile.objects.filter(user=user).first()
    settings_obj, _ = DriverDeliverySettings.objects.get_or_create(driver=user)
    onboarding = build_courier_onboarding_state(user)
    vehicle_type = settings_obj.delivery_vehicle_type or "motorcycle"

    from deliveries.courier_routing import get_courier_type_label
    from taxi.drivers.services.document_service import (
        DocumentService,
        get_document_display_status,
    )

    required_types = get_required_courier_document_types(vehicle_type)
    uploaded_docs = {}
    if profile:
        for document in DriverDocument.objects.filter(driver=profile):
            existing = uploaded_docs.get(document.document_type)
            if not existing or document.uploaded_at > existing.uploaded_at:
                uploaded_docs[document.document_type] = document

    documents = []
    for doc_type in required_types:
        document = uploaded_docs.get(doc_type)
        display_status = get_document_display_status(document) if document else "missing"
        ui_status = _courier_document_ui_status(document, display_status)
        documents.append(
            {
                "type": doc_type,
                "label": COURIER_DOCUMENT_LABELS.get(
                    doc_type, doc_type.replace("_", " ").title()
                ),
                "status": document.status if document else "",
                "display_status": display_status,
                "ui_status": ui_status,
                "expires_at": document.expires_at.isoformat() if document and document.expires_at else None,
                "uploaded_at": document.uploaded_at.isoformat() if document else None,
                "rejection_reason": document.rejection_reason if document else "",
            }
        )

    deliveries_qs = Delivery.objects.filter(driver=user)
    completed_count = settings_obj.total_deliveries_completed or deliveries_qs.filter(
        status="delivered"
    ).count()
    total_count = deliveries_qs.count()
    offered_count = Delivery.objects.filter(offered_driver=user).count()
    accepted_count = deliveries_qs.filter(accepted_at__isnull=False).count()
    acceptance_rate = (
        round((accepted_count / offered_count) * 100, 1) if offered_count else 100.0
    )

    now = timezone.now()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_deliveries = deliveries_qs.filter(status="delivered", delivered_at__gte=today_start)
    today_earnings = today_deliveries.aggregate(total=Sum("driver_earning"))["total"] or Decimal("0")
    today_count = today_deliveries.count()

    lifetime_earnings = deliveries_qs.filter(status="delivered").aggregate(
        total=Sum("driver_earning")
    )["total"] or Decimal("0")
    points = int(float(lifetime_earnings) / 10 * 3)
    level = (profile.driver_level if profile else "bronze") or "bronze"
    level_labels = {
        "bronze": "Bronze Courier",
        "silver": "Silver Courier",
        "gold": "Gold Courier",
        "platinum": "Platinum Courier",
        "elite": "Elite Courier",
    }
    next_level_points = 3000 if level == "bronze" else 4000 if level in {"silver", "gold"} else None

    photo_url = ""
    if user.profile_picture:
        photo_url = request.build_absolute_uri(user.profile_picture.url)
    elif profile and profile.driver_photo:
        photo_url = request.build_absolute_uri(profile.driver_photo.url)

    if profile and profile.status == "approved" and not onboarding.get("has_expired_documents"):
        account_status = "verified"
        account_message = "You are all set to receive delivery requests."
    elif onboarding.get("has_expired_documents"):
        account_status = "expired_documents"
        account_message = "Document expired. Please update before going online."
    elif profile and profile.status == "pending_review":
        account_status = "under_review"
        account_message = "Your Yala Delivery profile is under review."
    elif profile and profile.status == "rejected":
        account_status = "rejected"
        account_message = profile.application_rejection_reason or "Your courier application was rejected."
    elif settings_obj.is_suspended:
        account_status = "suspended"
        account_message = settings_obj.suspension_reason or "Your courier account is suspended."
    else:
        account_status = "incomplete"
        account_message = onboarding.get("message") or "Complete your courier profile to go online."

    wallet = courier_balance_summary(user)

    return Response(
        {
            "full_name": user.get_full_name() or user.email,
            "email": user.email,
            "phone": user.phone_number or "",
            "photo_url": photo_url,
            "courier_type": vehicle_type,
            "courier_type_label": get_courier_type_label(vehicle_type),
            "courier_id": f"YDL-{user.id}",
            "driver_code": profile.driver_code if profile else "",
            "online": settings_obj.delivery_mode_enabled,
            "rating": str(settings_obj.delivery_rating),
            "account_status": account_status,
            "account_message": account_message,
            "driver_status": profile.status if profile else "missing",
            "lifetime": {
                "total_deliveries": total_count,
                "completed_deliveries": completed_count,
                "rating": str(settings_obj.delivery_rating),
                "acceptance_rate": acceptance_rate,
            },
            "today": {
                "earnings": str(today_earnings),
                "deliveries": today_count,
                "online_time": "",
            },
            "level": {
                "current": level,
                "label": level_labels.get(level, "Bronze Courier"),
                "points": points,
                "next_level_points": next_level_points,
                "reward_rate": "3 points per 10 MRU earned",
            },
            "documents": documents,
            "wallet": wallet,
            "onboarding": onboarding,
            "vehicle": {
                "make": profile.vehicle_make if profile else "",
                "model": profile.vehicle_model if profile else "",
                "color": profile.vehicle_color if profile else "",
                "plate_number": (profile.plate_number or profile.vehicle_plate if profile else "") or "",
            },
        }
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def courier_profile(request):
    """Return courier profile aggregated from driver profile + delivery settings."""
    error = approved_driver_error(request.user)
    if error:
        return Response({"detail": error}, status=status.HTTP_403_FORBIDDEN)

    profile = getattr(request.user, "driver_profile", None)
    settings_obj, _ = DriverDeliverySettings.objects.get_or_create(driver=request.user)

    from .courier_routing import get_courier_type_label

    return Response(
        {
            "courier_type": settings_obj.delivery_vehicle_type,
            "courier_type_label": get_courier_type_label(settings_obj.delivery_vehicle_type),
            "vehicle_make": profile.vehicle_make if profile else "",
            "vehicle_model": profile.vehicle_model if profile else "",
            "vehicle_color": profile.vehicle_color if profile else "",
            "plate_number": (profile.plate_number or profile.vehicle_plate if profile else "") or "",
            "rating": str(settings_obj.delivery_rating),
            "availability": settings_obj.delivery_mode_enabled,
            "current_lat": profile.current_lat if profile else None,
            "current_lng": profile.current_lng if profile else None,
        }
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def courier_location(request):
    """Update courier GPS during active delivery and broadcast to customer."""
    error = approved_driver_error(request.user)
    if error:
        return Response({"detail": error}, status=status.HTTP_403_FORBIDDEN)

    lat = request.data.get("lat")
    lng = request.data.get("lng")
    if lat is None or lng is None:
        return Response({"detail": "lat and lng are required."}, status=status.HTTP_400_BAD_REQUEST)

    profile = getattr(request.user, "driver_profile", None)
    if not profile:
        return Response({"detail": "Courier profile not found."}, status=status.HTTP_400_BAD_REQUEST)

    prev_lat = profile.current_lat
    prev_lng = profile.current_lng
    prev_updated = profile.updated_at

    profile.current_lat = float(lat)
    profile.current_lng = float(lng)
    profile.save(update_fields=["current_lat", "current_lng"])

    if prev_lat is not None and prev_lng is not None and prev_updated:
        elapsed = (timezone.now() - prev_updated).total_seconds()
        if elapsed > 0:
            from security.services.fraud_service import check_fake_location_movement

            check_fake_location_movement(
                request.user,
                prev_lat=prev_lat,
                prev_lng=prev_lng,
                new_lat=profile.current_lat,
                new_lng=profile.current_lng,
                elapsed_seconds=elapsed,
            )

    active_delivery = (
        Delivery.objects.filter(
            driver=request.user,
            status__in=["accepted", "courier_arriving", "picked_up", "in_transit", "delivering"],
        )
        .order_by("-accepted_at")
        .first()
    )

    if active_delivery:
        from .broadcast import broadcast_courier_location
        from .geo import eta_minutes_to_target

        eta = None
        if active_delivery.status in {"accepted", "courier_arriving"}:
            eta = eta_minutes_to_target(
                profile.current_lat,
                profile.current_lng,
                active_delivery.pickup_lat,
                active_delivery.pickup_lng,
            )
        elif active_delivery.status in {"picked_up", "in_transit", "delivering"}:
            eta = eta_minutes_to_target(
                profile.current_lat,
                profile.current_lng,
                active_delivery.destination_lat,
                active_delivery.destination_lng,
            )

        broadcast_courier_location(active_delivery, profile.current_lat, profile.current_lng, eta)

        from .services.geofence_service import check_nearby_geofence

        check_nearby_geofence(active_delivery, profile.current_lat, profile.current_lng)

    return Response({"current_lat": profile.current_lat, "current_lng": profile.current_lng})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def courier_earnings(request):
    """Courier earnings summary with commission breakdown."""
    error = approved_driver_error(request.user)
    if error:
        return Response({"detail": error}, status=status.HTTP_403_FORBIDDEN)

    now = timezone.now()
    deliveries = Delivery.objects.filter(driver=request.user, status="delivered")

    def bucket(start):
        items = deliveries.filter(delivered_at__gte=start)
        earnings = items.aggregate(total=Sum("driver_earning"))["total"] or 0
        commission = items.aggregate(total=Sum("platform_commission"))["total"] or 0
        return {
            "count": items.count(),
            "earnings": str(earnings),
            "commission": str(commission),
        }

    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=today_start.weekday())
    month_start = today_start.replace(day=1)

    return Response(
        {
            "today": bucket(today_start),
            "week": bucket(week_start),
            "month": bucket(month_start),
            "history": DeliverySerializer(
                deliveries.order_by("-delivered_at")[:20],
                many=True,
                context={"request": request},
            ).data,
            "wallet": courier_balance_summary(request.user),
        }
    )
