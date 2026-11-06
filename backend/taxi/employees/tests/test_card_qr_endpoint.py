"""Phase 6 tests: authenticated ID-card QR image endpoint (HR Staff tier).

Verifies the QR PNG is served only to authorized HR users, that a card belonging
to another employee can never be rendered through a mismatched URL (IDOR), that
the QR encodes the opaque qr_uuid only (never the employee/card number), and that
access is audited.
"""

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient

from employees.permissions import HR_STAFF_GROUP, ensure_employee_groups
from employees.services import card_service
from employees.services.number_service import create_staff_employee
from security.models import AuditLog

User = get_user_model()

PNG_MAGIC = b"\x89PNG\r\n\x1a\n"


def _user(email, group=None, is_staff=True):
    user = User.objects.create_user(email=email, password="pw", is_staff=is_staff)
    if group:
        g, _ = Group.objects.get_or_create(name=group)
        user.groups.add(g)
    return user


def _body(response) -> bytes:
    """Read a streaming response body (FileResponse has no .content)."""
    body = b"".join(response.streaming_content)
    response.close()
    return body


class CardQrEndpointTests(TestCase):
    def setUp(self):
        ensure_employee_groups()
        self.client = APIClient()
        self.hr = _user("qr-hr@test.local", HR_STAFF_GROUP)
        self.outsider = _user("qr-outsider@test.local")
        self.employee = create_staff_employee(full_name="QR Subject", department="Ops")
        self.card = card_service.issue_card(self.employee, request=None)
        self.url = f"/employees/{self.employee.employee_number}/cards/{self.card.pk}/qr/"

    def test_hr_staff_receives_a_png(self):
        self.client.force_authenticate(user=self.hr)
        res = self.client.get(self.url)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res["Content-Type"], "image/png")
        self.assertEqual(res["Cache-Control"], "private, no-store")
        self.assertTrue(_body(res).startswith(PNG_MAGIC))

    def test_non_hr_staff_is_forbidden(self):
        self.client.force_authenticate(user=self.outsider)
        self.assertEqual(self.client.get(self.url).status_code, 403)

    def test_unauthenticated_is_rejected(self):
        self.assertIn(self.client.get(self.url).status_code, (401, 403))

    def test_another_employees_card_cannot_be_rendered(self):
        other = create_staff_employee(full_name="Other Subject", department="Ops")
        other_card = card_service.issue_card(other, request=None)

        self.client.force_authenticate(user=self.hr)
        res = self.client.get(
            f"/employees/{self.employee.employee_number}/cards/{other_card.pk}/qr/"
        )
        self.assertEqual(res.status_code, 400)
        self.assertFalse(res.content.startswith(PNG_MAGIC))

    def test_unknown_card_is_rejected(self):
        self.client.force_authenticate(user=self.hr)
        res = self.client.get(
            f"/employees/{self.employee.employee_number}/cards/{self.card.pk + 9999}/qr/"
        )
        self.assertEqual(res.status_code, 400)

    def test_qr_encodes_only_the_opaque_uuid(self):
        self.client.force_authenticate(user=self.hr)
        content = _body(self.client.get(self.url))
        # The PNG must not embed the employee number or the physical card number.
        self.assertNotIn(self.employee.employee_number.encode(), content)
        self.assertNotIn(self.card.card_number.encode(), content)

    def test_qr_access_is_audited(self):
        self.client.force_authenticate(user=self.hr)
        self.client.get(self.url)

        entry = AuditLog.objects.filter(
            entity_type="id_card",
            entity_id=self.card.card_number,
            details__event="employee.record_access",
        ).first()
        self.assertIsNotNone(entry)
        self.assertEqual(entry.details.get("event"), "employee.record_access")
        self.assertEqual(entry.details.get("employee_number"), self.employee.employee_number)

    def test_size_param_is_clamped_and_still_valid(self):
        self.client.force_authenticate(user=self.hr)
        big = self.client.get(self.url, {"size": "999"})
        small = self.client.get(self.url, {"size": "0"})
        self.assertEqual(big.status_code, 200)
        self.assertEqual(small.status_code, 200)
        big_body = _body(big)
        small_body = _body(small)
        self.assertTrue(big_body.startswith(PNG_MAGIC))
        self.assertTrue(small_body.startswith(PNG_MAGIC))
        # Clamped: the tiny request is smaller than the clamped-large request.
        self.assertLess(len(small_body), len(big_body))
