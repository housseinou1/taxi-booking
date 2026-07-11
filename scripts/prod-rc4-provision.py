"""Provision RC4 production QA accounts (run inside django container)."""
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.db.models.signals import post_save
from django.utils import timezone

from cities.models import City, Region
from deliveries.models import Delivery, DriverDeliverySettings
from legal.constants import (
    COURIER_TERMS_VERSION,
    CUSTOMER_DELIVERY_TERMS_VERSION,
    CUSTOMER_PRIVACY_VERSION,
    DRIVER_AGREEMENT_VERSION,
)
from payments.models import DriverPayoutMethod
from taxi.drivers.models import DriverDocument, DriverProfile
from taxi.drivers.signals import trigger_qr_generation_on_approval

User = get_user_model()

ADMIN_EMAIL = "sakho@admin.mr"
ADMIN_PASSWORD = "Admin2026!"
RIDER_EMAIL = "qa-rider-profile-fix@test.local"
RIDER_PHONE = "+22240119999"
COURIER_EMAIL = "qa-driver-final-qa@test.local"
COURIER_PASSWORD = "QaDriverFinal!2026"
COURIER_PHONE = "+22240556677"

MINIMAL_PNG = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00"
    b"\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82"
)

MOTORCYCLE_DOCUMENT_TYPES = ("national_id", "license", "carte_grise", "insurance")
ACTIVE_DELIVERY_STATUSES = (
    "requested",
    "accepted",
    "courier_arriving",
    "picked_up",
    "in_transit",
    "delivering",
    "delivery_exception",
)


def ensure_admin():
    user, created = User.objects.get_or_create(
        email=ADMIN_EMAIL,
        defaults={
            "first_name": "Sakho",
            "last_name": "Admin",
            "is_staff": True,
            "is_superuser": True,
            "is_active": True,
            "user_type": "admin",
        },
    )
    user.is_staff = True
    user.is_superuser = True
    user.is_active = True
    user.set_password(ADMIN_PASSWORD)
    user.save()
    print(f"admin_ready created={created} email={ADMIN_EMAIL}")


def ensure_rider_phone_verified():
    user = User.objects.filter(email=RIDER_EMAIL).first()
    if not user:
        print(f"rider_missing email={RIDER_EMAIL}")
        return
    if not user.phone_number:
        user.phone_number = RIDER_PHONE
    user.phone_verified_at = timezone.now()
    user.delivery_terms_accepted = True
    user.delivery_terms_accepted_at = timezone.now()
    user.delivery_terms_version = CUSTOMER_DELIVERY_TERMS_VERSION
    user.privacy_policy_accepted = True
    user.privacy_policy_accepted_at = timezone.now()
    user.privacy_policy_version = CUSTOMER_PRIVACY_VERSION
    user.save(
        update_fields=[
            "phone_number",
            "phone_verified_at",
            "delivery_terms_accepted",
            "delivery_terms_accepted_at",
            "delivery_terms_version",
            "privacy_policy_accepted",
            "privacy_policy_accepted_at",
            "privacy_policy_version",
        ]
    )
    print(
        f"rider_phone_verified email={RIDER_EMAIL} "
        f"phone={user.phone_number} verified={bool(user.phone_verified_at)}"
    )


def _get_nouakchott_city():
    region, _ = Region.objects.get_or_create(name="Nouakchott")
    city, _ = City.objects.get_or_create(
        region=region,
        name="Nouakchott",
        defaults={"latitude": 18.0735, "longitude": -15.9582},
    )
    return city


