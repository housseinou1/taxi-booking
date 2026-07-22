"""Phase 20 — Business Operations Platform service layer."""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db.models import Avg, Count, Q, Sum
from django.utils import timezone

from deliveries.models import BusinessAccount, Delivery, DeliveryDispute, DriverDeliverySettings
from features.models import CorporateAccount, CorporateEmployee
from incentives.models import BonusPayment, DriverIncentiveProgress, IncentiveProgram
from merchants.models import Merchant, MerchantOrder, MerchantPayout
from payments.models import PaymentRecord, RefundRequest, WalletAccount, WithdrawalRequest
from promotions.models import PromoCode, PromoCodeUsage
from referrals.models import DriverReferral, FlaggedReferral, RiderReferralCode
from taxi.rides.models import Ride
from security.models import AuditLog, FraudFlag
from taxi.drivers.models import DriverDocument, DriverProfile, SupportTicket

from .ai_operations_service import build_financial_insights
from .executive_service import build_finance_dashboard, build_qa_reconciliation, build_security_panel, build_support_panel
from .launch_service import build_business_kpis, build_financial_reconciliation, build_onboarding_dashboard
from .models import CorporateInvoice, MarketingCampaign, OpsCustomerRecord

User = get_user_model()


def _dec(value) -> str:
    if value is None:
        return "0.00"
    return f"{Decimal(str(value)):.2f}"


def _get_or_create_crm_record(user):
    record, _ = OpsCustomerRecord.objects.get_or_create(user=user)
    return record


# ── Module 1: Finance Center ────────────────────────────────────────────────


def build_finance_center(period: str = "daily", city_id=None) -> dict:
    today = timezone.localdate()
    month_start = today.replace(day=1)
    finance = build_finance_dashboard(period=period, city_id=city_id)
    reconciliation = build_financial_reconciliation(date=today)
    qa = build_qa_reconciliation()
    forecast = build_financial_insights()

    monthly_finance = build_finance_dashboard(period="monthly", city_id=city_id)
    monthly_summary = monthly_finance.get("summary", {})
    gross = Decimal(monthly_summary.get("gross_revenue", "0"))
    commission = Decimal(monthly_summary.get("platform_commission", "0"))
    withdrawals = Decimal(monthly_summary.get("withdrawal_total", "0"))
    refunds = Decimal(monthly_summary.get("refund_total", "0"))
    profit_loss = commission - withdrawals - refunds

    pending_refunds = RefundRequest.objects.filter(status="requested").aggregate(
        total=Sum("amount"), count=Count("id")
    )
    outstanding_withdrawals = WithdrawalRequest.objects.filter(
        status__in=["pending", "approved"]
    ).aggregate(total=Sum("amount"), count=Count("id"))

    wallet_total = WalletAccount.objects.aggregate(total=Sum("balance"))["total"] or Decimal("0")
    cash_in = PaymentRecord.objects.filter(created_at__date=today).aggregate(total=Sum("amount"))["total"] or Decimal("0")
    cash_out = WithdrawalRequest.objects.filter(paid_at__date=today, status="paid").aggregate(
        total=Sum("amount")
    )["total"] or Decimal("0")

    tax_estimate = commission * Decimal("0.18")

    return {
        "generated_at": timezone.now().isoformat(),
        "period": period,
        "daily_revenue": reconciliation.get("gross_revenue", "0.00"),
        "outstanding_withdrawals": {
            "amount": _dec(outstanding_withdrawals["total"]),
            "count": outstanding_withdrawals["count"] or 0,
        },
        "pending_refunds": {
            "amount": _dec(pending_refunds["total"]),
            "count": pending_refunds["count"] or 0,
        },
        "cash_flow": {
            "wallet_balance": _dec(wallet_total),
            "cash_in_today": _dec(cash_in),
            "cash_out_today": _dec(cash_out),
            "net_today": _dec(cash_in - cash_out),
        },
        "commission": reconciliation.get("commission", "0.00"),
        "taxes_estimate": _dec(tax_estimate),
        "monthly_profit_loss": {
            "period_start": month_start.isoformat(),
            "gross_revenue": _dec(gross),
            "commission": _dec(commission),
            "withdrawals": _dec(withdrawals),
            "refunds": _dec(refunds),
            "net_profit": _dec(profit_loss),
        },
        "finance_dashboard": finance,
        "reconciliation": reconciliation,
        "qa_reconciliation": qa,
        "forecast": forecast.get("forecast", {}),
    }


