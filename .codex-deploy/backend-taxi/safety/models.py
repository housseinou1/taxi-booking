import secrets

from django.conf import settings
from django.db import models
from django.utils import timezone


class EmergencyContact(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="emergency_contacts",
    )
    name = models.CharField(max_length=120)
    phone_number = models.CharField(max_length=40)
    relationship = models.CharField(max_length=80, blank=True, default="")
    is_primary = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-is_primary", "name"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "phone_number"],
                name="unique_emergency_contact_phone",
            ),
        ]


class SafetyIncident(models.Model):
    TYPE_CHOICES = [
        ("sos", "SOS Emergency"),
        ("safety_incident", "Safety Incident"),
        ("report_driver", "Driver Report"),
        ("report_rider", "Rider Report"),
        ("report_courier", "Courier Report"),
        ("report_merchant", "Merchant Report"),
        ("delivery_problem", "Delivery Problem"),
    ]
    STATUS_CHOICES = [
        ("open", "Open"),
        ("acknowledged", "Acknowledged"),
        ("investigating", "Investigating"),
        ("resolved", "Resolved"),
        ("dismissed", "Dismissed"),
    ]
    SEVERITY_CHOICES = [
        ("low", "Low"),
        ("medium", "Medium"),
        ("high", "High"),
        ("critical", "Critical"),
    ]

    reference = models.CharField(max_length=24, unique=True, editable=False)
    reporter = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="reported_safety_incidents",
    )
    reported_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="safety_reports_about_user",
    )
    ride = models.ForeignKey(
        "rides.Ride",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="safety_incidents",
    )
    delivery = models.ForeignKey(
        "deliveries.Delivery",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="safety_incidents",
    )
    incident_type = models.CharField(max_length=30, choices=TYPE_CHOICES)
    severity = models.CharField(max_length=20, choices=SEVERITY_CHOICES, default="high")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="open")
    description = models.TextField(blank=True, default="")
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    location_accuracy_meters = models.FloatField(null=True, blank=True)
    trip_snapshot = models.JSONField(default=dict, blank=True)
    resolution_notes = models.TextField(blank=True, default="")
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_safety_incidents",
    )
    acknowledged_at = models.DateTimeField(null=True, blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status", "-created_at"], name="safety_status_created_idx"),
            models.Index(fields=["incident_type", "-created_at"], name="safety_type_created_idx"),
            models.Index(fields=["ride", "-created_at"], name="safety_ride_created_idx"),
            models.Index(fields=["delivery", "-created_at"], name="safety_delivery_created_idx"),
        ]

    def save(self, *args, **kwargs):
        if not self.reference:
            self.reference = f"SAFE-{timezone.now():%y%m%d}-{secrets.token_hex(3).upper()}"
        super().save(*args, **kwargs)


class EmergencyAlert(models.Model):
    incident = models.OneToOneField(
        SafetyIncident,
        on_delete=models.CASCADE,
        related_name="emergency_alert",
    )
    dispatched_at = models.DateTimeField(auto_now_add=True)
    admin_notifications_sent = models.PositiveIntegerField(default=0)
    counterpart_notified = models.BooleanField(default=False)
    contacts_snapshot = models.JSONField(default=list, blank=True)
    delivery_log = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["-dispatched_at"]


class TripShare(models.Model):
    ride = models.ForeignKey(
        "rides.Ride",
        on_delete=models.CASCADE,
        related_name="safety_shares",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="trip_shares",
    )
    token = models.CharField(max_length=64, unique=True, editable=False)
    expires_at = models.DateTimeField()
    is_active = models.BooleanField(default=True)
    view_count = models.PositiveIntegerField(default=0)
    last_viewed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        if not self.token:
            self.token = secrets.token_urlsafe(32)
        super().save(*args, **kwargs)

    @property
    def is_available(self):
        return self.is_active and self.expires_at > timezone.now()

