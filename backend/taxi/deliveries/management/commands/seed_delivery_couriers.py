"""
Seed local/dev Delivery courier accounts.

Creates three approved Yala Delivery couriers:
  1. Samba Diara — car
  2. Aly Soumare — bicycle
  3. Haby Camara — motorcycle

SAFETY:
  - Refuses to run when DEBUG is False unless --allow-prod is passed.
  - Idempotent by email.
"""

from datetime import timedelta
from pathlib import Path

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand, CommandError
from django.db.models.signals import post_save
from django.utils import timezone

from cities.models import City, Region
from deliveries.models import DriverDeliverySettings
from legal.constants import COURIER_TERMS_VERSION, DRIVER_AGREEMENT_VERSION
from payments.models import DriverPayoutMethod
from taxi.drivers.models import DriverDocument, DriverProfile
from taxi.drivers.signals import trigger_qr_generation_on_approval

User = get_user_model()

DEFAULT_PASSWORD = "Test1234!"
SIGNATURE_PNG = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde"
    b"\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82"
)

PHOTO_CANDIDATES = [
    Path(r"C:\Users\Housseinou\.cursor\projects\c-Users-Housseinou-Projects-Django-taxi-booking\assets"),
    Path(settings.BASE_DIR) / "media" / "seed_couriers",
]

COURIERS = [
    {
        "first_name": "Samba",
        "last_name": "Diara",
        "email": "samba.diara@yala.mr",
        "phone_number": "+22246821011",
        "national_id_number": "4682101101",
        "gender": "Male",
        "vehicle_type": "car",
        "max_package_size": "large",
        "vehicle_make": "Toyota",
        "vehicle_model": "Corolla",
        "vehicle_color": "White",
        "plate_number": "NKC4811",
        "photo": "samba-diara-profile.png",
    },
    {
        "first_name": "Aly",
        "last_name": "Soumare",
        "email": "aly.soumare@yala.mr",
        "phone_number": "+22246821012",
        "national_id_number": "4682101202",
        "gender": "Male",
        "vehicle_type": "motorcycle",
        "max_package_size": "medium",
        "vehicle_make": "Honda",
        "vehicle_model": "Wave",
        "vehicle_color": "Red",
        "plate_number": "NKC4812",
        "photo": "aly-soumare-profile.png",
    },
    {
        "first_name": "Haby",
        "last_name": "Camara",
        "email": "haby.camara@yala.mr",
        "phone_number": "+22246821013",
        "national_id_number": "4682101303",
        "gender": "Female",
        "vehicle_type": "bicycle",
        "max_package_size": "small",
        "vehicle_make": "",
        "vehicle_model": "",
        "vehicle_color": "",
        "plate_number": "",
        "photo": "haby-camara-profile.png",
    },
]


def _find_photo(filename: str) -> Path | None:
    for folder in PHOTO_CANDIDATES:
        path = folder / filename
        if path.exists():
            return path
    return None


