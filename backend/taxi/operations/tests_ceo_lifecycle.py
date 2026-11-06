"""CEO Command Center — professional account lifecycle tests.

Verifies the CEO can Approve, Suspend, Deactivate and Reactivate **Drivers, Riders
and Delivery Couriers** remotely, with the domain-aware semantics of a modern
ride-hailing operations console:

* **approve** — driver/courier approval requires the agreement signature (and, for
  couriers, the vehicle-type document requirements); riders are activated.
* **suspend** — stops work (availability / delivery mode) while the account keeps
  app access; riders are deactivated (they have no availability flag).
* **deactivate** — removes sign-in entirely; `block` stays as a legacy alias.
* **reactivate** — restores access, availability and delivery mode.

Plus the standing protections: no self/staff/protected target, mandatory reason,
full audit trail, CEO-tier only, and no financial side effects.
"""

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient

from deliveries.models import DriverDeliverySettings
from security.models import AuditLog
from taxi.drivers.models import DriverProfile

User = get_user_model()


def _user(email, is_staff=False, is_superuser=False, user_type="rider"):
    return User.objects.create_user(
        email=email,
        password="pw",
        is_staff=is_staff,
        is_superuser=is_superuser,
        user_type=user_type,
    )


def _in_group(user, name):
    group, _ = Group.objects.get_or_create(name=name)
    user.groups.add(group)
    return user


def _signed_profile(user, status="pending_review"):
    return DriverProfile.objects.create(
        user=user,
        status=status,
        phone_number="+22222110000",
        terms_accepted=True,
        legal_declaration_accepted=True,
        signed_full_name="Lifecycle Test",
        signature_image="couriers/signatures/test.png",
    )


class CeoLifecycleTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.ceo = _in_group(_user("ceo-life@yala.test", is_staff=True), "CEO")
        self.client.force_authenticate(user=self.ceo)

    def _act(self, user, action, reason="Operational decision"):
        return self.client.post(
            f"/operations/ceo/accounts/{user.id}/action/",
            {"action": action, "reason": reason},
            format="json",
        )


class DriverLifecycleTests(CeoLifecycleTestCase):
    def setUp(self):
        super().setUp()
        self.driver = _user("driver-life@yala.test", user_type="driver")
        self.profile = _signed_profile(self.driver)

    def test_ceo_can_approve_a_driver(self):
        res = self._act(self.driver, "approve")

        self.assertEqual(res.status_code, 200)
        self.profile.refresh_from_db()
        self.driver.refresh_from_db()
        self.assertEqual(self.profile.status, "approved")
        self.assertTrue(self.driver.is_active)
        self.assertTrue(self.profile.driver_code)
        self.assertFalse(self.profile.is_available)  # approved but offline

    def test_driver_approval_requires_the_agreement_signature(self):
        unsigned = _user("driver-unsigned@yala.test", user_type="driver")
        DriverProfile.objects.create(user=unsigned, status="pending_review")

        res = self._act(unsigned, "approve")
        self.assertEqual(res.status_code, 400)
        self.assertIn("signature", res.data["error"].lower())

    def test_driver_suspend_stops_work_but_keeps_app_access(self):
        self._act(self.driver, "approve")
        res = self._act(self.driver, "suspend", reason="Safety review opened")

        self.assertEqual(res.status_code, 200)
        self.profile.refresh_from_db()
        self.driver.refresh_from_db()
        self.assertTrue(self.driver.is_active)  # keeps access
        self.assertFalse(self.profile.is_available)  # cannot take rides
        # Suspension is now a persisted, distinguishable state (dedicated field, B7).
        self.assertTrue(self.profile.suspension_active)
        self.assertTrue(res.data["lifecycle"]["is_suspended"])
        self.assertEqual(res.data["lifecycle"]["status_label"], "suspended")

    def test_driver_deactivate_removes_sign_in(self):
        self._act(self.driver, "approve")
        res = self._act(self.driver, "deactivate", reason="Contract ended")

        self.assertEqual(res.status_code, 200)
        self.profile.refresh_from_db()
        self.driver.refresh_from_db()
        self.assertFalse(self.driver.is_active)
        self.assertFalse(self.profile.is_available)

    def test_driver_reactivate_restores_access(self):
        self._act(self.driver, "approve")
        self._act(self.driver, "deactivate")
        res = self._act(self.driver, "reactivate", reason="Reinstated")

        self.assertEqual(res.status_code, 200)
        self.driver.refresh_from_db()
        self.assertTrue(self.driver.is_active)

    def test_repeat_actions_are_refused(self):
        self._act(self.driver, "approve")
        self.assertEqual(self._act(self.driver, "approve").status_code, 400)

        # Suspend turns availability off; for a driver (no delivery settings) there
        # is no separate suspension flag, so a repeat suspend is a harmless no-op.
        self.assertEqual(self._act(self.driver, "suspend").status_code, 200)
        self.profile.refresh_from_db()
        self.assertFalse(self.profile.is_available)

        # Deactivating then reactivating works, and reactivating twice is refused.
        self.assertEqual(self._act(self.driver, "deactivate").status_code, 200)
        self.assertEqual(self._act(self.driver, "reactivate").status_code, 200)
        self.assertEqual(self._act(self.driver, "reactivate").status_code, 400)

    def test_lifecycle_action_is_audited_under_the_driver_entity(self):
        self._act(self.driver, "approve")
        self._act(self.driver, "suspend", reason="Safety review opened")

        log = AuditLog.objects.filter(
            entity_type="driver",
            entity_id=str(self.profile.id),
            details__operation="suspend",
        ).first()
        self.assertIsNotNone(log)
        self.assertEqual(log.details.get("operation"), "suspend")
        self.assertEqual(log.details.get("reason"), "Safety review opened")


