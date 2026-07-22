"""Driver Incentive Engine tests (Phase 30)."""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from incentives.models import BonusPayment, DriverIncentiveProgress, IncentiveProgram
from payments.models import WalletAccount
from taxi.drivers.models import DriverProfile
from taxi.rides.models import Ride

User = get_user_model()


class DriverIncentiveEngineTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.driver_user = User.objects.create_user(
            email="driver-incentive@test.local",
            password="Pass123!",
            user_type="driver",
        )
        self.profile = DriverProfile.objects.create(
            user=self.driver_user,
            status="approved",
            total_rides_completed=5,
        )
        self.admin = User.objects.create_superuser(
            email="admin-incentive@test.local",
            password="Pass123!",
        )
        self.program = IncentiveProgram.objects.create(
            name="Airport 5 rides",
            incentive_type="airport_bonus",
            reward_type="fixed",
            bonus_amount=Decimal("300"),
            target_value=5,
            status="active",
            starts_at=timezone.now(),
            eligible_groups=["all"],
        )
        self.ride = Ride.objects.create(
            rider=User.objects.create_user(email="rider-inc@test.local", password="Pass123!", user_type="rider"),
            driver=self.driver_user,
            pickup="Airport Nouakchott",
            destination="City Center",
            fare=Decimal("200"),
            driver_earning=Decimal("140"),
            status="completed",
            completed_at=timezone.now(),
            pickup_lat=18.07,
            pickup_lng=-15.95,
            destination_lat=18.09,
            destination_lng=-15.97,
        )

    def test_create_campaign_via_ops_api(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            "/operations/incentive-engine/campaigns/",
            {
                "name": "Weekend bonus",
                "campaign_type": "weekend_bonus",
                "reward_type": "per_trip",
                "reward": 50,
                "target": 10,
                "status": "draft",
                "eligible_groups": ["all"],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["name"], "Weekend bonus")

    def test_ride_tracking_updates_progress(self):
        from incentives.services.ride_incentives import track_ride_completion

        DriverIncentiveProgress.objects.create(
            driver=self.driver_user,
            program=self.program,
            status="in_progress",
            current_value=4,
        )
        track_ride_completion(self.driver_user, self.ride)
        progress = DriverIncentiveProgress.objects.get(driver=self.driver_user, program=self.program)
        self.assertEqual(progress.status, "completed")
        self.assertTrue(BonusPayment.objects.filter(driver=self.driver_user, payout_status="pending").exists())

    def test_driver_progress_api_returns_campaign_fields(self):
        DriverIncentiveProgress.objects.create(
            driver=self.driver_user,
            program=self.program,
            status="in_progress",
            current_value=2,
        )
        self.client.force_authenticate(self.driver_user)
        response = self.client.get("/incentives/my-progress/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("active_campaigns", response.data)
        self.assertIn("bonus_summary", response.data)
        campaign = response.data["active_campaigns"][0]
        self.assertIn("progress_percent", campaign)
        self.assertIn("trips_remaining", campaign)
        self.assertIn("estimated_bonus", campaign)

    def test_finance_approve_payout_credits_wallet(self):
        progress = DriverIncentiveProgress.objects.create(
            driver=self.driver_user,
            program=self.program,
            status="completed",
            bonus_earned=Decimal("300"),
        )
        payment = BonusPayment.objects.create(
            driver=self.driver_user,
            program=self.program,
            progress=progress,
            amount=Decimal("300"),
            reason="Test bonus",
            payout_status="pending",
        )
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            f"/operations/incentive-engine/payouts/{payment.id}/action/",
            {"action": "approve"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        payment.refresh_from_db()
        self.assertEqual(payment.payout_status, "paid")
        wallet = WalletAccount.objects.get(owner=self.driver_user)
        self.assertEqual(wallet.balance, Decimal("300"))

    def test_incentive_engine_dashboard(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get("/operations/incentive-engine/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("operations", response.data)
        self.assertIn("ceo", response.data)
        self.assertIn("finance", response.data)

    def test_ceo_dashboard(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get("/operations/incentive-engine/ceo/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("incentive_cost_30d", response.data)
        self.assertIn("campaign_effectiveness", response.data)

    def test_bonus_export(self):
        BonusPayment.objects.create(
            driver=self.driver_user,
            program=self.program,
            amount=Decimal("100"),
            reason="Export test",
            payout_status="paid",
        )
        self.client.force_authenticate(self.admin)
        response = self.client.get("/operations/incentive-engine/export/?days=30")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "text/csv; charset=utf-8")
