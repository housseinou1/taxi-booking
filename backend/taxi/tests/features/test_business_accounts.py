"""Tests for Yala Business Accounts (Phase 23)."""

from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient

from features.models import CorporateAccount, CorporateEmployee

User = get_user_model()


class BusinessAccountsTests(TestCase):
    def setUp(self):
        self.qr_patch = patch("taxi.drivers.tasks.generate_qr_code_task.delay")
        self.qr_patch.start()

        self.client = APIClient()
        Group.objects.get_or_create(name="CEO")

        self.staff = User.objects.create_user(
            email="biz-ceo@test.local",
            password="Pass123!",
            is_staff=True,
        )
        self.staff.groups.add(Group.objects.get(name="CEO"))

        self.rider = User.objects.create_user(
            email="biz-rider@test.local",
            password="Pass123!",
            user_type="rider",
            rider_status="approved",
        )

    def tearDown(self):
        self.qr_patch.stop()

    def test_company_registration_creates_pending_account(self):
        response = self.client.post(
            "/features/corporate/register/",
            {
                "company_name": "Acme Corp",
                "commercial_registration": "RC-12345",
                "contact_person": "Jane Doe",
                "contact_email": "jane@acme.test",
                "contact_phone": "+222000000",
                "address": "Nouakchott",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        account = CorporateAccount.objects.get(company_name="Acme Corp")
        self.assertEqual(account.status, "pending")
        self.assertFalse(account.is_active)

    def test_executive_can_approve_company(self):
        account = CorporateAccount.objects.create(
            company_name="Beta LLC",
            contact_person="Admin",
            contact_email="admin@beta.test",
            contact_phone="+222111111",
            status="pending",
            is_active=False,
        )
        self.client.force_authenticate(self.staff)
        response = self.client.post(
            f"/operations/business/corporate/ride_corporate/{account.id}/action/",
            {"action": "approve"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        account.refresh_from_db()
        self.assertEqual(account.status, "approved")
        self.assertTrue(account.is_active)

    def test_corporate_employee_can_view_account(self):
        account = CorporateAccount.objects.create(
            company_name="Gamma Inc",
            contact_person="Ops",
            contact_email="ops@gamma.test",
            contact_phone="+222222222",
            status="approved",
            is_active=True,
        )
        CorporateEmployee.objects.create(
            account=account,
            user=self.rider,
            monthly_limit=Decimal("5000"),
            role="employee",
            is_active=True,
        )
        self.client.force_authenticate(self.rider)
        response = self.client.get("/features/corporate/me/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["company"], "Gamma Inc")
        self.assertTrue(response.json()["can_book_corporate"])
