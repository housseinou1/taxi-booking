"""Legal compliance validation helpers."""

from django.utils import timezone

from legal.constants import (
    COURIER_TERMS_VERSION,
    CUSTOMER_DELIVERY_TERMS_VERSION,
    CUSTOMER_PRIVACY_VERSION,
    DRIVER_AGREEMENT_VERSION,
    MERCHANT_TERMS_VERSION,
    RIDER_PRIVACY_VERSION,
    RIDER_TERMS_VERSION,
    RIDE_PRIVACY_VERSION,
    RIDE_TERMS_VERSION,
)
from taxi.drivers.models import DriverProfile

from .models import LegalComplianceLog


def get_client_ip(request) -> str:
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR") or ""


def courier_has_complete_signature(profile: DriverProfile | None) -> bool:
    if not profile:
        return False
    return bool(
        profile.terms_accepted
        and profile.signature_image
        and (profile.signed_full_name or "").strip()
        and profile.legal_declaration_accepted
    )


def courier_terms_version_current(profile: DriverProfile | None) -> bool:
    if not profile:
        return False
    return (profile.terms_version or "") == COURIER_TERMS_VERSION


def courier_requires_resign(profile: DriverProfile | None) -> bool:
    if not profile or not profile.terms_accepted:
        return False
    return not courier_terms_version_current(profile)


def merchant_has_complete_signature(merchant) -> bool:
    if not merchant:
        return False
    return bool(
        merchant.terms_accepted
        and merchant.signature_image
        and (merchant.signed_full_name or "").strip()
        and merchant.legal_declaration_accepted
    )


def merchant_terms_version_current(merchant) -> bool:
    if not merchant:
        return False
    return (merchant.terms_version or "") == MERCHANT_TERMS_VERSION


def merchant_requires_resign(merchant) -> bool:
    if not merchant or not merchant.terms_accepted:
        return False
    return not merchant_terms_version_current(merchant)


def customer_delivery_terms_current(user) -> bool:
    return bool(
        user.delivery_terms_accepted
        and (getattr(user, "delivery_terms_version", "") or "") == CUSTOMER_DELIVERY_TERMS_VERSION
    )


def customer_privacy_current(user) -> bool:
    return bool(
        getattr(user, "privacy_policy_accepted", False)
        and (getattr(user, "privacy_policy_version", "") or "") == CUSTOMER_PRIVACY_VERSION
    )


def ride_terms_current(user) -> bool:
    return bool(
        getattr(user, "ride_terms_accepted", False)
        and (getattr(user, "ride_terms_version", "") or "") == RIDE_TERMS_VERSION
    )


def ride_privacy_current(user) -> bool:
    version = getattr(user, "privacy_policy_version", "") or ""
    if version in {RIDE_PRIVACY_VERSION, RIDER_PRIVACY_VERSION}:
        return bool(getattr(user, "privacy_policy_accepted", False))
    return customer_privacy_current(user)


def ride_legal_compliance_current(user) -> bool:
    return ride_terms_current(user) and ride_privacy_current(user)


# Backwards-compatible aliases
rider_terms_current = ride_terms_current
rider_privacy_current = ride_privacy_current
rider_legal_compliance_current = ride_legal_compliance_current


def driver_has_complete_signature(profile: DriverProfile | None) -> bool:
    if not profile:
        return False
    return bool(
        profile.driver_terms_accepted
        and profile.driver_signature_image
        and (profile.driver_signed_full_name or "").strip()
        and profile.driver_legal_declaration_accepted
    )


def driver_terms_version_current(profile: DriverProfile | None) -> bool:
    if not profile:
        return False
    return (profile.driver_terms_version or "") == DRIVER_AGREEMENT_VERSION


def driver_requires_terms_resign(profile: DriverProfile | None) -> bool:
    if not profile or not profile.driver_terms_accepted:
        return False
    return not driver_terms_version_current(profile)


def driver_agreement_current(profile) -> bool:
    return driver_has_complete_signature(profile) and driver_terms_version_current(profile)


# Backwards-compatible alias
driver_requires_resign = driver_requires_terms_resign


