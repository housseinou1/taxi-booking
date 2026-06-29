"""
Yala Driver Incentive & Bonus System.
Rewards drivers for completing goals, working peak hours, and maintaining quality.
"""
from decimal import Decimal
from django.conf import settings
from django.db import models
from django.utils import timezone


class IncentiveProgram(models.Model):
    """Admin-configured bonus programs."""
    TYPE_CHOICES = [
        ("ride_count", "Complete X Rides"),
        ("peak_hours", "Work During Peak Hours"),
        ("consecutive_days", "Drive X Consecutive Days"),
        ("rating", "Maintain High Rating"),
        ("city_bonus", "Drive in Specific City"),
        ("weekly_target", "Weekly Earnings Target"),
        ("first_ride_bonus", "First Ride of the Day"),
        ("intercity", "Complete Intercity Trip"),
        ("seasonal", "Seasonal Bonus"),
        ("holiday", "Holiday Bonus"),
        ("delivery_count", "Complete X Deliveries"),
    ]
    STATUS_CHOICES = [
        ("active", "Active"),
        ("paused", "Paused"),
        ("expired", "Expired"),
    ]

    name = models.CharField(max_length=200)
    description = models.TextField(blank=True, default="")
    incentive_type = models.CharField(max_length=30, choices=TYPE_CHOICES)
    bonus_amount = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("200"))
    target_value = models.PositiveIntegerField(default=10)  # e.g. 10 rides, 5 days, 4.5 rating
    city = models.ForeignKey("cities.City", on_delete=models.SET_NULL, null=True, blank=True)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default="active")
    starts_at = models.DateTimeField(null=True, blank=True)
    ends_at = models.DateTimeField(null=True, blank=True)
    max_participants = models.PositiveIntegerField(default=0)  # 0 = unlimited
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    @property
    def is_currently_active(self):
        now = timezone.now()
        if self.status != "active":
            return False
        if self.starts_at and now < self.starts_at:
            return False
        if self.ends_at and now > self.ends_at:
            return False
        return True

    def __str__(self):
        return f"{self.name} ({self.bonus_amount} MRU)"


class DriverIncentiveProgress(models.Model):
    """Tracks a driver's progress toward an incentive."""
    STATUS_CHOICES = [
        ("in_progress", "In Progress"),
        ("completed", "Completed"),
        ("paid", "Paid"),
        ("expired", "Expired"),
    ]

    driver = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="incentive_progress")
    program = models.ForeignKey(IncentiveProgram, on_delete=models.CASCADE, related_name="participants")
    current_value = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default="in_progress")
    completed_at = models.DateTimeField(null=True, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    bonus_earned = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    enrolled_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("driver", "program")
        ordering = ["-enrolled_at"]

    @property
    def progress_percent(self):
        if self.program.target_value == 0:
            return 100
        return min(100, int(self.current_value / self.program.target_value * 100))

    def __str__(self):
        return f"{self.driver.first_name} - {self.program.name}: {self.current_value}/{self.program.target_value}"


class BonusPayment(models.Model):
    """Record of bonus paid to a driver."""
    driver = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="bonus_payments")
    program = models.ForeignKey(IncentiveProgram, on_delete=models.SET_NULL, null=True, blank=True)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    reason = models.CharField(max_length=200)
    paid_at = models.DateTimeField(auto_now_add=True)
    admin_note = models.CharField(max_length=300, blank=True, default="")

    class Meta:
        ordering = ["-paid_at"]

    def __str__(self):
        return f"{self.driver.first_name}: {self.amount} MRU - {self.reason}"
