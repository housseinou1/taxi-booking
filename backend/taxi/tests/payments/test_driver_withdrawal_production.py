"""Production driver withdrawal system tests."""

from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import make_password
from django.test import TestCase
from django.utils import timezone
from datetime import timedelta
from rest_framework.test import APIClient

from payments.models import DriverPayoutMethod, WalletTransaction, WithdrawalOTPCode, WithdrawalRequest
from security.models import AuditLog
from taxi.rides.models import Ride

User = get_user_model()


class DriverWithdrawalProductionTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.driver = User.objects.create_user(
            email="driver-prod@test.local",
            password="Pass123!",
            user_type="driver",
            phone_number="+22248111111",
        )
        self.admin = User.objects.create_superuser(
            email="admin-withdraw@test.local",
            password="Pass123!",
        )
        self.payout_method = DriverPayoutMethod.objects.create(
            driver=self.driver,
            payout_type="bankily",
            phone_number="+22248111111",
            is_default=True,
        )
        Ride.objects.create(
            rider=User.objects.create_user(email="rider-prod@test.local", password="Pass123!"),
            driver=self.driver,
            pickup="A",
            destination="B",
            fare=Decimal("800.00"),
            driver_earning=Decimal("640.00"),
            status="completed",
            completed_at=timezone.now(),
        )
        self._seed_otp("123456")

    def _seed_otp(self, code):
        WithdrawalOTPCode.objects.create(
            user=self.driver,
            code_hash=make_password(code),
            expires_at=timezone.now() + timedelta(minutes=10),
        )

    def test_wallet_summary_includes_period_earnings(self):
        self.client.force_authenticate(self.driver)
        response = self.client.get("/payments/withdrawals/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(Decimal(response.data["minimum_withdrawal"]), Decimal("500"))
        self.assertIn("earnings", response.data)
        self.assertIn("ledger", response.data)
        self.assertEqual(Decimal(response.data["available_balance"]), Decimal("640.00"))

    def test_rejects_bank_transfer_payout_method(self):
        self.client.force_authenticate(self.driver)
        response = self.client.post(
            "/payments/payout-methods/save/",
            {
                "payout_type": "bank_account",
                "bank_name": "BNM",
                "account_reference": "1234567890",
                "is_default": True,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    @patch("payments.withdrawal_service.send_sms")
    def test_send_withdrawal_otp(self, mock_sms):
        self.client.force_authenticate(self.driver)
        response = self.client.post("/payments/withdrawals/send-otp/", {}, format="json")
        self.assertEqual(response.status_code, 200)
        mock_sms.assert_called_once()

    def test_minimum_withdrawal_is_500(self):
        self.client.force_authenticate(self.driver)
        response = self.client.post(
            "/payments/withdrawals/request/",
            {
                "amount": "200",
                "payout_method": self.payout_method.id,
                "otp_code": "123456",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["code"], "below_minimum")

    def test_duplicate_pending_withdrawal_blocked(self):
        self.client.force_authenticate(self.driver)
        first = self.client.post(
            "/payments/withdrawals/request/",
            {
                "amount": "500",
                "payout_method": self.payout_method.id,
                "otp_code": "123456",
            },
            format="json",
        )
        self.assertEqual(first.status_code, 201)
        self._seed_otp("654321")
        second = self.client.post(
            "/payments/withdrawals/request/",
            {
                "amount": "500",
                "payout_method": self.payout_method.id,
                "otp_code": "654321",
            },
            format="json",
        )
        self.assertEqual(second.status_code, 400)
        self.assertEqual(second.data["code"], "duplicate_pending")

    def test_withdrawal_requires_valid_otp(self):
        self.client.force_authenticate(self.driver)
        response = self.client.post(
            "/payments/withdrawals/request/",
            {
                "amount": "500",
                "payout_method": self.payout_method.id,
                "otp_code": "000000",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["code"], "otp_invalid")

    def test_admin_approve_reject_mark_paid_flow(self):
        withdrawal = WithdrawalRequest.objects.create(
            driver=self.driver,
            payout_method=self.payout_method,
            amount=Decimal("500.00"),
            otp_verified_at=timezone.now(),
        )

        self.client.force_authenticate(self.admin)
        approve = self.client.post(f"/payments/withdrawals/{withdrawal.id}/approve/")
        self.assertEqual(approve.status_code, 200)
        withdrawal.refresh_from_db()
        self.assertEqual(withdrawal.status, "approved")
        self.assertIsNotNone(withdrawal.approved_at)

        paid = self.client.post(f"/payments/withdrawals/{withdrawal.id}/mark-paid/")
        self.assertEqual(paid.status_code, 200)
        withdrawal.refresh_from_db()
        self.assertEqual(withdrawal.status, "paid")
        self.assertIsNotNone(withdrawal.paid_at)
        self.assertTrue(
            WalletTransaction.objects.filter(
                wallet__owner=self.driver,
                transaction_type="withdrawal",
                reference=f"withdrawal:{withdrawal.id}",
            ).exists()
        )

    def test_admin_reject_creates_audit_trail(self):
        withdrawal = WithdrawalRequest.objects.create(
            driver=self.driver,
            payout_method=self.payout_method,
            amount=Decimal("500.00"),
        )
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            f"/payments/withdrawals/{withdrawal.id}/reject/",
            {"admin_note": "Invalid details"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(
            AuditLog.objects.filter(
                entity_type="payment",
                entity_id=str(withdrawal.id),
            ).exists()
        )

    def test_masravi_payout_method_supported(self):
        self.client.force_authenticate(self.driver)
        response = self.client.post(
            "/payments/payout-methods/save/",
            {
                "payout_type": "masravi",
                "phone_number": "+22248222222",
                "is_default": True,
            },
            format="json",
        )
        self.assertIn(response.status_code, [200, 201])
        self.assertEqual(
            DriverPayoutMethod.objects.filter(driver=self.driver, payout_type="masrvi").count(),
            1,
        )

    def test_sedad_payout_method_supported(self):
        self.client.force_authenticate(self.driver)
        response = self.client.post(
            "/payments/payout-methods/save/",
            {
                "payout_type": "sedad",
                "phone_number": "+22248333333",
                "is_default": True,
            },
            format="json",
        )
        self.assertIn(response.status_code, [200, 201])
        self.assertEqual(
            DriverPayoutMethod.objects.filter(driver=self.driver, payout_type="seddad").count(),
            1,
        )