def build_finance_export_rows(period: str = "daily", city_id=None) -> list[dict]:
    center = build_finance_center(period=period, city_id=city_id)
    rows = [
        {"metric": "daily_revenue", "value": center["daily_revenue"], "date": "", "gross_revenue": "", "platform_commission": ""},
        {"metric": "outstanding_withdrawals", "value": center["outstanding_withdrawals"]["amount"], "date": "", "gross_revenue": "", "platform_commission": ""},
        {"metric": "pending_refunds", "value": center["pending_refunds"]["amount"], "date": "", "gross_revenue": "", "platform_commission": ""},
        {"metric": "wallet_balance", "value": center["cash_flow"]["wallet_balance"], "date": "", "gross_revenue": "", "platform_commission": ""},
        {"metric": "commission", "value": center["commission"], "date": "", "gross_revenue": "", "platform_commission": ""},
        {"metric": "taxes_estimate", "value": center["taxes_estimate"], "date": "", "gross_revenue": "", "platform_commission": ""},
        {"metric": "monthly_net_profit", "value": center["monthly_profit_loss"]["net_profit"], "date": "", "gross_revenue": "", "platform_commission": ""},
    ]
    for point in center.get("finance_dashboard", {}).get("chart", []):
        rows.append(
            {
                "metric": "daily_chart",
                "value": "",
                "date": point.get("date"),
                "gross_revenue": point.get("gross_revenue"),
                "platform_commission": point.get("platform_commission"),
            }
        )
    return rows


# ── Module 2: CRM ───────────────────────────────────────────────────────────


def _user_is_courier(user) -> bool:
    return DriverDeliverySettings.objects.filter(driver_id=user.id).exists()


def _user_profile_type(user) -> str:
    if user.user_type == "merchant":
        return "merchant"
    if _user_is_courier(user):
        return "courier"
    if hasattr(user, "driver_profile"):
        return "driver"
    return "customer"


def build_crm_dashboard(search: str = "", profile_type: str = "") -> dict:
    users = User.objects.all().order_by("-date_joined")
    if search:
        users = users.filter(
            Q(email__icontains=search)
            | Q(first_name__icontains=search)
            | Q(last_name__icontains=search)
            | Q(phone_number__icontains=search)
        )
    if profile_type == "driver":
        users = users.filter(driver_profile__isnull=False)
    elif profile_type == "courier":
        courier_ids = DriverDeliverySettings.objects.values_list("driver_id", flat=True)
        users = users.filter(id__in=courier_ids)
    elif profile_type == "customer":
        users = users.filter(user_type="rider", driver_profile__isnull=True)
    elif profile_type == "merchant":
        users = users.filter(user_type="merchant")

    profiles = []
    for user in users[:50]:
        record = OpsCustomerRecord.objects.filter(user=user).first()
        driver = getattr(user, "driver_profile", None)
        profiles.append(
            {
                "id": user.id,
                "email": user.email,
                "name": user.get_full_name(),
                "phone": user.phone_number,
                "profile_type": _user_profile_type(user),
                "is_active": user.is_active,
                "is_vip": record.is_vip if record else False,
                "vip_tier": record.vip_tier if record else "",
                "is_blacklisted": record.is_blacklisted if record else False,
                "rating": float(driver.average_rating) if driver else None,
                "joined_at": user.date_joined.isoformat() if user.date_joined else None,
            }
        )

    return {
        "profiles": profiles,
        "summary": {
            "total_customers": User.objects.filter(user_type="rider").count(),
            "total_drivers": DriverProfile.objects.count(),
            "total_couriers": DriverDeliverySettings.objects.count(),
            "vip_count": OpsCustomerRecord.objects.filter(is_vip=True).count(),
            "blacklisted_count": OpsCustomerRecord.objects.filter(is_blacklisted=True).count(),
            "open_support_tickets": SupportTicket.objects.filter(status__in=["open", "in_progress"]).count(),
            "open_disputes": DeliveryDispute.objects.filter(status="open").count(),
            "pending_refunds": RefundRequest.objects.filter(status="requested").count(),
        },
    }


