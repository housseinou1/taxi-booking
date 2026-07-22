"""Phase 38 — API Gateway permissions."""

import hashlib
import ipaddress

from django.conf import settings
from django.core.cache import cache
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.exceptions import APIException, PermissionDenied

from operations.executive_permissions import can_manage_api_gateway

from .models import APIKey, PartnerApplication

PARTNER_PATH_SCOPES = {
    "/api-gateway/v1/partner/rides/": ["rides:read"],
    "/api-gateway/v1/partner/deliveries/": ["deliveries:read"],
    "/api-gateway/v1/partner/merchant-orders/": ["merchants:read"],
    "/api-gateway/v1/partner/driver-availability/": ["drivers:read"],
    "/api-gateway/v1/partner/wallet/": ["wallets:read"],
    "/api-gateway/v1/partner/payments/": ["payments:read"],
    "/api-gateway/v1/partner/invoices/": ["finance:read"],
    "/api-gateway/v1/partner/reports/": ["reports:read"],
    "/api-gateway/v1/partner/notifications/": ["notifications:write"],
}


def _required_scopes_for_request(request, view) -> list[str]:
    handler = view
    if not hasattr(handler, "required_scopes"):
        handler = getattr(view, "view", None) or getattr(view, "__wrapped__", None) or view
    scopes = getattr(handler, "required_scopes", None)
    if scopes:
        return scopes
    path = request.path
    if path in PARTNER_PATH_SCOPES:
        return PARTNER_PATH_SCOPES[path]
    for prefix, mapped in PARTNER_PATH_SCOPES.items():
        if prefix.endswith("/") and path.startswith(prefix.rstrip("/") + "/") and prefix != path:
            return mapped
    return []


class RateLimitExceeded(APIException):
    status_code = status.HTTP_429_TOO_MANY_REQUESTS
    default_detail = "Rate limit exceeded."
    default_code = "rate_limit_exceeded"


class InvalidAPIKey(APIException):
    status_code = status.HTTP_401_UNAUTHORIZED
    default_detail = "Invalid or missing API key."
    default_code = "invalid_api_key"


class HasAPIKey(permissions.BasePermission):
    """Validate API key from X-API-Key header, optional HMAC signature, IP whitelist, and rate limit."""

    def has_permission(self, request, view):
        user = request.user
        if user and user.is_authenticated and can_manage_api_gateway(user):
            request.api_gateway_application = None
            request.api_gateway_api_key = None
            return True

        key = request.headers.get("X-API-Key")
        if not key:
            raise InvalidAPIKey("X-API-Key header is required.")

        prefix = key[:16]
        key_hash = hashlib.sha256(key.encode()).hexdigest()
        try:
            api_key = (
                APIKey.objects.select_related("application", "application__organization")
                .filter(prefix=prefix, key_hash=key_hash)
                .first()
            )
        except Exception:
            api_key = None

        if not api_key or not api_key.is_valid():
            raise InvalidAPIKey("API key not found or revoked/expired.")

        app = api_key.application
        if app.status != "active" or app.organization.status != "approved":
            raise InvalidAPIKey("Application or organization is not active.")

        if app.allowed_ips:
            client_ip = self._client_ip(request)
            if not self._ip_allowed(client_ip, app.allowed_ips):
                raise InvalidAPIKey("Request IP not whitelisted.")

        signature = request.headers.get("X-API-Signature")
        timestamp = request.headers.get("X-API-Timestamp")
        if signature:
            path = request.path
            body = request.body if hasattr(request, "body") else b""
            if timestamp:
                max_skew = getattr(settings, "API_GATEWAY_SIGNATURE_MAX_SKEW_SECONDS", 300)
                try:
                    ts_value = int(timestamp)
                    if abs(timezone.now().timestamp() - ts_value) > max_skew:
                        raise InvalidAPIKey("Request timestamp expired.")
                except (TypeError, ValueError):
                    raise InvalidAPIKey("Invalid request timestamp.")
            if not api_key.verify_signature(request.method, path, timestamp or "", body, signature):
                raise InvalidAPIKey("Invalid request signature.")

        self._check_rate_limit(app, api_key)

        request.api_gateway_application = app
        request.api_gateway_api_key = api_key
        api_key.last_used_at = timezone.now()
        api_key.save(update_fields=["last_used_at"])
        return True

    def _client_ip(self, request):
        x_forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
        if x_forwarded:
            return x_forwarded.split(",")[0].strip()
        return request.META.get("REMOTE_ADDR", "")

    def _ip_allowed(self, client_ip, allowed_list):
        if not client_ip:
            return False
        try:
            client = ipaddress.ip_address(client_ip)
        except ValueError:
            return False
        for item in allowed_list:
            try:
                if client in ipaddress.ip_network(item, strict=False):
                    return True
            except ValueError:
                if client_ip == item:
                    return True
        return False

    def _check_rate_limit(self, app: PartnerApplication, api_key):
        cache_key = f"api_gateway_rate:{api_key.prefix}"
        current = cache.get(cache_key, 0)
        limit = app.rate_limit_per_minute
        if current >= limit:
            raise RateLimitExceeded()
        cache.set(cache_key, current + 1, 60)


class HasScope(permissions.BasePermission):
    """Check that the partner application has the required scope."""

    def has_permission(self, request, view):
        app = getattr(request, "api_gateway_application", None)
        if not app:
            user = request.user
            if user and user.is_authenticated and can_manage_api_gateway(user):
                return True
            return False

        handler = view
        if not hasattr(handler, "required_scopes"):
            handler = getattr(view, "view", None) or getattr(view, "__wrapped__", None) or view
        scopes = _required_scopes_for_request(request, handler)
        if scopes and not all(scope in (app.scopes or []) for scope in scopes):
            raise PermissionDenied(
                detail=f"Insufficient API scope. Required: {', '.join(scopes)}",
                code="insufficient_scope",
            )
        return True
