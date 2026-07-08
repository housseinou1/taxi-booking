"""Optional Stripe webhook receiver with signature verification.

Yala's primary rails are local wallets (Bankily/Masravi/Sedad). This endpoint is
ready for card settlement when STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are set.
Without those env vars the endpoint returns 503 (not silently accepting events).
"""

from __future__ import annotations

import logging

from django.conf import settings
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status

from taxi.security.abuse import rate_limit
from security.services.audit_service import log_from_request

logger = logging.getLogger("yala.payments.webhook")


@csrf_exempt
@api_view(["POST"])
@permission_classes([AllowAny])
def stripe_webhook(request):
    retry_after = rate_limit(request, "stripe-webhook", limit=60, window_seconds=60)
    if retry_after:
        return Response(
            {"error": "Too many webhook calls."},
            status=status.HTTP_429_TOO_MANY_REQUESTS,
            headers={"Retry-After": str(retry_after)},
        )

    secret = getattr(settings, "STRIPE_WEBHOOK_SECRET", "") or ""
    api_key = getattr(settings, "STRIPE_SECRET_KEY", "") or ""
    if not secret or not api_key or api_key.startswith("sk_live_xxx"):
        return Response(
            {"error": "Stripe webhooks are not configured."},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    payload = request.body
    sig_header = request.META.get("HTTP_STRIPE_SIGNATURE", "")
    try:
        import stripe

        stripe.api_key = api_key
        event = stripe.Webhook.construct_event(payload, sig_header, secret)
    except Exception as exc:
        logger.warning("Stripe webhook signature verification failed: %s", exc)
        log_from_request(
            request,
            action="fraud_flag",
            entity_type="payment",
            entity_id=0,
            summary="Rejected Stripe webhook (invalid signature)",
            details={"error": str(exc)[:200]},
        )
        return Response({"error": "Invalid signature."}, status=status.HTTP_400_BAD_REQUEST)

    event_type = event.get("type", "")
    event_id = event.get("id", "")
    logger.info("Stripe webhook accepted type=%s id=%s", event_type, event_id)

    # Intentionally no money movement here until live card flows are productized.
    # Acceptance + audit is enough to prevent unsigned callback abuse.
    log_from_request(
        request,
        action="admin_action",
        entity_type="payment",
        entity_id=0,
        summary=f"Stripe webhook: {event_type}",
        details={"event_id": event_id, "type": event_type},
    )
    return Response({"received": True})
