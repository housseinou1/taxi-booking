"""Phase 24 — Financial Operations & Reconciliation service layer."""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db.models import Count, Q, Sum
from django.db.models.functions import TruncDate
from django.utils import timezone

from .chart_utils import build_daily_payment_chart

from deliveries.models import Delivery
from payments.models import (
    PaymentRecord,
    RefundRequest,
    WalletAccount,
    WalletTransaction,
    WithdrawalRequest,
)
from security.models import AuditLog
from taxi.rides.models import Ride

from .executive_service import _dec, _payment_qs, _period_bounds, build_finance_dashboard
from .launch_service import build_financial_reconciliation

User = get_user_model()

PROVIDER_KEYS = [
    ("bankily", "Bankily", ["bankily"]),
    ("sedad", "Sedad", ["seddad"]),
    ("masravi", "Masravi", ["masrvi"]),
    ("cards", "Cards", ["card"]),
    ("wallet", "Wallet", ["wallet"]),
]

SUCCESS_STATUSES = {"paid"}
FAILED_STATUSES = {"failed"}
PENDING_STATUSES = {"pending", "authorized"}
REVERSED_STATUSES = {"refunded", "cancelled"}

ACCOUNTING_REPORT_TYPES = {
    "daily": "Daily Financial Report",
    "weekly": "Weekly Financial Report",
    "monthly": "Monthly Financial Report",
    "cash_flow": "Cash Flow Report",
    "outstanding": "Outstanding Balances",
    "commission": "Commission Report",
}


def _parse_date(value) -> date:
    if not value:
        return timezone.localdate()
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value)[:10])
    except (TypeError, ValueError):
        return timezone.localdate()


def _date_range(start: date, end: date):
    return start, end


def _payments_for_range(start: date, end: date):
    return PaymentRecord.objects.filter(
        created_at__date__gte=start,
        created_at__date__lte=end,
    )


def _provider_bucket(methods: list[str], payments_qs) -> dict:
    subset = payments_qs.filter(method__in=methods)
    agg = subset.aggregate(
        successful_count=Count("id", filter=Q(status__in=SUCCESS_STATUSES)),
        successful_amount=Sum("amount", filter=Q(status__in=SUCCESS_STATUSES)),
        failed_count=Count("id", filter=Q(status__in=FAILED_STATUSES)),
        failed_amount=Sum("amount", filter=Q(status__in=FAILED_STATUSES)),
        pending_count=Count("id", filter=Q(status__in=PENDING_STATUSES)),
        pending_amount=Sum("amount", filter=Q(status__in=PENDING_STATUSES)),
        reversed_count=Count("id", filter=Q(status__in=REVERSED_STATUSES)),
        reversed_amount=Sum("amount", filter=Q(status__in=REVERSED_STATUSES)),
    )
    return {
        "successful": {
            "count": agg["successful_count"] or 0,
            "amount": _dec(agg["successful_amount"]),
        },
        "failed": {
            "count": agg["failed_count"] or 0,
            "amount": _dec(agg["failed_amount"]),
        },
        "pending": {
            "count": agg["pending_count"] or 0,
            "amount": _dec(agg["pending_amount"]),
        },
        "reversed": {
            "count": agg["reversed_count"] or 0,
            "amount": _dec(agg["reversed_amount"]),
        },
    }


