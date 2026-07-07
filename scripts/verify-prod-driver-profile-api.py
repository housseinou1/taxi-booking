#!/usr/bin/env python3
"""Verify production driver profile API endpoints (run inside django container)."""
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from taxi.drivers.models import DriverProfile

PATHS = [
    "/drivers/me/",
    "/drivers/me/profile/",
    "/drivers/me/documents/",
]

User = get_user_model()
client = APIClient()

for path in PATHS:
    response = client.get(path)
    print(f"UNAUTH {path} {response.status_code}")

driver_email = "qa-driver-profile-fix@test.local"
driver, created = User.objects.get_or_create(
    email=driver_email,
    defaults={"user_type": "driver", "first_name": "QA", "last_name": "Driver"},
)
if created:
    driver.set_password("QaDriverFix!2026")
    driver.save()
DriverProfile.objects.filter(user=driver).delete()
client.force_authenticate(user=driver)
for path in PATHS:
    response = client.get(path)
    exists = DriverProfile.objects.filter(user=driver).exists()
    print(f"DRIVER_NO_PROFILE {path} {response.status_code} profile_exists={exists}")

rider_email = "qa-rider-profile-fix@test.local"
rider, created = User.objects.get_or_create(
    email=rider_email,
    defaults={"user_type": "rider", "first_name": "QA", "last_name": "Rider"},
)
if created:
    rider.set_password("QaRiderFix!2026")
    rider.save()
DriverProfile.objects.filter(user=rider).delete()
client.force_authenticate(user=rider)
for path in PATHS:
    response = client.get(path)
    code = response.data.get("code") if hasattr(response, "data") else ""
    print(f"RIDER {path} {response.status_code} code={code}")
