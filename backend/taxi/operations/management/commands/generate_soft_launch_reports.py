"""Generate Nouakchott soft-launch operational reports (Phase 19)."""

from __future__ import annotations

import json
from datetime import timedelta
from decimal import Decimal
from pathlib import Path

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db.models import Avg, Count, Q, Sum
from django.utils import timezone

from deliveries.models import Delivery, DriverDeliverySettings
from operations.executive_service import (
    build_finance_dashboard,
    build_live_metrics,
    build_support_panel,
)
from operations.launch_service import (
    build_business_kpis,
    build_financial_reconciliation,
    build_launch_control_dashboard,
    build_onboarding_dashboard,
    build_support_queue,
)
from operations.models import LaunchAlert, OpsIncident, PlatformSetting
from payments.models import DriverPayoutMethod, PaymentRecord, WalletAccount, WithdrawalRequest
from safety.models import SafetyIncident
from taxi.drivers.models import DriverDocument, DriverProfile, SupportTicket
from taxi.rides.models import Ride

User = get_user_model()

PILOT_MAX_DRIVERS = 100
PILOT_MAX_COURriers = 50
PILOT_MAX_RIDERS = 1000


def _pilot_config() -> dict:
    return PlatformSetting.get_value(
        "soft_launch",
        {
            "pilot_city": "Nouakchott",
            "max_drivers": PILOT_MAX_DRIVERS,
            "max_couriers": PILOT_MAX_COURriers,
            "max_riders": PILOT_MAX_RIDERS,
        },
    )


def _driver_has_required_docs(profile: DriverProfile) -> bool:
    required = {"license", "national_id", "insurance", "carte_grise"}
    uploaded = set(profile.documents.filter(status="approved").values_list("document_type", flat=True))
    return required.issubset(uploaded)


def _driver_has_vehicle(profile: DriverProfile) -> bool:
    return bool(profile.vehicle_plate and profile.vehicle_make)


def build_pilot_driver_report() -> dict:
    today = timezone.localdate()
    approved = DriverProfile.objects.filter(status="approved").select_related("user")
    approved_count = approved.count()

    with_docs = sum(1 for p in approved[:500] if _driver_has_required_docs(p))
    with_vehicle = sum(1 for p in approved[:500] if _driver_has_vehicle(p))
    with_gps = approved.filter(current_lat__isnull=False, current_lng__isnull=False).count()

    payout_user_ids = set(
        DriverPayoutMethod.objects.filter(
            payout_type__in=["bankily", "seddad", "masrvi"],
            is_verified=True,
        ).values_list("driver_id", flat=True)
    )
    approved_user_ids = set(approved.values_list("user_id", flat=True))
    with_payout = len(payout_user_ids & approved_user_ids)

    wallet_user_ids = set(
        WalletAccount.objects.filter(balance__gt=0).values_list("user_id", flat=True)
    )
    with_wallet = len(wallet_user_ids & approved_user_ids)

    expired_docs = DriverDocument.objects.filter(
        driver__status="approved",
        expires_at__lt=today,
        status="approved",
    ).count()

    online = approved.filter(is_available=True).count()
    target = _pilot_config().get("max_drivers", PILOT_MAX_DRIVERS)

    return {
        "generated_at": timezone.now().isoformat(),
        "target": target,
        "approved_count": approved_count,
        "gap_to_target": max(0, target - approved_count),
        "online_now": online,
        "verification": {
            "documents_complete": with_docs,
            "vehicle_registered": with_vehicle,
            "gps_last_known": with_gps,
            "payout_method_verified": with_payout,
            "wallet_active": with_wallet,
            "expired_documents": expired_docs,
        },
        "onboarding": build_onboarding_dashboard(),
    }


