import uuid
from decimal import Decimal

from django.db.models import Sum

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from taxi.rides.models import Ride
from taxi.market import get_app_fee_percent_display
from .services import calculate_payment_amounts

from .models import (
    DriverPayoutMethod,
    OwnerPayoutMethod,
    Payment,
    RiderPaymentMethod,
    WithdrawalRequest,
)
from .serializers import (
    DriverPayoutMethodSerializer,
    OwnerPayoutMethodSerializer,
    PaymentSerializer,
    RiderPaymentMethodSerializer,
    WithdrawalRequestSerializer,
)


def driver_withdrawal_balance(driver):
    total_earned = Ride.objects.filter(
        driver=driver,
        status="completed",
    ).aggregate(total=Sum("driver_earning"))["total"] or Decimal("0")

    reserved_or_paid = WithdrawalRequest.objects.filter(
        driver=driver,
        status__in=["pending", "approved"],
    ).aggregate(total=Sum("amount"))["total"] or Decimal("0")

    return max(total_earned - reserved_or_paid, Decimal("0"))


def owner_commission_total():
    return Payment.objects.filter(
        status="paid",
    ).aggregate(total=Sum("app_fee"))["total"] or Decimal("0")


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def save_payment_method(request):
    if request.data.get("is_default", True):
        RiderPaymentMethod.objects.filter(
            rider=request.user
        ).update(is_default=False)

    serializer = RiderPaymentMethodSerializer(data=request.data)

    if serializer.is_valid():
        serializer.save(rider=request.user)

        return Response(serializer.data, status=status.HTTP_201_CREATED)

    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_payment_methods(request):
    methods = RiderPaymentMethod.objects.filter(
        rider=request.user
    ).order_by("-is_default", "-created_at")

    serializer = RiderPaymentMethodSerializer(methods, many=True)

    return Response(serializer.data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def create_payment(request):
    try:
        ride_id = request.data.get("ride_id")
        amount = Decimal(str(request.data.get("amount", 0)))
        tip_percentage = Decimal(str(request.data.get("tip_percentage", 0)))

        if tip_percentage < 0 or tip_percentage > 20:
            return Response(
                {"error": "Tip percentage must be between 0 and 20"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        ride = Ride.objects.get(id=ride_id)

        if ride.rider != request.user:
            return Response(
                {"error": "You can only pay for your own ride"},
                status=status.HTTP_403_FORBIDDEN,
            )

        if ride.status == "cancelled":
            return Response(
                {"error": "This ride was cancelled, so payment will not go through."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        existing_payment = Payment.objects.filter(
            ride_id=ride.id,
        ).order_by("-created_at").first()

        if existing_payment and existing_payment.status in [
            "authorized",
            "paid",
            "pending_verification",
        ]:
            payment_amount = amount or existing_payment.amount or ride.fare
            (
                payment_amount,
                app_fee,
                tip_percentage,
                tip_amount,
                driver_earning,
            ) = calculate_payment_amounts(payment_amount, tip_percentage)

            existing_payment.amount = payment_amount
            existing_payment.app_fee = app_fee
            existing_payment.tip_percentage = tip_percentage
            existing_payment.tip_amount = tip_amount
            existing_payment.driver_earning = driver_earning
            existing_payment.save(
                update_fields=[
                    "amount",
                    "app_fee",
                    "tip_percentage",
                    "tip_amount",
                    "driver_earning",
                ]
            )

            ride.app_fee = app_fee
            ride.driver_earning = driver_earning
            ride.save(update_fields=["app_fee", "driver_earning"])

            return Response(
                {
                    "message": (
                        "Tip updated before payment capture"
                        if existing_payment.status == "authorized"
                        else "Driver tip updated"
                    ),
                    "payment": PaymentSerializer(existing_payment).data,
                },
                status=status.HTTP_200_OK,
            )

        default_method = RiderPaymentMethod.objects.filter(
            rider=request.user,
            is_default=True,
        ).first()

        selected_method = request.data.get("method", "").lower()
        payment_method = (
            selected_method
            if selected_method
            else default_method.payment_type if default_method else "cash"
        )

        amount, app_fee, tip_percentage, tip_amount, driver_earning = calculate_payment_amounts(
            amount,
            tip_percentage,
        )

        deferred_methods = ["bankily", "masrvi", "seddad", "cash"]

        payment_status = (
            "pending_verification"
            if payment_method in deferred_methods
            else "paid"
        )

        payment = Payment.objects.create(
            rider=request.user,
            ride_id=ride.id,
            amount=amount,
            app_fee=app_fee,
            tip_percentage=tip_percentage,
            tip_amount=tip_amount,
            driver_earning=driver_earning,
            method=payment_method,
            status=payment_status,
            transaction_id=str(uuid.uuid4()),
        )

        ride.app_fee = app_fee
        ride.driver_earning = driver_earning
        ride.save(update_fields=["app_fee", "driver_earning"])

        serializer = PaymentSerializer(payment)

        return Response(
            {
                "message": (
                    "Payment pending verification"
                    if payment_status == "pending_verification"
                    else "Payment successful"
                ),
                "payment": serializer.data,
                "payment_method": str(default_method) if default_method else payment_method,
                "owner_commission_percent": str(get_app_fee_percent_display()),
                "owner_commission_amount": str(app_fee),
            },
            status=status.HTTP_201_CREATED,
        )

    except Ride.DoesNotExist:
        return Response(
            {"error": "Ride not found"},
            status=status.HTTP_404_NOT_FOUND,
        )

    except Exception as e:
        return Response(
            {"error": str(e)},
            status=status.HTTP_400_BAD_REQUEST,
        )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def rider_mark_paid(request, ride_id):
    try:
        ride = Ride.objects.get(id=ride_id)

        if ride.rider != request.user:
            return Response(
                {"error": "You can only mark your own ride as paid"},
                status=status.HTTP_403_FORBIDDEN,
            )

        payment = Payment.objects.filter(
            ride_id=ride.id,
            rider=request.user,
        ).order_by("-created_at").first()

        if not payment:
            return Response(
                {"error": "Create payment first"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if payment.status == "paid":
            return Response(
                {"message": "Payment already confirmed", "payment": PaymentSerializer(payment).data}
            )

        payment.status = "pending_verification"
        payment.save()

        return Response(
            {
                "message": "Payment sent for driver verification",
                "payment": PaymentSerializer(payment).data,
            }
        )

    except Ride.DoesNotExist:
        return Response(
            {"error": "Ride not found"},
            status=status.HTTP_404_NOT_FOUND,
        )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def driver_confirm_payment(request, ride_id):
    try:
        ride = Ride.objects.get(id=ride_id)

        if ride.driver != request.user:
            return Response(
                {"error": "Only the assigned driver can confirm payment"},
                status=status.HTTP_403_FORBIDDEN,
            )

        payment = Payment.objects.filter(
            ride_id=ride.id,
            status="pending_verification",
        ).order_by("-created_at").first()

        if not payment:
            return Response(
                {"error": "No pending payment verification found"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        payment.status = "paid"
        payment.save()

        return Response(
            {
                "message": "Payment confirmed successfully",
                "payment": PaymentSerializer(payment).data,
            }
        )

    except Ride.DoesNotExist:
        return Response(
            {"error": "Ride not found"},
            status=status.HTTP_404_NOT_FOUND,
        )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_payments(request):
    payments = Payment.objects.filter(
        rider=request.user
    ).order_by("-created_at")

    serializer = PaymentSerializer(payments, many=True)

    return Response(serializer.data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def withdrawal_requests(request):
    if request.user.is_staff:
        withdrawals = WithdrawalRequest.objects.all().order_by("-created_at")
        return Response(WithdrawalRequestSerializer(withdrawals, many=True).data)

    withdrawals = WithdrawalRequest.objects.filter(driver=request.user).order_by("-created_at")

    return Response({
        "available_balance": str(driver_withdrawal_balance(request.user)),
        "withdrawals": WithdrawalRequestSerializer(withdrawals, many=True).data,
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_payout_methods(request):
    methods = DriverPayoutMethod.objects.filter(driver=request.user).order_by("-is_default", "-created_at")
    return Response(DriverPayoutMethodSerializer(methods, many=True).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def save_payout_method(request):
    if request.data.get("is_default", True):
        DriverPayoutMethod.objects.filter(driver=request.user).update(is_default=False)

    serializer = DriverPayoutMethodSerializer(data=request.data)

    if serializer.is_valid():
        serializer.save(driver=request.user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def owner_payout_summary(request):
    if not request.user.is_staff:
        return Response(
            {"error": "Only an admin can manage owner payout methods."},
            status=status.HTTP_403_FORBIDDEN,
        )

    methods = OwnerPayoutMethod.objects.filter(
        owner=request.user,
    ).order_by("-is_default", "-created_at")

    return Response({
        "owner_commission_percent": str(get_app_fee_percent_display()),
        "owner_commission_balance": str(owner_commission_total()),
        "methods": OwnerPayoutMethodSerializer(methods, many=True).data,
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def save_owner_payout_method(request):
    if not request.user.is_staff:
        return Response(
            {"error": "Only an admin can save owner payout methods."},
            status=status.HTTP_403_FORBIDDEN,
        )

    if request.data.get("is_default", True):
        OwnerPayoutMethod.objects.filter(owner=request.user).update(is_default=False)

    serializer = OwnerPayoutMethodSerializer(data=request.data)

    if serializer.is_valid():
        serializer.save(owner=request.user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def request_withdrawal(request):
    amount = Decimal(str(request.data.get("amount", 0)))

    if amount <= 0:
        return Response({"error": "Withdrawal amount must be greater than zero"}, status=status.HTTP_400_BAD_REQUEST)

    available_balance = driver_withdrawal_balance(request.user)

    if amount > available_balance:
        return Response(
            {
                "error": f"Withdrawal amount is higher than available balance ({available_balance} MRU)",
                "available_balance": str(available_balance),
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    payout_method = DriverPayoutMethod.objects.filter(
        driver=request.user,
        id=request.data.get("payout_method"),
    ).first()

    if not payout_method:
        payout_method = DriverPayoutMethod.objects.filter(driver=request.user, is_default=True).first()

    if not payout_method:
        return Response({"error": "Please add a payout method first"}, status=status.HTTP_400_BAD_REQUEST)

    withdrawal = WithdrawalRequest.objects.create(
        driver=request.user,
        payout_method=payout_method,
        amount=amount,
        note=request.data.get("note", ""),
    )

    return Response(
        {
            "message": "Withdrawal request submitted",
            "withdrawal": WithdrawalRequestSerializer(withdrawal).data,
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def approve_withdrawal(request, withdrawal_id):
    try:
        withdrawal = WithdrawalRequest.objects.get(id=withdrawal_id)
    except WithdrawalRequest.DoesNotExist:
        return Response({"error": "Withdrawal not found"}, status=status.HTTP_404_NOT_FOUND)

    withdrawal.status = "approved"
    withdrawal.admin_note = request.data.get("admin_note", withdrawal.admin_note)
    withdrawal.save(update_fields=["status", "admin_note", "updated_at"])
    return Response({"message": "Withdrawal approved", "withdrawal": WithdrawalRequestSerializer(withdrawal).data})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def reject_withdrawal(request, withdrawal_id):
    try:
        withdrawal = WithdrawalRequest.objects.get(id=withdrawal_id)
    except WithdrawalRequest.DoesNotExist:
        return Response({"error": "Withdrawal not found"}, status=status.HTTP_404_NOT_FOUND)

    withdrawal.status = "rejected"
    withdrawal.admin_note = request.data.get("admin_note", withdrawal.admin_note)
    withdrawal.save(update_fields=["status", "admin_note", "updated_at"])
    return Response({"message": "Withdrawal rejected", "withdrawal": WithdrawalRequestSerializer(withdrawal).data})
