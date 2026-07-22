"""Yala Partner & Franchise Platform — operations, finance, CEO dashboards (Phase 32)."""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db.models import Avg, Count, Q, Sum
from django.utils import timezone

from deliveries.models import Delivery
from merchants.models import Merchant, MerchantOrder
from partners.models import Partner, PartnerSettlement, PartnerTerritory
from safety.models import SafetyIncident
from taxi.drivers.models import DriverProfile
from taxi.rides.models import Ride

from .cache_utils import cached_ops_call, invalidate_ops_cache
from .executive_service import DELIVERY_ACTIVE, RIDE_ACTIVE, _dec
from .models import BetaFeedback
from .operations_center_service import build_fleet_snapshot

User = get_user_model()


def _partner_city_ids(partner: Partner) -> list[int]:
    ids = list(partner.territories.filter(is_active=True).values_list("city_id", flat=True))
    if partner.city_id and partner.city_id not in ids:
        ids.append(partner.city_id)
    return ids


def _partner_city_names(partner: Partner) -> list[str]:
    names = list(
        partner.territories.filter(is_active=True).select_related("city").values_list("city__name", flat=True)
    )
    if partner.city_id and partner.city.name not in names:
        names.append(partner.city.name)
    return names


def _serialize_partner_admin(partner: Partner) -> dict:
    return {
        "id": partner.id,
        "partner_name": partner.partner_name,
        "company": partner.company,
        "contact_person": partner.contact_person,
        "phone": partner.phone,
        "email": partner.email,
        "city_id": partner.city_id,
        "city_name": partner.city.name if partner.city else None,
        "territory_label": partner.territory_label,
        "contract_status": partner.contract_status,
        "revenue_share": float(partner.revenue_share),
        "start_date": partner.start_date.isoformat() if partner.start_date else None,
        "end_date": partner.end_date.isoformat() if partner.end_date else None,
        "territory_count": partner.territories.filter(is_active=True).count(),
        "is_operational": partner.is_operational,
        "created_at": partner.created_at.isoformat(),
        "approved_at": partner.approved_at.isoformat() if partner.approved_at else None,
    }


def validate_territory_overlap(
    *,
    city_id: int,
    zone_name: str,
    allow_overlap: bool,
    partner_id: int | None = None,
    exclude_territory_id: int | None = None,
) -> str | None:
    qs = PartnerTerritory.objects.filter(city_id=city_id, is_active=True)
    if exclude_territory_id:
        qs = qs.exclude(id=exclude_territory_id)

    if not allow_overlap:
        exclusive = qs.filter(allow_overlap=False)
        if partner_id:
            exclusive = exclusive.exclude(partner_id=partner_id)
        if exclusive.exists():
            holder = exclusive.select_related("partner").first()
            return (
                f"City already has an exclusive territory"
                f" ({holder.zone_name}) assigned to {holder.partner.partner_name}."
            )

    same_zone = qs.filter(zone_name__iexact=zone_name.strip())
    if partner_id:
        same_zone = same_zone.exclude(partner_id=partner_id)
    conflicting = same_zone.filter(allow_overlap=False)
    if not allow_overlap and conflicting.exists():
        holder = conflicting.select_related("partner").first()
        return f"Zone '{zone_name}' is already assigned to {holder.partner.partner_name}."

    return None


def _revenue_for_cities(city_ids: list[int], city_names: list[str], start, end) -> Decimal:
    total = Decimal("0")

    rides = Ride.objects.filter(status="completed", city_id__in=city_ids)
    if start:
        rides = rides.filter(completed_at__date__gte=start)
    if end:
        rides = rides.filter(completed_at__date__lte=end)
    total += rides.aggregate(t=Sum("fare"))["t"] or Decimal("0")

    for name in city_names:
        deliveries = Delivery.objects.filter(status="delivered", service_city__icontains=name)
        if start:
            deliveries = deliveries.filter(delivered_at__date__gte=start)
        if end:
            deliveries = deliveries.filter(delivered_at__date__lte=end)
        total += deliveries.aggregate(t=Sum("fare"))["t"] or Decimal("0")

    merchants = Merchant.objects.filter(status="approved")
    merchant_q = Q()
    for name in city_names:
        merchant_q |= Q(city__icontains=name)
    if merchant_q:
        merchant_ids = merchants.filter(merchant_q).values_list("id", flat=True)
        orders = MerchantOrder.objects.filter(merchant_id__in=merchant_ids, status="delivered")
        if start:
            orders = orders.filter(delivered_at__date__gte=start)
        if end:
            orders = orders.filter(delivered_at__date__lte=end)
        total += orders.aggregate(t=Sum("total"))["t"] or Decimal("0")

    return total


