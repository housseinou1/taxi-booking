#!/usr/bin/env python3
"""Verify production driver profile API endpoints (run inside django container)."""
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from taxi.drivers.models import DriverProfile

# ── Credentials come from the environment only (never hardcode, never print) ──
import os as _cred_os
import sys as _cred_sys


def _required_env(name):
    value = _cred_os.environ.get(name, "")
    if not value:
        _cred_sys.exit(f"Missing required environment variable: {name} (values are never printed)")
    return value


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
    driver.set_password(_required_env("YALA_QA_DRIVER2_PASSWORD"))
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
    rider.set_password(_required_env("YALA_QA_RIDER_PASSWORD"))
    rider.save()
DriverProfile.objects.filter(user=rider).delete()
client.force_authenticate(user=rider)
for path in PATHS:
    response = client.get(path)
    code = response.data.get("code") if hasattr(response, "data") else ""
    print(f"RIDER {path} {response.status_code} code={code}")
