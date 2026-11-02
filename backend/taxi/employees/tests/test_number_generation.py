"""Phase 1 tests: permanent employee-number generation + model foundation.

Runs against an isolated pytest-django test database; no dev/prod data touched.
"""

import datetime

from django.db import IntegrityError, connection
from django.test import TestCase
from django.utils import timezone

from employees.models import (
    CardStatus,
    EmployeeIDCard,
    EmployeeNumberCounter,
    EmploymentStatus,
    StaffEmployee,
    format_employee_number,
)
from employees.services.number_service import (
    allocate_employee_number,
    create_staff_employee,
)


class EmployeeNumberFormatTests(TestCase):
    def test_first_employee_number(self):
        self.assertEqual(format_employee_number(1), "YAM110001LAR")

    def test_sequential_format(self):
        self.assertEqual(format_employee_number(2), "YAM110002LAR")
        self.assertEqual(format_employee_number(3), "YAM110003LAR")
        self.assertEqual(format_employee_number(4), "YAM110004LAR")

    def test_prefix_and_suffix_fixed(self):
        n = format_employee_number(42)
        self.assertTrue(n.startswith("YAM11"))
        self.assertTrue(n.endswith("LAR"))
        self.assertEqual(n, "YAM110042LAR")

    def test_numbering_beyond_9999_widens_without_reset(self):
        self.assertEqual(format_employee_number(9999), "YAM119999LAR")
        self.assertEqual(format_employee_number(10000), "YAM1110000LAR")
        self.assertEqual(format_employee_number(123456), "YAM11123456LAR")

    def test_invalid_sequence_rejected(self):
        with self.assertRaises(ValueError):
            format_employee_number(0)


class EmployeeNumberAllocationTests(TestCase):
    def test_first_allocation_is_0001(self):
        self.assertEqual(allocate_employee_number(), "YAM110001LAR")

    def test_sequential_allocation(self):
        self.assertEqual(allocate_employee_number(), "YAM110001LAR")
        self.assertEqual(allocate_employee_number(), "YAM110002LAR")
        self.assertEqual(allocate_employee_number(), "YAM110003LAR")

    def test_counter_row_tracks_sequence(self):
        allocate_employee_number()
        allocate_employee_number()
        counter = EmployeeNumberCounter.objects.get(pk=1)
        self.assertEqual(counter.current_value, 2)

    def test_create_assigns_sequential_numbers(self):
        e1 = create_staff_employee(full_name="Aminata Ba")
        e2 = create_staff_employee(full_name="Oumar Sy")
        e3 = create_staff_employee(full_name="Mariam Diallo")
        self.assertEqual(e1.employee_number, "YAM110001LAR")
        self.assertEqual(e2.employee_number, "YAM110002LAR")
        self.assertEqual(e3.employee_number, "YAM110003LAR")

    def test_caller_cannot_override_employee_number(self):
        e = create_staff_employee(full_name="Fatimata Mint", employee_number="HACK0001")
        self.assertEqual(e.employee_number, "YAM110001LAR")

    def test_employee_number_unique_constraint(self):
        StaffEmployee.objects.create(employee_number="YAM110001LAR", full_name="A")
        with self.assertRaises(IntegrityError):
            StaffEmployee.objects.create(employee_number="YAM110001LAR", full_name="B")


class EmployeeNumberPermanenceTests(TestCase):
    def test_number_preserved_on_status_change(self):
        e = create_staff_employee(full_name="Cheikh Sow")
        original = e.employee_number
        e.employment_status = EmploymentStatus.TERMINATED
        e.save()
        e.refresh_from_db()
        self.assertEqual(e.employee_number, original)

    def test_number_preserved_across_card_replacement(self):
        e = create_staff_employee(full_name="Moussa Kane")
        original = e.employee_number
        card1 = EmployeeIDCard.objects.create(employee=e, card_number="CARD-0001")
        # Simulate a replacement card issuance (lifecycle logic is a later phase;
        # here we only assert the employee number is untouched).
        card2 = EmployeeIDCard.objects.create(employee=e, card_number="CARD-0002")
        card1.status = CardStatus.REPLACED
        card1.replaced_by = card2
        card1.save()
        e.refresh_from_db()
        self.assertEqual(e.employee_number, original)
        self.assertNotEqual(card1.card_number, card2.card_number)
        self.assertNotEqual(card1.qr_uuid, card2.qr_uuid)

    def test_sequence_not_reused_after_delete(self):
        e1 = create_staff_employee(full_name="One")
        e2 = create_staff_employee(full_name="Two")
        self.assertEqual(e2.employee_number, "YAM110002LAR")
        e2.delete()
        e3 = create_staff_employee(full_name="Three")
        # Must advance to 0003, never reuse 0002.
        self.assertEqual(e3.employee_number, "YAM110003LAR")


