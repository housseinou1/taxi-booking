"""Admin platform audit helpers — auth, RBAC, and client events."""

from __future__ import annotations

from security.services.audit_service import log_audit, log_from_request

ALLOWED_CLIENT_EVENTS = frozenset(
    {
        "admin_login",
        "admin_logout",
        "permission_denied",
        "session_timeout",
        "session_extended",
        "authorization_failed",
    }
)


def _user_agent(request) -> str:
    if not request:
        return ""
    return str(request.META.get("HTTP_USER_AGENT", ""))[:500]


def log_admin_event(
    request,
    *,
    event: str,
    summary: str,
    entity_id: str | int = "",
    details: dict | None = None,
) -> None:
    payload = {"event": event, "user_agent": _user_agent(request), **(details or {})}
    log_from_request(
        request,
        action="admin_action",
        entity_type="system",
        entity_id=entity_id or getattr(getattr(request, "user", None), "pk", ""),
        summary=summary[:255],
        details=payload,
    )


def log_admin_client_event(request, event: str, details: dict | None = None) -> None:
    if event not in ALLOWED_CLIENT_EVENTS:
        raise ValueError(f"Unsupported admin audit event: {event}")

    summaries = {
        "admin_login": "Admin platform login",
        "admin_logout": "Admin platform logout",
        "permission_denied": "Admin route permission denied",
        "session_timeout": "Admin session timed out",
        "session_extended": "Admin session extended",
        "authorization_failed": "Admin authorization failed",
    }
    log_admin_event(
        request,
        event=event,
        summary=summaries.get(event, f"Admin event: {event}"),
        details=details,
    )


def log_role_change(*, actor, target_user, old_groups: list[str], new_groups: list[str]) -> None:
    log_audit(
        actor=actor,
        action="admin_action",
        entity_type="system",
        entity_id=target_user.pk,
        summary=f"Role groups changed for user {target_user.pk}",
        details={
            "event": "role_change",
            "old_groups": old_groups,
            "new_groups": new_groups,
            "target_email": getattr(target_user, "email", ""),
        },
    )
