"""
Yala Driver Incentive & Bonus System.
Rewards drivers for completing goals, working peak hours, and maintaining quality.
"""
from decimal import Decimal
from django.conf import settings
from django.db import models
from django.utils import timezone


CAMPAIGN_TYPE_CHOICES = [
    ("daily_trip_target", "Daily Trip Target"),
    ("weekly_trip_target", "Weekly Trip Target"),
    ("peak_hour_bonus", "Peak-Hour Bonus"),
    ("weekend_bonus", "Weekend Bonus"),
    ("airport_bonus", "Airport Bonus"),
    ("new_driver_bonus", "New Driver Bonus"),
    ("referral_bonus", "Referral Bonus"),
    ("consecutive_trips_bonus", "Consecutive Trips Bonus"),
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

REWARD_TYPE_CHOICES = [
    ("fixed", "Fixed Amount"),
    ("percentage", "Percentage"),
    ("per_trip", "Per Trip"),
]

PROGRAM_STATUS_CHOICES = [
    ("draft", "Draft"),
    ("active", "Active"),
    ("paused", "Paused"),
    ("completed", "Completed"),
    ("expired", "Expired"),
]


class IncentiveProgram(models.Model):
    """Admin-configured bonus campaigns."""

    name = models.CharField(max_length=200)
    description = models.TextField(blank=True, default="")
    incentive_type = models.CharField(max_length=30, choices=CAMPAIGN_TYPE_CHOICES)
    reward_type = models.CharField(max_length=20, choices=REWARD_TYPE_CHOICES, default="fixed")
    bonus_amount = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("200"))
    target_value = models.PositiveIntegerField(default=10)
    city = models.ForeignKey("cities.City", on_delete=models.SET_NULL, null=True, blank=True)
    status = models.CharField(max_length=12, choices=PROGRAM_STATUS_CHOICES, default="draft")
    eligible_groups = models.JSONField(default=list, blank=True)
    starts_at = models.DateTimeField(null=True, blank=True)
    ends_at = models.DateTimeField(null=True, blank=True)
    max_participants = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

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
    pending_bonus = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    qualifying_earnings = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    enrolled_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("driver", "program")
        ordering = ["-enrolled_at"]

    @property
    def progress_percent(self):
        if self.program.target_value == 0:
            return 100
        return min(100, int(self.current_value / self.program.target_value * 100))

    @property
    def trips_remaining(self):
        return max(0, self.program.target_value - self.current_value)

    def __str__(self):
        return f"{self.driver.first_name} - {self.program.name}: {self.current_value}/{self.program.target_value}"


class BonusPayment(models.Model):
    """Record of bonus owed or paid to a driver."""

    PAYOUT_STATUS_CHOICES = [
        ("pending", "Pending"),
        ("approved", "Approved"),
        ("paid", "Paid"),
        ("rejected", "Rejected"),
    ]

    driver = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="bonus_payments")
    program = models.ForeignKey(IncentiveProgram, on_delete=models.SET_NULL, null=True, blank=True)
    progress = models.ForeignKey(
        DriverIncentiveProgress,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="bonus_payments",
    )
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    reason = models.CharField(max_length=200)
    payout_status = models.CharField(max_length=12, choices=PAYOUT_STATUS_CHOICES, default="pending", db_index=True)
    wallet_transaction = models.ForeignKey(
        "payments.WalletTransaction",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="incentive_bonuses",
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_bonus_payments",
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    paid_at = models.DateTimeField(auto_now_add=True)
    admin_note = models.CharField(max_length=300, blank=True, default="")

    class Meta:
        ordering = ["-paid_at"]

    def __str__(self):
        return f"{self.driver.first_name}: {self.amount} MRU - {self.reason}"
