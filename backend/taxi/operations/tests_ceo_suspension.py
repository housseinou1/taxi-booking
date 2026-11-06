"""Suspension lifecycle: suspended partners are distinguishable from offline ones and
cannot take new work while keeping account access.

Covers the CEO suspend/reactivate actions plus the enforcement points:
`rides.views.approved_driver_error` (ride requests/accept) and
`drivers.views.toggle_availability` (going online).
"""

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from deliveries.models import DriverDeliverySettings
from taxi.drivers.models import DriverProfile

User = get_user_model()


def _user(email, **kwargs):
    # `is_phone_verified` is a read-only property backed by `phone_verified_at`, so it
    # is popped before creating the user and applied afterwards.
    phone_verified = kwargs.pop("phone_verified", False)
    user = User.objects.create_user(email=email, password="pw", **kwargs)
    if phone_verified:
        user.phone_verified_at = timezone.now()
        user.save(update_fields=["phone_verified_at"])
    return user


def _in_group(user, name):
    group, _ = Group.objects.get_or_create(name=name)
    user.groups.add(group)
    return user


def _approved_profile(user, **overrides):
    data = {
        "user": user,
        "status": "approved",
        "phone_number": "+22222119999",
        "terms_accepted": True,
        "legal_declaration_accepted": True,
        "signed_full_name": "Suspension Test",
        "signature_image": "couriers/signatures/test.png",
    }
    data.update(overrides)
    return DriverProfile.objects.create(**data)


class DriverSuspensionStateTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.ceo = _in_group(_user("ceo-susp@yala.test", is_staff=True), "CEO")
        self.driver = _user("driver-susp@yala.test", user_type="driver", phone_verified=True)
        self.profile = _approved_profile(self.driver)
        self.client.force_authenticate(user=self.ceo)

    def _act(self, action, reason="Suspension lifecycle test"):
        return self.client.post(
            f"/operations/ceo/accounts/{self.driver.id}/action/",
            {"action": action, "reason": reason},
            format="json",
        )

    def test_suspend_marks_the_account_suspended_not_offline(self):
        res = self._act("suspend")

        self.assertEqual(res.status_code, 200)
        self.profile.refresh_from_db()
        self.driver.refresh_from_db()
        self.assertTrue(self.profile.suspension_active)  # persisted suspension state (B7)
        self.assertFalse(self.profile.is_available)
        self.assertTrue(self.driver.is_active)  # keeps app access
        self.assertEqual(res.data["lifecycle"]["status_label"], "suspended")
        self.assertTrue(res.data["lifecycle"]["driver_suspended"])

    def test_offline_driver_is_reported_as_offline_not_suspended(self):
        self.profile.is_available = False
        self.profile.suspension_active = False
        self.profile.save(update_fields=["is_available", "suspension_active"])

        res = self.client.get("/operations/ceo/accounts/", {"search": "driver-susp"})
        row = next(r for r in res.data["results"] if r["email"] == "driver-susp@yala.test")
        self.assertEqual(row["lifecycle"]["status_label"], "offline")
        self.assertFalse(row["lifecycle"]["is_suspended"])

    def test_reactivate_clears_the_suspension(self):
        self._act("suspend")
        res = self._act("reactivate", reason="Review cleared")

        self.assertEqual(res.status_code, 200)
        self.profile.refresh_from_db()
        self.assertFalse(self.profile.suspension_active)
        self.assertEqual(res.data["lifecycle"]["status_label"], "offline")

    def test_deactivate_reports_deactivated(self):
        res = self._act("deactivate", reason="Contract ended")

        self.assertEqual(res.status_code, 200)
        self.driver.refresh_from_db()
        self.assertFalse(self.driver.is_active)
        self.assertEqual(res.data["lifecycle"]["status_label"], "deactivated")

    def test_courier_suspend_sets_both_markers(self):
        courier = _user("courier-susp@yala.test", user_type="driver", phone_verified=True)
        _approved_profile(courier)
        DriverDeliverySettings.objects.create(
            driver=courier, delivery_mode_enabled=True, delivery_vehicle_type="bicycle"
        )

        res = self.client.post(
            f"/operations/ceo/accounts/{courier.id}/action/",
            {"action": "suspend", "reason": "Complaint review"},
            format="json",
        )

        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data["lifecycle"]["driver_suspended"])
        self.assertTrue(res.data["lifecycle"]["delivery_suspended"])
        settings = DriverDeliverySettings.objects.get(driver=courier)
        self.assertTrue(settings.is_suspended)
        self.assertFalse(settings.delivery_mode_enabled)


class SuspendedDriverWorkBlockTests(TestCase):
    """Suspended drivers cannot take new work but keep permitted account access."""

    def setUp(self):
        self.client = APIClient()
        self.driver = _user("driver-block@yala.test", user_type="driver", phone_verified=True)
        self.profile = _approved_profile(self.driver)
        self.client.force_authenticate(user=self.driver)

    def _suspend(self):
        ceo = _in_group(_user(f"ceo-block-{self.driver.id}@yala.test", is_staff=True), "CEO")
        admin = APIClient()
        admin.force_authenticate(user=ceo)
        admin.post(
            f"/operations/ceo/accounts/{self.driver.id}/action/",
            {"action": "suspend", "reason": "Work block test"},
            format="json",
        )
        self.profile.refresh_from_db()

    def test_suspended_driver_is_refused_new_ride_requests(self):
        self._suspend()
        self.assertTrue(self.profile.suspension_active)

        res = self.client.get("/rides/available/")
        self.assertEqual(res.status_code, 403)
        self.assertIn("suspended", str(res.data).lower())

    def test_suspended_driver_cannot_go_online(self):
        self._suspend()

        res = self.client.post("/drivers/availability/toggle/", {"is_available": True}, format="json")
        self.assertEqual(res.status_code, 403)
        self.assertEqual(res.data.get("code"), "driver_suspended")
        self.profile.refresh_from_db()
        self.assertFalse(self.profile.is_available)

    def test_suspended_driver_keeps_permitted_account_access(self):
        self._suspend()

        # The account itself is intact: sign-in works, the profile is readable and
        # the driver is still approved (only new work is blocked).
        self.driver.refresh_from_db()
        self.assertTrue(self.driver.is_active)
        self.assertEqual(self.profile.status, "approved")

        profile_res = self.client.get("/drivers/profile/")
        self.assertNotEqual(profile_res.status_code, 401)

    def test_reactivated_driver_can_go_online_again(self):
        self._suspend()
        ceo = _in_group(_user(f"ceo-re-{self.driver.id}@yala.test", is_staff=True), "CEO")
        admin = APIClient()
        admin.force_authenticate(user=ceo)
        admin.post(
            f"/operations/ceo/accounts/{self.driver.id}/action/",
            {"action": "reactivate", "reason": "Cleared"},
            format="json",
        )

        res = self.client.post("/drivers/availability/toggle/", {"is_available": True}, format="json")
        # The suspension gate must no longer fire (any other pre-existing gate, such
        # as the agreement version, is out of scope for this test).
        self.assertNotEqual(res.data.get("code"), "driver_suspended")
        self.profile.refresh_from_db()
        self.assertFalse(self.profile.suspension_active)

    def test_non_suspended_driver_is_unaffected(self):
        res = self.client.post("/drivers/availability/toggle/", {"is_available": True}, format="json")
        # An approved, non-suspended driver is never blocked by the suspension gate.
        self.assertNotEqual(res.data.get("code"), "driver_suspended")
        self.profile.refresh_from_db()
        self.assertFalse(self.profile.suspension_active)

