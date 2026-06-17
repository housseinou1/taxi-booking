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

from taxi.drivers.models import DriverProfile

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
    DeliverySerializer,
    DeliveryStopSerializer,
    DisputeCreateSerializer,
    DisputeResolveSerializer,
    DriverDeliverySettingsSerializer,
    ServiceCategorySerializer,
)
from .services import DeliveryPricingService, DeliveryService, DisputeService
from .services.delivery_service import DeliveryServiceError
from .services.dispute_service import DisputeServiceError
from .services.pricing import CATEGORY_BASE_FEES


ACTIVE_CUSTOMER_STATUSES = ["requested", "accepted", "picked_up", "delivering"]

delivery_service = DeliveryService()
pricing_service = DeliveryPricingService()
dispute_service = DisputeService()


# ─── Helper functions ─────────────────────────────────────────────────────────


def approved_driver_error(user):
    if getattr(user, "user_type", "") != "driver":
        return "Only driver accounts can manage delivery requests."
    if not user.is_phone_verified:
        return "Verify your phone number before accepting deliveries."
    if not DriverProfile.objects.filter(user=user, status="approved").exists():
        return "Your driver application must be approved before accepting deliveries."
    return ""


# ─── Rider endpoints ──────────────────────────────────────────────────────────


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def request_delivery(request):
    """Create a new delivery request with full category, stop, and scheduling support."""
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

    response_data = DeliverySerializer(delivery, context={"request": request}).data
    response_data["recipient_code"] = metadata["recipient_code"]
    response_data["recipient_code_note"] = "Share this code only with the recipient."
    if metadata.get("stop_codes"):
        response_data["stop_codes"] = metadata["stop_codes"]
    response_data["fare_breakdown"] = metadata["fare_breakdown"]

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

    # Access control: customer, driver, or admin
    if not request.user.is_staff:
        if delivery.customer_id != request.user.id and delivery.driver_id != request.user.id:
            return Response(
                {"detail": "You do not have access to this delivery."},
                status=status.HTTP_403_FORBIDDEN,
            )

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

    data = {
        "delivery_id": delivery.id,
        "status": delivery.status,
        "driver_name": "",
        "driver_lat": None,
        "driver_lng": None,
        "eta_minutes": None,
    }

    if delivery.driver:
        data["driver_name"] = f"{delivery.driver.first_name} {delivery.driver.last_name}".strip()
        # Driver location would come from WebSocket/cache in production
        # For now return pickup coords as placeholder when status allows
        if delivery.status in ["accepted", "picked_up", "delivering"]:
            data["driver_lat"] = delivery.pickup_lat
            data["driver_lng"] = delivery.pickup_lng

    return Response(data)


