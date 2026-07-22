"""Driver Incentive Engine — operations, CEO, and finance dashboards (Phase 30)."""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db.models import Avg, Count, Sum
from django.utils import timezone

from incentives.models import BonusPayment, DriverIncentiveProgress, IncentiveProgram
from incentives.services.ride_incentives import estimate_bonus, serialize_campaign_progress
from payments.wallet_ledger import apply_wallet_transaction, get_or_create_wallet
from taxi.drivers.models import DriverProfile
from taxi.rides.models import Ride

from .cache_utils import cached_ops_call, invalidate_ops_cache
from .executive_service import _dec

User = get_user_model()

AVG_RIDE_FARE = Decimal("250")


def _serialize_campaign(program: IncentiveProgram) -> dict:
    participants = program.participants.count()
    completed = program.participants.filter(status__in=["completed", "paid"]).count()
    return {
        "id": program.id,
        "name": program.name,
        "description": program.description,
        "campaign_type": program.incentive_type,
        "reward_type": program.reward_type,
        "target_value": program.target_value,
        "reward": float(program.bonus_amount),
        "bonus_amount": float(program.bonus_amount),
        "status": program.status,
        "eligible_groups": program.eligible_groups or [],
        "starts_at": program.starts_at.isoformat() if program.starts_at else None,
        "ends_at": program.ends_at.isoformat() if program.ends_at else None,
        "city_id": program.city_id,
        "city": program.city.name if program.city else None,
        "participants": participants,
        "completed_count": completed,
        "participation_rate": round(completed / participants * 100, 1) if participants else 0,
        "completion_rate": round(completed / participants * 100, 1) if participants else 0,
        "is_active": program.is_currently_active,
        "created_at": program.created_at.isoformat(),
    }


def list_campaigns(*, status: str | None = None) -> list[dict]:
    qs = IncentiveProgram.objects.select_related("city").order_by("-created_at")
    if status:
        qs = qs.filter(status=status)
    return [_serialize_campaign(p) for p in qs[:200]]


def create_campaign(payload: dict, actor) -> dict:
    program = IncentiveProgram.objects.create(
        name=payload.get("name", "New Campaign"),
        description=payload.get("description", ""),
        incentive_type=payload.get("campaign_type") or payload.get("incentive_type", "weekly_trip_target"),
        reward_type=payload.get("reward_type", "fixed"),
        bonus_amount=Decimal(str(payload.get("reward") or payload.get("bonus_amount", 200))),
        target_value=int(payload.get("target") or payload.get("target_value", 10)),
        city_id=payload.get("city_id"),
        status=payload.get("status", "draft"),
        eligible_groups=payload.get("eligible_groups") or payload.get("eligible_driver_groups") or ["all"],
        starts_at=payload.get("starts_at"),
        ends_at=payload.get("ends_at"),
        max_participants=int(payload.get("max_participants") or 0),
    )
    invalidate_ops_cache("incentive_engine_dashboard")
    return _serialize_campaign(program)


def update_campaign(campaign_id: int, payload: dict, actor) -> dict | None:
    program = IncentiveProgram.objects.filter(id=campaign_id).select_related("city").first()
    if not program:
        return None

    field_map = {
        "name": "name",
        "description": "description",
        "campaign_type": "incentive_type",
        "incentive_type": "incentive_type",
        "reward_type": "reward_type",
        "target": "target_value",
        "target_value": "target_value",
        "status": "status",
        "starts_at": "starts_at",
        "ends_at": "ends_at",
        "city_id": "city_id",
        "max_participants": "max_participants",
    }
    for key, field in field_map.items():
        if key in payload and payload[key] is not None:
            setattr(program, field, payload[key])
    if "reward" in payload or "bonus_amount" in payload:
        program.bonus_amount = Decimal(str(payload.get("reward") or payload.get("bonus_amount")))
    if "eligible_groups" in payload or "eligible_driver_groups" in payload:
        program.eligible_groups = payload.get("eligible_groups") or payload.get("eligible_driver_groups") or []

    if program.ends_at and program.ends_at < timezone.now() and program.status == "active":
        program.status = "completed"

    program.save()
    invalidate_ops_cache("incentive_engine_dashboard")
    return _serialize_campaign(program)


def build_bonus_summary() -> dict:
    payments = BonusPayment.objects.all()
    progress = DriverIncentiveProgress.objects.all()
    return {
        "earned_bonus": _dec(payments.filter(payout_status__in=["pending", "approved", "paid"]).aggregate(t=Sum("amount"))["t"]),
        "pending_bonus": _dec(payments.filter(payout_status="pending").aggregate(t=Sum("amount"))["t"]),
        "paid_bonus": _dec(payments.filter(payout_status="paid").aggregate(t=Sum("amount"))["t"]),
        "approved_awaiting_pay": _dec(payments.filter(payout_status="approved").aggregate(t=Sum("amount"))["t"]),
        "active_campaigns": progress.filter(status="in_progress").count(),
        "completed_campaigns": progress.filter(status="completed").count(),
    }


