"""Play Integrity API server-side attestation hook.

Mobile apps call POST /auth/integrity/verify/ with the integrity token.
The server exchanges it with the Play Integrity API and caches the verdict.

Requires:
  PLAY_INTEGRITY_DECRYPTION_KEY  (base64 AES-256 key from Play Console)
  PLAY_INTEGRITY_VERIFICATION_KEY (base64 RSA public key from Play Console)

If keys are not configured the endpoint runs in permissive mode (dev/test).
"""

import base64
import hashlib
import json
import logging
import time
from urllib import request as urllib_request, error as urllib_error

from django.conf import settings
from django.core.cache import cache
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from taxi.security.abuse import client_ip, rate_limit

logger = logging.getLogger("yala.integrity")

VERDICT_CACHE_TTL = 3600  # 1 hour


def _exchange_token_with_google(integrity_token: str) -> dict:
    """Call Google Play Integrity API to decode the token."""
    package = getattr(settings, "PLAY_INTEGRITY_PACKAGE", "")
    api_key = getattr(settings, "PLAY_INTEGRITY_API_KEY", "")
    if not package or not api_key:
        return {}
    url = (
        f"https://playintegrity.googleapis.com/v1/{package}:decodeIntegrityToken"
        f"?key={api_key}"
    )
    payload = json.dumps({"integrity_token": integrity_token}).encode()
    req = urllib_request.Request(
        url, data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib_request.urlopen(req, timeout=8) as resp:
            return json.loads(resp.read())
    except (urllib_error.URLError, Exception) as exc:
        logger.warning("Play Integrity API call failed: %s", exc)
        return {}


def _verdict_passes(verdict: dict) -> tuple[bool, str]:
    """Return (pass, reason) from a decoded Play Integrity verdict."""
    token_payload = verdict.get("tokenPayloadExternal", {})
    device = token_payload.get("deviceIntegrity", {})
    app = token_payload.get("appIntegrity", {})
    account = token_payload.get("accountDetails", {})

    device_labels = device.get("deviceRecognitionVerdict", [])
    app_recognition = app.get("appRecognitionVerdict", "")
    license_status = account.get("appLicensingVerdict", "")

    if "MEETS_BASIC_INTEGRITY" not in device_labels:
        return False, "device_not_trusted"
    if app_recognition not in ("PLAY_RECOGNIZED", "UNRECOGNIZED_VERSION"):
        return False, "app_not_recognized"
    if license_status == "UNLICENSED":
        return False, "unlicensed"
    return True, "ok"


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def verify_integrity(request):
    """Verify a Play Integrity token and cache the verdict for this user."""
    retry_after = rate_limit(request, "integrity-verify", limit=10, window_seconds=3600)
    if retry_after:
        return Response(
            {"error": "Too many integrity checks."},
            status=status.HTTP_429_TOO_MANY_REQUESTS,
            headers={"Retry-After": str(retry_after)},
        )

    integrity_token = str(request.data.get("integrity_token", "")).strip()
    if not integrity_token:
        return Response({"error": "integrity_token required."}, status=status.HTTP_400_BAD_REQUEST)

    permissive = not getattr(settings, "PLAY_INTEGRITY_API_KEY", "")
    if permissive:
        cache.set(f"integrity:{request.user.id}", {"pass": True, "reason": "permissive"}, VERDICT_CACHE_TTL)
        return Response({"pass": True, "reason": "permissive_mode"})

    verdict = _exchange_token_with_google(integrity_token)
    passed, reason = _verdict_passes(verdict)

    cache.set(
        f"integrity:{request.user.id}",
        {"pass": passed, "reason": reason, "ts": int(time.time())},
        VERDICT_CACHE_TTL,
    )

    logger.info("Integrity verdict: user=%s pass=%s reason=%s ip=%s", request.user.id, passed, reason, client_ip(request))

    if not passed:
        try:
            from security.services.fraud_service import flag_integrity_failure

            flag_integrity_failure(request.user, reason=reason)
        except Exception:
            logger.exception("Failed to create integrity fraud flag for user=%s", request.user.id)
        return Response(
            {"pass": False, "reason": reason},
            status=status.HTTP_403_FORBIDDEN,
        )
    return Response({"pass": True, "reason": reason})


def require_integrity(user_id: int) -> bool:
    """Return True if the user has a cached passing integrity verdict."""
    if not getattr(settings, "PLAY_INTEGRITY_ENFORCE", False):
        return True
    verdict = cache.get(f"integrity:{user_id}")
    return bool(verdict and verdict.get("pass"))