def compute_partner_performance(partner: Partner) -> dict:
    city_ids = _partner_city_ids(partner)
    city_names = _partner_city_names(partner)
    since_30d = timezone.now() - timedelta(days=30)

    rides = Ride.objects.filter(city_id__in=city_ids, created_at__gte=since_30d) if city_ids else Ride.objects.none()
    ride_total = rides.count()
    ride_completed = rides.filter(status="completed").count()
    ride_completion_rate = round(ride_completed / ride_total * 100, 1) if ride_total else None

    deliveries_q = Q()
    for name in city_names:
        deliveries_q |= Q(service_city__icontains=name)
    deliveries = Delivery.objects.filter(deliveries_q, created_at__gte=since_30d) if city_names else Delivery.objects.none()
    delivery_total = deliveries.count()
    delivery_completed = deliveries.filter(status="delivered").count()
    delivery_completion_rate = round(delivery_completed / delivery_total * 100, 1) if delivery_total else None

    accepted_rides = rides.filter(status__in=["accepted", "driver_arrived", "in_progress", "completed"]).count()
    acceptance_rate = round(accepted_rides / ride_total * 100, 1) if ride_total else None

    avg_rating = rides.filter(rating__isnull=False).aggregate(avg=Avg("rating"))["avg"]
    customer_rating = round(float(avg_rating), 2) if avg_rating else None

    merchant_q = Q()
    for name in city_names:
        merchant_q |= Q(city__icontains=name)
    active_merchants = Merchant.objects.filter(merchant_q, status="approved").count() if city_names else 0
    merchant_satisfaction = round(active_merchants / max(active_merchants, 1) * 100, 1) if active_merchants else None

    feedback = BetaFeedback.objects.filter(created_at__gte=since_30d)
    if city_ids:
        feedback = feedback.filter(user__city_id__in=city_ids)
    resolved = feedback.filter(status__in=["resolved", "closed"])
    response_times = []
    for row in resolved.filter(first_response_at__isnull=False)[:100]:
        response_times.append((row.first_response_at - row.created_at).total_seconds() / 3600)
    support_response_hours = round(sum(response_times) / len(response_times), 1) if response_times else None

    return {
        "ride_completion_rate": ride_completion_rate,
        "delivery_completion_rate": delivery_completion_rate,
        "acceptance_rate": acceptance_rate,
        "customer_rating": customer_rating,
        "merchant_satisfaction": merchant_satisfaction,
        "support_response_hours": support_response_hours,
    }


