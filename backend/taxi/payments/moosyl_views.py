"""Moosyl collection flow for the rider, delivery and admin surfaces.

THE CONTRACT EVERY ENTRY POINT HERE RESPECTS
--------------------------------------------
* **Confirmation never comes from the app.** These views only *start* a payment and
  return Moosyl's ``checkoutUrl``. The redirect back to ``successUrl`` is explicitly
  not proof of payment (Moosyl's own docs say so, because anyone can open that URL).
  The only thing that settles a ride or delivery is a signature-verified webhook —
  see ``payments.moosyl_settlement``.
* **The amount is fixed server-side.** MRU amounts are whole numbers, but Yala fares
  carry kobo-style decimals (e.g. 120.50). The charge is rounded HALF_UP to whole MRU
  and the ``Payment`` row is created with **that exact figure** before the session is
  requested, so the webhook validates the provider's amount against the amount we
  actually asked for rather than against a re-derived value.
* **Cash is untouched.** The strict cashless policy in ``payments.cashless`` decides
  whether a cash method may start a payment; nothing in this module changes that
  decision or the ``CASHLESS_POLICY_ENFORCED`` switch that the owner controls.
* **Moosyl never pays drivers.** Nothing here creates a payout; driver earnings are
  settled by Yala's own withdrawal flow via ``payments.withdrawal_service``.
"""

from __future__ import annotations

import logging
from decimal import ROUND_HALF_UP, Decimal

from django.conf import settings
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from operations.admin_module_permissions import require_admin_module
from taxi.security.abuse import rate_limit

from .moosyl_settlement import (
    SCOPE_DELIVERY,
    SCOPE_RIDE,
    build_transaction_id,
    moosyl_fee,
)
from .providers import MODE_LIVE, MODE_SANDBOX, get_provider
from .providers.base import ProviderError
from .models import Payment

logger = logging.getLogger("yala.payments.moosyl")

# The bank apps Moosyl exposes that Yala offers. "Masrvi" is Moosyl's spelling of
# Masravi; both map to our canonical "masravi" method.
MOOSYL_BANK_APPS = ("bankily", "masravi", "sedad")


def _whole_mru(amount) -> Decimal:
    """Round a Yala fare to whole MRU (Moosyl constraint) using HALF_UP."""
    return Decimal(str(amount or 0)).quantize(Decimal("1"), rounding=ROUND_HALF_UP)


def _provider_or_error():
    try:
        provider = get_provider("moosyl")
    except KeyError:  # pragma: no cover - "moosyl" is always registered
        return None, Response(
            {"error": "Moosyl is not available."}, status=status.HTTP_503_SERVICE_UNAVAILABLE
        )
    return provider, None


def _environment_payload(provider) -> dict:
    return {
        "provider": provider.code,
        "environment": provider.environment,
        "mode": provider.mode,
        "settlement_enabled": bool(getattr(provider, "may_settle", False)),
        "sandbox": provider.mode == MODE_SANDBOX,
        "live": provider.mode == MODE_LIVE,
    }


def _safe_redirect(value: str) -> str:
    """Only absolute http(s) redirect targets are accepted (no javascript:, no open redirect)."""
    candidate = str(value or "").strip()
    if candidate.startswith("https://") or candidate.startswith("http://"):
        return candidate
    return ""


