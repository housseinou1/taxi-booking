"""Admin delivery & courier management endpoints (Phase 5 — Yala Delivery).

Additive, ``IsAdminUser``-gated endpoints that back the admin Delivery module:
delivery overview KPIs, the courier directory, per-courier detail (profile,
delivery settings, documents, electronic signature, onboarding checklist,
earnings, wallet, delivery history) and courier account actions.

Design rules (aligned with the driver / riders admin modules):

- **Couriers are drivers with delivery settings.** A courier is a
  ``DriverProfile`` whose user has a ``DriverDeliverySettings`` row. This matches
  ``taxi.drivers.views._driver_is_courier`` and the approval-center counting.
- **Documents are never served from the public media URL.** The new payloads
  return only metadata; the file itself is streamed through an authenticated
  admin-only endpoint (mirrors the riders identity-document endpoint).
- **Approve / reject keep living in the approval-center endpoint**
  (``security.views.admin_courier_action``) so the courier electronic-signature
  gate has a single source of truth. Only delivery-mode suspend / reactivate are
  added here, with a mandatory reason and audit logging.
- **Read-only money.** Earnings are sums over already-computed
  ``driver_earning`` / ``platform_commission`` values. No financial transaction,
  wallet balance, payout or refund is created or mutated by this module.
"""

from __future__ import annotations

from decimal import Decimal

from django.db.models import Count, Q, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response

from legal.services import courier_has_complete_signature, serialize_courier_signature
from merchants.models import Merchant
from taxi.drivers.models import DriverDocument, DriverProfile
from taxi.drivers.services.document_service import (
    DocumentService,
    get_document_display_status,
)

from .courier_onboarding import (
    build_courier_onboarding_state,
    get_required_courier_document_types,
)
from .admin_metrics import build_courier_operations_metrics
from .models import Delivery, DeliveryDispute, DriverDeliverySettings

COURIER_DOCUMENT_LABELS = {
    "national_id": "National ID",
    "license": "Driver License",
    "carte_grise": "Registration",
    "insurance": "Insurance",
    "profile_photo": "Profile Photo",
}

COURIER_STATUS_LABELS = {
    "pending": "Pending",
    "pending_review": "Pending Review",
    "approved": "Approved",
    "rejected": "Rejected",
    "suspended": "Suspended",
}

ACTIVE_DELIVERY_STATUSES = [
    "requested",
    "accepted",
    "courier_arriving",
    "picked_up",
    "in_transit",
    "delivering",
    "delivery_exception",
]

COURIER_SORT_FIELDS = {
    "newest": "-user__date_joined",
    "oldest": "user__date_joined",
    "name": "user__first_name",
    "status": "status",
    "rating": "-delivery_rating",
    "deliveries": "-total_deliveries_completed",
}


class AdminCouriersPagination(PageNumberPagination):
    """Server-side pagination for the admin courier directory."""

    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 100

    def get_paginated_response(self, data):
        page_size = self.get_page_size(self.request) or self.page_size
        return Response(
            {
                "count": self.page.paginator.count,
                "page": self.page.number,
                "page_size": page_size,
                "total_pages": self.page.paginator.num_pages,
                "next": self.get_next_link(),
                "previous": self.get_previous_link(),
                "results": data,
            }
        )


def _courier_settings_qs():
    return DriverDeliverySettings.objects.select_related("driver")


def _courier_profile_ids():
    """User ids that have courier delivery settings (courier registration)."""
    return _courier_settings_qs().values_list("driver_id", flat=True)


def _courier_queryset():
    """DriverProfile rows that are couriers, with user/city prefetched."""
    return (
        DriverProfile.objects.filter(user_id__in=_courier_profile_ids())
        .select_related("user", "user__city")
        .order_by("-user__date_joined")
    )


def _settings_for(profile):
    return DriverDeliverySettings.objects.filter(driver_id=profile.user_id).first()


def _courier_online(profile, settings) -> bool:
    """Same definition the driver serializer uses for ``courier_online``."""
    return bool(
        settings
        and settings.delivery_mode_enabled
        and profile.user.is_active
        and profile.status == "approved"
        and not settings.is_suspended
    )


