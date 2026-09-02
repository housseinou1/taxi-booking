from django.conf import settings
from django.db import models


class ShareRideSession(models.Model):
    """Groups multiple Share rides assigned to the same driver."""

    # Session-level Share state machine — intentionally distinct from
    # Ride.STATUS_CHOICES (regular 1:1 rides). Multi-passenger pickup/drop-off
    # needs extra states. Keep these values; do not rename onto Ride.
    # Must stay aligned with RideStatusService.SHARE_RIDE_STATUSES.
    STATUS_CHOICES = [
        ("requested", "Requested"),
        ("matching", "Matching"),
        ("driver_assigned", "Driver Assigned"),
        ("driver_arriving", "Driver Arriving"),
        ("passenger_pickup", "Passenger Pickup"),
        ("additional_pickup", "Additional Pickup"),
        ("in_progress", "In Progress"),
        ("drop_off_stop", "Drop-off Stop"),
        ("completed", "Completed"),
        ("cancelled", "Cancelled"),
    ]

    driver = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="share_sessions_as_driver",
    )

    status = models.CharField(
        max_length=30,
        choices=STATUS_CHOICES,
        default="matching",
    )

    total_fare = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
    )

    platform_commission = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
    )

    driver_earnings = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
    )

    commission_rate = models.DecimalField(
        max_digits=4,
        decimal_places=2,
        default=0.20,
    )

    route_similarity_score = models.FloatField(default=0.0)

    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["status"], name="share_session_status_idx"),
            models.Index(fields=["driver", "status"], name="share_session_driver_idx"),
            models.Index(fields=["-created_at"], name="share_session_created_idx"),
        ]

    def __str__(self):
        return f"ShareSession #{self.id} ({self.status})"

    @property
    def passengers_count(self):
        """Number of non-cancelled rides in this session."""
        return self.rides.exclude(status="cancelled").count()

    @property
    def active_rides(self):
        """QuerySet of non-cancelled rides in this session."""
        return self.rides.exclude(status="cancelled")


class ShareSessionStop(models.Model):
    """Ordered stop in a Share session's optimized route."""

    STOP_TYPE_CHOICES = [
        ("pickup", "Pickup"),
        ("dropoff", "Drop-off"),
    ]

    session = models.ForeignKey(
        ShareRideSession,
        on_delete=models.CASCADE,
        related_name="stops",
    )

    ride = models.ForeignKey(
        "rides.Ride",
        on_delete=models.CASCADE,
        related_name="share_stops",
    )

    stop_type = models.CharField(
        max_length=10,
        choices=STOP_TYPE_CHOICES,
    )

    stop_order = models.IntegerField()

    location_name = models.CharField(max_length=255)

    latitude = models.FloatField()
    longitude = models.FloatField()

    eta_minutes = models.IntegerField(default=0)

    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["stop_order"]
        unique_together = ["session", "stop_order"]
        indexes = [
            models.Index(
                fields=["session", "stop_order"], name="share_stop_order_idx"
            ),
        ]

    def __str__(self):
        return f"Stop #{self.stop_order} ({self.stop_type}) - Session #{self.session_id}"
