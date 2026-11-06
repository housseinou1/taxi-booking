"""Employee ID card lifecycle service.

Centralizes every card state transition behind explicit, validated,
concurrency-safe operations. The permanent employee number is NEVER touched by
any operation here — only physical cards (each with its own card_number and
qr_uuid) are created/invalidated.

Invariants enforced:
- Only ACTIVE employees may receive a valid card.
- At most one VALID (active) card per employee at a time.
- Issuing/renewing/replacing creates a NEW physical card (new card_number +
  new qr_uuid) and invalidates the prior active card atomically.
- Expiry is always exactly one calendar year after issuance (never arbitrary).
- Revoked / replaced / deactivated / expired cards are terminal for validity
  and cannot be reactivated or renewed from a revoked credential.
- Card identifiers are never reused.

Authorization is enforced at the API layer (DRF permission classes); this
service assumes the caller is already authorized and focuses on domain safety.
Audit logging is performed here so every state change is recorded regardless of
entry point, using the Phase 2 employee audit service.
"""

from __future__ import annotations

import uuid

from django.db import transaction
from django.utils import timezone

from employees.models import (
    CardStatus,
    EmployeeIDCard,
    EmploymentStatus,
    StaffEmployee,
    add_calendar_year,
)
from employees.services.audit import ENTITY_ID_CARD, log_employee_event

# Statuses that make a card non-valid / terminal.
INVALID_STATUSES = {
    CardStatus.EXPIRED,
    CardStatus.DEACTIVATED,
    CardStatus.REPLACED,
    CardStatus.REVOKED,
}


class CardLifecycleError(Exception):
    """Raised when a requested card transition violates a safety invariant."""


def _generate_card_number() -> str:
    """Unique, non-reused physical card identifier (opaque, not the emp number)."""
    for _ in range(20):
        candidate = f"CARD-{uuid.uuid4().hex[:16].upper()}"
        if not EmployeeIDCard.objects.filter(card_number=candidate).exists():
            return candidate
    raise CardLifecycleError("Unable to allocate a unique card number; please retry.")


def _active_card_qs(employee: StaffEmployee):
    """Cards currently considered active/valid-status for an employee."""
    return employee.id_cards.filter(status=CardStatus.VALID)


def get_active_card(employee: StaffEmployee) -> EmployeeIDCard | None:
    return _active_card_qs(employee).order_by("-created_at").first()


def get_latest_card(employee: StaffEmployee) -> EmployeeIDCard | None:
    """Most recently created card for the employee, regardless of status."""
    return employee.id_cards.order_by("-created_at").first()


def card_history(employee: StaffEmployee):
    """Full card history for an employee, newest first."""
    return employee.id_cards.all().order_by("-created_at")


def _require_active_employee(employee: StaffEmployee):
    if employee.employment_status != EmploymentStatus.ACTIVE:
        raise CardLifecycleError(
            "Only active employees may be issued a valid ID card "
            f"(employee status: {employee.employment_status})."
        )


def _invalidate(card: EmployeeIDCard, status: str, *, replaced_by: EmployeeIDCard | None = None):
    """Mark a card invalid with a terminal status (internal helper)."""
    card.status = status
    if replaced_by is not None:
        card.replaced_by = replaced_by
    card.save(update_fields=["status", "replaced_by", "updated_at"])


@transaction.atomic
def issue_card(
    employee: StaffEmployee,
    *,
    request=None,
    issued_at=None,
) -> EmployeeIDCard:
    """Issue the first/new active card for an employee.

    - Employee must be ACTIVE.
    - Any existing VALID card is deactivated (no duplicate active cards).
    - Expiry = one calendar year after issue.
    """
    employee = StaffEmployee.objects.select_for_update().get(pk=employee.pk)
    _require_active_employee(employee)

    issued = issued_at or timezone.now()

    existing = get_active_card(employee)
    if existing is not None:
        _invalidate(existing, CardStatus.DEACTIVATED)

    card = EmployeeIDCard.objects.create(
        employee=employee,
        card_number=_generate_card_number(),
        qr_uuid=uuid.uuid4(),
        status=CardStatus.VALID,
        issued_at=issued,
        expires_at=add_calendar_year(issued),
    )
    log_employee_event(
        request,
        event="card.issue",
        summary=f"Issued card {card.card_number} for {employee.employee_number}",
        entity_type=ENTITY_ID_CARD,
        entity_id=card.card_number,
        details={"employee_number": employee.employee_number},
    )
    return card


@transaction.atomic
def renew_card(
    employee: StaffEmployee,
    *,
    request=None,
    issued_at=None,
) -> EmployeeIDCard:
    """Renew: create a NEW physical card and invalidate the prior one.

    - Employee must be ACTIVE (cannot renew a revoked/terminated credential).
    - The permanent employee number is unchanged.
    - New card gets a new card_number + qr_uuid; expiry = +1 calendar year.
    - The previous active card is marked REPLACED and linked via replaced_by /
      previous_card, preserving full history.
    """
    employee = StaffEmployee.objects.select_for_update().get(pk=employee.pk)
    _require_active_employee(employee)

    # Guard: never renew a revoked credential. A revoked latest card means the
    # credential was terminated and must be re-issued by an administrator, not
    # renewed. (A renewal supersedes an *active* card.)
    latest = get_latest_card(employee)
    if latest is not None and latest.status == CardStatus.REVOKED:
        raise CardLifecycleError("Cannot renew a revoked credential; re-issue is required.")

    previous = get_active_card(employee)

    issued = issued_at or timezone.now()
    new_card = EmployeeIDCard.objects.create(
        employee=employee,
        card_number=_generate_card_number(),
        qr_uuid=uuid.uuid4(),
        status=CardStatus.VALID,
        issued_at=issued,
        expires_at=add_calendar_year(issued),
        renewed_at=issued,
        renewal_count=(previous.renewal_count + 1) if previous else 1,
        previous_card=previous,
    )
    if previous is not None:
        _invalidate(previous, CardStatus.REPLACED, replaced_by=new_card)

    log_employee_event(
        request,
        event="card.renew",
        summary=f"Renewed card for {employee.employee_number}: {new_card.card_number}",
        entity_type=ENTITY_ID_CARD,
        entity_id=new_card.card_number,
        details={
            "employee_number": employee.employee_number,
            "previous_card_number": previous.card_number if previous else None,
            "renewal_count": new_card.renewal_count,
        },
    )
    return new_card


