"""Phase 11 — CEO payment oversight & provider readiness (read-only).

CEO-tier (`IsCeoStaff`) visibility into the cashless payment system:

* ``GET /payments/admin/payments/oversight/`` — cashless policy status, provider
  readiness, and payment/commission/refund performance with **Nouakchott and
  Nouadhibou separated and combined** (using the same city convention as the
  Phase 9 CEO city report: rides by ``city__name``, deliveries by ``service_city``).
* ``GET /payments/admin/payments/providers/`` — provider readiness only.

Nothing here moves money, approves a withdrawal, or mutates a record: the finance
freeze from Phase 7 stands. Every response is explicitly ``read_only``.
"""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db.models import Count, Q, Sum
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from operations.executive_permissions import IsCeoStaff

from .cashless import policy_payload
from .models import Payment, PaymentRecord, WithdrawalRequest
from .providers import provider_readiness
from .provider_security import suspicious_signals

User = get_user_model()

CITY_NAMES = ("Nouakchott", "Nouadhibou")

PERIODS = {
    "daily": timedelta(days=1),
    "weekly": timedelta(days=7),
    "monthly": timedelta(days=30),
    "all": None,
}


def _window(period: str):
    delta = PERIODS.get(period, PERIODS["weekly"])
    if delta is None:
        return None
    return timezone.now() - delta


def _ride_ids_for_city(city_name: str):
    """Ride ids for a city, using the Phase 9 convention (``city__name``)."""
    from taxi.rides.models import Ride

    try:
        return Ride.objects.filter(city__name__iexact=city_name).values("id")
    except Exception:  # pragma: no cover - defensive (city model quirk)
        return Ride.objects.none().values("id")


def _payment_block(start, city_name=None) -> dict:
    """Ride payments (``Payment``) for a period, optionally for one city."""
    queryset = Payment.objects.all()
    if start is not None:
        queryset = queryset.filter(created_at__gte=start)
    if city_name:
        queryset = queryset.filter(ride_id__in=_ride_ids_for_city(city_name))

    by_status = {
        row["status"]: {"count": row["n"], "amount": str(row["amount"] or 0)}
        for row in queryset.values("status").annotate(n=Count("id"), amount=Sum("amount"))
    }
    by_method = {
        row["method"]: {"count": row["n"], "amount": str(row["amount"] or 0)}
        for row in queryset.values("method").annotate(n=Count("id"), amount=Sum("amount"))
    }
    totals = queryset.aggregate(
        count=Count("id"),
        amount=Sum("amount"),
        commission=Sum("app_fee"),
        driver_earnings=Sum("driver_earning"),
        tips=Sum("tip_amount"),
    )
    return {
        "count": totals["count"] or 0,
        "amount": str(totals["amount"] or 0),
        "platform_commission": str(totals["commission"] or 0),
        "driver_earnings": str(totals["driver_earnings"] or 0),
        "tips": str(totals["tips"] or 0),
        "by_status": by_status,
        "by_method": by_method,
    }


def _record_block(start, city_name=None) -> dict:
    """Unified ledger (``PaymentRecord``: deliveries, merchant orders, rides)."""
    queryset = PaymentRecord.objects.all()
    if start is not None:
        queryset = queryset.filter(created_at__gte=start)
    if city_name:
        queryset = queryset.filter(
            Q(delivery__service_city__iexact=city_name)
            | Q(ride_id__in=_ride_ids_for_city(city_name))
        )

    by_status = {
        row["status"]: {"count": row["n"], "amount": str(row["amount"] or 0)}
        for row in queryset.values("status").annotate(n=Count("id"), amount=Sum("amount"))
    }
    by_method = {
        row["method"]: {"count": row["n"], "amount": str(row["amount"] or 0)}
        for row in queryset.values("method").annotate(n=Count("id"), amount=Sum("amount"))
    }
    totals = queryset.aggregate(count=Count("id"), amount=Sum("amount"), fees=Sum("app_fee"))
    return {
        "count": totals["count"] or 0,
        "amount": str(totals["amount"] or 0),
        "platform_commission": str(totals["fees"] or 0),
        "by_status": by_status,
        "by_method": by_method,
    }


def _withdrawal_block(start, city_name=None) -> dict:
    queryset = WithdrawalRequest.objects.all()
    if start is not None:
        queryset = queryset.filter(created_at__gte=start)
    if city_name:
        queryset = queryset.filter(driver__city__name__iexact=city_name)

    by_status = {
        row["status"]: {"count": row["n"], "amount": str(row["amount"] or 0)}
        for row in queryset.values("status").annotate(n=Count("id"), amount=Sum("amount"))
    }
    return {
        "count": sum(row["count"] for row in by_status.values()),
        "by_status": by_status,
        "approved": by_status.get("approved", {"count": 0, "amount": "0"}),
        "rejected": by_status.get("rejected", {"count": 0, "amount": "0"}),
        "paid": by_status.get("paid", {"count": 0, "amount": "0"}),
        "pending": by_status.get("pending", {"count": 0, "amount": "0"}),
    }


