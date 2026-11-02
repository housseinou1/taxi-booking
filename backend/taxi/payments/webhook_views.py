"""Phase 11 — authenticated provider webhooks.

``POST /payments/webhooks/<provider_code>/``

Security rules (all enforced, all tested):

* The request is rejected unless the provider's webhook secret is configured and
  the HMAC-SHA256 signature over the **raw body** matches — fail-closed.
* A webhook never marks a payment paid by itself: for a verified *live* event it
  re-verifies the payment with the provider and delegates to
  ``payments.provider_settlement.settle_verified_payment``.
* Mock/sandbox webhooks are accepted only to prove the signature path works; they
  never change a financial state (``settled: false``).
"""

from __future__ import annotations

from django.views.decorators.csrf import csrf_exempt
from rest_framework import status
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .providers import MODE_LIVE, ProviderError, get_provider
from .provider_security import WebhookRejected, verify_webhook
from .provider_settlement import SettlementRefused, settle_verified_payment


@csrf_exempt
@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def provider_webhook(request, provider_code):
    """Authenticated provider callback. Signature required; no signature ⇒ 403."""
    try:
        provider = get_provider(provider_code)
    except KeyError:
        return Response(
            {"error": f"Unknown payment provider: {provider_code}"},
            status=status.HTTP_404_NOT_FOUND,
        )

    body = request.body or b""
    headers = {key: value for key, value in request.headers.items()}

    try:
        verification = verify_webhook(provider_code, body, headers)
    except WebhookRejected as exc:
        return Response(
            {"error": exc.reason, "code": "webhook_rejected", "settled": False},
            status=exc.status_code,
        )

    # Only a verified *live* event can change a financial state, and even then the
    # webhook body is not trusted: the payment is re-verified server-side with the
    # provider (verify_collection) before provider_settlement settles it.
    settled = False
    duplicate = False
    reason = verification.reason
    if verification.mode == MODE_LIVE:
        reference = str((verification.event or {}).get("reference", "") or "")
        try:
            result = provider.verify_collection(reference=reference)
            outcome = settle_verified_payment(provider.code, result)
            settled, duplicate = outcome.settled, outcome.duplicate
            reason = outcome.status or reason
        except SettlementRefused as exc:
            reason = exc.code
        except ProviderError as exc:
            reason = getattr(exc, "code", "provider_error")

    return Response(
        {
            "provider": provider.code,
            "mode": verification.mode,
            "verified": True,
            "settled": settled,
            "duplicate": duplicate,
            "reason": reason,
            "event_type": str(verification.event.get("type", "")) if verification.event else "",
            "note": (
                "Mock webhook verified for testing only; no financial state changed."
                if verification.mode != MODE_LIVE
                else "Verified live webhook received."
            ),
        },
        status=status.HTTP_202_ACCEPTED,
    )