def _document_counts(profile):
    rows = (
        DriverDocument.objects.filter(driver=profile)
        .values("status")
        .annotate(total=Count("id"))
    )
    counts = {"pending_review": 0, "approved": 0, "rejected": 0}
    for row in rows:
        counts[row["status"]] = row["total"]
    counts["total"] = sum(counts.values())
    return counts


def _serialize_admin_courier_document(document):
    """Admin-safe document metadata — never exposes the storage path/URL."""
    return {
        "id": document.id,
        "type": document.document_type,
        "label": COURIER_DOCUMENT_LABELS.get(
            document.document_type,
            document.get_document_type_display(),
        ),
        "status": document.status,
        "display_status": get_document_display_status(document),
        "is_uploaded": bool(document.file),
        "uploaded_at": document.uploaded_at,
        "issued_at": document.issued_at,
        "expires_at": document.expires_at,
        "rejection_reason": document.rejection_reason,
        "reviewed_at": document.reviewed_at,
    }


def _serialize_admin_courier(profile, settings=None, document_counts=None):
    """Directory row for one courier. No file URLs, no identity numbers."""
    settings = settings if settings is not None else _settings_for(profile)
    counts = document_counts if document_counts is not None else _document_counts(profile)
    is_suspended = bool(settings and settings.is_suspended)
    courier_status = "suspended" if is_suspended else profile.status
    return {
        "id": profile.id,
        "user_id": profile.user_id,
        "name": profile.user.get_full_name() or profile.user.email,
        "email": profile.user.email,
        "phone_number": profile.phone_number or profile.user.phone_number or "",
        "phone_verified": bool(getattr(profile.user, "is_phone_verified", False)),
        "is_active": profile.user.is_active,
        "status": profile.status,
        "status_label": COURIER_STATUS_LABELS.get(profile.status, profile.status),
        "courier_status": courier_status,
        "courier_status_label": COURIER_STATUS_LABELS.get(courier_status, courier_status),
        "rejection_reason": profile.application_rejection_reason or "",
        "is_suspended": is_suspended,
        "suspension_reason": (settings.suspension_reason if is_suspended else "") or "",
        "delivery_mode_enabled": bool(settings and settings.delivery_mode_enabled),
        "courier_online": _courier_online(profile, settings),
        "vehicle_type": (settings.delivery_vehicle_type if settings else "") or "",
        "city_name": profile.user.city.name if profile.user.city else "",
        "plate_number": profile.vehicle_plate or profile.plate_number or "",
        "total_deliveries_completed": (
            settings.total_deliveries_completed if settings else 0
        ),
        "delivery_rating": str(settings.delivery_rating) if settings else None,
        "signature_complete": courier_has_complete_signature(profile),
        "documents_total": counts["total"],
        "documents_pending": counts["pending_review"],
        "documents_approved": counts["approved"],
        "date_joined": profile.user.date_joined,
    }
def _earnings_buckets(user):
    """Read-only earnings sums for a courier (today / week / month / total)."""
    deliveries = Delivery.objects.filter(driver=user, status="delivered")
    now = timezone.now()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timezone.timedelta(days=today_start.weekday())
    month_start = today_start.replace(day=1)

    def bucket(start=None):
        items = deliveries if start is None else deliveries.filter(delivered_at__gte=start)
        earnings = items.aggregate(total=Sum("driver_earning"))["total"] or Decimal("0")
        commission = items.aggregate(total=Sum("platform_commission"))["total"] or Decimal("0")
        return {
            "count": items.count(),
            "earnings": str(earnings),
            "commission": str(commission),
        }

    return {
        "today": bucket(today_start),
        "week": bucket(week_start),
        "month": bucket(month_start),
        "total": bucket(None),
    }


def _serialize_admin_delivery(delivery):
    """Admin-safe delivery row (no pickup/drop-off PINs, no PIN hashes)."""
    return {
        "id": delivery.id,
        "status": delivery.status,
        "service_category": delivery.service_category,
        "package_type": delivery.package_type,
        "pickup": delivery.pickup,
        "destination": delivery.destination,
        "distance_km": str(delivery.distance_km),
        "fare": str(delivery.fare),
        "driver_earning": str(delivery.driver_earning),
        "platform_commission": str(delivery.platform_commission),
        "payment_status": delivery.payment_status,
        "payment_method": delivery.payment_method,
        "customer_name": delivery.customer.get_full_name() or delivery.customer.email,
        "created_at": delivery.created_at,
        "accepted_at": delivery.accepted_at,
        "delivered_at": delivery.delivered_at,
        "customer_rating": delivery.customer_rating,
    }


