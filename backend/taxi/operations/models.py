from django.conf import settings
from django.db import models
from django.utils import timezone


class VehicleMaintenanceReminder(models.Model):
    TYPE_CHOICES = [
        ("oil_change", "Oil Change"),
        ("inspection", "Vehicle Inspection"),
        ("tires", "Tire Service"),
        ("insurance", "Insurance Renewal"),
        ("registration", "Registration Renewal"),
        ("other", "Other"),
    ]
    STATUS_CHOICES = [("upcoming", "Upcoming"), ("due", "Due"), ("completed", "Completed")]

    driver = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="maintenance_reminders"
    )
    reminder_type = models.CharField(max_length=30, choices=TYPE_CHOICES)
    title = models.CharField(max_length=160)
    due_date = models.DateField()
    due_odometer_km = models.PositiveIntegerField(null=True, blank=True)
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default="upcoming", db_index=True)
    notes = models.TextField(blank=True, default="")
    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["status", "due_date"]

    def mark_completed(self):
        self.status = "completed"
        self.completed_at = timezone.now()
        self.save(update_fields=["status", "completed_at"])


class PlatformSetting(models.Model):
    """Key/value platform flags for executive controls (maintenance mode, etc.)."""

    key = models.CharField(max_length=64, unique=True)
    value = models.JSONField(default=dict, blank=True)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="platform_setting_updates",
    )

    class Meta:
        ordering = ["key"]

    @classmethod
    def get_value(cls, key: str, default=None):
        row = cls.objects.filter(key=key).first()
        return row.value if row else default

    @classmethod
    def set_value(cls, key: str, value, user=None):
        row, _ = cls.objects.update_or_create(
            key=key,
            defaults={"value": value, "updated_by": user},
        )
        return row

