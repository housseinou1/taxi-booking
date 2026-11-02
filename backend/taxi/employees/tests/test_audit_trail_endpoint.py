"""Phase 6 tests: per-employee audit trail endpoint (Administrator tier).

Verifies the read-only audit trail returns the employee's own lifecycle events
plus their ID-card events, that it is restricted to the Administrator tier, that
it never leaks another employee's events, and that no sensitive fields (DOB,
QR/card tokens) are ever present.
"""

import datetime

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient

from employees.models import CardStatus
from employees.permissions import (
    ADMINISTRATOR_GROUP,
    HR_MANAGER_GROUP,
    HR_STAFF_GROUP,
    ensure_employee_groups,
)
from employees.services import card_service
from employees.services.number_service import create_staff_employee

User = get_user_model()


def _user(email, group=None, is_staff=True):
    user = User.objects.create_user(email=email, password="pw", is_staff=is_staff)
    if group:
        g, _ = Group.objects.get_or_create(name=group)
        user.groups.add(g)
    return user


class EmployeeAuditTrailTests(TestCase):
    def setUp(self):
        ensure_employee_groups()
        self.client = APIClient()
        self.staff = _user("audit-staff@test.local", HR_STAFF_GROUP)
        self.manager = _user("audit-manager@test.local", HR_MANAGER_GROUP)
        self.admin = _user("audit-admin@test.local", ADMINISTRATOR_GROUP)
        self.employee = create_staff_employee(
            full_name="Audit Subject",
            date_of_birth=datetime.date(1992, 4, 4),
            department="Operations",
            job_title="Dispatcher",
        )
        self.url = f"/employees/{self.employee.employee_number}/audit/"

    def _register_and_issue(self):
        """Produce employee + card audit events through the API."""
        self.client.force_authenticate(user=self.admin)
        created = self.client.post(
            "/employees/",
            {
                "full_name": "Second Hire",
                "date_of_birth": "1993-06-06",
                "department": "Finance",
            },
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.content)
        number = created.json()["employee_number"]
        issued = self.client.post(f"/employees/{number}/cards/issue/")
        self.assertIn(issued.status_code, (200, 201), issued.content)
        return number, issued.json()["card_number"]

    def test_administrator_sees_employee_and_card_events(self):
        number, card_number = self._register_and_issue()

        res = self.client.get(f"/employees/{number}/audit/")
        self.assertEqual(res.status_code, 200)
        events = {row["event"] for row in res.json()["results"]}
        self.assertIn("employee.register", events)
        self.assertIn("card.issue", events)

        entity_types = {row["entity_type"] for row in res.json()["results"]}
        self.assertEqual(entity_types, {"employee", "id_card"})
        self.assertEqual(res.json()["count"], len(res.json()["results"]))
        self.assertIn(card_number, {row["entity_id"] for row in res.json()["results"]})

    def test_hr_staff_and_manager_are_forbidden(self):
        for user in (self.staff, self.manager):
            self.client.force_authenticate(user=user)
            self.assertEqual(self.client.get(self.url).status_code, 403)

    def test_never_returns_another_employees_events(self):
        self._register_and_issue()
        self.client.force_authenticate(user=self.admin)

        res = self.client.get(self.url)
        self.assertEqual(res.status_code, 200)
        # Only this employee's number / cards appear.
        for row in res.json()["results"]:
            if row["entity_type"] == "employee":
                self.assertEqual(row["entity_id"], self.employee.employee_number)
            else:
                self.assertEqual(row["entity_id"], "")

    def test_response_never_contains_sensitive_fields(self):
        number, _card = self._register_and_issue()
        self.client.force_authenticate(user=self.admin)

        body = self.client.get(f"/employees/{number}/audit/").content.decode()
        for forbidden in ("date_of_birth", "1993-06-06", "qr", "token", "photo_key"):
            self.assertNotIn(forbidden, body)

    def test_limit_is_clamped(self):
        self.client.force_authenticate(user=self.admin)
        # Prime some events, then ask for a tiny limit.
        self.client.get(f"/employees/{self.employee.employee_number}/")
        res = self.client.get(self.url, {"limit": "1"})
        self.assertEqual(res.status_code, 200)
        self.assertLessEqual(len(res.json()["results"]), 1)

    def test_audit_requires_authentication(self):
        self.assertEqual(self.client.get(self.url).status_code, 401)

    def test_card_status_change_is_recorded_and_visible(self):
        number, card_number = self._register_and_issue()
        card = card_service.get_card_by_number(card_number) if hasattr(
            card_service, "get_card_by_number"
        ) else None
        if card is None:
            from employees.models import EmployeeIDCard

            card = EmployeeIDCard.objects.get(card_number=card_number)
        self.assertEqual(card.status, CardStatus.VALID)

        self.client.post(f"/employees/{number}/cards/{card.pk}/deactivate/")
        res = self.client.get(f"/employees/{number}/audit/")
        events = {row["event"] for row in res.json()["results"]}
        self.assertIn("card.deactivate", events)