def build_partner_dashboard(partner: Partner) -> dict:
    today = timezone.localdate()
    week_start = today - timedelta(days=today.weekday())
    city_ids = _partner_city_ids(partner)
    city_names = _partner_city_names(partner)

    drivers = DriverProfile.objects.filter(status="approved", user__city_id__in=city_ids) if city_ids else DriverProfile.objects.none()
    couriers = (
        drivers.filter(user__driver_deliveries__status__in=DELIVERY_ACTIVE).distinct()
        if city_ids
        else DriverProfile.objects.none()
    )
    merchants_q = Q()
    for name in city_names:
        merchants_q |= Q(city__icontains=name)
    merchants = Merchant.objects.filter(merchants_q, status="approved") if city_names else Merchant.objects.none()

    daily_revenue = _revenue_for_cities(city_ids, city_names, today, today)
    weekly_revenue = _revenue_for_cities(city_ids, city_names, week_start, today)
    commission_earned = (weekly_revenue * partner.revenue_share).quantize(Decimal("0.01"))

    incidents = SafetyIncident.objects.filter(created_at__date__gte=week_start)
    if city_ids or city_names:
        inc_filter = Q()
        if city_ids:
            inc_filter |= Q(ride__city_id__in=city_ids)
        for name in city_names:
            inc_filter |= Q(delivery__service_city__icontains=name)
        incidents = incidents.filter(inc_filter)

    tickets = BetaFeedback.objects.filter(status__in=["open", "assigned", "waiting"])
    if city_ids:
        tickets = tickets.filter(user__city_id__in=city_ids)

    fleet = build_fleet_snapshot(city_ids[0] if city_ids else None)

    pending_settlement = (
        PartnerSettlement.objects.filter(partner=partner, status="pending").aggregate(t=Sum("partner_payout"))["t"]
        or Decimal("0")
    )
    paid_settlement = (
        PartnerSettlement.objects.filter(partner=partner, status="paid").aggregate(t=Sum("partner_payout"))["t"]
        or Decimal("0")
    )

    return {
        "generated_at": timezone.now().isoformat(),
        "partner": _serialize_partner_admin(partner),
        "metrics": {
            "active_drivers": drivers.filter(user__is_active=True).count(),
            "active_couriers": couriers.count(),
            "active_merchants": merchants.count(),
            "daily_revenue": _dec(daily_revenue),
            "weekly_revenue": _dec(weekly_revenue),
            "commission_earned": _dec(commission_earned),
            "incidents_7d": incidents.count(),
            "support_tickets_open": tickets.count(),
            "fleet_health": fleet.get("counts", {}),
            "pending_settlement": _dec(pending_settlement),
            "paid_settlement": _dec(paid_settlement),
        },
        "performance": compute_partner_performance(partner),
        "territories": [
            {
                "id": t.id,
                "city_id": t.city_id,
                "city_name": t.city.name,
                "zone_name": t.zone_name,
                "service_boundary": t.service_boundary,
                "allow_overlap": t.allow_overlap,
                "is_active": t.is_active,
            }
            for t in partner.territories.select_related("city").all()
        ],
        "settlements": [
            {
                "id": s.id,
                "period_type": s.period_type,
                "period_start": s.period_start.isoformat(),
                "period_end": s.period_end.isoformat(),
                "gross_revenue": float(s.gross_revenue),
                "platform_commission": float(s.platform_commission),
                "partner_payout": float(s.partner_payout),
                "status": s.status,
                "invoice_reference": s.invoice_reference,
                "paid_at": s.paid_at.isoformat() if s.paid_at else None,
            }
            for s in partner.settlements.all()[:20]
        ],
    }


def build_partner_platform_dashboard(*, city_id: int | None = None) -> dict:
    partners = Partner.objects.select_related("city").all()
    if city_id:
        partners = partners.filter(Q(city_id=city_id) | Q(territories__city_id=city_id)).distinct()

    return {
        "generated_at": timezone.now().isoformat(),
        "summary": {
            "total_partners": partners.count(),
            "approved": partners.filter(contract_status="approved").count(),
            "pending": partners.filter(contract_status="pending").count(),
            "suspended": partners.filter(contract_status="suspended").count(),
            "terminated": partners.filter(contract_status="terminated").count(),
            "active_territories": PartnerTerritory.objects.filter(is_active=True).count(),
            "pending_settlements": PartnerSettlement.objects.filter(status="pending").count(),
        },
        "partners": [_serialize_partner_admin(p) for p in partners.order_by("-created_at")[:100]],
    }


