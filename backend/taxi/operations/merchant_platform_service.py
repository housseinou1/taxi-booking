"""Yala Merchant Platform — operations, finance, CEO dashboards (Phase 31)."""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.db.models import Count, Sum
from django.utils import timezone

from merchants.models import Merchant, MerchantOrder, MerchantSettlement, Product
from payments.models import CommissionConfig, MerchantWithdrawalRequest, PaymentRecord

from .cache_utils import cached_ops_call, invalidate_ops_cache
from .executive_service import _dec

CATEGORY_MAP = {
    "restaurant": "restaurants",
    "fast_food": "restaurants",
    "cafe": "restaurants",
    "pharmacy": "pharmacies",
    "grocery": "groceries",
    "supermarket": "groceries",
    "market": "groceries",
}


def _merchant_category(merchant: Merchant) -> str:
    return CATEGORY_MAP.get(merchant.merchant_type, "other")


def _serialize_merchant_admin(merchant: Merchant) -> dict:
    orders = MerchantOrder.objects.filter(merchant=merchant)
    revenue = orders.filter(status="delivered").aggregate(t=Sum("total"))["t"] or Decimal("0")
    return {
        "id": merchant.id,
        "business_name": merchant.business_name,
        "merchant_type": merchant.merchant_type,
        "category": _merchant_category(merchant),
        "status": merchant.status,
        "city": merchant.city,
        "total_orders": merchant.total_orders,
        "revenue": _dec(revenue),
        "commission_rate": float(merchant.commission_rate) if merchant.commission_rate else None,
        "delivery_radius_km": merchant.delivery_radius_km,
        "estimated_prep_minutes": merchant.estimated_prep_minutes,
        "is_active": merchant.is_active,
        "created_at": merchant.created_at.isoformat(),
        "approved_at": merchant.approved_at.isoformat() if merchant.approved_at else None,
    }


def build_merchant_platform_dashboard(*, city: str | None = None) -> dict:
    merchants = Merchant.objects.all()
    if city:
        merchants = merchants.filter(city__icontains=city)

    orders = MerchantOrder.objects.filter(merchant__in=merchants)
    delivered = orders.filter(status="delivered")

    return {
        "generated_at": timezone.now().isoformat(),
        "summary": {
            "total_merchants": merchants.count(),
            "approved": merchants.filter(status="approved").count(),
            "pending": merchants.filter(status="pending").count(),
            "suspended": merchants.filter(status="suspended").count(),
            "total_orders": orders.count(),
            "delivered_orders": delivered.count(),
            "gross_revenue": _dec(delivered.aggregate(t=Sum("total"))["t"]),
            "pending_settlements": MerchantSettlement.objects.filter(status="pending").count(),
            "pending_payouts": MerchantWithdrawalRequest.objects.filter(status="pending").count(),
        },
        "merchants": [_serialize_merchant_admin(m) for m in merchants.order_by("-created_at")[:100]],
    }


def build_merchant_ceo_dashboard() -> dict:
    now = timezone.now()
    since_30d = now - timedelta(days=30)
    merchants = Merchant.objects.all()
    orders = MerchantOrder.objects.filter(status="delivered", delivered_at__gte=since_30d)

    commission_total = PaymentRecord.objects.filter(
        source="merchant_order", status="paid", created_at__gte=since_30d
    ).aggregate(t=Sum("app_fee"))["t"] or Decimal("0")

    by_category = {"restaurants": [], "pharmacies": [], "groceries": [], "other": []}
    for merchant in merchants.filter(status="approved"):
        cat = _merchant_category(merchant)
        rev = orders.filter(merchant=merchant).aggregate(t=Sum("total"))["t"] or Decimal("0")
        row = {"id": merchant.id, "name": merchant.business_name, "revenue": float(rev), "orders": merchant.total_orders}
        by_category.setdefault(cat, []).append(row)

    for key in by_category:
        by_category[key] = sorted(by_category[key], key=lambda r: float(r["revenue"]), reverse=True)[:10]

    growth = []
    for offset in range(4):
        start = (now - timedelta(days=30 * (offset + 1))).date()
        end = (now - timedelta(days=30 * offset)).date()
        count = Merchant.objects.filter(created_at__date__gte=start, created_at__date__lt=end).count()
        growth.append({"period_start": start.isoformat(), "period_end": end.isoformat(), "new_merchants": count})

    revenue_by_merchant = list(
        orders.values("merchant_id", "merchant__business_name")
        .annotate(revenue=Sum("total"), order_count=Count("id"))
        .order_by("-revenue")[:15]
    )

    return {
        "generated_at": now.isoformat(),
        "total_merchants": merchants.count(),
        "approved_merchants": merchants.filter(status="approved").count(),
        "commission_revenue_30d": _dec(commission_total),
        "merchant_growth": list(reversed(growth)),
        "revenue_by_merchant": [
            {
                "merchant_id": row["merchant_id"],
                "name": row["merchant__business_name"],
                "revenue": _dec(row["revenue"]),
                "orders": row["order_count"],
            }
            for row in revenue_by_merchant
        ],
        "top_restaurants": by_category.get("restaurants", [])[:5],
        "top_pharmacies": by_category.get("pharmacies", [])[:5],
        "top_grocery_stores": by_category.get("groceries", [])[:5],
    }


