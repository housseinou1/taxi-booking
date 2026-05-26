import uuid
from decimal import Decimal, ROUND_HALF_UP

from taxi.market import calculate_app_fee

from .models import Payment, RiderPaymentMethod


def calculate_payment_amounts(amount, tip_percentage=0):
    ride_amount = Decimal(str(amount or 0))
    tip_percent = Decimal(str(tip_percentage or 0))
    app_fee = calculate_app_fee(ride_amount)
    tip_amount = (ride_amount * tip_percent / Decimal("100")).quantize(
        Decimal("0.01"),
        rounding=ROUND_HALF_UP,
    )
    driver_earning = ride_amount - app_fee + tip_amount

    return ride_amount, app_fee, tip_percent, tip_amount, driver_earning


def get_default_payment_method(rider):
    return RiderPaymentMethod.objects.filter(
        rider=rider,
        is_default=True,
    ).first()


def authorize_ride_payment(ride):
    existing_payment = Payment.objects.filter(
        ride_id=ride.id,
        status__in=["authorized", "paid", "pending_verification"],
    ).first()

    if existing_payment:
        return existing_payment

    default_method = get_default_payment_method(ride.rider)
    payment_method = default_method.payment_type if default_method else "test"
    amount, app_fee, tip_percent, tip_amount, driver_earning = calculate_payment_amounts(
        ride.fare,
        0,
    )

    payment = Payment.objects.create(
        rider=ride.rider,
        ride_id=ride.id,
        amount=amount,
        app_fee=app_fee,
        tip_percentage=tip_percent,
        tip_amount=tip_amount,
        driver_earning=driver_earning,
        method=payment_method,
        status="authorized",
        transaction_id=f"AUTH-{uuid.uuid4()}",
    )

    ride.app_fee = app_fee
    ride.driver_earning = driver_earning
    ride.save(update_fields=["app_fee", "driver_earning"])

    return payment


def capture_ride_payment(ride):
    payment = Payment.objects.filter(
        ride_id=ride.id,
        status="authorized",
    ).order_by("-created_at").first()

    if not payment:
        return None

    payment.status = "paid"
    payment.transaction_id = payment.transaction_id or f"PAY-{uuid.uuid4()}"
    payment.save(update_fields=["status", "transaction_id"])

    ride.app_fee = payment.app_fee
    ride.driver_earning = payment.driver_earning
    ride.save(update_fields=["app_fee", "driver_earning"])

    return payment


def cancel_ride_payment(ride):
    payments = Payment.objects.filter(
        ride_id=ride.id,
        status__in=["pending", "authorized", "pending_verification"],
    )

    updated = 0
    for payment in payments:
        payment.status = "cancelled"
        payment.save(update_fields=["status"])
        updated += 1

    return updated
