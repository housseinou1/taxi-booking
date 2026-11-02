"""Phase 7 — read-only admin finance & withdrawal monitoring endpoints.

STRICTLY READ-ONLY. This module:

- never writes a wallet balance and never touches ``apply_wallet_transaction``;
- performs no financial calculation — every money value is an aggregate over
  already-stored columns (or a stored column verbatim);
- never triggers a payout state transition: approve / reject / mark-paid are
  neither called nor re-implemented here (they remain frozen in the existing
  endpoints, which this module does not touch);
- never initiates a transfer or contact a payment provider.

Every endpoint is ``IsAdminUser``-gated, paginated where a list is returned, and
returns a redacted payout-method label (never a provider token, wallet id or PAN).
"""

from __future__ import annotations

from decimal import Decimal, InvalidOperation

from django.db.models import Count, Q, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response

from .admin_driver_serializers import AdminDriverWithdrawalSerializer
from .models import (
    DriverPayoutMethod,
    MerchantWithdrawalRequest,
    RefundRequest,
    WalletAccount,
    WalletTransaction,
    WithdrawalRequest,
)

# Statuses that represent money the platform has committed to but not yet paid.
OPEN_WITHDRAWAL_STATUSES = ["pending", "approved"]

WITHDRAWAL_STATUSES = [choice[0] for choice in WithdrawalRequest.STATUS_CHOICES]
PAYOUT_TYPES = [choice[0] for choice in DriverPayoutMethod.PAYOUT_TYPES]

WITHDRAWAL_ORDERINGS = {
    "newest": "-created_at",
    "oldest": "created_at",
    "amount_desc": "-amount",
    "amount_asc": "amount",
}

# The review actions are deliberately unavailable in this UI while the finance
# surface is frozen. The backend endpoints that perform them are untouched.
REVIEW_ACTIONS_FROZEN_REASON = (
    "Approval, rejection and mark-paid actions are intentionally not exposed in "
    "this read-only monitoring UI. Withdrawal state transitions remain frozen; "
    "no wallet balance, payout state or transfer can be changed from here."
)


class AdminFinancePagination(PageNumberPagination):
    """Server-side pagination for admin finance lists."""

    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 100

    def get_paginated_response(self, data):
        page_size = self.get_page_size(self.request) or self.page_size
        return Response(
            {
                "count": self.page.paginator.count,
                "page": self.page.number,
                "page_size": page_size,
                "total_pages": self.page.paginator.num_pages,
                "next": self.get_next_link(),
                "previous": self.get_previous_link(),
                "results": data,
            }
        )


# ─── Helpers ─────────────────────────────────────────────────────────────────


def _money(value) -> str:
    """Render a stored Decimal as a string (no arithmetic performed)."""
    return str(value if value is not None else Decimal("0"))


def _bad_request(detail: str) -> Response:
    return Response({"detail": detail}, status=status.HTTP_400_BAD_REQUEST)


def _parse_decimal_param(raw, name: str):
    """Return (value, error_response). Malformed input is a 400, not silent."""
    if raw in (None, ""):
        return None, None
    try:
        value = Decimal(str(raw))
    except (InvalidOperation, TypeError, ValueError):
        return None, _bad_request(f"Invalid {name}; expected a number.")
    if value < 0:
        return None, _bad_request(f"Invalid {name}; must not be negative.")
    return value, None


def _parse_date_param(raw, name: str):
    if not raw:
        return None, None
    # parse_date returns None for malformed strings but RAISES ValueError for
    # out-of-range values (e.g. "2026-13-01"); both must be a 400, never a 500.
    try:
        parsed = parse_date(raw)
    except (ValueError, TypeError):
        parsed = None
    if parsed is None:
        return None, _bad_request(f"Invalid {name}; expected YYYY-MM-DD.")
    return parsed, None


def _payout_method_label(method):
    """Redacted payout destination — never a token, wallet id or full PAN."""
    if method is None:
        return None
    payout_type = method.payout_type or ""
    if payout_type == "card":
        return f"card ****{method.card_last4}"
    if payout_type == "bank_account":
        return f"{payout_type} {method.bank_name}".strip()
    if payout_type in ("bankily", "masrvi", "seddad"):
        handle = method.phone_number or method.wallet_id or ""
        return f"{payout_type} {handle}".strip()
    return payout_type or None


