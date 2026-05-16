import uuid

from django.contrib.auth import get_user_model
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .models import Payment
from .serializers import PaymentSerializer


User = get_user_model()


def get_default_user(request):
    if request.user and request.user.is_authenticated:
        return request.user

    return User.objects.first()


def get_driver_from_ride_id(ride_id):
    if not ride_id:
        return User.objects.first()

    try:
        from taxi.rides.models import Ride

        ride = Ride.objects.get(id=ride_id)

        if ride.driver:
            return ride.driver

        return User.objects.first()

    except Exception:
        return User.objects.first()


@api_view(["GET"])
def payment_list(request):
    payments = Payment.objects.all().order_by("-id")

    serializer = PaymentSerializer(payments, many=True)

    return Response(serializer.data)


@api_view(["POST"])
def create_test_payment(request):
    rider = get_default_user(request)

    if not rider:
        return Response(
            {"error": "No user found"},
            status=400,
        )

    ride_id = request.data.get("ride_id")

    amount = request.data.get("amount", "0.00")

    driver = get_driver_from_ride_id(ride_id)

    payment = Payment.objects.create(
        rider=rider,
        driver=driver,
        ride_id=ride_id,
        amount=amount,
        currency="MRU",
        method="test",
        status="paid",
        transaction_id=f"TEST-{uuid.uuid4().hex[:10].upper()}",
    )

    serializer = PaymentSerializer(payment)

    return Response({
        "success": True,
        "message": "Test payment completed",
        "payment": serializer.data,
    })


@api_view(["POST"])
def mark_payment_paid(request, payment_id):
    try:
        payment = Payment.objects.get(id=payment_id)

    except Payment.DoesNotExist:
        return Response(
            {"error": "Payment not found"},
            status=404,
        )

    payment.status = "paid"

    if not payment.transaction_id:
        payment.transaction_id = (
            f"TEST-{uuid.uuid4().hex[:10].upper()}"
        )

    if not payment.driver:
        payment.driver = get_driver_from_ride_id(
            payment.ride_id
        )

    payment.save()

    serializer = PaymentSerializer(payment)

    return Response({
        "success": True,
        "message": "Payment marked as paid",
        "payment": serializer.data,
    })


@api_view(["POST"])
def fail_payment(request, payment_id):
    try:
        payment = Payment.objects.get(id=payment_id)

    except Payment.DoesNotExist:
        return Response(
            {"error": "Payment not found"},
            status=404,
        )

    payment.status = "failed"

    payment.save()

    serializer = PaymentSerializer(payment)

    return Response({
        "success": True,
        "message": "Payment failed",
        "payment": serializer.data,
    })


@api_view(["GET"])
def driver_earnings(request):
    paid_payments = Payment.objects.filter(
        status="paid"
    )

    gross_amount = sum(
        payment.amount for payment in paid_payments
    )

    platform_fees = sum(
        payment.platform_fee
        for payment in paid_payments
    )

    total_earnings = sum(
        payment.driver_amount
        for payment in paid_payments
    )

    return Response({
        "driver": "Test Driver",
        "gross_amount": gross_amount,
        "platform_fees": platform_fees,
        "total_earnings": total_earnings,
        "currency": "MRU",
        "completed_payments": paid_payments.count(),
    })