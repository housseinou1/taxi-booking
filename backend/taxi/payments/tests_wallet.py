from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase

from .models import WalletAccount
from .views import apply_wallet_transaction


class WalletTransactionTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(email="rider@example.com", password="test-pass")
        self.wallet = WalletAccount.objects.create(owner=self.user)

    def test_credit_and_debit_update_ledger_balance(self):
        credit = apply_wallet_transaction(self.wallet, 500, True, "top_up")
        debit = apply_wallet_transaction(self.wallet, 125, False, "ride_payment")

        self.wallet.refresh_from_db()
        self.assertEqual(self.wallet.balance, Decimal("375"))
        self.assertEqual(credit.balance_after, Decimal("500"))
        self.assertEqual(debit.balance_after, Decimal("375"))

    def test_wallet_cannot_be_overdrawn(self):
        with self.assertRaisesMessage(ValueError, "Insufficient wallet balance."):
            apply_wallet_transaction(self.wallet, 1, False, "ride_payment")