def _city_blocks(start) -> list[dict]:
    """One block per city plus the combined block (Phase 9 reporting convention)."""
    blocks = []
    for city in CITY_NAMES:
        blocks.append(
            {
                "city": city,
                "payments": _payment_block(start, city),
                "ledger": _record_block(start, city),
                "withdrawals": _withdrawal_block(start, city),
            }
        )
    blocks.append(
        {
            "city": "Combined",
            "payments": _payment_block(start),
            "ledger": _record_block(start),
            "withdrawals": _withdrawal_block(start),
        }
    )
    return blocks


def _suspicious_summary(start) -> dict:
    """Recent signals an operator should look at (never a block, always advisory)."""
    queryset = Payment.objects.all()
    if start is not None:
        queryset = queryset.filter(created_at__gte=start)
    rows = queryset.order_by("-created_at")[:200]

    flagged = []
    for row in rows:
        signals = suspicious_signals(
            amount=row.amount, method=row.method, hour=row.created_at.hour if row.created_at else None
        )
        if signals:
            flagged.append(
                {
                    "id": row.id,
                    "ride_id": row.ride_id,
                    "amount": str(row.amount),
                    "method": row.method,
                    "status": row.status,
                    "signals": signals,
                    "created_at": row.created_at,
                }
            )
    return {"sampled": len(rows), "flagged": len(flagged), "items": flagged[:25]}


def _courier_user_ids() -> set:
    """User ids that have a delivery-courier profile (used to split payouts by role)."""
    try:
        from deliveries.models import DriverDeliverySettings

        return set(DriverDeliverySettings.objects.values_list("driver_id", flat=True))
    except Exception:  # pragma: no cover - defensive
        return set()


def _money(value) -> str:
    """Render a stored amount as a 2-decimal string.

    SQLite returns ``Sum`` over a ``DecimalField`` as a float, so an aggregated amount
    loses its scale (``1000`` instead of ``1000.00``). Normalising here keeps every
    figure in the Payment Management Center consistent and decimal-safe.
    """
    return str(Decimal(str(value or 0)).quantize(Decimal("0.01")))


def _payout_block(start) -> dict:
    """Payout (withdrawal) totals by status **and** split by driver vs courier."""
    queryset = WithdrawalRequest.objects.all()
    if start is not None:
        queryset = queryset.filter(created_at__gte=start)

    by_status = {
        row["status"]: {"count": row["n"], "amount": _money(row["amount"])}
        for row in queryset.values("status").annotate(n=Count("id"), amount=Sum("amount"))
    }

    couriers = _courier_user_ids()
    by_role = {"driver": {}, "courier": {}}
    for row in queryset.values("status", "driver_id").annotate(
        n=Count("id"), amount=Sum("amount")
    ):
        role = "courier" if row["driver_id"] in couriers else "driver"
        bucket = by_role[role].setdefault(row["status"], {"count": 0, "amount": "0.00"})
        bucket["count"] += row["n"]
        bucket["amount"] = _money(Decimal(bucket["amount"]) + Decimal(str(row["amount"] or 0)))

    return {
        "count": sum(row["count"] for row in by_status.values()),
        "by_status": by_status,
        "by_role": by_role,
        "pending": by_status.get("pending", {"count": 0, "amount": "0.00"}),
        "approved": by_status.get("approved", {"count": 0, "amount": "0.00"}),
        "paid": by_status.get("paid", {"count": 0, "amount": "0.00"}),
        "rejected": by_status.get("rejected", {"count": 0, "amount": "0.00"}),
    }


def _refund_block(start) -> dict:
    """Refund requests by status, including what is awaiting CEO authorization."""
    from .models import RefundRequest

    queryset = RefundRequest.objects.all()
    if start is not None:
        queryset = queryset.filter(created_at__gte=start)

    by_status = {
        row["status"]: {"count": row["n"], "amount": _money(row["amount"])}
        for row in queryset.values("status").annotate(n=Count("id"), amount=Sum("amount"))
    }
    return {
        "count": sum(row["count"] for row in by_status.values()),
        "by_status": by_status,
        "awaiting_ceo": by_status.get(
            "awaiting_ceo", by_status.get("requested", {"count": 0, "amount": "0.00"})
        ),
        "approved": by_status.get("approved", {"count": 0, "amount": "0"}),
        "rejected": by_status.get("rejected", {"count": 0, "amount": "0"}),
        "refunded": by_status.get("refunded", {"count": 0, "amount": "0"}),
    }


def _failed_transactions(start) -> dict:
    """Transactions recorded as failed, with only the reason actually stored.

    There is no ``failure_reason`` column on ``Payment``/``PaymentRecord``, so the
    reason reported is the stored status. A provider-confirmed failure cause requires
    provider API access and is deliberately **not** invented here.
    """
    out = {"ride_payments": [], "ledger_records": [], "total": 0}
    reason = "Recorded as failed; no provider reason stored"

    payments = Payment.objects.filter(status="failed")
    if start is not None:
        payments = payments.filter(created_at__gte=start)
    for row in payments.order_by("-created_at")[:25]:
        out["ride_payments"].append(
            {
                "id": row.id,
                "ride_id": row.ride_id,
                "amount": str(row.amount),
                "method": row.method,
                "status": row.status,
                "reason": reason,
                "created_at": row.created_at,
            }
        )

    records = PaymentRecord.objects.filter(status="failed")
    if start is not None:
        records = records.filter(created_at__gte=start)
    for row in records.order_by("-created_at")[:25]:
        out["ledger_records"].append(
            {
                "id": row.id,
                "amount": str(row.amount),
                "method": row.method,
                "status": row.status,
                "reason": reason,
                "created_at": row.created_at,
            }
        )

    out["total"] = len(out["ride_payments"]) + len(out["ledger_records"])
    return out



