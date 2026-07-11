"""Tests for platform withdrawal accounts configuration."""

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from payments.models import PlatformWithdrawalAccounts
from security.models import AuditLog

User = get_user_model()


class PlatformWithdrawalAccountsTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(
            email="staff-withdrawal@test.local",
            password="Pass123!",
            is_staff=True,
        )
        self.superadmin = User.objects.create_superuser(
            email="super-withdrawal@test.local",
            password="Pass123!",
        )
        self.driver = User.objects.create_user(
            email="driver-withdrawal@test.local",
            password="Pass123!",
        )
        self.accounts, _ = PlatformWithdrawalAccounts.objects.update_or_create(
            key=PlatformWithdrawalAccounts.PLATFORM_KEY,
            defaults={
                "bankily_number": "22114373",
                "seddad_number": "22114373",
                "masravi_number": "22114373",
            },
        )

    def test_driver_can_read_platform_withdrawal_accounts(self):
        self.client.force_authenticate(self.driver)
        response = self.client.get("/payments/withdrawal-accounts/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["bankily_number"], "22114373")
        self.assertEqual(len(response.data["methods"]), 3)
        self.assertEqual(response.data["methods"][0]["label"], "Bankily")

    def test_admin_can_read_withdrawal_accounts(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get("/admin/withdrawal-accounts/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["bankily_number"], "22114373")
        self.assertIn("updated_at", response.data)

    def test_staff_cannot_update_withdrawal_accounts(self):
        self.client.force_authenticate(self.admin)
        response = self.client.put(
            "/admin/withdrawal-accounts/",
            {
                "bankily_number": "222",
                "seddad_number": "333",
                "masravi_number": "444",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_superadmin_update_is_audited(self):
        self.client.force_authenticate(self.superadmin)
        response = self.client.put(
            "/admin/withdrawal-accounts/",
            {
                "bankily_number": "22999999",
                "seddad_number": "22888888",
                "masravi_number": "22777777",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.accounts.refresh_from_db()
        self.assertEqual(self.accounts.bankily_number, "22999999")
        self.assertEqual(self.accounts.updated_by_id, self.superadmin.id)

        audit = AuditLog.objects.filter(
            action="admin_action",
            entity_type="payment",
            summary="Platform withdrawal accounts updated",
        ).first()
        self.assertIsNotNone(audit)
        self.assertEqual(audit.details["previous"]["bankily_number"], "22114373")
        self.assertEqual(audit.details["new"]["bankily_number"], "22999999")
        self.assertEqual(audit.details["changed_by"], self.superadmin.email)

    def test_driver_sees_updated_values(self):
        self.client.force_authenticate(self.superadmin)
        self.client.put(
            "/admin/withdrawal-accounts/",
            {
                "bankily_number": "22111111",
                "seddad_number": "22222222",
                "masravi_number": "22333333",
            },
            format="json",
        )

        self.client.force_authenticate(self.driver)
        response = self.client.get("/payments/withdrawal-accounts/")
        self.assertEqual(response.status_code, 200)
        bankily = next(item for item in response.data["methods"] if item["id"] == "bankily")
        self.assertEqual(bankily["destination"], "22111111")
        masravi = next(item for item in response.data["methods"] if item["id"] == "masravi")
        self.assertEqual(masravi["label"], "Masravi")
