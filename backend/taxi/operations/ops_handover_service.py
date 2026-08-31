"""Operations shift handover service — auditable handoffs between ops operators."""

from __future__ import annotations

from django.utils import timezone

from security.services.audit_service import log_from_request

from .models import OpsShiftHandover


def serialize_handover(row: OpsShiftHandover) -> dict:
    return {
        "id": row.id,
        "status": row.status,
        "city_id": row.city_id,
        "outgoing_operator": {
            "id": row.outgoing_operator_id,
            "name": row.outgoing_operator.get_full_name() or row.outgoing_operator.email,
            "email": row.outgoing_operator.email,
        },
        "incoming_operator": (
            {
                "id": row.incoming_operator_id,
                "name": row.incoming_operator.get_full_name() or row.incoming_operator.email,
                "email": row.incoming_operator.email,
            }
            if row.incoming_operator_id
            else None
        ),
        "open_incidents_summary": row.open_incidents_summary,
        "delayed_rides_summary": row.delayed_rides_summary,
        "drivers_attention_summary": row.drivers_attention_summary,
        "payment_system_concerns": row.payment_system_concerns,
        "pending_escalations": row.pending_escalations,
        "important_notes": row.important_notes,
        "follow_up_notes": row.follow_up_notes,
        "snapshot": row.snapshot or {},
        "submitted_at": row.submitted_at.isoformat() if row.submitted_at else None,
        "acknowledged_at": row.acknowledged_at.isoformat() if row.acknowledged_at else None,
        "created_at": row.created_at.isoformat(),
        "updated_at": row.updated_at.isoformat(),
    }


def list_handovers(*, status: str | None = None, limit: int = 20) -> list[dict]:
    qs = OpsShiftHandover.objects.select_related("outgoing_operator", "incoming_operator")
    if status:
        qs = qs.filter(status=status)
    return [serialize_handover(row) for row in qs[:limit]]


def create_handover(request, *, payload: dict, snapshot: dict | None = None) -> OpsShiftHandover:
    row = OpsShiftHandover.objects.create(
        outgoing_operator=request.user,
        city_id=payload.get("city_id"),
        status="submitted",
        open_incidents_summary=(payload.get("open_incidents_summary") or "")[:4000],
        delayed_rides_summary=(payload.get("delayed_rides_summary") or "")[:4000],
        drivers_attention_summary=(payload.get("drivers_attention_summary") or "")[:4000],
        payment_system_concerns=(payload.get("payment_system_concerns") or "")[:4000],
        pending_escalations=(payload.get("pending_escalations") or "")[:4000],
        important_notes=(payload.get("important_notes") or "")[:4000],
        snapshot=snapshot or {},
        submitted_at=timezone.now(),
    )
    log_from_request(
        request,
        action="admin_action",
        entity_type="ops_handover",
        entity_id=str(row.id),
        summary=f"Ops shift handover #{row.id} submitted",
        details={"event": "ops_handover_submit", "status": row.status},
    )
    return row


def acknowledge_handover(request, handover: OpsShiftHandover, *, follow_up_notes: str = "") -> OpsShiftHandover:
    if handover.status not in {"submitted", "acknowledged"}:
        raise ValueError("Only submitted handovers can be acknowledged.")
    handover.incoming_operator = request.user
    handover.status = "acknowledged"
    handover.acknowledged_at = timezone.now()
    if follow_up_notes:
        handover.follow_up_notes = follow_up_notes[:4000]
    handover.save(
        update_fields=[
            "incoming_operator",
            "status",
            "acknowledged_at",
            "follow_up_notes",
            "updated_at",
        ]
    )
    log_from_request(
        request,
        action="admin_action",
        entity_type="ops_handover",
        entity_id=str(handover.id),
        summary=f"Ops shift handover #{handover.id} acknowledged",
        details={"event": "ops_handover_acknowledge"},
    )
    return handover