def _action_capabilities(request) -> dict:
    """The honest capability map for the Payment Management Center.

    Actions that exist are listed with the endpoint **and** the existing admin surface
    that already performs them, so no duplicate action UI is built. Capabilities that do
    not exist are reported as unavailable with the reason, rather than faked.
    """
    from operations.executive_permissions import can_ceo_actions

    can_act = bool(can_ceo_actions(request.user))
    return {
        "can_act": can_act,
        "confirmation_required": True,
        "audited": True,
        "actions": [
            {
                "id": "approve_payout",
                "label": "Approve payout",
                "available": can_act,
                "endpoint": "/payments/withdrawals/<id>/approve/",
                "surface": "Finance Operations → Withdrawals Monitoring",
            },
            {
                "id": "reject_payout",
                "label": "Reject payout",
                "available": can_act,
                "endpoint": "/payments/withdrawals/<id>/reject/",
                "surface": "Finance Operations → Withdrawals Monitoring",
            },
            {
                "id": "mark_payout_paid",
                "label": "Record payout as paid",
                "available": can_act,
                "endpoint": "/payments/withdrawals/<id>/mark-paid/",
                "surface": "Finance Operations → Withdrawals Monitoring",
                "note": (
                    "Manual, audited bookkeeping: records the operator-supplied payment "
                    "reference. It does not send an instruction to a provider."
                ),
            },
            {
                "id": "approve_refund",
                "label": "Authorize refund",
                "available": can_act,
                "endpoint": "/payments/admin/refunds/<id>/approve/",
                "surface": "Finance Dashboard",
            },
            {
                "id": "reject_refund",
                "label": "Reject refund",
                "available": can_act,
                "endpoint": "/payments/admin/refunds/<id>/reject/",
                "surface": "Finance Dashboard",
            },
        ],
        "unavailable": [
            {
                "id": "provider_payout_instruction",
                "label": "Initiate payment instruction with the provider",
                "available": False,
                "reason": (
                    "No payout/disbursement API is integrated for Bankily, Sedad, Masravi "
                    "or the card gateway, so an automated instruction cannot be sent. "
                    "Required before activation: official provider payout documentation, "
                    "approved credentials, PAYMENTS_LIVE_MODE authorization, and a passed "
                    "sandbox end-to-end test."
                ),
            },
            {
                "id": "provider_settlement_import",
                "label": "Import provider settlement files",
                "available": False,
                "reason": (
                    "Requires official provider settlement access. Reconciliation is "
                    "computed from stored records only."
                ),
            },
        ],
    }



@api_view(["GET"])
@permission_classes([IsCeoStaff])
def payments_oversight(request):
    """CEO payment oversight: cashless status, providers, revenue, withdrawals,
    payouts, refunds, failed transactions and the action-capability map.

    Query params: ``period`` (daily|weekly|monthly|all, default weekly).
    """
    period = (request.query_params.get("period") or "weekly").strip().lower()
    if period not in PERIODS:
        period = "weekly"
    start = _window(period)

    return Response(
        {
            "period": period,
            "generated_at": timezone.now(),
            "cashless_policy": policy_payload(),
            "providers": provider_readiness(),
            "cities": _city_blocks(start),
            "suspicious": _suspicious_summary(start),
            # ── Payment Management Center ─────────────────────────────────────
            # Aggregated from the existing services only. Nothing here moves money:
            # `action_capabilities` states which actions exist, where they already live,
            # and which are unavailable (with the reason) so the CEO is never shown a
            # control that cannot work.
            "payouts": _payout_block(start),
            "refunds": _refund_block(start),
            "failed_transactions": _failed_transactions(start),
            "action_capabilities": _action_capabilities(request),
            "management_center": True,
            "reconciliation": {
                "state": "monitoring_only",
                "note": (
                    "Reconciliation figures are computed from stored records only. "
                    "Provider-side settlement files cannot be imported until official "
                    "provider access exists (see provider readiness)."
                ),
            },
            "read_only": True,
            "financial_activation": False,
            "live_payments": False,
            "live_withdrawals": False,
        }
    )


@api_view(["GET"])
@permission_classes([IsCeoStaff])
def payment_providers(request):
    """Provider readiness only (cashless policy + Bankily/Masravi/bank/card)."""
    return Response(
        {
            "generated_at": timezone.now(),
            "cashless_policy": policy_payload(),
            "providers": provider_readiness(),
            "read_only": True,
            "financial_activation": False,
        }
    )

