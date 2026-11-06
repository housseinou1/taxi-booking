"""Phase 2 tests: HR RBAC, admin-shell integration, and audit logging.

Isolated pytest-django test DB; no dev/prod data touched. No frontend, webcam,
PDF, QR, or notifications are implemented or exercised here.
"""

import datetime

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import RequestFactory, TestCase
from django.utils import timezone

from employees.models import CardStatus, EmployeeIDCard
from employees.permissions import (
    ADMINISTRATOR_GROUP,
    HR_MANAGER_GROUP,
    HR_STAFF_GROUP,
    IsEmployeeAdministrator,
    IsHrManager,
    IsHrStaff,
    ensure_employee_groups,
    is_employee_admin,
    is_hr_manager,
    is_hr_staff,
)
from employees.services.audit import (
    ENTITY_EMPLOYEE,
    ENTITY_ID_CARD,
    log_employee_event,
)
from employees.services.number_service import create_staff_employee
from security.models import AuditLog

User = get_user_model()


def _staff_user(email, group_name=None):
    user = User.objects.create_user(email=email, password="testpass123", is_staff=True)
    if group_name:
        group, _ = Group.objects.get_or_create(name=group_name)
        user.groups.add(group)
    return user


class EmployeeGroupProvisioningTests(TestCase):
    def test_ensure_groups_idempotent(self):
        first = ensure_employee_groups()
        self.assertEqual(set(first), {HR_STAFF_GROUP, HR_MANAGER_GROUP, ADMINISTRATOR_GROUP})
        self.assertTrue(all(first.values()))  # all created first time
        second = ensure_employee_groups()
        self.assertFalse(any(second.values()))  # none re-created


class HrRolePredicateTests(TestCase):
    def setUp(self):
        ensure_employee_groups()
        self.staff = _staff_user("hrstaff@test.local", HR_STAFF_GROUP)
        self.manager = _staff_user("hrmanager@test.local", HR_MANAGER_GROUP)
        self.admin = _staff_user("empadmin@test.local", ADMINISTRATOR_GROUP)
        self.ceo = _staff_user("ceo@test.local", "CEO")
        self.superuser = User.objects.create_superuser(
            email="root@test.local", password="testpass123"
        )
        self.outsider = _staff_user("marketing@test.local", "Marketing")
        self.anon = User.objects.create_user(
            email="rider@test.local", password="testpass123", is_staff=False
        )

    def test_hr_staff_tier(self):
        for u in (self.staff, self.manager, self.admin, self.ceo, self.superuser):
            self.assertTrue(is_hr_staff(u), u.email)
        for u in (self.outsider, self.anon):
            self.assertFalse(is_hr_staff(u), u.email)

    def test_hr_manager_tier(self):
        # Manager and above; plain HR Staff must NOT have manager rights.
        for u in (self.manager, self.admin, self.ceo, self.superuser):
            self.assertTrue(is_hr_manager(u), u.email)
        for u in (self.staff, self.outsider, self.anon):
            self.assertFalse(is_hr_manager(u), u.email)

    def test_administrator_tier(self):
        # Administrator/CEO/superuser; HR Staff and Manager must NOT be admins.
        for u in (self.admin, self.ceo, self.superuser):
            self.assertTrue(is_employee_admin(u), u.email)
        for u in (self.staff, self.manager, self.outsider, self.anon):
            self.assertFalse(is_employee_admin(u), u.email)

    def test_non_staff_group_member_denied(self):
        # A non-staff user who somehow holds the group is still denied (the
        # user_in_groups helper requires is_staff).
        u = User.objects.create_user(email="x@test.local", password="p", is_staff=False)
        g, _ = Group.objects.get_or_create(name=HR_STAFF_GROUP)
        u.groups.add(g)
        self.assertFalse(is_hr_staff(u))


