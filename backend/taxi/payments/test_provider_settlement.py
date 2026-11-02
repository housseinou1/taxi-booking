"""Regression: only an independently verified live provider confirmation settles a
payment, exactly once, and never for forged, mismatched, mock or failed results."""

from decimal import Decimal
from types import SimpleNamespace

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from merchants.models import Merchant, MerchantOrder
from payments import webhook_views
from payments.models import Payment, PaymentRecord, WalletTransaction
from payments.provider_settlement import SettlementRefused, settle_verified_payment
from payments.providers import MODE_LIVE, MODE_MOCK, ProviderResponseUnverified, ProviderResult, WebhookVerification
from payments.serializers import PaymentRecordSerializer, PaymentSerializer
from payments.services import capture_ride_payment
from payments.settlement_service import prepay_delivery_request, settle_merchant_order_payment, wallet_top_up
from payments.wallet_ledger import get_or_create_wallet

pytestmark = pytest.mark.django_db
User = get_user_model()


def live(provider, reference, amount, status="succeeded", verified=True, **payload):
    return ProviderResult(
        provider=provider, reference=reference, status=status, verified=verified,
        mode=MODE_LIVE, amount=str(amount), payload=payload,
    )


@pytest.fixture
def customer():
    return User.objects.create_user(email="settle-customer@example.com", password=None, user_type="rider")


@pytest.fixture
def order(customer):
    owner = User.objects.create_user(email="settle-merchant@example.com", password=None, user_type="merchant")
    merchant = Merchant.objects.create(
        owner=owner, business_name="Settle Bistro", owner_name="Owner", phone_number="+22248101030",
        email="settle-merchant@example.com", address="Nouakchott", merchant_type="restaurant",
        business_type="restaurant", status="approved", is_active=True, approved_at=timezone.now(),
    )
    return MerchantOrder.objects.create(
        customer=customer, merchant=merchant, status="new_order", subtotal=Decimal("500"),
        delivery_fee=Decimal("100"), total=Decimal("600"), payment_method="bankily",
        payment_status="pending", delivery_address="A", recipient_name="R", recipient_phone="+22248101031",
    )


@pytest.fixture
def merchant_record(order):
    return settle_merchant_order_payment(order, payment_method="bankily", provider_token="forged")


def _merchant_credits(order):
    return WalletTransaction.objects.filter(transaction_type="merchant_earning", reference=f"merchant_order:{order.id}")


def test_mock_result_never_settles(merchant_record):
    mock = ProviderResult(provider="bankily", reference=merchant_record.transaction_id, status="succeeded",
                          verified=False, mode=MODE_MOCK, amount=str(merchant_record.amount))
    with pytest.raises(ProviderResponseUnverified):
        settle_verified_payment("bankily", mock)
    merchant_record.refresh_from_db()
    assert merchant_record.status == "pending"
    assert not WalletTransaction.objects.exists()


def test_unverified_live_result_never_settles(merchant_record):
    with pytest.raises(ProviderResponseUnverified):
        settle_verified_payment("bankily", live("bankily", merchant_record.transaction_id, merchant_record.amount, verified=False))
    merchant_record.refresh_from_db()
    assert merchant_record.status == "pending"


@pytest.mark.parametrize("reference", ["", "forged-token-123", "ORD-DOESNOTEXIST"])
def test_forged_reference_is_refused(merchant_record, reference):
    with pytest.raises(SettlementRefused) as exc:
        settle_verified_payment("bankily", live("bankily", reference, merchant_record.amount))
    assert exc.value.code == "unknown_reference"
    merchant_record.refresh_from_db()
    assert merchant_record.status == "pending"
    assert not WalletTransaction.objects.exists()


def test_amount_mismatch_is_refused(merchant_record):
    with pytest.raises(SettlementRefused) as exc:
        settle_verified_payment("bankily", live("bankily", merchant_record.transaction_id, "1"))
    assert exc.value.code == "amount_mismatch"
    assert not WalletTransaction.objects.exists()


@pytest.mark.parametrize("provider", ["card", "masravi", "sedad"])
def test_provider_mismatch_is_refused(merchant_record, provider):
    with pytest.raises(SettlementRefused) as exc:
        settle_verified_payment(provider, live(provider, merchant_record.transaction_id, merchant_record.amount))
    assert exc.value.code == "provider_mismatch"