def build_daily_reconciliation(target: date | None = None, city_id=None) -> dict:
    target = _parse_date(target)
    base = build_financial_reconciliation(date=target)

    ride_qs = Ride.objects.filter(status="completed", completed_at__date=target)
    delivery_qs = Delivery.objects.filter(status="delivered", delivered_at__date=target)
    if city_id:
        ride_qs = ride_qs.filter(city_id=city_id)
        delivery_qs = delivery_qs.filter(service_city__icontains=str(city_id))

    driver_earnings = ride_qs.aggregate(total=Sum("driver_earning"))["total"] or Decimal("0")
    courier_earnings = (
        _payments_for_range(target, target)
        .filter(status="paid", source="delivery")
        .aggregate(total=Sum("courier_earning"))["total"]
        or Decimal("0")
    )

    wallet_deposits = (
        WalletTransaction.objects.filter(
            created_at__date=target,
            is_credit=True,
            status="completed",
            transaction_type__in=["top_up", "refund", "referral", "bonus", "adjustment"],
        ).aggregate(total=Sum("amount"))["total"]
        or Decimal("0")
    )

    payments_all = _payments_for_range(target, target)
    failed_payments = payments_all.filter(status="failed").aggregate(
        total=Sum("amount"), count=Count("id")
    )
    pending_settlements = payments_all.filter(status__in=PENDING_STATUSES).aggregate(
        total=Sum("amount"), count=Count("id")
    )
    pending_withdrawals = WithdrawalRequest.objects.filter(status__in=["pending", "approved"]).aggregate(
        total=Sum("amount"), count=Count("id")
    )

    gross_ops = Decimal(str(base.get("ride_revenue", "0"))) + Decimal(
        str(base.get("delivery_revenue", "0"))
    )
    gross_payments = Decimal(str(base.get("gross_revenue", "0")))
    difference = abs(gross_payments - gross_ops)
    balanced = base.get("reconciled", False) and difference <= Decimal("1.00")

    return {
        "date": target.isoformat(),
        "totals": {
            "ride_revenue": base.get("ride_revenue", "0.00"),
            "delivery_revenue": base.get("delivery_revenue", "0.00"),
            "gross_revenue": base.get("gross_revenue", "0.00"),
            "platform_commission": base.get("commission", "0.00"),
            "driver_earnings": _dec(driver_earnings),
            "courier_earnings": _dec(courier_earnings),
            "wallet_deposits": _dec(wallet_deposits),
            "wallet_withdrawals": base.get("completed_withdrawals", "0.00"),
            "failed_payments": _dec(failed_payments["total"]),
            "failed_payments_count": failed_payments["count"] or 0,
            "refunds": base.get("refunds", "0.00"),
            "pending_settlements": _dec(pending_settlements["total"]),
            "pending_settlements_count": pending_settlements["count"] or 0,
            "pending_withdrawals": base.get("pending_withdrawals", "0.00"),
            "pending_withdrawals_count": pending_withdrawals["count"] or 0,
            "wallet_balance": base.get("wallet_balance", "0.00"),
        },
        "reconciliation": {
            "status": "balanced" if balanced else "difference_detected",
            "label": "Balanced" if balanced else "Difference detected",
            "operations_total": _dec(gross_ops),
            "payments_total": _dec(gross_payments),
            "difference_amount": _dec(difference),
        },
    }


def build_payment_provider_breakdown(start: date | None = None, end: date | None = None) -> dict:
    start = _parse_date(start or timezone.localdate())
    end = _parse_date(end or start)
    payments = _payments_for_range(start, end)
    providers = []
    for key, label, methods in PROVIDER_KEYS:
        providers.append(
            {
                "key": key,
                "label": label,
                "methods": methods,
                **_provider_bucket(methods, payments),
            }
        )
    return {
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "providers": providers,
    }


