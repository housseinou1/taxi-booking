"""Privacy rules for who may view delivery chat transcripts."""

from django.db import models

from ..models import Delivery, DeliveryChatReport, DeliveryDispute


OPEN_DISPUTE_STATUSES = {"open", "in_review"}
OPEN_SAFETY_STATUSES = {"open", "acknowledged", "investigating"}
OPEN_REPORT_STATUSES = {"open"}


def delivery_has_open_dispute(delivery: Delivery) -> bool:
    return delivery.disputes.filter(status__in=OPEN_DISPUTE_STATUSES).exists()


def delivery_has_open_chat_report(delivery: Delivery) -> bool:
    return delivery.chat_reports.filter(status__in=OPEN_REPORT_STATUSES).exists()


def delivery_has_safety_incident(delivery: Delivery) -> bool:
    return delivery.safety_incidents.filter(status__in=OPEN_SAFETY_STATUSES).exists()


def delivery_has_refund_context(delivery: Delivery) -> bool:
    if delivery.payment_status in {"failed", "refunded"}:
        return True
    if delivery.status == "cancelled" and delivery.exception_resolution == "refund":
        return True
    return delivery.disputes.filter(
        resolution__in={"refund_full", "refund_partial"},
        status="resolved",
    ).exists()


def admin_can_view_chat(delivery: Delivery) -> bool:
    """Admin/support may view chat only for flagged delivery cases."""
    if delivery.status == "delivery_exception":
        return True
    if delivery.status == "cancelled":
        return True
    if delivery_has_open_dispute(delivery):
        return True
    if delivery_has_open_chat_report(delivery):
        return True
    if delivery_has_safety_incident(delivery):
        return True
    if delivery_has_refund_context(delivery):
        return True
    if delivery.exception_reason or delivery.exception_reported_at:
        return True
    return False


def get_chat_case_reasons(delivery: Delivery) -> list[str]:
    reasons = []
    if delivery.status == "delivery_exception":
        reasons.append("delivery_exception")
    if delivery.status == "cancelled":
        reasons.append("failed_delivery")
    if delivery.payment_status == "failed":
        if "failed_delivery" not in reasons:
            reasons.append("failed_delivery")
    if delivery_has_open_dispute(delivery):
        reasons.append("dispute")
    if delivery.disputes.exists():
        reasons.append("complaint")
    if delivery_has_open_chat_report(delivery):
        reasons.append("chat_report")
    if delivery_has_safety_incident(delivery):
        reasons.append("safety_report")
    if delivery_has_refund_context(delivery):
        reasons.append("refund_request")
    if delivery.exception_reason:
        if "pin" in delivery.exception_reason:
            reasons.append("pin_issue")
    return list(dict.fromkeys(reasons))


def eligible_admin_chat_deliveries():
    """Deliveries whose chat history admins may review."""
    dispute_ids = DeliveryDispute.objects.filter(
        status__in=OPEN_DISPUTE_STATUSES
    ).values_list("delivery_id", flat=True)
    report_ids = DeliveryChatReport.objects.filter(
        status__in=OPEN_REPORT_STATUSES
    ).values_list("delivery_id", flat=True)

    return (
        Delivery.objects.select_related("customer", "driver")
        .filter(
            models.Q(status__in=["delivery_exception", "cancelled"])
            | models.Q(id__in=dispute_ids)
            | models.Q(id__in=report_ids)
            | models.Q(safety_incidents__status__in=OPEN_SAFETY_STATUSES)
            | models.Q(payment_status__in=["failed", "refunded"])
            | models.Q(exception_reason__gt="")
        )
        .distinct()
        .order_by("-updated_at")
    )
