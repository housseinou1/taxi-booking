"""Aggregated metrics for the Yala executive operations dashboard."""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db.models import Count, Sum
from django.utils import timezone

from admin_2fa.models import AdminTOTP
from deliveries.models import Delivery, DeliveryDispute
from payments.models import PaymentRecord, RefundRequest, WalletAccount, WithdrawalRequest
from referrals.models import FlaggedReferral
from safety.models import SafetyIncident
from security.models import AuditLog, FraudFlag
from taxi.drivers.models import DriverDocument, DriverProfile, SupportTicket
from taxi.rides.models import Ride

User = get_user_model()

RIDE_ACTIVE = ["requested", "scheduled", "driver_arriving", "driver_arrived", "in_progress"]
DELIVERY_ACTIVE = [
    "requested",
    "accepted",
    "courier_arriving",
    "picked_up",
    "in_transit",
    "delivering",
    "delivery_exception",
]


def _dec(value) -> str:
    if value is None:
        return "0"
    return str(Decimal(str(value)).quantize(Decimal("0.01")))


def _period_bounds(period: str):
    today = timezone.localdate()
    if period == "daily":
        start = today
    elif period == "weekly":
        start = today - timedelta(days=today.weekday())
    elif period == "monthly":
        start = today.replace(day=1)
    elif period == "yearly":
        start = today.replace(month=1, day=1)
    else:
        start = today
    return start, today


def _ride_qs(start, end, city_id=None):
    qs = Ride.objects.filter(created_at__date__gte=start, created_at__date__lte=end)
    if city_id:
        qs = qs.filter(city_id=city_id)
    return qs


def _delivery_qs(start, end, city_id=None):
    qs = Delivery.objects.filter(created_at__date__gte=start, created_at__date__lte=end)
    if city_id:
        qs = qs.filter(service_city__icontains=str(city_id))
    return qs


def _payment_qs(start, end):
    return PaymentRecord.objects.filter(
        status="paid",
        created_at__date__gte=start,
        created_at__date__lte=end,
    )


def build_live_metrics(city_id=None) -> dict:
    today = timezone.localdate()
    drivers_online = DriverProfile.objects.filter(is_available=True, status="approved")
    if city_id:
        drivers_online = drivers_online.filter(user__city_id=city_id)

    active_trip_rides = Ride.objects.filter(status__in=RIDE_ACTIVE)
    active_deliveries = Delivery.objects.filter(status__in=DELIVERY_ACTIVE)
    if city_id:
        active_trip_rides = active_trip_rides.filter(city_id=city_id)

    active_courier_ids = (
        Delivery.objects.filter(status__in=DELIVERY_ACTIVE, driver__isnull=False)
        .values_list("driver_id", flat=True)
        .distinct()
    )
    active_rider_ids = (
        Ride.objects.filter(status__in=RIDE_ACTIVE)
        .values_list("rider_id", flat=True)
        .distinct()
    )

    today_rides = _ride_qs(today, today, city_id)
    today_deliveries = _delivery_qs(today, today, city_id)
    today_payments = _payment_qs(today, today)

    gross_revenue = today_payments.aggregate(total=Sum("amount"))["total"] or Decimal("0")
    platform_commission = today_payments.aggregate(total=Sum("app_fee"))["total"] or Decimal("0")
    driver_earnings = today_rides.filter(status="completed").aggregate(
        total=Sum("driver_earning")
    )["total"] or Decimal("0")
    courier_earnings = today_payments.aggregate(total=Sum("courier_earning"))["total"] or Decimal(
        "0"
    )

    return {
        "generated_at": timezone.now().isoformat(),
        "live": {
            "active_drivers": drivers_online.count(),
            "active_couriers": len(set(active_courier_ids)),
            "active_riders": len(set(active_rider_ids)),
            "active_deliveries": active_deliveries.count(),
            "active_trips": active_trip_rides.count(),
        },
        "today": {
            "trips": today_rides.count(),
            "deliveries": today_deliveries.count(),
            "revenue": _dec(gross_revenue),
            "driver_earnings": _dec(driver_earnings),
            "courier_earnings": _dec(courier_earnings),
            "platform_commission": _dec(platform_commission),
            "withdrawal_requests": WithdrawalRequest.objects.filter(
                created_at__date=today
            ).count(),
            "refund_requests": RefundRequest.objects.filter(created_at__date=today).count(),
        },
    }


