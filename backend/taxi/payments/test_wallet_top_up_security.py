"""Regression: a client-supplied provider_token must never credit a wallet."""

from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from payments.models import PaymentRecord, WalletTransaction
from payments.provider_security import assert_verified_confirmation
from payments.providers import get_provider
from payments.providers.base import ProviderResponseUnverified
from payments.settlement_service import SettlementError, wallet_top_up
from payments.wallet_ledger import get_or_create_wallet

pytestmark = pytest.mark.django_db

User = get_user_model()
URL = "/payments/wallet/top-up/"


@pytest.fixture
def rider():
    return User.objects.create_user(
        email="topup-rider@example.com", password=None, user_type="rider", is_active=True
    )


def _balance(user):
    return get_or_create_wallet(user).balance


@pytest.mark.parametrize("method", ["bankily", "masravi", "masrvi", "sedad", "seddad", "card"])
def test_arbitrary_provider_token_does_not_credit_wallet(rider, method):
    result = wallet_top_up(rider, 5000, method=method, provider_token="forged-token-123")

    assert result["status"] == "pending"
    assert result["verified"] is False
    assert result["transaction"] is None
    assert _balance(rider) == Decimal(0)
    assert not WalletTransaction.objects.filter(wallet=get_or_create_wallet(rider)).exists()
    assert not PaymentRecord.objects.filter(customer=rider, status="paid").exists()


def test_top_up_endpoint_with_forged_token_stays_pending(rider):
    client = APIClient()
    client.force_authenticate(rider)

    for _ in range(3):
        response = client.post(
            URL, {"amount": 10000, "method": "bankily", "provider_token": "anything"}, format="json"
        )
        assert response.status_code == 202
        assert response.data["status"] == "pending"
        assert Decimal(response.data["wallet_balance"]) == 0
        assert "provider_token" not in response.data

    assert _balance(rider) == Decimal(0)
    assert not WalletTransaction.objects.filter(wallet=get_or_create_wallet(rider)).exists()


def test_top_up_rejects_cash_wallet_and_invalid_amounts(rider):
    for method in ("cash", "wallet", "promo_credit"):
        with pytest.raises(SettlementError):
            wallet_top_up(rider, 100, method=method, provider_token="x")
    for amount in (0, -50):
        with pytest.raises(SettlementError):
            wallet_top_up(rider, amount, method="bankily", provider_token="x")
    assert _balance(rider) == Decimal(0)


def test_top_up_requires_authentication():
    response = APIClient().post(URL, {"amount": 100, "method": "bankily", "provider_token": "x"}, format="json")
    assert response.status_code in (401, 403)


def test_mock_provider_confirmation_can_never_settle():
    provider = get_provider("bankily")
    collection = provider.create_collection(amount=100, reference="TOP-TEST")
    confirmation = provider.verify_collection(reference=collection.reference)

    assert confirmation.verified is False
    with pytest.raises(ProviderResponseUnverified):
        assert_verified_confirmation(confirmation)
