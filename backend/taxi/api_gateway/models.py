"""Phase 38 — API Gateway & Integration Platform models."""

from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import timedelta

from django.conf import settings
from django.db import models
from django.utils import timezone


class PartnerOrganization(models.Model):
    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("approved", "Approved"),
        ("suspended", "Suspended"),
        ("rejected", "Rejected"),
    ]

    name = models.CharField(max_length=200)
    contact_email = models.EmailField()
    contact_phone = models.CharField(max_length=30, blank=True, default="")
    website = models.URLField(blank=True, default="")
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default="pending", db_index=True)
    admin_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="partner_organizations",
    )
    billing_address = models.TextField(blank=True, default="")
    tax_id = models.CharField(max_length=100, blank=True, default="")
    notes = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.name


class PartnerApplication(models.Model):
    STATUS_CHOICES = [
        ("active", "Active"),
        ("inactive", "Inactive"),
        ("suspended", "Suspended"),
    ]

    organization = models.ForeignKey(
        PartnerOrganization,
        on_delete=models.CASCADE,
        related_name="applications",
    )
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True, default="")
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default="active", db_index=True)
    allowed_ips = models.JSONField(default=list, blank=True, help_text="List of allowed IPv4/IPv6 addresses or CIDR blocks.")
    scopes = models.JSONField(default=list, blank=True, help_text="List of permitted scopes such as rides:read, payments:read.")
    rate_limit_per_minute = models.PositiveIntegerField(default=100)
    callback_url = models.URLField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.name} ({self.organization.name})"

    def has_scope(self, scope: str) -> bool:
        return scope in (self.scopes or [])


class APIKey(models.Model):
    application = models.ForeignKey(
        PartnerApplication,
        on_delete=models.CASCADE,
        related_name="api_keys",
    )
    name = models.CharField(max_length=100)
    prefix = models.CharField(max_length=16, db_index=True)
    key_hash = models.CharField(max_length=128)
    secret = models.CharField(max_length=128, help_text="Stored only on creation; returned once to the client.")
    revoked = models.BooleanField(default=False)
    revoked_at = models.DateTimeField(null=True, blank=True)
    grace_period_until = models.DateTimeField(null=True, blank=True)
    rotated_from = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="successor_keys",
    )
    expires_at = models.DateTimeField(null=True, blank=True)
    last_used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.name} {self.prefix}..."

    @classmethod
    def generate_key(cls):
        raw = "yala_" + secrets.token_urlsafe(32)
        secret = secrets.token_urlsafe(32)
        prefix = raw[:16]
        key_hash = hashlib.sha256(raw.encode()).hexdigest()
        return raw, prefix, key_hash, secret

    def verify_signature(self, method: str, path: str, timestamp: str, body: bytes, signature: str) -> bool:
        if not self.secret or not signature:
            return False
        message = f"{timestamp}.{method.upper()}.{path}.".encode()
        if body:
            message += body
        expected = hmac.new(self.secret.encode(), message, hashlib.sha256).hexdigest()
        return hmac.compare_digest(expected, signature)

    def is_valid(self) -> bool:
        if self.revoked:
            if self.grace_period_until and timezone.now() <= self.grace_period_until:
                return True
            return False
        if self.expires_at and timezone.now() > self.expires_at:
            return False
        return True


class WebhookSubscription(models.Model):
    EVENT_CHOICES = [
        ("ride.accepted", "Ride Accepted"),
        ("ride.completed", "Ride Completed"),
        ("order.created", "Order Created"),
        ("order.delivered", "Order Delivered"),
        ("payment.received", "Payment Received"),
        ("withdrawal.completed", "Withdrawal Completed"),
        ("merchant.approved", "Merchant Approved"),
        ("driver.approved", "Driver Approved"),
    ]

    application = models.ForeignKey(
        PartnerApplication,
        on_delete=models.CASCADE,
        related_name="webhooks",
    )
    url = models.URLField()
    events = models.JSONField(default=list, blank=True)
    secret = models.CharField(max_length=128, default=secrets.token_urlsafe)
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.application.name} — {self.url}"


class APIGatewayLog(models.Model):
    METHOD_CHOICES = [
        ("GET", "GET"),
        ("POST", "POST"),
        ("PUT", "PUT"),
        ("PATCH", "PATCH"),
        ("DELETE", "DELETE"),
    ]

    application = models.ForeignKey(
        PartnerApplication,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="logs",
    )
    api_key = models.ForeignKey(
        APIKey,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="logs",
    )
    method = models.CharField(max_length=10, choices=METHOD_CHOICES)
    path = models.CharField(max_length=512)
    query_string = models.CharField(max_length=1024, blank=True, default="")
    status_code = models.PositiveSmallIntegerField(null=True, blank=True)
    response_time_ms = models.PositiveIntegerField(null=True, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=512, blank=True, default="")
    error_message = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["application", "-created_at"]),
            models.Index(fields=["path", "-created_at"]),
        ]

    def __str__(self):
        return f"{self.method} {self.path} — {self.status_code}"
