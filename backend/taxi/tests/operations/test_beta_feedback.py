"""Tests for in-app support and beta feedback APIs."""

from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from operations.models import BetaFeedback, LaunchAlert

User = get_user_model()


@override_settings(CELERY_TASK_ALWAYS_EAGER=True)
class BetaFeedbackTests(TestCase):
    def setUp(self):
        self.qr_patch = patch("taxi.drivers.tasks.generate_qr_code_task.delay")
        self.qr_patch.start()
        self.client = APIClient()

        self.staff = User.objects.create_user(
            email="beta-feedback-ceo@test.local",
            password="Pass123!",
            is_staff=True,
        )
        Group.objects.get_or_create(name="CEO")
        self.staff.groups.add(Group.objects.get(name="CEO"))

        self.rider = User.objects.create_user(
            email="beta-feedback-rider@test.local",
            password="Pass123!",
        )

    def tearDown(self):
        self.qr_patch.stop()

    def test_submit_feedback_requires_auth(self):
        response = self.client.post(
            "/operations/support/",
            {"description": "App crashed on login", "category": "crash", "severity": "P0"},
            format="multipart",
        )
        self.assertIn(response.status_code, (401, 403))

    def test_rider_can_submit_feedback(self):
        self.client.force_authenticate(self.rider)
        response = self.client.post(
            "/operations/support/",
            {
                "description": "Payment screen freezes",
                "category": "payment",
                "severity": "P1",
                "app_type": "rider",
                "device": "Android 14 / Pixel 7",
                "app_version": "1.2.7",
            },
            format="multipart",
        )
        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertTrue(data["reference"].startswith("BF-"))
        self.assertEqual(data["app_type"], "rider")
        self.assertEqual(data["status"], "open")

    @patch("notifications.push.send_push_to_user")
    def test_emergency_creates_launch_alert(self, mock_push):
        self.client.force_authenticate(self.rider)
        response = self.client.post(
            "/operations/support/",
            {
                "description": "Driver behavior felt unsafe",
                "category": "emergency",
                "app_type": "rider",
                "is_emergency": "true",
            },
            format="multipart",
        )
        self.assertEqual(response.status_code, 201)
        self.assertTrue(LaunchAlert.objects.filter(alert_type="sos_event").exists())
        self.assertTrue(mock_push.called)

    def test_executive_can_list_and_update(self):
        feedback = BetaFeedback.objects.create(
            reference="BF-TEST-0001",
            user=self.rider,
            app_type="rider",
            category="bug",
            severity="P1",
            description="Test bug",
            status="open",
        )

        self.client.force_authenticate(self.staff)
        listing = self.client.get("/operations/support/?queue=open")
        self.assertEqual(listing.status_code, 200)
        body = listing.json()
        self.assertIn("dashboard", body)
        self.assertEqual(body["dashboard"]["total_reports"], 1)
        self.assertEqual(len(body["reports"]), 1)

        update = self.client.patch(
            f"/operations/support/{feedback.id}/",
            {"status": "assigned", "owner_id": self.staff.id},
            format="json",
        )
        self.assertEqual(update.status_code, 200)
        self.assertEqual(update.json()["status"], "assigned")
        self.assertEqual(update.json()["owner_id"], self.staff.id)
        self.assertIsNotNone(update.json()["first_response_at"])

    def test_dashboard_metrics(self):
        BetaFeedback.objects.create(
            reference="BF-TEST-0002",
            user=self.rider,
            app_type="driver",
            category="crash",
            severity="P0",
            description="Crash",
            status="open",
        )
        BetaFeedback.objects.create(
            reference="BF-TEST-0003",
            user=self.rider,
            app_type="delivery",
            category="bug",
            severity="P2",
            description="Bug",
            status="closed",
            resolved_at=timezone.now(),
        )

        self.client.force_authenticate(self.staff)
        response = self.client.get("/operations/support/dashboard/")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["total_reports"], 2)
        self.assertEqual(data["p0_open"], 1)
        self.assertIn("average_response_hours", data)
        self.assertIn("top_categories", data)
