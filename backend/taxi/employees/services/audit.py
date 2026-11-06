"""Audit logging for Employee Management actions.

Thin wrapper over the shared ``security.AuditLog`` system (reused, not
reinvented). Every helper records: actor (authorized user), action, affected
record (entity_type + entity_id), and timestamp (AuditLog.created_at). It never
records passwords, QR tokens, photograph contents, or other sensitive HR data —
``details`` carries only non-sensitive descriptive metadata.
"""

from __future__ import annotations

from typing import Any

from security.services.audit_service import log_from_request

# AuditLog.action for all employee lifecycle events (an "admin_action").
EMPLOYEE_ACTION = "admin_action"

# AuditLog.entity_type values (added to security.AuditLog.ENTITY_CHOICES).
ENTITY_EMPLOYEE = "employee"
ENTITY_ID_CARD = "id_card"

# Allow-listed event names recorded in details["event"]. Keeping an explicit
# set prevents accidental logging of arbitrary/sensitive event payloads.
EMPLOYEE_EVENTS = frozenset(
    {
        "employee.register",
        "employee.update",
        "employee.status_change",
        "employee.record_access",
        "employee.photo_upload",
        "employee.photo_replace",
        "employee.photo_access",
        "employee.photo_denied",
        # Electronic signature (Founder/CEO directive). Capture/upload/replace/remove/access
        # are separate events so a signature change is always individually traceable.
        "employee.signature_capture",
        "employee.signature_upload",
        "employee.signature_replace",
        "employee.signature_remove",
        "employee.signature_access",
        "employee.signature_denied",
        # Attendance (Founder/CEO directive). Every state transition is individually
        # traceable, and corrections are audited separately from the original record.
        "employee.attendance_clock_in",
        "employee.attendance_clock_out",
        "employee.attendance_break_start",
        "employee.attendance_break_end",
        "employee.attendance_qr_scan",
        "employee.attendance_access",
        "employee.attendance_correction_requested",
        "employee.attendance_correction_approved",
        "employee.attendance_correction_rejected",
        "employee.attendance_correction_self_review_blocked",
        "employee.attendance_policy_change",
        "employee.attendance_shift_scheduled",
        "card.issue",
        "card.renew",
        "card.replace",
        "card.activate",
        "card.deactivate",
        "card.revoke",
    }
)

# Keys that must never appear in audit details, even if a caller passes them.
_SENSITIVE_KEYS = frozenset(
    {
        "password",
        "token",
        "qr_token",
        "qr_uuid",
        "signed_token",
        "photo",
        "photograph",
        "photo_bytes",
        "photo_key",
        # Signature payloads/keys must never be written into the audit trail.
        "signature",
        "signature_bytes",
        "signature_key",
        "signature_image",
        "signature_data_url",
        "national_id_number",
        "national_id_document",
        "date_of_birth",
        "dob",
    }
)


def _scrub(details: dict[str, Any] | None) -> dict[str, Any]:
    """Drop any sensitive keys from the details payload defensively."""
    if not details:
        return {}
    return {k: v for k, v in details.items() if k.lower() not in _SENSITIVE_KEYS}


def log_employee_event(
    request,
    *,
    event: str,
    summary: str,
    entity_type: str = ENTITY_EMPLOYEE,
    entity_id: str | int = "",
    details: dict[str, Any] | None = None,
):
    """Record an employee/card lifecycle event in the shared audit trail.

    - actor + ip are filled from the request by ``log_from_request``.
    - ``event`` must be in EMPLOYEE_EVENTS (guards against stray events).
    - sensitive keys are scrubbed from ``details``.
    """
    if event not in EMPLOYEE_EVENTS:
        raise ValueError(f"Unknown employee audit event: {event!r}")

    payload = _scrub(details)
    payload["event"] = event

    return log_from_request(
        request,
        action=EMPLOYEE_ACTION,
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id else "",
        summary=summary[:255],
        details=payload,
    )
