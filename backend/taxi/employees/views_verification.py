"""Public ID-card verification view (Phase 11) — **activation OFF by default**.

The owner approved the design; activation remains gated. While
``PUBLIC_QR_VERIFICATION_ENABLED`` is false (the default), this route answers
**404** so no public surface exists and no information can be probed. When the
owner explicitly enables it, the endpoint applies per-IP rate limiting, writes a
retention-limited scan record and returns only the minimised payload defined in
`.agents/tasks/public-qr-verification-design.md` (never DOB, national ID, phone,
email, department, job title, employee number or card number).
"""

from django.conf import settings
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from taxi.security.abuse import client_ip, rate_limit

from .services import card_verification

PUBLIC_QR_RATE_LIMIT = 10  # requests
PUBLIC_QR_RATE_WINDOW = 60  # seconds


def _not_found():
    """Identical 404 for disabled-by-flag and unknown-path cases (no oracle)."""
    return JsonResponse({"detail": "Not found."}, status=404)


@csrf_exempt
@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def verify_card_public(request, scanned):
    """Public verification of a scanned value (signed token, or legacy UUID).

    Disabled by default: while `PUBLIC_QR_VERIFICATION_ENABLED` is false the route
    answers 404, so no public surface exists and nothing can be probed. When the
    owner enables it, the endpoint applies per-IP rate limiting, requires a signed
    token (`CARD_QR_TOKENS_REQUIRED`), writes a retention-limited scan record and
    returns only the minimised payload.
    """
    if not card_verification.public_verification_enabled():
        # Feature is implemented but deliberately not activated.
        return _not_found()

    retry_after = rate_limit(
        request,
        "card_verify",
        limit=PUBLIC_QR_RATE_LIMIT,
        window_seconds=PUBLIC_QR_RATE_WINDOW,
    )
    if retry_after:
        response = Response(
            {"detail": "Too many verification attempts. Please try again later."},
            status=429,
            headers={"Retry-After": str(retry_after)},
        )
        response["Cache-Control"] = "no-store"
        return response

    payload = card_verification.verify_scanned_value(
        scanned,
        ip_address=client_ip(request),
        user_agent=request.META.get("HTTP_USER_AGENT", ""),
    )

    response = Response(payload)
    response["Cache-Control"] = "no-store"
    response["X-Content-Type-Options"] = "nosniff"
    response["Referrer-Policy"] = "no-referrer"
    response["X-Robots-Tag"] = "noindex, nofollow"
    return response