def build_finance_dashboard(period: str = "daily", city_id=None) -> dict:
    start, end = _period_bounds(period)
    payments = _payment_qs(start, end)
    rides = _ride_qs(start, end, city_id).filter(status="completed")
    deliveries = _delivery_qs(start, end, city_id).filter(status="delivered")

    gross = payments.aggregate(total=Sum("amount"))["total"] or Decimal("0")
    commission = payments.aggregate(total=Sum("app_fee"))["total"] or Decimal("0")
    driver_earnings = rides.aggregate(total=Sum("driver_earning"))["total"] or Decimal("0")
    courier_earnings = payments.aggregate(total=Sum("courier_earning"))["total"] or Decimal("0")

    withdrawals = WithdrawalRequest.objects.filter(
        created_at__date__gte=start,
        created_at__date__lte=end,
        status__in=["approved", "paid"],
    )
    refunds = RefundRequest.objects.filter(
        created_at__date__gte=start,
        created_at__date__lte=end,
        status="refunded",
    )
    wallet_balance = WalletAccount.objects.aggregate(total=Sum("balance"))["total"] or Decimal("0")
    pending_withdrawals = WithdrawalRequest.objects.filter(
        status__in=["pending", "approved"]
    ).aggregate(total=Sum("amount"))["total"] or Decimal("0")

    chart = []
    cursor = start
    while cursor <= end:
        day_payments = payments.filter(created_at__date=cursor)
        chart.append(
            {
                "date": cursor.isoformat(),
                "label": cursor.strftime("%b %d"),
                "gross_revenue": float(
                    day_payments.aggregate(total=Sum("amount"))["total"] or 0
                ),
                "platform_commission": float(
                    day_payments.aggregate(total=Sum("app_fee"))["total"] or 0
                ),
            }
        )
        cursor += timedelta(days=1)

    return {
        "period": period,
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "summary": {
            "gross_revenue": _dec(gross),
            "platform_commission": _dec(commission),
            "driver_earnings": _dec(driver_earnings),
            "courier_earnings": _dec(courier_earnings),
            "withdrawal_total": _dec(withdrawals.aggregate(total=Sum("amount"))["total"]),
            "refund_total": _dec(refunds.aggregate(total=Sum("amount"))["total"]),
            "wallet_balance": _dec(wallet_balance),
            "pending_withdrawals": _dec(pending_withdrawals),
        },
        "chart": chart[-60:],
    }


def build_map_snapshot(city_id=None) -> dict:
    drivers = []
    for profile in DriverProfile.objects.filter(
        is_available=True,
        status="approved",
        current_lat__isnull=False,
        current_lng__isnull=False,
    ).select_related("user")[:500]:
        drivers.append(
            {
                "id": profile.user_id,
                "type": "driver",
                "lat": profile.current_lat,
                "lng": profile.current_lng,
                "label": profile.user.get_full_name() or profile.user.email,
            }
        )

    couriers = []
    for delivery in Delivery.objects.filter(
        status__in=DELIVERY_ACTIVE,
        driver__isnull=False,
        driver__driver_profile__current_lat__isnull=False,
    ).select_related("driver__driver_profile")[:200]:
        profile = delivery.driver.driver_profile
        couriers.append(
            {
                "id": delivery.driver_id,
                "delivery_id": delivery.id,
                "type": "courier",
                "lat": profile.current_lat,
                "lng": profile.current_lng,
                "status": delivery.status,
            }
        )

    trips = []
    for ride in Ride.objects.filter(status__in=RIDE_ACTIVE).exclude(
        pickup_lat__isnull=True
    )[:200]:
        trips.append(
            {
                "id": ride.id,
                "type": "trip",
                "lat": ride.pickup_lat,
                "lng": ride.pickup_lng,
                "status": ride.status,
            }
        )

    delivery_markers = []
    for delivery in Delivery.objects.filter(status__in=DELIVERY_ACTIVE)[:200]:
        delivery_markers.append(
            {
                "id": delivery.id,
                "type": "delivery",
                "lat": delivery.pickup_lat,
                "lng": delivery.pickup_lng,
                "status": delivery.status,
            }
        )

    sos = []
    for incident in SafetyIncident.objects.filter(
        status__in=["open", "acknowledged", "investigating"]
    ).exclude(latitude__isnull=True)[:50]:
        sos.append(
            {
                "id": incident.id,
                "type": "sos",
                "lat": incident.latitude,
                "lng": incident.longitude,
                "reference": incident.reference,
                "status": incident.status,
            }
        )

    return {
        "generated_at": timezone.now().isoformat(),
        "markers": {
            "drivers": drivers,
            "couriers": couriers,
            "trips": trips,
            "deliveries": delivery_markers,
            "sos": sos,
        },
    }