def _courier_deliveries_queryset(user):
    return (
        Delivery.objects.filter(driver=user)
        .select_related("customer")
        .order_by("-created_at")
    )


def _courier_delivery_summary(user):
    agg = Delivery.objects.filter(driver=user).aggregate(
        total=Count("id"),
        delivered=Count("id", filter=Q(status="delivered")),
        cancelled=Count("id", filter=Q(status="cancelled")),
        active=Count("id", filter=Q(status__in=ACTIVE_DELIVERY_STATUSES)),
        exceptions=Count("id", filter=Q(status="delivery_exception")),
    )
    return {
        "total": agg["total"] or 0,
        "delivered": agg["delivered"] or 0,
        "cancelled": agg["cancelled"] or 0,
        "active": agg["active"] or 0,
        "exceptions": agg["exceptions"] or 0,
    }


# ─── Delivery overview ────────────────────────────────────────────────────────


@api_view(["GET"])
@permission_classes([IsAdminUser])
def admin_delivery_overview(request):
    """Delivery-module KPIs: courier queue, delivery volumes, merchant snapshot.

    All values are counts / read-only sums — nothing is mutated.
    """
    courier_ids = list(_courier_profile_ids())
    settings_qs = DriverDeliverySettings.objects.filter(driver_id__in=courier_ids)
    profiles = DriverProfile.objects.filter(user_id__in=courier_ids)

    couriers = {
        "total": len(courier_ids),
        "approved": profiles.filter(status="approved", user__is_active=True).count(),
        "pending": profiles.filter(status__in=["pending", "pending_review"]).count(),
        "rejected": profiles.filter(status="rejected").count(),
        "suspended": settings_qs.filter(is_suspended=True).count(),
        "online": profiles.filter(
            status="approved",
            user__is_active=True,
            user_id__in=settings_qs.filter(
                is_suspended=False, delivery_mode_enabled=True
            ).values_list("driver_id", flat=True),
        ).count(),
    }

    deliveries_agg = Delivery.objects.aggregate(
        total=Count("id"),
        active=Count("id", filter=Q(status__in=ACTIVE_DELIVERY_STATUSES)),
        delivered=Count("id", filter=Q(status="delivered")),
        cancelled=Count("id", filter=Q(status="cancelled")),
        exceptions=Count("id", filter=Q(status="delivery_exception")),
    )
    delivered_fare = (
        Delivery.objects.filter(status="delivered").aggregate(total=Sum("fare"))["total"]
        or Decimal("0")
    )

    recent = [
        _serialize_admin_delivery(row)
        for row in Delivery.objects.select_related("customer").order_by("-created_at")[:10]
    ]

    merchants_agg = Merchant.objects.aggregate(
        total=Count("id"),
        pending=Count("id", filter=Q(status="pending")),
        approved=Count("id", filter=Q(status="approved")),
        suspended=Count("id", filter=Q(status="suspended")),
    )

    return Response(
        {
            "couriers": couriers,
            "deliveries": {
                "total": deliveries_agg["total"] or 0,
                "active": deliveries_agg["active"] or 0,
                "delivered": deliveries_agg["delivered"] or 0,
                "cancelled": deliveries_agg["cancelled"] or 0,
                "exceptions": deliveries_agg["exceptions"] or 0,
                "delivered_fare": str(delivered_fare),
            },
            "open_disputes": DeliveryDispute.objects.exclude(
                status__in=["resolved", "rejected"]
            ).count(),
            "merchants": {
                "total": merchants_agg["total"] or 0,
                "pending": merchants_agg["pending"] or 0,
                "approved": merchants_agg["approved"] or 0,
                "suspended": merchants_agg["suspended"] or 0,
            },
            "recent_deliveries": recent,
            # Task 7 (additive): busy / available / offline couriers and pending deliveries.
            # Definitions live in admin_metrics.py and are returned under "definitions".
            "operations": build_courier_operations_metrics(),
        }
    )


