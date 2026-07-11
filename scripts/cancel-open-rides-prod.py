#!/usr/bin/env python3
"""Cancel open production rides for QA / stuck device requests."""
import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "taxi.settings")
django.setup()

from django.utils.timezone import now
from taxi.rides.models import Ride

OPEN = [
    "requested",
    "accepted",
    "driver_arriving",
    "driver_arrived",
    "in_progress",
    "arrived",
]

qs = (
    Ride.objects.filter(status__in=OPEN)
    .select_related("rider")
    .order_by("-id")[:30]
)
print("OPEN_BEFORE", qs.count())
for r in qs:
    rider = getattr(r.rider, "email", None)
    print(
        f"id={r.id} status={r.status} rider={rider} "
        f"pickup={getattr(r, 'pickup', '')!s:.60} created={r.created_at}"
    )

cancelled = []
for r in qs:
    r.status = "cancelled"
    r.cancelled_at = now()
    r.cancelled_by = "admin"
    r.cancellation_reason = "Admin cancel — device QA no-show / no PIN"
    fields = ["status", "cancelled_at", "cancelled_by", "cancellation_reason"]
    # optional fields if present
    for extra in ("cancellation_reason_details", "cancellation_fee"):
        if hasattr(r, extra):
            if extra == "cancellation_reason_details":
                setattr(r, extra, "Cancelled from production support cleanup")
                fields.append(extra)
            if extra == "cancellation_fee":
                from decimal import Decimal

                setattr(r, extra, Decimal("0.00"))
                fields.append(extra)
    r.save(update_fields=fields)
    cancelled.append(r.id)
    print(f"CANCELLED id={r.id}")

left = Ride.objects.filter(status__in=OPEN).count()
print("CANCELLED_IDS", cancelled)
print("OPEN_AFTER", left)