def build_operations_queues(city_id=None) -> dict:
    rides = Ride.objects.all()
    if city_id:
        rides = rides.filter(city_id=city_id)

    ride_counts = {status: 0 for status, _ in Ride.STATUS_CHOICES}
    ride_counts["searching"] = rides.filter(status="requested", driver__isnull=True).count()
    for row in rides.values("status").annotate(count=Count("id")):
        ride_counts[row["status"]] = row["count"]

    deliveries = Delivery.objects.all()
    delivery_counts = {status: 0 for status, _ in Delivery.STATUS_CHOICES}
    for row in deliveries.values("status").annotate(count=Count("id")):
        delivery_counts[row["status"]] = row["count"]

    recent_rides = list(
        rides.order_by("-created_at")[:20].values(
            "id", "status", "pickup", "destination", "created_at", "driver_id", "rider_id"
        )
    )
    recent_deliveries = list(
        deliveries.order_by("-created_at")[:20].values(
            "id", "status", "pickup", "destination", "created_at", "driver_id", "customer_id"
        )
    )

    return {
        "rides": {
            "counts": ride_counts,
            "queue": recent_rides,
        },
        "deliveries": {
            "counts": delivery_counts,
            "queue": recent_deliveries,
        },
    }


def build_security_panel() -> dict:
    blocked_accounts = User.objects.filter(is_active=False, is_staff=False).count()
    suspended_drivers = DriverProfile.objects.filter(account_under_review=True).count()
    expired_documents = DriverDocument.objects.filter(
        expires_at__lt=timezone.localdate()
    ).count()
    high_cancellation_drivers = DriverProfile.objects.filter(
        total_rides_cancelled__gte=5
    ).count()
    duplicate_accounts = FlaggedReferral.objects.filter(status="pending").count()
    failed_logins = AuditLog.objects.filter(
        action="admin_action",
        summary__icontains="login",
        created_at__gte=timezone.now() - timedelta(days=1),
    ).count()
    admin_2fa_enabled = AdminTOTP.objects.filter(is_confirmed=True).count()
    admin_2fa_total = AdminTOTP.objects.count()

    open_fraud = FraudFlag.objects.filter(status="open").count()
    recent_fraud = list(
        FraudFlag.objects.filter(status="open")
        .order_by("-created_at")[:10]
        .values("id", "reason", "severity", "user_id", "created_at", "status")
    )

    return {
        "blocked_accounts": blocked_accounts,
        "suspended_drivers": suspended_drivers,
        "expired_documents": expired_documents,
        "high_cancellation_drivers": high_cancellation_drivers,
        "duplicate_accounts": duplicate_accounts,
        "failed_logins_24h": failed_logins,
        "admin_2fa": {
            "enabled": admin_2fa_enabled,
            "total": admin_2fa_total,
        },
        "open_fraud_flags": open_fraud,
        "recent_fraud_flags": recent_fraud,
    }