# ─── Courier directory ────────────────────────────────────────────────────────


def _courier_queue_filter(queryset, queue):
    """Apply the directory's queue filter. Unknown values are ignored."""
    settings_qs = DriverDeliverySettings.objects
    if queue == "pending":
        return queryset.filter(status__in=["pending", "pending_review"])
    if queue == "approved":
        return queryset.filter(status="approved")
    if queue == "rejected":
        return queryset.filter(status="rejected")
    if queue == "suspended":
        return queryset.filter(
            user_id__in=settings_qs.filter(is_suspended=True).values_list("driver_id", flat=True)
        )
    if queue == "online":
        return queryset.filter(
            status="approved",
            user__is_active=True,
            user_id__in=settings_qs.filter(
                is_suspended=False, delivery_mode_enabled=True
            ).values_list("driver_id", flat=True),
        )
    return queryset


def _courier_summary():
    """Queue counts across the whole courier universe (not the current filter)."""
    courier_ids = list(_courier_profile_ids())
    settings_qs = DriverDeliverySettings.objects.filter(driver_id__in=courier_ids)
    profiles = DriverProfile.objects.filter(user_id__in=courier_ids)
    return {
        "total": len(courier_ids),
        "approved": profiles.filter(status="approved", user__is_active=True).count(),
        "pending": profiles.filter(status__in=["pending", "pending_review"]).count(),
        "rejected": profiles.filter(status="rejected").count(),
        "suspended": settings_qs.filter(is_suspended=True).count(),
        "online": profiles.filter(
            status="approved",
            user__is_active=True,
            user_id__in=settings_qs.filter(
                is_suspended=False, delivery_mode_enabled=True
            ).values_list("driver_id", flat=True),
        ).count(),
    }


@api_view(["GET"])
@permission_classes([IsAdminUser])
def admin_couriers_list(request):
    """Paginated courier directory with filters and summary counts.

    Query params: search, queue (all|pending|approved|rejected|suspended|online),
    status (DriverProfile status), vehicle_type, ordering, page, page_size.
    """
    queryset = _courier_queryset()

    search = (request.query_params.get("search") or "").strip()
    if search:
        queryset = queryset.filter(
            Q(user__first_name__icontains=search)
            | Q(user__last_name__icontains=search)
            | Q(user__email__icontains=search)
            | Q(user__phone_number__icontains=search)
            | Q(phone_number__icontains=search)
            | Q(plate_number__icontains=search)
            | Q(vehicle_plate__icontains=search)
        )

    queue = (request.query_params.get("queue") or "all").strip().lower()
    queryset = _courier_queue_filter(queryset, queue)

    status_filter = (request.query_params.get("status") or "").strip().lower()
    if status_filter and status_filter != "all":
        queryset = queryset.filter(status=status_filter)

    vehicle_type = (request.query_params.get("vehicle_type") or "").strip().lower()
    if vehicle_type and vehicle_type != "all":
        queryset = queryset.filter(
            user_id__in=DriverDeliverySettings.objects.filter(
                delivery_vehicle_type=vehicle_type
            ).values_list("driver_id", flat=True)
        )

    ordering = (request.query_params.get("ordering") or "newest").strip()
    queryset = queryset.order_by(
        COURIER_SORT_FIELDS.get(ordering, COURIER_SORT_FIELDS["newest"])
    )

    paginator = AdminCouriersPagination()
    page = paginator.paginate_queryset(queryset, request)

    settings_map = {
        row.driver_id: row
        for row in DriverDeliverySettings.objects.filter(
            driver_id__in=[profile.user_id for profile in page]
        )
    }

    response = paginator.get_paginated_response(
        [
            _serialize_admin_courier(profile, settings=settings_map.get(profile.user_id))
            for profile in page
        ]
    )
    response.data["summary"] = _courier_summary()
    return response



# ─── Courier detail ───────────────────────────────────────────────────────────