class CourierLifecycleTests(CeoLifecycleTestCase):
    def setUp(self):
        super().setUp()
        self.courier = _user("courier-life@yala.test", user_type="driver")
        self.profile = _signed_profile(self.courier)
        self.settings = DriverDeliverySettings.objects.create(
            driver=self.courier,
            delivery_mode_enabled=False,
            delivery_vehicle_type="bicycle",
        )

    def test_courier_approval_is_blocked_by_missing_documents(self):
        res = self._act(self.courier, "approve")

        self.assertEqual(res.status_code, 400)
        self.assertIn("incomplete", res.data["error"])
        self.assertIn("national_id", res.data["missing_document_types"])
        self.profile.refresh_from_db()
        self.assertNotEqual(self.profile.status, "approved")

    def test_courier_is_approved_once_requirements_are_met(self):
        from taxi.drivers.models import DriverDocument

        DriverDocument.objects.create(
            driver=self.profile,
            document_type="national_id",
            file="driver/documents/nid.jpg",
            status="pending_review",
        )
        res = self._act(self.courier, "approve")

        self.assertEqual(res.status_code, 200)
        self.profile.refresh_from_db()
        self.settings.refresh_from_db()
        self.assertEqual(self.profile.status, "approved")
        self.assertTrue(self.courier.is_active)
        self.assertTrue(self.settings.delivery_mode_enabled)
        self.assertFalse(self.settings.is_suspended)

    def test_courier_suspend_stops_deliveries_but_keeps_app_access(self):
        self.settings.delivery_mode_enabled = True
        self.settings.save(update_fields=["delivery_mode_enabled"])

        res = self._act(self.courier, "suspend", reason="Customer complaint")

        self.assertEqual(res.status_code, 200)
        self.settings.refresh_from_db()
        self.courier.refresh_from_db()
        self.assertTrue(self.courier.is_active)
        self.assertTrue(self.settings.is_suspended)
        self.assertFalse(self.settings.delivery_mode_enabled)
        self.assertEqual(self.settings.suspension_reason, "Customer complaint")

    def test_courier_reactivate_restores_delivery_mode_when_approved(self):
        self.profile.status = "approved"
        self.profile.save(update_fields=["status"])
        self._act(self.courier, "suspend", reason="Temporary pause")

        res = self._act(self.courier, "reactivate", reason="Cleared")

        self.assertEqual(res.status_code, 200)
        self.settings.refresh_from_db()
        self.assertFalse(self.settings.is_suspended)
        self.assertTrue(self.settings.delivery_mode_enabled)

    def test_legacy_block_action_still_works(self):
        res = self._act(self.courier, "block", reason="Legacy client action")

        self.assertEqual(res.status_code, 200)
        self.courier.refresh_from_db()
        self.assertFalse(self.courier.is_active)


class RiderLifecycleTests(CeoLifecycleTestCase):
    def setUp(self):
        super().setUp()
        self.rider = _user("rider-life@yala.test", user_type="rider")

    def test_ceo_can_approve_a_rider(self):
        self.rider.is_active = False
        self.rider.save(update_fields=["is_active"])

        res = self._act(self.rider, "approve", reason="Verified account")
        self.assertEqual(res.status_code, 200)
        self.rider.refresh_from_db()
        self.assertTrue(self.rider.is_active)

    def test_rider_suspend_stops_the_account(self):
        res = self._act(self.rider, "suspend", reason="Fraud investigation")

        self.assertEqual(res.status_code, 200)
        self.rider.refresh_from_db()
        self.assertFalse(self.rider.is_active)

    def test_rider_reactivate_restores_the_account(self):
        self._act(self.rider, "suspend", reason="Fraud investigation")
        res = self._act(self.rider, "reactivate", reason="Cleared")

        self.assertEqual(res.status_code, 200)
        self.rider.refresh_from_db()
        self.assertTrue(self.rider.is_active)

    def test_invalid_action_is_refused_with_the_valid_list(self):
        res = self._act(self.rider, "delete", reason="Nope")

        self.assertEqual(res.status_code, 400)
        for action in ("approve", "suspend", "deactivate", "reactivate"):
            self.assertIn(action, res.data["valid_actions"])

