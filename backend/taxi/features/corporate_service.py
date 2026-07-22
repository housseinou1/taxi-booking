"""Yala Business Accounts service layer."""

from __future__ import annotations

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db.models import Count, Sum
from django.utils import timezone

from features.models import CorporateAccount, CorporateEmployee
from taxi.rides.models import Ride

User = get_user_model()

DEFAULT_VAT_RATE = Decimal("0.00")


def get_employee_profile(user) -> CorporateEmployee | None:
    return (
        CorporateEmployee.objects.select_related("account")
        .filter(user=user, is_active=True, account__status="approved", account__is_active=True)
        .first()
    )


def get_company_admin_profile(user) -> CorporateEmployee | None:
    return (
        CorporateEmployee.objects.select_related("account")
        .filter(user=user, is_active=True, role="admin", account__status="approved")
        .first()
    )


def serialize_account(account: CorporateAccount) -> dict:
    return {
        "id": account.id,
        "company_name": account.company_name,
        "commercial_registration": account.commercial_registration,
        "tax_id": account.tax_id,
        "address": account.address,
        "contact_person": account.contact_person,
        "contact_email": account.contact_email,
        "contact_phone": account.contact_phone,
        "billing_email": account.billing_email or account.contact_email,
        "billing_type": account.billing_type,
        "status": account.status,
        "credit_limit": float(account.credit_limit),
        "balance": float(account.balance),
        "discount_percent": float(account.discount_percent),
        "employee_count": account.employees.filter(is_active=True).count(),
    }


def serialize_employee(employee: CorporateEmployee) -> dict:
    return {
        "id": employee.id,
        "user_id": employee.user_id,
        "email": employee.user.email,
        "name": employee.user.get_full_name() or employee.user.email,
        "employee_id": employee.employee_id,
        "department": employee.department,
        "role": employee.role,
        "cost_center": employee.cost_center,
        "monthly_limit": float(employee.monthly_limit),
        "monthly_spent": float(employee.monthly_spent),
        "ride_limit": employee.ride_limit,
        "rides_this_month": _employee_rides_this_month(employee),
        "is_active": employee.is_active,
    }


def _employee_rides_this_month(employee: CorporateEmployee) -> int:
    month_start = timezone.localdate().replace(day=1)
    return Ride.objects.filter(
        rider_id=employee.user_id,
        billing_source="corporate",
        status="completed",
        completed_at__date__gte=month_start,
    ).count()


def register_company(data, admin_user=None) -> CorporateAccount:
    account = CorporateAccount.objects.create(
        company_name=(data.get("company_name") or "").strip(),
        commercial_registration=(data.get("commercial_registration") or "").strip(),
        tax_id=(data.get("tax_id") or "").strip(),
        address=(data.get("address") or "").strip(),
        contact_person=(data.get("contact_person") or "").strip(),
        contact_email=(data.get("contact_email") or data.get("email") or "").strip().lower(),
        contact_phone=(data.get("contact_phone") or data.get("phone") or "").strip(),
        billing_email=(data.get("billing_email") or data.get("contact_email") or data.get("email") or "").strip().lower(),
        billing_type=data.get("billing_type", "monthly_invoice"),
        status="pending",
        is_active=False,
        admin_user=admin_user,
    )
    if admin_user:
        CorporateEmployee.objects.create(
            account=account,
            user=admin_user,
            role="admin",
            employee_id=(data.get("employee_id") or "")[:50],
            department="Administration",
            is_active=True,
        )
    return account


def approve_company(account: CorporateAccount) -> CorporateAccount:
    account.status = "approved"
    account.is_active = True
    account.save(update_fields=["status", "is_active"])
    return account


def suspend_company(account: CorporateAccount) -> CorporateAccount:
    account.status = "suspended"
    account.is_active = False
    account.save(update_fields=["status", "is_active"])
    return account