@api_view(["GET"])
@permission_classes([IsAdminUser])
def admin_courier_detail(request, driver_id):
    """Read-only courier profile: account, settings, documents, signature,
    onboarding checklist, earnings, wallet, delivery stats and history.

    Document metadata only — the files are streamed by the authenticated
    ``admin_courier_document`` endpoint, never from a public media URL.
    """
    from payments.settlement_service import courier_balance_summary

    profile = get_object_or_404(_courier_queryset(), pk=driver_id)
    settings = _settings_for(profile)
    vehicle_type = (settings.delivery_vehicle_type if settings else "") or "motorcycle"

    documents = DriverDocument.objects.filter(driver=profile).order_by(
        "document_type", "-uploaded_at"
    )
    required_types = get_required_courier_document_types(vehicle_type)
    expired_alerts = DocumentService().get_expired_or_missing(
        profile, required_types=required_types
    )

    deliveries = _courier_deliveries_queryset(profile.user)
    active_delivery = deliveries.filter(status__in=ACTIVE_DELIVERY_STATUSES).first()

    # The shared courier-signature serializer exposes a PUBLIC media URL (the
    # courier app and the approval center rely on that contract). The admin UI
    # must not use it, so the URL is replaced here by an availability flag and the
    # image is streamed by the authenticated ``admin_courier_signature`` endpoint.
    signature = serialize_courier_signature(profile, request)
    signature["signature_image_available"] = bool(signature.pop("signature_image_url", ""))

    # ``build_courier_onboarding_state`` embeds the same serializer (with the same
    # public URL) under onboarding.signature — strip it there too so no admin
    # payload carries a public path to someone else's signature.
    onboarding = build_courier_onboarding_state(profile.user, request)
    nested_signature = onboarding.get("signature")
    if isinstance(nested_signature, dict) and nested_signature:
        nested_signature["signature_image_available"] = bool(
            nested_signature.pop("signature_image_url", "")
        )

    return Response(
        {
            **_serialize_admin_courier(profile, settings=settings),
            "onboarding": onboarding,
            "documents": [_serialize_admin_courier_document(doc) for doc in documents],
            "required_document_types": required_types,
            "expired_document_alerts": [
                {
                    "document_type": alert.document_type,
                    "label": COURIER_DOCUMENT_LABELS.get(
                        alert.document_type,
                        alert.document_type.replace("_", " ").title(),
                    ),
                    "reason": alert.reason,
                    "expires_at": alert.expires_at.isoformat() if alert.expires_at else None,
                }
                for alert in expired_alerts
            ],
            "legal_signature": signature,
            "delivery_settings": {
                "delivery_mode_enabled": bool(settings and settings.delivery_mode_enabled),
                "vehicle_type": vehicle_type,
                "max_package_size": settings.max_package_size if settings else "",
                "accepts_food": bool(settings and settings.accepts_food),
                "accepts_pharmacy": bool(settings and settings.accepts_pharmacy),
                "accepts_fragile": bool(settings and settings.accepts_fragile),
                "delivery_cities": list(settings.delivery_cities) if settings else [],
                "is_suspended": bool(settings and settings.is_suspended),
                "suspension_reason": (settings.suspension_reason if settings else "") or "",
                "chat_warnings": settings.chat_warnings if settings else 0,
            },
            "earnings": _earnings_buckets(profile.user),
            "wallet": courier_balance_summary(profile.user),
            "delivery_summary": _courier_delivery_summary(profile.user),
            "active_delivery": (
                _serialize_admin_delivery(active_delivery) if active_delivery else None
            ),
            "recent_deliveries": [
                _serialize_admin_delivery(row) for row in deliveries[:5]
            ],
        }
    )


@api_view(["GET"])
@permission_classes([IsAdminUser])
def admin_courier_deliveries(request, driver_id):
    """Paginated delivery history for one courier.

    Query params: status, page, page_size.
    """
    profile = get_object_or_404(_courier_queryset(), pk=driver_id)
    queryset = _courier_deliveries_queryset(profile.user)

    status_filter = (request.query_params.get("status") or "").strip().lower()
    if status_filter and status_filter != "all":
        queryset = queryset.filter(status=status_filter)

    paginator = AdminCouriersPagination()
    page = paginator.paginate_queryset(queryset, request)
    response = paginator.get_paginated_response(
        [_serialize_admin_delivery(row) for row in page]
    )
    response.data["summary"] = _courier_delivery_summary(profile.user)
    return response


