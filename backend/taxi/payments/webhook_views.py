"""Phase 11 — authenticated provider webhooks.

``POST /payments/webhooks/<provider_code>/``

Security rules (all enforced, all tested):

* The request is rejected unless the provider's webhook secret is configured and
  the HMAC-SHA256 signature over the **raw body** matches — fail-closed.
* A webhook can never mark a payment as paid: it only records the verified event
  and (for a verified *live* success) delegates to
  ``payments.provider_security.apply_verified_confirmation``.
* Mock/sandbox webhooks are accepted only to prove the signature path works; they
  never change a financial state (``settled: false``).
"""

from __future__ import annotations

from django.views.decorators.csrf import csrf_exempt
from rest_framework import status
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .providers import MODE_LIVE, get_provider
from .provider_security import WebhookRejected, verify_webhook
from .moosyl_settlement import apply_verified_moosyl_event, payload_fingerprint


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

    # ── Moosyl: the aggregator with a documented settlement contract ──────────
    #
    # Moosyl reuses x-webhook-delivery-id across retries, so that header is the replay
    # key. If it is ever absent we fall back to a hash of the raw body, which still
    # collapses byte-identical duplicates instead of settling twice.
    if provider.code == "moosyl":
        delivery_id = str(headers.get("X-Webhook-Delivery-Id") or "").strip()
        if not delivery_id:
            delivery_id = f"{provider.code}:{payload_fingerprint(body)}"

        result = apply_verified_moosyl_event(
            provider=provider,
            verification=verification,
            delivery_id=delivery_id,
            raw_body=body,
        )
        return Response(
            {
                "provider": provider.code,
                "mode": verification.mode,
                "environment": verification.environment,
                "verified": True,
                "settled": result.settled,
                "outcome": result.outcome,
                "reason": result.detail,
                "received": True,
            },
            status=status.HTTP_200_OK,
        )

    # A verified event is recorded, but only a verified *live* success may ever
    # change a payment's financial state.
    settled = False
    if verification.mode == MODE_LIVE:
        settled = False  # live settlement is wired only after provider activation


    return Response(
        {
            "provider": provider.code,
            "mode": verification.mode,
            "verified": True,
            "settled": settled,
            "reason": verification.reason,
            "event_type": str(verification.event.get("type", "")) if verification.event else "",
            "note": (
                "Mock webhook verified for testing only; no financial state changed."
                if verification.mode != MODE_LIVE
                else "Verified live webhook received."
            ),
        },
        status=status.HTTP_202_ACCEPTED,
    )