class ModelValidationTests(TestCase):
    def test_employment_status_default_active(self):
        e = create_staff_employee(full_name="Default Status")
        self.assertEqual(e.employment_status, EmploymentStatus.ACTIVE)

    def test_optional_user_link_nullable(self):
        e = create_staff_employee(full_name="No Account")
        self.assertIsNone(e.user)

    def test_photo_key_metadata_only_defaults_blank(self):
        e = create_staff_employee(full_name="No Photo")
        self.assertEqual(e.photo_key, "")

    def test_card_defaults(self):
        e = create_staff_employee(full_name="With Card")
        card = EmployeeIDCard.objects.create(employee=e, card_number="CARD-X1")
        self.assertEqual(card.status, CardStatus.VALID)
        self.assertIsNotNone(card.qr_uuid)

    def test_card_number_unique(self):
        e = create_staff_employee(full_name="Dup Card")
        EmployeeIDCard.objects.create(employee=e, card_number="CARD-DUP")
        with self.assertRaises(IntegrityError):
            EmployeeIDCard.objects.create(employee=e, card_number="CARD-DUP")

    def test_str_representations(self):
        e = create_staff_employee(full_name="Str Test")
        self.assertIn("YAM110001LAR", str(e))
        card = EmployeeIDCard.objects.create(employee=e, card_number="CARD-STR")
        self.assertIn("CARD-STR", str(card))


class ConcurrencySafetyTests(TestCase):
    """Verify the allocator's concurrency safeguards (uniqueness + no reuse).

    Note on backend: SQLite serializes all writes with a single database-level
    lock and provides no row locks, so spinning real OS threads against it tests
    SQLite's write throughput, not the generator. We therefore verify the two
    guarantees the service actually provides and that production (PostgreSQL)
    relies on:

      1. The counter + UNIQUE constraint produce a strictly increasing,
         gap-free, never-reused sequence across many allocations.
      2. The UNIQUE-constraint + retry path recovers correctly when an
         allocated number collides with an already-persisted one (the exact
         situation a lost ``select_for_update`` race would create on a backend
         without row locks).

    On PostgreSQL the ``select_for_update()`` in ``_next_sequence`` additionally
    serializes concurrent allocators at the row level; see number_service.py.
    """

    def test_many_sequential_allocations_are_unique_and_gapless(self):
        count = 50
        numbers = [create_staff_employee(full_name=f"Emp {i}").employee_number for i in range(count)]
        # All unique.
        self.assertEqual(len(set(numbers)), count)
        # Exactly the contiguous set 0001..0050 — no gaps, no reuse.
        expected = [format_employee_number(i) for i in range(1, count + 1)]
        self.assertEqual(numbers, expected)

    def test_retry_recovers_from_a_colliding_allocation(self):
        """Simulate a lost race: the next number is already taken by another
        writer. The service must detect the IntegrityError and retry to the
        following free number rather than fail or reuse."""
        # Pre-create the employee that will take YAM110001LAR, then bump the
        # counter back to 0 so the next allocation re-attempts 0001 and collides.
        StaffEmployee.objects.create(employee_number="YAM110001LAR", full_name="Pre-existing")
        counter, _ = EmployeeNumberCounter.objects.get_or_create(pk=1)
        counter.current_value = 0
        counter.save(update_fields=["current_value"])

        emp = create_staff_employee(full_name="Racer")
        # 0001 was taken; retry must land on 0002, never reuse 0001.
        self.assertEqual(emp.employee_number, "YAM110002LAR")
        self.assertEqual(StaffEmployee.objects.filter(employee_number="YAM110001LAR").count(), 1)


class MigrationIntegrityTests(TestCase):
    def test_tables_exist(self):
        table_names = set(connection.introspection.table_names())
        for model in (StaffEmployee, EmployeeIDCard, EmployeeNumberCounter):
            self.assertIn(model._meta.db_table, table_names)