def _is_courier(user) -> bool:
    """True when the user also has courier delivery settings (driver + courier)."""
    from deliveries.models import DriverDeliverySettings

    return DriverDeliverySettings.objects.filter(driver_id=user.id).exists()


def _requester(user) -> dict:
    return {
        "id": user.id,
        "name": user.get_full_name() or user.email,
        "email": user.email,
        "phone_number": getattr(user, "phone_number", "") or "",
        "is_active": user.is_active,
        "is_courier": _is_courier(user),
    }


def _withdrawal_summary(queryset) -> dict:
    """Read-only counts and sums by status (aggregates over stored columns)."""
    agg = queryset.aggregate(
        total=Count("id"),
        pending=Count("id", filter=Q(status="pending")),
        approved=Count("id", filter=Q(status="approved")),
        rejected=Count("id", filter=Q(status="rejected")),
        paid=Count("id", filter=Q(status="paid")),
        pending_amount=Sum("amount", filter=Q(status="pending")),
        approved_amount=Sum("amount", filter=Q(status="approved")),
        paid_amount=Sum("amount", filter=Q(status="paid")),
        rejected_amount=Sum("amount", filter=Q(status="rejected")),
        total_amount=Sum("amount"),
    )
    return {
        "total": agg["total"] or 0,
        "pending": agg["pending"] or 0,
        "approved": agg["approved"] or 0,
        "rejected": agg["rejected"] or 0,
        "paid": agg["paid"] or 0,
        "pending_amount": _money(agg["pending_amount"]),
        "approved_amount": _money(agg["approved_amount"]),
        "paid_amount": _money(agg["paid_amount"]),
        "rejected_amount": _money(agg["rejected_amount"]),
        "total_amount": _money(agg["total_amount"]),
    }


def _wallet_snapshot(user) -> dict:
    """Stored wallet values + the sum of open withdrawal requests.

    Deliberately does NOT derive an "available balance": that would be a new
    financial calculation. Only stored columns and a plain sum of the user's own
    open requests are shown.
    """
    wallet = WalletAccount.objects.filter(owner=user).first()
    open_amount = (
        WithdrawalRequest.objects.filter(
            driver=user, status__in=OPEN_WITHDRAWAL_STATUSES
        ).aggregate(total=Sum("amount"))["total"]
        or Decimal("0")
    )
    return {
        "has_wallet": wallet is not None,
        "balance": _money(wallet.balance if wallet else None),
        "pending_balance": _money(wallet.pending_balance if wallet else None),
        "currency": wallet.currency if wallet else "MRU",
        "open_withdrawal_amount": _money(open_amount),
    }


def _withdrawal_timeline(withdrawal) -> list[dict]:
    """Read-only timeline derived from stored columns (no derived state)."""
    entries = [
        {
            "label": "Requested",
            "at": withdrawal.created_at,
            "actor": None,
            "note": withdrawal.note or "",
        }
    ]
    if withdrawal.approved_at:
        entries.append(
            {
                "label": "Approved",
                "at": withdrawal.approved_at,
                "actor": withdrawal.approved_by.email if withdrawal.approved_by else "",
                "note": withdrawal.admin_note or "",
            }
        )
    if withdrawal.status == "rejected":
        entries.append(
            {
                "label": "Rejected",
                "at": withdrawal.updated_at,
                "actor": withdrawal.approved_by.email if withdrawal.approved_by else "",
                "note": withdrawal.admin_note or "",
            }
        )
    if withdrawal.paid_at:
        entries.append(
            {
                "label": "Marked paid",
                "at": withdrawal.paid_at,
                "actor": withdrawal.paid_by.email if withdrawal.paid_by else "",
                "note": withdrawal.payment_reference or withdrawal.reference or "",
            }
        )
    if withdrawal.otp_verified_at:
        entries.append(
            {
                "label": "OTP verified",
                "at": withdrawal.otp_verified_at,
                "actor": None,
                "note": "",
            }
        )
    return entries



# ─── Withdrawal monitoring (read-only) ───────────────────────────────────────


def _withdrawal_row(withdrawal) -> dict:
    """List row: whitelisted request fields + requester summary."""
    return {
        **AdminDriverWithdrawalSerializer(withdrawal).data,
        "requester": _requester(withdrawal.driver),
        "reference": withdrawal.reference or "",
    }


