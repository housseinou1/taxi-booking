"""Tests for FEAT-003: rider activity (audit-log filters, delete_rider audit
entry, and the admin rider activity endpoint)."""

from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from authapp.models import DeviceSession
from security.models import AuditLog

User = get_user_model()


class AdminAuditLogFilterTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(
            email="admin@test.local", password="testpass123", is_staff=True
        )
        self.rider = User.objects.create_user(
            email="rider@test.local", password="testpass123", is_staff=False
        )

        # Three logs with distinct entity_id / created_at values.
        self.log_a = AuditLog.objects.create(
            action="admin_action", entity_type="customer", entity_id="111",
            summary="a",
        )
        self.log_b = AuditLog.objects.create(
            action="admin_action", entity_type="customer", entity_id="222",
            summary="b",
        )
        self.log_c = AuditLog.objects.create(
            action="admin_action", entity_type="customer", entity_id="111",
            summary="c",
        )
        # Push created_at back in time for date-range coverage (auto_now_add).
        AuditLog.objects.filter(pk=self.log_a.pk).update(
            created_at=timezone.now() - timedelta(days=10)
        )
        AuditLog.objects.filter(pk=self.log_c.pk).update(
            created_at=timezone.now() - timedelta(days=10)
        )

        self.url = "/security/admin/audit-logs/"

    def test_no_filters_preserves_existing_behavior(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()), 3)

    def test_entity_id_filter_narrows_results(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self.url, {"entity_id": "111"})
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data), 2)
        self.assertTrue(all(row["entity_id"] == "111" for row in data))

    def test_date_filters_narrow_results(self):
        self.client.force_authenticate(user=self.admin)
        today = date.today().isoformat()
        response = self.client.get(self.url, {"date_from": today})
        self.assertEqual(response.status_code, 200)
        data = response.json()
        # Only log_b remains today; log_a and log_c are 10 days old.
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["entity_id"], "222")

    def test_date_to_filter_narrows_results(self):
        self.client.force_authenticate(user=self.admin)
        cutoff = (date.today() - timedelta(days=5)).isoformat()
        response = self.client.get(self.url, {"date_to": cutoff})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()), 2)

    def test_malformed_date_returns_400(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self.url, {"date_from": "not-a-date"})
        self.assertEqual(response.status_code, 400)

    def test_non_admin_denied(self):
        self.client.force_authenticate(user=self.rider)
        response = self.client.get(self.url, {"entity_id": "111"})
        self.assertEqual(response.status_code, 403)


class DeleteRiderAuditTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(
            email="admin2@test.local", password="testpass123", is_staff=True
        )
        self.rider = User.objects.create_user(
            email="victim@test.local", password="testpass123", is_staff=False
        )

    def test_delete_rider_writes_audit_before_deletion(self):
        self.client.force_authenticate(user=self.admin)
        rider_id = self.rider.id
        response = self.client.delete(f"/auth/users/{rider_id}/delete-rider/")
        self.assertEqual(response.status_code, 200)

        # User actually hard-deleted.
        self.assertFalse(User.objects.filter(id=rider_id).exists())

        # Audit entry persisted (written before delete, survives it).
        log = AuditLog.objects.filter(
            action="admin_action", entity_type="customer", entity_id=str(rider_id)
        ).first()
        self.assertIsNotNone(log)
        self.assertEqual(log.details.get("email"), "victim@test.local")


class AdminRiderActivityTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(
            email="admin3@test.local", password="testpass123", is_staff=True
        )
        self.rider = User.objects.create_user(
            email="activerider@test.local", password="testpass123", is_staff=False
        )
        self.url = f"/auth/admin/rider/{self.rider.id}/activity/"

    def test_anonymous_denied(self):
        response = self.client.get(self.url)
        self.assertIn(response.status_code, (401, 403))

    def test_non_staff_rider_denied(self):
        self.client.force_authenticate(user=self.rider)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 403)

    def test_admin_gets_distinct_last_login_and_last_seen(self):
        # Seed a login timestamp and two device sessions.
        login_ts = timezone.now() - timedelta(days=2)
        self.rider.last_login = login_ts
        self.rider.save(update_fields=["last_login"])

        old = DeviceSession.objects.create(
            user=self.rider, device_id="old-device", device_name="Old Phone"
        )
        newest = DeviceSession.objects.create(
            user=self.rider, device_id="new-device", device_name="New Phone"
        )
        # last_seen_at is auto_now, so both rows can share an identical timestamp
        # within a single test instant. Force a deterministic ordering.
        DeviceSession.objects.filter(pk=old.pk).update(
            last_seen_at=timezone.now() - timedelta(hours=1)
        )
        newest.refresh_from_db()

        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        data = response.json()

        self.assertIn("last_login", data)
        self.assertIn("last_seen", data)
        self.assertIsNotNone(data["last_login"])
        self.assertIsNotNone(data["last_seen"])
        # last_seen reflects the newest DeviceSession, distinct from last_login.
        self.assertEqual(data["last_seen_device"], newest.device_name)

    def test_admin_gets_null_when_no_activity(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        # Never fabricated: null stays null.
        self.assertIsNone(data["last_login"])
        self.assertIsNone(data["last_seen"])
        self.assertIsNone(data["last_seen_device"])
