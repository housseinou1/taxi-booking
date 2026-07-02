"""Fraud detection and flagging for Yala Delivery."""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.db.models import Count
from django.utils import timezone

from deliveries.models import Delivery
from payments.models import PaymentRecord, RefundRequest

from ..models import DeliveryVerificationEvent, FraudFlag
from .audit_service import log_audit

CANCELLATION_WINDOW_DAYS = 30
CANCELLATION_THRESHOLD = 5
REFUND_WINDOW_DAYS = 60
REFUND_THRESHOLD = 3
FAILED_PAYMENT_WINDOW_DAYS = 7
FAILED_PAYMENT_THRESHOLD = 3
EARLY_DELIVERY_MIN_MINUTES = 3


def _get_or_create_flag(user, reason, description="", **kwargs):
    existing = FraudFlag.objects.filter(
        user=user,
        reason=reason,
        status="open",
    ).first()
    if existing:
        return existing, False
    flag = FraudFlag.objects.create(
        user=user,
        reason=reason,
        description=description,
        **kwargs,
    )
    log_audit(
        action="fraud_flag",
        entity_type="customer" if user.user_type == "rider" else user.user_type,
        entity_id=user.id,
        summary=f"Fraud flag: {reason}",
        actor=None,
        details={"flag_id": flag.id, "reason": reason},
    )
    return flag, True


def check_excessive_cancellations(user) -> FraudFlag | None:
    since = timezone.now() - timedelta(days=CANCELLATION_WINDOW_DAYS)
    count = Delivery.objects.filter(
        customer=user,
        status="cancelled",
        created_at__gte=since,
    ).count()
    if count < CANCELLATION_THRESHOLD:
        return None
    flag, _ = _get_or_create_flag(
        user,
        "excessive_cancellations",
        description=f"{count} cancellations in {CANCELLATION_WINDOW_DAYS} days.",
        metadata={"cancellation_count": count},
    )
    return flag


def check_repeated_refunds(user) -> FraudFlag | None:
    since = timezone.now() - timedelta(days=REFUND_WINDOW_DAYS)
    count = RefundRequest.objects.filter(
        customer=user,
        created_at__gte=since,
    ).count()
    if count < REFUND_THRESHOLD:
        return None
    flag, _ = _get_or_create_flag(
        user,
        "repeated_refunds",
        description=f"{count} refund requests in {REFUND_WINDOW_DAYS} days.",
        metadata={"refund_count": count},
    )
    return flag


def check_failed_payments(user) -> FraudFlag | None:
    since = timezone.now() - timedelta(days=FAILED_PAYMENT_WINDOW_DAYS)
    count = PaymentRecord.objects.filter(
        customer=user,
        status="failed",
        created_at__gte=since,
    ).count()
    if count < FAILED_PAYMENT_THRESHOLD:
        return None
    flag, _ = _get_or_create_flag(
        user,
        "failed_payments",
        description=f"{count} failed payments in {FAILED_PAYMENT_WINDOW_DAYS} days.",
        metadata={"failed_count": count},
    )
    return flag


def check_early_delivery(delivery, driver) -> FraudFlag | None:
    """Flag courier if delivery marked complete suspiciously fast after pickup."""
    if not delivery.picked_up_at or not delivery.delivered_at:
        return None
    elapsed = (delivery.delivered_at - delivery.picked_up_at).total_seconds() / 60
    min_expected = max(
        EARLY_DELIVERY_MIN_MINUTES,
        float(delivery.estimated_duration_minutes or 0) * 0.15,
    )
    if elapsed >= min_expected:
        return None
    flag, _ = _get_or_create_flag(
        driver,
        "early_delivery",
        description=(
            f"Delivery #{delivery.id} marked delivered {elapsed:.1f} min after pickup "
            f"(expected at least {min_expected:.1f} min)."
        ),
        related_delivery=delivery,
        severity="high",
        metadata={
            "elapsed_minutes": round(elapsed, 1),
            "min_expected_minutes": round(min_expected, 1),
            "delivery_id": delivery.id,
        },
    )
    return flag


def check_fake_location_movement(
    driver,
    *,
    prev_lat: float,
    prev_lng: float,
    new_lat: float,
    new_lng: float,
    elapsed_seconds: float,
) -> FraudFlag | None:
    """Flag impossible GPS jumps (teleportation)."""
    if elapsed_seconds <= 0:
        return None
    from math import radians, sin, cos, sqrt, atan2

    r = 6371.0
    dlat = radians(new_lat - prev_lat)
    dlng = radians(new_lng - prev_lng)
    a = sin(dlat / 2) ** 2 + cos(radians(prev_lat)) * cos(radians(new_lat)) * sin(dlng / 2) ** 2
    distance_km = 2 * r * atan2(sqrt(a), sqrt(1 - a))
    speed_kmh = (distance_km / elapsed_seconds) * 3600
    if speed_kmh < 250:
        return None
    flag, _ = _get_or_create_flag(
        driver,
        "fake_location",
        description=f"Impossible movement: {distance_km:.1f} km in {elapsed_seconds:.0f}s ({speed_kmh:.0f} km/h).",
        severity="high",
        metadata={
            "distance_km": round(distance_km, 2),
            "speed_kmh": round(speed_kmh, 1),
            "elapsed_seconds": elapsed_seconds,
        },
    )
    return flag


def run_user_fraud_checks(user) -> list[FraudFlag]:
    flags = []
    for checker in (
        check_excessive_cancellations,
        check_repeated_refunds,
        check_failed_payments,
    ):
        flag = checker(user)
        if flag:
            flags.append(flag)
    return flags


def log_verification_event(
    delivery,
    event_type: str,
    *,
    actor=None,
    success: bool = True,
    metadata: dict | None = None,
) -> DeliveryVerificationEvent:
    return DeliveryVerificationEvent.objects.create(
        delivery=delivery,
        actor=actor,
        event_type=event_type,
        success=success,
        metadata=metadata or {},
    )