def invite_employee(account: CorporateAccount, email: str, payload: dict | None = None) -> CorporateEmployee:
    payload = payload or {}
    user = User.objects.filter(email__iexact=email.strip()).first()
    if not user:
        user = User.objects.create_user(
            email=email.strip().lower(),
            password=User.objects.make_random_password(),
            user_type="rider",
        )

    employee, created = CorporateEmployee.objects.get_or_create(
        account=account,
        user=user,
        defaults={
            "employee_id": (payload.get("employee_id") or "")[:50],
            "department": (payload.get("department") or "")[:100],
            "role": payload.get("role", "employee"),
            "cost_center": (payload.get("cost_center") or "")[:100],
            "monthly_limit": Decimal(str(payload.get("monthly_limit", 10000))),
            "ride_limit": payload.get("ride_limit"),
            "is_active": True,
        },
    )
    if not created:
        for field in ("department", "role", "cost_center", "monthly_limit", "ride_limit", "employee_id"):
            if field in payload:
                setattr(employee, field, payload[field])
        employee.is_active = True
        employee.save()
    return employee


def apply_corporate_discount(fare: Decimal, account: CorporateAccount) -> Decimal:
    if not account.discount_percent:
        return fare
    discount = (fare * account.discount_percent / Decimal("100")).quantize(Decimal("0.01"))
    return max(fare - discount, Decimal("0"))


def validate_corporate_booking(user, fare: Decimal) -> tuple[CorporateEmployee, CorporateAccount]:
    employee = get_employee_profile(user)
    if not employee:
        raise ValueError("No active corporate account linked to this user.")

    account = employee.account
    if account.status != "approved" or not account.is_active:
        raise ValueError("Corporate account is not approved.")

    remaining = employee.monthly_limit - employee.monthly_spent
    if fare > remaining:
        raise ValueError("Monthly corporate spending limit exceeded.")

    if employee.ride_limit is not None:
        rides = _employee_rides_this_month(employee)
        if rides >= employee.ride_limit:
            raise ValueError("Monthly corporate ride limit exceeded.")

    outstanding = account.balance
    if account.billing_type == "prepaid" and outstanding + fare > account.credit_limit:
        raise ValueError("Corporate prepaid balance limit exceeded.")

    return employee, account


def record_corporate_ride_completion(ride) -> None:
    if ride.billing_source != "corporate" or not ride.corporate_account_id:
        return

    employee = CorporateEmployee.objects.filter(
        user_id=ride.rider_id,
        account_id=ride.corporate_account_id,
        is_active=True,
    ).first()
    if not employee:
        return

    amount = Decimal(str(ride.fare or 0))
    employee.monthly_spent = (employee.monthly_spent or Decimal("0")) + amount
    employee.save(update_fields=["monthly_spent"])

    account = ride.corporate_account
    if account and account.billing_type == "prepaid":
        account.balance = (account.balance or Decimal("0")) + amount
        account.save(update_fields=["balance"])


def build_corporate_ceo_metrics() -> dict:
    today = timezone.localdate()
    month_start = today.replace(day=1)

    corporate_rides = Ride.objects.filter(
        billing_source="corporate",
        status="completed",
        completed_at__date__gte=month_start,
    )
    corporate_revenue = corporate_rides.aggregate(total=Sum("fare"))["total"] or Decimal("0")

    from operations.models import CorporateInvoice

    outstanding = (
        CorporateInvoice.objects.filter(status__in=["draft", "sent", "overdue"]).aggregate(
            total=Sum("amount")
        )["total"]
        or Decimal("0")
    )

    top_customers = (
        Ride.objects.filter(billing_source="corporate", status="completed", completed_at__date__gte=month_start)
        .values("corporate_account_id", "corporate_account__company_name")
        .annotate(trips=Count("id"), revenue=Sum("fare"))
        .order_by("-revenue")[:10]
    )

    volume_by_company = [
        {
            "account_id": row["corporate_account_id"],
            "company_name": row["corporate_account__company_name"],
            "trips": row["trips"],
            "revenue": float(row["revenue"] or 0),
        }
        for row in top_customers
    ]

    approved_accounts = CorporateAccount.objects.filter(status="approved").count()
    mrr = float(corporate_revenue)

    return {
        "generated_at": timezone.now().isoformat(),
        "corporate_revenue_mtd": float(corporate_revenue),
        "monthly_recurring_revenue": mrr,
        "outstanding_invoices": float(outstanding),
        "approved_companies": approved_accounts,
        "pending_companies": CorporateAccount.objects.filter(status="pending").count(),
        "top_customers": volume_by_company,
        "ride_volume_by_company": volume_by_company,
    }
