"""Employee ID card management dashboard — read-only aggregates for HR."""

from __future__ import annotations

from django.db.models import Count, Exists, OuterRef, Q
from django.utils import timezone

from employees.models import CardStatus, EmployeeIDCard, EmploymentStatus, StaffEmployee


def _active_valid_card_subquery():
    now = timezone.now()
    return EmployeeIDCard.objects.filter(
        employee_id=OuterRef("pk"),
        status=CardStatus.VALID,
    ).filter(Q(expires_at__isnull=True) | Q(expires_at__gt=now))


def build_id_card_dashboard() -> dict:
    """Counts from verified HR records only — no fabricated metrics."""
    employees = StaffEmployee.objects.all()
    cards = EmployeeIDCard.objects.select_related("employee")
    now = timezone.now()

    has_active = _active_valid_card_subquery()
    with_active = employees.filter(Exists(has_active)).count()
    total_employees = employees.count()

    active_cards = cards.filter(status=CardStatus.VALID).filter(
        Q(expires_at__isnull=True) | Q(expires_at__gt=now)
    )
    expired_cards = cards.filter(
        Q(status=CardStatus.EXPIRED)
        | Q(status=CardStatus.VALID, expires_at__lte=now)
    )

    pending_hr = employees.filter(employment_status=EmploymentStatus.ACTIVE).filter(
        Q(photo_key="") | Q(signature_key="") | Q(signature_consent_confirmed=False)
    ).count()

    active_staff_no_card = employees.filter(employment_status=EmploymentStatus.ACTIVE).exclude(
        Exists(has_active)
    ).count()

    return {
        "generated_at": now.isoformat(),
        "total_employees": total_employees,
        "employees_with_active_card": with_active,
        "employees_without_active_card": max(total_employees - with_active, 0),
        "pending_hr_verification": pending_hr,
        "pending_ceo_approval": active_staff_no_card,
        "active_cards": active_cards.count(),
        "expired_cards": expired_cards.count(),
        "suspended_cards": employees.filter(employment_status=EmploymentStatus.SUSPENDED).count(),
        "lost_cards": cards.filter(status=CardStatus.REVOKED).count(),
        "replacement_requests": cards.filter(status=CardStatus.REPLACED).count(),
        "revoked_cards": cards.filter(status=CardStatus.REVOKED).count(),
        "replaced_cards": cards.filter(status=CardStatus.REPLACED).count(),
        "deactivated_cards": cards.filter(status=CardStatus.DEACTIVATED).count(),
        "by_department": list(
            employees.values("department")
            .annotate(count=Count("id"))
            .order_by("-count")[:20]
        ),
    }
