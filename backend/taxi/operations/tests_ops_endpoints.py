"""Tests for the endpoints added to close Admin Dashboard 404s.

Covers the two route groups that previously had a service/model but no view:
ops shift handovers (`/operations/center/handovers/`) and the BI growth center
(`/operations/bi/growth-center/`).
"""

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient

from operations.models import OpsShiftHandover

User = get_user_model()

HANDOVERS = "/operations/center/handovers/"
GROWTH_CENTER = "/operations/bi/growth-center/"


class OpsEndpointTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(
            email="ops.handover@yala.test", password="x", user_type="admin", is_staff=True
        )
        group, _ = Group.objects.get_or_create(name="Operations Manager")
        self.admin.groups.add(group)
        self.client.force_authenticate(user=self.admin)


class OpsHandoverTests(OpsEndpointTestCase):
    def test_list_returns_handovers_envelope(self):
        """The frontend reads `data.handovers`, so the shape is part of the contract."""
        response = self.client.get(HANDOVERS)
        self.assertEqual(response.status_code, 200)
        self.assertIn("handovers", response.data)
        self.assertEqual(response.data["handovers"], [])

    def test_create_persists_submitted_handover(self):
        response = self.client.post(
            HANDOVERS,
            {"important_notes": "Night shift notes", "pending_escalations": "1 refund"},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(OpsShiftHandover.objects.count(), 1)

        row = OpsShiftHandover.objects.get()
        self.assertEqual(row.status, "submitted")
        self.assertEqual(row.outgoing_operator_id, self.admin.id)
        self.assertEqual(row.important_notes, "Night shift notes")
        self.assertIsNotNone(row.submitted_at)

    def test_created_handover_appears_in_list(self):
        self.client.post(HANDOVERS, {"important_notes": "handover A"}, format="json")
        response = self.client.get(HANDOVERS, {"status": "submitted"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["handovers"]), 1)
        self.assertEqual(response.data["handovers"][0]["important_notes"], "handover A")

    def test_acknowledge_sets_incoming_operator(self):
        self.client.post(HANDOVERS, {"important_notes": "ack me"}, format="json")
        handover = OpsShiftHandover.objects.get()

        response = self.client.post(
            f"{HANDOVERS}{handover.id}/acknowledge/",
            {"follow_up_notes": "received"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)

        handover.refresh_from_db()
        self.assertEqual(handover.status, "acknowledged")
        self.assertEqual(handover.incoming_operator_id, self.admin.id)
        self.assertEqual(handover.follow_up_notes, "received")
        self.assertIsNotNone(handover.acknowledged_at)

    def test_acknowledge_unknown_handover_is_404(self):
        response = self.client.post(f"{HANDOVERS}999999/acknowledge/", {}, format="json")
        self.assertEqual(response.status_code, 404)

    def test_anonymous_cannot_read_handovers(self):
        anon = APIClient()
        response = anon.get(HANDOVERS)
        self.assertIn(response.status_code, (401, 403))

    def test_any_staff_member_can_read_handovers(self):
        """`IsExecutiveStaff` -> `can_view_executive`, which is True for ANY
        `is_staff` user (see operations/executive_permissions.py:52). These
        endpoints therefore match their ops-center siblings rather than being
        stricter than them. Anonymous access is still refused (test above)."""
        staff = User.objects.create_user(
            email="plain.staff@yala.test", password="x", user_type="admin", is_staff=True
        )
        client = APIClient()
        client.force_authenticate(user=staff)
        response = client.get(HANDOVERS)
        self.assertEqual(response.status_code, 200)

    def test_non_staff_authenticated_user_cannot_read_handovers(self):
        rider = User.objects.create_user(
            email="rider@yala.test", password="x", user_type="rider"
        )
        client = APIClient()
        client.force_authenticate(user=rider)
        response = client.get(HANDOVERS)
        self.assertIn(response.status_code, (401, 403))


class BiGrowthCenterTests(OpsEndpointTestCase):
    def test_growth_center_returns_payload(self):
        """Previously a hard 404 — biGrowthApi has always called this route."""
        response = self.client.get(GROWTH_CENTER)
        self.assertEqual(response.status_code, 200)
        self.assertIsInstance(response.data, dict)
        # build_launch_growth_center assembles these slices.
        for key in ("driver_recruitment", "rider_growth", "promotions", "partnerships"):
            self.assertIn(key, response.data)

    def test_anonymous_cannot_read_growth_center(self):
        anon = APIClient()
        response = anon.get(GROWTH_CENTER)
        self.assertIn(response.status_code, (401, 403))
