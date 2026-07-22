"""Customer Growth & Loyalty Platform tests (Phase 33)."""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from loyalty.models import LoyaltyTier, RiderLoyaltyAccount
from loyalty.services.loyalty_service import earn_points, get_or_create_account
from promotions.models import PromoCode
from taxi.rides.models import Ride

User = get_user_model()


class CustomerGrowthPlatformTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_superuser(
            email="admin-growth@test.local",
            password="Pass123!",
        )
        self.rider = User.objects.create_user(
            email="rider-growth@test.local",
            password="Pass123!",
            user_type="rider",
        )
        self.driver = User.objects.create_user(
            email="driver-growth@test.local",
            password="Pass123!",
            user_type="driver",
        )

    def test_dashboard_requires_staff(self):
        self.client.force_authenticate(self.rider)
        denied = self.client.get("/operations/customer-growth/")
        self.assertEqual(denied.status_code, 403)

        self.client.force_authenticate(self.admin)
        response = self.client.get("/operations/customer-growth/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("summary", response.data)
        self.assertIn("feature_flags", response.data)
        self.assertIn("loyalty", response.data)

    def test_loyalty_earn_and_tier(self):
        earn_points(self.rider, 600, "ride", reference="ride:test")
        account = RiderLoyaltyAccount.objects.get(rider=self.rider)
        self.assertEqual(account.points_balance, 600)
        self.assertEqual(account.tier.slug, "silver")

    def test_loyalty_me_endpoint(self):
        get_or_create_account(self.rider)
        self.client.force_authenticate(self.rider)
        response = self.client.get("/loyalty/me/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("account", response.data)
        self.assertEqual(response.data["account"]["tier"]["slug"], "bronze")

    def test_create_promo_via_ops(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            "/operations/customer-growth/promos/",
            {
                "code": "BETA33",
                "discount_type": "percentage",
                "discount_value": 15,
                "campaign_type": "first_ride",
                "first_ride_only": True,
                "start_date": timezone.now().isoformat(),
                "end_date": (timezone.now() + timezone.timedelta(days=14)).isoformat(),
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertTrue(PromoCode.objects.filter(code="BETA33").exists())

    def test_update_feature_flags(self):
        self.client.force_authenticate(self.admin)
        response = self.client.patch(
            "/operations/customer-growth/flags/",
            {"loyalty_program_enabled": False},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["feature_flags"]["loyalty_program_enabled"])

    def test_ceo_dashboard(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get("/operations/customer-growth/ceo/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("customer_growth", response.data)
        self.assertIn("estimated_customer_lifetime_value", response.data)

    def test_finance_dashboard(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get("/operations/customer-growth/finance/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("loyalty_liability_points", response.data)
        self.assertIn("promo_cost_30d", response.data)

    def test_loyalty_points_on_ride_complete_signal(self):
        Ride.objects.create(
            rider=self.rider,
            driver=self.driver,
            pickup="A",
            destination="B",
            fare=Decimal("200"),
            status="completed",
            completed_at=timezone.now(),
            pickup_lat=18.07,
            pickup_lng=-15.95,
            destination_lat=18.09,
            destination_lng=-15.97,
        )
        account = RiderLoyaltyAccount.objects.filter(rider=self.rider).first()
        self.assertIsNotNone(account)
        self.assertGreaterEqual(account.points_balance, 10)

    def test_loyalty_tiers_seeded(self):
        self.assertEqual(LoyaltyTier.objects.filter(is_active=True).count(), 4)
        slugs = set(LoyaltyTier.objects.values_list("slug", flat=True))
        self.assertEqual(slugs, {"bronze", "silver", "gold", "platinum"})