def build_crm_profile_detail(user_id: int) -> dict | None:
    user = User.objects.filter(id=user_id).first()
    if not user:
        return None

    record = _get_or_create_crm_record(user)
    driver = getattr(user, "driver_profile", None)

    rides_qs = Ride.objects.filter(rider=user)
    driver_rides_qs = Ride.objects.filter(driver=user) if driver else Ride.objects.none()

    ratings_given = rides_qs.exclude(rating__isnull=True).aggregate(avg=Avg("rating"), count=Count("id"))
    ratings_received = (
        driver_rides_qs.exclude(driver_rating__isnull=True).aggregate(avg=Avg("driver_rating"), count=Count("id"))
        if driver
        else {"avg": None, "count": 0}
    )

    tickets = []
    if driver:
        tickets = list(
            SupportTicket.objects.filter(driver=driver).order_by("-created_at")[:10].values(
                "id", "subject", "status", "ticket_type", "created_at"
            )
        )

    complaints = FraudFlag.objects.filter(user=user).order_by("-created_at")[:10]
    referral = RiderReferralCode.objects.filter(rider=user).first()

    return {
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.get_full_name(),
            "phone": user.phone_number,
            "profile_type": _user_profile_type(user),
            "is_active": user.is_active,
            "city_id": user.city_id,
            "joined_at": user.date_joined.isoformat() if user.date_joined else None,
        },
        "crm": {
            "is_vip": record.is_vip,
            "vip_tier": record.vip_tier,
            "is_blacklisted": record.is_blacklisted,
            "blacklist_reason": record.blacklist_reason,
            "blacklist_until": record.blacklist_until.isoformat() if record.blacklist_until else None,
            "complaints_count": record.complaints_count,
            "notes": record.notes,
        },
        "driver": {
            "status": driver.status if driver else None,
            "average_rating": float(driver.average_rating) if driver else None,
            "total_rides": driver.total_rides if driver else 0,
        }
        if driver
        else None,
        "support_history": tickets,
        "ratings": {
            "given_avg": ratings_given["avg"],
            "given_count": ratings_given["count"],
            "received_avg": ratings_received["avg"],
            "received_count": ratings_received["count"],
        },
        "complaints": [
            {"id": f.id, "reason": f.reason, "severity": f.severity, "status": f.status, "created_at": f.created_at.isoformat()}
            for f in complaints
        ],
        "referral_code": referral.code if referral else None,
        "recent_rides": list(rides_qs.order_by("-created_at")[:5].values("id", "status", "fare", "created_at")),
        "recent_payments": list(
            PaymentRecord.objects.filter(customer=user).order_by("-created_at")[:5].values(
                "id", "amount", "status", "created_at"
            )
        ),
    }


def update_crm_profile(user_id: int, payload: dict, actor) -> dict | None:
    user = User.objects.filter(id=user_id).first()
    if not user:
        return None

    record = _get_or_create_crm_record(user)
    if "is_vip" in payload:
        record.is_vip = bool(payload["is_vip"])
    if "vip_tier" in payload:
        record.vip_tier = payload["vip_tier"] or ""
    if "is_blacklisted" in payload:
        record.is_blacklisted = bool(payload["is_blacklisted"])
        if record.is_blacklisted and not user.is_active:
            user.is_active = False
            user.save(update_fields=["is_active"])
        elif not record.is_blacklisted and not user.is_active:
            user.is_active = True
            user.save(update_fields=["is_active"])
    if "blacklist_reason" in payload:
        record.blacklist_reason = payload["blacklist_reason"] or ""
    if "notes" in payload:
        record.notes = payload["notes"] or ""
    record.updated_by = actor
    record.save()
    return build_crm_profile_detail(user_id)


# ── Module 3: Marketing ─────────────────────────────────────────────────────


