"""
Real end-to-end withdrawal certification.

Creates a QA driver with wallet balance, runs the full withdrawal lifecycle,
and prints certification evidence.

Usage:
    python manage.py certify_withdrawal --email qa-driver@yala.test --password TestPass123! --balance 5000
"""

from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import make_password
from django.core.management.base import BaseCommand
from django.utils import timezone
from rest_framework.test import APIClient

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


class Command(BaseCommand):
    help = "Certify the real driver-to-admin withdrawal flow end to end."

    def add_arguments(self, parser):
        parser.add_argument("--email", default="qa-driver@yala.test")
        parser.add_argument("--password", default="TestPass123!")
        parser.add_argument("--balance", type=int, default=5000)
        parser.add_argument("--payout-type", default="bankily")
        parser.add_argument("--phone", default="12345678")
        parser.add_argument("--cleanup", action="store_true", default=False)

    def handle(self, *args, **options):
        # Avoid Redis/Celery dependency from driver QR code generation.
        qr_patch = patch("taxi.drivers.tasks.generate_qr_code_task.delay")
        qr_patch.start()

        email = options["email"]
        password = options["password"]
        target_balance = Decimal(str(options["balance"]))
        payout_type = options["payout_type"]
        phone = options["phone"]

        if options["cleanup"]:
            User.objects.filter(email=email).delete()
            self.stdout.write(self.style.SUCCESS("Cleaned up QA driver."))
            qr_patch.stop()
            return

        try:
            self._run_certification(email, password, target_balance, payout_type, phone)
        finally:
            qr_patch.stop()

    def _run_certification(self, email, password, target_balance, payout_type, phone):
        # Create or reset QA driver.
        user, created = User.objects.update_or_create(
            email=email,
            defaults={
                "user_type": "driver",
                "phone_number": phone,
                "password": make_password(password),
                "is_active": True,
            },
        )
        profile, _ = DriverProfile.objects.update_or_create(
            user=user,
            defaults={"status": "approved", "is_available": True},
        )

        # Seed wallet with completed ride earnings.
        Ride.objects.filter(driver=user).delete()
        fare = target_balance + (target_balance * Decimal("0.1"))  # leave room for app fee
        ride = Ride.objects.create(
            driver=user,
            rider=user,  # self-ride is fine for QA
            status="completed",
            fare=fare,
            driver_earning=target_balance,
            app_fee=fare - target_balance,
            completed_at=timezone.now(),
        )
        wallet, _ = WalletAccount.objects.get_or_create(owner=user)
        WalletTransaction.objects.filter(wallet=wallet).delete()
        apply_wallet_transaction(
            wallet=wallet,
            amount=target_balance,
            is_credit=True,
            transaction_type="ride_earning",
            reference=f"ride:{ride.id}",
        )

        # Ensure payout method.
        DriverPayoutMethod.objects.filter(driver=user).delete()
        method = DriverPayoutMethod.objects.create(
            driver=user,
            payout_type=payout_type,
            phone_number=phone,
            is_default=True,
        )

        driver_client = APIClient()
        driver_client.force_authenticate(user=user)

        def refresh_otp():
            WithdrawalOTPCode.objects.filter(user=user).delete()
            code = "654321"
            WithdrawalOTPCode.objects.create(
                user=user,
                code_hash=make_password(code),
                expires_at=timezone.now() + timezone.timedelta(minutes=10),
            )
            return code

        # --- Driver: view wallet ---
        wallet_data = driver_client.get("/payments/withdrawals/").data
        if "available_balance" not in wallet_data:
            raise KeyError(f"available_balance not in wallet response: {wallet_data}")
        balance_before = Decimal(wallet_data["available_balance"])
        self.stdout.write(f"Driver wallet available balance: {balance_before} MRU")
        assert balance_before == target_balance, "Balance mismatch after seeding"

        # --- Driver: request withdrawal ---
        otp_code = refresh_otp()
        response = driver_client.post(
            "/payments/wallet/withdrawals/",
            {
                "amount": "1000.00",
                "method": payout_type,
                "payout_method_id": method.id,
                "otp_code": otp_code,
                "idempotency_key": "cert-key-1",
            },
            format="json",
        )
        assert response.status_code == 201, f"Withdrawal failed: {response.data}"
        withdrawal_1_id = response.data["withdrawal"]["id"]
        reference_1 = response.data["withdrawal"]["reference"]
        self.stdout.write(f"Withdrawal #{withdrawal_1_id} created, reference {reference_1}")

        # --- Driver: refresh wallet ---
        wallet_data = driver_client.get("/payments/withdrawals/").data
        balance_after_request = Decimal(wallet_data["available_balance"])
        pending_after_request = Decimal(wallet_data["pending_balance"])
        self.stdout.write(
            f"After request: available={balance_after_request}, pending={pending_after_request}"
        )
        assert balance_after_request == target_balance - Decimal("1000.00")
        assert pending_after_request == Decimal("1000.00")

        # --- Security: duplicate pending blocked ---
        refresh_otp()
        response = driver_client.post(
            "/payments/wallet/withdrawals/",
            {
                "amount": "500.00",
                "method": payout_type,
                "payout_method_id": method.id,
                "otp_code": otp_code,
                "idempotency_key": "cert-key-2",
            },
            format="json",
        )
        assert response.status_code == 400, f"Duplicate pending should be blocked: {response.data}"
        assert response.data["code"] == "duplicate_pending", f"Unexpected code: {response.data}"

        # --- Admin: create admin user ---
        admin_email = "qa-admin@yala.test"
        admin_user, _ = User.objects.update_or_create(
            email=admin_email,
            defaults={
                "is_staff": True,
                "is_superuser": True,
                "password": make_password(password),
            },
        )
        admin_client = APIClient()
        admin_client.force_authenticate(user=admin_user)

        # --- Admin: approve ---
        response = admin_client.post(
            f"/payments/withdrawals/{withdrawal_1_id}/approve/",
            {"admin_note": "Approved for certification"},
            format="json",
        )
        assert response.status_code == 200, f"Approve failed: {response.data}"
        self.stdout.write(f"Withdrawal #{withdrawal_1_id} approved")

        # --- Admin: mark paid ---
        payment_reference = "QA-PAY-REF-001"
        response = admin_client.post(
            f"/payments/withdrawals/{withdrawal_1_id}/mark-paid/",
            {"payment_reference": payment_reference},
            format="json",
        )
        assert response.status_code == 200, f"Mark paid failed: {response.data}"
        self.stdout.write(f"Withdrawal #{withdrawal_1_id} marked paid ({payment_reference})")

        # --- Driver: refresh wallet ---
        wallet_data = driver_client.get("/payments/withdrawals/").data
        balance_after_paid = Decimal(wallet_data["available_balance"])
        pending_after_paid = Decimal(wallet_data["pending_balance"])
        self.stdout.write(
            f"After paid: available={balance_after_paid}, pending={pending_after_paid}"
        )
        assert balance_after_paid == target_balance - Decimal("1000.00")
        assert pending_after_paid == Decimal("0.00")

        # --- Security: below minimum rejected (no pending withdrawal now) ---
        refresh_otp()
        response = driver_client.post(
            "/payments/wallet/withdrawals/",
            {
                "amount": "100.00",
                "method": payout_type,
                "payout_method_id": method.id,
                "otp_code": otp_code,
                "idempotency_key": "cert-key-3",
            },
            format="json",
        )
        assert response.status_code == 400, f"Below minimum should be rejected: {response.data}"
        assert response.data["code"] == "below_minimum", f"Unexpected code: {response.data}"

        # --- Security: over balance rejected (no pending withdrawal now) ---
        refresh_otp()
        response = driver_client.post(
            "/payments/wallet/withdrawals/",
            {
                "amount": "100000.00",
                "method": payout_type,
                "payout_method_id": method.id,
                "otp_code": otp_code,
                "idempotency_key": "cert-key-4",
            },
            format="json",
        )
        assert response.status_code == 400, f"Over balance should be rejected: {response.data}"
        assert response.data["code"] == "insufficient_balance", f"Unexpected code: {response.data}"

        # --- Rejection test ---
        refresh_otp()
        response = driver_client.post(
            "/payments/wallet/withdrawals/",
            {
                "amount": "500.00",
                "method": payout_type,
                "payout_method_id": method.id,
                "otp_code": otp_code,
                "idempotency_key": "cert-key-reject",
            },
            format="json",
        )
        assert response.status_code == 201, f"Second withdrawal failed: {response.data}"
        withdrawal_2_id = response.data["withdrawal"]["id"]

        balance_before_reject = Decimal(
            driver_client.get("/payments/withdrawals/").data["available_balance"]
        )

        response = admin_client.post(
            f"/payments/withdrawals/{withdrawal_2_id}/reject/",
            {"admin_note": "QA rejection test"},
            format="json",
        )
        assert response.status_code == 200, f"Reject failed: {response.data}"

        wallet_data = driver_client.get("/payments/withdrawals/").data
        balance_after_reject = Decimal(wallet_data["available_balance"])
        pending_after_reject = Decimal(wallet_data["pending_balance"])
        self.stdout.write(
            f"After reject: available={balance_after_reject}, pending={pending_after_reject}"
        )
        assert balance_after_reject == balance_before_reject + Decimal("500.00")
        assert pending_after_reject == Decimal("0.00")

        # Verify final statuses.
        w1 = WithdrawalRequest.objects.get(id=withdrawal_1_id)
        w2 = WithdrawalRequest.objects.get(id=withdrawal_2_id)
        assert w1.status == "paid"
        assert w1.payment_reference == payment_reference
        assert w2.status == "rejected"
        assert w2.admin_note == "QA rejection test"

        # Count ledger transactions to ensure no duplicates.
        ledger_count = WalletTransaction.objects.filter(
            wallet__owner=user, transaction_type="withdrawal"
        ).count()
        self.stdout.write(f"Total withdrawal ledger entries for driver: {ledger_count}")

        self.stdout.write(self.style.SUCCESS("\n=== WITHDRAWAL CERTIFICATION PASSED ==="))
        self.stdout.write(f"QA driver: {email} / password: {password}")
        self.stdout.write(f"QA admin: {admin_email} / password: {password}")
        self.stdout.write(f"Withdrawal #1 (paid): id={withdrawal_1_id}, reference={reference_1}, payment_reference={payment_reference}")
        self.stdout.write(f"Withdrawal #2 (rejected): id={withdrawal_2_id}")
        self.stdout.write(f"Balance before: {target_balance} MRU")
        self.stdout.write(f"Balance after paid: {balance_after_paid} MRU")
        self.stdout.write(f"Balance after reject: {balance_after_reject} MRU")
