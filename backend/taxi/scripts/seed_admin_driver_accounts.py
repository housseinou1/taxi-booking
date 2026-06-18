from pathlib import Path
from datetime import timedelta

from django.core.files import File
from django.utils import timezone

from authapp.models import User
from taxi.drivers.models import DriverProfile

from PIL import Image, ImageDraw


def make_image(path: Path, label: str, color=(0, 166, 81)):
    if path.exists():
        return
    image = Image.new("RGB", (1200, 800), color)
    draw = ImageDraw.Draw(image)
    draw.text((40, 40), label, fill=(255, 255, 255))
    image.save(path)


def attach_file(field, source_path: Path, target_name: str):
    with source_path.open("rb") as handle:
        field.save(target_name, File(handle), save=False)


def run():
    seeds_dir = Path("media/seeds")
    seeds_dir.mkdir(parents=True, exist_ok=True)

    assets = {
        "driver_photo": seeds_dir / "driver-photo.png",
        "license": seeds_dir / "driver-license.jpg",
        "registration": seeds_dir / "vehicle-registration.jpg",
        "insurance": seeds_dir / "insurance-document.jpg",
        "vignette": seeds_dir / "vignette-document.jpg",
        "national_id": seeds_dir / "national-id.jpg",
    }

    make_image(assets["driver_photo"], "Driver Photo")
    make_image(assets["license"], "Driver License")
    make_image(assets["registration"], "Vehicle Registration")
    make_image(assets["insurance"], "Insurance Document")
    make_image(assets["vignette"], "Vignette Document")
    make_image(assets["national_id"], "National ID Document")

    now = timezone.now()
    issued = timezone.localdate() - timedelta(days=365)
    expires = timezone.localdate() + timedelta(days=365 * 2)
    temp_password = "Driver12345!"

    drivers = [
        {
            "email": "hama@yala.mr",
            "first_name": "Hama",
            "last_name": "Diallo",
            "phone": "+22240111222",
            "nid": "NID-HAMA-2026-001",
            "make": "Toyota",
            "model": "Corolla",
            "color": "White",
            "plate": "NKC-4102",
        },
        {
            "email": "camara@yala.mr",
            "first_name": "Camara",
            "last_name": "Bah",
            "phone": "+22240111333",
            "nid": "NID-CAMARA-2026-002",
            "make": "Hyundai",
            "model": "Elantra",
            "color": "Silver",
            "plate": "NKC-5378",
        },
    ]

    for item in drivers:
        user, user_created = User.objects.get_or_create(
            email=item["email"],
            defaults={
                "first_name": item["first_name"],
                "last_name": item["last_name"],
                "gender": "Male",
                "phone_number": item["phone"],
                "national_id_number": item["nid"],
                "user_type": "driver",
                "rider_status": "approved",
                "is_active": True,
            },
        )

        user.first_name = item["first_name"]
        user.last_name = item["last_name"]
        user.phone_number = item["phone"]
        user.national_id_number = item["nid"]
        user.user_type = "driver"
        user.is_active = True
        user.phone_verified_at = now
        user.set_password(temp_password)
        attach_file(
            user.national_id_document,
            assets["national_id"],
            f"{item['email'].split('@')[0]}-national-id.jpg",
        )
        attach_file(
            user.profile_picture,
            assets["driver_photo"],
            f"{item['email'].split('@')[0]}-profile.png",
        )
        user.save()

        profile, profile_created = DriverProfile.objects.get_or_create(
            user=user,
            defaults={
                "status": "pending",
                "car_type": "regular",
                "phone_number": item["phone"],
                "vehicle_make": item["make"],
                "vehicle_model": item["model"],
                "vehicle_color": item["color"],
                "vehicle_plate": item["plate"],
                "plate_number": item["plate"],
                "license_issued_at": issued,
                "license_expires_at": expires,
                "vehicle_registration_expires_at": expires,
                "insurance_expires_at": expires,
                "vignette_expires_at": expires,
                "terms_accepted": True,
                "terms_accepted_at": now,
                "terms_version": "2026.1",
            },
        )

        profile.status = "pending"
        profile.phone_number = item["phone"]
        profile.vehicle_make = item["make"]
        profile.vehicle_model = item["model"]
        profile.vehicle_color = item["color"]
        profile.vehicle_plate = item["plate"]
        profile.plate_number = item["plate"]
        profile.license_issued_at = issued
        profile.license_expires_at = expires
        profile.vehicle_registration_expires_at = expires
        profile.insurance_expires_at = expires
        profile.vignette_expires_at = expires
        profile.terms_accepted = True
        profile.terms_accepted_at = now
        profile.terms_version = "2026.1"

        attach_file(
            profile.driver_photo,
            assets["driver_photo"],
            f"{item['email'].split('@')[0]}-driver-photo.png",
        )
        attach_file(
            profile.license_file,
            assets["license"],
            f"{item['email'].split('@')[0]}-license.jpg",
        )
        attach_file(
            profile.vehicle_registration,
            assets["registration"],
            f"{item['email'].split('@')[0]}-registration.jpg",
        )
        attach_file(
            profile.insurance_document,
            assets["insurance"],
            f"{item['email'].split('@')[0]}-insurance.jpg",
        )
        attach_file(
            profile.vignette_document,
            assets["vignette"],
            f"{item['email'].split('@')[0]}-vignette.jpg",
        )
        profile.save()

        print(
            item["email"],
            f"user_created={user_created}",
            f"profile_created={profile_created}",
            f"profile_id={profile.id}",
        )

    print(f"TEMP_PASSWORD {temp_password}")


run()
