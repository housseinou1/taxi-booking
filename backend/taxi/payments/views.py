from django.contrib.auth import get_user_model
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .models import Payment
from .serializers import PaymentSerializer
from taxi.rides.models import Ride


User = get_user_model()


def get_default_user(request):
    if request.user and request.user.is_authenticated:
        return request.user

    return User.objects.first()


@api_view(["GET"])
def payment_list(request):
    payments = Payment.objects.all().order_by("-id")
    serializer = PaymentSerializer(payments, many=True)
    return Response(serializer.data)


@api_view(["POST"])
def create_test_payment(request):
    ride_id = request.data.get("ride_id")
    amount = request.data.get("amount", "0.00")

    if not ride_id:
        return Response({"error": "ride_id is required"}, status=400)

    try:
        ride = Ride.objects.get(id=ride_id)
    except Ride.DoesNotExist:
        return Response({"error": "Ride not found"}, status=404)

    rider = ride.rider or get_default_user(request)

    driver = ride.driver

    if not driver:
        driver = User.objects.first()

    if not rider or not driver:
        return Response({"error": "Rider or driver not found"}, status=400)

    payment, created = Payment.objects.update_or_create(
        ride=ride,
        defaults={
            "rider": rider,
            "driver": driver,
            "amount": amount,
            "payment_method": "card",
            "payment_status": "completed",
        },
    )

    serializer = PaymentSerializer(payment)

    return Response({
        "success": True,
        "message": "Payment successful",
        "payment": serializer.data,
    })


@api_view(["POST"])
def mark_payment_paid(request, payment_id):
    try:
        payment = Payment.objects.get(id=payment_id)
    except Payment.DoesNotExist:
        return Response({"error": "Payment not found"}, status=404)

    payment.payment_status = "completed"
    payment.save()

    serializer = PaymentSerializer(payment)

    return Response({
        "success": True,
        "payment": serializer.data,
    })


@api_view(["POST"])
def fail_payment(request, payment_id):
    try:
        payment = Payment.objects.get(id=payment_id)
    except Payment.DoesNotExist:
        return Response({"error": "Payment not found"}, status=404)

    payment.payment_status = "failed"
    payment.save()

    serializer = PaymentSerializer(payment)

    return Response({
        "success": True,
        "payment": serializer.data,
    })


@api_view(["GET"])
def driver_earnings(request):
    payments = Payment.objects.filter(payment_status="completed")

    gross_amount = sum(payment.amount for payment in payments)
    platform_fees = sum(payment.platform_fee for payment in payments)
    total_earnings = sum(payment.driver_amount for payment in payments)

    return Response({
        "driver": "Test Driver",
        "gross_amount": gross_amount,
        "platform_fees": platform_fees,
        "total_earnings": total_earnings,
        "currency": "MRU",
        "completed_payments": payments.count(),
    })