class Command(BaseCommand):
    help = "Seed local Delivery couriers: Samba Diara (car), Aly Soumare (bicycle), Haby Camara (motorcycle)."

    def add_arguments(self, parser):
        parser.add_argument("--allow-prod", action="store_true")
        parser.add_argument("--password", default=DEFAULT_PASSWORD)

    def handle(self, *args, **options):
        if not settings.DEBUG and not options["allow_prod"]:
            raise CommandError(
                "Refusing to seed test couriers because DEBUG is False. "
                "Re-run locally with DJANGO_DEBUG=True, or pass --allow-prod."
            )

        post_save.disconnect(trigger_qr_generation_on_approval, sender=DriverProfile)
        password = options["password"]
        now = timezone.now()
        expires = timezone.localdate() + timedelta(days=400)
        issued = timezone.localdate() - timedelta(days=400)

        region, _ = Region.objects.get_or_create(name="Nouakchott")
        city, _ = City.objects.get_or_create(
            region=region,
            name="Nouakchott",
            defaults={"latitude": 18.0735, "longitude": -15.9582, "is_active": True},
        )

        for row in COURIERS:
            user, created = User.objects.get_or_create(
                email=row["email"],
                defaults={
                    "first_name": row["first_name"],
                    "last_name": row["last_name"],
                    "phone_number": row["phone_number"],
                    "national_id_number": row["national_id_number"],
                    "gender": row["gender"],
                    "user_type": "driver",
                    "rider_status": "approved",
                    "is_active": True,
                    "city": city,
                    "email_verified": True,
                    "phone_verified_at": now,
                },
            )
            if not created and User.objects.filter(
                national_id_number=row["national_id_number"]
            ).exclude(pk=user.pk).exists():
                national_id = row["national_id_number"]
            else:
                national_id = row["national_id_number"]

            user.first_name = row["first_name"]
            user.last_name = row["last_name"]
            user.phone_number = row["phone_number"]
            if not user.national_id_number:
                user.national_id_number = national_id
            user.gender = row["gender"]
            user.user_type = "driver"
            user.is_active = True
            user.city = user.city or city
            user.email_verified = True
            user.phone_verified_at = user.phone_verified_at or now
            user.set_password(password)

            photo_path = _find_photo(row["photo"])
            if photo_path:
                user.profile_picture.save(
                    row["photo"],
                    ContentFile(photo_path.read_bytes()),
                    save=False,
                )
            user.save()

            profile, _ = DriverProfile.objects.get_or_create(
                user=user,
                defaults={
                    "status": "pending",
                    "car_type": "regular",
                    "phone_number": user.phone_number,
                    "vehicle_make": row["vehicle_make"] or "",
                    "vehicle_model": row["vehicle_model"] or "",
                    "vehicle_color": row["vehicle_color"] or "",
                    "vehicle_plate": row["plate_number"] or "",
                    "plate_number": row["plate_number"] or "",
                },
            )
            if not profile.signature_image:
                profile.signature_image.save(
                    f"{user.first_name.lower()}_sig.png",
                    ContentFile(SIGNATURE_PNG),
                    save=True,
                )
            if not profile.driver_signature_image:
                profile.driver_signature_image.save(
                    f"{user.first_name.lower()}_dsig.png",
                    ContentFile(SIGNATURE_PNG),
                    save=True,
                )
            DriverProfile.objects.filter(pk=profile.pk).update(
                status="approved",
                car_type="regular",
                phone_number=user.phone_number,
                vehicle_make=row["vehicle_make"],
                vehicle_model=row["vehicle_model"],
                vehicle_color=row["vehicle_color"],
                vehicle_plate=row["plate_number"],
                plate_number=row["plate_number"],
                terms_accepted=True,
                terms_accepted_at=now,
                terms_version=COURIER_TERMS_VERSION,
                legal_declaration_accepted=True,
                terms_scrolled_to_bottom=True,
                signed_full_name=user.get_full_name(),
                signed_ip_address="127.0.0.1",
                signed_device_info="seed-delivery-couriers",
                driver_terms_accepted=True,
                driver_terms_accepted_at=now,
                driver_terms_version=DRIVER_AGREEMENT_VERSION,
                driver_legal_declaration_accepted=True,
                driver_terms_scrolled_to_bottom=True,
                driver_signed_full_name=user.get_full_name(),
                license_issued_at=issued,
                license_expires_at=expires,
                vehicle_registration_expires_at=expires,
                insurance_expires_at=expires,
            )
            profile.refresh_from_db()

            settings_obj, _ = DriverDeliverySettings.objects.update_or_create(
                driver=user,
                defaults={
                    "delivery_mode_enabled": True,
                    "delivery_vehicle_type": row["vehicle_type"],
                    "max_package_size": row["max_package_size"],
                    "delivery_cities": ["Nouakchott"],
                    "accepts_food": True,
                    "accepts_pharmacy": True,
                    "is_suspended": False,
                },
            )

            doc_types = (
                ("national_id",)
                if row["vehicle_type"] == "bicycle"
                else ("national_id", "license", "carte_grise", "insurance")
            )
            for doc_type in doc_types:
                doc, _ = DriverDocument.objects.get_or_create(
                    driver=profile,
                    document_type=doc_type,
                    defaults={"status": "approved", "expires_at": expires},
                )
                if not doc.file:
                    doc.file.save(
                        f"{user.first_name.lower()}_{doc_type}.jpg",
                        ContentFile(b"seed-delivery-courier-doc"),
                        save=False,
                    )
                doc.status = "approved"
                doc.expires_at = expires
                doc.save()

            if not DriverPayoutMethod.objects.filter(driver=user).exists():
                DriverPayoutMethod.objects.create(
                    driver=user,
                    payout_type="bankily",
                    account_holder_name=user.get_full_name(),
                    phone_number=user.phone_number,
                    wallet_id=user.phone_number,
                    is_default=True,
                    is_verified=True,
                    verified_at=now,
                )

            action = "CREATED" if created else "UPDATED"
            photo_state = "yes" if user.profile_picture else "missing"
            self.stdout.write(
                f"{action} {user.get_full_name()} <{user.email}> "
                f"{settings_obj.delivery_vehicle_type} photo={photo_state} "
                f"status={profile.status}"
            )

        self.stdout.write(self.style.SUCCESS("Delivery courier seed complete."))
        self.stdout.write(f"Shared password: {password}")
