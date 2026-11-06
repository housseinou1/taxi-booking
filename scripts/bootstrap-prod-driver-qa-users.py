from django.contrib.auth import get_user_model

from taxi.drivers.models import DriverProfile

# ── Credentials come from the environment only (never hardcode, never print) ──
import os as _cred_os
import sys as _cred_sys


def _required_env(name):
    value = _cred_os.environ.get(name, "")
    if not value:
        _cred_sys.exit(f"Missing required environment variable: {name} (values are never printed)")
    return value


User = get_user_model()

driver, created = User.objects.get_or_create(
    email="qa-driver-profile-fix@test.local",
    defaults={"user_type": "driver", "first_name": "QA", "last_name": "Driver"},
)
if created:
    driver.set_password(_required_env("YALA_QA_DRIVER2_PASSWORD"))
    driver.save()
DriverProfile.objects.filter(user=driver).delete()
print("driver_ready", driver.email, "profile_deleted=True")

rider, created = User.objects.get_or_create(
    email="qa-rider-profile-fix@test.local",
    defaults={"user_type": "rider", "first_name": "QA", "last_name": "Rider"},
)
if created:
    rider.set_password(_required_env("YALA_QA_RIDER_PASSWORD"))
    rider.save()
DriverProfile.objects.filter(user=rider).delete()
print("rider_ready", rider.email)