def build_merchant_finance_dashboard() -> dict:
    pending_settlements = MerchantSettlement.objects.filter(status="pending").select_related("merchant")[:50]
    pending_payouts = MerchantWithdrawalRequest.objects.filter(status="pending").select_related("merchant")[:50]
    cfg = CommissionConfig.objects.filter(vertical="merchant").first()

    return {
        "generated_at": timezone.now().isoformat(),
        "default_commission": {
            "merchant_rate": float(cfg.merchant_rate) if cfg else 0.9,
            "platform_rate": float(cfg.platform_rate) if cfg else 0.1,
        },
        "pending_settlements": [
            {
                "id": s.id,
                "merchant_id": s.merchant_id,
                "merchant_name": s.merchant.business_name,
                "period_start": s.period_start.isoformat(),
                "period_end": s.period_end.isoformat(),
                "gross_sales": float(s.gross_sales),
                "commission_amount": float(s.commission_amount),
                "net_payout": float(s.net_payout),
                "status": s.status,
                "invoice_reference": s.invoice_reference,
            }
            for s in pending_settlements
        ],
        "pending_payouts": [
            {
                "id": p.id,
                "merchant_id": p.merchant_id,
                "merchant_name": p.merchant.business_name if p.merchant else "",
                "amount": float(p.amount),
                "status": p.status,
                "created_at": p.created_at.isoformat(),
            }
            for p in pending_payouts
        ],
    }


def update_merchant_commission(merchant_id: int, commission_rate: float | None, actor) -> dict | None:
    merchant = Merchant.objects.filter(id=merchant_id).first()
    if not merchant:
        return None
    merchant.commission_rate = Decimal(str(commission_rate)) if commission_rate is not None else None
    merchant.save(update_fields=["commission_rate", "updated_at"])
    invalidate_ops_cache("merchant_platform_dashboard")
    return _serialize_merchant_admin(merchant)


def admin_merchant_action(merchant_id: int, action: str, actor, *, reason: str = "") -> dict | None:
    merchant = Merchant.objects.filter(id=merchant_id).first()
    if not merchant:
        return None

    if action == "approve":
        merchant.status = "approved"
        merchant.approved_at = timezone.now()
        merchant.rejection_reason = ""
    elif action == "suspend":
        merchant.status = "suspended"
        merchant.is_active = False
        merchant.rejection_reason = reason
    elif action == "reactivate":
        merchant.status = "approved"
        merchant.is_active = True
        merchant.rejection_reason = ""
    else:
        return None

    merchant.save()
    invalidate_ops_cache("merchant_platform_dashboard")
    return _serialize_merchant_admin(merchant)


def generate_weekly_settlement(merchant_id: int, actor) -> dict | None:
    merchant = Merchant.objects.filter(id=merchant_id).first()
    if not merchant:
        return None

    today = timezone.now().date()
    period_end = today
    period_start = today - timedelta(days=7)
    orders = MerchantOrder.objects.filter(
        merchant=merchant, status="delivered", delivered_at__date__gte=period_start, delivered_at__date__lte=period_end
    )
    gross = orders.aggregate(t=Sum("total"))["t"] or Decimal("0")
    rate = merchant.commission_rate or Decimal("0.90")
    net = (gross * rate).quantize(Decimal("0.01"))
    commission = gross - net

    settlement = MerchantSettlement.objects.create(
        merchant=merchant,
        period_start=period_start,
        period_end=period_end,
        gross_sales=gross,
        commission_amount=commission,
        net_payout=net,
        order_count=orders.count(),
        invoice_reference=f"INV-{merchant.id}-{period_end:%Y%m%d}",
        approved_by=actor,
    )
    invalidate_ops_cache("merchant_platform_dashboard")
    return {
        "id": settlement.id,
        "merchant_id": merchant.id,
        "invoice_reference": settlement.invoice_reference,
        "net_payout": float(settlement.net_payout),
        "status": settlement.status,
    }


def approve_settlement(settlement_id: int, actor) -> dict | None:
    settlement = MerchantSettlement.objects.select_related("merchant").filter(id=settlement_id).first()
    if not settlement or settlement.status != "pending":
        return None

    from payments.wallet_ledger import apply_wallet_transaction, get_or_create_wallet

    wallet = get_or_create_wallet(settlement.merchant.owner)
    apply_wallet_transaction(
        wallet,
        settlement.net_payout,
        is_credit=True,
        transaction_type="merchant_earning",
        reference=f"settlement:{settlement.id}",
        note=f"Weekly settlement {settlement.invoice_reference}",
    )
    settlement.status = "paid"
    settlement.paid_at = timezone.now()
    settlement.approved_by = actor
    settlement.save()
    invalidate_ops_cache("merchant_platform_dashboard")
    return {"id": settlement.id, "status": settlement.status, "net_payout": float(settlement.net_payout)}


def build_cached_platform_dashboard(**parts):
    return cached_ops_call("merchant_platform_dashboard", lambda: build_merchant_platform_dashboard(**parts), **parts)
