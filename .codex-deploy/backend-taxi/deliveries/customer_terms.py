"""Customer delivery terms acceptance helpers."""

from rest_framework import status
from rest_framework.response import Response

from legal.constants import (
    CUSTOMER_DELIVERY_TERMS_VERSION,
    CUSTOMER_PRIVACY_VERSION,
)
from legal.services import customer_delivery_terms_current, customer_privacy_current


def truthy_flag(value) -> bool:
    return str(value).lower() in ["1", "true", "yes", "on"]


def ensure_customer_delivery_terms(user, data):
    """Persist customer delivery terms acceptance when placing a first order."""
    if customer_delivery_terms_current(user) and customer_privacy_current(user):
        return None

    terms_ok = truthy_flag(data.get("delivery_terms_accepted"))
    privacy_ok = truthy_flag(data.get("privacy_accepted")) or truthy_flag(
        data.get("privacy_policy_accepted")
    )

    if not terms_ok or not privacy_ok:
        return Response(
            {
                "detail": "You must accept the Terms & Conditions and Privacy Policy before placing an order.",
                "code": "delivery_terms_required",
            },
            status=status.HTTP_403_FORBIDDEN,
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
    return None