@api_view(["GET"])
@permission_classes([IsAdminUser])
def admin_withdrawals_monitoring(request):
    """Paginated, filterable, read-only withdrawal monitoring list.

    Query params: status, payout_type, search, date_from, date_to, min_amount,
    max_amount, ordering, page, page_size. Malformed dates/amounts return 400.

    The returned ``summary`` always describes the WHOLE queue (not the filtered
    page) so the KPI row stays meaningful while filters are applied.
    """
    queryset = WithdrawalRequest.objects.select_related(
        "driver", "payout_method", "approved_by", "paid_by"
    ).order_by("-created_at")

    status_filter = (request.query_params.get("status") or "").strip().lower()
    if status_filter and status_filter != "all":
        if status_filter not in WITHDRAWAL_STATUSES:
            return _bad_request(
                f"Invalid status. Valid values: {', '.join(WITHDRAWAL_STATUSES)}."
            )
        queryset = queryset.filter(status=status_filter)

    payout_type = (request.query_params.get("payout_type") or "").strip().lower()
    if payout_type and payout_type != "all":
        if payout_type not in PAYOUT_TYPES:
            return _bad_request(
                f"Invalid payout_type. Valid values: {', '.join(PAYOUT_TYPES)}."
            )
        queryset = queryset.filter(payout_method__payout_type=payout_type)

    search = (request.query_params.get("search") or "").strip()
    if search:
        queryset = queryset.filter(
            Q(driver__email__icontains=search)
            | Q(driver__first_name__icontains=search)
            | Q(driver__last_name__icontains=search)
            | Q(driver__phone_number__icontains=search)
            | Q(reference__icontains=search)
            | Q(payment_reference__icontains=search)
        )

    date_from, error = _parse_date_param(request.query_params.get("date_from"), "date_from")
    if error:
        return error
    if date_from:
        queryset = queryset.filter(created_at__date__gte=date_from)

    date_to, error = _parse_date_param(request.query_params.get("date_to"), "date_to")
    if error:
        return error
    if date_to:
        queryset = queryset.filter(created_at__date__lte=date_to)

    min_amount, error = _parse_decimal_param(
        request.query_params.get("min_amount"), "min_amount"
    )
    if error:
        return error
    if min_amount is not None:
        queryset = queryset.filter(amount__gte=min_amount)

    max_amount, error = _parse_decimal_param(
        request.query_params.get("max_amount"), "max_amount"
    )
    if error:
        return error
    if max_amount is not None:
        queryset = queryset.filter(amount__lte=max_amount)

    ordering = (request.query_params.get("ordering") or "newest").strip()
    queryset = queryset.order_by(
        WITHDRAWAL_ORDERINGS.get(ordering, WITHDRAWAL_ORDERINGS["newest"])
    )

    paginator = AdminFinancePagination()
    page = paginator.paginate_queryset(queryset, request)
    response = paginator.get_paginated_response([_withdrawal_row(row) for row in page])
    response.data["summary"] = _withdrawal_summary(WithdrawalRequest.objects.all())
    response.data["filters_applied"] = {
        "status": status_filter or "all",
        "payout_type": payout_type or "all",
        "search": search,
        "date_from": request.query_params.get("date_from") or "",
        "date_to": request.query_params.get("date_to") or "",
        "min_amount": request.query_params.get("min_amount") or "",
        "max_amount": request.query_params.get("max_amount") or "",
        "ordering": ordering,
    }
    return response