def ensure_courier_ready():
    city = _get_nouakchott_city()
    user, created = User.objects.get_or_create(
        email=COURIER_EMAIL,
        defaults={
            "first_name": "QA",
            "last_name": "Courier",
            "phone_number": COURIER_PHONE,
            "user_type": "driver",
            "city": city,
            "national_id_number": "1234567890",
        },
    )
    user.user_type = "driver"
    user.first_name = user.first_name or "QA"
    user.last_name = user.last_name or "Courier"
    user.phone_number = user.phone_number or COURIER_PHONE
    user.phone_verified_at = timezone.now()
    user.city = city
    user.national_id_number = user.national_id_number or "1234567890"
    user.set_password(COURIER_PASSWORD)
    user.save(
        update_fields=[
            "user_type",
            "first_name",
            "last_name",
            "phone_number",
            "phone_verified_at",
            "city",
            "national_id_number",
            "password",
        ]
    )

    profile, _ = DriverProfile.objects.get_or_create(
        user=user,
        defaults={
            "plate_number": "QA-RC4",
            "vehicle_plate": "QA-RC4",
            "vehicle_make": "Yala",
            "vehicle_model": "Moto",
            "vehicle_color": "Green",
        },
    )
    profile.status = "approved"
    profile.vehicle_make = "Yala"
    profile.vehicle_model = "Moto"
    profile.vehicle_color = "Green"
    profile.plate_number = "QA-RC4"
    profile.vehicle_plate = "QA-RC4"
    profile.terms_accepted = True
    profile.terms_accepted_at = timezone.now()
    profile.terms_version = COURIER_TERMS_VERSION
    profile.signed_full_name = f"{user.first_name} {user.last_name}".strip()
    profile.signed_ip_address = "127.0.0.1"
    profile.signed_device_info = "RC4 provision"
    profile.legal_declaration_accepted = True
    profile.terms_scrolled_to_bottom = True
    profile.driver_terms_accepted = True
    profile.driver_terms_accepted_at = timezone.now()
    profile.driver_terms_version = DRIVER_AGREEMENT_VERSION
    profile.driver_signed_full_name = f"{user.first_name} {user.last_name}".strip()
    profile.driver_signed_ip_address = "127.0.0.1"
    profile.driver_signed_device_info = "RC4 provision"
    profile.driver_legal_declaration_accepted = True
    profile.driver_terms_scrolled_to_bottom = True
    if not profile.signature_image:
        profile.signature_image.save(
            "qa-courier-signature.png",
            ContentFile(MINIMAL_PNG),
            save=False,
        )
    if not profile.driver_signature_image:
        profile.driver_signature_image.save(
            "qa-driver-signature.png",
            ContentFile(MINIMAL_PNG),
            save=False,
        )
    post_save.disconnect(trigger_qr_generation_on_approval, sender=DriverProfile)
    try:
        profile.save()
    finally:
        post_save.connect(trigger_qr_generation_on_approval, sender=DriverProfile)

    settings_obj, _ = DriverDeliverySettings.objects.get_or_create(driver=user)
    settings_obj.delivery_mode_enabled = True
    settings_obj.delivery_vehicle_type = "motorcycle"
    settings_obj.is_suspended = False
    settings_obj.suspension_reason = ""
    settings_obj.save(
        update_fields=[
            "delivery_mode_enabled",
            "delivery_vehicle_type",
            "is_suspended",
            "suspension_reason",
        ]
    )

    DriverPayoutMethod.objects.get_or_create(
        driver=user,
        defaults={
            "payout_type": "bank_account",
            "account_holder_name": f"{user.first_name} {user.last_name}".strip(),
            "bank_name": "Yala Bank",
            "account_reference": "QA-COURIER-RC4",
        },
    )

    expires_at = timezone.now().date() + timedelta(days=365)
    for document_type in MOTORCYCLE_DOCUMENT_TYPES:
        document, created = DriverDocument.objects.get_or_create(
            driver=profile,
            document_type=document_type,
            defaults={
                "status": "approved",
                "expires_at": expires_at,
            },
        )
        if not document.file:
            document.file.save(
                f"qa-{document_type}.png",
                ContentFile(MINIMAL_PNG),
                save=False,
            )
        document.status = "approved"
        document.expires_at = expires_at
        document.save()

    from deliveries.courier_onboarding import build_courier_onboarding_state

    state = build_courier_onboarding_state(user)
    print(
        f"courier_ready email={COURIER_EMAIL} "
        f"created={created} "
        f"ready={state['ready']} can_deliver={state['can_deliver']} "
        f"message={state['message']!r}"
    )


def cleanup_stale_qa_deliveries():
    rider = User.objects.filter(email=RIDER_EMAIL).first()
    courier = User.objects.filter(email=COURIER_EMAIL).first()
    cancelled = 0
    for customer in [rider, courier]:
        if not customer:
            continue
        for delivery in Delivery.objects.filter(
            customer=customer, status__in=ACTIVE_DELIVERY_STATUSES
        ):
            delivery.status = "cancelled"
            delivery.save(update_fields=["status"])
            cancelled += 1
    if courier:
        for delivery in Delivery.objects.filter(
            driver=courier, status__in=ACTIVE_DELIVERY_STATUSES
        ):
            delivery.status = "cancelled"
            delivery.save(update_fields=["status"])
            cancelled += 1
    print(f"qa_deliveries_cancelled count={cancelled}")


ensure_admin()
ensure_rider_phone_verified()
ensure_courier_ready()
cleanup_stale_qa_deliveries()
