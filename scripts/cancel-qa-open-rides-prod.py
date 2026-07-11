#!/usr/bin/env python3
"""Cancel open rides for the device-QA rider account only (no-show / missing PIN)."""
import os
from decimal import Decimal

import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "taxi.settings")
django.setup()

from django.contrib.auth import get_user_model
from django.utils.timezone import now

from taxi.rides.models import Ride

User = get_user_model()
OPEN = [
    "requested",
    "accepted",
    "driver_arriving",
    "driver_arrived",
    "in_progress",
    "arrived",
]
# Accounts used during phone security / device QA on this machine
QA_EMAILS = [
    "qa-rider-profile-fix@test.local",
]

riders = list(User.objects.filter(email__in=QA_EMAILS))
print("RIDERS", [u.email for u in riders])
qs = (
    Ride.objects.filter(status__in=OPEN, rider__in=riders)
    .select_related("rider")
    .order_by("-id")
)
print("OPEN_MATCHES", qs.count())
cancelled = []
for r in qs:
    print(f"FOUND id={r.id} status={r.status} rider={r.rider.email} created={r.created_at}")
    r.status = "cancelled"
    r.cancelled_at = now()
    r.cancelled_by = "admin"
    r.cancellation_reason = "Admin cancel — device QA no-show / no PIN"
    fields = ["status", "cancelled_at", "cancelled_by", "cancellation_reason"]
    if hasattr(r, "cancellation_reason_details"):
        r.cancellation_reason_details = "Cancelled after accidental device QA request"
        fields.append("cancellation_reason_details")
    if hasattr(r, "cancellation_fee"):
        r.cancellation_fee = Decimal("0.00")
        fields.append("cancellation_fee")
    r.save(update_fields=fields)
    cancelled.append(r.id)
    print(f"CANCELLED id={r.id}")

print("CANCELLED_IDS", cancelled)
print(
    "OPEN_LEFT_FOR_QA",
    Ride.objects.filter(status__in=OPEN, rider__in=riders).count(),
)