@api_view(["GET"])
@permission_classes([IsAdminUser])
def admin_courier_document(request, driver_id, document_id):
    """Admin-only, authenticated access to a courier document file.

    Courier documents (national ID, licence, insurance, registration) must not be
    served from the public media URL. Streams the file to authenticated
    administrators only and never exposes the storage path.
    """
    from django.http import FileResponse

    profile = get_object_or_404(_courier_queryset(), pk=driver_id)
    document = get_object_or_404(DriverDocument, pk=document_id, driver=profile)

    if not document.file:
        return Response({"detail": "No file on this document."}, status=404)
    try:
        handle = document.file.open("rb")
    except FileNotFoundError:
        return Response({"detail": "Document file is missing."}, status=404)

    return FileResponse(
        handle,
        as_attachment=False,
        filename=f"courier-{profile.id}-{document.document_type}",
    )



# ─── Courier account actions ──────────────────────────────────────────────────


@api_view(["GET"])
@permission_classes([IsAdminUser])
def admin_courier_signature(request, driver_id):
    """Admin-only, authenticated access to a courier's electronic signature image.

    The shared courier-signature serializer returns a public media URL, which is
    correct for the courier app (own signature) but must not be the way admins
    read someone else's signature. This streams the stored image to authenticated
    administrators only and never exposes the storage path.

    Returns 404 when the courier has no signature image on file.
    """
    from django.http import FileResponse

    profile = get_object_or_404(_courier_queryset(), pk=driver_id)
    if not profile.signature_image:
        return Response({"detail": "No signature image on file."}, status=404)

    try:
        handle = profile.signature_image.open("rb")
    except FileNotFoundError:
        return Response({"detail": "Signature image file is missing."}, status=404)

    # Explicit content type: signature images are PNG/JPEG captures. FileResponse
    # would otherwise fall back to application/octet-stream for these names, which
    # stops browsers rendering them inline.
    name = (profile.signature_image.name or "").lower()
    if name.endswith(".jpg") or name.endswith(".jpeg"):
        content_type = "image/jpeg"
    elif name.endswith(".webp"):
        content_type = "image/webp"
    else:
        content_type = "image/png"

    response = FileResponse(
        handle,
        as_attachment=False,
        filename=f"courier-{profile.id}-signature",
        content_type=content_type,
    )
    # Private, never cached by shared caches.
    response["Cache-Control"] = "private, no-store"
    response["X-Content-Type-Options"] = "nosniff"
    return response


