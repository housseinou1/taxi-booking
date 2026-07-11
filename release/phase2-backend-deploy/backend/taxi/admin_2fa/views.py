"""Admin TOTP 2FA views.

Setup flow:
  POST /auth/2fa/setup/    → generates secret + QR provisioning URI
  POST /auth/2fa/confirm/  → confirms with first valid code, marks is_confirmed=True
  POST /auth/2fa/verify/   → validates a code (called after login for admin users)
  GET  /auth/2fa/status/   → returns whether 2FA is set up and confirmed
"""

import io
import base64
import logging

import pyotp
import qrcode

from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAdminUser, IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from taxi.security.abuse import rate_limit

from .models import AdminTOTP

logger = logging.getLogger("yala.2fa")


def _qr_png_base64(uri: str) -> str:
    img = qrcode.make(uri)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


@api_view(["POST"])
@permission_classes([IsAdminUser])
def totp_setup(request):
    """Generate a new TOTP secret for this admin. Returns provisioning URI and QR."""
    totp_obj, created = AdminTOTP.objects.get_or_create(
        user=request.user,
        defaults={"secret": pyotp.random_base32()},
    )
    if not created and totp_obj.is_confirmed:
        return Response(
            {"error": "2FA is already confirmed. Disable it first to reset."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if not created:
        totp_obj.secret = pyotp.random_base32()
        totp_obj.save(update_fields=["secret"])

    uri = totp_obj.provisioning_uri()
    return Response({
        "secret": totp_obj.secret,
        "provisioning_uri": uri,
        "qr_png_base64": _qr_png_base64(uri),
        "message": "Scan the QR code in your authenticator app, then confirm with a code.",
    })


@api_view(["POST"])
@permission_classes([IsAdminUser])
def totp_confirm(request):
    """Confirm TOTP setup by submitting the first valid code."""
    retry_after = rate_limit(request, "totp-confirm", limit=5, window_seconds=300)
    if retry_after:
        return Response(
            {"error": "Too many attempts. Try again later."},
            status=status.HTTP_429_TOO_MANY_REQUESTS,
            headers={"Retry-After": str(retry_after)},
        )
    totp_obj = AdminTOTP.objects.filter(user=request.user).first()
    if not totp_obj:
        return Response({"error": "Run /auth/2fa/setup/ first."}, status=status.HTTP_400_BAD_REQUEST)
    if totp_obj.is_confirmed:
        return Response({"error": "2FA is already confirmed."}, status=status.HTTP_400_BAD_REQUEST)

    code = str(request.data.get("code", "")).strip()
    if not totp_obj.verify(code):
        logger.warning("TOTP confirm failed: user=%s", request.user.id)
        return Response({"error": "Invalid code."}, status=status.HTTP_400_BAD_REQUEST)

    totp_obj.is_confirmed = True
    totp_obj.confirmed_at = timezone.now()
    totp_obj.save(update_fields=["is_confirmed", "confirmed_at"])
    logger.info("TOTP confirmed: user=%s", request.user.id)
    return Response({"message": "2FA enabled successfully."})


@api_view(["POST"])
@permission_classes([AllowAny])
def totp_verify(request):
    """Verify a TOTP code after admin password login.

    Accepts either:
      - pending_token from login (preferred, issues JWT on success), or
      - Authorization Bearer with an authenticated admin user.
    """
    from rest_framework_simplejwt.tokens import RefreshToken
    from django.contrib.auth import get_user_model
    from .pending import consume_pending_token

    retry_after = rate_limit(request, "totp-verify", limit=5, window_seconds=300)
    if retry_after:
        return Response(
            {"error": "Too many attempts. Try again later."},
            status=status.HTTP_429_TOO_MANY_REQUESTS,
            headers={"Retry-After": str(retry_after)},
        )

    code = str(request.data.get("code", "")).strip()
    pending_token = str(request.data.get("pending_token", "")).strip()
    User = get_user_model()
    user = None

    if pending_token:
        user_id = consume_pending_token(pending_token)
        if not user_id:
            return Response(
                {"error": "2FA session expired. Please sign in again."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        user = User.objects.filter(pk=user_id, is_active=True, is_staff=True).first()
        if not user:
            return Response({"error": "Invalid admin session."}, status=status.HTTP_401_UNAUTHORIZED)
    elif request.user and request.user.is_authenticated:
        user = request.user
    else:
        return Response(
            {"error": "pending_token or authenticated session required."},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    totp_obj = AdminTOTP.objects.filter(user=user, is_confirmed=True).first()
    if not totp_obj:
        return Response({"error": "2FA is not set up for this account."}, status=status.HTTP_400_BAD_REQUEST)

    if not totp_obj.verify(code):
        logger.warning("TOTP verify failed: user=%s", user.id)
        return Response({"error": "Invalid or expired code."}, status=status.HTTP_400_BAD_REQUEST)

    if pending_token:
        refresh = RefreshToken.for_user(user)
        return Response({
            "verified": True,
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "is_2fa_required": False,
            "email": user.email,
            "user_type": getattr(user, "user_type", "admin"),
            "is_staff": True,
            "is_superuser": bool(user.is_superuser),
            "is_driver": bool(getattr(user, "is_driver", False)),
            "is_rider": bool(getattr(user, "is_rider", True)),
            "first_name": user.first_name,
            "last_name": user.last_name,
            "id": user.id,
            "message": "2FA verified.",
        })

    return Response({"verified": True, "message": "2FA verified."})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def totp_status(request):
    """Return 2FA setup status for the current user."""
    totp_obj = AdminTOTP.objects.filter(user=request.user).first()
    return Response({
        "is_2fa_enabled": totp_obj is not None and totp_obj.is_confirmed,
        "is_admin": request.user.is_staff,
    })
