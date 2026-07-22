from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import make_password
from django.test import TestCase
from django.utils import timezone

from rest_framework.test import APIClient

from unittest.mock import patch

from payments.models import (
    DriverPayoutMethod,
    WalletAccount,
    WalletTransaction,
    WithdrawalOTPCode,
    WithdrawalRequest,
)
from payments.wallet_ledger import apply_wallet_transaction
from taxi.drivers.models import DriverProfile
from taxi.rides.models import Ride

User = get_user_model()


class WalletWithdrawalFlowTests(TestCase):
    def setUp(self):
        # Avoid Redis/Celery dependency from driver QR code generation.
        self.qr_patch = patch("taxi.drivers.tasks.generate_qr_code_task.delay")
        self.qr_patch.start()

        self.client = APIClient()
        self.driver_user = User.objects.create_user(
            email="driver@yala.test",
            password="driverpass123",
            phone_number="1234567890",
            user_type="driver",
        )
        self.driver_profile = DriverProfile.objects.create(
            user=self.driver_user,
            status="approved",
            is_available=True,
        )
        self.admin_user = User.objects.create_user(
            email="admin@yala.test",
            password="adminpass123",
            is_staff=True,
        )
        self.accountant = User.objects.create_user(
            email="accountant@yala.test",
            password="accountantpass123",
            is_staff=True,
        )
        self.accountant.groups.create(name="Accountant")
        self.regular_user = User.objects.create_user(
            email="regular@yala.test",
            password="regularpass123",
        )
        self.rider_user = User.objects.create_user(
            email="rider@yala.test",
            password="riderpass123",
            user_type="rider",
        )

        # Seed wallet with earnings from a completed ride.
        self.ride = Ride.objects.create(
            driver=self.driver_user,
            rider=self.rider_user,
            status="completed",
            fare=Decimal("2000.00"),
            driver_earning=Decimal("1800.00"),
            app_fee=Decimal("200.00"),
            completed_at=timezone.now(),
        )
        wallet = WalletAccount.objects.get_or_create(owner=self.driver_user)[0]
        apply_wallet_transaction(
            wallet=wallet,
            amount=Decimal("1800.00"),
            is_credit=True,
            transaction_type="ride_earning",
            reference=f"ride:{self.ride.id}",
        )

    def tearDown(self):
        self.qr_patch.stop()

    def _login(self, user):
        self.client.force_authenticate(user=user)

    def test_wallet_data_returns_real_balances(self):
        self._login(self.driver_user)
        response = self.client.get("/payments/withdrawals/")
        self.assertEqual(response.status_code, 200)
        data = response.data
        self.assertEqual(Decimal(data["available_balance"]), Decimal("1800.00"))
        self.assertEqual(Decimal(data["pending_balance"]), Decimal("0.00"))
        self.assertEqual(Decimal(data["lifetime_earnings"]), Decimal("1800.00"))
        self.assertIn("today_earnings", data)
        self.assertIn("week_earnings", data)
        self.assertIn("month_earnings", data)
        self.assertIn("recent_transactions", data)
        self.assertIn("ledger", data)

    def test_payout_method_crud(self):
        self._login(self.driver_user)
        response = self.client.post(
            "/payments/payout-methods/save/",
            {
                "payout_type": "bankily",
                "phone_number": "12345678",
                "account_holder_name": "Test Driver",
            },
        )
        self.assertEqual(response.status_code, 201)
        method_id = response.data["id"]
        self.assertEqual(response.data["payout_type"], "bankily")
        self.assertEqual(response.data["masked_account"], "•••• 5678")

        response = self.client.get("/payments/payout-methods/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["phone_number"], "12345678")
        self.assertEqual(response.data[0]["masked_account"], "•••• 5678")

        response = self.client.post(
            "/payments/payout-methods/save/",
            {
                "payout_type": "bankily",
                "phone_number": "87654321",
                "account_holder_name": "Test Driver",
            },
        )
        self.assertEqual(response.status_code, 200)
        method = DriverPayoutMethod.objects.get(id=method_id)
        self.assertEqual(method.phone_number, "87654321")

    def test_withdrawal_request_requires_minimum_and_fails_insufficient_balance(self):
        self._login(self.driver_user)
        method = DriverPayoutMethod.objects.create(
            driver=self.driver_user,
            payout_type="bankily",
            phone_number="12345678",
            is_default=True,
        )
        WithdrawalOTPCode.objects.create(
            user=self.driver_user,
            code_hash=make_password("123456"),
            expires_at=timezone.now() + timedelta(minutes=10),
        )
        # Below minimum
        response = self.client.post(
            "/payments/wallet/withdrawals/",
            {
                "amount": "400.00",
                "method": "bankily",
                "payout_method_id": method.id,
                "otp_code": "123456",
                "idempotency_key": "key-1",
            },
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["code"], "below_minimum")

        # Over balance
        response = self.client.post(
            "/payments/wallet/withdrawals/",
            {
                "amount": "5000.00",
                "method": "bankily",
                "payout_method_id": method.id,
                "otp_code": "123456",
                "idempotency_key": "key-2",
            },
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["code"], "insufficient_balance")

    def test_successful_withdrawal_moves_balance_and_creates_ledger(self):
        self._login(self.driver_user)
        method = DriverPayoutMethod.objects.create(
            driver=self.driver_user,
            payout_type="bankily",
            phone_number="12345678",
            is_default=True,
        )
        WithdrawalOTPCode.objects.create(
            user=self.driver_user,
            code_hash=make_password("123456"),
            expires_at=timezone.now() + timedelta(minutes=10),
        )
        response = self.client.post(
            "/payments/wallet/withdrawals/",
            {
                "amount": "1000.00",
                "method": "bankily",
                "payout_method_id": method.id,
                "otp_code": "123456",
                "idempotency_key": "key-3",
            },
        )
        self.assertEqual(response.status_code, 201)
        withdrawal_id = response.data["withdrawal"]["id"]

        wallet = WalletAccount.objects.get(owner=self.driver_user)
        self.assertEqual(wallet.balance, Decimal("800.00"))
        self.assertEqual(wallet.pending_balance, Decimal("1000.00"))

        withdrawal = WithdrawalRequest.objects.get(id=withdrawal_id)
        self.assertEqual(withdrawal.status, "pending")
        self.assertTrue(
            WalletTransaction.objects.filter(
                wallet=wallet, reference=f"withdrawal:{withdrawal_id}", status="pending"
            ).exists()
        )

    def test_duplicate_pending_withdrawal_blocked(self):
        self._login(self.driver_user)
        method = DriverPayoutMethod.objects.create(
            driver=self.driver_user,
            payout_type="bankily",
            phone_number="12345678",
            is_default=True,
        )
        WithdrawalOTPCode.objects.create(
            user=self.driver_user,
            code_hash=make_password("123456"),
            expires_at=timezone.now() + timedelta(minutes=10),
        )
        self.client.post(
            "/payments/wallet/withdrawals/",
            {
                "amount": "500.00",
                "method": "bankily",
                "payout_method_id": method.id,
                "otp_code": "123456",
                "idempotency_key": "key-4",
            },
        )
        response = self.client.post(
            "/payments/wallet/withdrawals/",
            {
                "amount": "500.00",
                "method": "bankily",
                "payout_method_id": method.id,
                "otp_code": "123456",
                "idempotency_key": "key-5",
            },
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["code"], "duplicate_pending")

    def test_admin_approve_reject_mark_paid_flow(self):
        self._login(self.driver_user)
        method = DriverPayoutMethod.objects.create(
            driver=self.driver_user,
            payout_type="bankily",
            phone_number="12345678",
            is_default=True,
        )
        WithdrawalOTPCode.objects.create(
            user=self.driver_user,
            code_hash=make_password("123456"),
            expires_at=timezone.now() + timedelta(minutes=10),
        )
        response = self.client.post(
            "/payments/wallet/withdrawals/",
            {
                "amount": "1000.00",
                "method": "bankily",
                "payout_method_id": method.id,
                "otp_code": "123456",
                "idempotency_key": "key-6",
            },
        )
        withdrawal_id = response.data["withdrawal"]["id"]

        self._login(self.admin_user)
        response = self.client.post(f"/payments/withdrawals/{withdrawal_id}/approve/")
        self.assertEqual(response.status_code, 200)
        withdrawal = WithdrawalRequest.objects.get(id=withdrawal_id)
        self.assertEqual(withdrawal.status, "approved")

        self._login(self.accountant)
        response = self.client.post(
            f"/payments/withdrawals/{withdrawal_id}/mark-paid/",
            {"payment_reference": "REF-12345"},
        )
        self.assertEqual(response.status_code, 200)
        withdrawal = WithdrawalRequest.objects.get(id=withdrawal_id)
        self.assertEqual(withdrawal.status, "paid")
        self.assertEqual(withdrawal.payment_reference, "REF-12345")
        wallet = WalletAccount.objects.get(owner=self.driver_user)
        self.assertEqual(wallet.balance, Decimal("800.00"))
        self.assertEqual(wallet.pending_balance, Decimal("0.00"))

    def test_reject_returns_funds(self):
        self._login(self.driver_user)
        method = DriverPayoutMethod.objects.create(
            driver=self.driver_user,
            payout_type="bankily",
            phone_number="12345678",
            is_default=True,
        )
        WithdrawalOTPCode.objects.create(
            user=self.driver_user,
            code_hash=make_password("123456"),
            expires_at=timezone.now() + timedelta(minutes=10),
        )
        response = self.client.post(
            "/payments/wallet/withdrawals/",
            {
                "amount": "1000.00",
                "method": "bankily",
                "payout_method_id": method.id,
                "otp_code": "123456",
                "idempotency_key": "key-7",
            },
        )
        withdrawal_id = response.data["withdrawal"]["id"]

        self._login(self.admin_user)
        response = self.client.post(
            f"/payments/withdrawals/{withdrawal_id}/reject/",
            {"admin_note": "Invalid details"},
        )
        self.assertEqual(response.status_code, 200)
        withdrawal = WithdrawalRequest.objects.get(id=withdrawal_id)
        self.assertEqual(withdrawal.status, "rejected")
        wallet = WalletAccount.objects.get(owner=self.driver_user)
        self.assertEqual(wallet.balance, Decimal("1800.00"))
        self.assertEqual(wallet.pending_balance, Decimal("0.00"))

    def test_non_driver_cannot_withdraw(self):
        self._login(self.regular_user)
        response = self.client.post(
            "/payments/wallet/withdrawals/",
            {
                "amount": "1000.00",
                "method": "bankily",
                "payout_method_id": 1,
                "otp_code": "123456",
                "idempotency_key": "key-8",
            },
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["code"], "not_driver")

    def test_unapproved_driver_cannot_withdraw(self):
        self.driver_profile.status = "pending"
        self.driver_profile.save()
        self._login(self.driver_user)
        method = DriverPayoutMethod.objects.create(
            driver=self.driver_user,
            payout_type="bankily",
            phone_number="12345678",
            is_default=True,
        )
        response = self.client.post(
            "/payments/wallet/withdrawals/",
            {
                "amount": "1000.00",
                "method": "bankily",
                "payout_method_id": method.id,
                "otp_code": "123456",
                "idempotency_key": "key-9",
            },
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["code"], "driver_not_approved")

    def test_regular_user_cannot_access_admin_withdrawal_actions(self):
        self._login(self.regular_user)
        response = self.client.post("/payments/withdrawals/1/approve/")
        self.assertEqual(response.status_code, 403)