def build_marketing_dashboard() -> dict:
    campaigns = MarketingCampaign.objects.all().order_by("-created_at")[:20]
    promo_stats = PromoCode.objects.aggregate(
        total=Count("id"), active=Count("id", filter=Q(status="active"))
    )
    promo_usage = PromoCodeUsage.objects.count()
    referral_codes = RiderReferralCode.objects.count()
    driver_referrals = DriverReferral.objects.count()
    flagged_referrals = FlaggedReferral.objects.filter(status="pending").count()

    return {
        "campaigns": [
            {
                "id": c.id,
                "name": c.name,
                "channel": c.channel,
                "audience": c.audience,
                "status": c.status,
                "scheduled_at": c.scheduled_at.isoformat() if c.scheduled_at else None,
                "sent_at": c.sent_at.isoformat() if c.sent_at else None,
                "metrics": c.metrics,
            }
            for c in campaigns
        ],
        "promo_codes": {
            "total": promo_stats["total"] or 0,
            "active": promo_stats["active"] or 0,
            "total_usages": promo_usage,
        },
        "referrals": {
            "rider_codes": referral_codes,
            "driver_referrals": driver_referrals,
            "flagged_pending": flagged_referrals,
        },
        "recent_promos": list(
            PromoCode.objects.order_by("-created_at")[:10].values(
                "id", "code", "discount_type", "discount_value", "status", "max_total_uses"
            )
        ),
    }


def create_marketing_campaign(payload: dict, actor) -> MarketingCampaign:
    return MarketingCampaign.objects.create(
        name=payload["name"],
        channel=payload.get("channel", "push"),
        audience=payload.get("audience", "all_riders"),
        status=payload.get("status", "draft"),
        subject=payload.get("subject", ""),
        message=payload.get("message", ""),
        promo_code_id=payload.get("promo_code_id"),
        city_id=payload.get("city_id"),
        scheduled_at=payload.get("scheduled_at"),
        created_by=actor,
    )


def build_marketing_analytics() -> dict:
    campaigns = MarketingCampaign.objects.filter(status="completed")
    total_sent = campaigns.count()
    channel_breakdown = {}
    for row in campaigns.values("channel").annotate(count=Count("id")):
        channel_breakdown[row["channel"]] = row["count"]

    return {
        "total_campaigns": MarketingCampaign.objects.count(),
        "completed_campaigns": total_sent,
        "channel_breakdown": channel_breakdown,
        "promo_redemptions_30d": PromoCodeUsage.objects.filter(
            created_at__gte=timezone.now() - timedelta(days=30)
        ).count(),
        "referral_conversions_30d": DriverReferral.objects.filter(
            created_at__gte=timezone.now() - timedelta(days=30)
        ).count(),
    }


# ── Module 4: Driver Incentives ─────────────────────────────────────────────


def build_incentives_dashboard() -> dict:
    programs = IncentiveProgram.objects.filter(status="active")
    progress = DriverIncentiveProgress.objects.select_related("driver", "program")
    bonuses = BonusPayment.objects.order_by("-paid_at")[:10]

    weekly_programs = programs.filter(incentive_type="weekly_target")
    monthly_programs = programs.filter(incentive_type__in=["ride_count", "seasonal"])
    peak_programs = programs.filter(incentive_type="peak_hours")
    referral_programs = programs.filter(incentive_type="first_ride_bonus")

    leaderboard = []
    for row in (
        DriverIncentiveProgress.objects.filter(status="completed")
        .values("driver_id", "driver__first_name", "driver__last_name")
        .annotate(total_bonus=Sum("bonus_earned"), completions=Count("id"))
        .order_by("-total_bonus")[:10]
    ):
        leaderboard.append(
            {
                "driver_id": row["driver_id"],
                "name": f"{row['driver__first_name']} {row['driver__last_name']}".strip(),
                "total_bonus": _dec(row["total_bonus"]),
                "completions": row["completions"],
            }
        )

    return {
        "summary": {
            "active_programs": programs.count(),
            "participants": progress.filter(status="in_progress").count(),
            "completed_this_month": progress.filter(
                completed_at__gte=timezone.now().replace(day=1)
            ).count(),
            "bonuses_paid_month": _dec(
                BonusPayment.objects.filter(paid_at__gte=timezone.now().replace(day=1)).aggregate(
                    total=Sum("amount")
                )["total"]
            ),
        },
        "bonuses": list(bonuses.values("id", "driver_id", "amount", "reason", "paid_at")),
        "peak_hour_rewards": list(peak_programs.values("id", "name", "bonus_amount", "target_value")[:5]),
        "weekly_goals": list(weekly_programs.values("id", "name", "bonus_amount", "target_value")[:5]),
        "monthly_goals": list(monthly_programs.values("id", "name", "bonus_amount", "target_value")[:5]),
        "referral_bonuses": list(referral_programs.values("id", "name", "bonus_amount")[:5]),
        "leaderboard": leaderboard,
        "programs": list(programs.values("id", "name", "incentive_type", "bonus_amount", "status")[:20]),
    }