def build_withdrawal_queue(
    *,
    date_from=None,
    date_to=None,
    status=None,
    payment_method=None,
    limit: int = 200,
) -> dict:
    start = _parse_date(date_from) if date_from else None
    end = _parse_date(date_to) if date_to else None
    qs = WithdrawalRequest.objects.select_related("driver", "payout_method").order_by("-created_at")
    if start:
        qs = qs.filter(created_at__date__gte=start)
    if end:
        qs = qs.filter(created_at__date__lte=end)
    if status:
        qs = qs.filter(status=status)
    if payment_method:
        qs = qs.filter(payout_method__payout_type=payment_method)

    summary = qs.aggregate(
        total_amount=Sum("amount"),
        pending_amount=Sum("amount", filter=Q(status="pending")),
        approved_amount=Sum("amount", filter=Q(status="approved")),
        paid_amount=Sum("amount", filter=Q(status="paid")),
        rejected_amount=Sum("amount", filter=Q(status="rejected")),
        pending_count=Count("id", filter=Q(status="pending")),
        approved_count=Count("id", filter=Q(status="approved")),
        paid_count=Count("id", filter=Q(status="paid")),
        rejected_count=Count("id", filter=Q(status="rejected")),
    )

    rows = []
    for item in qs[:limit]:
        payout = item.payout_method
        rows.append(
            {
                "id": item.id,
                "driver_id": item.driver_id,
                "driver_email": item.driver.email if item.driver else "",
                "driver_name": item.driver.get_full_name() if item.driver else "",
                "amount": _dec(item.amount),
                "currency": item.currency,
                "status": item.status,
                "payout_method": payout.payout_type if payout else "",
                "payout_display": str(payout) if payout else "",
                "note": item.note,
                "admin_note": item.admin_note,
                "created_at": item.created_at.isoformat(),
                "approved_at": item.approved_at.isoformat() if item.approved_at else None,
                "paid_at": item.paid_at.isoformat() if item.paid_at else None,
                "payment_reference": item.payment_reference or item.reference,
            }
        )

    return {
        "summary": {
            "total_amount": _dec(summary["total_amount"]),
            "pending": {"amount": _dec(summary["pending_amount"]), "count": summary["pending_count"] or 0},
            "approved": {"amount": _dec(summary["approved_amount"]), "count": summary["approved_count"] or 0},
            "paid": {"amount": _dec(summary["paid_amount"]), "count": summary["paid_count"] or 0},
            "rejected": {"amount": _dec(summary["rejected_amount"]), "count": summary["rejected_count"] or 0},
        },
        "withdrawals": rows,
    }


def build_revenue_analytics(period: str = "daily", city_id=None) -> dict:
    start, end = _period_bounds(period)
    payments = _payment_qs(start, end)

    daily_chart = build_daily_payment_chart(payments, start, end)

    weekly_chart = []
    week_cursor = start
    while week_cursor <= end:
        week_end = min(week_cursor + timedelta(days=6), end)
        week_payments = payments.filter(
            created_at__date__gte=week_cursor,
            created_at__date__lte=week_end,
        )
        weekly_chart.append(
            {
                "start": week_cursor.isoformat(),
                "end": week_end.isoformat(),
                "label": f"{week_cursor.strftime('%b %d')} – {week_end.strftime('%b %d')}",
                "revenue": float(week_payments.aggregate(total=Sum("amount"))["total"] or 0),
            }
        )
        week_cursor = week_end + timedelta(days=1)

    monthly_start = end.replace(day=1)
    monthly_payments = PaymentRecord.objects.filter(
        status="paid",
        created_at__date__gte=monthly_start,
        created_at__date__lte=end,
    )
    monthly_chart = [
        {
            "month": monthly_start.strftime("%Y-%m"),
            "label": monthly_start.strftime("%B %Y"),
            "revenue": float(monthly_payments.aggregate(total=Sum("amount"))["total"] or 0),
            "commission": float(monthly_payments.aggregate(total=Sum("app_fee"))["total"] or 0),
        }
    ]

    by_city = []
    ride_cities = (
        Ride.objects.filter(status="completed", completed_at__date__gte=start, completed_at__date__lte=end)
        .values("city__name")
        .annotate(revenue=Sum("fare"), trips=Count("id"))
        .order_by("-revenue")[:20]
    )
    for row in ride_cities:
        by_city.append(
            {
                "city": row["city__name"] or "Unknown",
                "revenue": _dec(row["revenue"]),
                "trips": row["trips"],
            }
        )

    delivery_cities = (
        Delivery.objects.filter(status="delivered", delivered_at__date__gte=start, delivered_at__date__lte=end)
        .values("service_city")
        .annotate(revenue=Sum("fare"), deliveries=Count("id"))
        .order_by("-revenue")[:20]
    )
    for row in delivery_cities:
        by_city.append(
            {
                "city": row["service_city"] or "Unknown",
                "revenue": _dec(row["revenue"]),
                "deliveries": row["deliveries"],
            }
        )

    by_service = []
    for source, label in [("ride", "Rides"), ("delivery", "Delivery"), ("merchant_order", "Merchant")]:
        subset = payments.filter(source=source)
        by_service.append(
            {
                "service": source,
                "label": label,
                "revenue": _dec(subset.aggregate(total=Sum("amount"))["total"]),
                "count": subset.count(),
            }
        )

    by_payment_method = []
    for key, label, methods in PROVIDER_KEYS:
        subset = payments.filter(method__in=methods)
        by_payment_method.append(
            {
                "key": key,
                "label": label,
                "revenue": _dec(subset.aggregate(total=Sum("amount"))["total"]),
                "count": subset.count(),
            }
        )
    cash_subset = payments.filter(method="cash")
    by_payment_method.append(
        {
            "key": "cash",
            "label": "Cash",
            "revenue": _dec(cash_subset.aggregate(total=Sum("amount"))["total"]),
            "count": cash_subset.count(),
        }
    )

    finance = build_finance_dashboard(period=period, city_id=city_id)

    return {
        "period": period,
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "summary": finance.get("summary", {}),
        "charts": {
            "daily": daily_chart[-60:],
            "weekly": weekly_chart[-12:],
            "monthly": monthly_chart,
            "by_city": by_city[:25],
            "by_service": by_service,
            "by_payment_method": by_payment_method,
        },
    }


