"""Yala Ride (taxi) terms acceptance helpers."""

from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response

from legal.constants import RIDE_PRIVACY_VERSION, RIDE_TERMS_VERSION
from legal.services import (
    customer_privacy_current,
    log_compliance_event,
    ride_legal_compliance_current,
    ride_privacy_current,
    ride_terms_current,
)


def truthy_flag(value) -> bool:
    return str(value).lower() in ["1", "true", "yes", "on"]


def ensure_ride_legal_acceptance(user, data, request=None):
    """Require ride terms + privacy before first taxi booking or after version bump."""
    if ride_legal_compliance_current(user):
        return None

    terms_ok = (
        truthy_flag(data.get("ride_terms_accepted"))
        or truthy_flag(data.get("rider_terms_accepted"))
        or truthy_flag(data.get("terms_accepted"))
    )
    privacy_ok = (
        truthy_flag(data.get("privacy_accepted"))
        or truthy_flag(data.get("privacy_policy_accepted"))
        or ride_privacy_current(user)
        or customer_privacy_current(user)
    )

    if not terms_ok or not privacy_ok:
        return Response(
            {
                "detail": "You must accept the Yala Ride Terms & Conditions and Privacy Policy before booking a ride.",
                "code": "ride_terms_required",
            },
            status=status.HTTP_403_FORBIDDEN,
        )

    was_resign = bool(user.ride_terms_accepted and user.ride_terms_version and user.ride_terms_version != RIDE_TERMS_VERSION)

    now = timezone.now()
    user.ride_terms_accepted = True
    user.ride_terms_accepted_at = now
    user.ride_terms_version = RIDE_TERMS_VERSION
    user.privacy_policy_accepted = True
    user.privacy_policy_accepted_at = now
    user.privacy_policy_version = RIDE_PRIVACY_VERSION
    user.save(
        update_fields=[
            "ride_terms_accepted",
            "ride_terms_accepted_at",
            "ride_terms_version",
            "privacy_policy_accepted",
            "privacy_policy_accepted_at",
            "privacy_policy_version",
        ]
    )

    ip_address = ""
    if request is not None:
        from legal.services import get_client_ip

        ip_address = get_client_ip(request)

    log_compliance_event(
        user=user,
        agreement_type="ride",
        action="resign" if was_resign else "checkbox_accept",
        terms_version=RIDE_TERMS_VERSION,
        ip_address=ip_address,
        device_info=(data.get("device_info") or "")[:500],
        app_version=(data.get("app_version") or "")[:40],
        metadata={"privacy_version": RIDE_PRIVACY_VERSION},
    )
    return None