def build_ops_dashboard(*, city_id: int | None = None) -> dict:
    programs = IncentiveProgram.objects.select_related("city")
    if city_id:
        programs = programs.filter(city_id=city_id)

    active = [p for p in programs.filter(status="active") if p.is_currently_active]
    progress_qs = DriverIncentiveProgress.objects.select_related("program", "driver")
    if city_id:
        progress_qs = progress_qs.filter(program__city_id=city_id)

    participants = progress_qs.count()
    completed = progress_qs.filter(status__in=["completed", "paid"]).count()
    total_bonus = BonusPayment.objects.aggregate(t=Sum("amount"))["t"] or 0
    additional_rides = progress_qs.filter(status__in=["completed", "paid"]).aggregate(t=Sum("current_value"))["t"] or 0
    revenue_estimate = Decimal(additional_rides) * AVG_RIDE_FARE
    roi = 0
    if total_bonus:
        roi = float(((revenue_estimate - Decimal(total_bonus)) / Decimal(total_bonus)) * 100)

    top_campaigns = (
        DriverIncentiveProgress.objects.values("program_id", "program__name")
        .annotate(completions=Count("id"), participants=Count("driver", distinct=True))
        .order_by("-completions")[:8]
    )

    return {
        "generated_at": timezone.now().isoformat(),
        "summary": {
            "active_campaigns": len(active),
            "participants": participants,
            "participation_rate": round(participants / max(DriverProfile.objects.count(), 1) * 100, 1),
            "completion_rate": round(completed / participants * 100, 1) if participants else 0,
            "total_bonuses_earned": _dec(total_bonus),
            "roi_estimate_percent": round(roi, 1),
        },
        "bonus_summary": build_bonus_summary(),
        "campaigns": [_serialize_campaign(p) for p in active[:20]],
        "top_campaigns": [
            {
                "program_id": row["program_id"],
                "name": row["program__name"],
                "completions": row["completions"],
                "participants": row["participants"],
            }
            for row in top_campaigns
        ],
    }


def build_ceo_dashboard(*, city_id: int | None = None) -> dict:
    since = timezone.now() - timedelta(days=30)
    payments = BonusPayment.objects.filter(paid_at__gte=since)
    if city_id:
        payments = payments.filter(program__city_id=city_id)

    incentive_cost = payments.filter(payout_status="paid").aggregate(t=Sum("amount"))["t"] or 0
    additional_rides = (
        DriverIncentiveProgress.objects.filter(completed_at__gte=since, status__in=["completed", "paid"])
        .aggregate(t=Sum("current_value"))["t"]
        or 0
    )
    revenue_increase = Decimal(additional_rides) * AVG_RIDE_FARE * Decimal("0.15")

    active_drivers = DriverProfile.objects.filter(status="approved", user__is_active=True).count()
    participating = (
        DriverIncentiveProgress.objects.filter(enrolled_at__gte=since).values("driver_id").distinct().count()
    )
    retention_rate = round(participating / max(active_drivers, 1) * 100, 1)

    campaign_stats = []
    for program in IncentiveProgram.objects.filter(status__in=["active", "completed"]).order_by("-created_at")[:10]:
        prog_progress = program.participants.all()
        done = prog_progress.filter(status__in=["completed", "paid"]).count()
        total = prog_progress.count()
        campaign_stats.append(
            {
                "name": program.name,
                "type": program.incentive_type,
                "participants": total,
                "completion_rate": round(done / total * 100, 1) if total else 0,
                "bonus_paid": _dec(
                    BonusPayment.objects.filter(program=program, payout_status="paid").aggregate(t=Sum("amount"))["t"]
                ),
            }
        )

    return {
        "generated_at": timezone.now().isoformat(),
        "incentive_cost_30d": _dec(incentive_cost),
        "additional_rides_generated": int(additional_rides),
        "revenue_increase_estimate": _dec(revenue_increase),
        "driver_retention_rate": retention_rate,
        "campaign_effectiveness": campaign_stats,
        "pending_payouts": _dec(
            BonusPayment.objects.filter(payout_status="pending").aggregate(t=Sum("amount"))["t"]
        ),
    }


def build_finance_dashboard(*, limit: int = 100) -> dict:
    pending = (
        BonusPayment.objects.filter(payout_status="pending")
        .select_related("driver", "program", "progress")
        .order_by("-paid_at")[:limit]
    )
    recent_paid = (
        BonusPayment.objects.filter(payout_status="paid")
        .select_related("driver", "program", "approved_by")
        .order_by("-approved_at")[:limit]
    )
    return {
        "generated_at": timezone.now().isoformat(),
        "summary": build_bonus_summary(),
        "pending_payouts": [_serialize_payout(p) for p in pending],
        "recent_paid": [_serialize_payout(p) for p in recent_paid],
    }


def _serialize_payout(payment: BonusPayment) -> dict:
    return {
        "id": payment.id,
        "driver_id": payment.driver_id,
        "driver_name": payment.driver.get_full_name() or payment.driver.email,
        "program_id": payment.program_id,
        "program_name": payment.program.name if payment.program else "",
        "amount": float(payment.amount),
        "reason": payment.reason,
        "payout_status": payment.payout_status,
        "paid_at": payment.paid_at.isoformat() if payment.paid_at else None,
        "approved_at": payment.approved_at.isoformat() if payment.approved_at else None,
        "approved_by": payment.approved_by.get_full_name() if payment.approved_by else "",
        "admin_note": payment.admin_note,
    }


