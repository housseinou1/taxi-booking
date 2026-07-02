"""
Yala Driver Shift Management System.
"""
from django.conf import settings
from django.db import models
from django.utils import timezone


class DriverShift(models.Model):
    """A scheduled shift for a driver."""
    DAY_CHOICES = [
        (0, "Monday"), (1, "Tuesday"), (2, "Wednesday"),
        (3, "Thursday"), (4, "Friday"), (5, "Saturday"), (6, "Sunday"),
    ]

    driver = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="shifts")
    city = models.ForeignKey("cities.City", on_delete=models.SET_NULL, null=True, blank=True, related_name="driver_shifts")
    day_of_week = models.IntegerField(choices=DAY_CHOICES)
    start_time = models.TimeField()
    end_time = models.TimeField()
    is_recurring = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["day_of_week", "start_time"]

    def __str__(self):
        return f"{self.driver.first_name} - {self.get_day_of_week_display()} {self.start_time}-{self.end_time}"


class DriverUnavailableDay(models.Model):
    """Vacation or unavailable day for a driver."""
    REASON_CHOICES = [
        ("vacation", "Vacation"),
        ("sick", "Sick Leave"),
        ("personal", "Personal"),
        ("vehicle_maintenance", "Vehicle Maintenance"),
        ("other", "Other"),
    ]

    driver = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="unavailable_days")
    date = models.DateField()
    reason = models.CharField(max_length=30, choices=REASON_CHOICES, default="personal")
    note = models.CharField(max_length=200, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("driver", "date")
        ordering = ["-date"]

    def __str__(self):
        return f"{self.driver.first_name} off {self.date}"


class DriverOnlineLog(models.Model):
    """Track when drivers go online/offline for hours calculation."""
    driver = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="online_logs")
    city = models.ForeignKey("cities.City", on_delete=models.SET_NULL, null=True, blank=True)
    went_online_at = models.DateTimeField()
    went_offline_at = models.DateTimeField(null=True, blank=True)
    duration_minutes = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["-went_online_at"]
        indexes = [
            models.Index(fields=["driver", "-went_online_at"], name="shift_driver_online_idx"),
        ]

    def save(self, *args, **kwargs):
        if self.went_offline_at and self.went_online_at:
            delta = (self.went_offline_at - self.went_online_at).total_seconds()
            self.duration_minutes = max(0, int(delta / 60))
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.driver.first_name} online {self.went_online_at}"
