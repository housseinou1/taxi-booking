from decimal import Decimal

from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAdminUser, IsAuthenticated
from rest_framework.response import Response

from deliveries.models import Delivery
from merchants.models import MerchantOrder
from merchants.permissions import IsMerchantOwner

from .models import MerchantWithdrawalRequest, PaymentRecord, RefundRequest
from .serializers import (
    MerchantWithdrawalRequestSerializer,
    PaymentRecordSerializer,
    RefundRequestSerializer,
)
from .settlement_service import (
    SettlementError,
    admin_payment_dashboard,
    approve_refund,
    courier_balance_summary,
    merchant_payout_summary,
    reject_refund,
    request_refund,
    settle_delivery_payment,
    settle_merchant_order_payment,
    wallet_top_up,
)
from .wallet_ledger import get_or_create_wallet


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def wallet_top_up_view(request):
    try:
        result = wallet_top_up(
            request.user,
            request.data.get("amount"),
            method=request.data.get("method", "bankily"),
            provider_token=request.data.get("provider_token", ""),
        )
    except SettlementError as exc:
        return Response({"error": exc.message, "code": exc.code}, status=status.HTTP_400_BAD_REQUEST)
    return Response(result, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def wallet_history(request):
    wallet = get_or_create_wallet(request.user)
    from .serializers import WalletTransactionSerializer

    txs = wallet.transactions.all()[:50]
    return Response(WalletTransactionSerializer(txs, many=True).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def pay_delivery_wallet(request, delivery_id):
    try:
        delivery = Delivery.objects.get(id=delivery_id, customer=request.user)
        record = settle_delivery_payment(
            delivery,
            request.user,
            payment_method=request.data.get("payment_method", "wallet"),
            tip_amount=request.data.get("tip_amount", 0),
            payment_timing=request.data.get("payment_timing", "after_delivery"),
            provider_token=request.data.get("provider_token", ""),
        )
    except Delivery.DoesNotExist:
        return Response({"error": "Delivery not found."}, status=status.HTTP_404_NOT_FOUND)
    except SettlementError as exc:
        return Response({"error": exc.message, "code": exc.code}, status=status.HTTP_400_BAD_REQUEST)
    return Response(PaymentRecordSerializer(record).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def pay_merchant_order(request, order_id):
    try:
        order = MerchantOrder.objects.select_related("merchant").get(
            id=order_id, customer=request.user
        )
        record = settle_merchant_order_payment(
            order,
            payment_method=request.data.get("payment_method", "wallet"),
            payment_timing=request.data.get("payment_timing", "before_delivery"),
            provider_token=request.data.get("provider_token", ""),
        )
    except MerchantOrder.DoesNotExist:
        return Response({"error": "Order not found."}, status=status.HTTP_404_NOT_FOUND)
    except SettlementError as exc:
        return Response({"error": exc.message, "code": exc.code}, status=status.HTTP_400_BAD_REQUEST)
    return Response(PaymentRecordSerializer(record).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_payment_records(request):
    qs = PaymentRecord.objects.filter(customer=request.user)[:50]
    return Response(PaymentRecordSerializer(qs, many=True).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def courier_wallet_summary(request):
    return Response(courier_balance_summary(request.user))


@api_view(["GET"])
@permission_classes([IsMerchantOwner])
def merchant_wallet_summary(request):
    return Response(merchant_payout_summary(request.user.merchant_profile))


@api_view(["POST"])
@permission_classes([IsMerchantOwner])
def merchant_request_payout(request):
    merchant = request.user.merchant_profile
    summary = merchant_payout_summary(merchant)
    amount = Decimal(str(request.data.get("amount", 0)))
    available = Decimal(summary["available_payout"])
    if amount <= 0:
        return Response({"error": "Invalid amount."}, status=status.HTTP_400_BAD_REQUEST)
    if amount > available:
        return Response(
            {"error": f"Amount exceeds available payout ({available} MRU)."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    payout = MerchantWithdrawalRequest.objects.create(
        merchant=merchant,
        amount=amount,
        note=request.data.get("note", ""),
    )
    return Response(MerchantWithdrawalRequestSerializer(payout).data, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([IsMerchantOwner])
def merchant_payout_history(request):
    payouts = request.user.merchant_profile.withdrawal_requests.all()[:50]
    return Response(MerchantWithdrawalRequestSerializer(payouts, many=True).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def create_refund_request(request):
    payment_id = request.data.get("payment_record_id")
    try:
        record = PaymentRecord.objects.get(id=payment_id, customer=request.user)
        refund = request_refund(
            record,
            request.user,
            reason=request.data.get("reason", "customer_complaint"),
            note=request.data.get("note", ""),
        )
    except PaymentRecord.DoesNotExist:
        return Response({"error": "Payment not found."}, status=status.HTTP_404_NOT_FOUND)
    except SettlementError as exc:
        return Response({"error": exc.message, "code": exc.code}, status=status.HTTP_400_BAD_REQUEST)
    return Response(RefundRequestSerializer(refund).data, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_refund_requests(request):
    qs = RefundRequest.objects.filter(customer=request.user)[:30]
    return Response(RefundRequestSerializer(qs, many=True).data)


@api_view(["POST"])
@permission_classes([IsAdminUser])
def admin_approve_refund(request, refund_id):
    try:
        refund = RefundRequest.objects.get(id=refund_id)
        refund = approve_refund(refund, admin_note=request.data.get("admin_note", ""))
    except RefundRequest.DoesNotExist:
        return Response({"error": "Refund not found."}, status=status.HTTP_404_NOT_FOUND)
    except SettlementError as exc:
        return Response({"error": exc.message, "code": exc.code}, status=status.HTTP_400_BAD_REQUEST)
    return Response(RefundRequestSerializer(refund).data)


@api_view(["POST"])
@permission_classes([IsAdminUser])
def admin_reject_refund(request, refund_id):
    try:
        refund = RefundRequest.objects.get(id=refund_id)
        refund = reject_refund(refund, admin_note=request.data.get("admin_note", ""))
    except RefundRequest.DoesNotExist:
        return Response({"error": "Refund not found."}, status=status.HTTP_404_NOT_FOUND)
    return Response(RefundRequestSerializer(refund).data)


@api_view(["GET"])
@permission_classes([IsAdminUser])
def admin_payment_dashboard_view(request):
    return Response(admin_payment_dashboard())


@api_view(["GET"])
@permission_classes([IsAdminUser])
def admin_payment_records(request):
    qs = PaymentRecord.objects.all()[:100]
    return Response(PaymentRecordSerializer(qs, many=True).data)


@api_view(["GET"])
@permission_classes([IsAdminUser])
def admin_refund_queue(request):
    qs = RefundRequest.objects.filter(status="requested")[:50]
    return Response(RefundRequestSerializer(qs, many=True).data)


@api_view(["POST"])
@permission_classes([IsAdminUser])
def admin_approve_merchant_payout(request, payout_id):
    try:
        payout = MerchantWithdrawalRequest.objects.select_related("merchant").get(id=payout_id)
    except MerchantWithdrawalRequest.DoesNotExist:
        return Response({"error": "Payout not found."}, status=status.HTTP_404_NOT_FOUND)

    payout.status = "paid"
    payout.reference = request.data.get("reference", payout.reference)
    payout.paid_at = timezone.now()
    payout.admin_note = request.data.get("admin_note", "")
    payout.save()

    from .wallet_ledger import apply_wallet_transaction

    wallet = get_or_create_wallet(payout.merchant.owner)
    try:
        apply_wallet_transaction(
            wallet,
            payout.amount,
            False,
            "payout",
            reference=f"payout:{payout.id}",
            note="Merchant payout",
        )
    except ValueError as exc:
        return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    return Response(MerchantWithdrawalRequestSerializer(payout).data)