def serialize_driver_signature(profile, request=None):
    if not profile:
        return {}
    image_url = ""
    if profile.driver_signature_image and request:
        image_url = request.build_absolute_uri(profile.driver_signature_image.url)
    elif profile.driver_signature_image:
        image_url = profile.driver_signature_image.url
    return {
        "driver_terms_accepted": bool(profile.driver_terms_accepted),
        "driver_terms_accepted_at": (
            profile.driver_terms_accepted_at.isoformat() if profile.driver_terms_accepted_at else None
        ),
        "driver_terms_version": profile.driver_terms_version or "",
        "terms_version": profile.driver_terms_version or "",
        "driver_signed_full_name": profile.driver_signed_full_name or "",
        "signed_full_name": profile.driver_signed_full_name or "",
        "signature_image_url": image_url,
        "driver_signed_ip_address": profile.driver_signed_ip_address or "",
        "signed_ip_address": profile.driver_signed_ip_address or "",
        "driver_signed_device_info": profile.driver_signed_device_info or "",
        "signed_device_info": profile.driver_signed_device_info or "",
        "legal_declaration_accepted": bool(profile.driver_legal_declaration_accepted),
        "signature_complete": driver_has_complete_signature(profile),
        "terms_version_current": driver_terms_version_current(profile),
        "agreement_current": driver_agreement_current(profile),
        "requires_resign": driver_requires_terms_resign(profile),
        "current_terms_version": DRIVER_AGREEMENT_VERSION,
        "current_agreement_version": DRIVER_AGREEMENT_VERSION,
    }


serialize_driver_agreement = serialize_driver_signature


def latest_compliance_acceptance(user, agreement_type: str) -> dict:
    """Most recent checkbox/signature metadata from the audit log."""
    if not user:
        return {}
    log = (
        LegalComplianceLog.objects.filter(user=user, agreement_type=agreement_type)
        .order_by("-created_at")
        .first()
    )
    if not log:
        return {}
    ip_address = log.ip_address or ""
    device_info = log.device_info or ""
    accepted_at = log.created_at.isoformat() if log.created_at else None
    return {
        "last_acceptance_ip": ip_address,
        "last_acceptance_device": device_info,
        "last_acceptance_at": accepted_at,
        "signed_ip_address": ip_address,
        "signed_device_info": device_info,
        "signed_app_version": log.app_version or "",
        "last_accepted_at": accepted_at,
    }


def serialize_ride_legal(user, *, include_audit: bool = False):
    if not user:
        return {}
    audit = latest_compliance_acceptance(user, "ride")
    payload = {
        "ride_terms_accepted": bool(getattr(user, "ride_terms_accepted", False)),
        "ride_terms_accepted_at": (
            user.ride_terms_accepted_at.isoformat() if user.ride_terms_accepted_at else None
        ),
        "terms_version": getattr(user, "ride_terms_version", "") or "",
        "privacy_accepted": bool(user.privacy_policy_accepted),
        "privacy_accepted_at": (
            user.privacy_policy_accepted_at.isoformat() if user.privacy_policy_accepted_at else None
        ),
        "privacy_version": user.privacy_policy_version or "",
        "current_terms_version": RIDE_TERMS_VERSION,
        "current_privacy_version": RIDE_PRIVACY_VERSION,
        "compliance_current": ride_legal_compliance_current(user),
        "requires_resign": ride_terms_current(user) is False and bool(user.ride_terms_accepted),
        "last_acceptance_ip": audit.get("last_acceptance_ip") or "",
        "last_acceptance_device": audit.get("last_acceptance_device") or "",
        "last_acceptance_at": audit.get("last_acceptance_at"),
    }
    if include_audit:
        payload.update(audit)
    return payload


# Restore module-level alias after redefining serialize_ride_legal with include_audit
serialize_rider_legal = serialize_ride_legal


def log_compliance_event(
    *,
    user,
    agreement_type: str,
    action: str,
    terms_version: str,
    signed_full_name: str = "",
    signature_image=None,
    ip_address: str = "",
    device_info: str = "",
    app_version: str = "",
    metadata=None,
) -> LegalComplianceLog:
    return LegalComplianceLog.objects.create(
        user=user,
        agreement_type=agreement_type,
        action=action,
        terms_version=terms_version,
        signed_full_name=signed_full_name,
        signature_image=signature_image,
        ip_address=ip_address or None,
        device_info=device_info or "",
        app_version=app_version or "",
        metadata=metadata or {},
    )