def build_partner_ceo_dashboard() -> dict:
    now = timezone.now()
    since_30d = now - timedelta(days=30)
    partners = Partner.objects.filter(contract_status="approved")

    revenue_by_partner = []
    for partner in partners:
        city_ids = _partner_city_ids(partner)
        city_names = _partner_city_names(partner)
        rev = _revenue_for_cities(city_ids, city_names, since_30d.date(), now.date())
        revenue_by_partner.append(
            {
                "partner_id": partner.id,
                "name": partner.partner_name,
                "revenue": float(rev),
                "commission": float((rev * partner.revenue_share).quantize(Decimal("0.01"))),
            }
        )
    revenue_by_partner.sort(key=lambda r: r["revenue"], reverse=True)

    city_revenue = {}
    for territory in PartnerTerritory.objects.filter(is_active=True).select_related("city", "partner"):
        rev = _revenue_for_cities([territory.city_id], [territory.city.name], since_30d.date(), now.date())
        city_revenue.setdefault(territory.city.name, {"revenue": Decimal("0"), "partners": set()})
        city_revenue[territory.city.name]["revenue"] += rev
        city_revenue[territory.city.name]["partners"].add(territory.partner.partner_name)

    revenue_by_city = [
        {"city": name, "revenue": float(data["revenue"]), "partner_count": len(data["partners"])}
        for name, data in sorted(city_revenue.items(), key=lambda x: float(x[1]["revenue"]), reverse=True)
    ]

    growth = []
    for territory in PartnerTerritory.objects.filter(is_active=True).select_related("city"):
        city_ids = [territory.city_id]
        city_names = [territory.city.name]
        recent = _revenue_for_cities(city_ids, city_names, (now - timedelta(days=30)).date(), now.date())
        prior = _revenue_for_cities(
            city_ids,
            city_names,
            (now - timedelta(days=60)).date(),
            (now - timedelta(days=31)).date(),
        )
        growth_pct = round((float(recent - prior) / float(prior) * 100), 1) if prior else None
        growth.append(
            {
                "territory": f"{territory.city.name} / {territory.zone_name}",
                "partner": territory.partner.partner_name,
                "growth_pct": growth_pct,
                "recent_revenue": float(recent),
            }
        )
    growth.sort(key=lambda g: g["growth_pct"] or 0, reverse=True)

    underperforming = [g for g in growth if g["growth_pct"] is not None and g["growth_pct"] < 5][:5]
    expansion = [
        {"city": row["city"], "revenue": row["revenue"], "note": "Existing territory — optimize or expand zones"}
        for row in revenue_by_city[:5]
    ]

    return {
        "generated_at": now.isoformat(),
        "total_partners": Partner.objects.count(),
        "approved_partners": partners.count(),
        "revenue_by_partner": revenue_by_partner[:15],
        "revenue_by_city": revenue_by_city[:15],
        "fastest_growing_territories": growth[:5],
        "underperforming_territories": underperforming,
        "expansion_opportunities": expansion,
    }


def build_partner_finance_dashboard() -> dict:
    pending = PartnerSettlement.objects.filter(status="pending").select_related("partner")[:50]
    paid = PartnerSettlement.objects.filter(status="paid").select_related("partner").order_by("-paid_at")[:30]

    return {
        "generated_at": timezone.now().isoformat(),
        "pending_settlements": [
            {
                "id": s.id,
                "partner_id": s.partner_id,
                "partner_name": s.partner.partner_name,
                "period_type": s.period_type,
                "period_start": s.period_start.isoformat(),
                "period_end": s.period_end.isoformat(),
                "gross_revenue": float(s.gross_revenue),
                "platform_commission": float(s.platform_commission),
                "partner_payout": float(s.partner_payout),
                "status": s.status,
                "invoice_reference": s.invoice_reference,
            }
            for s in pending
        ],
        "settlement_history": [
            {
                "id": s.id,
                "partner_name": s.partner.partner_name,
                "partner_payout": float(s.partner_payout),
                "status": s.status,
                "paid_at": s.paid_at.isoformat() if s.paid_at else None,
                "invoice_reference": s.invoice_reference,
            }
            for s in paid
        ],
    }


def register_partner(data: dict, actor) -> Partner:
    partner = Partner.objects.create(
        partner_name=data["partner_name"],
        company=data.get("company", ""),
        contact_person=data["contact_person"],
        phone=data["phone"],
        email=data["email"],
        city_id=data.get("city_id"),
        territory_label=data.get("territory_label", ""),
        revenue_share=Decimal(str(data.get("revenue_share", 0.70))),
        start_date=data.get("start_date"),
        end_date=data.get("end_date"),
        notes=data.get("notes", ""),
    )
    invalidate_ops_cache("partner_platform_dashboard")
    return partner


