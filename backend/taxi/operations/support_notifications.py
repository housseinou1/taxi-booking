"""Instant admin alerts for critical in-app support reports."""

from __future__ import annotations

import logging

from django.contrib.auth import get_user_model
from django.db.models import Q

from .executive_permissions import EXECUTIVE_GROUPS
from .models import BetaFeedback, LaunchAlert

logger = logging.getLogger(__name__)
User = get_user_model()


def _should_notify(feedback: BetaFeedback) -> bool:
    if feedback.is_emergency or feedback.category == "emergency":
        return True
    if feedback.category == "payment" and feedback.severity in {"P0", "P1"}:
        return True
    if feedback.category in {"driver", "rider"} and feedback.severity in {"P0", "P1"}:
        return True
    return False


def _alert_type_for(feedback: BetaFeedback) -> str | None:
    if feedback.is_emergency or feedback.category == "emergency":
        return "sos_event"
    if feedback.category == "payment":
        return "failed_payments"
    if feedback.category in {"driver", "rider"}:
        return "sos_event"
    return None


def _executive_staff():
    return (
        User.objects.filter(is_staff=True)
        .filter(Q(is_superuser=True) | Q(groups__name__in=EXECUTIVE_GROUPS))
        .distinct()
    )


def notify_support_admins(feedback: BetaFeedback) -> None:
    """Create launch alert + push notification for emergency, payment, and safety reports."""
    if not _should_notify(feedback):
        return

    alert_type = _alert_type_for(feedback)
    if not alert_type:
        return

    severity = "critical" if feedback.severity == "P0" or feedback.is_emergency else "high"
    LaunchAlert.objects.create(
        alert_type=alert_type,
        severity=severity,
        title=f"Support {feedback.reference}: {feedback.get_category_display()}",
        message=feedback.description[:500],
        metadata={
            "feedback_id": feedback.id,
            "reference": feedback.reference,
            "app_type": feedback.app_type,
            "category": feedback.category,
            "severity": feedback.severity,
        },
    )

    if feedback.is_emergency or feedback.category == "emergency":
        title = "Emergency support report"
    elif feedback.category == "payment":
        title = "Payment support alert"
    else:
        title = "Safety support alert"

    body = f"{feedback.reference}: {feedback.description[:120]}"
    data = {"type": "support_ticket", "feedback_id": feedback.id, "reference": feedback.reference}

    try:
        from notifications.push import send_push_to_user
    except ImportError:
        logger.warning("Push notifications unavailable for support alert %s", feedback.reference)
        return

    for admin in _executive_staff():
        try:
            send_push_to_user(admin, title, body, data=data, app_type="admin")
        except Exception:
            logger.exception("Failed push for support alert to user %s", admin.id)