# ── Module 5: Partner Portal ────────────────────────────────────────────────


PARTNER_TYPES = {
    "restaurant": ["restaurant", "fast_food", "cafe"],
    "shop": ["grocery", "supermarket", "electronics", "clothing", "market", "shop"],
    "pharmacy": ["pharmacy"],
    "corporate": [],
    "hotel": [],
    "airport": [],
}


def _partner_category(merchant: Merchant) -> str:
    mt = merchant.merchant_type or merchant.business_type
    for category, types in PARTNER_TYPES.items():
        if mt in types:
            return category
    return "shop"


def build_partner_dashboard(partner_type: str = "") -> dict:
    merchants = Merchant.objects.select_related("owner").all()
    if partner_type:
        types = PARTNER_TYPES.get(partner_type, [partner_type])
        if types:
            merchants = merchants.filter(Q(merchant_type__in=types) | Q(business_type__in=types))

    partners = []
    for merchant in merchants.order_by("-created_at")[:50]:
        orders = MerchantOrder.objects.filter(merchant=merchant)
        revenue = orders.filter(status="delivered").aggregate(total=Sum("total"))["total"] or Decimal("0")
        payouts = MerchantPayout.objects.filter(merchant=merchant).aggregate(
            total=Sum("amount"), pending=Sum("amount", filter=Q(status="pending"))
        )
        partners.append(
            {
                "id": merchant.id,
                "name": merchant.business_name,
                "type": _partner_category(merchant),
                "status": merchant.status,
                "city": merchant.city,
                "total_orders": merchant.total_orders,
                "revenue": _dec(revenue),
                "payouts_total": _dec(payouts["total"]),
                "payouts_pending": _dec(payouts["pending"]),
            }
        )

    by_type = {}
    for m in Merchant.objects.all():
        cat = _partner_category(m)
        by_type[cat] = by_type.get(cat, 0) + 1

    return {
        "summary": {
            "total_partners": Merchant.objects.count(),
            "approved": Merchant.objects.filter(status="approved").count(),
            "pending": Merchant.objects.filter(status="pending").count(),
            "by_type": by_type,
        },
        "partners": partners,
    }


def build_partner_detail(partner_id: int) -> dict | None:
    merchant = Merchant.objects.filter(id=partner_id).first()
    if not merchant:
        return None

    orders = MerchantOrder.objects.filter(merchant=merchant)
    revenue = orders.filter(status="delivered").aggregate(total=Sum("total"))["total"] or Decimal("0")
    payouts = list(
        MerchantPayout.objects.filter(merchant=merchant).order_by("-created_at")[:20].values(
            "id", "amount", "status", "created_at", "paid_at"
        )
    )

    return {
        "partner": {
            "id": merchant.id,
            "name": merchant.business_name,
            "type": _partner_category(merchant),
            "status": merchant.status,
            "email": merchant.email,
            "phone": merchant.phone_number,
            "city": merchant.city,
        },
        "revenue": _dec(revenue),
        "orders": {
            "total": orders.count(),
            "delivered": orders.filter(status="delivered").count(),
            "recent": list(orders.order_by("-created_at")[:10].values("id", "status", "total", "created_at")),
        },
        "settlements": payouts,
    }


# ── Module 6: Corporate Accounts ────────────────────────────────────────────