class DrfPermissionClassTests(TestCase):
    def setUp(self):
        ensure_employee_groups()
        self.rf = RequestFactory()
        self.staff = _staff_user("s@test.local", HR_STAFF_GROUP)
        self.manager = _staff_user("m@test.local", HR_MANAGER_GROUP)
        self.admin = _staff_user("a@test.local", ADMINISTRATOR_GROUP)
        self.outsider = _staff_user("o@test.local", "Marketing")

    def _check(self, permission, user):
        req = self.rf.get("/employees/")
        req.user = user
        return permission().has_permission(req, view=None)

    def test_is_hr_staff_class(self):
        self.assertTrue(self._check(IsHrStaff, self.staff))
        self.assertTrue(self._check(IsHrStaff, self.manager))
        self.assertFalse(self._check(IsHrStaff, self.outsider))

    def test_is_hr_manager_class(self):
        self.assertFalse(self._check(IsHrManager, self.staff))
        self.assertTrue(self._check(IsHrManager, self.manager))
        self.assertTrue(self._check(IsHrManager, self.admin))

    def test_is_employee_administrator_class(self):
        self.assertFalse(self._check(IsEmployeeAdministrator, self.staff))
        self.assertFalse(self._check(IsEmployeeAdministrator, self.manager))
        self.assertTrue(self._check(IsEmployeeAdministrator, self.admin))


class AdminShellIntegrationTests(TestCase):
    """The employees module integrates into admin_permissions_service without
    weakening or altering existing role mappings."""

    def test_employees_module_present_for_hr_and_ceo(self):
        from operations.admin_permissions_service import MODULES_BY_ROLE, PATH_MODULE_MAP

        self.assertIn("employees", MODULES_BY_ROLE["hr"])
        self.assertIn("employees", MODULES_BY_ROLE["ceo"])
        self.assertEqual(PATH_MODULE_MAP["/admin/employees"], "employees")

    def test_legacy_hr_group_still_maps_to_driver_ops(self):
        from operations.admin_permissions_service import resolve_admin_role

        legacy_hr = _staff_user("legacyhr@test.local", "HR")
        self.assertEqual(resolve_admin_role(legacy_hr), "driver_ops")

    def test_new_hr_groups_resolve_to_hr_role(self):
        from operations.admin_permissions_service import resolve_admin_role

        ensure_employee_groups()
        staff = _staff_user("hr2@test.local", HR_STAFF_GROUP)
        self.assertEqual(resolve_admin_role(staff), "hr")

    def test_hr_can_access_employees_path_others_cannot(self):
        from operations.admin_permissions_service import can_access_admin_path

        ensure_employee_groups()
        hr = _staff_user("hr3@test.local", HR_STAFF_GROUP)
        outsider = _staff_user("mk@test.local", "Marketing")
        self.assertTrue(can_access_admin_path(hr, "/admin/employees"))
        self.assertFalse(can_access_admin_path(outsider, "/admin/employees"))

    def test_existing_role_mappings_preserved(self):
        from operations.admin_permissions_service import resolve_admin_role

        ceo = _staff_user("ceo2@test.local", "CEO")
        finance = _staff_user("fin@test.local", "Finance")
        support = _staff_user("sup@test.local", "Support")
        self.assertEqual(resolve_admin_role(ceo), "ceo")
        self.assertEqual(resolve_admin_role(finance), "finance")
        self.assertEqual(resolve_admin_role(support), "support")