def test_result_from_another_provider_is_refused(merchant_record):
    with pytest.raises(SettlementRefused):
        settle_verified_payment("bankily", live("card", merchant_record.transaction_id, merchant_record.amount))


def test_verified_merchant_settlement_credits_merchant_once(order, merchant_record):
    result = live("bankily", merchant_record.transaction_id, merchant_record.amount, provider_reference="BNK-1")
    outcome = settle_verified_payment("bankily", result)
    assert outcome.settled and not outcome.duplicate

    merchant_record.refresh_from_db()
    order.refresh_from_db()
    assert merchant_record.status == "paid"
    assert merchant_record.provider_reference == "BNK-1"
    assert PaymentRecordSerializer(merchant_record).data["provider_verified"] is True
    assert order.payment_status == "paid"
    assert get_or_create_wallet(order.merchant.owner).balance == merchant_record.merchant_earning
    assert _merchant_credits(order).count() == 1

    for _ in range(3):
        again = settle_verified_payment("bankily", result)
        assert again.duplicate and not again.settled
    assert _merchant_credits(order).count() == 1
    assert get_or_create_wallet(order.merchant.owner).balance == merchant_record.merchant_earning


def test_one_provider_reference_cannot_settle_two_payments(order, merchant_record, customer):
    other = prepay_delivery_request(customer, 600, "bankily")
    settle_verified_payment("bankily", live("bankily", merchant_record.transaction_id, merchant_record.amount, provider_reference="BNK-SAME"))
    with pytest.raises(SettlementRefused) as exc:
        settle_verified_payment("bankily", live("bankily", other.transaction_id, other.amount, provider_reference="BNK-SAME"))
    assert exc.value.code == "duplicate_reference"
    other.refresh_from_db()
    assert other.status == "pending"


@pytest.mark.parametrize("failure", ["failed", "rejected"])
def test_verified_failed_payment_is_marked_failed_without_credit(order, merchant_record, failure):
    outcome = settle_verified_payment("bankily", live("bankily", merchant_record.transaction_id, merchant_record.amount, status=failure))
    assert not outcome.settled
    merchant_record.refresh_from_db()
    order.refresh_from_db()
    assert merchant_record.status == "failed"
    assert order.payment_status == "failed"
    assert not WalletTransaction.objects.exists()
    with pytest.raises(SettlementRefused):
        settle_verified_payment("bankily", live("bankily", merchant_record.transaction_id, merchant_record.amount))


@pytest.mark.parametrize("state", ["cancelled", "refunded"])
def test_closed_payment_cannot_be_settled(merchant_record, state):
    merchant_record.status = state
    merchant_record.save(update_fields=["status"])
    with pytest.raises(SettlementRefused) as exc:
        settle_verified_payment("bankily", live("bankily", merchant_record.transaction_id, merchant_record.amount))
    assert exc.value.code == "not_settleable"
    assert not WalletTransaction.objects.exists()


@pytest.mark.parametrize("method,provider", [("bankily", "bankily"), ("masravi", "masravi"), ("sedad", "sedad"), ("card", "card")])
def test_delivery_prepayment_settles_only_with_matching_verified_provider(customer, method, provider):
    record = prepay_delivery_request(customer, 500, method, provider_token="forged")
    assert PaymentRecordSerializer(record).data["provider_verified"] is False
    settle_verified_payment(provider, live(provider, record.transaction_id, record.amount))
    record.refresh_from_db()
    assert record.status == "paid"
    assert record.provider_verified_at is not None


def test_wallet_top_up_credits_once_after_verified_confirmation(customer):
    result = wallet_top_up(customer, 2000, method="bankily", provider_token="forged")
    record = PaymentRecord.objects.get(source="wallet_top_up", transaction_id=result["reference"])
    assert record.status == "pending"
    assert get_or_create_wallet(customer).balance == Decimal("0")

    confirmation = live("bankily", result["reference"], "2000.00")
    assert settle_verified_payment("bankily", confirmation).settled
    for _ in range(2):
        assert settle_verified_payment("bankily", confirmation).duplicate
    assert get_or_create_wallet(customer).balance == Decimal("2000.00")
    assert WalletTransaction.objects.filter(transaction_type="top_up").count() == 1