@transaction.atomic
def replace_card(
    employee: StaffEmployee,
    *,
    request=None,
    reason: str = "",
    issued_at=None,
) -> EmployeeIDCard:
    """Replace a lost/damaged card: new physical card, prior one invalidated.

    Semantically like renewal (new card_number + qr_uuid, +1y expiry, employee
    number unchanged) but recorded as a replacement for audit/history.
    """
    employee = StaffEmployee.objects.select_for_update().get(pk=employee.pk)
    _require_active_employee(employee)

    latest = get_latest_card(employee)
    if latest is not None and latest.status == CardStatus.REVOKED:
        raise CardLifecycleError("Cannot replace a revoked credential; re-issue is required.")

    previous = get_active_card(employee)

    issued = issued_at or timezone.now()
    new_card = EmployeeIDCard.objects.create(
        employee=employee,
        card_number=_generate_card_number(),
        qr_uuid=uuid.uuid4(),
        status=CardStatus.VALID,
        issued_at=issued,
        expires_at=add_calendar_year(issued),
        renewed_at=issued,
        renewal_count=(previous.renewal_count + 1) if previous else 0,
        previous_card=previous,
    )
    if previous is not None:
        _invalidate(previous, CardStatus.REPLACED, replaced_by=new_card)

    log_employee_event(
        request,
        event="card.replace",
        summary=f"Replaced card for {employee.employee_number}: {new_card.card_number}",
        entity_type=ENTITY_ID_CARD,
        entity_id=new_card.card_number,
        details={
            "employee_number": employee.employee_number,
            "previous_card_number": previous.card_number if previous else None,
            "reason": (reason or "")[:120],
        },
    )
    return new_card


@transaction.atomic
def deactivate_card(card: EmployeeIDCard, *, request=None) -> EmployeeIDCard:
    """Deactivate an active card (reversible administratively via re-issue)."""
    card = EmployeeIDCard.objects.select_for_update().get(pk=card.pk)
    if card.status != CardStatus.VALID:
        raise CardLifecycleError(
            f"Only a VALID card can be deactivated (current: {card.status})."
        )
    _invalidate(card, CardStatus.DEACTIVATED)
    log_employee_event(
        request,
        event="card.deactivate",
        summary=f"Deactivated card {card.card_number}",
        entity_type=ENTITY_ID_CARD,
        entity_id=card.card_number,
        details={"employee_number": card.employee.employee_number},
    )
    return card


@transaction.atomic
def activate_card(card: EmployeeIDCard, *, request=None) -> EmployeeIDCard:
    """Reactivate a DEACTIVATED card.

    Safety: cannot activate an expired card, and cannot reactivate a REPLACED or
    REVOKED card (those are terminal). Employee must still be ACTIVE, and no
    other valid card may exist (no duplicate active cards).
    """
    card = EmployeeIDCard.objects.select_for_update().get(pk=card.pk)
    if card.status in {CardStatus.REPLACED, CardStatus.REVOKED}:
        raise CardLifecycleError(f"A {card.status} card cannot be reactivated.")
    if card.status == CardStatus.VALID:
        raise CardLifecycleError("Card is already active.")
    if card.is_expired():
        raise CardLifecycleError("Cannot activate an expired card; issue or renew instead.")
    _require_active_employee(card.employee)
    if get_active_card(card.employee) is not None:
        raise CardLifecycleError("Employee already has an active card.")

    card.status = CardStatus.VALID
    card.save(update_fields=["status", "updated_at"])
    log_employee_event(
        request,
        event="card.activate",
        summary=f"Activated card {card.card_number}",
        entity_type=ENTITY_ID_CARD,
        entity_id=card.card_number,
        details={"employee_number": card.employee.employee_number},
    )
    return card


@transaction.atomic
def revoke_card(card: EmployeeIDCard, *, request=None, reason: str = "") -> EmployeeIDCard:
    """Revoke a card permanently (terminal; never valid again)."""
    card = EmployeeIDCard.objects.select_for_update().get(pk=card.pk)
    if card.status == CardStatus.REVOKED:
        raise CardLifecycleError("Card is already revoked.")
    _invalidate(card, CardStatus.REVOKED)
    log_employee_event(
        request,
        event="card.revoke",
        summary=f"Revoked card {card.card_number}",
        entity_type=ENTITY_ID_CARD,
        entity_id=card.card_number,
        details={
            "employee_number": card.employee.employee_number,
            "reason": (reason or "")[:120],
        },
    )
    return card
