import secrets
from decimal import Decimal, InvalidOperation

from django.contrib.auth.hashers import check_password, make_password
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from taxi.drivers.models import DriverProfile

from .models import Delivery
from .serializers import DeliverySerializer


ACTIVE_CUSTOMER_STATUSES = ["requested", "accepted", "picked_up", "delivering"]


def approved_driver_error(user):
    if getattr(user, "user_type", "") != "driver":
        return "Only driver accounts can manage delivery requests."
    if not user.is_phone_verified:
        return "Verify your phone number before accepting deliveries."
    if not DriverProfile.objects.filter(user=user, status="approved").exists():
        return "Your driver application must be approved before accepting deliveries."
    return ""


def calculate_delivery_fare(distance_km, package_type):
    try:
        distance = max(Decimal(str(distance_km or 0)), Decimal("0"))
    except (InvalidOperation, TypeError, ValueError):
        distance = Decimal("0")
    package_fees = {
        "document": Decimal("40"),
        "small": Decimal("60"),
        "medium": Decimal("100"),
        "large": Decimal("180"),
    }
    return (Decimal("100") + distance * Decimal("22") + package_fees.get(package_type, Decimal("60"))).quantize(
        Decimal("0.01")
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def request_delivery(request):
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
    if Delivery.objects.filter(
        customer=request.user,
        status__in=ACTIVE_CUSTOMER_STATUSES,
    ).exists():
        return Response(
            {"detail": "Complete or cancel your active delivery before requesting another."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    serializer = DeliverySerializer(data=request.data, context={"request": request})
    serializer.is_valid(raise_exception=True)
    recipient_code = f"{secrets.randbelow(10000):04d}"
    distance_km = serializer.validated_data.get("distance_km", 0)
    package_type = serializer.validated_data.get("package_type", "small")
    fare = serializer.validated_data.get("fare") or calculate_delivery_fare(
        distance_km,
        package_type,
    )
    delivery = serializer.save(
        customer=request.user,
        fare=fare,
        status="requested",
        recipient_code_hash=make_password(recipient_code),
    )
    data = DeliverySerializer(delivery, context={"request": request}).data
    data["recipient_code"] = recipient_code
    data["recipient_code_note"] = "Share this code only with the recipient."
    return Response(data, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def available_deliveries(request):
    error = approved_driver_error(request.user)
    if error:
        return Response({"detail": error}, status=status.HTTP_403_FORBIDDEN)
    deliveries = Delivery.objects.filter(status="requested", driver__isnull=True)
    return Response(DeliverySerializer(deliveries, many=True, context={"request": request}).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_deliveries(request):
    if request.user.is_staff:
        deliveries = Delivery.objects.all()
    elif getattr(request.user, "user_type", "") == "driver":
        deliveries = Delivery.objects.filter(driver=request.user)
    else:
        deliveries = Delivery.objects.filter(customer=request.user)
    return Response(DeliverySerializer(deliveries, many=True, context={"request": request}).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def accept_delivery(request, delivery_id):
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
        if Delivery.objects.filter(
            driver=request.user,
            status__in=["accepted", "picked_up", "delivering"],
        ).exists():
            return Response(
                {"detail": "Complete your active delivery before accepting another."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        delivery.driver = request.user
        delivery.status = "accepted"
        delivery.accepted_at = timezone.now()
        delivery.save(update_fields=["driver", "status", "accepted_at"])
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
    delivery, error_response = get_assigned_delivery(request, delivery_id, ["accepted"])
    if error_response:
        return error_response
    delivery.status = "picked_up"
    delivery.picked_up_at = timezone.now()
    delivery.save(update_fields=["status", "picked_up_at"])
    return Response(DeliverySerializer(delivery, context={"request": request}).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def start_delivery(request, delivery_id):
    delivery, error_response = get_assigned_delivery(request, delivery_id, ["picked_up"])
    if error_response:
        return error_response
    delivery.status = "delivering"
    delivery.save(update_fields=["status"])
    return Response(DeliverySerializer(delivery, context={"request": request}).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def confirm_delivery(request, delivery_id):
    delivery, error_response = get_assigned_delivery(
        request,
        delivery_id,
        ["picked_up", "delivering"],
    )
    if error_response:
        return error_response
    code = str(request.data.get("recipient_code", "")).strip()
    if not code or not check_password(code, delivery.recipient_code_hash):
        return Response(
            {"detail": "Recipient confirmation code is incorrect."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if request.FILES.get("proof_of_delivery"):
        delivery.proof_of_delivery = request.FILES["proof_of_delivery"]
    delivery.driver_notes = request.data.get("driver_notes", delivery.driver_notes)
    delivery.status = "delivered"
    delivery.delivered_at = timezone.now()
    delivery.save()
    return Response(DeliverySerializer(delivery, context={"request": request}).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def cancel_delivery(request, delivery_id):
    delivery = get_object_or_404(Delivery, id=delivery_id)
    if not request.user.is_staff and delivery.customer_id != request.user.id:
        return Response({"detail": "You cannot cancel this delivery."}, status=status.HTTP_403_FORBIDDEN)
    if delivery.status not in ["requested", "accepted"]:
        return Response(
            {"detail": "This delivery can no longer be cancelled."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    delivery.status = "cancelled"
    delivery.save(update_fields=["status"])
    return Response(DeliverySerializer(delivery, context={"request": request}).data)