class _Ride(SimpleNamespace):
    def save(self, **kwargs):
        pass


def _authorized_payment(customer, method, ride_id):
    return Payment.objects.create(
        rider=customer, ride_id=ride_id, amount=Decimal("300"), app_fee=Decimal("30"),
        driver_earning=Decimal("270"), method=method, status="authorized", transaction_id=f"AUTH-{method}-{ride_id}",
    )


@pytest.mark.parametrize("method", ["card", "bankily", "masrvi", "seddad", "bank_account"])
def test_ride_completion_does_not_confirm_electronic_payment(customer, method):
    payment = _authorized_payment(customer, method, 901)
    capture_ride_payment(_Ride(id=901, app_fee=0, driver_earning=0))
    payment.refresh_from_db()
    assert payment.status == "pending_verification"
    assert PaymentSerializer(payment).data["provider_verified"] is False


def test_ride_completion_still_captures_non_electronic_payment(customer):
    payment = _authorized_payment(customer, "corporate", 902)
    capture_ride_payment(_Ride(id=902, app_fee=0, driver_earning=0))
    payment.refresh_from_db()
    assert payment.status == "paid"


def test_ride_card_payment_settles_only_from_verified_provider(customer):
    payment = _authorized_payment(customer, "card", 903)
    capture_ride_payment(_Ride(id=903, app_fee=0, driver_earning=0))
    with pytest.raises(SettlementRefused):
        settle_verified_payment("bankily", live("bankily", payment.transaction_id, payment.amount))
    assert settle_verified_payment("card", live("card", payment.transaction_id, payment.amount)).settled
    payment.refresh_from_db()
    assert payment.status == "paid" and payment.provider_verified_at is not None
    assert settle_verified_payment("card", live("card", payment.transaction_id, payment.amount)).duplicate


class _LiveProvider:
    code = "bankily"
    display_name = "Bankily"

    def __init__(self, result):
        self.result = result
        self.calls = 0

    def verify_collection(self, *, reference):
        self.calls += 1
        return self.result if reference == self.result.reference else live("bankily", reference, "0", status="pending")


def _post_webhook(monkeypatch, provider, verification):
    monkeypatch.setattr(webhook_views, "get_provider", lambda code: provider)
    monkeypatch.setattr(webhook_views, "verify_webhook", lambda code, body, headers: verification)
    return APIClient().post("/payments/webhooks/bankily/", {}, format="json")


def test_live_webhook_settles_once_after_server_side_verification(monkeypatch, order, merchant_record):
    provider = _LiveProvider(live("bankily", merchant_record.transaction_id, merchant_record.amount))
    event = WebhookVerification(provider="bankily", verified=True, mode=MODE_LIVE,
                                event={"reference": merchant_record.transaction_id, "status": "succeeded"})
    first = _post_webhook(monkeypatch, provider, event)
    second = _post_webhook(monkeypatch, provider, event)

    assert first.status_code == 202 and first.data["settled"] is True
    assert second.data["settled"] is False and second.data["duplicate"] is True
    assert provider.calls == 2
    assert _merchant_credits(order).count() == 1


def test_live_webhook_claiming_success_is_not_trusted_without_provider_confirmation(monkeypatch, merchant_record):
    provider = _LiveProvider(live("bankily", merchant_record.transaction_id, merchant_record.amount, status="pending"))
    event = WebhookVerification(provider="bankily", verified=True, mode=MODE_LIVE,
                                event={"reference": merchant_record.transaction_id, "status": "succeeded"})
    res = _post_webhook(monkeypatch, provider, event)
    assert res.data["settled"] is False
    merchant_record.refresh_from_db()
    assert merchant_record.status == "pending"
    assert not WalletTransaction.objects.exists()


def test_mock_webhook_never_changes_financial_state(monkeypatch, merchant_record):
    provider = _LiveProvider(live("bankily", merchant_record.transaction_id, merchant_record.amount))
    event = WebhookVerification(provider="bankily", verified=True, mode=MODE_MOCK,
                                event={"reference": merchant_record.transaction_id})
    res = _post_webhook(monkeypatch, provider, event)
    assert res.data["settled"] is False
    assert provider.calls == 0
    merchant_record.refresh_from_db()
    assert merchant_record.status == "pending"