def build_corporate_dashboard() -> dict:
    ride_accounts = CorporateAccount.objects.all()
    delivery_accounts = BusinessAccount.objects.all()

    accounts = []
    for acct in ride_accounts[:25]:
        employees = acct.employees.filter(is_active=True).count()
        accounts.append(
            {
                "id": acct.id,
                "account_type": "ride_corporate",
                "company_name": acct.company_name,
                "billing_type": acct.billing_type,
                "balance": _dec(acct.balance),
                "credit_limit": _dec(acct.credit_limit),
                "employees": employees,
                "is_active": acct.is_active,
                "status": acct.status,
                "contact_email": acct.contact_email,
                "commercial_registration": acct.commercial_registration,
            }
        )
    for acct in delivery_accounts[:25]:
        accounts.append(
            {
                "id": acct.id,
                "account_type": "delivery_business",
                "company_name": acct.company_name,
                "billing_type": acct.payment_terms,
                "balance": "0.00",
                "credit_limit": _dec(acct.daily_limit),
                "employees": 0,
                "is_active": acct.is_active,
            }
        )

    invoices = CorporateInvoice.objects.order_by("-created_at")[:10]
    from features.corporate_service import build_corporate_ceo_metrics

    ceo = build_corporate_ceo_metrics()

    return {
        "summary": {
            "ride_corporate_accounts": ride_accounts.count(),
            "delivery_business_accounts": delivery_accounts.count(),
            "total_employees": CorporateEmployee.objects.filter(is_active=True).count(),
            "pending_invoices": CorporateInvoice.objects.filter(status__in=["draft", "sent"]).count(),
            "pending_companies": ride_accounts.filter(status="pending").count(),
            "outstanding_balance": _dec(
                CorporateInvoice.objects.filter(status__in=["draft", "sent", "overdue"]).aggregate(
                    total=Sum("amount")
                )["total"]
            ),
        },
        "ceo": ceo,
        "accounts": accounts,
        "recent_invoices": list(
            invoices.values("id", "invoice_number", "company_name", "amount", "status", "period_end")
        ),
    }


def build_corporate_account_detail(account_type: str, account_id: int) -> dict | None:
    if account_type == "ride_corporate":
        acct = CorporateAccount.objects.filter(id=account_id).first()
        if not acct:
            return None
        employees = list(
            CorporateEmployee.objects.filter(account=acct).values(
                "id",
                "user_id",
                "employee_id",
                "department",
                "role",
                "cost_center",
                "monthly_limit",
                "monthly_spent",
                "ride_limit",
                "is_active",
            )
        )
        return {
            "account": {
                "id": acct.id,
                "account_type": account_type,
                "company_name": acct.company_name,
                "billing_type": acct.billing_type,
                "balance": _dec(acct.balance),
                "credit_limit": _dec(acct.credit_limit),
                "discount_percent": float(acct.discount_percent),
                "is_active": acct.is_active,
                "status": acct.status,
                "commercial_registration": acct.commercial_registration,
                "tax_id": acct.tax_id,
                "billing_email": acct.billing_email or acct.contact_email,
            },
            "employees": employees,
            "invoices": list(
                CorporateInvoice.objects.filter(account_type=account_type, account_id=account_id).values(
                    "id", "invoice_number", "amount", "status", "period_start", "period_end"
                )
            ),
        }

    acct = BusinessAccount.objects.filter(id=account_id).first()
    if not acct:
        return None
    return {
        "account": {
            "id": acct.id,
            "account_type": "delivery_business",
            "company_name": acct.company_name,
            "billing_type": acct.payment_terms,
            "balance": "0.00",
            "is_active": acct.is_active,
        },
        "employees": [],
        "invoices": list(
            CorporateInvoice.objects.filter(account_type="delivery_business", account_id=account_id).values(
                "id", "invoice_number", "amount", "status", "period_start", "period_end"
            )
        ),
    }


