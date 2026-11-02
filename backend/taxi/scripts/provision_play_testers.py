"""
Provision three dedicated Google Play closed-testing accounts.

Usage (run INSIDE the Django container, DJANGO_SETTINGS_MODULE=taxi.settings):

    RIDER_PW=<pw> DRIVER_PW=<pw> DELIVERY_PW=<pw> ALLOW_PROD=1 \\
        python scripts/provision_play_testers.py

SAFETY:
  - Passwords come from environment variables only — never hardcoded.
  - Idempotent by email. Rider from the partial first run is reused, not deleted.
  - Only the three play-tester emails are created or refreshed.
  - File attachments use fields that actually exist on User / DriverProfile.
  - National ID files belong on User.national_id_document, not DriverProfile.
  - ALLOW_PROD=1 is required when DEBUG=False.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

# scripts/ lives under the Django project root (/app in production).
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "taxi.settings")

import django

django.setup()

from datetime import timedelta

from django.conf import settings
from django.contrib.auth import authenticate, get_user_model
from django.core.files.base import ContentFile
from django.db.models.signals import post_save
from django.utils import timezone

from cities.models import City, Region
from deliveries.courier_onboarding import (
    courier_delivery_blocked_message,
    get_required_courier_document_types,
)
from deliveries.models import DriverDeliverySettings
from legal.constants import (
    COURIER_TERMS_VERSION,
    DRIVER_AGREEMENT_VERSION,
    RIDE_TERMS_VERSION,
    RIDER_PRIVACY_VERSION,
)
from payments.models import DriverPayoutMethod
from taxi.drivers.driver_code import ensure_driver_code
from taxi.drivers.models import DriverDocument, DriverProfile
from taxi.drivers.services.document_service import REQUIRED_DOCUMENT_TYPES, DocumentService
from taxi.rides.models import Ride
from taxi.rides.views import approved_driver_error

try:
    from taxi.drivers.signals import trigger_qr_generation_on_approval

    post_save.disconnect(trigger_qr_generation_on_approval, sender=DriverProfile)
except Exception:
    pass

if not settings.DEBUG and os.environ.get("ALLOW_PROD") != "1":
    print("ERROR: DEBUG=False (production). Set ALLOW_PROD=1 to confirm.")
    sys.exit(1)

RIDER_PW = os.environ.get("RIDER_PW", "")
DRIVER_PW = os.environ.get("DRIVER_PW", "")
DELIVERY_PW = os.environ.get("DELIVERY_PW", "")

if not all([RIDER_PW, DRIVER_PW, DELIVERY_PW]):
    print("ERROR: Set RIDER_PW, DRIVER_PW, and DELIVERY_PW environment variables.")
    sys.exit(1)

User = get_user_model()
now = timezone.now()
future = timezone.localdate() + timedelta(days=730)
issued = timezone.localdate() - timedelta(days=365)

region, _ = Region.objects.get_or_create(name="Nouakchott")
city, _ = City.objects.get_or_create(
    region=region,
    name="Nouakchott",
    defaults={"latitude": 18.0735, "longitude": -15.9582, "is_active": True},
)

_FAKE_JPG = (
    b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00"
    b"\xff\xdb\x00C\x00\x08\x06\x06\x07\x06\x05\x08\x07\x07\x07\t\t"
    b"\x08\n\x0c\x14\r\x0c\x0b\x0b\x0c\x19\x12\x13\x0f\x14\x1d\x1a"
    b"\x1f\x1e\x1d\x1a\x1c\x1c $.' \",#\x1c\x1c(7),01444\x1f'9=82<.342\x1e\xff\xd9"
)
_FAKE_PNG = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00"
    b"\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82"
)

OPEN_STATUSES = [
    "requested",
    "scheduled",
    "driver_arriving",
    "driver_arrived",
    "in_progress",
]

RIDER_EMAIL = "rider.tester@yalataxi.live"
DRIVER_EMAIL = "driver.tester@yalataxi.live"
DELIVERY_EMAIL = "delivery.tester@yalataxi.live"

TESTER_EMAILS = {RIDER_EMAIL, DRIVER_EMAIL, DELIVERY_EMAIL}


def concrete_field_names(model):
    return {field.name for field in model._meta.concrete_fields}


def filter_existing(model, data):
    names = concrete_field_names(model)
    return {key: value for key, value in data.items() if key in names}


def attach_file(instance, field_name, filename, content):
    """Attach a placeholder file only if the model field exists and is empty."""
    if field_name not in concrete_field_names(instance.__class__):
        return False
    field = getattr(instance, field_name)
    if field:
        return False
    field.save(filename, ContentFile(content), save=False)
    return True


def unique_national_id(preferred, owner=None):
    value = preferred
    suffix = 0
    qs = User.objects.filter(national_id_number=value)
    if owner is not None:
        qs = qs.exclude(pk=owner.pk)
    while qs.exists():
        suffix += 1
        value = str(int(preferred) + suffix).zfill(10)
        qs = User.objects.filter(national_id_number=value)
        if owner is not None:
            qs = qs.exclude(pk=owner.pk)
    return value


def upsert_tester_user(email, defaults):
    user, created = User.objects.get_or_create(email=email, defaults=filter_existing(User, defaults))
    if email not in TESTER_EMAILS:
        raise RuntimeError(f"Refusing to modify non-tester user {email}")
    payload = filter_existing(User, defaults)
    for key, value in payload.items():
        if key in {"email"}:
            continue
        # Keep an existing national ID on the reused Rider (and any re-run).
        if key == "national_id_number" and getattr(user, "national_id_number", None):
            continue
        setattr(user, key, value)
    return user, created


def approve_profile(profile, extra):
    """Persist files while pending, then approve via QuerySet.update (no QR signal)."""
    # Saving an already-approved profile would fire the QR Celery task.
    profile.status = "pending"
    profile.save()

    ensure_driver_code(profile)
    payload = filter_existing(
        DriverProfile,
        {
            "status": "approved",
            "is_available": False,
            "driver_code": profile.driver_code,
            **extra,
        },
    )
    DriverProfile.objects.filter(pk=profile.pk).update(**payload)
    profile.refresh_from_db()
    return profile


def ensure_documents(profile, document_types):
    valid_types = {choice[0] for choice in DriverDocument.DOCUMENT_TYPES}
    for doc_type in document_types:
        if doc_type not in valid_types:
            continue
        doc = DriverDocument.objects.filter(driver=profile, document_type=doc_type).first()
        if doc is None:
            doc = DriverDocument(
                **filter_existing(
                    DriverDocument,
                    {
                        "driver": profile,
                        "document_type": doc_type,
                        "status": "approved",
                        "expires_at": future,
                        "issued_at": issued,
                    },
                )
            )
            doc.file.save(
                f"play_tester_{profile.pk}_{doc_type}.jpg",
                ContentFile(_FAKE_JPG),
                save=True,
            )
        elif not doc.file:
            doc.file.save(
                f"play_tester_{profile.pk}_{doc_type}.jpg",
                ContentFile(_FAKE_JPG),
                save=True,
            )
        doc.status = "approved"
        if "expires_at" in concrete_field_names(DriverDocument):
            doc.expires_at = future
        if "issued_at" in concrete_field_names(DriverDocument):
            doc.issued_at = issued
        doc.save()


def ensure_payout(user, holder_name, phone):
    if DriverPayoutMethod.objects.filter(driver=user).exists():
        return
    DriverPayoutMethod.objects.create(
        **filter_existing(
            DriverPayoutMethod,
            {
                "driver": user,
                "payout_type": "bankily",
                "account_holder_name": holder_name,
                "phone_number": phone,
                "wallet_id": phone,
                "is_default": True,
                "is_verified": True,
                "verified_at": now,
            },
        )
    )


# ── 1. RIDER (already created on the partial production run) ──────────────────
rider_user, rider_created = upsert_tester_user(
    RIDER_EMAIL,
    {
        "first_name": "Yala Rider",
        "last_name": "Tester",
        "phone_number": "+22200009001",
        "gender": "Male",
        "user_type": "rider",
        "rider_status": "approved",
        "is_active": True,
        "city": city,
        "email_verified": True,
        "phone_verified_at": now,
        "ride_terms_accepted": True,
        "ride_terms_accepted_at": now,
        "ride_terms_version": RIDE_TERMS_VERSION,
        "privacy_policy_accepted": True,
        "privacy_policy_accepted_at": now,
        "privacy_policy_version": RIDER_PRIVACY_VERSION,
    },
)
if not rider_user.national_id_number:
    rider_user.national_id_number = unique_national_id("9000000001", rider_user)
rider_user.rider_status = "approved"
rider_user.is_active = True
rider_user.user_type = "rider"
rider_user.city = rider_user.city or city
rider_user.phone_verified_at = rider_user.phone_verified_at or now
rider_user.set_password(RIDER_PW)
attach_file(rider_user, "national_id_document", "rider_tester_national_id.jpg", _FAKE_JPG)
attach_file(rider_user, "profile_picture", "rider_tester_photo.jpg", _FAKE_JPG)
rider_user.save()

for ride in Ride.objects.filter(rider=rider_user, status__in=OPEN_STATUSES):
    ride.status = "cancelled"
    ride.cancelled_by = "system"
    ride.cancellation_reason = "Play tester account reset"
    ride.save(update_fields=["status", "cancelled_by", "cancellation_reason"])

print(
    f"RIDER   | {RIDER_EMAIL} | created={rider_created} | "
    f"status={rider_user.rider_status} | active={rider_user.is_active}"
)


# ── 2. DRIVER ────────────────────────────────────────────────────────────────
driver_user, driver_created = upsert_tester_user(
    DRIVER_EMAIL,
    {
        "first_name": "Yala Driver",
        "last_name": "Tester",
        "phone_number": "+22200009002",
        "gender": "Male",
        "user_type": "driver",
        "rider_status": "approved",
        "is_active": True,
        "city": city,
        "email_verified": True,
        "phone_verified_at": now,
        "privacy_policy_accepted": True,
        "privacy_policy_accepted_at": now,
        "privacy_policy_version": RIDER_PRIVACY_VERSION,
    },
)
if not driver_user.national_id_number:
    driver_user.national_id_number = unique_national_id("9000000002", driver_user)
driver_user.user_type = "driver"
driver_user.is_active = True
driver_user.city = driver_user.city or city
driver_user.phone_verified_at = driver_user.phone_verified_at or now
driver_user.set_password(DRIVER_PW)
attach_file(driver_user, "national_id_document", "driver_tester_national_id.jpg", _FAKE_JPG)
attach_file(driver_user, "profile_picture", "driver_tester_photo.jpg", _FAKE_JPG)
driver_user.save()

drv_profile, _ = DriverProfile.objects.get_or_create(
    user=driver_user,
    defaults=filter_existing(
        DriverProfile,
        {
            "status": "pending",
            "phone_number": "+22200009002",
            "vehicle_make": "Toyota",
            "vehicle_model": "Hilux",
            "vehicle_color": "White",
            "plate_number": "YDR-TEST-001",
            "vehicle_plate": "YDR-TEST-001",
            "car_type": "regular",
        },
    ),
)

attach_file(drv_profile, "driver_photo", "drv_tester_photo.jpg", _FAKE_JPG)
attach_file(drv_profile, "vehicle_photo", "drv_tester_vehicle.jpg", _FAKE_JPG)
attach_file(drv_profile, "license_file", "drv_tester_license.jpg", _FAKE_JPG)
attach_file(drv_profile, "vehicle_registration", "drv_tester_registration.jpg", _FAKE_JPG)
attach_file(drv_profile, "insurance_document", "drv_tester_insurance.jpg", _FAKE_JPG)
attach_file(drv_profile, "vignette_document", "drv_tester_vignette.jpg", _FAKE_JPG)
attach_file(drv_profile, "signature_image", "drv_tester_sig.png", _FAKE_PNG)
attach_file(drv_profile, "driver_signature_image", "drv_tester_dsig.png", _FAKE_PNG)

approve_profile(
    drv_profile,
    {
        "phone_number": "+22200009002",
        "vehicle_make": "Toyota",
        "vehicle_model": "Hilux",
        "vehicle_color": "White",
        "plate_number": "YDR-TEST-001",
        "vehicle_plate": "YDR-TEST-001",
        "car_type": "regular",
        "license_status": "approved",
        "insurance_status": "approved",
        "vignette_status": "approved",
        "registration_status": "approved",
        "photo_status": "approved",
        "license_issued_at": issued,
        "license_expires_at": future,
        "vehicle_registration_expires_at": future,
        "insurance_expires_at": future,
        "vignette_expires_at": future,
        "terms_accepted": True,
        "terms_accepted_at": now,
        "terms_version": COURIER_TERMS_VERSION,
        "legal_declaration_accepted": True,
        "terms_scrolled_to_bottom": True,
        "signed_full_name": "Yala Driver Tester",
        "signed_ip_address": "127.0.0.1",
        "signed_device_info": "play-tester-provision",
        "driver_terms_accepted": True,
        "driver_terms_accepted_at": now,
        "driver_terms_version": DRIVER_AGREEMENT_VERSION,
        "driver_legal_declaration_accepted": True,
        "driver_terms_scrolled_to_bottom": True,
        "driver_signed_full_name": "Yala Driver Tester",
        "driver_signed_device_info": "play-tester-provision",
        "driver_signed_ip_address": "127.0.0.1",
    },
)
ensure_documents(drv_profile, REQUIRED_DOCUMENT_TYPES)
ensure_payout(driver_user, "Yala Driver Tester", "+22200009002")

print(
    f"DRIVER  | {DRIVER_EMAIL} | created={driver_created} | "
    f"status={drv_profile.status} | code={drv_profile.driver_code} | "
    f"active={driver_user.is_active}"
)


# ── 3. DELIVERY / COURIER ─────────────────────────────────────────────────────
DELIVERY_VEHICLE_TYPE = "motorcycle"

delivery_user, delivery_created = upsert_tester_user(
    DELIVERY_EMAIL,
    {
        "first_name": "Yala Delivery",
        "last_name": "Tester",
        "phone_number": "+22200009003",
        "gender": "Male",
        "user_type": "driver",
        "rider_status": "approved",
        "is_active": True,
        "city": city,
        "email_verified": True,
        "phone_verified_at": now,
        "delivery_terms_accepted": True,
        "delivery_terms_accepted_at": now,
        "delivery_terms_version": COURIER_TERMS_VERSION,
        "privacy_policy_accepted": True,
        "privacy_policy_accepted_at": now,
        "privacy_policy_version": RIDER_PRIVACY_VERSION,
    },
)
if not delivery_user.national_id_number:
    delivery_user.national_id_number = unique_national_id("9000000003", delivery_user)
delivery_user.user_type = "driver"
delivery_user.is_active = True
delivery_user.city = delivery_user.city or city
delivery_user.phone_verified_at = delivery_user.phone_verified_at or now
delivery_user.set_password(DELIVERY_PW)
attach_file(delivery_user, "national_id_document", "delivery_tester_national_id.jpg", _FAKE_JPG)
attach_file(delivery_user, "profile_picture", "delivery_tester_photo.jpg", _FAKE_JPG)
delivery_user.save()

del_profile, _ = DriverProfile.objects.get_or_create(
    user=delivery_user,
    defaults=filter_existing(
        DriverProfile,
        {
            "status": "pending",
            "phone_number": "+22200009003",
            "vehicle_make": "Honda",
            "vehicle_model": "Wave",
            "vehicle_color": "Red",
            "plate_number": "YDEL-TEST-001",
            "vehicle_plate": "YDEL-TEST-001",
            "car_type": "regular",
        },
    ),
)

attach_file(del_profile, "driver_photo", "del_tester_photo.jpg", _FAKE_JPG)
attach_file(del_profile, "vehicle_photo", "del_tester_vehicle.jpg", _FAKE_JPG)
attach_file(del_profile, "license_file", "del_tester_license.jpg", _FAKE_JPG)
attach_file(del_profile, "vehicle_registration", "del_tester_registration.jpg", _FAKE_JPG)
attach_file(del_profile, "insurance_document", "del_tester_insurance.jpg", _FAKE_JPG)
attach_file(del_profile, "vignette_document", "del_tester_vignette.jpg", _FAKE_JPG)
attach_file(del_profile, "signature_image", "del_tester_sig.png", _FAKE_PNG)
attach_file(del_profile, "driver_signature_image", "del_tester_dsig.png", _FAKE_PNG)

approve_profile(
    del_profile,
    {
        "phone_number": "+22200009003",
        "vehicle_make": "Honda",
        "vehicle_model": "Wave",
        "vehicle_color": "Red",
        "plate_number": "YDEL-TEST-001",
        "vehicle_plate": "YDEL-TEST-001",
        "car_type": "regular",
        "license_status": "approved",
        "insurance_status": "approved",
        "vignette_status": "approved",
        "registration_status": "approved",
        "photo_status": "approved",
        "license_issued_at": issued,
        "license_expires_at": future,
        "vehicle_registration_expires_at": future,
        "insurance_expires_at": future,
        "vignette_expires_at": future,
        "terms_accepted": True,
        "terms_accepted_at": now,
        "terms_version": COURIER_TERMS_VERSION,
        "legal_declaration_accepted": True,
        "terms_scrolled_to_bottom": True,
        "signed_full_name": "Yala Delivery Tester",
        "signed_ip_address": "127.0.0.1",
        "signed_device_info": "play-tester-provision",
        "driver_terms_accepted": True,
        "driver_terms_accepted_at": now,
        "driver_terms_version": DRIVER_AGREEMENT_VERSION,
        "driver_legal_declaration_accepted": True,
        "driver_terms_scrolled_to_bottom": True,
        "driver_signed_full_name": "Yala Delivery Tester",
        "driver_signed_device_info": "play-tester-provision",
        "driver_signed_ip_address": "127.0.0.1",
    },
)
ensure_documents(del_profile, get_required_courier_document_types(DELIVERY_VEHICLE_TYPE))
DriverDeliverySettings.objects.update_or_create(
    driver=delivery_user,
    defaults=filter_existing(
        DriverDeliverySettings,
        {
            "delivery_mode_enabled": False,
            "delivery_vehicle_type": DELIVERY_VEHICLE_TYPE,
            "max_package_size": "medium",
            "delivery_cities": ["Nouakchott"],
            "accepts_food": True,
            "accepts_pharmacy": True,
            "is_suspended": False,
        },
    ),
)
ensure_payout(delivery_user, "Yala Delivery Tester", "+22200009003")

print(
    f"DELIVERY| {DELIVERY_EMAIL} | created={delivery_created} | "
    f"status={del_profile.status} | code={del_profile.driver_code} | "
    f"active={delivery_user.is_active}"
)


# ── Verification ──────────────────────────────────────────────────────────────
print("\n── Login verification ──────────────────────────────────────────")
all_ok = True
for email, password, label in [
    (RIDER_EMAIL, RIDER_PW, "RIDER   "),
    (DRIVER_EMAIL, DRIVER_PW, "DRIVER  "),
    (DELIVERY_EMAIL, DELIVERY_PW, "DELIVERY"),
]:
    auth_user = authenticate(username=email, password=password)
    if auth_user and auth_user.is_active:
        print(f"{label} | {email} | LOGIN OK | active={auth_user.is_active}")
    else:
        print(f"{label} | {email} | LOGIN FAIL")
        all_ok = False

drv_profile.refresh_from_db()
del_profile.refresh_from_db()
driver_user.refresh_from_db()
delivery_user.refresh_from_db()
rider_user.refresh_from_db()

drv_docs_state = DocumentService().get_documents_review_state(drv_profile)
drv_blocked = approved_driver_error(driver_user)
del_blocked = courier_delivery_blocked_message(delivery_user)
del_settings = DriverDeliverySettings.objects.get(driver=delivery_user)

print("\n── Profile readiness ───────────────────────────────────────────")
print(
    f"DRIVER  | profile.status={drv_profile.status} | code={drv_profile.driver_code} | "
    f"docs_block_online={drv_docs_state.get('documents_block_online')} | "
    f"missing={drv_docs_state.get('missing_document_types')} | "
    f"driver_terms={drv_profile.driver_terms_accepted}"
)
print(
    f"DELIVERY| profile.status={del_profile.status} | code={del_profile.driver_code} | "
    f"vehicle={del_settings.delivery_vehicle_type} | "
    f"suspended={del_settings.is_suspended} | "
    f"courier_terms={del_profile.terms_accepted}"
)
print(f"RIDER   | status={rider_user.rider_status} | active={rider_user.is_active}")

print(f"\nDRIVER  | go-online blocked: '{drv_blocked or 'none'}'")
print(f"DELIVERY| go-online blocked: '{del_blocked or 'none'}'")

driver_ready = (
    drv_profile.status == "approved"
    and driver_user.is_active
    and not drv_docs_state.get("documents_block_online")
    and not drv_blocked
)
delivery_ready = (
    del_profile.status == "approved"
    and delivery_user.is_active
    and not del_settings.is_suspended
    and not del_blocked
)
print(f"\nDRIVER  | READY={driver_ready}")
print(f"DELIVERY| READY={delivery_ready}")
print(f"RIDER   | ACTIVE={rider_user.is_active and rider_user.rider_status == 'approved'}")
print("\nPasswords NOT printed. Provide via secure channel only.")
print(f"\nAll logins OK: {all_ok}")
if not (all_ok and driver_ready and delivery_ready and rider_user.is_active):
    sys.exit(2)
