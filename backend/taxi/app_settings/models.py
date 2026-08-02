from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone


RIDE_TYPE_CHOICES = [
    ("Regular", "Regular"),
    ("XL", "XL"),
    ("Comfort", "Comfort"),
    ("Share", "Share"),
]


class SiteSettings(models.Model):
    base_price = models.DecimalField(max_digits=10, decimal_places=2)
    price_minute = models.DecimalField(max_digits=10, decimal_places=2)
    price_km = models.DecimalField(max_digits=10, decimal_places=2)

    def __str__(self):
        return f"Base price {self.base_price}"


class BaseConfigModel(models.Model):
    """Abstract base for timestamped, user-tracked pricing config records."""

    is_active = models.BooleanField(default=True)
    effective_from = models.DateTimeField(
        null=True,
        blank=True,
        default=timezone.now,
        db_index=True,
        help_text="When this configuration becomes effective.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="%(class)s_created",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="%(class)s_updated",
    )

    class Meta:
        abstract = True
        ordering = ["-effective_from", "-created_at"]

    def _deactivate_others(self):
        """Deactivate other active records, preserving history."""
        raise NotImplementedError

    def clean(self):
        super().clean()

    def save(self, *args, **kwargs):
        is_raw = kwargs.get("raw", False)
        if not is_raw and self.is_active:
            self._deactivate_others()
        if not is_raw:
            self.full_clean()
        super().save(*args, **kwargs)


class GlobalFareConfig(BaseConfigModel):
    """Database-backed global fare table per ride type."""

    ride_type = models.CharField(
        max_length=20,
        choices=RIDE_TYPE_CHOICES,
        db_index=True,
    )
    base_fare = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal("0.00"),
        help_text="Base and minimum fare for the ride type.",
    )
    per_km = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal("0.00"),
        help_text="Per-kilometer charge.",
    )
    minimum_fare = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal("0.00"),
        help_text="Minimum payable fare for the ride type.",
    )

    class Meta:
        indexes = [
            models.Index(fields=["ride_type", "is_active"], name="idx_gf_ride_active"),
            models.Index(fields=["effective_from"], name="idx_gf_effective"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["ride_type"],
                condition=models.Q(is_active=True),
                name="uq_gf_active",
            )
        ]

    def _deactivate_others(self):
        GlobalFareConfig.objects.filter(
            ride_type=self.ride_type,
            is_active=True,
        ).exclude(pk=self.pk).update(is_active=False)

    def clean(self):
        super().clean()
        for field_name in ["base_fare", "per_km", "minimum_fare"]:
            value = getattr(self, field_name, None) or Decimal("0.00")
            if value < Decimal("0.00"):
                raise ValidationError({field_name: "Must be non-negative."})
        if self.minimum_fare < self.base_fare:
            raise ValidationError(
                {"minimum_fare": "Minimum fare must not be less than base fare."}
            )

    def __str__(self):
        return f"{self.ride_type} — base {self.base_fare} / km {self.per_km} (min {self.minimum_fare})"


class WaitingFeeConfig(BaseConfigModel):
    """Database-backed waiting fee policy."""

    free_minutes = models.PositiveSmallIntegerField(
        default=3,
        help_text="Free waiting minutes before billing starts.",
    )
    per_minute_fee = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal("0.00"),
    )
    max_wait_minutes = models.PositiveSmallIntegerField(
        default=5,
        help_text="Maximum waiting minutes before no-show becomes available.",
    )
    arrive_max_distance_m = models.PositiveSmallIntegerField(
        default=350,
        help_text="GPS radius for driver 'arrived' validation.",
    )
    no_show_max_distance_m = models.PositiveSmallIntegerField(
        default=150,
        help_text="GPS radius for rider no-show validation.",
    )

    class Meta:
        indexes = [
            models.Index(fields=["is_active", "effective_from"], name="idx_wf_active_eff"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["is_active"],
                condition=models.Q(is_active=True),
                name="uq_wf_active",
            )
        ]

    def _deactivate_others(self):
        WaitingFeeConfig.objects.filter(is_active=True).exclude(pk=self.pk).update(is_active=False)

    def clean(self):
        super().clean()
        if self.per_minute_fee < Decimal("0.00"):
            raise ValidationError({"per_minute_fee": "Must be non-negative."})
        if self.max_wait_minutes < self.free_minutes:
            raise ValidationError(
                {"max_wait_minutes": "Must be greater than or equal to free_minutes."}
            )

    def __str__(self):
        return f"Waiting: {self.free_minutes}m free @ {self.per_minute_fee}/min (max {self.max_wait_minutes}m)"


