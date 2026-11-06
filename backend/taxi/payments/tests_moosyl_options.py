"""Tests for the checkout options endpoint, cash availability, and commission accounting.

Covers the owner-authorized change that keeps Cash available (subject to the same
commission split) and the configurable delivery commission.
"""

from decimal import Decimal

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from authapp.models import User
from payments.models import Payment
from payments.moosyl_settlement import delivery_commission_policy
from taxi.drivers.models import DriverProfile
from taxi.rides.models import Ride

OPTIONS_URL = "/payments/options/"
CREATE_PAYMENT_URL = "/payments/create/"

MOOSYL_CONFIGURED = dict(
    MOOSYL_API_BASE_URL="https://api.moosyl.com",
    MOOSYL_SECRET_KEY="sandbox-key",
    MOOSYL_WEBHOOK_SECRET="sandbox-webhook-secret",
    MOOSYL_ENVIRONMENT="sandbox",
)


class OptionsBase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.rider = User.objects.create_user(
            email="opt-rider@example.com",
            password="StrongPass123",
            first_name="Opt",
            last_name="Rider",
            phone_number="+22233190001",
            phone_verified_at=timezone.now(),
            national_id_number="2223900001",
        )
        self.driver = User.objects.create_user(
            email="opt-driver@example.com",
            password="StrongPass123",
            first_name="Opt",
            last_name="Driver",
            phone_number="+22233190002",
            phone_verified_at=timezone.now(),
            national_id_number="2223900002",
            user_type="driver",
        )
        DriverProfile.objects.create(
            user=self.driver,
            status="approved",
            driver_code="939001",
            qr_code_uuid="40000000-0000-4000-8000-000000000001",
            is_available=True,
            registration_status="approved",
        )
        self.ride = Ride.objects.create(
            rider=self.rider,
            driver=self.driver,
            pickup="A",
            destination="B",
            fare=Decimal("120.50"),
            status="completed",
        )
        self.client.force_authenticate(user=self.rider)


@override_settings(CASHLESS_POLICY_ENFORCED=False)
class PaymentOptionsTests(OptionsBase):
    """The endpoint is the single source of truth the apps render."""

    def test_requires_authentication(self):
        client = APIClient()
        self.assertIn(client.get(OPTIONS_URL).status_code, (401, 403))

    def test_cash_is_available_when_the_policy_is_relaxed(self):
        body = self.client.get(OPTIONS_URL).json()
        self.assertTrue(body["cash"]["available"])
        self.assertFalse(body["cashless_policy_enforced"])
        self.assertEqual(body["cash"]["reason"], "")
        # Cash must actually be offered to the checkout, not merely announced.
        self.assertIn("cash", body["ride_methods"])
        self.assertIn("cash", body["delivery_methods"])

    def test_cash_still_carries_commission_accounting(self):
        """Cash is not exempt: the same split is recorded when it is used."""
        body = self.client.get(OPTIONS_URL).json()
        self.assertTrue(body["cash"]["commission_applies"])

    def test_moosyl_is_unavailable_until_it_is_configured(self):
        body = self.client.get(OPTIONS_URL).json()
        self.assertFalse(body["moosyl"]["available"])
        self.assertEqual(body["moosyl"]["methods"], [])

    @override_settings(**MOOSYL_CONFIGURED)
    def test_moosyl_bank_apps_are_offered_once_configured(self):
        body = self.client.get(OPTIONS_URL).json()
        self.assertTrue(body["moosyl"]["available"])
        self.assertEqual(body["moosyl"]["methods"], ["bankily", "masravi", "sedad"])
        self.assertEqual(body["moosyl"]["environment"], "sandbox")
        self.assertFalse(body["moosyl"]["settlement_enabled"])

    def test_commission_reports_the_thirty_seventy_split(self):
        body = self.client.get(OPTIONS_URL).json()
        self.assertEqual(body["commission"]["ride"]["platform_percent"], "0.3000")
        self.assertEqual(body["commission"]["ride"]["driver_percent"], "0.7000")
        self.assertEqual(body["commission"]["delivery"]["platform_percent"], "0.3000")
        self.assertEqual(body["commission"]["delivery"]["driver_percent"], "0.7000")
        self.assertEqual(body["commission"]["delivery"]["source"], "ride_policy")

    def test_confirmation_is_backend_webhook_only(self):
        body = self.client.get(OPTIONS_URL).json()
        self.assertEqual(body["confirmation"], "backend_webhook")

    def test_cash_touchpoint_is_reported_as_available_not_removed(self):
        body = self.client.get(OPTIONS_URL).json()
        row = next(
            t
            for t in body["policy"]["touchpoints"]
            if t["id"] == "rider_checkout_cash_option"
        )
        self.assertEqual(row["status"], "available")


