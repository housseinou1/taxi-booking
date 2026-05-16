from django.db import models
from django.conf import settings



CAR_TYPE_CHOICES = (
    ("regular", "Regular"),
    ("comfort", "Comfort"),
    ("xl", "XL"),
)


class DriverProfile(models.Model):
    STATUS_CHOICES = (
        ("pending", "Pending Review"),
        ("approved", "Approved"),
        ("rejected", "Rejected"),
    )

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="driver_profile",
    )

    phone_number = models.CharField(
        max_length=30,
        blank=True,
    )

    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="pending",
    )

    is_available = models.BooleanField(
        default=False,
    )

    car_type = models.CharField(
        max_length=20,
        choices=CAR_TYPE_CHOICES,
        default="regular",
    )

    vehicle_make = models.CharField(
        max_length=100,
        blank=True,
    )

    vehicle_model = models.CharField(
        max_length=100,
        blank=True,
    )

    vehicle_color = models.CharField(
        max_length=50,
        blank=True,
    )

    vehicle_plate = models.CharField(
        max_length=50,
        blank=True,
    )

    profile_picture = models.ImageField(
        upload_to="driver_profiles/",
        null=True,
        blank=True,
    )

    license_file = models.FileField(
        upload_to="driver_licenses/",
        null=True,
        blank=True,
    )

    insurance_file = models.FileField(
        upload_to="driver_insurance/",
        null=True,
        blank=True,
    )

    driver_lat = models.FloatField(default=0)
    driver_lng = models.FloatField(default=0)

    current_lat = models.FloatField(default=0)
    current_lng = models.FloatField(default=0)

    created_at = models.DateTimeField(
        auto_now_add=True,
    )

    updated_at = models.DateTimeField(
        auto_now=True,
    )

    def __str__(self):
        return f"{self.user.email} - {self.status}"