def build_pilot_courier_report() -> dict:
    today = timezone.localdate()
    couriers = DriverDeliverySettings.objects.filter(delivery_mode_enabled=True).select_related(
        "driver__driver_profile"
    )
    enabled_count = couriers.count()
    target = _pilot_config().get("max_couriers", PILOT_MAX_COURriers)

    approved_couriers = couriers.filter(driver__driver_profile__status="approved")
    suspended = couriers.filter(is_suspended=True).count()
    available = approved_couriers.filter(driver__driver_profile__is_available=True).count()

    with_wallet = WalletAccount.objects.filter(
        user_id__in=approved_couriers.values_list("driver_id", flat=True),
        balance__gt=0,
    ).count()

    completed = couriers.aggregate(total=Sum("total_deliveries_completed"))["total"] or 0

    missing_docs = 0
    for settings in approved_couriers[:200]:
        profile = settings.driver.driver_profile
        vehicle = settings.delivery_vehicle_type or "motorcycle"
        required = {"national_id"} if vehicle == "bicycle" else {"national_id", "license", "carte_grise", "insurance"}
        uploaded = set(profile.documents.filter(status="approved").values_list("document_type", flat=True))
        if not required.issubset(uploaded):
            missing_docs += 1

    return {
        "generated_at": timezone.now().isoformat(),
        "target": target,
        "couriers_enabled": enabled_count,
        "couriers_approved": approved_couriers.count(),
        "gap_to_target": max(0, target - approved_couriers.count()),
        "online_now": available,
        "suspended": suspended,
        "total_deliveries_completed": completed,
        "verification": {
            "missing_documents": missing_docs,
            "wallet_active": with_wallet,
        },
    }


def build_rider_invitation_report() -> dict:
    today = timezone.localdate()
    week_ago = today - timedelta(days=7)

    riders = User.objects.filter(is_active=True).exclude(
        Q(driver_profile__isnull=False) | Q(is_staff=True)
    )
    total_riders = riders.count()
    target = _pilot_config().get("max_riders", PILOT_MAX_RIDERS)

    registered_week = riders.filter(date_joined__date__gte=week_ago).count()
    verified = riders.filter(is_active=True, email__isnull=False).exclude(email="").count()

    first_ride_ids = (
        Ride.objects.filter(status="completed")
        .values("rider_id")
        .annotate(trip_count=Count("id"))
        .filter(trip_count=1)
        .values_list("rider_id", flat=True)
    )
    first_ride_count = len(set(first_ride_ids))

    repeat_riders = (
        Ride.objects.filter(status="completed")
        .values("rider_id")
        .annotate(trip_count=Count("id"))
        .filter(trip_count__gte=2)
        .count()
    )

    return {
        "generated_at": timezone.now().isoformat(),
        "target": target,
        "total_registered": total_riders,
        "gap_to_target": max(0, target - total_riders),
        "registered_last_7_days": registered_week,
        "verified_accounts": verified,
        "first_ride_completed": first_ride_count,
        "repeat_riders_2plus": repeat_riders,
    }


def build_daily_operations_report() -> dict:
    today = timezone.localdate()
    rides = Ride.objects.filter(created_at__date=today)
    deliveries = Delivery.objects.filter(created_at__date=today)

    ride_total = rides.count()
    ride_completed = rides.filter(status="completed").count()
    ride_cancelled = rides.filter(status="cancelled").count()
    ride_accepted = rides.exclude(status="requested").count()

    delivery_total = deliveries.count()
    delivery_completed = deliveries.filter(status="delivered").count()

    acceptance_rate = round(100 * ride_accepted / ride_total, 1) if ride_total else None
    ride_completion_rate = round(100 * ride_completed / ride_total, 1) if ride_total else None
    delivery_completion_rate = (
        round(100 * delivery_completed / delivery_total, 1) if delivery_total else None
    )
    cancellation_rate = round(100 * ride_cancelled / ride_total, 1) if ride_total else None

    avg_wait = None
    waited = rides.filter(driver_arrived_at__isnull=False, completed_at__isnull=False)
    if waited.exists():
        total_seconds = 0
        count = 0
        for ride in waited[:200]:
            if ride.driver_arrived_at and ride.created_at:
                total_seconds += (ride.driver_arrived_at - ride.created_at).total_seconds()
                count += 1
        if count:
            avg_wait = round(total_seconds / count, 1)

    revenue = build_financial_reconciliation(today)
    support = build_support_queue()

    return {
        "date": today.isoformat(),
        "rides": {
            "total": ride_total,
            "acceptance_rate_pct": acceptance_rate,
            "completion_rate_pct": ride_completion_rate,
            "cancellation_rate_pct": cancellation_rate,
            "avg_wait_seconds": avg_wait,
        },
        "deliveries": {
            "total": delivery_total,
            "completion_rate_pct": delivery_completion_rate,
        },
        "revenue": revenue,
        "withdrawals_pending": WithdrawalRequest.objects.filter(status__in=["pending", "approved"]).count(),
        "support": support.get("counts", {}),
    }


