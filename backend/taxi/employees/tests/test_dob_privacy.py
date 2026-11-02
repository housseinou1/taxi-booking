"""Phase 5.5 tests: DOB field-level privacy + employee action capabilities.

Isolated pytest-django test DB. Verifies that date_of_birth is write-only for
reads unless the requester holds the administrator tier, that registration and
updates still work, that DOB never leaks into list/search output or audit logs,
and that the employee.* capabilities resolve correctly per role.
"""

import datetime

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient

from employees.permissions import (
    ADMINISTRATOR_GROUP,
    HR_MANAGER_GROUP,
    HR_STAFF_GROUP,
    can_view_employee_dob,
    employee_capabilities,
    ensure_employee_groups,
)
from employees.services.number_service import create_staff_employee
from security.models import AuditLog

User = get_user_model()


def _user(email, group=None, is_staff=True, superuser=False):
    if superuser:
        return User.objects.create_superuser(email=email, password="pw")
    u = User.objects.create_user(email=email, password="pw", is_staff=is_staff)
    if group:
        g, _ = Group.objects.get_or_create(name=group)
        u.groups.add(g)
    return u


class DobCapabilityTests(TestCase):
    def setUp(self):
        ensure_employee_groups()
        self.staff = _user("s@test.local", HR_STAFF_GROUP)
        self.manager = _user("m@test.local", HR_MANAGER_GROUP)
        self.admin = _user("a@test.local", ADMINISTRATOR_GROUP)
        self.ceo = _user("c@test.local", "CEO")
        self.superuser = _user("root@test.local", superuser=True)

    def test_only_admin_tier_can_view_dob(self):
        self.assertTrue(can_view_employee_dob(self.admin))
        self.assertTrue(can_view_employee_dob(self.ceo))
        self.assertTrue(can_view_employee_dob(self.superuser))
        self.assertFalse(can_view_employee_dob(self.staff))
        self.assertFalse(can_view_employee_dob(self.manager))

    def test_capabilities_payload_per_role(self):
        staff_caps = employee_capabilities(self.staff)
        self.assertTrue(staff_caps["employees.view"])
        self.assertTrue(staff_caps["employees.register"])
        self.assertTrue(staff_caps["employees.update"])
        self.assertFalse(staff_caps["employees.manage_cards"])
        self.assertFalse(staff_caps["employees.administer"])
        self.assertFalse(staff_caps["employees.view_dob"])

        mgr_caps = employee_capabilities(self.manager)
        self.assertTrue(mgr_caps["employees.manage_cards"])
        self.assertFalse(mgr_caps["employees.administer"])
        self.assertFalse(mgr_caps["employees.view_dob"])

        admin_caps = employee_capabilities(self.admin)
        self.assertTrue(admin_caps["employees.administer"])
        self.assertTrue(admin_caps["employees.view_dob"])


class DobSerializerExposureTests(TestCase):
    def setUp(self):
        ensure_employee_groups()
        self.client = APIClient()
        self.staff = _user("staff2@test.local", HR_STAFF_GROUP)
        self.admin = _user("admin2@test.local", ADMINISTRATOR_GROUP)
        self.emp = create_staff_employee(
            full_name="DOB Subject",
            date_of_birth=datetime.date(1990, 5, 20),
            department="Ops",
        )

    def test_dob_hidden_from_hr_staff_retrieve(self):
        self.client.force_authenticate(user=self.staff)
        r = self.client.get(f"/employees/{self.emp.employee_number}/")
        self.assertEqual(r.status_code, 200)
        self.assertNotIn("date_of_birth", r.json())

    def test_dob_visible_to_admin_retrieve(self):
        self.client.force_authenticate(user=self.admin)
        r = self.client.get(f"/employees/{self.emp.employee_number}/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json().get("date_of_birth"), "1990-05-20")

    def test_dob_hidden_in_list_for_hr_staff(self):
        self.client.force_authenticate(user=self.staff)
        r = self.client.get("/employees/")
        self.assertEqual(r.status_code, 200)
        for row in r.json()["results"]:
            self.assertNotIn("date_of_birth", row)

    def test_dob_present_in_list_for_admin(self):
        self.client.force_authenticate(user=self.admin)
        r = self.client.get("/employees/")
        self.assertEqual(r.status_code, 200)
        rows = r.json()["results"]
        self.assertTrue(any("date_of_birth" in row for row in rows))

    def test_registration_still_accepts_dob_but_does_not_echo_to_staff(self):
        self.client.force_authenticate(user=self.staff)
        r = self.client.post(
            "/employees/",
            {"full_name": "New Hire", "date_of_birth": "1988-01-02", "department": "Eng"},
            format="json",
        )
        self.assertEqual(r.status_code, 201, r.content)
        # DOB accepted (persisted) but not echoed back to a non-admin.
        self.assertNotIn("date_of_birth", r.json())
        from employees.models import StaffEmployee

        created = StaffEmployee.objects.get(employee_number=r.json()["employee_number"])
        self.assertEqual(created.date_of_birth, datetime.date(1988, 1, 2))

    def test_update_dob_still_works(self):
        self.client.force_authenticate(user=self.staff)
        r = self.client.patch(
            f"/employees/{self.emp.employee_number}/",
            {"date_of_birth": "1991-07-07"},
            format="json",
        )
        self.assertEqual(r.status_code, 200)
        self.emp.refresh_from_db()
        self.assertEqual(self.emp.date_of_birth, datetime.date(1991, 7, 7))

    def test_dob_never_in_audit_logs(self):
        self.client.force_authenticate(user=self.staff)
        self.client.post(
            "/employees/",
            {"full_name": "Audit Check", "date_of_birth": "1985-03-03"},
            format="json",
        )
        for entry in AuditLog.objects.all():
            self.assertNotIn("date_of_birth", entry.details)
            self.assertNotIn("1985-03-03", str(entry.details))
            self.assertNotIn("1985-03-03", entry.summary)


class CapabilitiesInAdminPayloadTests(TestCase):
    def setUp(self):
        ensure_employee_groups()
        self.staff = _user("payload-staff@test.local", HR_STAFF_GROUP)
        self.admin = _user("payload-admin@test.local", ADMINISTRATOR_GROUP)

    def test_build_actions_includes_employee_capabilities(self):
        from operations.admin_permissions_service import build_admin_permissions

        staff_payload = build_admin_permissions(self.staff)
        self.assertIn("employees.view", staff_payload["actions"])
        self.assertTrue(staff_payload["actions"]["employees.view"])
        self.assertFalse(staff_payload["actions"]["employees.administer"])
        self.assertFalse(staff_payload["actions"]["employees.view_dob"])

        admin_payload = build_admin_permissions(self.admin)
        self.assertTrue(admin_payload["actions"]["employees.administer"])
        self.assertTrue(admin_payload["actions"]["employees.view_dob"])
