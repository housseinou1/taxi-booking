"""Phase 3 API + card-lifecycle tests.

Isolated pytest-django test DB. Exercises the staff-gated DRF endpoints and the
card lifecycle service through the API, covering registration, numbering,
search, updates, per-role authorization, card issuance/renewal/replacement/
activation/deactivation/revocation, annual expiration, duplicate-active-card
prevention, employee-number preservation, and audit logging.
"""

import datetime

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from employees.models import CardStatus, EmployeeIDCard, EmploymentStatus, StaffEmployee
from employees.permissions import (
    ADMINISTRATOR_GROUP,
    HR_MANAGER_GROUP,
    HR_STAFF_GROUP,
    ensure_employee_groups,
)
from employees.services import card_service
from employees.services.number_service import create_staff_employee
from security.models import AuditLog

User = get_user_model()


def _user(email, group_name=None, is_staff=True):
    u = User.objects.create_user(email=email, password="pw", is_staff=is_staff)
    if group_name:
        g, _ = Group.objects.get_or_create(name=group_name)
        u.groups.add(g)
    return u


class ApiTestBase(TestCase):
    def setUp(self):
        ensure_employee_groups()
        self.client = APIClient()
        self.hr_staff = _user("staff@test.local", HR_STAFF_GROUP)
        self.hr_manager = _user("manager@test.local", HR_MANAGER_GROUP)
        self.admin = _user("admin@test.local", ADMINISTRATOR_GROUP)
        self.outsider = _user("outsider@test.local", "Marketing")
        self.anon_client = APIClient()

    def as_(self, user):
        self.client.force_authenticate(user=user)
        return self.client