def build_incident_review_report() -> dict:
    today = timezone.localdate()
    week_ago = today - timedelta(days=7)

    sos = list(
        SafetyIncident.objects.filter(incident_type="sos", created_at__date__gte=week_ago)
        .order_by("-created_at")[:50]
        .values("id", "reference", "status", "severity", "created_at", "resolution_notes")
    )
    payment_failures = list(
        PaymentRecord.objects.filter(status="failed", created_at__date__gte=week_ago)
        .order_by("-created_at")[:50]
        .values("id", "amount", "method", "created_at")
    )
    ops_incidents = list(
        OpsIncident.objects.filter(created_at__date__gte=week_ago)
        .order_by("-created_at")[:30]
        .values("id", "reference", "title", "severity", "status", "created_at")
    )
    driver_tickets = list(
        SupportTicket.objects.filter(created_at__date__gte=week_ago)
        .order_by("-created_at")[:30]
        .values("id", "ticket_type", "status", "subject", "created_at")
    )

    return {
        "period_start": week_ago.isoformat(),
        "period_end": today.isoformat(),
        "sos_incidents": sos,
        "payment_failures": payment_failures,
        "ops_incidents": ops_incidents,
        "support_tickets": driver_tickets,
        "counts": {
            "sos": len(sos),
            "payment_failures": PaymentRecord.objects.filter(
                status="failed", created_at__date__gte=week_ago
            ).count(),
            "ops_incidents": OpsIncident.objects.filter(created_at__date__gte=week_ago).count(),
            "open_support": SupportTicket.objects.filter(status__in=["open", "in_progress"]).count(),
        },
    }


def build_daily_ceo_report() -> dict:
    control = build_launch_control_dashboard()
    live = build_live_metrics()
    finance = build_financial_reconciliation()
    support = build_support_panel()
    alerts = list(
        LaunchAlert.objects.filter(is_resolved=False)
        .order_by("-created_at")[:20]
        .values("id", "category", "severity", "message", "created_at")
    )
    open_incidents = OpsIncident.objects.filter(status__in=["open", "investigating"]).count()

    return {
        "generated_at": timezone.now().isoformat(),
        "platform_status": control.get("platform_status"),
        "drivers_online": control["metrics"]["online_drivers"],
        "couriers_online": control["metrics"]["online_couriers"],
        "active_rides": control["metrics"]["active_rides"],
        "active_deliveries": control["metrics"]["active_deliveries"],
        "revenue_today": control["metrics"]["revenue_today"],
        "withdrawals_pending": control["metrics"]["withdrawals_pending"],
        "refunds_today": finance.get("refunds"),
        "critical_alerts": alerts,
        "open_incidents": open_incidents,
        "platform_health": control.get("infrastructure", {}),
        "support": support,
        "live": live.get("live", {}),
    }


def build_weekly_executive_report() -> dict:
    kpis = build_business_kpis()
    finance = build_finance_dashboard(period="weekly")
    drivers = build_pilot_driver_report()
    couriers = build_pilot_courier_report()
    riders = build_rider_invitation_report()

    completed_rides = Ride.objects.filter(
        status="completed",
        completed_at__date__gte=timezone.localdate() - timedelta(days=6),
    )
    avg_rating = completed_rides.aggregate(avg=Avg("rating"))["avg"]

    recommendations = []
    if drivers["gap_to_target"] > 0:
        recommendations.append(f"Onboard {drivers['gap_to_target']} more approved drivers to reach pilot cap.")
    if couriers["gap_to_target"] > 0:
        recommendations.append(f"Enable {couriers['gap_to_target']} more couriers for delivery pilot.")
    if kpis["rates"]["cancellation_rate_pct"] and kpis["rates"]["cancellation_rate_pct"] > 20:
        recommendations.append("Cancellation rate elevated — review dispatch and driver incentives.")
    if drivers["verification"]["expired_documents"]:
        recommendations.append("Expired driver documents detected — schedule renewals before suspension.")

    return {
        "generated_at": timezone.now().isoformat(),
        "period": finance.get("start_date") + " → " + finance.get("end_date"),
        "growth": kpis.get("users", {}),
        "retention": kpis.get("retention", {}),
        "finance": finance.get("summary", {}),
        "rates": kpis.get("rates", {}),
        "avg_rider_rating": round(float(avg_rating), 2) if avg_rating else None,
        "pilot": {"drivers": drivers, "couriers": couriers, "riders": riders},
        "recommendations": recommendations,
    }