class AnnualExpirationTests(TestCase):
    """One-year calendar expiration + validity gating (Phase 1 scope).

    The renewal interface, notifications, QR endpoint, and PDF are NOT part of
    Phase 1; here we only verify the field schema, the one-calendar-year expiry
    calculation (incl. Feb 29), and that is_valid()/is_expired() gate correctly.
    """

    def _emp(self):
        return create_staff_employee(full_name="Expiry Test")

    def test_expires_exactly_one_calendar_year_after_issue(self):
        # Matches the requirement example: issued 15/10/2026 -> 15/10/2027.
        issued = timezone.make_aware(datetime.datetime(2026, 10, 15, 9, 0))
        card = EmployeeIDCard.objects.create(
            employee=self._emp(), card_number="EXP-1", issued_at=issued
        )
        self.assertEqual(card.expires_at, timezone.make_aware(datetime.datetime(2027, 10, 15, 9, 0)))

    def test_renewed_card_window_follows_example(self):
        # Renewed card: issued 15/10/2027 -> 15/10/2028.
        issued = timezone.make_aware(datetime.datetime(2027, 10, 15, 9, 0))
        card = EmployeeIDCard.objects.create(
            employee=self._emp(), card_number="EXP-2", issued_at=issued
        )
        self.assertEqual(card.expires_at, timezone.make_aware(datetime.datetime(2028, 10, 15, 9, 0)))

    def test_leap_day_issue_expires_feb_28_next_year(self):
        # 29/02/2028 (leap) -> 28/02/2029 (2029 is not a leap year).
        issued = timezone.make_aware(datetime.datetime(2028, 2, 29, 12, 0))
        card = EmployeeIDCard.objects.create(
            employee=self._emp(), card_number="EXP-LEAP", issued_at=issued
        )
        self.assertEqual(card.expires_at, timezone.make_aware(datetime.datetime(2029, 2, 28, 12, 0)))

    def test_add_calendar_year_helper_date_and_datetime(self):
        from employees.models import add_calendar_year

        self.assertEqual(add_calendar_year(datetime.date(2026, 10, 15)), datetime.date(2027, 10, 15))
        self.assertEqual(add_calendar_year(datetime.date(2028, 2, 29)), datetime.date(2029, 2, 28))

    def test_explicit_expires_at_not_overwritten(self):
        issued = timezone.make_aware(datetime.datetime(2026, 10, 15, 9, 0))
        explicit = timezone.make_aware(datetime.datetime(2026, 12, 31, 0, 0))
        card = EmployeeIDCard.objects.create(
            employee=self._emp(), card_number="EXP-X", issued_at=issued, expires_at=explicit
        )
        self.assertEqual(card.expires_at, explicit)

    def test_is_expired_before_and_after_expiry(self):
        issued = timezone.make_aware(datetime.datetime(2026, 10, 15, 9, 0))
        card = EmployeeIDCard.objects.create(
            employee=self._emp(), card_number="EXP-3", issued_at=issued
        )
        before = timezone.make_aware(datetime.datetime(2027, 10, 14, 9, 0))
        after = timezone.make_aware(datetime.datetime(2027, 10, 16, 9, 0))
        self.assertFalse(card.is_expired(now=before))
        self.assertTrue(card.is_expired(now=after))

    def test_valid_card_within_window(self):
        issued = timezone.make_aware(datetime.datetime(2026, 10, 15, 9, 0))
        card = EmployeeIDCard.objects.create(
            employee=self._emp(), card_number="EXP-4", issued_at=issued, status=CardStatus.VALID
        )
        within = timezone.make_aware(datetime.datetime(2027, 1, 1, 9, 0))
        self.assertTrue(card.is_valid(now=within))

    def test_expired_card_not_valid(self):
        issued = timezone.make_aware(datetime.datetime(2026, 10, 15, 9, 0))
        card = EmployeeIDCard.objects.create(
            employee=self._emp(), card_number="EXP-5", issued_at=issued, status=CardStatus.VALID
        )
        after = timezone.make_aware(datetime.datetime(2027, 10, 16, 9, 0))
        self.assertFalse(card.is_valid(now=after))

    def test_revoked_replaced_deactivated_never_valid(self):
        issued = timezone.make_aware(datetime.datetime(2026, 10, 15, 9, 0))
        within = timezone.make_aware(datetime.datetime(2027, 1, 1, 9, 0))
        for i, bad_status in enumerate(
            [CardStatus.REVOKED, CardStatus.REPLACED, CardStatus.DEACTIVATED, CardStatus.EXPIRED]
        ):
            card = EmployeeIDCard.objects.create(
                employee=self._emp(),
                card_number=f"EXP-BAD-{i}",
                issued_at=issued,
                status=bad_status,
            )
            self.assertFalse(card.is_valid(now=within), f"{bad_status} must never be valid")

    def test_renewal_fields_present_and_default(self):
        card = EmployeeIDCard.objects.create(employee=self._emp(), card_number="EXP-REN")
        self.assertEqual(card.renewal_count, 0)
        self.assertIsNone(card.renewed_at)
        self.assertIsNone(card.previous_card)

    def test_renewal_preserves_employee_number_and_links_previous(self):
        emp = self._emp()
        original_number = emp.employee_number
        issued1 = timezone.make_aware(datetime.datetime(2026, 10, 15, 9, 0))
        card1 = EmployeeIDCard.objects.create(
            employee=emp, card_number="REN-1", issued_at=issued1
        )
        # Simulate a renewal (lifecycle service is a later phase; here we assert
        # the schema supports it and the employee number is untouched).
        issued2 = timezone.make_aware(datetime.datetime(2027, 10, 15, 9, 0))
        card2 = EmployeeIDCard.objects.create(
            employee=emp,
            card_number="REN-2",
            issued_at=issued2,
            renewed_at=issued2,
            renewal_count=card1.renewal_count + 1,
            previous_card=card1,
        )
        card1.status = CardStatus.REPLACED
        card1.replaced_by = card2
        card1.save()

        emp.refresh_from_db()
        self.assertEqual(emp.employee_number, original_number)  # permanent
        self.assertNotEqual(card1.card_number, card2.card_number)  # new physical id
        self.assertNotEqual(card1.qr_uuid, card2.qr_uuid)  # new QR handle
        self.assertEqual(card2.previous_card, card1)
        self.assertEqual(card2.expires_at, timezone.make_aware(datetime.datetime(2028, 10, 15, 9, 0)))
        # Old card is invalidated once replaced.
        self.assertFalse(card1.is_valid(now=issued2))