def build_accounting_report(report_type: str, date_from=None, date_to=None, city_id=None) -> dict:
    today = timezone.localdate()
    if report_type == "daily":
        start = end = _parse_date(date_from or today)
    elif report_type == "weekly":
        end = _parse_date(date_to or today)
        start = end - timedelta(days=end.weekday())
    elif report_type == "monthly":
        end = _parse_date(date_to or today)
        start = end.replace(day=1)
    elif report_type in {"cash_flow", "outstanding", "commission"}:
        start = _parse_date(date_from or today.replace(day=1))
        end = _parse_date(date_to or today)
    else:
        start = _parse_date(date_from or today)
        end = _parse_date(date_to or today)

    reconciliation = build_daily_reconciliation(target=end, city_id=city_id)
    payments = _payment_qs(start, end)
    gross = payments.aggregate(total=Sum("amount"))["total"] or Decimal("0")
    commission = payments.aggregate(total=Sum("app_fee"))["total"] or Decimal("0")

    wallet_total = WalletAccount.objects.aggregate(total=Sum("balance"))["total"] or Decimal("0")
    cash_in = payments.aggregate(total=Sum("amount"))["total"] or Decimal("0")
    cash_out = WithdrawalRequest.objects.filter(
        paid_at__date__gte=start, paid_at__date__lte=end, status="paid"
    ).aggregate(total=Sum("amount"))["total"] or Decimal("0")
    refunds = RefundRequest.objects.filter(
        resolved_at__date__gte=start, resolved_at__date__lte=end, status="refunded"
    ).aggregate(total=Sum("amount"))["total"] or Decimal("0")

    outstanding_withdrawals = WithdrawalRequest.objects.filter(status__in=["pending", "approved"]).aggregate(
        total=Sum("amount"), count=Count("id")
    )
    pending_refunds = RefundRequest.objects.filter(status="requested").aggregate(
        total=Sum("amount"), count=Count("id")
    )

    return {
        "report_type": report_type,
        "title": ACCOUNTING_REPORT_TYPES.get(report_type, "Financial Report"),
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "reconciliation": reconciliation,
        "metrics": {
            "gross_revenue": _dec(gross),
            "platform_commission": _dec(commission),
            "cash_in": _dec(cash_in),
            "cash_out": _dec(cash_out),
            "refunds": _dec(refunds),
            "net_cash_flow": _dec(cash_in - cash_out - refunds),
            "wallet_balance": _dec(wallet_total),
            "outstanding_withdrawals": _dec(outstanding_withdrawals["total"]),
            "outstanding_withdrawals_count": outstanding_withdrawals["count"] or 0,
            "pending_refunds": _dec(pending_refunds["total"]),
            "pending_refunds_count": pending_refunds["count"] or 0,
        },
    }


