"""CEO-approved operating city transfer requests (drivers and delivery couriers)."""

from django.conf import settings
from django.db import models


class OperatingCityTransferRequest(models.Model):
    """Driver/courier requests a permanent change of authorized registry city (``cities.City``)."""

    KIND_DRIVER = "driver"
    KIND_COURIER = "courier"
    KIND_CHOICES = [
        (KIND_DRIVER, "Driver"),
        (KIND_COURIER, "Courier"),
    ]

    STATUS_PENDING = "pending"
    STATUS_APPROVED = "approved"
    STATUS_REJECTED = "rejected"
    STATUS_CANCELLED = "cancelled"
    STATUS_CHOICES = [
        (STATUS_PENDING, "Pending CEO review"),
        (STATUS_APPROVED, "Approved"),
        (STATUS_REJECTED, "Rejected"),
        (STATUS_CANCELLED, "Cancelled"),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="operating_city_transfer_requests",
    )
    kind = models.CharField(max_length=20, choices=KIND_CHOICES)
    from_city = models.ForeignKey(
        "cities.City",
        on_delete=models.PROTECT,
        related_name="transfer_requests_from",
        null=True,
        blank=True,
    )
    to_city = models.ForeignKey(
        "cities.City",
        on_delete=models.PROTECT,
        related_name="transfer_requests_to",
    )
    reason = models.TextField(blank=True, default="")
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_PENDING,
        db_index=True,
    )
    ceo_notes = models.TextField(blank=True, default="")
    requested_at = models.DateTimeField(auto_now_add=True)
    decided_at = models.DateTimeField(null=True, blank=True)
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="decided_city_transfers",
    )

    class Meta:
        ordering = ["-requested_at"]
        indexes = [
            models.Index(fields=["status", "-requested_at"]),
            models.Index(fields=["user", "status"]),
        ]

    def __str__(self):
        return f"{self.get_kind_display()} {self.user_id} → {self.to_city_id} ({self.status})"