class RegistrationAndNumberingTests(ApiTestBase):
    def test_register_employee_assigns_sequential_numbers(self):
        c = self.as_(self.hr_staff)
        r1 = c.post("/employees/", {"full_name": "Aminata Ba", "department": "Eng"}, format="json")
        self.assertEqual(r1.status_code, 201, r1.content)
        self.assertEqual(r1.json()["employee_number"], "YAM110001LAR")
        r2 = c.post("/employees/", {"full_name": "Oumar Sy"}, format="json")
        self.assertEqual(r2.json()["employee_number"], "YAM110002LAR")

    def test_client_cannot_set_employee_number(self):
        c = self.as_(self.hr_staff)
        r = c.post(
            "/employees/",
            {"full_name": "Hacker", "employee_number": "HACK9999"},
            format="json",
        )
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.json()["employee_number"], "YAM110001LAR")

    def test_registration_requires_full_name(self):
        c = self.as_(self.hr_staff)
        r = c.post("/employees/", {"full_name": "  "}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_registration_audited(self):
        self.as_(self.hr_staff).post("/employees/", {"full_name": "Audited"}, format="json")
        self.assertTrue(
            AuditLog.objects.filter(action="admin_action", details__event="employee.register").exists()
        )


class SearchRetrieveUpdateTests(ApiTestBase):
    def setUp(self):
        super().setUp()
        self.e1 = create_staff_employee(full_name="Fatimata Mint", department="Finance", job_title="Analyst")
        self.e2 = create_staff_employee(full_name="Cheikh Sow", department="Engineering", job_title="Dev")

    def test_list_is_paginated(self):
        r = self.as_(self.hr_staff).get("/employees/")
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertIn("results", body)
        self.assertIn("count", body)

    def test_search_by_name_and_department(self):
        c = self.as_(self.hr_staff)
        r = c.get("/employees/?search=Fatimata")
        self.assertEqual(r.json()["count"], 1)
        r = c.get("/employees/?department=Engineering")
        self.assertEqual(r.json()["count"], 1)

    def test_retrieve_by_employee_number_and_audits_access(self):
        r = self.as_(self.hr_staff).get(f"/employees/{self.e1.employee_number}/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["employee_number"], self.e1.employee_number)
        self.assertTrue(
            AuditLog.objects.filter(details__event="employee.record_access", entity_id=self.e1.employee_number).exists()
        )

    def test_update_permitted_fields_audited(self):
        r = self.as_(self.hr_staff).patch(
            f"/employees/{self.e1.employee_number}/", {"job_title": "Senior Analyst"}, format="json"
        )
        self.assertEqual(r.status_code, 200)
        self.e1.refresh_from_db()
        self.assertEqual(self.e1.job_title, "Senior Analyst")
        self.assertTrue(AuditLog.objects.filter(details__event="employee.update").exists())

    def test_update_cannot_change_employee_number(self):
        original = self.e1.employee_number
        self.as_(self.hr_staff).patch(
            f"/employees/{self.e1.employee_number}/", {"employee_number": "YAM119999LAR"}, format="json"
        )
        self.e1.refresh_from_db()
        self.assertEqual(self.e1.employee_number, original)

    def test_delete_not_allowed(self):
        r = self.as_(self.hr_staff).delete(f"/employees/{self.e1.employee_number}/")
        self.assertIn(r.status_code, (403, 405))


class AuthorizationTests(ApiTestBase):
    def setUp(self):
        super().setUp()
        self.emp = create_staff_employee(full_name="Perm Test")

    def test_unauthenticated_denied(self):
        r = self.anon_client.get("/employees/")
        self.assertIn(r.status_code, (401, 403))

    def test_outsider_denied(self):
        r = self.as_(self.outsider).get("/employees/")
        self.assertEqual(r.status_code, 403)

    def test_hr_staff_cannot_change_status(self):
        r = self.as_(self.hr_staff).post(
            f"/employees/{self.emp.employee_number}/status/",
            {"employment_status": EmploymentStatus.SUSPENDED},
            format="json",
        )
        self.assertEqual(r.status_code, 403)

    def test_hr_manager_can_change_status(self):
        r = self.as_(self.hr_manager).post(
            f"/employees/{self.emp.employee_number}/status/",
            {"employment_status": EmploymentStatus.SUSPENDED},
            format="json",
        )
        self.assertEqual(r.status_code, 200)
        self.emp.refresh_from_db()
        self.assertEqual(self.emp.employment_status, EmploymentStatus.SUSPENDED)

    def test_hr_staff_cannot_issue_card(self):
        r = self.as_(self.hr_staff).post(f"/employees/{self.emp.employee_number}/cards/issue/")
        self.assertEqual(r.status_code, 403)

    def test_hr_staff_cannot_revoke_card(self):
        card = card_service.issue_card(self.emp)
        r = self.as_(self.hr_staff).post(
            f"/employees/{self.emp.employee_number}/cards/{card.pk}/revoke/"
        )
        self.assertEqual(r.status_code, 403)


class CardLifecycleApiTests(ApiTestBase):
    def setUp(self):
        super().setUp()
        self.emp = create_staff_employee(full_name="Card Holder")

    def test_manager_issues_card_with_one_year_expiry(self):
        r = self.as_(self.hr_manager).post(f"/employees/{self.emp.employee_number}/cards/issue/")
        self.assertEqual(r.status_code, 201, r.content)
        body = r.json()
        self.assertEqual(body["status"], CardStatus.VALID)
        issued = datetime.datetime.fromisoformat(body["issued_at"].replace("Z", "+00:00"))
        expires = datetime.datetime.fromisoformat(body["expires_at"].replace("Z", "+00:00"))
        self.assertEqual(expires.year, issued.year + 1)
        self.assertEqual((expires.month, expires.day), (issued.month, issued.day))

    def test_issue_requires_active_employee(self):
        self.emp.employment_status = EmploymentStatus.TERMINATED
        self.emp.save()
        r = self.as_(self.hr_manager).post(f"/employees/{self.emp.employee_number}/cards/issue/")
        self.assertEqual(r.status_code, 400)

    def test_no_duplicate_active_cards(self):
        c = self.as_(self.hr_manager)
        c.post(f"/employees/{self.emp.employee_number}/cards/issue/")
        c.post(f"/employees/{self.emp.employee_number}/cards/issue/")
        active = self.emp.id_cards.filter(status=CardStatus.VALID).count()
        self.assertEqual(active, 1)

    def test_renewal_new_card_old_invalidated_number_preserved(self):
        c = self.as_(self.hr_manager)
        original_number = self.emp.employee_number
        first = card_service.issue_card(self.emp)
        r = c.post(f"/employees/{self.emp.employee_number}/cards/renew/")
        self.assertEqual(r.status_code, 201)
        new_card_number = r.json()["card_number"]
        first.refresh_from_db()
        self.emp.refresh_from_db()
        self.assertEqual(first.status, CardStatus.REPLACED)
        self.assertNotEqual(first.card_number, new_card_number)
        self.assertEqual(self.emp.employee_number, original_number)  # permanent
        # Exactly one active card after renewal.
        self.assertEqual(self.emp.id_cards.filter(status=CardStatus.VALID).count(), 1)

    def test_replace_card(self):
        c = self.as_(self.hr_manager)
        card_service.issue_card(self.emp)
        r = c.post(
            f"/employees/{self.emp.employee_number}/cards/replace/",
            {"reason": "lost"},
            format="json",
        )
        self.assertEqual(r.status_code, 201)

    def test_admin_deactivate_then_activate(self):
        card = card_service.issue_card(self.emp)
        admin = self.as_(self.admin)
        rd = admin.post(f"/employees/{self.emp.employee_number}/cards/{card.pk}/deactivate/")
        self.assertEqual(rd.status_code, 200)
        card.refresh_from_db()
        self.assertEqual(card.status, CardStatus.DEACTIVATED)
        ra = admin.post(f"/employees/{self.emp.employee_number}/cards/{card.pk}/activate/")
        self.assertEqual(ra.status_code, 200)
        card.refresh_from_db()
        self.assertEqual(card.status, CardStatus.VALID)

    def test_admin_revoke_is_terminal(self):
        card = card_service.issue_card(self.emp)
        admin = self.as_(self.admin)
        rr = admin.post(f"/employees/{self.emp.employee_number}/cards/{card.pk}/revoke/")
        self.assertEqual(rr.status_code, 200)
        card.refresh_from_db()
        self.assertEqual(card.status, CardStatus.REVOKED)
        # Cannot reactivate a revoked card.
        ra = admin.post(f"/employees/{self.emp.employee_number}/cards/{card.pk}/activate/")
        self.assertEqual(ra.status_code, 400)

    def test_cannot_activate_expired_card(self):
        issued = timezone.now() - datetime.timedelta(days=400)
        card = card_service.issue_card(self.emp, issued_at=issued)
        # Deactivate so activate() is the operation under test, then it's expired.
        card_service.deactivate_card(card)
        r = self.as_(self.admin).post(
            f"/employees/{self.emp.employee_number}/cards/{card.pk}/activate/"
        )
        self.assertEqual(r.status_code, 400)

    def test_card_history_endpoint(self):
        card_service.issue_card(self.emp)
        card_service.renew_card(self.emp)
        r = self.as_(self.hr_staff).get(f"/employees/{self.emp.employee_number}/cards/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.json()), 2)

    def test_card_actions_audited(self):
        self.as_(self.hr_manager).post(f"/employees/{self.emp.employee_number}/cards/issue/")
        self.assertTrue(AuditLog.objects.filter(details__event="card.issue").exists())


class ServiceLevelSafetyTests(ApiTestBase):
    """Direct service-level checks for safety invariants not easily reached via
    the API happy path."""

    def setUp(self):
        super().setUp()
        self.emp = create_staff_employee(full_name="Safety")

    def test_cannot_renew_revoked_card(self):
        card = card_service.issue_card(self.emp)
        card_service.revoke_card(card)
        with self.assertRaises(card_service.CardLifecycleError):
            card_service.renew_card(self.emp)

    def test_card_numbers_never_reused_across_lifecycle(self):
        c1 = card_service.issue_card(self.emp)
        c2 = card_service.renew_card(self.emp)
        c3 = card_service.replace_card(self.emp)
        numbers = {c1.card_number, c2.card_number, c3.card_number}
        self.assertEqual(len(numbers), 3)
        qr = {str(c1.qr_uuid), str(c2.qr_uuid), str(c3.qr_uuid)}
        self.assertEqual(len(qr), 3)

    def test_deactivate_only_valid_card(self):
        card = card_service.issue_card(self.emp)
        card_service.revoke_card(card)
        with self.assertRaises(card_service.CardLifecycleError):
            card_service.deactivate_card(card)