# ─── Driver endpoints ─────────────────────────────────────────────────────────


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def available_deliveries(request):
    """List available delivery requests for drivers."""
    error = approved_driver_error(request.user)
    if error:
        return Response({"detail": error}, status=status.HTTP_403_FORBIDDEN)

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
            return Response(
                {"detail": e.message, "code": e.code},
                status=status.HTTP_400_BAD_REQUEST,
            )

    return Response(DeliverySerializer(delivery, context={"request": request}).data)


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
def pickup_delivery(request, delivery_id):
    """Driver confirms package pickup."""
    delivery, error_response = get_assigned_delivery(request, delivery_id, ["accepted"])
    if error_response:
        return error_response

    try:
        delivery = delivery_service.transition_status(delivery, "picked_up")
    except DeliveryServiceError as e:
        return Response({"detail": e.message}, status=status.HTTP_400_BAD_REQUEST)

    return Response(DeliverySerializer(delivery, context={"request": request}).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def start_delivery(request, delivery_id):
    """Driver starts delivering (en route to destination)."""
    delivery, error_response = get_assigned_delivery(request, delivery_id, ["picked_up"])
    if error_response:
        return error_response

    try:
        delivery = delivery_service.transition_status(delivery, "delivering")
    except DeliveryServiceError as e:
        return Response({"detail": e.message}, status=status.HTTP_400_BAD_REQUEST)

    return Response(DeliverySerializer(delivery, context={"request": request}).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def confirm_delivery(request, delivery_id):
    """Driver confirms delivery with recipient code and optional proof."""
    delivery, error_response = get_assigned_delivery(
        request, delivery_id, ["picked_up", "delivering"]
    )
    if error_response:
        return error_response

    code = str(request.data.get("recipient_code", "")).strip()
    if not code or not delivery_service.verify_recipient_code(delivery.recipient_code_hash, code):
        return Response(
            {"detail": "Recipient confirmation code is incorrect.", "code": "invalid_code"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Handle proof of delivery
    if request.FILES.get("proof_of_delivery"):
        delivery.proof_of_delivery = request.FILES["proof_of_delivery"]
    if request.FILES.get("recipient_signature"):
        delivery.recipient_signature = request.FILES["recipient_signature"]

    delivery.driver_notes = request.data.get("driver_notes", delivery.driver_notes)

    try:
        delivery = delivery_service.transition_status(delivery, "delivered")
    except DeliveryServiceError as e:
        return Response({"detail": e.message}, status=status.HTTP_400_BAD_REQUEST)

    return Response(DeliverySerializer(delivery, context={"request": request}).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def confirm_stop(request, delivery_id, stop_id):
    """Driver confirms delivery at a specific stop."""
    error = approved_driver_error(request.user)
    if error:
        return Response({"detail": error}, status=status.HTTP_403_FORBIDDEN)

    delivery = get_object_or_404(Delivery, id=delivery_id, driver=request.user)
    if delivery.status not in ["picked_up", "delivering"]:
        return Response(
            {"detail": "Delivery must be picked up or in transit to confirm stops."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    code = str(request.data.get("recipient_code", "")).strip()
    proof_photo = request.FILES.get("proof_photo")

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
def cancel_delivery(request, delivery_id):
    """Cancel a delivery (rider or admin only)."""
    delivery = get_object_or_404(Delivery, id=delivery_id)

    if not request.user.is_staff and delivery.customer_id != request.user.id:
        return Response(
            {"detail": "You cannot cancel this delivery."},
            status=status.HTTP_403_FORBIDDEN,
        )
    if delivery.status not in ["requested", "accepted"]:
        return Response(
            {"detail": "This delivery can no longer be cancelled."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    delivery.status = "cancelled"
    delivery.save(update_fields=["status"])
    return Response(DeliverySerializer(delivery, context={"request": request}).data)


# ─── Driver delivery mode ────────────────────────────────────────────────────


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def driver_delivery_mode(request):
    """Get or toggle driver delivery mode settings."""
    error = approved_driver_error(request.user)
    if error:
        return Response({"detail": error}, status=status.HTTP_403_FORBIDDEN)

    settings_obj, created = DriverDeliverySettings.objects.get_or_create(
        driver=request.user
    )

    if request.method == "GET":
        return Response(DriverDeliverySettingsSerializer(settings_obj).data)

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
        return Response(
            {"detail": e.message, "code": e.code},
            status=status.HTTP_400_BAD_REQUEST,
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


SERVICE_CATEGORIES = [
    {
        "key": "food",
        "label": "Food Delivery",
        "icon": "🍕",
        "base_fee": CATEGORY_BASE_FEES["food"],
        "description": "Restaurant and prepared food delivery with insulated handling.",
    },
    {
        "key": "package",
        "label": "Package Delivery",
        "icon": "📦",
        "base_fee": CATEGORY_BASE_FEES["small"],
        "description": "General packages of any size, door-to-door.",
    },
    {
        "key": "document",
        "label": "Document Delivery",
        "icon": "📄",
        "base_fee": CATEGORY_BASE_FEES["document"],
        "description": "Secure document and envelope delivery.",
    },
    {
        "key": "pharmacy",
        "label": "Pharmacy Delivery",
        "icon": "💊",
        "base_fee": CATEGORY_BASE_FEES["pharmacy"],
        "description": "Medication and pharmacy items with temperature care.",
    },
    {
        "key": "shopping",
        "label": "Shopping Delivery",
        "icon": "🛒",
        "base_fee": CATEGORY_BASE_FEES["shopping"],
        "description": "Shopping pickup and delivery with budget management.",
    },
]


@api_view(["GET"])
def service_categories(request):
    """List available delivery service categories with pricing."""
    serializer = ServiceCategorySerializer(SERVICE_CATEGORIES, many=True)
    return Response(serializer.data)
