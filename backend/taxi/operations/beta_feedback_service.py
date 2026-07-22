"""In-app support and beta feedback service layer."""

from __future__ import annotations

from django.contrib.auth import get_user_model
from django.db.models import Avg, Count, DurationField, ExpressionWrapper, F
from django.utils import timezone

from .models import BetaFeedback
from .support_notifications import notify_support_admins

User = get_user_model()

OPEN_STATUSES = {"open", "assigned", "waiting"}
TERMINAL_STATUSES = {"resolved", "closed"}

LEGACY_STATUS_MAP = {
    "new": "open",
    "investigating": "assigned",
    "fixed": "resolved",
}

APP_CATEGORIES = {
    "rider": {
        "emergency",
        "ride",
        "payment",
        "driver",
        "gps",
        "bug",
        "suggestion",
        "contact",
        "other",
    },
    "driver": {
        "emergency",
        "rider",
        "payment",
        "gps",
        "vehicle",
        "withdrawal",
        "suggestion",
        "contact",
        "other",
    },
    "delivery": {
        "customer",
        "store",
        "delivery",
        "payment",
        "gps",
        "suggestion",
        "emergency",
        "other",
    },
}

CATEGORY_DEFAULTS = {
    "emergency": {"severity": "P0", "is_emergency": True},
    "payment": {"severity": "P1", "is_emergency": False},
    "gps": {"severity": "P1", "is_emergency": False},
    "withdrawal": {"severity": "P1", "is_emergency": False},
    "driver": {"severity": "P2", "is_emergency": False},
    "rider": {"severity": "P2", "is_emergency": False},
    "ride": {"severity": "P2", "is_emergency": False},
    "bug": {"severity": "P2", "is_emergency": False},
    "crash": {"severity": "P0", "is_emergency": False},
    "suggestion": {"severity": "P3", "is_emergency": False},
    "contact": {"severity": "P2", "is_emergency": False},
}


def _normalize_status(status: str | None) -> str | None:
    if not status:
        return None
    return LEGACY_STATUS_MAP.get(status, status)


def _next_reference() -> str:
    today = timezone.localdate().strftime("%Y%m%d")
    prefix = f"BF-{today}-"
    last = (
        BetaFeedback.objects.filter(reference__startswith=prefix)
        .order_by("-reference")
        .values_list("reference", flat=True)
        .first()
    )
    if last:
        try:
            seq = int(last.rsplit("-", 1)[-1]) + 1
        except ValueError:
            seq = 1
    else:
        seq = 1
    return f"{prefix}{seq:04d}"


def infer_app_type(user, requested: str | None = None) -> str:
    if requested in {"rider", "driver", "delivery"}:
        return requested
    profile = getattr(user, "driver_profile", None)
    if profile is not None:
        delivery_settings = getattr(user, "delivery_settings", None)
        if delivery_settings and getattr(delivery_settings, "delivery_mode_enabled", False):
            return "delivery"
        return "driver"
    return "rider"


def validate_category(app_type: str, category: str) -> str:
    allowed = APP_CATEGORIES.get(app_type, APP_CATEGORIES["rider"])
    if category not in allowed:
        return "other"
    return category


def serialize_feedback(row: BetaFeedback, request=None) -> dict:
    screenshot_url = None
    if row.screenshot:
        if request:
            screenshot_url = request.build_absolute_uri(row.screenshot.url)
        else:
            screenshot_url = row.screenshot.url

    return {
        "id": row.id,
        "reference": row.reference,
        "user_id": row.user_id,
        "user_email": row.user.email if row.user_id else None,
        "user_name": row.user.get_full_name() if row.user_id else None,
        "app_type": row.app_type,
        "category": row.category,
        "severity": row.severity,
        "subject": row.subject,
        "description": row.description,
        "screenshot_url": screenshot_url,
        "device": row.device,
        "app_version": row.app_version,
        "is_emergency": row.is_emergency,
        "metadata": row.metadata or {},
        "status": row.status,
        "owner_id": row.owner_id,
        "owner_email": row.owner.email if row.owner_id else None,
        "created_at": row.created_at.isoformat(),
        "updated_at": row.updated_at.isoformat(),
        "first_response_at": row.first_response_at.isoformat() if row.first_response_at else None,
        "resolved_at": row.resolved_at.isoformat() if row.resolved_at else None,
    }


def create_beta_feedback(user, data, screenshot=None) -> BetaFeedback:
    app_type = infer_app_type(user, data.get("app_type"))
    category = validate_category(app_type, (data.get("category") or "other").strip())
    defaults = CATEGORY_DEFAULTS.get(category, {"severity": "P2", "is_emergency": False})

    is_emergency = str(data.get("is_emergency", "")).lower() in {"1", "true", "yes"}
    is_emergency = is_emergency or defaults.get("is_emergency", False)

    severity = (data.get("severity") or defaults.get("severity") or "P2").upper()
    if severity not in dict(BetaFeedback.SEVERITY_CHOICES):
        severity = defaults.get("severity", "P2")

    if is_emergency:
        severity = "P0"
        category = "emergency" if category not in {"emergency"} else category

    metadata = data.get("metadata")
    if isinstance(metadata, str):
        try:
            import json

            metadata = json.loads(metadata)
        except (TypeError, ValueError):
            metadata = {}
    if not isinstance(metadata, dict):
        metadata = {}

    for key in ("ride_id", "delivery_id", "payment_method", "phone"):
        if data.get(key):
            metadata[key] = data.get(key)

    feedback = BetaFeedback.objects.create(
        reference=_next_reference(),
        user=user,
        app_type=app_type,
        category=category,
        severity=severity,
        subject=(data.get("subject") or "")[:200],
        description=(data.get("description") or "").strip(),
        screenshot=screenshot,
        device=(data.get("device") or "")[:200],
        app_version=(data.get("app_version") or "")[:40],
        is_emergency=is_emergency,
        metadata=metadata,
        status="open",
    )
    notify_support_admins(feedback)
    return feedback


