from django.conf import settings
from django.db import models


class DriverProfile(models.Model):
    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("approved", "Approved"),
        ("rejected", "Rejected"),
    ]

    CAR_TYPE_CHOICES = [
        ("regular", "Regular"),
        ("xl", "XL"),
        ("comfort", "Comfort"),
        ("share", "Share"),
    ]

    DRIVER_CATEGORY_CHOICES = [
        ("gold", "Gold"),
        ("platinum", "Platinum"),
        ("diamond", "Diamond"),
        ("elite", "Elite"),
    ]

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="driver_profile",
    )

    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="pending",
    )

    is_available = models.BooleanField(default=False)

    phone_number = models.CharField(
        max_length=30,
        blank=True,
        null=True,
    )

    car_type = models.CharField(
        max_length=20,
        choices=CAR_TYPE_CHOICES,
        default="regular",
        blank=True,
        null=True,
    )

    driver_category = models.CharField(
        max_length=20,
        choices=DRIVER_CATEGORY_CHOICES,
        default="gold",
    )

    vehicle_make = models.CharField(
        max_length=100,
        blank=True,
        null=True,
    )

    vehicle_model = models.CharField(
        max_length=100,
        blank=True,
        null=True,
    )

    vehicle_color = models.CharField(
        max_length=100,
        blank=True,
        null=True,
    )

    vehicle_plate = models.CharField(
        max_length=100,
        blank=True,
        null=True,
    )

    plate_number = models.CharField(
        max_length=100,
        blank=True,
        null=True,
    )

    driver_photo = models.ImageField(
        upload_to="drivers/photos/",
        blank=True,
        null=True,
    )

    license_file = models.FileField(
        upload_to="drivers/licenses/",
        blank=True,
        null=True,
    )

    vehicle_registration = models.FileField(
        upload_to="drivers/registrations/",
        blank=True,
        null=True,
    )

    insurance_document = models.FileField(
        upload_to="drivers/insurance/",
        blank=True,
        null=True,
    )

    current_lat = models.FloatField(
        blank=True,
        null=True,
        default=18.0735,
    )

    current_lng = models.FloatField(
        blank=True,
        null=True,
        default=-15.9582,
    )

    driver_lat = models.FloatField(
        blank=True,
        null=True,
        default=18.0735,
    )

    driver_lng = models.FloatField(
        blank=True,
        null=True,
        default=-15.9582,
    )

    def save(self, *args, **kwargs):
        if self.vehicle_plate and not self.plate_number:
            self.plate_number = self.vehicle_plate

        if self.plate_number and not self.vehicle_plate:
            self.vehicle_plate = self.plate_number

        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.user.email} Driver Profile"
