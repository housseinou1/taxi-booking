"""
Seed isolated Pilot / UAT accounts (synthetic data only — no production PII).

Defaults:
  75 riders · 25 drivers · 15 couriers · staff roles (CEO/Ops/Finance/Support)

Usage:
  python manage.py seed_pilot_uat
  python manage.py seed_pilot_uat --riders 50 --drivers 20 --couriers 10
  python manage.py seed_pilot_uat --password 'PilotUAT2026!'
  python manage.py seed_pilot_uat --dry-run
"""

from __future__ import annotations

from datetime import timedelta

from django.contrib.auth.models import Group
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from authapp.models import User
from deliveries.models import DriverDeliverySettings
from django.core.files.base import ContentFile
from legal.constants import COURIER_TERMS_VERSION, DRIVER_AGREEMENT_VERSION
from taxi.drivers.models import DriverDocument, DriverProfile
from taxi.drivers.services.document_service import REQUIRED_DOCUMENT_TYPES

PILOT_SIGNATURE_PNG = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde"
    b"\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82"
)

PILOT_PASSWORD_DEFAULT = "PilotUAT2026!"
EMAIL_DOMAIN = "pilot.yala.test"

STAFF_SEEDS = [
    {"email": f"ceo@{EMAIL_DOMAIN}", "first_name": "Aicha", "last_name": "PilotCEO", "groups": ["CEO", "Super Admin"]},
    {"email": f"ops1@{EMAIL_DOMAIN}", "first_name": "Omar", "last_name": "PilotOps", "groups": ["Operations Manager"]},
    {"email": f"ops2@{EMAIL_DOMAIN}", "first_name": "Fatim", "last_name": "PilotOps", "groups": ["Supervisor"]},
    {"email": f"finance1@{EMAIL_DOMAIN}", "first_name": "Sidi", "last_name": "PilotFin", "groups": ["Finance"]},
    {"email": f"finance2@{EMAIL_DOMAIN}", "first_name": "Mariem", "last_name": "PilotFin", "groups": ["Accountant"]},
    {"email": f"support1@{EMAIL_DOMAIN}", "first_name": "Yahya", "last_name": "PilotSup", "groups": ["Support"]},
    {"email": f"support2@{EMAIL_DOMAIN}", "first_name": "Hawa", "last_name": "PilotSup", "groups": ["Support"]},
    {"email": f"support3@{EMAIL_DOMAIN}", "first_name": "Bilal", "last_name": "PilotSup", "groups": ["Support"]},
    {"email": f"sysadmin@{EMAIL_DOMAIN}", "first_name": "Khadija", "last_name": "PilotSys", "groups": ["Platform Admin"]},
]

FIRST_NAMES = [
    "Aminata", "Moussa", "Khady", "Ibrahim", "Aissata", "Cheikh", "Marieme", "Abdoul",
    "Ndeye", "Oumar", "Rama", "Bacar", "Safietou", "Mamadou", "Coumba",
]
LAST_NAMES = [
    "Diallo", "Ba", "Sow", "Sy", "Kane", "Ndiaye", "Fall", "Gueye", "Diop", "Sarr",
]