def build_exit_criteria_report() -> dict:
    today = timezone.localdate()
    week_start = today - timedelta(days=6)

    rides = Ride.objects.filter(created_at__date__gte=week_start)
    deliveries = Delivery.objects.filter(created_at__date__gte=week_start)
    ride_total = rides.count()
    delivery_total = deliveries.count()

    ride_completion = round(100 * rides.filter(status="completed").count() / ride_total, 2) if ride_total else None
    delivery_completion = (
        round(100 * deliveries.filter(status="delivered").count() / delivery_total, 2)
        if delivery_total
        else None
    )

    payments = PaymentRecord.objects.filter(created_at__date__gte=week_start)
    pay_total = payments.count()
    pay_success = round(100 * payments.filter(status="paid").count() / pay_total, 2) if pay_total else None

    avg_rating = rides.filter(status="completed", rating__isnull=False).aggregate(avg=Avg("rating"))["avg"]

    infra = build_launch_control_dashboard().get("infrastructure", {})
    api_ok = infra.get("api", {}).get("status") == "ok"

    critical_security = OpsIncident.objects.filter(
        severity="critical",
        status__in=["open", "investigating"],
        title__icontains="security",
    ).count()

    criteria = [
        {
            "metric": "Ride completion rate",
            "target": ">95%",
            "actual": f"{ride_completion}%" if ride_completion is not None else "N/A",
            "pass": ride_completion is not None and ride_completion > 95,
        },
        {
            "metric": "Delivery completion rate",
            "target": ">95%",
            "actual": f"{delivery_completion}%" if delivery_completion is not None else "N/A",
            "pass": delivery_completion is not None and delivery_completion > 95,
        },
        {
            "metric": "Payment success rate",
            "target": ">99%",
            "actual": f"{pay_success}%" if pay_success is not None else "N/A",
            "pass": pay_success is not None and pay_success > 99,
        },
        {
            "metric": "Average rider rating",
            "target": ">4.7",
            "actual": str(round(float(avg_rating), 2)) if avg_rating else "N/A",
            "pass": avg_rating is not None and float(avg_rating) > 4.7,
        },
        {
            "metric": "API uptime (health check)",
            "target": ">99.9%",
            "actual": "ok" if api_ok else "degraded",
            "pass": api_ok,
        },
        {
            "metric": "Critical security incidents",
            "target": "0 open",
            "actual": str(critical_security),
            "pass": critical_security == 0,
        },
        {
            "metric": "Crash-free sessions",
            "target": ">99%",
            "actual": "MANUAL — mobile analytics required",
            "pass": False,
        },
    ]

    passed = sum(1 for c in criteria if c["pass"])
    return {
        "generated_at": timezone.now().isoformat(),
        "criteria": criteria,
        "passed": passed,
        "total": len(criteria),
        "soft_launch_exit_ready": passed >= 5 and all(c["pass"] for c in criteria[:5]),
    }


class Command(BaseCommand):
    help = "Generate Nouakchott soft-launch daily/weekly reports and pilot onboarding summaries."

    def add_arguments(self, parser):
        parser.add_argument(
            "--output-dir",
            default="release/soft-launch",
            help="Directory for JSON + markdown reports",
        )
        parser.add_argument(
            "--report",
            choices=[
                "all",
                "drivers",
                "couriers",
                "riders",
                "daily-ops",
                "daily-ceo",
                "weekly-exec",
                "incidents",
                "exit-criteria",
            ],
            default="all",
        )

    def handle(self, *args, **options):
        output_dir = Path(options["output_dir"])
        output_dir.mkdir(parents=True, exist_ok=True)
        report = options["report"]
        stamp = timezone.now().strftime("%Y-%m-%d")

        builders = {
            "drivers": ("pilot_drivers", build_pilot_driver_report),
            "couriers": ("pilot_couriers", build_pilot_courier_report),
            "riders": ("rider_invitations", build_rider_invitation_report),
            "daily-ops": ("daily_operations", build_daily_operations_report),
            "daily-ceo": ("daily_ceo", build_daily_ceo_report),
            "weekly-exec": ("weekly_executive", build_weekly_executive_report),
            "incidents": ("incident_review", build_incident_review_report),
            "exit-criteria": ("exit_criteria", build_exit_criteria_report),
        }

        selected = builders.keys() if report == "all" else [report]
        summary: dict = {"generated_at": timezone.now().isoformat(), "reports": {}}

        for key in selected:
            name, builder = builders[key]
            payload = builder()
            json_path = output_dir / f"{name}_{stamp}.json"
            json_path.write_text(json.dumps(payload, indent=2, default=str), encoding="utf-8")
            summary["reports"][name] = str(json_path)
            self.stdout.write(self.style.SUCCESS(f"Wrote {json_path}"))

        if report == "all":
            index_path = output_dir / f"soft_launch_index_{stamp}.json"
            index_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
            self.stdout.write(self.style.SUCCESS(f"Index: {index_path}"))
