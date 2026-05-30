"""
Fresh seed: 3 drivers with vehicles + photos, 5 riders with photos.
All passwords: Test1234!
"""
import os
import sys
from PIL import Image, ImageDraw, ImageFont
import tempfile

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "taxi.settings")
import django
django.setup()

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from taxi.drivers.models import DriverProfile
import io

User = get_user_model()

PASSWORD = "Test1234!"


def generate_avatar(initials, bg_color, size=200):
    """Generate a colored avatar with initials."""
    img = Image.new("RGB", (size, size), bg_color)
    draw = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype("arialbd.ttf", int(size * 0.4))
    except (OSError, IOError):
        font = ImageFont.load_default()
    bbox = draw.textbbox((0, 0), initials, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text(((size - tw) // 2, (size - th) // 2 - 10), initials, fill=(255, 255, 255), font=font)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    buf.seek(0)
    return buf


# ─── Drivers ──────────────────────────────────────────────────────────────────
DRIVERS = [
    {
        "first_name": "Moussa",
        "last_name": "Soumare",
        "email": "moussa@yala.mr",
        "phone": "+22244112233",
        "vehicle_make": "Toyota",
        "vehicle_model": "Corolla",
        "vehicle_color": "White",
        "plate": "NKT-2024",
        "car_type": "regular",
        "category": "gold",
        "color": (41, 128, 185),
    },
    {
        "first_name": "Cheikh",
        "last_name": "Ould Ahmed",
        "email": "cheikh@yala.mr",
        "phone": "+22244556677",
        "vehicle_make": "Hyundai",
        "vehicle_model": "Accent",
        "vehicle_color": "Silver",
        "plate": "NKT-3055",
        "car_type": "comfort",
        "category": "platinum",
        "color": (142, 68, 173),
    },
    {
        "first_name": "Abdoulaye",
        "last_name": "Ndiaye",
        "email": "abdoulaye@yala.mr",
        "phone": "+22244889900",
        "vehicle_make": "Renault",
        "vehicle_model": "Duster",
        "vehicle_color": "Black",
        "plate": "NDB-1987",
        "car_type": "xl",
        "category": "diamond",
        "color": (39, 174, 96),
    },
]

# ─── Riders ───────────────────────────────────────────────────────────────────
RIDERS = [
    {"first_name": "Aminata", "last_name": "Diallo", "email": "aminata@yala.mr", "phone": "+22245001111", "color": (231, 76, 60)},
    {"first_name": "Fatima", "last_name": "Ba", "email": "fatima@yala.mr", "phone": "+22245002222", "color": (243, 156, 18)},
    {"first_name": "Oumar", "last_name": "Sy", "email": "oumar@yala.mr", "phone": "+22245003333", "color": (52, 152, 219)},
    {"first_name": "Mariam", "last_name": "Kane", "email": "mariam@yala.mr", "phone": "+22245004444", "color": (155, 89, 182)},
    {"first_name": "Ibrahim", "last_name": "Diop", "email": "ibrahim@yala.mr", "phone": "+22245005555", "color": (22, 160, 133)},
]

print("Creating 3 drivers with vehicles and photos...")
for d in DRIVERS:
    user, created = User.objects.get_or_create(
        email=d["email"],
        defaults={
            "first_name": d["first_name"],
            "last_name": d["last_name"],
            "user_type": "driver",
            "phone_number": d["phone"],
            "rider_status": "approved",
        },
    )
    if created:
        user.set_password(PASSWORD)
    # Generate and save profile picture
    initials = f"{d['first_name'][0]}{d['last_name'][0]}"
    avatar = generate_avatar(initials, d["color"])
    user.profile_picture.save(f"{d['email']}_avatar.jpg", ContentFile(avatar.read()), save=False)
    user.save()

    # Create driver profile with vehicle info
    profile, _ = DriverProfile.objects.get_or_create(
        user=user,
        defaults={
            "status": "approved",
            "is_available": True,
            "car_type": d["car_type"],
            "driver_category": d["category"],
            "vehicle_make": d["vehicle_make"],
            "vehicle_model": d["vehicle_model"],
            "vehicle_color": d["vehicle_color"],
            "vehicle_plate": d["plate"],
            "plate_number": d["plate"],
            "phone_number": d["phone"],
            "terms_accepted": True,
        },
    )
    if not _:
        profile.status = "approved"
        profile.is_available = True
        profile.car_type = d["car_type"]
        profile.driver_category = d["category"]
        profile.vehicle_make = d["vehicle_make"]
        profile.vehicle_model = d["vehicle_model"]
        profile.vehicle_color = d["vehicle_color"]
        profile.vehicle_plate = d["plate"]
        profile.plate_number = d["plate"]
        profile.save()

    # Generate driver photo
    driver_avatar = generate_avatar(initials, d["color"])
    profile.driver_photo.save(f"{d['email']}_driver.jpg", ContentFile(driver_avatar.read()), save=True)

    status_icon = "✓" if created else "↻"
    print(f"  {status_icon} {d['first_name']} {d['last_name']} | {d['vehicle_make']} {d['vehicle_model']} {d['vehicle_color']} | {d['plate']} | {d['category']}")

print()
print("Creating 5 riders with photos...")
for r in RIDERS:
    user, created = User.objects.get_or_create(
        email=r["email"],
        defaults={
            "first_name": r["first_name"],
            "last_name": r["last_name"],
            "user_type": "rider",
            "phone_number": r["phone"],
            "rider_status": "approved",
        },
    )
    if created:
        user.set_password(PASSWORD)
    # Generate and save profile picture
    initials = f"{r['first_name'][0]}{r['last_name'][0]}"
    avatar = generate_avatar(initials, r["color"])
    user.profile_picture.save(f"{r['email']}_avatar.jpg", ContentFile(avatar.read()), save=True)

    status_icon = "✓" if created else "↻"
    print(f"  {status_icon} {r['first_name']} {r['last_name']} | {r['phone']}")

print()
print("=" * 50)
print("ACCOUNTS READY")
print("=" * 50)
print(f"  Admin:   admin@sakho.com / Admin123!")
print()
print("  Drivers (all password: Test1234!):")
for d in DRIVERS:
    print(f"    {d['email']} — {d['vehicle_make']} {d['vehicle_model']} ({d['plate']})")
print()
print("  Riders (all password: Test1234!):")
for r in RIDERS:
    print(f"    {r['email']}")
print()
print("Done!")
