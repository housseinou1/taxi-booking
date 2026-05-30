"""
Email verification and password reset endpoints.
"""
from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.conf import settings
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_encode, urlsafe_base64_decode

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from .tokens import email_verification_token

User = get_user_model()

FRONTEND_URL = settings.FRONTEND_URL if hasattr(settings, "FRONTEND_URL") else "http://localhost:3000"


def _send_verification_email(user, request=None):
    """Send email verification link to user."""
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = email_verification_token.make_token(user)
    link = f"{FRONTEND_URL}/verify-email?uid={uid}&token={token}"

    send_mail(
        subject="Yala — Verify your email",
        message=f"Hi {user.first_name},\n\nClick this link to verify your email:\n{link}\n\nIf you didn't create this account, ignore this email.",
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
        fail_silently=True,
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def send_verification_email(request):
    """Resend verification email to the authenticated user."""
    user = request.user
    if user.email_verified:
        return Response({"message": "Email already verified."})

    _send_verification_email(user, request)
    return Response({"message": "Verification email sent."})


@api_view(["POST"])
@permission_classes([AllowAny])
def verify_email(request):
    """Verify email with uid + token from the link."""
    uid = request.data.get("uid", "")
    token = request.data.get("token", "")

    if not uid or not token:
        return Response(
            {"error": "Missing uid or token."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        user_id = force_str(urlsafe_base64_decode(uid))
        user = User.objects.get(pk=user_id)
    except (TypeError, ValueError, User.DoesNotExist):
        return Response(
            {"error": "Invalid verification link."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not email_verification_token.check_token(user, token):
        return Response(
            {"error": "Verification link expired or invalid."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user.email_verified = True
    user.save(update_fields=["email_verified"])

    return Response({"message": "Email verified successfully."})


@api_view(["POST"])
@permission_classes([AllowAny])
def request_password_reset(request):
    """Send password reset link to the provided email."""
    email = request.data.get("email", "").strip().lower()

    if not email:
        return Response(
            {"error": "Email is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        user = User.objects.get(email__iexact=email)
    except User.DoesNotExist:
        # Don't reveal whether email exists
        return Response({"message": "If that email exists, a reset link has been sent."})

    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    link = f"{FRONTEND_URL}/reset-password?uid={uid}&token={token}"

    send_mail(
        subject="Yala — Reset your password",
        message=f"Hi {user.first_name},\n\nClick this link to reset your password:\n{link}\n\nIf you didn't request this, ignore this email.",
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
        fail_silently=True,
    )

    return Response({"message": "If that email exists, a reset link has been sent."})


@api_view(["POST"])
@permission_classes([AllowAny])
def confirm_password_reset(request):
    """Reset password with uid + token + new_password."""
    uid = request.data.get("uid", "")
    token = request.data.get("token", "")
    new_password = request.data.get("new_password", "")

    if not uid or not token or not new_password:
        return Response(
            {"error": "uid, token, and new_password are required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if len(new_password) < 8:
        return Response(
            {"error": "Password must be at least 8 characters."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        user_id = force_str(urlsafe_base64_decode(uid))
        user = User.objects.get(pk=user_id)
    except (TypeError, ValueError, User.DoesNotExist):
        return Response(
            {"error": "Invalid reset link."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not default_token_generator.check_token(user, token):
        return Response(
            {"error": "Reset link expired or invalid."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user.set_password(new_password)
    user.save()

    return Response({"message": "Password reset successfully. You can now log in."})
