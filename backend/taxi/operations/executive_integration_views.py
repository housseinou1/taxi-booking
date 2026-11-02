"""Executive metrics + Vehicle Management read-only endpoints (Founder/CEO authorization).

**No new database models and no migrations are introduced here** — this module only reads:

* ``executive_metrics`` — the canonical executive figures from ``operations.executive_metrics``
  (single source of truth: no driver/courier double-counting, wallet liabilities excluded from
  revenue, pending transactions excluded from settled revenue).
* ``DriverProfile`` vehicle fields — the Vehicle Management directory. The existing fleet
  endpoints (``fleet/drivers/``, ``fleet/documents/`` and the document approve/reject actions)
  remain the only place documents are approved, so those permissions are untouched.

Nothing is invented: every value comes from a real stored column, and where a document has no
expiry recorded the status is reported as ``missing`` rather than assumed.
"""

from __future__ import annotations

from datetime import timedelta

from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from operations.executive_permissions import IsCeoStaff, IsFleetStaff

#: A document expiring within this window is surfaced as an alert.
EXPIRY_ALERT_DAYS = 30


def _document_state(expiry, has_file, today):
    """Derived document state — never assumed, never invented."""
    if expiry is None:
        return "missing" if not has_file else "no_expiry_recorded"
    if expiry < today:
        return "expired"
    if expiry <= today + timedelta(days=EXPIRY_ALERT_DAYS):
        return "expiring_soon"
    return "valid"


@api_view(["GET"])
@permission_classes([IsCeoStaff])
def executive_metrics_view(request):
    """GET — canonical executive metrics for the CEO/executive dashboards.

    ``?period=today|last_7_days|last_30_days|this_month|custom`` plus ``?start=``/``?end=``
    for a custom range. Every dashboard must read its numbers from this payload so the
    definitions and reporting periods cannot drift apart.
    """
    from datetime import date

    from operations.executive_metrics import (
        REPORTING_PERIODS,
        executive_metrics,
        resolve_period,
    )

    period = str(request.query_params.get("period") or "last_30_days")

    def _date(value):
        try:
            return date.fromisoformat(str(value)) if value else None
        except (TypeError, ValueError):
            return None

    start, end = _date(request.query_params.get("start")), _date(request.query_params.get("end"))
    try:
        if period == "custom":
            resolve_period("custom", start=start, end=end)
        payload = executive_metrics(period, start=start, end=end)
    except ValueError as exc:
        return Response(
            {"detail": str(exc), "available_periods": REPORTING_PERIODS},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return Response(payload)



@api_view(["GET"])
@permission_classes([IsFleetStaff])
def vehicle_directory(request):
    """GET — Vehicle Management directory, derived entirely from ``DriverProfile``.

    Query params: ``?search=`` (plate, make, model or driver), ``?city=``, ``?approval=``
    (approved/pending/...), ``?document=expired|expiring_soon|missing`` and ``?limit=``.

    Read-only. Document approval stays with the existing ``fleet/documents/`` endpoints, and
    driver eligibility checks are unchanged — nothing here bypasses them.
    """
    from django.db.models import Q

    from operations.fleet_metrics import courier_user_ids
    from taxi.drivers.models import DriverProfile

    search = str(request.query_params.get("search") or "").strip()
    city_id = request.query_params.get("city") or None
    approval = str(request.query_params.get("approval") or "").strip()
    document_filter = str(request.query_params.get("document") or "").strip()
    try:
        limit = min(int(request.query_params.get("limit") or 200), 500)
    except (TypeError, ValueError):
        limit = 200

    # Ride drivers only, matching the canonical fleet definition (couriers excluded).
    queryset = DriverProfile.objects.select_related("user").exclude(
        user_id__in=courier_user_ids()
    )
    if city_id:
        queryset = queryset.filter(user__city_id=city_id)
    if approval:
        queryset = queryset.filter(status=approval)
    if search:
        queryset = queryset.filter(
            Q(plate_number__icontains=search)
            | Q(vehicle_plate__icontains=search)
            | Q(vehicle_make__icontains=search)
            | Q(vehicle_model__icontains=search)
            | Q(user__first_name__icontains=search)
            | Q(user__last_name__icontains=search)
        )

    today = timezone.localdate()
    rows = []
    alerts = []
    for profile in queryset.order_by("vehicle_make", "plate_number")[:limit]:
        documents = {
            "registration": _document_state(
                profile.vehicle_registration_expires_at,
                bool(profile.vehicle_registration),
                today,
            ),
            "insurance": _document_state(
                profile.insurance_expires_at, bool(profile.insurance_document), today
            ),
            "vignette": _document_state(
                profile.vignette_expires_at, bool(profile.vignette_document), today
            ),
            "licence": _document_state(
                profile.license_expires_at, bool(profile.license_file), today
            ),
        }
        driver_name = profile.user.get_full_name().strip() or profile.user.email
        plate = profile.plate_number or profile.vehicle_plate or ""
        for name, state in documents.items():
            if state in {"expired", "expiring_soon"}:
                alerts.append(
                    {
                        "driver_id": profile.id,
                        "driver_name": driver_name,
                        "plate": plate,
                        "document": name,
                        "state": state,
                    }
                )
        rows.append(
            {
                "driver_id": profile.id,
                "driver_name": driver_name,
                "driver_status": profile.status,
                "city_id": profile.user.city_id,
                "vehicle": {
                    "make": profile.vehicle_make or "",
                    "model": profile.vehicle_model or "",
                    "colour": profile.vehicle_color or "",
                    "plate_number": profile.plate_number or "",
                    "vehicle_plate": profile.vehicle_plate or "",
                    "photo_available": bool(profile.vehicle_photo),
                },
                "documents": documents,
                "registration_expires_at": profile.vehicle_registration_expires_at,
                "insurance_expires_at": profile.insurance_expires_at,
                "vignette_expires_at": profile.vignette_expires_at,
                "licence_expires_at": profile.license_expires_at,
            }
        )

    if document_filter:
        rows = [
            row
            for row in rows
            if any(state == document_filter for state in row["documents"].values())
        ]

    return Response(
        {
            "today": today,
            "expiry_alert_days": EXPIRY_ALERT_DAYS,
            "count": len(rows),
            "vehicles": rows,
            "expiring_documents": alerts[:200],
            "note": (
                "Derived from DriverProfile vehicle fields. Document approval and driver "
                "eligibility remain with the existing fleet document endpoints."
            ),
        }
    )