def apply_courier_e_sign(profile, *, request, data, signature_file):
    full_name = (data.get("signed_full_name") or "").strip()
    if len(full_name) < 3:
        raise ValueError("Enter your full legal name.")

    declaration = str(data.get("legal_declaration_accepted", "")).lower() in {
        "1",
        "true",
        "yes",
        "on",
    }
    if not declaration:
        raise ValueError("You must accept the legal declaration.")

    scrolled = str(data.get("scrolled_to_bottom", "")).lower() in {"1", "true", "yes", "on"}
    if not scrolled:
        raise ValueError("Scroll to the bottom of the terms before signing.")

    if not signature_file:
        raise ValueError("Draw your signature on the signature pad.")

    terms_version = (data.get("terms_version") or COURIER_TERMS_VERSION).strip()
    now = timezone.now()
    was_resign = bool(profile.terms_accepted and profile.terms_version and profile.terms_version != terms_version)

    profile.terms_accepted = True
    profile.terms_accepted_at = now
    profile.terms_version = terms_version
    profile.signed_full_name = full_name[:200]
    profile.signature_image = signature_file
    profile.signed_ip_address = get_client_ip(request) or None
    profile.signed_device_info = (data.get("signed_device_info") or "")[:500]
    profile.signed_app_version = (data.get("signed_app_version") or "")[:40]
    profile.legal_declaration_accepted = True
    profile.terms_scrolled_to_bottom = True
    profile.save(
        update_fields=[
            "terms_accepted",
            "terms_accepted_at",
            "terms_version",
            "signed_full_name",
            "signature_image",
            "signed_ip_address",
            "signed_device_info",
            "signed_app_version",
            "legal_declaration_accepted",
            "terms_scrolled_to_bottom",
        ]
    )

    log_compliance_event(
        user=profile.user,
        agreement_type="courier",
        action="resign" if was_resign else "e_sign",
        terms_version=terms_version,
        signed_full_name=full_name,
        signature_image=profile.signature_image,
        ip_address=get_client_ip(request),
        device_info=profile.signed_device_info,
        app_version=profile.signed_app_version,
    )
    return profile


def apply_merchant_e_sign(merchant, *, request, data, signature_file):
    full_name = (data.get("signed_full_name") or "").strip()
    if len(full_name) < 3:
        raise ValueError("Enter your full legal name.")

    declaration = str(data.get("legal_declaration_accepted", "")).lower() in {
        "1",
        "true",
        "yes",
        "on",
    }
    if not declaration:
        raise ValueError("You must accept the legal declaration.")

    scrolled = str(data.get("scrolled_to_bottom", "")).lower() in {"1", "true", "yes", "on"}
    if not scrolled:
        raise ValueError("Scroll to the bottom of the terms before signing.")

    if not signature_file:
        raise ValueError("Draw your signature on the signature pad.")

    terms_version = (data.get("terms_version") or MERCHANT_TERMS_VERSION).strip()
    now = timezone.now()

    merchant.terms_accepted = True
    merchant.terms_accepted_at = now
    merchant.terms_version = terms_version
    merchant.signed_full_name = full_name[:200]
    merchant.signature_image = signature_file
    merchant.signed_ip_address = get_client_ip(request) or None
    merchant.signed_device_info = (data.get("signed_device_info") or "")[:500]
    merchant.signed_app_version = (data.get("signed_app_version") or "")[:40]
    merchant.legal_declaration_accepted = True
    merchant.terms_scrolled_to_bottom = True
    merchant.save(
        update_fields=[
            "terms_accepted",
            "terms_accepted_at",
            "terms_version",
            "signed_full_name",
            "signature_image",
            "signed_ip_address",
            "signed_device_info",
            "signed_app_version",
            "legal_declaration_accepted",
            "terms_scrolled_to_bottom",
        ]
    )

    log_compliance_event(
        user=merchant.owner,
        agreement_type="merchant",
        action="e_sign",
        terms_version=terms_version,
        signed_full_name=full_name,
        signature_image=merchant.signature_image,
        ip_address=get_client_ip(request),
        device_info=merchant.signed_device_info,
        app_version=merchant.signed_app_version,
    )
    return merchant


