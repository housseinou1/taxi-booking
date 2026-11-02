"""Phase 9 — CEO city reporting and CEO security posture.

Read-only executive reporting for remote control from outside Mauritania:

- ``GET /operations/ceo/reports/cities/``  Nouakchott / Nouadhibou separated **and**
  combined performance statistics for a daily, weekly, monthly or custom range:
  rides, deliveries, revenue, commissions, withdrawals and account counts.
- ``GET /operations/ceo/security/``        the CEO account's protection posture:
  protected-group assertion, TOTP (strong-auth) status and recent sensitive-action
  volume from the audit trail.

BOUNDARIES:
- **Read-only.** Every figure is a count or a SUM over already-stored columns.
  No wallet balance is written, no commission is computed here, no payout,
  refund or transfer is triggered.
- **No derived financial figures.** Where the schema does not store a value
  (e.g. a per-ride platform commission) the field is reported as untracked
  instead of being invented from other columns.
"""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.db.models import Count, Q, Sum
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from security.models import AuditLog

from .executive_permissions import CEO_ONLY_GROUPS, IsCeoStaff, can_ceo_actions

# The two operating cities required by the CEO reporting brief.
DEFAULT_REPORT_CITIES = ["Nouakchott", "Nouadhibou"]

PERIODS = {"daily", "weekly", "monthly", "custom"}

SENSITIVE_ACTIONS = ["suspend", "reactivate", "refund", "approve", "reject", "status_change"]


def _money(value) -> str:
    return str(value if value is not None else Decimal("0"))


def _safe_parse_date(raw):
    """parse_date that never raises.

    Django's ``parse_date`` returns None for a malformed string but RAISES
    ValueError for out-of-range values (e.g. "2026-13-01"), which would surface
    as a 500. Callers must treat None as "invalid -> 400".
    """
    try:
        return parse_date(raw)
    except (ValueError, TypeError):
        return None


