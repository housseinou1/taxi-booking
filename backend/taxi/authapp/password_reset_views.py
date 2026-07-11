import logging
import secrets
import threading
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import check_password, make_password
from django.contrib.auth.password_validation import validate_password
from django.core.mail import send_mail
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

from taxi.security.abuse import client_ip, rate_limit

from .models import PasswordResetCode
from .phone_views import send_sms
from .validators import normalize_mauritania_phone


logger = logging.getLogger(__name__)
User = get_user_model()

RESET_CODE_TTL_MINUTES = 5
RESET_CODE_MAX_ATTEMPTS = 5


def _device_info(request):
    return (request.META.get("HTTP_USER_AGENT") or "")[:1000]


def _audit_ip(request):
    value = client_ip(request)
    return None if value == "unknown" else value


def _normalize_identifier(data):
    phone = str(data.get("phone") or "").strip()
    email = str(data.get("email") or "").strip().lower()

    if phone:
        return "phone", normalize_mauritania_phone(phone)
    if email:
        return "email", email
    return "", ""


def _find_user(identifier_type, identifier):
    if identifier_type == "phone":
        return User.objects.filter(phone_number=identifier).first()
    if identifier_type == "email":
        return User.objects.filter(email__iexact=identifier).first()
    return None


def _public_reset_response(message=None):
    return {
        "message": message or "If the account exists, a reset code has been sent.",
        "expires_in_seconds": RESET_CODE_TTL_MINUTES * 60,
    }


def _send_reset_code(user, identifier_type, identifier, code):
    message = f"Your Yala password reset code is {code}. It expires in 5 minutes."

    if identifier_type == "phone":
        try:
            send_sms(identifier, message)
            return "sms"
        except Exception:
            logger.exception("Could not send password reset SMS")

    if user.email:
        send_mail(
            subject="Yala — Password reset code",
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            fail_silently=True,
        )
        return "email"

    return "none"


def _get_active_reset(identifier_type, identifier):
    return PasswordResetCode.objects.filter(
        identifier_type=identifier_type,
        identifier=identifier,
        consumed_at__isnull=True,
    ).first()


def _check_code(reset_code, code):
    if not reset_code or not reset_code.is_active:
        return False, "The reset code has expired. Request a new code."

    if not check_password(code, reset_code.code_hash):
        reset_code.attempts += 1
        reset_code.save(update_fields=["attempts"])
        return False, "Incorrect reset code."

    return True, ""


def _blacklist_user_refresh_tokens(user):
    for token in OutstandingToken.objects.filter(user=user):
        BlacklistedToken.objects.get_or_create(token=token)