@api_view(["POST"])
@permission_classes([IsAdminUser])
def admin_courier_suspend(request, driver_id):
    """Suspend a courier's delivery mode. Reason is mandatory; audited.

    Delivery-level suspension only: the account stays active and no payout,
    wallet or financial record is touched (approve/reject live in the approval
    center so the e-signature gate has a single source of truth).
    """
    from security.services.audit_service import log_from_request

    profile = get_object_or_404(_courier_queryset(), pk=driver_id)
    reason = (request.data.get("reason") or "").strip()
    if len(reason) < 5:
        return Response(
            {"detail": "A suspension reason is required (min 5 characters)."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    settings, _created = DriverDeliverySettings.objects.get_or_create(driver=profile.user)
    if settings.is_suspended:
        return Response(
            {
                "detail": "Courier is already suspended.",
                "is_suspended": True,
                "courier_status": "suspended",
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    settings.is_suspended = True
    settings.suspension_reason = reason
    settings.delivery_mode_enabled = False
    settings.save(
        update_fields=["is_suspended", "suspension_reason", "delivery_mode_enabled"]
    )

    summary = f"Courier suspended: {profile.user.email}"
    log_from_request(
        request,
        action="suspend",
        entity_type="courier",
        entity_id=profile.user_id,
        summary=summary,
        details={"reason": reason, "source": "delivery_admin"},
    )
    return Response(
        {
            "message": summary,
            "is_suspended": True,
            "courier_status": "suspended",
            "suspension_reason": reason,
        }
    )



@api_view(["POST"])
@permission_classes([IsAdminUser])
def admin_courier_reactivate(request, driver_id):
    """Lift a courier suspension. Audited.

    Clears the suspension only — the courier must go back online themselves
    (delivery mode is never switched on by an admin action).
    """
    from security.services.audit_service import log_from_request

    profile = get_object_or_404(_courier_queryset(), pk=driver_id)
    reason = (request.data.get("reason") or "").strip()

    settings = _settings_for(profile)
    if not settings or not settings.is_suspended:
        return Response(
            {
                "detail": "Courier is not suspended.",
                "is_suspended": False,
                "courier_status": profile.status,
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    settings.is_suspended = False
    settings.suspension_reason = ""
    settings.save(update_fields=["is_suspended", "suspension_reason"])

    summary = f"Courier reactivated: {profile.user.email}"
    log_from_request(
        request,
        action="reactivate",
        entity_type="courier",
        entity_id=profile.user_id,
        summary=summary,
        details={"reason": reason, "source": "delivery_admin"},
    )
    return Response(
        {
            "message": summary,
            "is_suspended": False,
            "courier_status": profile.status,
        }
    )



# ─── Merchant directory (read-only) ───────────────────────────────────────────


def _serialize_admin_merchant(merchant):
    """Read-only merchant row — no licence/tax document paths, no bank details."""
    return {
        "id": merchant.id,
        "business_name": merchant.business_name,
        "owner_name": merchant.owner_name,
        "owner_email": merchant.owner.email if merchant.owner else "",
        "phone_number": merchant.phone_number,
        "city": merchant.city,
        "merchant_type": merchant.merchant_type,
        "merchant_type_label": merchant.get_merchant_type_display(),
        "business_type": merchant.business_type,
        "status": merchant.status,
        "rejection_reason": merchant.rejection_reason or "",
        "rating": str(merchant.rating),
        "total_orders": merchant.total_orders,
        "is_operational": bool(getattr(merchant, "is_operational", False)),
        "created_at": merchant.created_at,
    }


@api_view(["GET"])
@permission_classes([IsAdminUser])
def admin_merchants_directory(request):
    """Read-only merchant directory for the Delivery module.

    Merchant management stays in the merchant platform / security review
    endpoints; this endpoint only lists and filters.

    Query params: search, status, merchant_type, city, ordering, page, page_size.
    """
    queryset = Merchant.objects.select_related("owner").order_by("-created_at")

    search = (request.query_params.get("search") or "").strip()
    if search:
        queryset = queryset.filter(
            Q(business_name__icontains=search)
            | Q(owner_name__icontains=search)
            | Q(email__icontains=search)
            | Q(phone_number__icontains=search)
        )

    status_filter = (request.query_params.get("status") or "").strip().lower()
    if status_filter and status_filter != "all":
        queryset = queryset.filter(status=status_filter)

    merchant_type = (request.query_params.get("merchant_type") or "").strip().lower()
    if merchant_type and merchant_type != "all":
        queryset = queryset.filter(merchant_type=merchant_type)

    city = (request.query_params.get("city") or "").strip()
    if city:
        queryset = queryset.filter(city__iexact=city)

    ordering = (request.query_params.get("ordering") or "newest").strip()
    queryset = queryset.order_by(
        {
            "newest": "-created_at",
            "oldest": "created_at",
            "name": "business_name",
            "orders": "-total_orders",
            "rating": "-rating",
        }.get(ordering, "-created_at")
    )

    paginator = AdminCouriersPagination()
    page = paginator.paginate_queryset(queryset, request)
    response = paginator.get_paginated_response(
        [_serialize_admin_merchant(merchant) for merchant in page]
    )

    agg = Merchant.objects.aggregate(
        total=Count("id"),
        pending=Count("id", filter=Q(status="pending")),
        approved=Count("id", filter=Q(status="approved")),
        rejected=Count("id", filter=Q(status="rejected")),
        suspended=Count("id", filter=Q(status="suspended")),
    )
    response.data["summary"] = {
        "total": agg["total"] or 0,
        "pending": agg["pending"] or 0,
        "approved": agg["approved"] or 0,
        "rejected": agg["rejected"] or 0,
        "suspended": agg["suspended"] or 0,
    }
    return response

