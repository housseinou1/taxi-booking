"""Regression: delivery prepayment and merchant settlement never mark a digital
payment paid (or credit a wallet) on a client-supplied provider_token alone."""

from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from merchants.models import Merchant, MerchantOrder
from merchants.services.order_service import MerchantOrderService
from payments.models import PaymentRecord, WalletTransaction
from payments.provider_security import apply_verified_confirmation
from payments.providers import get_provider
from payments.providers.base import ProviderResponseUnverified
from payments.settlement_service import (
    DELIVERY_PREPAY_METHODS,
    prepay_delivery_request,
    settle_merchant_order_payment,
)

pytestmark = pytest.mark.django_db

User = get_user_model()
FORGED = "forged-token-123"


@pytest.fixture
def customer():
    return User.objects.create_user(
        email="pay-sec-customer@example.com", password=None, user_type="rider", is_active=True
    )


@pytest.fixture
def order(customer):
    owner = User.objects.create_user(
        email="pay-sec-merchant@example.com", password=None, user_type="merchant", is_active=True
    )
    merchant = Merchant.objects.create(
        owner=owner,
        business_name="Pay Sec Bistro",
        owner_name="Owner",
        phone_number="+22248101020",
        email="pay-sec-merchant@example.com",
        address="Nouakchott",
        merchant_type="restaurant",
        business_type="restaurant",
        status="approved",
        is_active=True,
        approved_at=timezone.now(),
    )
    return MerchantOrder.objects.create(
        customer=customer,
        merchant=merchant,
        status="new_order",
        subtotal=Decimal("500"),
        delivery_fee=Decimal("100"),
        total=Decimal("600"),
        payment_method="bankily",
        payment_status="pending",
        delivery_address="Test address",
        recipient_name="Rider",
        recipient_phone="+22248101021",
    )


@pytest.mark.parametrize("method", sorted(DELIVERY_PREPAY_METHODS))
def test_delivery_prepay_with_forged_token_stays_pending(customer, method):
    record = prepay_delivery_request(customer, 500, method, provider_token=FORGED)

    record.refresh_from_db()
    assert record.status == "pending"
    assert not PaymentRecord.objects.filter(customer=customer, status="paid").exists()
    assert not WalletTransaction.objects.exists()


@pytest.mark.parametrize("timing", ["before_delivery", "after_delivery"])
@pytest.mark.parametrize("method", ["bankily", "masravi", "sedad", "card"])
def test_merchant_settlement_with_forged_token_does_not_pay_or_credit(order, method, timing):
    record = settle_merchant_order_payment(
        order, payment_method=method, payment_timing=timing, provider_token=FORGED
    )

    order.refresh_from_db()
    assert record.status == "pending"
    assert order.payment_status == "pending"
    assert not WalletTransaction.objects.exists()


def test_repeated_forged_merchant_settlements_stay_pending(order):
    for _ in range(3):
        settle_merchant_order_payment(order, payment_method="bankily", provider_token=FORGED)
    assert not PaymentRecord.objects.filter(merchant_order=order, status="paid").exists()
    assert not WalletTransaction.objects.exists()


def test_pay_merchant_order_endpoint_with_forged_token_stays_pending(order, customer):
    client = APIClient()
    client.force_authenticate(customer)
    res = client.post(
        f"/payments/wallet/pay-merchant-order/{order.id}/",
        {"payment_method": "bankily", "provider_token": FORGED},
        format="json",
    )

    assert res.status_code == 200
    assert res.data["status"] == "pending"
    order.refresh_from_db()
    assert order.payment_status == "pending"
    assert not WalletTransaction.objects.exists()


def test_marking_order_delivered_is_not_proof_of_payment(order):
    order.status = "picked_up"
    order.save(update_fields=["status"])

    MerchantOrderService().mark_delivered(order)

    order.refresh_from_db()
    assert order.status == "delivered"
    assert order.payment_status == "pending"


def test_mock_confirmation_cannot_settle_a_pending_record(customer):
    record = prepay_delivery_request(customer, 500, "bankily", provider_token=FORGED)
    provider = get_provider("bankily")
    mock = provider.create_collection(amount=Decimal("500"), reference=record.transaction_id, customer=None)

    with pytest.raises(ProviderResponseUnverified):
        apply_verified_confirmation(record, mock)
    record.refresh_from_db()
    assert record.status == "pending"
