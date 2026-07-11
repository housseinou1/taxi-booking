"""Driver withdrawal request flow tests."""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import make_password
from django.test import TestCase
from django.utils import timezone
from datetime import timedelta
from rest_framework.test import APIClient

from payments.models import DriverPayoutMethod, WithdrawalOTPCode, WithdrawalRequest
from taxi.rides.models import Ride

User = get_user_model()


class DriverWithdrawalFlowTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.driver = User.objects.create_user(
            email="driver-withdraw@test.local",
            password="Pass123!",
            user_type="driver",
            phone_number="+22248333333",
        )
        self.payout_method = DriverPayoutMethod.objects.create(
            driver=self.driver,
            payout_type="bankily",
            phone_number="+22248333333",
            is_default=True,
        )
        Ride.objects.create(
            rider=User.objects.create_user(email="rider-withdraw@test.local", password="Pass123!"),
            driver=self.driver,
            pickup="A",
            destination="B",
            fare=Decimal("800.00"),
            driver_earning=Decimal("640.00"),
            status="completed",
            completed_at=timezone.now(),
        )
        WithdrawalOTPCode.objects.create(
            user=self.driver,
            code_hash=make_password("123456"),
            expires_at=timezone.now() + timedelta(minutes=10),
        )

    def test_withdrawal_summary_lists_balances(self):
        self.client.force_authenticate(self.driver)
        response = self.client.get("/payments/withdrawals/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(Decimal(response.data["available_balance"]), Decimal("640.00"))
        self.assertEqual(Decimal(response.data["total_earned"]), Decimal("640.00"))
        self.assertEqual(Decimal(response.data["minimum_withdrawal"]), Decimal("500"))

    def test_driver_can_request_withdrawal(self):
        self.client.force_authenticate(self.driver)
        response = self.client.post(
            "/payments/withdrawals/request/",
            {
                "amount": "500",
                "note": "Weekly payout",
                "payout_method": self.payout_method.id,
                "otp_code": "123456",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        withdrawal = WithdrawalRequest.objects.get(driver=self.driver)
        self.assertEqual(withdrawal.status, "pending")
        self.assertEqual(withdrawal.amount, Decimal("500.00"))

    def test_minimum_withdrawal_rejected(self):
        self.client.force_authenticate(self.driver)
        response = self.client.post(
            "/payments/withdrawals/request/",
            {
                "amount": "50",
                "payout_method": self.payout_method.id,
                "otp_code": "123456",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("Minimum withdrawal", response.data["error"])

    def test_save_payout_method_updates_existing_record(self):
        self.client.force_authenticate(self.driver)
        response = self.client.post(
            "/payments/payout-methods/save/",
            {
                "payout_type": "bankily",
                "phone_number": "+22248999999",
                "is_default": True,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(DriverPayoutMethod.objects.filter(driver=self.driver).count(), 1)
        self.payout_method.refresh_from_db()
        self.assertEqual(self.payout_method.phone_number, "+22248999999")