@api_view(["GET"])
@permission_classes([IsAdminUser])
def admin_withdrawal_detail(request, withdrawal_id):
    """Read-only review detail for one withdrawal request.

    Everything returned is either a stored column, a redacted label, or a plain
    sum of the requester's own open requests. No action is offered or performed:
    ``review_actions_frozen`` tells the UI why approve/reject/mark-paid are absent.
    """
    withdrawal = get_object_or_404(
        WithdrawalRequest.objects.select_related(
            "driver", "payout_method", "approved_by", "paid_by"
        ),
        pk=withdrawal_id,
    )

    transactions = [
        {
            "id": row.id,
            "transaction_type": row.transaction_type,
            "status": row.status,
            "amount": _money(row.amount),
            "is_credit": row.is_credit,
            "balance_after": _money(row.balance_after),
            "reference": row.reference or "",
            "created_at": row.created_at,
        }
        for row in WalletTransaction.objects.filter(wallet__owner=withdrawal.driver)
        .order_by("-created_at")[:10]
    ]

    return Response(
        {
            **AdminDriverWithdrawalSerializer(withdrawal).data,
            "requester": _requester(withdrawal.driver),
            "reference": withdrawal.reference or "",
            "payment_reference": withdrawal.payment_reference or "",
            "payout_method": {
                "label": _payout_method_label(withdrawal.payout_method),
                "payout_type": (
                    withdrawal.payout_method.payout_type if withdrawal.payout_method else ""
                ),
            },
            "timeline": _withdrawal_timeline(withdrawal),
            "wallet": _wallet_snapshot(withdrawal.driver),
            "wallet_transactions": transactions,
            "review_actions_frozen": True,
            "review_actions_frozen_reason": REVIEW_ACTIONS_FROZEN_REASON,
        }
    )


# ─── Finance overview (read-only) ────────────────────────────────────────────


@api_view(["GET"])
@permission_classes([IsAdminUser])
def admin_finance_overview(request):
    """Read-only finance KPIs for the Finance & Withdrawals module page.

    Every number is a count or a SUM over stored columns. No balance is written,
    no fee/commission is computed, and no payout is triggered.
    """
    now = timezone.now()
    last_30_days = now - timezone.timedelta(days=30)
    last_24h = now - timezone.timedelta(hours=24)

    withdrawals = WithdrawalRequest.objects.all()
    withdrawal_summary = _withdrawal_summary(withdrawals)

    wallets_agg = WalletAccount.objects.aggregate(
        total_balance=Sum("balance"),
        total_pending=Sum("pending_balance"),
        wallets=Count("id"),
    )

    refunds_agg = RefundRequest.objects.aggregate(
        total=Count("id"),
        requested=Count("id", filter=Q(status="requested")),
        awaiting_ceo=Count("id", filter=Q(status="awaiting_ceo")),
        approved=Count("id", filter=Q(status="approved")),
        rejected=Count("id", filter=Q(status="rejected")),
        refunded=Count("id", filter=Q(status="refunded")),
    )

    merchant_agg = MerchantWithdrawalRequest.objects.aggregate(
        total=Count("id"),
        pending=Count("id", filter=Q(status="pending")),
        paid=Count("id", filter=Q(status="paid")),
        pending_amount=Sum("amount", filter=Q(status="pending")),
    )

    return Response(
        {
            "withdrawals": {
                **withdrawal_summary,
                "requests_last_24h": withdrawals.filter(created_at__gte=last_24h).count(),
                "paid_last_30d_amount": _money(
                    withdrawals.filter(status="paid", paid_at__gte=last_30_days).aggregate(
                        total=Sum("amount")
                    )["total"]
                ),
                "paid_last_30d_count": withdrawals.filter(
                    status="paid", paid_at__gte=last_30_days
                ).count(),
                "open_amount": _money(
                    withdrawals.filter(status__in=OPEN_WITHDRAWAL_STATUSES).aggregate(
                        total=Sum("amount")
                    )["total"]
                ),
            },
            "wallets": {
                "wallets": wallets_agg["wallets"] or 0,
                "total_balance": _money(wallets_agg["total_balance"]),
                "total_pending_balance": _money(wallets_agg["total_pending"]),
            },
            "refunds": {
                "total": refunds_agg["total"] or 0,
                "requested": refunds_agg["requested"] or 0,
                "awaiting_ceo": refunds_agg["awaiting_ceo"] or 0,
                "approved": refunds_agg["approved"] or 0,
                "rejected": refunds_agg["rejected"] or 0,
                "refunded": refunds_agg["refunded"] or 0,
            },
            "merchant_payouts": {
                "total": merchant_agg["total"] or 0,
                "pending": merchant_agg["pending"] or 0,
                "paid": merchant_agg["paid"] or 0,
                "pending_amount": _money(merchant_agg["pending_amount"]),
            },
            "review_actions_frozen": True,
            "review_actions_frozen_reason": REVIEW_ACTIONS_FROZEN_REASON,
        }
    )

