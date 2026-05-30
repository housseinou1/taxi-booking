from decimal import Decimal

from django.conf import settings
from django.db import models


class Ride(models.Model):
    STATUS_CHOICES = [
        ("requested", "Requested"),
        ("scheduled", "Scheduled"),
        ("driver_arriving", "Driver Arriving"),
        ("driver_arrived", "Driver Arrived"),
        ("in_progress", "In Progress"),
        ("completed", "Completed"),
        ("cancelled", "Cancelled"),
    ]

    RIDE_TYPES = [
        ("Regular", "Regular"),
        ("XL", "XL"),
        ("Comfort", "Comfort"),
        ("Share", "Share"),
    ]

    rider = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="rider_rides",
    )

    driver = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="driver_rides",
    )

    pickup = models.CharField(max_length=255)
    destination = models.CharField(max_length=255)

    pickup_lat = models.FloatField(default=18.0735)
    pickup_lng = models.FloatField(default=-15.9582)

    destination_lat = models.FloatField(default=18.0896)
    destination_lng = models.FloatField(default=-15.9754)

    ride_type = models.CharField(
        max_length=20,
        choices=RIDE_TYPES,
        default="Regular",
    )

    distance_km = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        default=0,
    )

    fare = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
    )

    app_fee = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
    )

    driver_earning = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
    )

    status = models.CharField(
        max_length=30,
        choices=STATUS_CHOICES,
        default="requested",
    )

    rating = models.IntegerField(
        null=True,
        blank=True,
    )

    review = models.TextField(
        blank=True,
        default="",
    )

    driver_rating = models.IntegerField(
        null=True,
        blank=True,
    )

    driver_review = models.TextField(
        blank=True,
        default="",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    scheduled_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["status"], name="ride_status_idx"),
            models.Index(fields=["rider", "status"], name="ride_rider_status_idx"),
            models.Index(fields=["driver", "status"], name="ride_driver_status_idx"),
            models.Index(fields=["-completed_at"], name="ride_completed_idx"),
            models.Index(fields=["-created_at"], name="ride_created_idx"),
        ]

    def __str__(self):
        return f"Ride #{self.id} - {self.rider.email}"