def generate_corporate_invoice(
    account_type: str,
    account_id: int,
    period_start,
    period_end,
    *,
    invoice_frequency: str = "monthly",
    tax_rate: Decimal | None = None,
) -> CorporateInvoice | None:
    tax_rate = tax_rate if tax_rate is not None else Decimal("0")
    if account_type == "ride_corporate":
        acct = CorporateAccount.objects.filter(id=account_id).first()
        if not acct:
            return None
        rides = Ride.objects.filter(
            corporate_account=acct,
            billing_source="corporate",
            status="completed",
            completed_at__date__gte=period_start,
            completed_at__date__lte=period_end,
        )
        if not rides.exists():
            employee_ids = list(acct.employees.values_list("user_id", flat=True))
            rides = Ride.objects.filter(
                rider_id__in=employee_ids,
                status="completed",
                completed_at__date__gte=period_start,
                completed_at__date__lte=period_end,
            )
        subtotal = rides.aggregate(total=Sum("fare"))["total"] or Decimal("0")
        ride_count = rides.count()
        delivery_count = 0
        company_name = acct.company_name
    else:
        acct = BusinessAccount.objects.filter(id=account_id).first()
        if not acct:
            return None
        deliveries = Delivery.objects.filter(
            business_account=acct,
            status="delivered",
            delivered_at__date__gte=period_start,
            delivered_at__date__lte=period_end,
        )
        subtotal = deliveries.aggregate(total=Sum("fare"))["total"] or Decimal("0")
        ride_count = 0
        delivery_count = deliveries.count()
        company_name = acct.company_name

    tax_amount = (subtotal * tax_rate / Decimal("100")).quantize(Decimal("0.01")) if tax_rate else Decimal("0")
    amount = subtotal + tax_amount

    suffix = period_end.strftime("%Y%m")
    if invoice_frequency == "weekly":
        suffix = f"W{period_end.isocalendar()[1]}-{period_end.year}"
    invoice_number = f"INV-{account_type[:3].upper()}-{account_id}-{suffix}"
    if CorporateInvoice.objects.filter(invoice_number=invoice_number).exists():
        return CorporateInvoice.objects.get(invoice_number=invoice_number)

    return CorporateInvoice.objects.create(
        account_type=account_type,
        account_id=account_id,
        company_name=company_name,
        invoice_number=invoice_number,
        period_start=period_start,
        period_end=period_end,
        subtotal=subtotal,
        tax_amount=tax_amount,
        tax_rate=tax_rate,
        amount=amount,
        ride_count=ride_count,
        delivery_count=delivery_count,
        invoice_frequency=invoice_frequency,
        status="draft",
    )


def build_invoice_export_rows(invoice: CorporateInvoice) -> list[dict]:
    rows = [
        {"field": "invoice_number", "value": invoice.invoice_number},
        {"field": "company", "value": invoice.company_name},
        {"field": "period_start", "value": str(invoice.period_start)},
        {"field": "period_end", "value": str(invoice.period_end)},
        {"field": "subtotal", "value": str(invoice.subtotal)},
        {"field": "tax_rate", "value": str(invoice.tax_rate)},
        {"field": "tax_amount", "value": str(invoice.tax_amount)},
        {"field": "total", "value": str(invoice.amount)},
        {"field": "rides", "value": invoice.ride_count},
        {"field": "deliveries", "value": invoice.delivery_count},
        {"field": "status", "value": invoice.status},
    ]
    if invoice.account_type == "ride_corporate":
        rides = Ride.objects.filter(
            corporate_account_id=invoice.account_id,
            billing_source="corporate",
            status="completed",
            completed_at__date__gte=invoice.period_start,
            completed_at__date__lte=invoice.period_end,
        )
        for ride in rides[:500]:
            rows.append(
                {
                    "ride_id": ride.id,
                    "rider_id": ride.rider_id,
                    "fare": str(ride.fare),
                    "cost_center": ride.cost_center,
                    "completed_at": ride.completed_at.isoformat() if ride.completed_at else "",
                }
            )
    return rows


# ── Module 7: Compliance ────────────────────────────────────────────────────


def build_compliance_dashboard() -> dict:
    today = timezone.localdate()
    expiring_soon = today + timedelta(days=30)

    expired_docs = DriverDocument.objects.filter(expires_at__lt=today)
    expiring_docs = DriverDocument.objects.filter(expires_at__gte=today, expires_at__lte=expiring_soon)
    insurance_expired = expired_docs.filter(document_type="insurance").count()
    license_expired = expired_docs.filter(document_type="license").count()
    inspection_due = expiring_docs.filter(document_type__in=["carte_grise", "vignette"]).count()

    from .models import VehicleMaintenanceReminder

    maintenance_due = VehicleMaintenanceReminder.objects.filter(status__in=["upcoming", "due"]).count()
    onboarding = build_onboarding_dashboard()
    audit_recent = AuditLog.objects.order_by("-created_at")[:20]

    return {
        "summary": {
            "expired_documents": expired_docs.count(),
            "expiring_within_30d": expiring_docs.count(),
            "insurance_expired": insurance_expired,
            "license_expired": license_expired,
            "inspection_due": inspection_due,
            "maintenance_due": maintenance_due,
        },
        "expired_documents": list(
            expired_docs.select_related("driver__user").order_by("expires_at")[:20].values(
                "id", "document_type", "expires_at", "driver__user__email"
            )
        ),
        "expiring_soon": list(
            expiring_docs.select_related("driver__user").order_by("expires_at")[:20].values(
                "id", "document_type", "expires_at", "driver__user__email"
            )
        ),
        "onboarding": onboarding.get("summary", {}),
        "audit_reports": [
            {
                "id": log.id,
                "action": log.action,
                "summary": log.summary,
                "actor_id": log.actor_id if log.actor_id else None,
                "created_at": log.created_at.isoformat(),
            }
            for log in audit_recent
        ],
    }


