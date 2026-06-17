"""Delivery dispute management service."""

from datetime import timedelta

from django.db.models import Avg, Count, Q
from django.utils import timezone

from ..models import Delivery, DeliveryDispute


DISPUTE_WINDOW_HOURS = 48


class DisputeServiceError(Exception):
    """Raised when a dispute operation fails."""

    def __init__(self, message, code="dispute_error"):
        self.message = message
        self.code = code
        super().__init__(message)


class DisputeService:
    """Handles delivery dispute creation, resolution, and analytics."""

    def create_dispute(
        self,
        delivery: Delivery,
        rider,
        reason: str,
        description: str,
        photo_evidence=None,
    ) -> DeliveryDispute:
        """Create a dispute for a completed delivery.

        Args:
            delivery: The delivery being disputed.
            rider: The rider raising the dispute.
            reason: One of damaged, lost, late, wrong_item, other.
            description: Detailed description (max 500 chars).
            photo_evidence: Optional photo file.

        Returns:
            The created DeliveryDispute.

        Raises:
            DisputeServiceError: If validation fails.
        """
        # Must be the customer who ordered it
        if delivery.customer_id != rider.id:
            raise DisputeServiceError(
                "You can only dispute your own deliveries.",
                code="not_owner",
            )

        # Must be delivered
        if delivery.status != "delivered":
            raise DisputeServiceError(
                "Disputes can only be raised for completed deliveries.",
                code="not_delivered",
            )

        # 48-hour window check
        if delivery.delivered_at:
            window_end = delivery.delivered_at + timedelta(hours=DISPUTE_WINDOW_HOURS)
            if timezone.now() > window_end:
                raise DisputeServiceError(
                    "Disputes must be raised within 48 hours of delivery.",
                    code="dispute_window_expired",
                )

        # Check for existing open dispute
        existing = DeliveryDispute.objects.filter(
            delivery=delivery,
            rider=rider,
            status__in=["open", "in_review"],
        ).exists()
        if existing:
            raise DisputeServiceError(
                "You already have an open dispute for this delivery.",
                code="duplicate_dispute",
            )

        # Validate reason
        valid_reasons = [c[0] for c in DeliveryDispute.REASON_CHOICES]
        if reason not in valid_reasons:
            raise DisputeServiceError(
                f"Invalid reason. Must be one of: {', '.join(valid_reasons)}",
                code="invalid_reason",
            )

        # Validate description length
        if len(description) > 500:
            raise DisputeServiceError(
                "Description must be 500 characters or less.",
                code="description_too_long",
            )

        dispute = DeliveryDispute.objects.create(
            delivery=delivery,
            rider=rider,
            reason=reason,
            description=description,
            photo_evidence=photo_evidence,
            status="open",
        )

        return dispute

    def resolve_dispute(
        self,
        dispute: DeliveryDispute,
        admin_user,
        action: str,
        notes: str = "",
        refund_amount=None,
    ) -> DeliveryDispute:
        """Resolve a dispute with an admin action.

        Args:
            dispute: The dispute to resolve.
            admin_user: The admin performing the resolution.
            action: One of refund_full, refund_partial, reject, warn_driver.
            notes: Optional resolution notes.
            refund_amount: Required for partial refund.

        Returns:
            The updated DeliveryDispute.

        Raises:
            DisputeServiceError: If action is invalid.
        """
        valid_actions = [c[0] for c in DeliveryDispute.RESOLUTION_CHOICES]
        if action not in valid_actions:
            raise DisputeServiceError(
                f"Invalid action. Must be one of: {', '.join(valid_actions)}",
                code="invalid_action",
            )

        if dispute.status == "resolved":
            raise DisputeServiceError(
                "This dispute has already been resolved.",
                code="already_resolved",
            )

        if action == "refund_partial" and refund_amount is None:
            raise DisputeServiceError(
                "Refund amount is required for partial refunds.",
                code="missing_refund_amount",
            )

        # For full refund, set amount to delivery fare
        if action == "refund_full":
            refund_amount = dispute.delivery.fare

        dispute.status = "resolved"
        dispute.resolution = action
        dispute.resolution_notes = notes
        dispute.resolved_by = admin_user
        dispute.refund_amount = refund_amount
        dispute.resolved_at = timezone.now()
        dispute.save()

        return dispute

    def get_analytics(self, date_from=None, date_to=None) -> dict:
        """Get dispute analytics for a date range.

        Returns:
            Dict with dispute counts, resolution stats, and timing.
        """
        qs = DeliveryDispute.objects.all()

        if date_from:
            qs = qs.filter(created_at__gte=date_from)
        if date_to:
            qs = qs.filter(created_at__lte=date_to)

        total = qs.count()
        by_status = dict(qs.values_list("status").annotate(count=Count("id")).values_list("status", "count"))
        by_reason = dict(qs.values_list("reason").annotate(count=Count("id")).values_list("reason", "count"))

        # Average resolution time (for resolved disputes)
        resolved = qs.filter(status="resolved", resolved_at__isnull=False, created_at__isnull=False)
        avg_resolution_hours = None
        if resolved.exists():
            # Calculate manually since Avg on computed fields isn't straightforward
            total_hours = sum(
                (d.resolved_at - d.created_at).total_seconds() / 3600
                for d in resolved.only("created_at", "resolved_at")
            )
            avg_resolution_hours = round(total_hours / resolved.count(), 1)

        return {
            "total_disputes": total,
            "by_status": by_status,
            "by_reason": by_reason,
            "open_count": by_status.get("open", 0),
            "in_review_count": by_status.get("in_review", 0),
            "resolved_count": by_status.get("resolved", 0),
            "avg_resolution_hours": avg_resolution_hours,
        }