def admin_partner_action(partner_id: int, action: str, actor, *, reason: str = "") -> dict | None:
    partner = Partner.objects.filter(id=partner_id).first()
    if not partner:
        return None

    if action == "approve":
        partner.contract_status = "approved"
        partner.approved_at = timezone.now()
        partner.suspension_reason = ""
    elif action == "suspend":
        partner.contract_status = "suspended"
        partner.suspension_reason = reason
    elif action == "terminate":
        partner.contract_status = "terminated"
        partner.end_date = timezone.localdate()
        partner.suspension_reason = reason
    elif action == "reactivate":
        partner.contract_status = "approved"
        partner.suspension_reason = ""
        partner.approved_at = timezone.now()
    else:
        return None

    partner.save()
    invalidate_ops_cache("partner_platform_dashboard")
    return _serialize_partner_admin(partner)


def assign_partner_territory(partner_id: int, data: dict, actor) -> tuple[dict | None, str | None]:
    partner = Partner.objects.filter(id=partner_id).first()
    if not partner:
        return None, "Partner not found."

    city_id = data.get("city_id")
    zone_name = (data.get("zone_name") or "Primary").strip()
    allow_overlap = bool(data.get("allow_overlap", False))

    overlap_error = validate_territory_overlap(
        city_id=city_id,
        zone_name=zone_name,
        allow_overlap=allow_overlap,
        partner_id=partner.id,
    )
    if overlap_error:
        return None, overlap_error

    territory = PartnerTerritory.objects.create(
        partner=partner,
        city_id=city_id,
        zone_name=zone_name,
        service_boundary=data.get("service_boundary") or {},
        allow_overlap=allow_overlap,
        is_active=True,
    )
    invalidate_ops_cache("partner_platform_dashboard")
    return {
        "id": territory.id,
        "city_id": territory.city_id,
        "city_name": territory.city.name,
        "zone_name": territory.zone_name,
        "allow_overlap": territory.allow_overlap,
    }, None


def generate_partner_settlement(
    partner_id: int,
    actor,
    *,
    period_type: str = "weekly",
) -> dict | None:
    partner = Partner.objects.filter(id=partner_id).first()
    if not partner:
        return None

    today = timezone.localdate()
    if period_type == "monthly":
        period_end = today.replace(day=1) - timedelta(days=1)
        period_start = period_end.replace(day=1)
    else:
        period_end = today
        period_start = today - timedelta(days=7)

    city_ids = _partner_city_ids(partner)
    city_names = _partner_city_names(partner)
    gross = _revenue_for_cities(city_ids, city_names, period_start, period_end)
    partner_share = gross * partner.revenue_share
    platform_commission = gross - partner_share

    settlement = PartnerSettlement.objects.create(
        partner=partner,
        period_type=period_type,
        period_start=period_start,
        period_end=period_end,
        gross_revenue=gross,
        platform_commission=platform_commission,
        partner_payout=partner_share,
        invoice_reference=f"PST-{partner.id}-{period_end:%Y%m%d}-{period_type[:1].upper()}",
        approved_by=actor,
    )
    invalidate_ops_cache("partner_platform_dashboard")
    return {
        "id": settlement.id,
        "invoice_reference": settlement.invoice_reference,
        "partner_payout": float(settlement.partner_payout),
        "status": settlement.status,
        "period_type": settlement.period_type,
    }


def approve_partner_settlement(settlement_id: int, actor) -> dict | None:
    settlement = PartnerSettlement.objects.select_related("partner").filter(id=settlement_id).first()
    if not settlement or settlement.status != "pending":
        return None

    partner = settlement.partner
    if partner.admin_user_id:
        from payments.wallet_ledger import apply_wallet_transaction, get_or_create_wallet

        wallet = get_or_create_wallet(partner.admin_user)
        apply_wallet_transaction(
            wallet,
            settlement.partner_payout,
            is_credit=True,
            transaction_type="adjustment",
            reference=f"partner_settlement:{settlement.id}",
            note=f"Partner settlement {settlement.invoice_reference}",
        )

    settlement.status = "paid"
    settlement.paid_at = timezone.now()
    settlement.approved_by = actor
    settlement.save()
    invalidate_ops_cache("partner_platform_dashboard")
    return {
        "id": settlement.id,
        "status": settlement.status,
        "partner_payout": float(settlement.partner_payout),
    }


def build_cached_partner_platform_dashboard(**parts):
    return cached_ops_call("partner_platform_dashboard", lambda: build_partner_platform_dashboard(**parts), **parts)
