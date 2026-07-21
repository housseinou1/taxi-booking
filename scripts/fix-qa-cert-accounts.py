"""Ensure RC2 certification QA accounts exist and pass ride-flow gates."""
import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "taxi.settings")
django.setup()

from django.contrib.auth import get_user_model
from django.utils import timezone
from taxi.drivers.models import DriverProfile
from taxi.rides.models import Ride

User = get_user_model()
now = timezone.now()

ACCOUNTS = [
    ("qa-rider-profile-fix@test.local", "QaRiderFix!2026", "rider"),
    ("qa-driver-profile-fix@test.local", "QaDriverFix!2026", "driver"),
    ("qa-driver-final-qa@test.local", "QaDriverFinal!2026", "driver"),
]

OPEN_STATUSES = ["requested", "scheduled", "driver_arriving", "driver_arrived", "in_progress"]

for email, password, user_type in ACCOUNTS:
    user, created = User.objects.get_or_create(
        email=email,
        defaults={
            "user_type": user_type,
            "first_name": "QA",
            "last_name": "Cert",
            "is_active": True,
            "phone_number": "+22200000001" if user_type == "rider" else "+22200000002",
        },
    )
    user.set_password(password)
    user.is_active = True
    user.email_verified = True
    user.phone_verified_at = now
    user.ride_terms_accepted = True
    user.privacy_policy_accepted = True
    if not user.ride_terms_accepted_at:
        user.ride_terms_accepted_at = now
    if not user.privacy_policy_accepted_at:
        user.privacy_policy_accepted_at = now
    if user_type == "rider":
        user.rider_status = "approved"
    user.save()
    if user_type == "driver":
        profile, _ = DriverProfile.objects.get_or_create(
            user=user,
            defaults={"status": "approved", "is_available": True},
        )
        profile.status = "approved"
        profile.is_available = True
        profile.terms_accepted = True
        profile.terms_accepted_at = profile.terms_accepted_at or now
        profile.terms_version = profile.terms_version or "2026.1"
        profile.save()
    print(f"ready:{email}:created={created}:phone_verified={user.is_phone_verified}")

# Cancel open QA rides so certification can request fresh rides
for email in [a[0] for a in ACCOUNTS if a[2] == "rider"]:
    rider = User.objects.filter(email=email).first()
    if not rider:
        continue
    open_rides = Ride.objects.filter(rider=rider, status__in=OPEN_STATUSES)
    for ride in open_rides:
        ride.status = "cancelled"
        ride.save(update_fields=["status"])
        print(f"cancelled_open_ride:{ride.id}:rider={email}")

# Cancel stuck driver-active rides for QA drivers
for email in [a[0] for a in ACCOUNTS if a[2] == "driver"]:
    driver = User.objects.filter(email=email).first()
    if not driver:
        continue
    active = Ride.objects.filter(driver=driver, status__in=OPEN_STATUSES)
    for ride in active:
        ride.status = "cancelled"
        ride.save(update_fields=["status"])
        print(f"cancelled_active_ride:{ride.id}:driver={email}")

# Clear ride-request rate limit bucket for QA rider (cert runs only)
import hashlib
import time
from django.core.cache import cache

rider = User.objects.filter(email="qa-rider-profile-fix@test.local").first()
if rider:
    identity = f"user:{rider.pk}"
    digest = hashlib.sha256(identity.encode("utf-8")).hexdigest()[:24]
    bucket = int(time.time() // 600)
    cache.delete(f"abuse:ride-request:{digest}:{bucket}")
    print(f"cleared_rate_limit:ride-request:{digest}")
