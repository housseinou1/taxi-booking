"""Atomic wallet balance updates."""

from decimal import Decimal

from django.db import transaction

from .models import WalletAccount, WalletTransaction


def get_or_create_wallet(user):
    wallet, _ = WalletAccount.objects.get_or_create(owner=user)
    return wallet


def apply_wallet_transaction(
    wallet, amount, is_credit, transaction_type, reference="", note="", status="completed"
):
    amount = Decimal(str(amount))
    if amount <= 0:
        raise ValueError("Amount must be positive.")
    with transaction.atomic():
        wallet = WalletAccount.objects.select_for_update().get(pk=wallet.pk)
        new_balance = wallet.balance + amount if is_credit else wallet.balance - amount
        if new_balance < 0:
            raise ValueError("Insufficient wallet balance.")
        wallet.balance = new_balance
        wallet.save(update_fields=["balance", "updated_at"])
        return WalletTransaction.objects.create(
            wallet=wallet,
            transaction_type=transaction_type,
            status=status,
            amount=amount,
            is_credit=is_credit,
            balance_after=new_balance,
            reference=reference,
            note=note,
        )
