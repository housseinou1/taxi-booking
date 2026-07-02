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

