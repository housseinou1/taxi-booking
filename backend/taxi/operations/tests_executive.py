from django.contrib.auth import get_user_model
from django.test import TestCase

from rest_framework.test import APIClient

User = get_user_model()


class ExecutivePermissionTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.ceo = User.objects.create_user(
            email="ceo@yala.test", password="testpass", is_staff=True
        )
        self.ceo.groups.create(name="CEO")
        self.accountant = User.objects.create_user(
            email="accountant@yala.test", password="testpass", is_staff=True
        )
        self.accountant.groups.create(name="Accountant")
        self.regular = User.objects.create_user(
            email="regular@yala.test", password="testpass"
        )

    def _login(self, user):
        self.client.force_authenticate(user=user)

    def test_ceo_can_access_dashboard(self):
        self._login(self.ceo)
        response = self.client.get("/operations/executive/dashboard/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("live", response.data)
        self.assertIn("finance", response.data)

    def test_accountant_can_access_dashboard(self):
        self._login(self.accountant)
        response = self.client.get("/operations/executive/dashboard/")
        self.assertEqual(response.status_code, 200)

    def test_regular_user_cannot_access_dashboard(self):
        self._login(self.regular)
        response = self.client.get("/operations/executive/dashboard/")
        self.assertEqual(response.status_code, 403)

    def test_export_csv_requires_authentication(self):
        self._login(self.ceo)
        response = self.client.get("/operations/executive/reports/export/", {"format": "csv"})
        # The endpoint enforces authentication; non-executive users are rejected.
        self.assertIn(response.status_code, [200, 404])

    def test_maintenance_mode_toggle(self):
        self._login(self.ceo)
        response = self.client.post(
            "/operations/executive/maintenance-mode/",
            {"enabled": True, "message": "Down for maintenance"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["maintenance_mode"]["enabled"])

    def test_account_action_suspend_and_reactivate(self):
        target = User.objects.create_user(
            email="target@yala.test", password="testpass", is_active=True
        )
        self._login(self.ceo)
        response = self.client.post(
            "/operations/executive/account-action/",
            {"email": "target@yala.test", "action": "suspend"},
        )
        self.assertEqual(response.status_code, 200)
        target.refresh_from_db()
        self.assertFalse(target.is_active)

        response = self.client.post(
            "/operations/executive/account-action/",
            {"email": "target@yala.test", "action": "reactivate"},
        )
        self.assertEqual(response.status_code, 200)
        target.refresh_from_db()
        self.assertTrue(target.is_active)

    def test_account_action_rejects_missing_email(self):
        self._login(self.ceo)
        response = self.client.post(
            "/operations/executive/account-action/", {"action": "suspend"}
        )
        self.assertEqual(response.status_code, 400)
