import uuid
from decimal import Decimal, ROUND_HALF_UP

from taxi.market import calculate_app_fee

from .models import Payment, RiderPaymentMethod


def _commission_aware_app_fee(fare, ride=None):
    """Calculate the platform app fee, preferring the ride's snapshot commission.

    Falls back to calculate_app_fee (market.py rate) for legacy rides and cases
    where no ride is provided.
    """
    if ride is not None:
        try:
            from app_settings.pricing_service import get_ride_commission_percent
            commission_percent = get_ride_commission_percent(ride)
            amount = Decimal(str(fare or 0)) * commission_percent
            return amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        except Exception:
            pass
    return calculate_app_fee(fare)


def calculate_payment_amounts(amount, tip_percentage=0, discount_amount=0, ride=None):
    """
    Calculate payment breakdown amounts.

    Args:
        amount: The original fare amount (before discount).
        tip_percentage: Tip percentage to apply.
        discount_amount: Promo code discount amount to subtract from rider charge.
        ride: Optional Ride instance.  When provided, the snapshot commission
              percent is used instead of the market.py default.

    Returns:
        Tuple of (charge_amount, app_fee, tip_percent, tip_amount, driver_earning, discount).
        - charge_amount: What the rider actually pays (original_fare - discount + tip).
        - app_fee: Platform fee calculated from the ORIGINAL fare.
        - driver_earning: Calculated from the ORIGINAL fare (not discounted).
        - discount: The discount amount applied.
    """
    ride_amount = Decimal(str(amount or 0))
    tip_percent = Decimal(str(tip_percentage or 0))
    discount = Decimal(str(discount_amount or 0))

    # App fee and driver earning are always based on the ORIGINAL fare.
    # Use snapshot-aware commission when a ride is available.
    app_fee = _commission_aware_app_fee(ride_amount, ride=ride)
    tip_amount = (ride_amount * tip_percent / Decimal("100")).quantize(
        Decimal("0.01"),
        rounding=ROUND_HALF_UP,
    )
    driver_earning = ride_amount - app_fee + tip_amount

    # The charge amount is the final fare (after discount) that the rider pays
    charge_amount = max(ride_amount - discount, Decimal("0.00"))

    return charge_amount, app_fee, tip_percent, tip_amount, driver_earning, discount


def get_default_payment_method(rider):
    return RiderPaymentMethod.objects.filter(
        rider=rider,
        is_default=True,
    ).first()


def authorize_ride_payment(ride, discount_amount=0):
    """
    Authorize payment for a ride.

    Args:
        ride: The Ride instance to authorize payment for.
        discount_amount: Promo code discount amount (default 0). When provided,
            the rider is charged final_fare (fare - discount) but driver_earning
            is calculated from the original fare.

    Returns:
        The Payment instance (existing or newly created).
    """
    existing_payment = Payment.objects.filter(
        ride_id=ride.id,
        status__in=["authorized", "paid", "pending_verification"],
    ).first()

    if existing_payment:
        return existing_payment

    default_method = get_default_payment_method(ride.rider)
    payment_method = default_method.payment_type if default_method else "test"

    charge_amount, app_fee, tip_percent, tip_amount, driver_earning, discount = (
        calculate_payment_amounts(ride.fare, 0, discount_amount, ride=ride)
    )

    payment = Payment.objects.create(
        rider=ride.rider,
        ride_id=ride.id,
        amount=charge_amount,
        discount_amount=discount,
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
