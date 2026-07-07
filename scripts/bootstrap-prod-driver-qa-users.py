from django.contrib.auth import get_user_model

from taxi.drivers.models import DriverProfile

User = get_user_model()

driver, created = User.objects.get_or_create(
    email="qa-driver-profile-fix@test.local",
    defaults={"user_type": "driver", "first_name": "QA", "last_name": "Driver"},
)
if created:
    driver.set_password("QaDriverFix!2026")
    driver.save()
DriverProfile.objects.filter(user=driver).delete()
print("driver_ready", driver.email, "profile_deleted=True")

rider, created = User.objects.get_or_create(
    email="qa-rider-profile-fix@test.local",
    defaults={"user_type": "rider", "first_name": "QA", "last_name": "Rider"},
)
if created:
    rider.set_password("QaRiderFix!2026")
    rider.save()
DriverProfile.objects.filter(user=rider).delete()
print("rider_ready", rider.email)
