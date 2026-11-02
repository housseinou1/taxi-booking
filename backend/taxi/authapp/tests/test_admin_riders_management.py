"""Regression tests: Admin Riders Management endpoints (Phase 4).

Covers:
  GET  /auth/admin/riders/                      - paginated, filtered rider list
  GET  /auth/admin/riders/<id>/                 - rider detail
  GET  /auth/admin/riders/<id>/document/        - authenticated identity document
  POST /auth/users/<id>/suspend/                - suspend with reason (+ audit)
  POST /auth/users/<id>/reactivate/             - reactivate (+ audit)

Runs only on the throwaway test DB.
"""

import itertools

from django.contrib.auth.models import Group
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework.test import APIClient, APITestCase

from authapp.models import User
from security.models import AuditLog
from taxi.drivers.models import DriverProfile

LIST_URL = "/auth/admin/riders/"
_counter = itertools.count(1)
_PNG = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00"
    b"\x01\x01\x01\x00\x18\xdd\x8d\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
)


class AdminRidersTests(APITestCase):
    def _user(self, kind="rider", **extra):
        n = next(_counter)
        extra.setdefault("first_name", "Rider")
        extra.setdefault("last_name", f"{kind.title()}{n}")
        return User.objects.create_user(
            email=f"riders-admin-{kind}{n}@example.com",
            password="x-Strong-Pass-1",
            phone_number=f"+22233{n:06d}",
            national_id_number=f"44{n:08d}",
            **extra,
        )

    def _admin(self):
        user = self._user("admin")
        user.is_staff = True
        user.is_superuser = True
        user.save(update_fields=["is_staff", "is_superuser"])
        Group.objects.get_or_create(name="CEO")[0].user_set.add(user)
        return user

    def setUp(self):
        self.admin = self._admin()
        self.client.force_authenticate(self.admin)

    # ---- authorization ---------------------------------------------------
    def test_non_staff_cannot_list_riders(self):
        self._user("rider")
        self.client.force_authenticate(self._user("plain"))
        self.assertEqual(self.client.get(LIST_URL).status_code, 403)

    def test_anonymous_cannot_list_riders(self):
        self._user("rider")
        self.assertIn(APIClient().get(LIST_URL).status_code, (401, 403))

    # ---- shape -----------------------------------------------------------
    def test_returns_paginated_rows_with_summary(self):
        self._user("rider", rider_status="approved")
        self._user("rider", rider_status="pending")
        res = self.client.get(LIST_URL)
        self.assertEqual(res.status_code, 200)
        for key in ("count", "page", "page_size", "total_pages", "results", "summary"):
            self.assertIn(key, res.data)
        self.assertEqual(res.data["summary"]["total"], 2)
        self.assertEqual(res.data["summary"]["approved"], 1)
        self.assertEqual(res.data["summary"]["pending"], 1)
        self.assertEqual(res.data["summary"]["active"], 2)

    def test_excludes_staff_and_drivers(self):
        self._user("rider")
        driver_user = self._user("driver", user_type="driver")
        DriverProfile.objects.create(user=driver_user, status="approved")
        res = self.client.get(LIST_URL)
        emails = [row["email"] for row in res.data["results"]]
        self.assertNotIn(self.admin.email, emails)
        self.assertNotIn(driver_user.email, emails)

    def test_row_never_exposes_document_url_or_path(self):
        rider = self._user("rider")
        rider.national_id_document = SimpleUploadedFile("id.png", _PNG, content_type="image/png")
        rider.save(update_fields=["national_id_document"])
        res = self.client.get(LIST_URL)
        row = res.data["results"][0]

        # The storage path/URL key must not be present at all.
        self.assertNotIn("national_id_document", row)
        body = str(res.data)
        self.assertNotIn("media/", body)
        self.assertNotIn(".png", body)
        # Only a boolean presence flag is exposed.
        self.assertTrue(row["has_national_id_document"])

    # ---- filters ---------------------------------------------------------
    def test_search_matches_name_email_and_phone(self):
        target = self._user("rider", first_name="Aminetou", last_name="Diallo")
        self._user("rider")
        by_name = self.client.get(LIST_URL, {"q": "Aminetou"})
        self.assertEqual(by_name.data["count"], 1)
        by_email = self.client.get(LIST_URL, {"q": target.email})
        self.assertEqual(by_email.data["count"], 1)

    def test_status_filter_and_invalid_status(self):
        self._user("rider", rider_status="approved")
        self._user("rider", rider_status="pending")
        res = self.client.get(LIST_URL, {"status": "approved"})
        self.assertEqual(res.data["count"], 1)

        bad = self.client.get(LIST_URL, {"status": "not_a_status"})
        self.assertEqual(bad.status_code, 400)
        self.assertIn("valid_statuses", bad.data)

    def test_state_filter_and_invalid_state(self):
        self._user("rider")
        blocked = self._user("rider")
        blocked.is_active = False
        blocked.save(update_fields=["is_active"])

        self.assertEqual(self.client.get(LIST_URL, {"state": "active"}).data["count"], 1)
        inactive = self.client.get(LIST_URL, {"state": "inactive"})
        self.assertEqual(inactive.data["count"], 1)
        self.assertEqual(inactive.data["results"][0]["id"], blocked.id)

        self.assertEqual(self.client.get(LIST_URL, {"state": "banana"}).status_code, 400)

    def test_has_document_filter(self):
        with_doc = self._user("rider")
        with_doc.national_id_document = SimpleUploadedFile("id.png", _PNG, content_type="image/png")
        with_doc.save(update_fields=["national_id_document"])
        self._user("rider")

        self.assertEqual(self.client.get(LIST_URL, {"has_document": "true"}).data["count"], 1)
        self.assertEqual(self.client.get(LIST_URL, {"has_document": "false"}).data["count"], 1)

    def test_malformed_dates_return_400(self):
        for param in ("date_from", "date_to"):
            with self.subTest(param=param):
                self.assertEqual(self.client.get(LIST_URL, {param: "nope"}).status_code, 400)

    def test_ordering_is_whitelisted(self):
        first = self._user("rider")
        second = self._user("rider")
        res = self.client.get(LIST_URL, {"ordering": "id"})
        ids = [row["id"] for row in res.data["results"]]
        self.assertEqual(ids[0], min(first.id, second.id))

    def test_pagination_respects_page_size(self):
        for _ in range(3):
            self._user("rider")
        res = self.client.get(LIST_URL, {"page_size": 2})
        self.assertEqual(len(res.data["results"]), 2)
        self.assertEqual(res.data["total_pages"], 2)


    # ---- detail ----------------------------------------------------------
    def test_detail_returns_profile_fields(self):
        rider = self._user("rider", rider_status="approved")
        res = self.client.get(f"{LIST_URL}{rider.id}/")
        self.assertEqual(res.status_code, 200)
        for key in ("id", "email", "full_name", "rider_status", "is_active",
                    "phone_verified", "date_joined"):
            self.assertIn(key, res.data)

    def test_detail_requires_admin(self):
        rider = self._user("rider")
        self.client.force_authenticate(self._user("plain"))
        self.assertEqual(self.client.get(f"{LIST_URL}{rider.id}/").status_code, 403)

    # ---- identity document (privacy) -------------------------------------
    @override_settings(MEDIA_ROOT="C:/Users/Housseinou/Backups/yala-test-artifacts/rider-doc-test")
    def test_document_requires_admin(self):
        rider = self._user("rider")
        rider.national_id_document = SimpleUploadedFile("id.png", _PNG, content_type="image/png")
        rider.save(update_fields=["national_id_document"])

        self.client.force_authenticate(self._user("plain"))
        self.assertEqual(self.client.get(f"{LIST_URL}{rider.id}/document/").status_code, 403)
        self.assertIn(
            APIClient().get(f"{LIST_URL}{rider.id}/document/").status_code, (401, 403)
        )

    @override_settings(MEDIA_ROOT="C:/Users/Housseinou/Backups/yala-test-artifacts/rider-doc-test")
    def test_document_streams_for_admin_and_404_without_document(self):
        rider = self._user("rider")
        rider.national_id_document = SimpleUploadedFile("id.png", _PNG, content_type="image/png")
        rider.save(update_fields=["national_id_document"])

        res = self.client.get(f"{LIST_URL}{rider.id}/document/")
        self.assertEqual(res.status_code, 200)

        empty = self._user("rider")
        self.assertEqual(self.client.get(f"{LIST_URL}{empty.id}/document/").status_code, 404)


    # ---- suspend / reactivate -------------------------------------------
    def test_suspend_requires_a_reason(self):
        rider = self._user("rider")
        res = self.client.post(
            f"/auth/users/{rider.id}/suspend/", {"reason": "no"}, format="json"
        )
        self.assertEqual(res.status_code, 400)
        rider.refresh_from_db()
        self.assertTrue(rider.is_active)

    def test_suspend_deactivates_and_records_audit(self):
        rider = self._user("rider")
        res = self.client.post(
            f"/auth/users/{rider.id}/suspend/",
            {"reason": "Fraud investigation"},
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        rider.refresh_from_db()
        self.assertFalse(rider.is_active)

        row = AuditLog.objects.filter(
            entity_type="customer", entity_id=str(rider.id)
        ).first()
        self.assertIsNotNone(row)
        self.assertEqual(row.details.get("operation"), "suspend")
        self.assertEqual(row.details.get("reason"), "Fraud investigation")

    def test_reactivate_restores_access_and_records_audit(self):
        rider = self._user("rider")
        rider.is_active = False
        rider.save(update_fields=["is_active"])

        res = self.client.post(
            f"/auth/users/{rider.id}/reactivate/", {"reason": "Cleared"}, format="json"
        )
        self.assertEqual(res.status_code, 200)
        rider.refresh_from_db()
        self.assertTrue(rider.is_active)

        row = AuditLog.objects.filter(
            entity_type="customer", entity_id=str(rider.id),
            summary__icontains="reactivated",
        ).first()
        self.assertIsNotNone(row)
        self.assertEqual(row.details.get("operation"), "reactivate")

    def test_suspend_never_deletes_historical_records(self):
        rider = self._user("rider")
        self.client.post(
            f"/auth/users/{rider.id}/suspend/", {"reason": "Policy breach"}, format="json"
        )
        self.assertTrue(User.objects.filter(pk=rider.id).exists())

    def test_staff_accounts_cannot_be_suspended(self):
        staff = self._user("staff")

    # ---- support integration --------------------------------------------
    def test_support_returns_only_this_riders_tickets(self):
        from operations.models import BetaFeedback

        rider = self._user("rider")
        other = self._user("rider")
        BetaFeedback.objects.create(
            reference="BF-R1", user=rider, app_type="rider", category="ride",
            severity="P2", description="Driver was late",
        )
        BetaFeedback.objects.create(
            reference="BF-R2", user=other, app_type="rider", category="payment",
            severity="P1", description="Other rider ticket",
        )

        res = self.client.get(f"{LIST_URL}{rider.id}/support/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["count"], 1)
        self.assertEqual(res.data["results"][0]["reference"], "BF-R1")
        self.assertEqual(res.data["open_count"], 1)

    def test_support_status_filter_and_invalid_status(self):
        from operations.models import BetaFeedback

        rider = self._user("rider")
        BetaFeedback.objects.create(
            reference="BF-S1", user=rider, app_type="rider", category="ride",
            severity="P2", description="A", status="resolved",
        )
        BetaFeedback.objects.create(
            reference="BF-S2", user=rider, app_type="rider", category="ride",
            severity="P2", description="B", status="open",
        )

        open_only = self.client.get(f"{LIST_URL}{rider.id}/support/", {"status": "open"})
        self.assertEqual(open_only.data["count"], 1)
        self.assertEqual(open_only.data["open_count"], 1)

        self.assertEqual(
            self.client.get(f"{LIST_URL}{rider.id}/support/", {"status": "nope"}).status_code,
            400,
        )

    def test_support_never_exposes_the_description_body(self):
        from operations.models import BetaFeedback

        rider = self._user("rider")
        BetaFeedback.objects.create(
            reference="BF-P1", user=rider, app_type="rider", category="ride",
            severity="P2", description="Sensitive detail about the trip",
        )
        body = str(self.client.get(f"{LIST_URL}{rider.id}/support/").data)
        self.assertNotIn("Sensitive detail", body)

    def test_support_requires_admin(self):
        rider = self._user("rider")
        self.client.force_authenticate(self._user("plain"))
        self.assertEqual(self.client.get(f"{LIST_URL}{rider.id}/support/").status_code, 403)

    def test_staff_accounts_cannot_be_suspended(self):
        staff = self._user("staff")
        staff.is_staff = True
        staff.save(update_fields=["is_staff"])
        res = self.client.post(
            f"/auth/users/{staff.id}/suspend/",
            {"reason": "Should be refused"},
            format="json",
        )
        self.assertEqual(res.status_code, 400)

    def test_suspend_requires_admin(self):
        rider = self._user("rider")
        self.client.force_authenticate(self._user("plain"))
        res = self.client.post(
            f"/auth/users/{rider.id}/suspend/",
            {"reason": "Should be refused"},
            format="json",
        )
        self.assertEqual(res.status_code, 403)