def build_support_panel() -> dict:
    tickets = SupportTicket.objects.all()
    open_tickets = tickets.filter(status__in=["open", "in_progress"]).count()
    urgent_tickets = tickets.filter(ticket_type="emergency", status="open").count()
    refund_requests = RefundRequest.objects.filter(status="requested").count()
    disputes = DeliveryDispute.objects.filter(status="open").count()

    resolved = tickets.filter(resolved_at__isnull=False, created_at__isnull=False)
    avg_response_minutes = None
    if resolved.exists():
        total_minutes = 0
        count = 0
        for ticket in resolved[:100]:
            if ticket.resolved_at and ticket.created_at:
                total_minutes += (ticket.resolved_at - ticket.created_at).total_seconds() / 60
                count += 1
        if count:
            avg_response_minutes = round(total_minutes / count, 1)

    recent_tickets = list(
        tickets.order_by("-created_at")[:15].values(
            "id", "ticket_type", "status", "subject", "created_at", "resolved_at"
        )
    )

    return {
        "open_tickets": open_tickets,
        "urgent_tickets": urgent_tickets,
        "refund_requests": refund_requests,
        "disputes": disputes,
        "average_response_minutes": avg_response_minutes,
        "recent_tickets": recent_tickets,
    }


def build_qa_reconciliation() -> dict:
    """Cross-check headline numbers against source tables."""
    today = timezone.localdate()
    payments = _payment_qs(today, today)
    gross_from_payments = payments.aggregate(total=Sum("amount"))["total"] or Decimal("0")
    commission_from_payments = payments.aggregate(total=Sum("app_fee"))["total"] or Decimal("0")

    ride_revenue = (
        Ride.objects.filter(status="completed", completed_at__date=today).aggregate(
            total=Sum("fare")
        )["total"]
        or Decimal("0")
    )
    delivery_revenue = (
        Delivery.objects.filter(status="delivered", delivered_at__date=today).aggregate(
            total=Sum("fare")
        )["total"]
        or Decimal("0")
    )

    wallet_total = WalletAccount.objects.aggregate(total=Sum("balance"))["total"] or Decimal("0")
    pending_withdrawals = WithdrawalRequest.objects.filter(
        status__in=["pending", "approved"]
    ).aggregate(total=Sum("amount"))["total"] or Decimal("0")

    return {
        "revenue_matches_payments": abs(
            Decimal(str(gross_from_payments)) - Decimal(str(ride_revenue + delivery_revenue))
        )
        <= Decimal("1.00"),
        "gross_revenue_payments": _dec(gross_from_payments),
        "gross_revenue_operations": _dec(ride_revenue + delivery_revenue),
        "platform_commission": _dec(commission_from_payments),
        "wallet_balance": _dec(wallet_total),
        "pending_withdrawals": _dec(pending_withdrawals),
        "driver_trips_today": Ride.objects.filter(
            status="completed", completed_at__date=today
        ).count(),
        "deliveries_today": Delivery.objects.filter(
            status="delivered", delivered_at__date=today
        ).count(),
    }


def build_report_rows(filters: dict) -> list[dict]:
    start = filters.get("date_from") or timezone.localdate().replace(day=1).isoformat()
    end = filters.get("date_to") or timezone.localdate().isoformat()
    payments = PaymentRecord.objects.filter(
        status="paid",
        created_at__date__gte=start,
        created_at__date__lte=end,
    )
    if filters.get("payment_method"):
        payments = payments.filter(method=filters["payment_method"])
    if filters.get("driver_id"):
        payments = payments.filter(courier_id=filters["driver_id"])
    if filters.get("courier_id"):
        payments = payments.filter(courier_id=filters["courier_id"])

    rows = []
    for record in payments.order_by("-created_at")[:5000]:
        rows.append(
            {
                "date": record.created_at.date().isoformat(),
                "source": record.source,
                "method": record.method,
                "amount": _dec(record.amount),
                "app_fee": _dec(record.app_fee),
                "courier_earning": _dec(record.courier_earning),
                "customer_id": record.customer_id,
                "courier_id": record.courier_id,
            }
        )
    return rows
