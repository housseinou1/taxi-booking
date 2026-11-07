"""Aggregated metrics for the Yala executive operations dashboard."""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db.models import Count, Q, Sum
from django.utils import timezone

from .chart_utils import build_daily_payment_chart

from admin_2fa.models import AdminTOTP
from deliveries.cities import normalize_city_name
from deliveries.models import Delivery, DeliveryDispute
from locations.models import City as LocationCity
from payments.models import PaymentRecord, RefundRequest, WalletAccount, WithdrawalRequest
from referrals.models import FlaggedReferral
from safety.models import SafetyIncident
from security.models import AuditLog, FraudFlag
from taxi.drivers.models import DriverDocument, DriverProfile, SupportTicket
from taxi.rides.models import Ride

from .city_id_bridge import registry_city_ids_for_location_city_id

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


def _ride_city_q(city_id: int) -> Q:
    """Rides for an operating area: one unified Nouakchott matches all NKC location rows."""
    loc = LocationCity.objects.filter(pk=city_id).first()
    if loc is None:
        return Q(pk__in=[])
    if (loc.name or "").strip().casefold() == "nouakchott":
        return Q(city__name__iexact="Nouakchott")
    return Q(city_id=city_id)


def _delivery_city_q(city_id: int) -> Q:
    """Deliveries by canonical service city name (not numeric id)."""
    loc = LocationCity.objects.filter(pk=city_id).first()
    if loc is None:
        return Q(pk__in=[])
    name = (loc.name or "").strip()
    if name.casefold() == "nouakchott":
        return Q(service_city__iexact="Nouakchott")
    canon = normalize_city_name(name) or name
    return Q(service_city__iexact=canon)


def _ride_qs(start, end, city_id=None):
    qs = Ride.objects.filter(created_at__date__gte=start, created_at__date__lte=end)
    if city_id:
        qs = qs.filter(_ride_city_q(city_id))
    return qs


def _delivery_qs(start, end, city_id=None):
    qs = Delivery.objects.filter(created_at__date__gte=start, created_at__date__lte=end)
    if city_id:
        qs = qs.filter(_delivery_city_q(city_id))
    return qs


def _scoped_withdrawals(qs, city_id=None):
    if not city_id:
        return qs
    reg_ids = registry_city_ids_for_location_city_id(city_id)
    if reg_ids:
        return qs.filter(driver__city_id__in=reg_ids)
    return qs.none()


def _payment_qs(start, end):
    return PaymentRecord.objects.filter(
        status="paid",
        created_at__date__gte=start,
        created_at__date__lte=end,
    )


def build_live_metrics(city_id=None) -> dict:
    today = timezone.localdate()
    # Ride drivers only — courier profiles are excluded using the canonical definition in
    # operations.fleet_metrics, so this dashboard never double-counts a courier as a driver.
    from operations.fleet_metrics import courier_user_ids

    reg_ids = registry_city_ids_for_location_city_id(city_id) if city_id else []

    drivers_online = DriverProfile.objects.filter(
        is_available=True, status="approved"
    ).exclude(user_id__in=courier_user_ids())
    if city_id:
        if reg_ids:
            drivers_online = drivers_online.filter(user__city_id__in=reg_ids)
        else:
            drivers_online = drivers_online.none()

    active_trip_rides = Ride.objects.filter(status__in=RIDE_ACTIVE)
    active_deliveries = Delivery.objects.filter(status__in=DELIVERY_ACTIVE)
    if city_id:
        active_trip_rides = active_trip_rides.filter(_ride_city_q(city_id))
        active_deliveries = active_deliveries.filter(_delivery_city_q(city_id))

    courier_qs = Delivery.objects.filter(status__in=DELIVERY_ACTIVE, driver__isnull=False)
    ride_scope = Ride.objects.filter(status__in=RIDE_ACTIVE)
    if city_id:
        courier_qs = courier_qs.filter(_delivery_city_q(city_id))
        ride_scope = ride_scope.filter(_ride_city_q(city_id))
    active_courier_ids = courier_qs.values_list("driver_id", flat=True).distinct()
    active_rider_ids = ride_scope.values_list("rider_id", flat=True).distinct()

    today_rides = _ride_qs(today, today, city_id)
    today_deliveries = _delivery_qs(today, today, city_id)
    if city_id:
        ride_ids_today = today_rides.values_list("id", flat=True)
        del_ids_today = today_deliveries.values_list("id", flat=True)
        today_payments = PaymentRecord.objects.filter(
            status="paid",
            created_at__date=today,
        ).filter(Q(ride_id__in=ride_ids_today) | Q(delivery_id__in=del_ids_today))
    else:
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
            "withdrawal_requests": _scoped_withdrawals(
                WithdrawalRequest.objects.filter(created_at__date=today), city_id
            ).count(),
            "refund_requests": RefundRequest.objects.filter(created_at__date=today).count(),
        },
    }


