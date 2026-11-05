"""Public website contact form → SupportTicket (``POST /support/contact/``).

Anonymous, throttled, honeypot-protected. The response carries only the ticket
reference; the raw IP and user agent are never stored (keyed hashes only).
"""

import hashlib
import hmac
import re
import secrets

from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from taxi.security.abuse import client_ip, rate_limit

from .models import SupportTicket

REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
PHONE_RE = re.compile(r"^\+?[0-9 ()\-]{6,24}$")
IP_LIMIT = (5, 3600)
EMAIL_LIMITS = ((3, 3600), (20, 86400))


class ContactSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=120, trim_whitespace=True)
    email = serializers.EmailField(max_length=254)
    phone = serializers.CharField(max_length=24, required=False, allow_blank=True, default="")
    category = serializers.ChoiceField(choices=[c for c, _ in SupportTicket.CATEGORY_CHOICES])
    message = serializers.CharField(min_length=10, max_length=2000, trim_whitespace=True)
    language = serializers.ChoiceField(choices=["en", "fr", "ar"], required=False, default="en")
    consent = serializers.BooleanField()

    def validate_phone(self, value):
        value = (value or "").strip()
        if value and not PHONE_RE.match(value):
            raise serializers.ValidationError("Enter a valid phone number.")
        return value

    def validate_consent(self, value):
        if value is not True:
            raise serializers.ValidationError("Consent is required.")
        return value


def _keyed_hash(value: str) -> str:
    return hmac.new(settings.SECRET_KEY.encode(), (value or "").encode(), hashlib.sha256).hexdigest()


def _new_reference() -> str:
    return "YALA-" + "".join(secrets.choice(REF_ALPHABET) for _ in range(8))


def _too_many(request, email):
    limits = [(rate_limit(request, "support_contact_ip", *IP_LIMIT), None)]
    for n, (limit, window) in enumerate(EMAIL_LIMITS):
        limits.append((rate_limit(request, f"support_contact_email_{n}", limit, window, identity=f"email:{email}"), None))
    return max(r for r, _ in limits)


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def public_contact(request):
    if str(request.data.get("website", "") or "").strip():
        # Honeypot filled: look successful, store nothing.
        return Response({"reference": _new_reference(), "status": "open"}, status=status.HTTP_201_CREATED)

    serializer = ContactSerializer(data=request.data)
    if not serializer.is_valid():
        return Response({"errors": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)
    data = serializer.validated_data
    email = data["email"].strip().lower()

    retry_after = _too_many(request, email)
    if retry_after:
        return Response(
            {"error": "Too many messages. Please try again later."},
            status=status.HTTP_429_TOO_MANY_REQUESTS,
            headers={"Retry-After": str(retry_after)},
        )

    ticket = None
    for _ in range(5):
        try:
            with transaction.atomic():
                ticket = SupportTicket.objects.create(
                    ticket_type="contact_form",
                    source="website",
                    reference=_new_reference(),
                    category=data["category"],
                    language=data["language"],
                    subject=f"Website contact: {data['category']}",
                    message=data["message"],
                    contact_name=data["name"],
                    contact_email=email,
                    contact_phone=data["phone"],
                    consent_at=timezone.now(),
                    ip_hash=_keyed_hash(client_ip(request)),
                    user_agent_hash=_keyed_hash(request.META.get("HTTP_USER_AGENT", "")),
                )
            break
        except IntegrityError:
            continue
    if ticket is None:
        return Response({"error": "Please try again."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

    try:
        from security.models import AuditLog

        AuditLog.objects.create(
            action="support_ticket_created",
            entity_type="support_ticket",
            entity_id=ticket.reference,
            summary=f"Website contact ticket {ticket.reference} ({ticket.category})",
            details={"source": "website", "language": ticket.language},
        )
    except Exception:  # audit must never block the customer's request
        pass

    return Response({"reference": ticket.reference, "status": ticket.status}, status=status.HTTP_201_CREATED)