class Command(BaseCommand):
    help = "Seed Pilot/UAT synthetic riders, drivers, couriers, and staff."

    def add_arguments(self, parser):
        parser.add_argument("--riders", type=int, default=75)
        parser.add_argument("--drivers", type=int, default=25)
        parser.add_argument("--couriers", type=int, default=15)
        parser.add_argument("--password", default=PILOT_PASSWORD_DEFAULT)
        parser.add_argument("--dry-run", action="store_true")
        parser.add_argument(
            "--approve-drivers",
            action="store_true",
            default=True,
            help="Mark seeded drivers/couriers approved (default True).",
        )
        parser.add_argument("--pending-drivers", action="store_true", help="Leave drivers pending approval.")

    def handle(self, *args, **options):
        riders_n = max(0, min(options["riders"], 100))
        drivers_n = max(0, min(options["drivers"], 30))
        couriers_n = max(0, min(options["couriers"], 20))
        password = options["password"]
        approve = not options["pending_drivers"]
        dry = options["dry_run"]

        self.stdout.write(
            f"Pilot seed plan: riders={riders_n} drivers={drivers_n} couriers={couriers_n} "
            f"staff={len(STAFF_SEEDS)} approve={approve} dry_run={dry}"
        )
        if dry:
            self.stdout.write(self.style.WARNING("DRY RUN — no writes"))
            return

        now = timezone.now()
        issued = timezone.localdate() - timedelta(days=400)
        expires = timezone.localdate() + timedelta(days=400)

        with transaction.atomic():
            for group_name in {
                g for row in STAFF_SEEDS for g in row["groups"]
            } | {"Support", "Finance", "Accountant", "Operations Manager", "Supervisor", "CEO", "Super Admin", "Platform Admin"}:
                Group.objects.get_or_create(name=group_name)

            staff_created = 0
            for row in STAFF_SEEDS:
                user, created = self._upsert_user(
                    email=row["email"],
                    first_name=row["first_name"],
                    last_name=row["last_name"],
                    password=password,
                    user_type="rider",
                    is_staff=True,
                    phone_suffix=9000 + staff_created,
                    now=now,
                )
                for gname in row["groups"]:
                    user.groups.add(Group.objects.get(name=gname))
                if created:
                    staff_created += 1

            rider_created = 0
            for i in range(1, riders_n + 1):
                email = f"rider{i:03d}@{EMAIL_DOMAIN}"
                _, created = self._upsert_user(
                    email=email,
                    first_name=FIRST_NAMES[i % len(FIRST_NAMES)],
                    last_name=LAST_NAMES[i % len(LAST_NAMES)],
                    password=password,
                    user_type="rider",
                    is_staff=False,
                    phone_suffix=1000 + i,
                    now=now,
                    rider_status="approved",
                )
                if created:
                    rider_created += 1

            driver_created = 0
            for i in range(1, drivers_n + 1):
                email = f"driver{i:03d}@{EMAIL_DOMAIN}"
                user, created = self._upsert_user(
                    email=email,
                    first_name=FIRST_NAMES[i % len(FIRST_NAMES)],
                    last_name=LAST_NAMES[(i + 3) % len(LAST_NAMES)],
                    password=password,
                    user_type="driver",
                    is_staff=False,
                    phone_suffix=2000 + i,
                    now=now,
                    rider_status="approved",
                )
                self._upsert_driver_profile(
                    user,
                    plate=f"PILOT-{i:03d}",
                    status="approved" if approve else "pending",
                    issued=issued,
                    expires=expires,
                    now=now,
                    available=False,
                )
                self._ensure_approved_documents(user, expires=expires)
                self._ensure_driver_esign(user)
                if created:
                    driver_created += 1

            courier_created = 0
            for i in range(1, couriers_n + 1):
                email = f"courier{i:03d}@{EMAIL_DOMAIN}"
                user, created = self._upsert_user(
                    email=email,
                    first_name=FIRST_NAMES[(i + 5) % len(FIRST_NAMES)],
                    last_name=LAST_NAMES[(i + 7) % len(LAST_NAMES)],
                    password=password,
                    user_type="driver",
                    is_staff=False,
                    phone_suffix=3000 + i,
                    now=now,
                    rider_status="approved",
                )
                self._upsert_driver_profile(
                    user,
                    plate=f"COUR-{i:03d}",
                    status="approved" if approve else "pending",
                    issued=issued,
                    expires=expires,
                    now=now,
                    available=False,
                    car_type="regular",
                )
                self._ensure_approved_documents(user, expires=expires)
                self._ensure_driver_esign(user)
                DriverDeliverySettings.objects.update_or_create(
                    driver=user,
                    defaults={
                        "delivery_mode_enabled": True,
                        "delivery_vehicle_type": "motorcycle",
                        "accepts_food": True,
                        "accepts_pharmacy": True,
                    },
                )
                if created:
                    courier_created += 1

        self.stdout.write(self.style.SUCCESS(
            f"Pilot seed complete. created staff~{staff_created} riders~{rider_created} "
            f"drivers~{driver_created} couriers~{courier_created}"
        ))
        self.stdout.write(
            f"Shared password: {password}\n"
            f"Staff example: ceo@{EMAIL_DOMAIN}\n"
            f"Rider example: rider001@{EMAIL_DOMAIN}\n"
            f"Driver example: driver001@{EMAIL_DOMAIN}\n"
            f"Courier example: courier001@{EMAIL_DOMAIN}\n"
            "Rotate passwords after UAT. Domain @pilot.yala.test is synthetic only."
        )

    def _upsert_user(
        self,
        *,
        email,
        first_name,
        last_name,
        password,
        user_type,
        is_staff,
        phone_suffix,
        now,
        rider_status="approved",
    ):
        phone = f"+22249{phone_suffix:06d}"[:16]
        user, created = User.objects.get_or_create(
            email=email,
            defaults={
                "first_name": first_name,
                "last_name": last_name,
                "user_type": user_type,
                "phone_number": phone,
                "is_staff": is_staff,
                "is_active": True,
                "rider_status": rider_status,
                "gender": "Male" if phone_suffix % 2 == 0 else "Female",
            },
        )
        user.first_name = first_name
        user.last_name = last_name
        user.user_type = user_type
        user.phone_number = phone
        user.is_staff = is_staff
        user.is_active = True
        user.rider_status = rider_status
        user.phone_verified_at = now
        # Soft-launch / courier onboarding requires a city.
        if user.city_id is None:
            try:
                from locations.models import City

                city = City.objects.order_by("id").first()
                if city:
                    user.city = city
            except Exception:
                pass
        user.set_password(password)
        user.save()
        return user, created

    def _upsert_driver_profile(self, user, *, plate, status, issued, expires, now, available, car_type="regular"):
        # Create as pending first to avoid Celery QR task on approval during seed (broker may be down).
        profile, _ = DriverProfile.objects.get_or_create(
            user=user,
            defaults={
                "status": "pending",
                "car_type": car_type,
                "phone_number": user.phone_number,
                "vehicle_make": "Toyota",
                "vehicle_model": "Corolla",
                "vehicle_color": "White",
                "vehicle_plate": plate,
                "plate_number": plate,
                "is_available": available,
                "terms_accepted": True,
                "terms_accepted_at": now,
                "terms_version": COURIER_TERMS_VERSION,
                "signature_image": "legal/courier_signatures/pilot.png",
                "signed_full_name": user.get_full_name() or user.email,
                "legal_declaration_accepted": True,
                "driver_terms_accepted": True,
                "driver_terms_accepted_at": now,
                "driver_terms_version": DRIVER_AGREEMENT_VERSION,
                "driver_signature_image": "legal/driver_signatures/pilot.png",
                "driver_signed_full_name": user.get_full_name() or user.email,
                "driver_legal_declaration_accepted": True,
                "license_issued_at": issued,
                "license_expires_at": expires,
                "vehicle_registration_expires_at": expires,
                "insurance_expires_at": expires,
                "vignette_expires_at": expires,
            },
        )
        DriverProfile.objects.filter(pk=profile.pk).update(
            status=status,
            car_type=car_type,
            phone_number=user.phone_number,
            vehicle_plate=plate,
            plate_number=plate,
            is_available=available,
            terms_accepted=True,
            terms_accepted_at=now,
            terms_version=COURIER_TERMS_VERSION,
            signature_image="legal/courier_signatures/pilot.png",
            signed_full_name=user.get_full_name() or user.email,
            legal_declaration_accepted=True,
            driver_terms_accepted=True,
            driver_terms_accepted_at=now,
            driver_terms_version=DRIVER_AGREEMENT_VERSION,
            driver_signature_image="legal/driver_signatures/pilot.png",
            driver_signed_full_name=user.get_full_name() or user.email,
            driver_legal_declaration_accepted=True,
            license_issued_at=issued,
            license_expires_at=expires,
            vehicle_registration_expires_at=expires,
            insurance_expires_at=expires,
            vignette_expires_at=expires,
        )
        profile.refresh_from_db()
        return profile

    def _ensure_approved_documents(self, user, *, expires):
        """Pilot drivers must have approved required docs to go online."""
        profile = DriverProfile.objects.filter(user=user).first()
        if not profile:
            return
        for doc_type in REQUIRED_DOCUMENT_TYPES:
            doc, created = DriverDocument.objects.get_or_create(
                driver=profile,
                document_type=doc_type,
                defaults={
                    "status": "approved",
                    "expires_at": expires,
                },
            )
            if created or not doc.file:
                doc.file.save(
                    f"pilot_{user.id}_{doc_type}.jpg",
                    ContentFile(b"pilot-uat-document"),
                    save=False,
                )
            doc.status = "approved"
            doc.expires_at = expires
            doc.save()

    def _ensure_driver_esign(self, user):
        """Pilot drivers need current e-signature to go online."""
        profile = DriverProfile.objects.filter(user=user).first()
        if not profile:
            return
        now = timezone.now()
        profile.terms_accepted = True
        profile.terms_accepted_at = now
        profile.terms_version = DRIVER_AGREEMENT_VERSION
        profile.driver_terms_accepted = True
        profile.driver_terms_accepted_at = now
        profile.driver_terms_version = DRIVER_AGREEMENT_VERSION
        profile.driver_terms_scrolled_to_bottom = True
        profile.driver_legal_declaration_accepted = True
        profile.driver_signed_full_name = (user.get_full_name() or "Pilot Driver")[:200]
        profile.driver_signed_ip_address = "127.0.0.1"
        profile.driver_signed_device_info = "pilot-seed"
        if not profile.driver_signature_image:
            profile.driver_signature_image.save(
                f"pilot_sig_{user.id}.png",
                ContentFile(PILOT_SIGNATURE_PNG),
                save=False,
            )
        profile.save()
