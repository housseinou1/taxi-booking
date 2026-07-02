"""
Yala Intercity Travel System — Models for long-distance routes.
Scalable: routes added from Admin without code changes.
"""
from decimal import Decimal
from django.conf import settings
from django.db import models


class IntercityRoute(models.Model):
    """A configured route between two cities with pricing."""
    PRICING_CHOICES = [
        ("fixed", "Fixed Fare"),
        ("per_km", "Per Kilometer"),
    ]

    origin_city = models.ForeignKey("cities.City", on_delete=models.CASCADE, related_name="intercity_departures")
    destination_city = models.ForeignKey("cities.City", on_delete=models.CASCADE, related_name="intercity_arrivals")
    distance_km = models.DecimalField(max_digits=8, decimal_places=1)
    estimated_duration_minutes = models.PositiveIntegerField(default=60)

    # Pricing
    pricing_type = models.CharField(max_length=10, choices=PRICING_CHOICES, default="fixed")
    fixed_fare = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    per_km_rate = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("15"))
    toll_fees = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    # Status
    is_active = models.BooleanField(default=True)
    is_bidirectional = models.BooleanField(default=True)  # reverse route available too
    notes = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("origin_city", "destination_city")
        ordering = ["origin_city__name", "destination_city__name"]

    @property
    def fare(self):
        if self.pricing_type == "fixed":
            return self.fixed_fare + self.toll_fees
        return (self.distance_km * self.per_km_rate) + self.toll_fees

    def __str__(self):
        return f"{self.origin_city.name} → {self.destination_city.name} ({self.distance_km} km)"


class IntercityTrip(models.Model):
    """An intercity trip request from a rider."""
    STATUS_CHOICES = [
        ("searching", "Searching for Driver"),
        ("scheduled", "Scheduled"),
        ("driver_assigned", "Driver Assigned"),
        ("in_progress", "In Progress"),
        ("completed", "Completed"),
        ("cancelled", "Cancelled"),
    ]

    rider = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="intercity_trips")
    driver = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="intercity_jobs")
    route = models.ForeignKey(IntercityRoute, on_delete=models.CASCADE, related_name="trips")
    ride = models.OneToOneField("rides.Ride", on_delete=models.SET_NULL, null=True, blank=True, related_name="intercity_trip")

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="searching")
    fare = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    driver_earning = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    passenger_count = models.PositiveIntegerField(default=1)
    luggage_note = models.CharField(max_length=200, blank=True, default="")
    scheduled_at = models.DateTimeField(null=True, blank=True)
    is_round_trip = models.BooleanField(default=False)
    return_date = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True, default="")

    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Intercity #{self.id}: {self.route}"


class IntercityDriverMode(models.Model):
    """Track which drivers are available for intercity trips."""
    driver = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="intercity_mode")
    is_enabled = models.BooleanField(default=False)
    max_distance_km = models.PositiveIntegerField(default=1000)
    preferred_routes = models.ManyToManyField(IntercityRoute, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.driver.email} intercity={'ON' if self.is_enabled else 'OFF'}"
