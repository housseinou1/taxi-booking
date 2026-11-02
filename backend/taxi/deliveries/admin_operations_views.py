"""Delivery Administration — directory, read-only detail/tracking, city analytics (Task 7).

Additive, admin-only (IsAdminUser = is_staff, the same gate as every other
/deliveries/admin/ endpoint). Nothing here mutates data:

* These views never call ``assignment_service.process_expired_offer`` (unlike the shared
  ``delivery_detail`` / ``delivery_tracking`` views), so polling them cannot trigger a
  reassignment, an offer advance, a payment change or a status change.
* Courier GPS comes only from DriverProfile.current_lat / current_lng. When it is missing
  the coordinates are ``null`` — never replaced by the pickup point (the shared customer
  tracking view does substitute the pickup point; this endpoint deliberately does not).
* No pickup/drop-off PINs, PIN hashes, recipient phone numbers or documents are returned.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date
from decimal import Decimal

from django.db.models import Count, Q, Sum
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response

from .admin_views import ACTIVE_DELIVERY_STATUSES, AdminCouriersPagination
from .city_scope import check_delivery, scope_queryset
from .models import Delivery

STATUS_CHOICES = [value for value, _label in Delivery._meta.get_field("status").choices]
STATUS_LABELS = dict(Delivery._meta.get_field("status").choices)
CATEGORY_CHOICES = [value for value, _label in (Delivery._meta.get_field("service_category").choices or [])]

DIRECTORY_ORDERING = {
    "newest": ("-created_at", "-id"),
    "oldest": ("created_at", "id"),
    "fare_high": ("-fare", "-id"),
    "fare_low": ("fare", "id"),
    "status": ("status", "-id"),
    "id": ("-id",),
}

STATUS_TIMESTAMP_FIELDS = (
    "accepted_at", "courier_arriving_at", "picked_up_at", "in_transit_at",
    "delivered_at", "exception_reported_at", "exception_resolved_at",
)


def _bad_request(detail, **extra):
    return Response({"detail": detail, **extra}, status=status.HTTP_400_BAD_REQUEST)


def _parse_date(raw, name):
    try:
        return date.fromisoformat(raw), None
    except (TypeError, ValueError):
        return None, _bad_request(f"{name} must be YYYY-MM-DD.")


def _money(value) -> str:
    """Decimal money string with two places (SQLite Sum can return e.g. 150.5)."""
    return str((value or Decimal("0")).quantize(Decimal("0.01")))


def _person_name(user):
    if user is None:
        return None
    return user.get_full_name() or user.email


def _serialize_directory_row(delivery):
    return {
        "id": delivery.id,
        "status": delivery.status,
        "status_label": STATUS_LABELS.get(delivery.status, delivery.status),
        "service_category": delivery.service_category,
        "service_city": delivery.service_city,
        "customer_id": delivery.customer_id,
        "customer_name": _person_name(delivery.customer),
        "courier_id": delivery.driver_id,
        "courier_name": _person_name(delivery.driver),
        "pickup": delivery.pickup,
        "destination": delivery.destination,
        "fare": str(delivery.fare),
        "payment_status": delivery.payment_status,
        "payment_method": delivery.payment_method,
        "is_scheduled": delivery.is_scheduled,
        "scheduled_pickup_at": delivery.scheduled_pickup_at,
        "created_at": delivery.created_at,
        "accepted_at": delivery.accepted_at,
        "delivered_at": delivery.delivered_at,
    }


def _directory_queryset(params):
    """Apply directory filters. Returns (queryset, error_response)."""
    qs = Delivery.objects.select_related("customer", "driver")

    search = (params.get("search") or "").strip()
    if search:
        term = search.lstrip("#")
        q = (
            Q(customer__first_name__icontains=search) | Q(customer__last_name__icontains=search)
            | Q(customer__email__icontains=search) | Q(driver__first_name__icontains=search)
            | Q(driver__last_name__icontains=search) | Q(driver__email__icontains=search)
        )
        if term.isdigit():
            q |= Q(id=int(term))
        qs = qs.filter(q)

    status_filter = (params.get("status") or "").strip()
    if status_filter and status_filter != "all":
        if status_filter == "active":
            qs = qs.filter(status__in=ACTIVE_DELIVERY_STATUSES)
        elif status_filter in STATUS_CHOICES:
            qs = qs.filter(status=status_filter)
        else:
            return None, _bad_request("Invalid status.", valid_statuses=STATUS_CHOICES + ["active", "all"])

    category = (params.get("category") or "").strip()
    if category and category != "all":
        if category not in CATEGORY_CHOICES:
            return None, _bad_request("Invalid category.", valid_categories=CATEGORY_CHOICES)
        qs = qs.filter(service_category=category)

    city = params.get("city")
    if city is not None and city.strip() and city.strip() != "all":
        # Exact match on the stored free-text value; no spelling normalisation is applied.
        qs = qs.filter(service_city=city.strip())

    date_from = params.get("date_from")
    date_to = params.get("date_to")
    if date_from:
        parsed, error = _parse_date(date_from, "date_from")
        if error:
            return None, error
        qs = qs.filter(created_at__date__gte=parsed)
    if date_to:
        parsed, error = _parse_date(date_to, "date_to")
        if error:
            return None, error
        qs = qs.filter(created_at__date__lte=parsed)

    ordering = (params.get("ordering") or "newest").strip()
    if ordering not in DIRECTORY_ORDERING:
        return None, _bad_request("Invalid ordering.", valid_ordering=list(DIRECTORY_ORDERING))
    return qs.order_by(*DIRECTORY_ORDERING[ordering]), None


def _directory_summary(qs):
    """Counts for the FILTERED set, in one aggregate query."""
    counts = {f"status_{value}": Count("id", filter=Q(status=value)) for value in STATUS_CHOICES}
    agg = qs.order_by().aggregate(
        total=Count("id"),
        active=Count("id", filter=Q(status__in=ACTIVE_DELIVERY_STATUSES)),
        delivered_revenue=Sum("fare", filter=Q(status="delivered")),
        **counts,
    )
    return {
        "total": agg["total"] or 0,
        "active": agg["active"] or 0,
        "by_status": {value: agg[f"status_{value}"] or 0 for value in STATUS_CHOICES},
        # Same revenue definition as admin_delivery_overview / admin_analytics: sum of fare
        # over delivered deliveries.
        "delivered_revenue": _money(agg["delivered_revenue"]),
    }


@api_view(["GET"])
@permission_classes([IsAdminUser])
def admin_deliveries_directory(request):
    """GET /deliveries/admin/deliveries/ — paginated administrative delivery directory."""
    qs, error = _directory_queryset(request.query_params)
    if error:
        return error
    qs, denied = scope_queryset(request, qs, "admin_deliveries_directory")  # no-op unless enabled
    if denied:
        return denied
    paginator = AdminCouriersPagination()
    page = paginator.paginate_queryset(qs, request)
    response = paginator.get_paginated_response([_serialize_directory_row(d) for d in page])
    response.data["summary"] = _directory_summary(qs)
    return response


def _location_payload(delivery):
    profile = getattr(delivery.driver, "driver_profile", None) if delivery.driver_id else None
    courier_lat = profile.current_lat if profile is not None else None
    courier_lng = profile.current_lng if profile is not None else None
    if courier_lat is None or courier_lng is None:  # never half a coordinate
        courier_lat = courier_lng = None
    timestamps = {field: getattr(delivery, field) for field in STATUS_TIMESTAMP_FIELDS}
    known = [value for value in [delivery.created_at, *timestamps.values()] if value is not None]
    return {
        "courier_location": {
            "lat": courier_lat,
            "lng": courier_lng,
            "available": courier_lat is not None,
            # The platform stores only the courier's latest position, without a timestamp.
            "updated_at": None,
        },
        "pickup_location": {"lat": delivery.pickup_lat, "lng": delivery.pickup_lng},
        "destination_location": {"lat": delivery.destination_lat, "lng": delivery.destination_lng},
        "status_timestamps": {"created_at": delivery.created_at, **timestamps},
        "last_status_update_at": max(known) if known else None,
    }


def _readonly_delivery(delivery_id):
    return get_object_or_404(
        Delivery.objects.select_related("customer", "driver", "driver__driver_profile"), id=delivery_id
    )


@api_view(["GET"])
@permission_classes([IsAdminUser])
def admin_delivery_detail(request, delivery_id):
    """GET /deliveries/admin/deliveries/<id>/ — read-only admin detail (no side effects)."""
    delivery = _readonly_delivery(delivery_id)
    denied = check_delivery(request, delivery, "admin_delivery_detail")  # no-op unless enabled
    if denied:
        return denied
    return Response({
        **_serialize_directory_row(delivery),
        "package_type": delivery.package_type,
        "distance_km": str(delivery.distance_km),
        "driver_earning": str(delivery.driver_earning),
        "platform_commission": str(delivery.platform_commission),
        "tip_amount": str(delivery.tip_amount),
        "discount_amount": str(delivery.discount_amount),
        "estimated_duration_minutes": delivery.estimated_duration_minutes,
        "exception_reason": delivery.exception_reason,
        "exception_resolution": delivery.exception_resolution,
        "customer_rating": delivery.customer_rating,
        **_location_payload(delivery),
    })


@api_view(["GET"])
@permission_classes([IsAdminUser])
def admin_delivery_tracking(request, delivery_id):
    """GET /deliveries/admin/deliveries/<id>/tracking/ — read-only live tracking for staff."""
    delivery = _readonly_delivery(delivery_id)
    denied = check_delivery(request, delivery, "admin_delivery_tracking")  # no-op unless enabled
    if denied:
        return denied
    return Response({
        "delivery_id": delivery.id,
        "status": delivery.status,
        "status_label": STATUS_LABELS.get(delivery.status, delivery.status),
        "courier_id": delivery.driver_id,
        "courier_name": _person_name(delivery.driver),
        "estimated_duration_minutes": delivery.estimated_duration_minutes,
        **_location_payload(delivery),
    })


@api_view(["GET"])
@permission_classes([IsAdminUser])
def admin_delivery_city_analytics(request):
    """GET /deliveries/admin/analytics/cities/ — totals grouped by the stored service_city.

    Optional: date_from, date_to (YYYY-MM-DD, on created_at). City names are grouped by their
    exact stored text; possible spelling variants are listed, never merged.
    """
    qs = Delivery.objects.all()
    for name, lookup in (("date_from", "created_at__date__gte"), ("date_to", "created_at__date__lte")):
        raw = request.query_params.get(name)
        if raw:
            parsed, error = _parse_date(raw, name)
            if error:
                return error
            qs = qs.filter(**{lookup: parsed})
    qs, denied = scope_queryset(request, qs, "admin_delivery_city_analytics")  # no-op unless enabled
    if denied:
        return denied

    rows = (
        qs.order_by()
        .values("service_city")
        .annotate(
            total=Count("id"),
            completed=Count("id", filter=Q(status="delivered")),
            cancelled=Count("id", filter=Q(status="cancelled")),
            active=Count("id", filter=Q(status__in=ACTIVE_DELIVERY_STATUSES)),
            exceptions=Count("id", filter=Q(status="delivery_exception")),
            delivered_revenue=Sum("fare", filter=Q(status="delivered")),
        )
        .order_by("-total", "service_city")
    )
    cities = [
        {
            "service_city": row["service_city"],
            "total": row["total"],
            "completed": row["completed"],
            "cancelled": row["cancelled"],
            "active": row["active"],
            "exceptions": row["exceptions"],
            "delivered_revenue": _money(row["delivered_revenue"]),
        }
        for row in rows
    ]
    groups = defaultdict(list)
    for row in cities:
        groups[(row["service_city"] or "").strip().casefold()].append(row["service_city"])
    variants = [sorted(names) for names in groups.values() if len(names) > 1]
    return Response({
        "cities": cities,
        "totals": {
            "total": sum(c["total"] for c in cities),
            "completed": sum(c["completed"] for c in cities),
            "cancelled": sum(c["cancelled"] for c in cities),
            "active": sum(c["active"] for c in cities),
            "exceptions": sum(c["exceptions"] for c in cities),
            "delivered_revenue": _money(sum((Decimal(c["delivered_revenue"]) for c in cities), Decimal("0"))),
        },
        "possible_name_variants": variants,
        "normalization": "none — grouped by exact stored service_city text",
    })