def build_finance_dashboard(period: str = "daily", city_id=None) -> dict:
    start, end = _period_bounds(period)
    if city_id:
        ride_ids = _ride_qs(start, end, city_id).values_list("id", flat=True)
        delivery_ids = _delivery_qs(start, end, city_id).values_list("id", flat=True)
        payments = PaymentRecord.objects.filter(
            status="paid",
            created_at__date__gte=start,
            created_at__date__lte=end,
        ).filter(Q(ride_id__in=ride_ids) | Q(delivery_id__in=delivery_ids))
    else:
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
    if city_id:
        reg_scope = registry_city_ids_for_location_city_id(city_id)
        if reg_scope:
            withdrawals = withdrawals.filter(driver__city_id__in=reg_scope)
        else:
            withdrawals = withdrawals.none()
    refunds = RefundRequest.objects.filter(
        created_at__date__gte=start,
        created_at__date__lte=end,
        status="refunded",
    )
    if city_id:
        reg_wb = registry_city_ids_for_location_city_id(city_id)
        if reg_wb:
            wallet_balance = WalletAccount.objects.filter(owner__city_id__in=reg_wb).aggregate(
                total=Sum("balance")
            )["total"] or Decimal("0")
            pending_withdrawals = WithdrawalRequest.objects.filter(
                status__in=["pending", "approved"],
                driver__city_id__in=reg_wb,
            ).aggregate(total=Sum("amount"))["total"] or Decimal("0")
        else:
            wallet_balance = Decimal("0")
            pending_withdrawals = Decimal("0")
    else:
        wallet_balance = WalletAccount.objects.aggregate(total=Sum("balance"))["total"] or Decimal("0")
        pending_withdrawals = WithdrawalRequest.objects.filter(
            status__in=["pending", "approved"]
        ).aggregate(total=Sum("amount"))["total"] or Decimal("0")

    chart = build_daily_payment_chart(payments, start, end)

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
    dprof_qs = DriverProfile.objects.filter(
        is_available=True,
        status="approved",
        current_lat__isnull=False,
        current_lng__isnull=False,
    )
    if city_id:
        reg_map = registry_city_ids_for_location_city_id(city_id)
        if reg_map:
            dprof_qs = dprof_qs.filter(user__city_id__in=reg_map)
        else:
            dprof_qs = dprof_qs.none()

    drivers = []
    for profile in dprof_qs.select_related("user")[:500]:
        drivers.append(
            {
                "id": profile.user_id,
                "type": "driver",
                "lat": profile.current_lat,
                "lng": profile.current_lng,
                "label": profile.user.get_full_name() or profile.user.email,
            }
        )

    courier_deliveries = Delivery.objects.filter(
        status__in=DELIVERY_ACTIVE,
        driver__isnull=False,
        driver__driver_profile__current_lat__isnull=False,
    )
    if city_id:
        courier_deliveries = courier_deliveries.filter(_delivery_city_q(city_id))

    couriers = []
    for delivery in courier_deliveries.select_related("driver__driver_profile")[:200]:
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

    ride_map_qs = Ride.objects.filter(status__in=RIDE_ACTIVE).exclude(pickup_lat__isnull=True)
    if city_id:
        ride_map_qs = ride_map_qs.filter(_ride_city_q(city_id))

    trips = []
    for ride in ride_map_qs[:200]:
        trips.append(
            {
                "id": ride.id,
                "type": "trip",
                "lat": ride.pickup_lat,
                "lng": ride.pickup_lng,
                "status": ride.status,
            }
        )

    dmark_qs = Delivery.objects.filter(status__in=DELIVERY_ACTIVE)
    if city_id:
        dmark_qs = dmark_qs.filter(_delivery_city_q(city_id))

    delivery_markers = []
    for delivery in dmark_qs[:200]:
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
        rides = rides.filter(_ride_city_q(city_id))

    ride_counts = {status: 0 for status, _ in Ride.STATUS_CHOICES}
    ride_counts["searching"] = rides.filter(status="requested", driver__isnull=True).count()
    for row in rides.values("status").annotate(count=Count("id")):
        ride_counts[row["status"]] = row["count"]

    deliveries = Delivery.objects.all()
    if city_id:
        deliveries = deliveries.filter(_delivery_city_q(city_id))
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
    suspended_drivers = DriverProfile.objects.filter(
        Q(suspension_active=True) | Q(account_under_review=True)
    ).count()
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