def build_finance_audit_trail(*, date_from=None, date_to=None, limit: int = 100) -> dict:
    start = _parse_date(date_from) if date_from else timezone.localdate() - timedelta(days=30)
    end = _parse_date(date_to) if date_to else timezone.localdate()

    logs = (
        AuditLog.objects.filter(
            created_at__date__gte=start,
            created_at__date__lte=end,
        )
        .filter(
            Q(action__in=["payment_change", "refund", "admin_action"])
            | Q(entity_type__in=["payment", "refund"])
        )
        .select_related("actor")
        .order_by("-created_at")[:limit]
    )

    entries = []
    for log in logs:
        details = log.details or {}
        before = details.get("before") or details.get("previous") or details.get("old_status")
        after = details.get("after") or details.get("new_status") or details.get("status")
        amount = details.get("amount") or details.get("value")
        entries.append(
            {
                "id": log.id,
                "user": log.actor.email if log.actor else "System",
                "user_id": log.actor_id,
                "timestamp": log.created_at.isoformat(),
                "action": log.action,
                "entity_type": log.entity_type,
                "entity_id": log.entity_id,
                "summary": log.summary,
                "amount": _dec(amount) if amount is not None else "",
                "before": before,
                "after": after,
                "details": details,
            }
        )

    return {
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "count": len(entries),
        "entries": entries,
    }


def build_finance_operations_dashboard(
    *,
    date=None,
    period: str = "daily",
    city_id=None,
    withdrawal_status=None,
    withdrawal_method=None,
) -> dict:
    target = _parse_date(date)
    return {
        "generated_at": timezone.now().isoformat(),
        "date": target.isoformat(),
        "period": period,
        "reconciliation": build_daily_reconciliation(target=target, city_id=city_id),
        "payment_providers": build_payment_provider_breakdown(start=target, end=target),
        "withdrawals": build_withdrawal_queue(
            date_from=target.isoformat(),
            date_to=target.isoformat(),
            status=withdrawal_status,
            payment_method=withdrawal_method,
        ),
        "revenue_analytics": build_revenue_analytics(period=period, city_id=city_id),
        "accounting": {
            "daily": build_accounting_report("daily", date_from=target.isoformat()),
            "weekly": build_accounting_report("weekly", date_to=target.isoformat()),
            "monthly": build_accounting_report("monthly", date_to=target.isoformat()),
        },
        "audit": build_finance_audit_trail(date_from=(target - timedelta(days=30)).isoformat(), date_to=target.isoformat()),
    }


def build_finance_operations_export_rows(report_type: str, date_from=None, date_to=None) -> list[dict]:
    report = build_accounting_report(report_type, date_from=date_from, date_to=date_to)
    rows = [
        {
            "metric": "report_type",
            "value": report["report_type"],
            "period_start": report["start_date"],
            "period_end": report["end_date"],
        }
    ]
    for key, value in report.get("metrics", {}).items():
        rows.append(
            {
                "metric": key,
                "value": value,
                "period_start": report["start_date"],
                "period_end": report["end_date"],
            }
        )
    recon = report.get("reconciliation", {}).get("totals", {})
    for key, value in recon.items():
        rows.append(
            {
                "metric": f"reconciliation_{key}",
                "value": value,
                "period_start": report["start_date"],
                "period_end": report["end_date"],
            }
        )
    return rows


def build_withdrawal_export_rows(date_from=None, date_to=None, status=None, payment_method=None) -> list[dict]:
    payload = build_withdrawal_queue(
        date_from=date_from,
        date_to=date_to,
        status=status,
        payment_method=payment_method,
        limit=5000,
    )
    rows = []
    for item in payload["withdrawals"]:
        rows.append(
            {
                "id": item["id"],
                "driver": item["driver_email"],
                "driver_name": item["driver_name"],
                "amount": item["amount"],
                "currency": item["currency"],
                "status": item["status"],
                "payout_method": item["payout_method"],
                "created_at": item["created_at"],
                "paid_at": item["paid_at"] or "",
                "payment_reference": item["payment_reference"],
            }
        )
    return rows
