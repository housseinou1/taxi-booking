"""Canonical executive metrics + reporting periods — ONE definition per metric.

WHY THIS MODULE EXISTS
======================
Executive screens previously each computed their own figures, which produced two classes of
error that the Founder/CEO flagged:

1. **Double-counted fleet.** Couriers are not a separate table: a courier is a
   ``DriverProfile`` plus a ``DriverDeliverySettings`` row. Counting ``DriverProfile`` mixed
   ride drivers with couriers (104 "drivers" that were really 62 drivers + 42 couriers).
   All fleet numbers therefore come from :mod:`operations.fleet_metrics`, never re-derived.
2. **Liabilities labelled as revenue.** Wallet balances are money Yala OWES; they are not
   income. Every liability here is returned in a separate ``liabilities`` block and tagged
   ``"is_revenue": False`` so no dashboard can present it as revenue.

DEFINITIONS (one owner each — dashboards must not redefine these)
================================================================
``total_riders``            Registered rider accounts (``user_type="rider"``).
``riders_active``           Distinct riders with at least one ride or delivery in the period.
``total_drivers``           Ride-hailing drivers only — couriers excluded (fleet_metrics).
``total_couriers``          Delivery couriers (profiles with delivery settings).
``online_drivers``          Approved ride drivers currently online and dispatchable.
``online_couriers``         Couriers with delivery mode on, approved and not suspended.
``completed_rides``         ``Ride.status="completed"`` by ``completed_at`` in the period.
``completed_deliveries``    ``Delivery.status="delivered"`` by ``delivered_at`` in the period.
``cancellations``           Rides + deliveries cancelled (``status="cancelled"``) by
                            ``created_at`` in the period — cancellations have no completion
                            timestamp, so creation is the only honest basis.
``platform_revenue``        Yala's own income: the ``app_fee`` actually settled on the
                            payment ledger. NOT gross customer spend.
``gross_transaction_value`` What customers paid on settled ledger records (``amount``).
``driver_earnings``         Ride money retained by drivers: ride GTV minus ride app_fee.
``courier_earnings``        ``courier_earning`` settled on the ledger.
``merchant_payables``       Merchant settlements owed but not yet paid
                            (``status`` in pending/processing) — a liability, not revenue.
``wallet_liabilities``      ``Sum(WalletAccount.balance)`` — a liability, not revenue.
                            ``pending_balance`` is reported separately and never added in.

Read-only: nothing here mutates state, and no model or migration was added.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db.models import Sum
from django.utils import timezone

from deliveries.models import Delivery
from merchants.models import MerchantSettlement
from payments.models import PaymentRecord, WalletAccount
from taxi.rides.models import Ride

from .fleet_metrics import fleet_metrics

User = get_user_model()

ZERO = Decimal("0.00")

#: Settled ledger states — money that has actually moved.
SETTLED_STATUSES = ("paid",)

REPORTING_PERIODS = {
    "today": "Today",
    "last_7_days": "Last 7 Days",
    "last_30_days": "Last 30 Days",
    "this_month": "This Month",
    "custom": "Custom Date Range",
}

EXECUTIVE_METRIC_DEFINITIONS = {
    "total_riders": "Registered rider accounts.",
    "riders_active": "Riders with at least one ride or delivery in the period.",
    "total_drivers": "Ride-hailing drivers (couriers excluded).",
    "total_couriers": "Delivery couriers.",
    "online_drivers": "Approved ride drivers online and dispatchable.",
    "online_couriers": "Approved couriers with delivery mode on and not suspended.",
    "completed_rides": "Rides completed in the period.",
    "completed_deliveries": "Deliveries delivered in the period.",
    "cancellations": "Rides plus deliveries cancelled in the period.",
    "platform_revenue": "Yala income: app_fee settled on the payment ledger (excludes liabilities).",
    "gross_transaction_value": "Total paid by customers on settled ledger records.",
    "driver_earnings": "Ride GTV retained by drivers after the platform fee.",
    "courier_earnings": "Courier earnings settled on the payment ledger.",
    "merchant_payables": "Merchant settlements owed but not yet paid (a liability, not revenue).",
    "wallet_liabilities": "Wallet balances Yala holds for users (a liability, not revenue).",
}

def resolve_period(period="last_30_days", *, start=None, end=None, now=None):
    """Resolve a reporting period to ``(start, end, label)``; ``end`` is exclusive.

    ``custom`` requires explicit ``start``/``end`` dates (or datetimes).
    """
    today = (now or timezone.now()).date() if not isinstance(now, date) else now
    key = (period or "last_30_days").strip().lower()
    if key not in REPORTING_PERIODS:
        raise ValueError(f"Unknown reporting period: {period!r}")

    def _as_dt(value, *, is_end):
        if value is None:
            raise ValueError("A custom date range needs both a start and an end date.")
        if isinstance(value, datetime):
            return value if timezone.is_aware(value) else timezone.make_aware(value)
        bound = time.max if is_end else time.min
        return timezone.make_aware(datetime.combine(value, bound))

    def _midnight(day):
        return timezone.make_aware(datetime.combine(day, time.min))

    if key == "custom":
        return _as_dt(start, is_end=False), _as_dt(end, is_end=True), REPORTING_PERIODS[key]
    if key == "today":
        first = _midnight(today)
        return first, first + timedelta(days=1), REPORTING_PERIODS[key]
    if key == "last_7_days":
        return _midnight(today - timedelta(days=6)), _midnight(today + timedelta(days=1)), REPORTING_PERIODS[key]
    if key == "last_30_days":
        return _midnight(today - timedelta(days=29)), _midnight(today + timedelta(days=1)), REPORTING_PERIODS[key]
    # this_month
    first = _midnight(today.replace(day=1))
    if today.month == 12:
        nxt = today.replace(year=today.year + 1, month=1, day=1)
    else:
        nxt = today.replace(month=today.month + 1, day=1)
    return first, _midnight(nxt), REPORTING_PERIODS[key]


def _money(queryset, field):
    return queryset.aggregate(total=Sum(field))["total"] or ZERO


def _in_period(queryset, field, start, end):
    return queryset.filter(**{f"{field}__gte": start, f"{field}__lt": end})


def executive_metrics(period="last_30_days", *, start=None, end=None):
    """Every executive figure, from one period definition, with definitions attached."""
    start_dt, end_dt, label = resolve_period(period, start=start, end=end)

    fleet = fleet_metrics()
    drivers = fleet["drivers"]
    couriers = fleet["couriers"]

    completed_rides = _in_period(
        Ride.objects.filter(status="completed"), "completed_at", start_dt, end_dt
    )
    delivered = _in_period(
        Delivery.objects.filter(status="delivered"), "delivered_at", start_dt, end_dt
    )
    cancelled_rides = _in_period(
        Ride.objects.filter(status="cancelled"), "created_at", start_dt, end_dt
    )
    cancelled_deliveries = _in_period(
        Delivery.objects.filter(status="cancelled"), "created_at", start_dt, end_dt
    )

    ledger = _in_period(
        PaymentRecord.objects.filter(status__in=SETTLED_STATUSES), "created_at", start_dt, end_dt
    )

    ride_gtv = _money(completed_rides, "fare")
    ride_fees = _money(completed_rides, "app_fee")
    ledger_gtv = _money(ledger, "amount")
    ledger_revenue = _money(ledger, "app_fee")

    active_rider_ids = set(
        completed_rides.exclude(rider__isnull=True).values_list("rider_id", flat=True)
    ) | set(delivered.exclude(customer__isnull=True).values_list("customer_id", flat=True))

    wallet_balance = WalletAccount.objects.aggregate(total=Sum("balance"))["total"] or ZERO
    wallet_pending = WalletAccount.objects.aggregate(total=Sum("pending_balance"))["total"] or ZERO
    merchant_payables = _money(
        MerchantSettlement.objects.filter(status__in=("pending", "processing")), "net_payout"
    )

    return {
        "period": {"key": period, "label": label, "start": start_dt, "end": end_dt},
        "riders": {
            "total": User.objects.filter(user_type="rider").count(),
            "active": len(active_rider_ids),
        },
        "fleet": {
            "total_drivers": drivers["total"],
            "online_drivers": drivers["online"],
            "total_couriers": couriers["total"],
            "online_couriers": couriers["online"],
        },
        "activity": {
            "completed_rides": completed_rides.count(),
            "completed_deliveries": delivered.count(),
            "cancellations": cancelled_rides.count() + cancelled_deliveries.count(),
        },
        "money": {
            "gross_transaction_value": ledger_gtv,
            "platform_revenue": ledger_revenue,
            "driver_earnings": ride_gtv - ride_fees,
            "courier_earnings": _money(ledger, "courier_earning"),
        },
        # Liabilities are deliberately NOT part of money/revenue above.
        "liabilities": {
            "merchant_payables": {"value": merchant_payables, "is_revenue": False},
            "wallet_liabilities": {"value": wallet_balance, "is_revenue": False},
            "wallet_pending_balance": {"value": wallet_pending, "is_revenue": False},
        },
        "definitions": dict(EXECUTIVE_METRIC_DEFINITIONS),
    }
