"""Central legal version checks and re-sign routing."""

from legal.constants import LEGAL_VERSION, legal_versions_payload
from legal.services import (
    courier_requires_resign,
    customer_delivery_terms_current,
    customer_privacy_current,
    driver_requires_terms_resign,
    merchant_requires_resign,
    ride_legal_compliance_current,
    ride_terms_current,
)

# Frontend paths shown when a role must re-accept or sign updated terms.
LEGAL_SIGN_PATHS = {
    "rider": "/rider/legal",
    "ride": "/rider/legal",
    "driver": "/driver/sign",
    "courier": "/delivery/courier/sign",
    "merchant": "/merchant/sign",
    "customer_delivery": "/delivery",
}


def ride_requires_resign(user) -> bool:
    if not user or not getattr(user, "ride_terms_accepted", False):
        return False
    return not ride_terms_current(user)


def customer_delivery_requires_resign(user) -> bool:
    if not user:
        return False
    if not getattr(user, "delivery_terms_accepted", False):
        return False
    return not (customer_delivery_terms_current(user) and customer_privacy_current(user))


def build_role_gate(*, role_key, compliance_current, requires_resign, signed_version="", current_version=""):
    return {
        "role": role_key,
        "compliance_current": bool(compliance_current),
        "requires_resign": bool(requires_resign),
        "signed_version": signed_version or "",
        "current_version": current_version or "",
        "sign_path": LEGAL_SIGN_PATHS.get(role_key, ""),
        "blocked": bool(requires_resign or not compliance_current),
    }


def build_legal_gates(user, profile=None, merchant=None):
    """Unified per-role legal gate payload for /legal/status/ and clients."""
    profile = profile if profile is not None else getattr(user, "driver_profile", None)
    merchant = merchant if merchant is not None else getattr(user, "merchant_profile", None)

    from legal.constants import (
        COURIER_TERMS_VERSION,
        CUSTOMER_DELIVERY_TERMS_VERSION,
        CUSTOMER_PRIVACY_VERSION,
        DRIVER_AGREEMENT_VERSION,
        MERCHANT_TERMS_VERSION,
        RIDE_PRIVACY_VERSION,
        RIDE_TERMS_VERSION,
    )
    from legal.services import (
        courier_has_complete_signature,
        driver_agreement_current,
        driver_has_complete_signature,
        merchant_has_complete_signature,
    )

    ride_compliant = ride_legal_compliance_current(user)
    ride_resign = ride_requires_resign(user)

    driver_compliant = driver_agreement_current(profile) if profile else False
    driver_resign = driver_requires_terms_resign(profile) if profile else False

    courier_compliant = (
        courier_has_complete_signature(profile) and not courier_requires_resign(profile)
        if profile
        else False
    )
    courier_resign = courier_requires_resign(profile) if profile else False

    merchant_compliant = (
        merchant_has_complete_signature(merchant) and not merchant_requires_resign(merchant)
        if merchant
        else False
    )
    merchant_resign = merchant_requires_resign(merchant) if merchant else False

    customer_compliant = customer_delivery_terms_current(user) and customer_privacy_current(user)
    customer_resign = customer_delivery_requires_resign(user)

    return {
        "versions": legal_versions_payload(),
        "ride": build_role_gate(
            role_key="ride",
            compliance_current=ride_compliant,
            requires_resign=ride_resign,
            signed_version=getattr(user, "ride_terms_version", "") or "",
            current_version=RIDE_TERMS_VERSION,
        ),
        "rider": build_role_gate(
            role_key="rider",
            compliance_current=ride_compliant,
            requires_resign=ride_resign,
            signed_version=getattr(user, "ride_terms_version", "") or "",
            current_version=RIDE_TERMS_VERSION,
        ),
        "driver": build_role_gate(
            role_key="driver",
            compliance_current=driver_compliant,
            requires_resign=driver_resign,
            signed_version=(profile.driver_terms_version if profile else "") or "",
            current_version=DRIVER_AGREEMENT_VERSION,
        ),
        "courier": build_role_gate(
            role_key="courier",
            compliance_current=courier_compliant,
            requires_resign=courier_resign,
            signed_version=(profile.terms_version if profile else "") or "",
            current_version=COURIER_TERMS_VERSION,
        ),
        "merchant": build_role_gate(
            role_key="merchant",
            compliance_current=merchant_compliant,
            requires_resign=merchant_resign,
            signed_version=(merchant.terms_version if merchant else "") or "",
            current_version=MERCHANT_TERMS_VERSION,
        ),
        "customer_delivery": build_role_gate(
            role_key="customer_delivery",
            compliance_current=customer_compliant,
            requires_resign=customer_resign,
            signed_version=getattr(user, "delivery_terms_version", "") or "",
            current_version=CUSTOMER_DELIVERY_TERMS_VERSION,
        ),
        "legal_version": LEGAL_VERSION,
        "privacy_version": CUSTOMER_PRIVACY_VERSION,
        "ride_privacy_version": RIDE_PRIVACY_VERSION,
    }
