import json
import logging
import secrets
from datetime import timedelta
from urllib import request as urllib_request

from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.core.cache import cache
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import PhoneVerificationCode


logger = logging.getLogger(__name__)


def send_sms(phone_number, message):
    provider = settings.YALA_SMS_PROVIDER
    if provider == "console":
        logger.warning("Yala SMS to %s: %s", phone_number, message)
        return

    if provider == "http" and settings.YALA_SMS_API_URL and settings.YALA_SMS_API_KEY:
        payload = json.dumps(
            {"to": phone_number, "message": message, "sender": settings.YALA_SMS_SENDER}
        ).encode("utf-8")
        req = urllib_request.Request(
            settings.YALA_SMS_API_URL,
            data=payload,
            headers={
                "Authorization": f"Bearer {settings.YALA_SMS_API_KEY}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        with urllib_request.urlopen(req, timeout=10) as response:
            if response.status >= 400:
                raise RuntimeError("SMS provider rejected the message.")
        return

    raise RuntimeError("SMS provider is not configured.")


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def request_phone_verification(request):
    user = request.user
    if not user.phone_number:
        return Response(
            {"error": "Add a phone number before requesting verification."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if user.is_phone_verified:
        return Response({"message": "Phone number is already verified."})

    throttle_key = f"phone-verification:{user.id}"
    if cache.get(throttle_key):
        return Response(
            {"error": "Please wait one minute before requesting another code."},
            status=status.HTTP_429_TOO_MANY_REQUESTS,
        )

    PhoneVerificationCode.objects.filter(user=user, consumed_at__isnull=True).update(
        consumed_at=timezone.now()
    )
    code = f"{secrets.randbelow(1_000_000):06d}"
    verification = PhoneVerificationCode.objects.create(
        user=user,
        code_hash=make_password(code),
        expires_at=timezone.now() + timedelta(minutes=10),
    )

    try:
        send_sms(
            user.phone_number,
            f"Your Yala verification code is {code}. It expires in 10 minutes.",
        )
    except Exception:
        verification.consumed_at = timezone.now()
        verification.save(update_fields=["consumed_at"])
        logger.exception("Could not send phone verification code")
        return Response(
            {"error": "Verification service is temporarily unavailable."},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    cache.set(throttle_key, True, timeout=60)
    response = {"message": "Verification code sent.", "expires_in_seconds": 600}
    if settings.DEBUG and settings.YALA_SMS_PROVIDER == "console":
        response["debug_code"] = code
    return Response(response)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def verify_phone(request):
    code = str(request.data.get("code", "")).strip()
    if len(code) != 6 or not code.isdigit():
        return Response(
            {"error": "Enter the six-digit verification code."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    verification = request.user.phone_verification_codes.filter(
        consumed_at__isnull=True
    ).first()
    if not verification or not verification.is_active:
        return Response(
            {"error": "The verification code has expired. Request a new code."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if not check_password(code, verification.code_hash):
        verification.attempts += 1
        verification.save(update_fields=["attempts"])
        return Response(
            {"error": "Incorrect verification code."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    now = timezone.now()
    verification.consumed_at = now
    verification.save(update_fields=["consumed_at"])
    request.user.phone_verified_at = now
    request.user.save(update_fields=["phone_verified_at"])
    return Response({"message": "Phone number verified.", "phone_verified": True})