class CancellationFeeConfig(BaseConfigModel):
    """Database-backed cancellation fee policy."""

    free_window_minutes = models.PositiveSmallIntegerField(
        default=2,
        help_text="Free cancellation window from ride creation.",
    )
    en_route_fee = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal("0.00"),
    )
    arrived_fee = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal("0.00"),
    )
    driver_penalty = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal("0.00"),
    )

    class Meta:
        indexes = [
            models.Index(fields=["is_active", "effective_from"], name="idx_cf_active_eff"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["is_active"],
                condition=models.Q(is_active=True),
                name="uq_cf_active",
            )
        ]

    def _deactivate_others(self):
        CancellationFeeConfig.objects.filter(is_active=True).exclude(pk=self.pk).update(is_active=False)

    def clean(self):
        super().clean()
        for field_name in ["en_route_fee", "arrived_fee", "driver_penalty"]:
            value = getattr(self, field_name, None) or Decimal("0.00")
            if value < Decimal("0.00"):
                raise ValidationError({field_name: "Must be non-negative."})

    def __str__(self):
        return (
            f"Cancellation: {self.free_window_minutes}m free | "
            f"en-route {self.en_route_fee} | arrived {self.arrived_fee} | "
            f"driver {self.driver_penalty}"
        )


class NoShowFeeConfig(BaseConfigModel):
    """Database-backed no-show fee policy."""

    rider_fee = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal("0.00"),
    )
    driver_compensation = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal("0.00"),
    )
    wait_minutes_threshold = models.PositiveSmallIntegerField(
        default=5,
        help_text="Minimum wait minutes before a no-show can be valid.",
    )
    max_distance_m = models.PositiveSmallIntegerField(
        default=150,
        help_text="GPS radius for no-show validation.",
    )

    class Meta:
        indexes = [
            models.Index(fields=["is_active", "effective_from"], name="idx_ns_active_eff"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["is_active"],
                condition=models.Q(is_active=True),
                name="uq_ns_active",
            )
        ]

    def _deactivate_others(self):
        NoShowFeeConfig.objects.filter(is_active=True).exclude(pk=self.pk).update(is_active=False)

    def clean(self):
        super().clean()
        for field_name in ["rider_fee", "driver_compensation"]:
            value = getattr(self, field_name, None) or Decimal("0.00")
            if value < Decimal("0.00"):
                raise ValidationError({field_name: "Must be non-negative."})

    def __str__(self):
        return f"No-show: rider {self.rider_fee} | driver {self.driver_compensation}"


class RideCommissionConfig(BaseConfigModel):
    """Database-backed ride commission split."""

    platform_percent = models.DecimalField(
        max_digits=5,
        decimal_places=4,
        default=Decimal("0.3000"),
        help_text="Platform commission as a decimal (e.g., 0.30 for 30%).",
    )
    driver_percent = models.DecimalField(
        max_digits=5,
        decimal_places=4,
        default=Decimal("0.7000"),
        help_text="Driver share as a decimal.",
    )

    class Meta:
        indexes = [
            models.Index(fields=["is_active", "effective_from"], name="idx_rc_active_eff"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["is_active"],
                condition=models.Q(is_active=True),
                name="uq_rc_active",
            )
        ]

    def _deactivate_others(self):
        RideCommissionConfig.objects.filter(is_active=True).exclude(pk=self.pk).update(is_active=False)

    def clean(self):
        super().clean()
        for field_name in ["platform_percent", "driver_percent"]:
            value = getattr(self, field_name, None) or Decimal("0.0000")
            if value < Decimal("0.0000") or value > Decimal("1.0000"):
                raise ValidationError({field_name: "Must be between 0 and 1."})
        total = self.platform_percent + self.driver_percent
        if total > Decimal("1.0000"):
            raise ValidationError(
                "platform_percent + driver_percent must not exceed 1."
            )

    def __str__(self):
        return f"Commission: platform {self.platform_percent} | driver {self.driver_percent}"


class PricingAuditLog(models.Model):
    """Immutable audit trail for pricing configuration changes."""

    ACTION_CHOICES = [
        ("create", "Create"),
        ("update", "Update"),
        ("activate", "Activate"),
        ("deactivate", "Deactivate"),
        ("delete", "Delete"),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="pricing_audit_entries",
    )
    action = models.CharField(max_length=20, choices=ACTION_CHOICES)
    model_name = models.CharField(max_length=80)
    object_id = models.CharField(max_length=50)
    object_repr = models.CharField(max_length=255, blank=True)
    field_name = models.CharField(max_length=80, blank=True)
    old_value = models.TextField(blank=True)
    new_value = models.TextField(blank=True)
    reason = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["model_name", "-created_at"], name="idx_pricingaudit_model"),
            models.Index(fields=["user", "-created_at"], name="idx_pricingaudit_user"),
        ]

    def __str__(self):
        return f"{self.action} {self.model_name} {self.object_id} @ {self.created_at}"