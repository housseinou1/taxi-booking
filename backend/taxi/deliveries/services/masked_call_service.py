"""Masked call sessions for delivery customer ↔ courier contact."""

import secrets
from datetime import timedelta

from django.conf import settings
from django.utils import timezone

from ..models import Delivery, DeliveryCallSession


class MaskedCallError(Exception):
    def __init__(self, message, code="call_error"):
        self.message = message
        self.code = code
        super().__init__(message)


def _normalize_phone(value: str) -> str:
    return (value or "").strip().replace(" ", "")


def create_call_session(delivery: Delivery, requester) -> dict:
    if requester.id not in {delivery.customer_id, delivery.driver_id}:
        raise MaskedCallError("You cannot call for this delivery.", code="forbidden")

    if delivery.status in {"requested", "delivered", "cancelled"}:
        raise MaskedCallError(
            "Calls are only available during an active delivery.",
            code="inactive_delivery",
        )
    if not delivery.driver_id:
        raise MaskedCallError("No courier assigned yet.", code="no_courier")

    courier = delivery.driver
    customer = delivery.customer
    is_customer = requester.id == delivery.customer_id
    other_phone = _normalize_phone(
        courier.phone_number if is_customer else customer.phone_number
    )
    if not other_phone:
        raise MaskedCallError("Phone number is not available.", code="no_phone")

    relay = _normalize_phone(getattr(settings, "YALA_MASKED_CALL_RELAY", ""))
    session_code = f"{secrets.randbelow(10000):04d}"
    expires_at = timezone.now() + timedelta(minutes=30)

    if relay:
        dial_number = relay
        is_masked = True
        display_name = "Yala Courier" if is_customer else "Yala Customer"
    else:
        dial_number = other_phone
        is_masked = False
        display_name = (
            courier.get_full_name() if is_customer else customer.get_full_name()
        ) or "Contact"

    session = DeliveryCallSession.objects.create(
        delivery=delivery,
        customer=customer,
        courier=courier,
        session_code=session_code,
        dial_number=dial_number,
        is_masked=is_masked,
        expires_at=expires_at,
    )

    return {
        "session_id": session.id,
        "session_code": session.session_code,
        "dial_number": session.dial_number,
        "display_name": display_name,
        "is_masked": session.is_masked,
        "expires_at": session.expires_at.isoformat(),
        "instructions": (
            "Your number stays private. Use the Yala relay line."
            if is_masked
            else "Direct call — add Yala relay in production for number masking."
        ),
    }