def list_beta_feedback(filters: dict | None = None, request=None) -> list[dict]:
    qs = BetaFeedback.objects.select_related("user", "owner")
    filters = filters or {}

    if filters.get("app_type"):
        qs = qs.filter(app_type=filters["app_type"])
    if filters.get("severity"):
        qs = qs.filter(severity=filters["severity"])
    if filters.get("priority"):
        qs = qs.filter(severity=filters["priority"])
    if filters.get("category"):
        qs = qs.filter(category=filters["category"])
    status = _normalize_status(filters.get("status"))
    if status:
        qs = qs.filter(status=status)
    if filters.get("queue"):
        queue = filters["queue"]
        if queue in OPEN_STATUSES | TERMINAL_STATUSES:
            qs = qs.filter(status=queue)
    if filters.get("owner_id"):
        qs = qs.filter(owner_id=filters["owner_id"])
    if filters.get("emergency") in {"1", "true", True}:
        qs = qs.filter(is_emergency=True)

    return [serialize_feedback(row, request=request) for row in qs[:500]]


def get_beta_feedback(feedback_id: int, request=None) -> dict | None:
    row = BetaFeedback.objects.select_related("user", "owner").filter(id=feedback_id).first()
    if not row:
        return None
    return serialize_feedback(row, request=request)


def _touch_first_response(row: BetaFeedback) -> None:
    if not row.first_response_at:
        row.first_response_at = timezone.now()


def update_beta_feedback(feedback_id: int, payload: dict, actor) -> BetaFeedback | None:
    row = BetaFeedback.objects.filter(id=feedback_id).first()
    if not row:
        return None

    if "owner_id" in payload:
        owner_id = payload.get("owner_id")
        if owner_id in (None, "", 0):
            row.owner = None
        else:
            row.owner = User.objects.filter(id=owner_id, is_staff=True).first()
        if row.owner_id and row.status == "open":
            row.status = "assigned"
            _touch_first_response(row)

    status = _normalize_status(payload.get("status"))
    if status in dict(BetaFeedback.STATUS_CHOICES):
        if status != row.status:
            row.status = status
            if status in TERMINAL_STATUSES and not row.resolved_at:
                row.resolved_at = timezone.now()
            elif status in OPEN_STATUSES:
                row.resolved_at = None
            if status in {"assigned", "waiting"}:
                _touch_first_response(row)

    row.save()
    return row


def build_beta_feedback_dashboard() -> dict:
    qs = BetaFeedback.objects.all()
    open_qs = qs.filter(status__in=OPEN_STATUSES)

    avg_resolution = (
        qs.filter(resolved_at__isnull=False)
        .annotate(
            resolution_time=ExpressionWrapper(
                F("resolved_at") - F("created_at"),
                output_field=DurationField(),
            )
        )
        .aggregate(avg=Avg("resolution_time"))["avg"]
    )
    avg_resolution_hours = round(avg_resolution.total_seconds() / 3600, 1) if avg_resolution else None

    avg_response = (
        qs.filter(first_response_at__isnull=False)
        .annotate(
            response_time=ExpressionWrapper(
                F("first_response_at") - F("created_at"),
                output_field=DurationField(),
            )
        )
        .aggregate(avg=Avg("response_time"))["avg"]
    )
    avg_response_hours = round(avg_response.total_seconds() / 3600, 1) if avg_response else None

    by_app = {row["app_type"]: row["count"] for row in qs.values("app_type").annotate(count=Count("id"))}
    by_status = {row["status"]: row["count"] for row in qs.values("status").annotate(count=Count("id"))}

    top_categories = list(
        qs.values("category")
        .annotate(count=Count("id"))
        .order_by("-count")[:5]
    )

    queue_counts = {
        status: qs.filter(status=status).count()
        for status, _ in BetaFeedback.STATUS_CHOICES
    }

    return {
        "generated_at": timezone.now().isoformat(),
        "total_reports": qs.count(),
        "open_reports": open_qs.count(),
        "open_tickets": open_qs.count(),
        "critical_issues": open_qs.filter(severity="P0").count(),
        "p0_open": open_qs.filter(severity="P0").count(),
        "p1_open": open_qs.filter(severity="P1").count(),
        "average_response_hours": avg_response_hours,
        "average_resolution_hours": avg_resolution_hours,
        "top_categories": top_categories,
        "by_app": by_app,
        "by_status": by_status,
        "queue_counts": queue_counts,
    }