def _ensure_payment_for_ride(ride, amount: Decimal) -> Payment:
    """Create or reuse the Payment row with the exact whole-MRU amount to be collected.

    The commission is applied through the existing pricing service, so the 30/70 split
    stays in one place and the webhook can compare the provider's amount with the
    figure we actually requested.
    """
    from app_settings.pricing_service import get_ride_commission_percent

    from .services import calculate_payment_amounts

    payment = (
        Payment.objects.filter(ride_id=ride.id).order_by("-created_at").first()
    )
    if payment is None:
        charge, app_fee, tip_percent, tip_amount, driver_earning, discount = (
            calculate_payment_amounts(amount, 0, 0, get_ride_commission_percent(ride))
        )
        payment = Payment.objects.create(
            rider=ride.rider,
            ride_id=ride.id,
            amount=amount,
            discount_amount=discount,
            app_fee=app_fee,
            tip_percentage=tip_percent,
            tip_amount=tip_amount,
            driver_earning=driver_earning,
            method="moosyl",
            status="pending",
            currency="MRU",
        )
    elif payment.status not in ("paid",):
        # Refresh the figures to the amount being requested now.
        charge, app_fee, tip_percent, tip_amount, driver_earning, discount = (
            calculate_payment_amounts(amount, 0, 0, get_ride_commission_percent(ride))
        )
        payment.amount = amount
        payment.app_fee = app_fee
        payment.driver_earning = driver_earning
        payment.tip_amount = tip_amount
        payment.method = "moosyl"
        payment.currency = "MRU"
        payment.save(
            update_fields=[
                "amount",
                "app_fee",
                "driver_earning",
                "tip_amount",
                "method",
                "currency",
            ]
        )
    return payment


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def moosyl_checkout(request):
    """Start a Moosyl payment for the caller's own ride or delivery.

    Returns Moosyl's ``checkout_url`` for the app to open. It deliberately returns no
    "paid" signal: the app must wait for the backend to observe a verified webhook.
    """
    retry_after = rate_limit(request, "moosyl-checkout", limit=10, window_seconds=600)
    if retry_after:
        return Response(
            {"error": "Too many payment attempts. Please wait before trying again."},
            status=status.HTTP_429_TOO_MANY_REQUESTS,
            headers={"Retry-After": str(retry_after)},
        )

    provider, error = _provider_or_error()
    if error:
        return error
    if not provider.is_configured():
        return Response(
            {
                "error": "Moosyl payments are not configured yet.",
                "code": "provider_not_configured",
                "missing": list(provider.missing_config()),
            },
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    scope = SCOPE_DELIVERY if request.data.get("delivery_id") else SCOPE_RIDE
    object_id = request.data.get("delivery_id") or request.data.get("ride_id")
    try:
        object_id = int(object_id)
    except (TypeError, ValueError):
        return Response(
            {"error": "A ride_id or delivery_id is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if scope == SCOPE_RIDE:
        from taxi.rides.models import Ride

        obj = Ride.objects.filter(id=object_id).first()
        if obj is None:
            return Response({"error": "Ride not found."}, status=status.HTTP_404_NOT_FOUND)
        if obj.rider_id != request.user.id:
            return Response(
                {"error": "You can only pay for your own ride."},
                status=status.HTTP_403_FORBIDDEN,
            )
    else:
        from deliveries.models import Delivery

        obj = Delivery.objects.filter(id=object_id).first()
        if obj is None:
            return Response(
                {"error": "Delivery not found."}, status=status.HTTP_404_NOT_FOUND
            )
        if getattr(obj, "customer_id", None) != request.user.id:
            return Response(
                {"error": "You can only pay for your own delivery."},
                status=status.HTTP_403_FORBIDDEN,
            )

    if getattr(obj, "status", "") == "cancelled":
        return Response(
            {"error": "This order was cancelled, so payment will not go through."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    amount = _whole_mru(getattr(obj, "fare", 0))
    if amount <= 0:
        return Response(
            {"error": "This order has no amount to collect."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    payment = None
    if scope == SCOPE_RIDE:
        payment = _ensure_payment_for_ride(obj, amount)
    else:
        payment = _ensure_payment_for_delivery(obj, amount)

    if payment is not None and payment.status == "paid":
        return Response(
            {"error": "This order is already paid.", "settled": True},
            status=status.HTTP_409_CONFLICT,
        )

    transaction_id = build_transaction_id(scope, object_id)
    try:
        result = provider.create_checkout_session(
            reference=transaction_id,
            amount=amount,
            phone_number=request.data.get("phone_number"),
            success_url=_safe_redirect(request.data.get("success_url")),
            cancel_url=_safe_redirect(request.data.get("cancel_url")),
        )
    except ProviderError as exc:
        logger.warning("Moosyl checkout failed for %s: %s", transaction_id, exc)
        return Response(
            {"error": "Could not start the payment. Please try again.", "code": exc.code},
            status=status.HTTP_502_BAD_GATEWAY,
        )

    checkout_url = result.payload.get("checkout_url", "")
    if not checkout_url:
        return Response(
            {"error": "Moosyl did not return a checkout page.", "code": "no_checkout_url"},
            status=status.HTTP_502_BAD_GATEWAY,
        )

    return Response(
        {
            "checkout_url": checkout_url,
            "transaction_id": transaction_id,
            "amount_mru": str(amount),
            "currency": "MRU",
            # Documented guidance: the redirect is NOT proof of payment.
            "confirmation": "backend_webhook",
            "note": (
                "Open checkout_url to pay. The order is marked paid only after the "
                "backend receives a signature-verified Moosyl webhook."
            ),
            "fee_estimate_mru": str(moosyl_fee(amount)),
            **_environment_payload(provider),
        },
        status=status.HTTP_201_CREATED,
    )


def _ensure_payment_for_delivery(delivery, amount: Decimal):
    """Create or reuse the delivery's PaymentRecord with the exact whole-MRU amount.

    The split comes from ``delivery_commission_policy()``: provisionally the same 30/70
    as rides, overridable by ``DELIVERY_PLATFORM_PERCENT`` without a migration.
    """
    from .models import PaymentRecord
    from .moosyl_settlement import delivery_commission_policy

    policy = delivery_commission_policy()
    platform_percent = Decimal(policy["platform_percent"])


    record = (
        PaymentRecord.objects.filter(source="delivery", delivery=delivery)
        .order_by("-created_at")
        .first()
    )
    if record is None:
        record = PaymentRecord.objects.create(
            source="delivery",
            customer_id=getattr(delivery, "customer_id", None),
            courier_id=getattr(delivery, "courier_id", None),
            delivery=delivery,
            amount=amount,
            method="moosyl",
            status="pending",
        )
    if record.status != "paid":
        record.amount = amount
        record.method = "moosyl"
        record.app_fee = (amount * platform_percent).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )
        record.courier_earning = amount - record.app_fee
        record.save(
            update_fields=["amount", "method", "app_fee", "courier_earning"]
        )
    return record


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def moosyl_payment_methods(request):
    """The bank apps Moosyl currently exposes for this environment.

    Fail-soft: when Moosyl is not configured (or unreachable) the caller gets an empty
    list plus a reason, so the app can fall back to the other payment options instead of
    showing a broken payment sheet.
    """
    provider, error = _provider_or_error()
    if error:
        return error

    payload = {
        "provider": provider.code,
        "supported": list(MOOSYL_BANK_APPS),
        **_environment_payload(provider),
    }
    if not provider.is_configured():
        payload.update(
            {
                "available": False,
                "methods": [],
                "reason": "Moosyl is not configured in this environment.",
            }
        )
        return Response(payload, status=status.HTTP_200_OK)

    try:
        configuration = provider.list_payment_methods()
    except ProviderError as exc:
        payload.update(
            {"available": False, "methods": [], "reason": f"Moosyl unreachable: {exc}"}
        )
        return Response(payload, status=status.HTTP_200_OK)

    enabled = set()
    for item in (configuration or {}).get("data") or []:
        for key in ("code", "name", "id", "slug"):
            value = str(item.get(key, "")).strip().lower() if isinstance(item, dict) else ""
            if value:
                enabled.add(value)

    methods = [code for code in MOOSYL_BANK_APPS if code in enabled or not enabled]
    payload.update({"available": True, "methods": methods, "raw": configuration})
    return Response(payload, status=status.HTTP_200_OK)


@api_view(["GET"])
@permission_classes([require_admin_module("finance")])
def moosyl_admin_overview(request):
    """Read-only Moosyl panel for the Admin Finance Dashboard.

    Reports environment, settlement gating, the 1% fee, and the webhook audit trail
    (settled / duplicate / ignored / rejected). It never triggers a payment, and it
    never touches driver payouts — Moosyl cannot disburse to a driver.
    """
    from django.db.models import Count

    from .models import ProviderWebhookEvent

    provider, error = _provider_or_error()
    if error:
        return error

    outcomes = dict(
        ProviderWebhookEvent.objects.filter(provider="moosyl")
        .values_list("outcome")
        .annotate(total=Count("id"))
    )
    recent = list(
        ProviderWebhookEvent.objects.filter(provider="moosyl")
        .order_by("-created_at")
        .values(
            "event_type",
            "environment",
            "transaction_id",
            "status",
            "amount",
            "outcome",
            "created_at",
        )[:20]
    )

    return Response(
        {
            "provider": provider.code,
            "label": provider.display_name,
            "bank_apps": list(MOOSYL_BANK_APPS),
            "fee_percent": str(getattr(settings, "MOOSYL_FEE_PERCENT", "1")),
            "settles_to": "yala_iban",
            "driver_payout_via_moosyl": False,
            "refunds_via_api": False,
            "webhook_url": "/payments/webhooks/moosyl/",
            "events": outcomes,
            "recent_events": recent,
            "readiness": provider.readiness(),
            **_environment_payload(provider),
        },
        status=status.HTTP_200_OK,
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def payment_options(request):
    """Single source of truth for every customer checkout surface.

    YALA Rider and YALA Delivery render exactly what this returns, so availability is
    never re-derived in the client where it would drift from server-side enforcement:

    * **cash** — available only when the cashless policy is relaxed by the owner
      (``CASHLESS_POLICY_ENFORCED=False``). Commission still applies: the payment row is
      created with the normal 30/70 split, and the driver confirms receipt through the
      existing verified path, so a cash ride is accounted exactly like a digital one.
    * **moosyl** — the bank apps Moosyl reports as enabled for this environment
      (Bankily / Masravi / Sedad). Fail-soft: if Moosyl is unreachable the documented set
      is returned so the UI still works.
    * **commission** — taxi 30/70 from ride policy; delivery 20/80 from
      ``CommissionConfig:delivery`` (or ``DELIVERY_PLATFORM_PERCENT`` override).
    """
    from app_settings.pricing_service import get_ride_commission_policy

    from .cashless import DIGITAL_METHODS, is_enforced, policy_payload
    from .moosyl_settlement import delivery_commission_policy

    provider, _ = _provider_or_error()
    cashless_enforced = is_enforced()

    moosyl = {
        "available": False,
        "methods": [],
        "environment": getattr(provider, "environment", ""),
        "mode": getattr(provider, "mode", ""),
        "settlement_enabled": bool(getattr(provider, "may_settle", False)),
        "fee_percent": str(getattr(settings, "MOOSYL_FEE_PERCENT", "1")),
    }
    if provider is not None and provider.is_configured():
        moosyl["available"] = True
        moosyl["methods"] = list(MOOSYL_BANK_APPS)
        try:
            configuration = provider.list_payment_methods()
            enabled = set()
            for item in (configuration or {}).get("data") or []:
                if not isinstance(item, dict):
                    continue
                for key in ("type", "code", "name", "id", "slug", "integration"):
                    value = str(item.get(key, "")).strip().lower()
                    if value:
                        enabled.add(value)
                cfg = item.get("config")
                if isinstance(cfg, dict):
                    code = str(cfg.get("code", "")).strip().lower()
                    if code:
                        enabled.add(code)
            if "masrivi" in enabled or "masrvi" in enabled:
                enabled.add("masravi")
            narrowed = [code for code in MOOSYL_BANK_APPS if code in enabled]
            if narrowed:
                moosyl["methods"] = narrowed
        except ProviderError:
            # Keep the documented set: a discovery failure must not empty the UI.
            logger.warning("Moosyl /configuration unavailable; using the documented set")

    ride_methods = [m for m in ("card", "bankily", "masrvi", "seddad", "wallet", "bank_account")]
    delivery_methods = [m for m in ("card", "bankily", "masravi", "sedad")]
    if not cashless_enforced:
        ride_methods.append("cash")
        delivery_methods.append("cash")

    ride_policy = get_ride_commission_policy()
    delivery_policy = delivery_commission_policy()

    return Response(
        {
            "cash": {
                "available": not cashless_enforced,
                "method": "cash",
                # Cash is not "free": the same commission split is recorded, and the
                # driver confirms receipt before the ride is considered paid.
                "commission_applies": True,
                "reason": (
                    "Cash is disabled by the platform cashless policy."
                    if cashless_enforced
                    else ""
                ),
            },
            "cashless_policy_enforced": cashless_enforced,
            "ride_methods": ride_methods,
            "delivery_methods": delivery_methods,
            "digital_methods": sorted(DIGITAL_METHODS),
            "moosyl": moosyl,
            "commission": {
                "ride": {
                    "platform_percent": str(ride_policy["platform_percent"]),
                    "driver_percent": str(ride_policy["driver_percent"]),
                },
                "delivery": {
                    "platform_percent": str(delivery_policy["platform_percent"]),
                    "driver_percent": str(delivery_policy["driver_percent"]),
                    "source": delivery_policy["source"],
                },
            },
            # The app must treat the backend webhook as the only confirmation.
            "confirmation": "backend_webhook",
            "policy": policy_payload(),
        },
        status=status.HTTP_200_OK,
    )




