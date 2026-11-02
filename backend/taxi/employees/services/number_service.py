"""Concurrency-safe permanent employee-number allocation.

Guarantees:
- Starts at YAM110001LAR and increments by one per employee.
- Unique (DB ``unique=True`` on ``StaffEmployee.employee_number`` is the
  authoritative backstop) and permanent (never reused, never reset).
- Continues past 9999 by widening the sequence (YAM1110000LAR, ...).
- Concurrency-safe: a single counter row is locked with
  ``select_for_update()`` inside ``transaction.atomic`` on PostgreSQL. On
  SQLite (dev/test) row locks are a no-op, so correctness additionally rests on
  the UNIQUE constraint plus a bounded retry-on-IntegrityError.

The employee number identifies the EMPLOYEE, never the physical card.
"""

from django.db import IntegrityError, transaction

from employees.models import (
    EmployeeNumberCounter,
    StaffEmployee,
    format_employee_number,
)

# Canonical counter row id. One row holds the monotonic sequence.
_COUNTER_PK = 1

# Bounded retries if a concurrent allocation wins the UNIQUE race (SQLite path).
_MAX_RETRIES = 10


def _next_sequence() -> int:
    """Atomically increment and return the next sequence integer (1-based)."""
    with transaction.atomic():
        counter, _created = EmployeeNumberCounter.objects.select_for_update().get_or_create(
            pk=_COUNTER_PK,
            defaults={"current_value": 0},
        )
        counter.current_value += 1
        counter.save(update_fields=["current_value", "updated_at"])
        return counter.current_value


def allocate_employee_number() -> str:
    """Return the next unused permanent employee number.

    Does not create an employee; it only reserves the next sequence value and
    formats it. Callers that persist a StaffEmployee should do so promptly so
    the number is backed by the UNIQUE constraint.
    """
    return format_employee_number(_next_sequence())


def create_staff_employee(**fields) -> StaffEmployee:
    """Create a StaffEmployee with a freshly allocated permanent number.

    Concurrency-safe: the counter is locked per allocation; if two creators
    race to the same number on a backend without real row locks, the UNIQUE
    constraint rejects the duplicate and we retry with a fresh sequence.
    ``employee_number`` must not be supplied by the caller.
    """
    fields.pop("employee_number", None)

    last_error = None
    for _attempt in range(_MAX_RETRIES):
        number = allocate_employee_number()
        try:
            with transaction.atomic():
                return StaffEmployee.objects.create(employee_number=number, **fields)
        except IntegrityError as exc:
            # Only retry on an employee_number collision; re-raise anything else.
            if "employee_number" not in str(exc).lower():
                raise
            last_error = exc
            continue

    raise IntegrityError(
        f"Unable to allocate a unique employee number after {_MAX_RETRIES} attempts."
    ) from last_error