def _range_for(period: str, date_from, date_to):
    """Resolve the reporting window. Returns (start, end, error_response)."""
    now = timezone.now()
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)

    if period == "custom":
        if not date_from and not date_to:
            return None, None, Response(
                {"detail": "period=custom requires date_from and/or date_to."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        start = date_from or date_to
        end = date_to or date_from
        if start > end:
            return None, None, Response(
                {"detail": "date_from must not be after date_to."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return start, end, None

    if period == "weekly":
        start = today - timedelta(days=today.weekday())
    elif period == "monthly":
        start = today.replace(day=1)
    else:  # daily
        start = today
    return start, today, None


# ─── City reporting (read-only) ──────────────────────────────────────────────


def _rides_stats(start, end, city_name=None):
    from taxi.rides.models import Ride

    queryset = Ride.objects.filter(created_at__gte=start, created_at__lte=end)
    if city_name:
        queryset = queryset.filter(city__name__iexact=city_name)

    agg = queryset.aggregate(
        total=Count("id"),
        completed=Count("id", filter=Q(status="completed")),
        cancelled=Count("id", filter=Q(status="cancelled")),
        no_show=Count("id", filter=Q(status="rider_no_show")),
        completed_fare=Sum("fare", filter=Q(status="completed")),
        driver_earnings=Sum("driver_earning", filter=Q(status="completed")),
    )
    return {
        "total": agg["total"] or 0,
        "completed": agg["completed"] or 0,
        "cancelled": agg["cancelled"] or 0,
        "rider_no_show": agg["no_show"] or 0,
        "completed_fare": _money(agg["completed_fare"]),
        "driver_earnings": _money(agg["driver_earnings"]),
        # The schema stores no per-ride platform commission column, so it is
        # reported as untracked rather than derived from other figures.
        "platform_commission_tracked": False,
    }


def _deliveries_stats(start, end, city_name=None):
    from deliveries.models import Delivery

    queryset = Delivery.objects.filter(created_at__gte=start, created_at__lte=end)
    if city_name:
        queryset = queryset.filter(service_city__iexact=city_name)

    agg = queryset.aggregate(
        total=Count("id"),
        delivered=Count("id", filter=Q(status="delivered")),
        cancelled=Count("id", filter=Q(status="cancelled")),
        exceptions=Count("id", filter=Q(status="delivery_exception")),
        delivered_fare=Sum("fare", filter=Q(status="delivered")),
        courier_earnings=Sum("driver_earning", filter=Q(status="delivered")),
        platform_commission=Sum("platform_commission", filter=Q(status="delivered")),
    )
    return {
        "total": agg["total"] or 0,
        "delivered": agg["delivered"] or 0,
        "cancelled": agg["cancelled"] or 0,
        "exceptions": agg["exceptions"] or 0,
        "delivered_fare": _money(agg["delivered_fare"]),
        "courier_earnings": _money(agg["courier_earnings"]),
        "platform_commission": _money(agg["platform_commission"]),
    }


def _withdrawals_stats(start, end, city_name=None):
    from payments.models import WithdrawalRequest

    queryset = WithdrawalRequest.objects.filter(created_at__gte=start, created_at__lte=end)
    if city_name:
        queryset = queryset.filter(driver__city__name__iexact=city_name)

    agg = queryset.aggregate(
        total=Count("id"),
        pending=Count("id", filter=Q(status="pending")),
        approved=Count("id", filter=Q(status="approved")),
        rejected=Count("id", filter=Q(status="rejected")),
        paid=Count("id", filter=Q(status="paid")),
        requested_amount=Sum("amount"),
        pending_amount=Sum("amount", filter=Q(status="pending")),
        approved_amount=Sum("amount", filter=Q(status="approved")),
        paid_amount=Sum("amount", filter=Q(status="paid")),
    )
    return {
        "total": agg["total"] or 0,
        "pending": agg["pending"] or 0,
        "approved": agg["approved"] or 0,
        "rejected": agg["rejected"] or 0,
        "paid": agg["paid"] or 0,
        "requested_amount": _money(agg["requested_amount"]),
        "pending_amount": _money(agg["pending_amount"]),
        "approved_amount": _money(agg["approved_amount"]),
        "paid_amount": _money(agg["paid_amount"]),
    }


def _accounts_stats(city_name=None):
    """Current account population for a city (not period-bound)."""
    from django.contrib.auth import get_user_model

    from deliveries.models import DriverDeliverySettings

    User = get_user_model()
    courier_ids = DriverDeliverySettings.objects.values_list("driver_id", flat=True)

    users = User.objects.all()
    if city_name:
        users = users.filter(city__name__iexact=city_name)

    return {
        "riders": users.filter(user_type="rider").count(),
        "drivers": users.filter(driver_profile__isnull=False)
        .exclude(id__in=courier_ids)
        .count(),
        "couriers": users.filter(id__in=courier_ids).count(),
        "active": users.filter(is_active=True).count(),
        "inactive": users.filter(is_active=False).count(),
    }


def _city_block(start, end, city_name=None):
    rides = _rides_stats(start, end, city_name)
    deliveries = _deliveries_stats(start, end, city_name)
    withdrawals = _withdrawals_stats(start, end, city_name)

    rides_fare = Decimal(rides["completed_fare"])
    deliveries_fare = Decimal(deliveries["delivered_fare"])
    return {
        "city": city_name or "Combined",
        "rides": rides,
        "deliveries": deliveries,
        "revenue": {
            "rides_fare": _money(rides_fare),
            "deliveries_fare": _money(deliveries_fare),
            "total_fare": _money(rides_fare + deliveries_fare),
            "courier_earnings": deliveries["courier_earnings"],
            "driver_earnings": rides["driver_earnings"],
        },
        "commissions": {
            "deliveries_platform_commission": deliveries["platform_commission"],
            "rides_platform_commission_tracked": False,
        },
        "withdrawals": withdrawals,
        "accounts": _accounts_stats(city_name),
    }



@api_view(["GET"])
@permission_classes([IsCeoStaff])
def ceo_city_report(request):
    """City-separated **and** combined performance report (read-only).

    Query params:
      period   daily | weekly | monthly | custom   (default daily)
      date_from / date_to   YYYY-MM-DD (required when period=custom)
      cities   comma-separated city names (default: Nouakchott, Nouadhibou)

    Returns one block per city plus a combined block covering rides, deliveries,
    revenue, commissions, withdrawals and current account counts.
    """
    period = (request.query_params.get("period") or "daily").strip().lower()
    if period not in PERIODS:
        return Response(
            {"detail": f"Invalid period. Valid values: {', '.join(sorted(PERIODS))}."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    date_from_raw = request.query_params.get("date_from")
    date_to_raw = request.query_params.get("date_to")
    date_from = date_to = None
    if date_from_raw:
        date_from = _safe_parse_date(date_from_raw)
        if date_from is None:
            return Response(
                {"detail": "Invalid date_from; expected YYYY-MM-DD."},
                status=status.HTTP_400_BAD_REQUEST,
            )
    if date_to_raw:
        date_to = _safe_parse_date(date_to_raw)
        if date_to is None:
            return Response(
                {"detail": "Invalid date_to; expected YYYY-MM-DD."},
                status=status.HTTP_400_BAD_REQUEST,
            )

    start, end, error = _range_for(period, date_from, date_to)
    if error:
        return error

    raw_cities = (request.query_params.get("cities") or "").strip()
    cities = [c.strip() for c in raw_cities.split(",") if c.strip()] or list(
        DEFAULT_REPORT_CITIES
    )

    start_dt = timezone.make_aware(
        timezone.datetime.combine(start, timezone.datetime.min.time())
    )
    end_dt = timezone.make_aware(
        timezone.datetime.combine(end, timezone.datetime.max.time())
    )

    city_blocks = {name: _city_block(start_dt, end_dt, name) for name in cities}
    combined = _city_block(start_dt, end_dt, None)

    return Response(
        {
            "period": period,
            "range": {"from": start.isoformat(), "to": end.isoformat()},
            "generated_at": timezone.now(),
            "timezone_note": (
                "All timestamps are UTC. Reporting windows are UTC calendar days so the "
                "report is identical whether opened from New York or Nouakchott."
            ),
            "cities": city_blocks,
            "combined": combined,
            "comparison": [
                {
                    "city": name,
                    "total_fare": city_blocks[name]["revenue"]["total_fare"],
                    "rides_completed": city_blocks[name]["rides"]["completed"],
                    "deliveries_delivered": city_blocks[name]["deliveries"]["delivered"],
                    "withdrawals_pending_amount": city_blocks[name]["withdrawals"][
                        "pending_amount"
                    ],
                }
                for name in cities
            ],
            "notes": {
                "rides_platform_commission": (
                    "Not stored per ride in the current schema; deliveries carry the "
                    "platform commission column."
                ),
                "read_only": "This report performs no financial mutation.",
            },
        }
    )



# ─── CEO security posture (read-only) ────────────────────────────────────────


@api_view(["GET"])
@permission_classes([IsCeoStaff])
def ceo_security_posture(request):
    """Read-only protection posture for the CEO account.

    Reports whether the acting account holds the protected CEO authority, the
    strong-authentication (TOTP) status and the recent sensitive-action volume
    from the audit trail — the evidence the owner needs to supervise the platform
    remotely.
    """
    from admin_2fa.models import AdminTOTP

    user = request.user
    totp = AdminTOTP.objects.filter(user=user).first()
    since = timezone.now() - timedelta(hours=24)

    recent = AuditLog.objects.filter(created_at__gte=since).filter(
        action__in=SENSITIVE_ACTIONS
    )

    return Response(
        {
            "account": {
                "email": user.email,
                "is_ceo_authority": can_ceo_actions(user),
                "protected_groups": sorted(CEO_ONLY_GROUPS),
                "is_staff": user.is_staff,
                "is_superuser": user.is_superuser,
            },
            "protected_permissions": {
                "ceo_only_endpoints": True,
                "cannot_be_modified_by_subordinates": [
                    "Rider suspend and reactivate actions refuse staff accounts.",
                    "Generic block and unblock actions refuse staff accounts.",
                    "Rider deletion refuses staff accounts.",
                    "CEO account actions refuse the acting account itself, any staff "
                    "account, any other CEO and any superuser.",
                ],
                "note": (
                    "CEO authority is defined by group membership (CEO / Super Admin) "
                    "and is enforced server-side on every request; no subordinate admin "
                    "endpoint can remove it."
                ),
            },
            "strong_authentication": {
                "totp_enrolled": totp is not None,
                "totp_confirmed": bool(totp and totp.is_confirmed),
                "totp_confirmed_at": totp.confirmed_at if totp else None,
                "recommended": True,
                "note": (
                    "TOTP enrolment is available at /admin-2fa/setup/. It is reported "
                    "here so the owner can confirm strong authentication is active "
                    "before acting remotely."
                ),
            },
            "recent_sensitive_actions": {
                "window_hours": 24,
                "count": recent.count(),
                "latest": [
                    {
                        "action": row.action,
                        "entity_type": row.entity_type,
                        "summary": row.summary,
                        "actor_email": row.actor.email if row.actor else "",
                        "created_at": row.created_at,
                    }
                    for row in recent.order_by("-created_at")[:5]
                ],
            },
            "audit_trail_available": True,
        }
    )

