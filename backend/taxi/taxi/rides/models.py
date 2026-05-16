from django.db import models
from django.conf import settings


class Ride(models.Model):

    STATUS_CHOICES = [
        ("requested", "Requested"),
        ("accepted", "Accepted"),
        ("driver_arriving", "Driver Arriving"),
        ("in_progress", "In Progress"),
        ("completed", "Completed"),
        ("cancelled", "Cancelled"),
    ]

    RIDE_TYPE_CHOICES = [
        ("regular", "Regular"),
        ("xl", "XL"),
        ("comfort", "Comfort"),
        ("share", "Share"),
    ]

    rider = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="rider_rides"
    )

    driver = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="driver_rides"
    )

    pickup_lat = models.FloatField()
    pickup_lng = models.FloatField()

    destination_lat = models.FloatField()
    destination_lng = models.FloatField()

    ride_type = models.CharField(
        max_length=20,
        choices=RIDE_TYPE_CHOICES,
        default="regular"
    )

    estimated_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=200
    )

    status = models.CharField(
        max_length=30,
        choices=STATUS_CHOICES,
        default="requested"
    )

    created_at = models.DateTimeField(
        auto_now_add=True
    )

    def __str__(self):
        return f"Ride {self.id} - {self.ride_type} - {self.status}"