def apply_driver_e_sign(profile, *, request, data, signature_file):
    full_name = (data.get("signed_full_name") or "").strip()
    if len(full_name) < 3:
        raise ValueError("Enter your full legal name.")

    declaration = str(data.get("legal_declaration_accepted", "")).lower() in {
        "1",
        "true",
        "yes",
        "on",
    }
    if not declaration:
        raise ValueError("You must accept the legal declaration.")

    scrolled = str(data.get("scrolled_to_bottom", "")).lower() in {"1", "true", "yes", "on"}
    if not scrolled:
        raise ValueError("Scroll to the bottom of the agreement before signing.")

    if not signature_file:
        raise ValueError("Draw your signature on the signature pad.")

    terms_version = (data.get("terms_version") or DRIVER_AGREEMENT_VERSION).strip()
    now = timezone.now()
    was_resign = bool(
        profile.driver_terms_accepted
        and profile.driver_terms_version
        and profile.driver_terms_version != terms_version
    )

    profile.driver_terms_accepted = True
    profile.driver_terms_accepted_at = now
    profile.driver_terms_version = terms_version
    profile.driver_signed_full_name = full_name[:200]
    profile.driver_signature_image = signature_file
    profile.driver_signed_ip_address = get_client_ip(request) or None
    profile.driver_signed_device_info = (data.get("signed_device_info") or "")[:500]
    profile.driver_signed_app_version = (data.get("signed_app_version") or "")[:40]
    profile.driver_legal_declaration_accepted = True
    profile.driver_terms_scrolled_to_bottom = True
    profile.save(
        update_fields=[
            "driver_terms_accepted",
            "driver_terms_accepted_at",
            "driver_terms_version",
            "driver_signed_full_name",
            "driver_signature_image",
            "driver_signed_ip_address",
            "driver_signed_device_info",
            "driver_signed_app_version",
            "driver_legal_declaration_accepted",
            "driver_terms_scrolled_to_bottom",
        ]
    )

    log_compliance_event(
        user=profile.user,
        agreement_type="driver",
        action="resign" if was_resign else "e_sign",
        terms_version=terms_version,
        signed_full_name=full_name,
        signature_image=profile.driver_signature_image,
        ip_address=get_client_ip(request),
        device_info=profile.driver_signed_device_info,
        app_version=profile.driver_signed_app_version,
    )
    return profile


def serialize_courier_signature(profile, request=None):
    if not profile:
        return {}
    image_url = ""
    if profile.signature_image and request:
        image_url = request.build_absolute_uri(profile.signature_image.url)
    elif profile.signature_image:
        image_url = profile.signature_image.url
    return {
        "terms_accepted": bool(profile.terms_accepted),
        "terms_accepted_at": profile.terms_accepted_at.isoformat() if profile.terms_accepted_at else None,
        "terms_version": profile.terms_version or "",
        "signed_full_name": profile.signed_full_name or "",
        "signature_image_url": image_url,
        "signed_ip_address": profile.signed_ip_address or "",
        "signed_device_info": profile.signed_device_info or "",
        "signed_app_version": profile.signed_app_version or "",
        "legal_declaration_accepted": bool(profile.legal_declaration_accepted),
        "signature_complete": courier_has_complete_signature(profile),
        "terms_version_current": courier_terms_version_current(profile),
        "requires_resign": courier_requires_resign(profile),
        "current_terms_version": COURIER_TERMS_VERSION,
    }


def serialize_merchant_signature(merchant, request=None):
    if not merchant:
        return {}
    image_url = ""
    if merchant.signature_image and request:
        image_url = request.build_absolute_uri(merchant.signature_image.url)
    elif merchant.signature_image:
        image_url = merchant.signature_image.url
    return {
        "terms_accepted": bool(merchant.terms_accepted),
        "terms_accepted_at": merchant.terms_accepted_at.isoformat() if merchant.terms_accepted_at else None,
        "terms_version": merchant.terms_version or "",
        "signed_full_name": merchant.signed_full_name or "",
        "signature_image_url": image_url,
        "signed_ip_address": merchant.signed_ip_address or "",
        "signed_device_info": merchant.signed_device_info or "",
        "signed_app_version": merchant.signed_app_version or "",
        "legal_declaration_accepted": bool(merchant.legal_declaration_accepted),
        "signature_complete": merchant_has_complete_signature(merchant),
        "terms_version_current": merchant_terms_version_current(merchant),
        "requires_resign": merchant_requires_resign(merchant),
        "current_terms_version": MERCHANT_TERMS_VERSION,
    }