class AuditLoggingTests(TestCase):
    def setUp(self):
        self.rf = RequestFactory()
        self.actor = _staff_user("auditor@test.local", HR_MANAGER_GROUP)

    def _request(self):
        req = self.rf.post("/employees/")
        req.user = self.actor
        req.META["REMOTE_ADDR"] = "203.0.113.9"
        return req

    def test_registration_event_recorded_with_required_fields(self):
        emp = create_staff_employee(full_name="Audited Emp")
        entry = log_employee_event(
            self._request(),
            event="employee.register",
            summary=f"Registered {emp.employee_number}",
            entity_type=ENTITY_EMPLOYEE,
            entity_id=emp.employee_number,
            details={"department": "Engineering"},
        )
        self.assertEqual(entry.actor, self.actor)          # authorized actor
        self.assertEqual(entry.action, "admin_action")      # action
        self.assertEqual(entry.entity_type, ENTITY_EMPLOYEE)
        self.assertEqual(entry.entity_id, emp.employee_number)  # affected record
        self.assertIsNotNone(entry.created_at)              # timestamp
        self.assertEqual(entry.ip_address, "203.0.113.9")
        self.assertEqual(entry.details["event"], "employee.register")

    def test_all_lifecycle_events_accepted(self):
        emp = create_staff_employee(full_name="Lifecycle Emp")
        events = [
            ("employee.register", ENTITY_EMPLOYEE),
            ("employee.update", ENTITY_EMPLOYEE),
            ("employee.status_change", ENTITY_EMPLOYEE),
            ("employee.record_access", ENTITY_EMPLOYEE),
            ("card.issue", ENTITY_ID_CARD),
            ("card.renew", ENTITY_ID_CARD),
            ("card.replace", ENTITY_ID_CARD),
            ("card.activate", ENTITY_ID_CARD),
            ("card.deactivate", ENTITY_ID_CARD),
            ("card.revoke", ENTITY_ID_CARD),
        ]
        for event, entity in events:
            entry = log_employee_event(
                self._request(),
                event=event,
                summary=f"{event} for {emp.employee_number}",
                entity_type=entity,
                entity_id=emp.employee_number,
            )
            self.assertEqual(entry.details["event"], event)
        self.assertEqual(AuditLog.objects.filter(action="admin_action").count(), len(events))

    def test_unknown_event_rejected(self):
        with self.assertRaises(ValueError):
            log_employee_event(
                self._request(),
                event="employee.exfiltrate",
                summary="should fail",
            )

    def test_sensitive_keys_scrubbed_from_details(self):
        emp = create_staff_employee(full_name="Sensitive Emp")
        entry = log_employee_event(
            self._request(),
            event="employee.update",
            summary="update with sensitive payload",
            entity_id=emp.employee_number,
            details={
                "password": "hunter2",
                "qr_token": "secret-token",
                "photo_bytes": b"...",
                "date_of_birth": "1990-01-01",
                "national_id_number": "ID123",
                "department": "Finance",  # non-sensitive, should remain
            },
        )
        d = entry.details
        for forbidden in ("password", "qr_token", "photo_bytes", "date_of_birth", "national_id_number"):
            self.assertNotIn(forbidden, d)
        self.assertEqual(d["department"], "Finance")
        self.assertEqual(d["event"], "employee.update")

    def test_entity_choices_available_on_auditlog(self):
        values = {c[0] for c in AuditLog.ENTITY_CHOICES}
        self.assertIn("employee", values)
        self.assertIn("id_card", values)


class AnnualExpirationEnforcementTests(TestCase):
    """Phase 1 annual-expiration policy remains intact and cannot be bypassed."""

    def test_issuance_always_gets_one_year_expiry(self):
        emp = create_staff_employee(full_name="Policy Emp")
        issued = timezone.make_aware(datetime.datetime(2026, 10, 15, 9, 0))
        card = EmployeeIDCard.objects.create(
            employee=emp, card_number="POL-1", issued_at=issued
        )
        self.assertEqual(
            card.expires_at, timezone.make_aware(datetime.datetime(2027, 10, 15, 9, 0))
        )

    def test_employee_number_preserved_through_renewal_chain(self):
        emp = create_staff_employee(full_name="Perm Emp")
        original = emp.employee_number
        issued1 = timezone.make_aware(datetime.datetime(2026, 10, 15, 9, 0))
        c1 = EmployeeIDCard.objects.create(employee=emp, card_number="PERM-1", issued_at=issued1)
        issued2 = timezone.make_aware(datetime.datetime(2027, 10, 15, 9, 0))
        c2 = EmployeeIDCard.objects.create(
            employee=emp, card_number="PERM-2", issued_at=issued2, previous_card=c1
        )
        c1.status = CardStatus.REPLACED
        c1.replaced_by = c2
        c1.save()
        emp.refresh_from_db()
        self.assertEqual(emp.employee_number, original)
        self.assertNotEqual(c1.card_number, c2.card_number)