def build_compliance_export_rows() -> list[dict]:
    dashboard = build_compliance_dashboard()
    rows = []
    for key, value in dashboard["summary"].items():
        rows.append({"section": "summary", "metric": key, "value": value})
    for doc in dashboard["expired_documents"]:
        rows.append({"section": "expired", **doc})
    for doc in dashboard["expiring_soon"]:
        rows.append({"section": "expiring", **doc})
    return rows


# ── Module 8: Business Intelligence ─────────────────────────────────────────


def build_bi_dashboard(city_id=None) -> dict:
    kpis = build_business_kpis(city_id=city_id)
    finance = build_finance_dashboard(period="monthly", city_id=city_id)
    forecast = build_financial_insights()
    security = build_security_panel()
    support = build_support_panel()

    today = timezone.localdate()
    week_ago = today - timedelta(days=7)
    prev_week_start = today - timedelta(days=14)

    revenue_this_week = PaymentRecord.objects.filter(
        created_at__date__gte=week_ago, created_at__date__lte=today
    ).aggregate(total=Sum("amount"))["total"] or Decimal("0")
    revenue_prev_week = PaymentRecord.objects.filter(
        created_at__date__gte=prev_week_start, created_at__date__lt=week_ago
    ).aggregate(total=Sum("amount"))["total"] or Decimal("0")
    growth_pct = None
    if revenue_prev_week > 0:
        growth_pct = round(float((revenue_this_week - revenue_prev_week) / revenue_prev_week * 100), 1)

    driver_productivity = (
        Ride.objects.filter(status="completed", completed_at__date__gte=week_ago)
        .values("driver_id")
        .annotate(trips=Count("id"), earnings=Sum("driver_earning"))
        .order_by("-trips")[:10]
    )
    courier_productivity = (
        Delivery.objects.filter(status="delivered", delivered_at__date__gte=week_ago)
        .values("driver_id")
        .annotate(trips=Count("id"))
        .order_by("-trips")[:10]
    )

    from locations.models import City

    city_comparison = []
    for city in City.objects.all()[:10]:
        city_revenue = Ride.objects.filter(
            city_id=city.id,
            status="completed",
            completed_at__date__gte=week_ago,
        ).aggregate(total=Sum("fare"))["total"] or Decimal("0")
        city_comparison.append({"city_id": city.id, "city_name": city.name, "revenue_7d": _dec(city_revenue)})

    return {
        "generated_at": timezone.now().isoformat(),
        "ceo_report": {
            "kpis": kpis,
            "finance_summary": finance.get("summary", {}),
            "support": {
                "open_tickets": support.get("open_tickets", 0),
                "refund_requests": support.get("refund_requests", 0),
            },
            "security_alerts": security.get("expired_documents", 0) + security.get("open_fraud_flags", 0),
        },
        "financial_forecasts": forecast,
        "growth_trends": {
            "revenue_this_week": _dec(revenue_this_week),
            "revenue_prev_week": _dec(revenue_prev_week),
            "growth_percent": growth_pct,
            "chart": kpis.get("growth_chart", []),
        },
        "city_comparison": city_comparison,
        "driver_productivity": list(driver_productivity),
        "courier_productivity": list(courier_productivity),
    }


def build_business_hub(city_id=None) -> dict:
    """Single payload for the Business Operations hub."""
    return {
        "generated_at": timezone.now().isoformat(),
        "finance": build_finance_center(city_id=city_id),
        "crm": build_crm_dashboard(),
        "marketing": build_marketing_dashboard(),
        "incentives": build_incentives_dashboard(),
        "partners": build_partner_dashboard(),
        "corporate": build_corporate_dashboard(),
        "compliance": build_compliance_dashboard(),
        "bi": build_bi_dashboard(city_id=city_id),
    }