@override_settings(CASHLESS_POLICY_ENFORCED=True)
class PaymentOptionsCashBlockedTests(OptionsBase):
    """With the policy enforced the option must be gone again — the switch is real."""

    def test_cash_is_unavailable_and_explained(self):
        body = self.client.get(OPTIONS_URL).json()
        self.assertFalse(body["cash"]["available"])
        self.assertTrue(body["cashless_policy_enforced"])
        self.assertTrue(body["cash"]["reason"])
        self.assertNotIn("cash", body["ride_methods"])
        self.assertNotIn("cash", body["delivery_methods"])

    def test_cash_touchpoint_is_reported_as_removed(self):
        body = self.client.get(OPTIONS_URL).json()
        row = next(
            t
            for t in body["policy"]["touchpoints"]
            if t["id"] == "rider_checkout_cash_option"
        )
        self.assertEqual(row["status"], "removed")


@override_settings(CASHLESS_POLICY_ENFORCED=False)
class CashCommissionAccountingTests(OptionsBase):
    """A cash ride must be accounted exactly like a digital one."""

    def test_cash_ride_records_the_thirty_seventy_split(self):
        response = self.client.post(
            CREATE_PAYMENT_URL,
            {"ride_id": self.ride.id, "method": "cash", "tip_percentage": 0},
            format="json",
        )
        # 201: a cash payment is created as `pending_verification` — the rider pays the
        # driver directly and the driver confirms receipt, so it is not "paid" yet.
        self.assertIn(response.status_code, (200, 201), response.content)
        payment = (
            Payment.objects.filter(ride_id=self.ride.id).order_by("-created_at").first()
        )
        self.assertIsNotNone(payment)
        self.assertEqual(payment.method, "cash")
        self.assertEqual(payment.status, "pending_verification")
        # 120.50 -> 30% = 36.15 platform, 70% = 84.35 driver.
        self.assertEqual(payment.app_fee, Decimal("36.15"))
        self.assertEqual(payment.driver_earning, Decimal("84.35"))
        self.assertEqual(payment.app_fee + payment.driver_earning, Decimal("120.50"))


class DeliveryCommissionPolicyTests(TestCase):
    """Delivery split: provisional 30/70, configurable without a migration."""

    def test_defaults_to_the_ride_policy(self):
        policy = delivery_commission_policy()
        self.assertEqual(policy["platform_percent"], Decimal("0.3000"))
        self.assertEqual(policy["driver_percent"], Decimal("0.7000"))
        self.assertEqual(policy["source"], "ride_policy")

    @override_settings(DELIVERY_PLATFORM_PERCENT="25")
    def test_whole_percent_override_is_normalised(self):
        policy = delivery_commission_policy()
        self.assertEqual(policy["platform_percent"], Decimal("0.25"))
        self.assertEqual(policy["driver_percent"], Decimal("0.75"))
        self.assertEqual(policy["source"], "DELIVERY_PLATFORM_PERCENT")

    @override_settings(DELIVERY_PLATFORM_PERCENT="0.20")
    def test_fraction_override_is_accepted(self):
        policy = delivery_commission_policy()
        self.assertEqual(policy["platform_percent"], Decimal("0.20"))
        self.assertEqual(policy["driver_percent"], Decimal("0.80"))

    @override_settings(DELIVERY_PLATFORM_PERCENT="")
    def test_empty_override_falls_back_to_the_ride_policy(self):
        self.assertEqual(delivery_commission_policy()["source"], "ride_policy")

