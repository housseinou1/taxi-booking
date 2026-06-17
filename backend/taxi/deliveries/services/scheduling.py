"""Scheduled delivery management service."""

from datetime import timedelta

from django.utils import timezone

from ..models import Delivery


class ScheduledDeliveryService:
    """Handles scheduled delivery validation and broadcasting."""

    def validate_schedule(self, scheduled_pickup_at) -> tuple[bool, str]:
        """Validate that a scheduled pickup time is within acceptable range.

        Args:
            scheduled_pickup_at: The requested pickup datetime.

        Returns:
            Tuple of (is_valid, error_message).
        """
        if not scheduled_pickup_at:
            return False, "Scheduled pickup time is required."

        now = timezone.now()
        diff = scheduled_pickup_at - now

        if diff.total_seconds() < 1800:  # 30 minutes
            return False, "Scheduled pickup must be at least 30 minutes in the future."

        if diff.days > 7:
            return False, "Scheduled pickup cannot be more than 7 days ahead."

        return True, ""

    def get_due_deliveries(self, minutes_ahead: int = 15):
        """Find scheduled deliveries that are due for driver broadcasting.

        Returns deliveries that are:
        - Scheduled
        - Still in 'requested' status (no driver yet)
        - Due within `minutes_ahead` minutes from now

        Returns:
            QuerySet of Delivery objects ready for broadcasting.
        """
        now = timezone.now()
        window_end = now + timedelta(minutes=minutes_ahead)

        return Delivery.objects.filter(
            is_scheduled=True,
            status="requested",
            driver__isnull=True,
            scheduled_pickup_at__lte=window_end,
            scheduled_pickup_at__gte=now,
        )

    def get_unaccepted_overdue(self, minutes_overdue: int = 10):
        """Find scheduled deliveries that have been broadcast but not accepted.

        Returns deliveries that:
        - Are scheduled
        - Still in 'requested' status
        - Have a scheduled_pickup_at that is now overdue by `minutes_overdue` minutes

        These deliveries should trigger a notification to the rider.

        Returns:
            QuerySet of Delivery objects.
        """
        cutoff = timezone.now() - timedelta(minutes=minutes_overdue)

        return Delivery.objects.filter(
            is_scheduled=True,
            status="requested",
            driver__isnull=True,
            scheduled_pickup_at__lte=cutoff,
        )

    def process_scheduled_deliveries(self) -> dict:
        """Process all scheduled deliveries that are due.

        This method is intended to be called periodically (e.g., via Celery beat).

        Returns:
            Dict with counts of processed deliveries.
        """
        due = self.get_due_deliveries()
        overdue = self.get_unaccepted_overdue()

        # For now, return counts. WebSocket broadcasting will be wired in task 6.2.
        return {
            "due_for_broadcast": due.count(),
            "overdue_unaccepted": overdue.count(),
            "due_delivery_ids": list(due.values_list("id", flat=True)),
            "overdue_delivery_ids": list(overdue.values_list("id", flat=True)),
        }