def approve_bonus_payout(payment_id: int, actor, *, note: str = "", pay_now: bool = True) -> dict | None:
    payment = BonusPayment.objects.select_related("driver", "program", "progress").filter(id=payment_id).first()
    if not payment or payment.payout_status not in {"pending", "approved"}:
        return None

    payment.approved_by = actor
    payment.approved_at = timezone.now()
    if note:
        payment.admin_note = note

    if pay_now:
        wallet = get_or_create_wallet(payment.driver)
        txn = apply_wallet_transaction(
            wallet,
            payment.amount,
            is_credit=True,
            transaction_type="bonus",
            reference=f"incentive:{payment.id}",
            note=f"Incentive bonus: {payment.reason}",
        )
        payment.wallet_transaction = txn
        payment.payout_status = "paid"
        if payment.progress:
            payment.progress.status = "paid"
            payment.progress.paid_at = timezone.now()
            payment.progress.save(update_fields=["status", "paid_at"])
    else:
        payment.payout_status = "approved"

    payment.save()
    invalidate_ops_cache("incentive_engine_dashboard")
    return _serialize_payout(payment)


def reject_bonus_payout(payment_id: int, actor, *, note: str = "") -> dict | None:
    payment = BonusPayment.objects.filter(id=payment_id, payout_status="pending").first()
    if not payment:
        return None
    payment.payout_status = "rejected"
    payment.approved_by = actor
    payment.approved_at = timezone.now()
    payment.admin_note = note or payment.admin_note
    payment.save()
    return _serialize_payout(payment)


def build_bonus_report_rows(*, since_days: int = 30) -> list[dict]:
    since = timezone.now() - timedelta(days=since_days)
    rows = []
    for payment in BonusPayment.objects.filter(paid_at__gte=since).select_related("driver", "program"):
        rows.append(
            {
                "payment_id": payment.id,
                "driver_email": payment.driver.email,
                "driver_name": payment.driver.get_full_name(),
                "campaign": payment.program.name if payment.program else "",
                "amount_mru": float(payment.amount),
                "status": payment.payout_status,
                "reason": payment.reason,
                "paid_at": payment.paid_at.isoformat() if payment.paid_at else "",
                "approved_at": payment.approved_at.isoformat() if payment.approved_at else "",
            }
        )
    return rows


def build_driver_campaigns_payload(driver) -> dict:
    active_progress = (
        DriverIncentiveProgress.objects.filter(driver=driver, status="in_progress")
        .select_related("program")
        .order_by("-enrolled_at")
    )
    available = IncentiveProgram.objects.filter(status="active")
    enrolled_ids = set(DriverIncentiveProgress.objects.filter(driver=driver).values_list("program_id", flat=True))

    campaigns = []
    for program in available:
        if not program.is_currently_active:
            continue
        progress = active_progress.filter(program_id=program.id).first()
        if progress:
            campaigns.append(serialize_campaign_progress(progress))
        elif program.id not in enrolled_ids:
            campaigns.append(
                {
                    "program_id": program.id,
                    "name": program.name,
                    "description": program.description,
                    "campaign_type": program.incentive_type,
                    "reward_type": program.reward_type,
                    "status": "available",
                    "current_value": 0,
                    "target_value": program.target_value,
                    "trips_completed": 0,
                    "trips_remaining": program.target_value,
                    "progress_percent": 0,
                    "estimated_bonus": float(program.bonus_amount),
                    "earned_bonus": 0,
                    "pending_bonus": 0,
                    "paid_bonus": 0,
                    "bonus_amount": float(program.bonus_amount),
                    "expires_at": program.ends_at.isoformat() if program.ends_at else None,
                }
            )

    for progress in active_progress:
        if progress.program_id not in {c.get("program_id") for c in campaigns}:
            campaigns.append(serialize_campaign_progress(progress))

    paid_total = BonusPayment.objects.filter(driver=driver, payout_status="paid").aggregate(t=Sum("amount"))["t"] or 0
    pending_total = BonusPayment.objects.filter(driver=driver, payout_status="pending").aggregate(t=Sum("amount"))["t"] or 0

    return {
        "active_campaigns": [c for c in campaigns if c.get("status") in {"in_progress", "available"}],
        "campaigns": campaigns,
        "bonus_summary": {
            "earned_bonus": float(paid_total) + float(pending_total),
            "pending_bonus": float(pending_total),
            "paid_bonus": float(paid_total),
        },
    }


def build_incentive_engine_dashboard(*, city_id: int | None = None) -> dict:
    def _builder():
        return {
            "generated_at": timezone.now().isoformat(),
            "operations": build_ops_dashboard(city_id=city_id),
            "ceo": build_ceo_dashboard(city_id=city_id),
            "finance": build_finance_dashboard(limit=50),
            "campaigns": list_campaigns(),
        }

    return cached_ops_call("incentive_engine_dashboard", _builder, city_id=city_id)