@api_view(["POST"])
@permission_classes([AllowAny])
def forgot_password(request):
    retry_after = rate_limit(
        request,
        "forgot-password",
        limit=5,
        window_seconds=900,
    )
    if retry_after:
        return Response(
            {"error": "Too many reset requests. Please wait and try again."},
            status=status.HTTP_429_TOO_MANY_REQUESTS,
            headers={"Retry-After": str(retry_after)},
        )

    try:
        identifier_type, identifier = _normalize_identifier(request.data)
    except Exception as exc:
        return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    if not identifier_type:
        return Response(
            {"error": "Enter your phone number or email."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user = _find_user(identifier_type, identifier)
    response = _public_reset_response()

    if not user:
        logger.info(
            "Password reset requested for unknown %s",
            identifier_type,
            extra={"identifier_type": identifier_type, "ip": client_ip(request)},
        )
        return Response(response)

    PasswordResetCode.objects.filter(
        user=user,
        consumed_at__isnull=True,
    ).update(consumed_at=timezone.now())

    code = f"{secrets.randbelow(1_000_000):06d}"
    reset_code = PasswordResetCode.objects.create(
        user=user,
        identifier_type=identifier_type,
        identifier=identifier,
        code_hash=make_password(code),
        expires_at=timezone.now() + timedelta(minutes=RESET_CODE_TTL_MINUTES),
        requested_ip_address=_audit_ip(request),
        requested_device_info=_device_info(request),
    )

    delivery_method = "email" if identifier_type == "email" else "sms"

    def deliver_code():
        try:
            _send_reset_code(user, identifier_type, identifier, code)
        except Exception:
            logger.exception("Failed to deliver password reset code for user %s", user.id)

    threading.Thread(target=deliver_code, daemon=True).start()
    logger.info(
        "Password reset code created",
        extra={
            "user_id": user.id,
            "reset_code_id": reset_code.id,
            "identifier_type": identifier_type,
            "delivery_method": delivery_method,
            "ip": client_ip(request),
        },
    )

    response["delivery_method"] = delivery_method
    if settings.DEBUG:
        response["debug_code"] = code
    return Response(response)


@api_view(["POST"])
@permission_classes([AllowAny])
def verify_reset_code(request):
    retry_after = rate_limit(
        request,
        "verify-reset-code",
        limit=10,
        window_seconds=900,
    )
    if retry_after:
        return Response(
            {"error": "Too many verification attempts. Please wait and try again."},
            status=status.HTTP_429_TOO_MANY_REQUESTS,
            headers={"Retry-After": str(retry_after)},
        )

    try:
        identifier_type, identifier = _normalize_identifier(request.data)
    except Exception as exc:
        return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    code = str(request.data.get("code") or "").strip()
    if not identifier_type or len(code) != 6 or not code.isdigit():
        return Response(
            {"error": "Enter your phone or email and six-digit reset code."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    reset_code = _get_active_reset(identifier_type, identifier)
    is_valid, error = _check_code(reset_code, code)
    if not is_valid:
        return Response({"error": error}, status=status.HTTP_400_BAD_REQUEST)

    reset_code.verified_at = timezone.now()
    reset_code.save(update_fields=["verified_at"])
    return Response({"message": "Reset code verified.", "verified": True})


@api_view(["POST"])
@permission_classes([AllowAny])
def reset_password(request):
    retry_after = rate_limit(
        request,
        "reset-password",
        limit=10,
        window_seconds=900,
    )
    if retry_after:
        return Response(
            {"error": "Too many reset attempts. Please wait and try again."},
            status=status.HTTP_429_TOO_MANY_REQUESTS,
            headers={"Retry-After": str(retry_after)},
        )

    try:
        identifier_type, identifier = _normalize_identifier(request.data)
    except Exception as exc:
        return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    code = str(request.data.get("code") or "").strip()
    new_password = str(request.data.get("new_password") or "")

    if not identifier_type or len(code) != 6 or not code.isdigit() or not new_password:
        return Response(
            {"error": "Phone or email, six-digit code, and new password are required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    reset_code = _get_active_reset(identifier_type, identifier)
    is_valid, error = _check_code(reset_code, code)
    if not is_valid:
        return Response({"error": error}, status=status.HTTP_400_BAD_REQUEST)

    user = reset_code.user
    try:
        validate_password(new_password, user=user)
    except Exception as exc:
        return Response({"error": " ".join(exc.messages)}, status=status.HTTP_400_BAD_REQUEST)

    now = timezone.now()
    user.set_password(new_password)
    user.save(update_fields=["password"])

    reset_code.verified_at = reset_code.verified_at or now
    reset_code.consumed_at = now
    reset_code.reset_ip_address = _audit_ip(request)
    reset_code.reset_device_info = _device_info(request)
    reset_code.save(
        update_fields=[
            "verified_at",
            "consumed_at",
            "reset_ip_address",
            "reset_device_info",
        ]
    )
    _blacklist_user_refresh_tokens(user)

    logger.info(
        "Password reset completed",
        extra={
            "user_id": user.id,
            "reset_code_id": reset_code.id,
            "identifier_type": identifier_type,
            "ip": client_ip(request),
        },
    )
    return Response({"message": "Password reset successfully. You can now log in."})
