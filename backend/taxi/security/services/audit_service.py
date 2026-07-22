"""Centralized audit logging for Yala Delivery security events."""

from __future__ import annotations

from typing import Any

from ..models import AuditLog


def log_audit(
    *,
    action: str,
    entity_type: str,
    summary: str,
    actor=None,
    entity_id: str | int = "",
    details: dict[str, Any] | None = None,
    ip_address: str | None = None,
) -> AuditLog:
    return AuditLog.objects.create(
        actor=actor,
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id else "",
        summary=summary[:255],
        details=details or {},
        ip_address=ip_address,
    )


def _client_ip(request) -> str | None:
    if not request:
        return None
    try:
        from taxi.security.abuse import client_ip

        return client_ip(request)
    except Exception:
        forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return request.META.get("REMOTE_ADDR")


def log_from_request(request, **kwargs) -> AuditLog:
    kwargs.setdefault("ip_address", _client_ip(request))
    kwargs.setdefault("actor", getattr(request, "user", None))
    if kwargs.get("actor") and not kwargs["actor"].is_authenticated:
        kwargs["actor"] = None
    return log_audit(**kwargs)
