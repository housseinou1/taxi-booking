"""Phase 36 — Compliance & Governance Center aggregation service.

Combines existing regulatory data (driver documents, merchant records,
vehicle reminders) with governance models (audits, policies, risks, calendar)
to produce a single compliance and governance dashboard.
"""

from __future__ import annotations

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db.models import Count, Q
from django.utils import timezone

from merchants.models import Merchant
from taxi.drivers.models import DriverDocument, DriverProfile

from .models import (
    ComplianceAudit,
    ComplianceCalendarEvent,
    ComplianceRisk,
    PolicyAcknowledgement,
    PolicyDocument,
    VehicleMaintenanceReminder,
)

User = get_user_model()


def _days_out(days: int):
    return timezone.localdate() + timedelta(days=days)


def _calendar_display_status(event: ComplianceCalendarEvent, today=None) -> str:
    """Derive due_soon/overdue from due_date without mutating stored status."""
    if event.status == "completed":
        return "completed"
    today = today or timezone.localdate()
    if not event.due_date:
        return event.status
    if event.due_date < today:
        return "overdue"
    if event.due_date <= today + timedelta(days=14):
        return "due_soon"
    return event.status if event.status != "overdue" else "upcoming"


def build_compliance_dashboard() -> dict:
    today = timezone.localdate()
    soon = _days_out(30)

    expiring_docs = DriverDocument.objects.filter(
        expires_at__isnull=False, expires_at__lte=soon
    ).exclude(status="rejected")
    rejected_docs = DriverDocument.objects.filter(status="rejected").count()

    merchants = Merchant.objects.all()
    merchant_pending = merchants.filter(status="pending").count()
    merchant_rejected = merchants.filter(status="rejected").count()
    merchant_incomplete_terms = merchants.filter(terms_accepted=False).count()

    partner_pending = 0
    partner_suspended = 0
    partner_pending_contract = 0
    try:
        from partners.models import Partner

        partner_pending = Partner.objects.filter(contract_status="pending").count()
        partner_suspended = Partner.objects.filter(contract_status="suspended").count()
        partner_pending_contract = partner_pending
    except Exception:
        pass

    vehicle_maintenance_due = VehicleMaintenanceReminder.objects.filter(
        status__in=["upcoming", "due"]
    ).count()

    open_issues = ComplianceRisk.objects.filter(status__in=["open", "mitigated"]).count()
    overdue_audits = ComplianceAudit.objects.filter(
        status__in=["planned", "in_progress", "pending_findings"], due_date__lt=today
    ).count()
    upcoming_events = ComplianceCalendarEvent.objects.filter(
        due_date__gte=today, due_date__lte=soon, status__in=["upcoming", "due_soon"]
    ).count()

    policies = PolicyDocument.objects.all()
    policies_needing_review = policies.filter(review_date__lte=soon, status__in=["approved", "review_pending"]).count()
    ack_required = policies.filter(acknowledgement_required=True)
    outstanding_ack = 0
    if ack_required.exists():
        ack_ids = set(ack_required.values_list("id", flat=True))
        total_users = User.objects.filter(is_active=True).count()
        acked = PolicyAcknowledgement.objects.filter(policy_id__in=ack_ids).values("user").distinct().count()
        outstanding_ack = max(0, total_users - acked)

    total_checks = 9
    passed = sum(
        [
            expiring_docs.count() == 0,
            rejected_docs == 0,
            merchant_pending == 0,
            merchant_rejected == 0,
            partner_pending == 0,
            partner_suspended == 0,
            open_issues == 0,
            overdue_audits == 0,
            policies_needing_review == 0,
        ]
    )
    score = round(passed / total_checks * 100, 1)

    return {
        "generated_at": timezone.now().isoformat(),
        "overall_compliance_score": score,
        "open_compliance_issues": open_issues + overdue_audits + rejected_docs,
        "expiring_licenses": expiring_docs.filter(document_type="license").count(),
        "expiring_insurance": expiring_docs.filter(document_type="insurance").count(),
        "expiring_driver_documents": expiring_docs.count(),
        "merchant_compliance": {
            "pending_approval": merchant_pending,
            "rejected": merchant_rejected,
            "incomplete_terms": merchant_incomplete_terms,
        },
        "partner_compliance": {
            "pending_contract": partner_pending_contract,
            "suspended": partner_suspended,
        },
        "vehicle_maintenance_due": vehicle_maintenance_due,
        "outstanding_policy_acknowledgements": outstanding_ack,
        "policies_needing_review": policies_needing_review,
        "upcoming_compliance_deadlines": upcoming_events,
    }


def build_audit_center(*, limit: int = 100) -> dict:
    audits = (
        ComplianceAudit.objects.select_related("owner")
        .order_by("-created_at")[:limit]
    )
    by_status = {}
    for status, _ in ComplianceAudit.STATUS_CHOICES:
        by_status[status] = ComplianceAudit.objects.filter(status=status).count()
    by_type = {}
    for atype, _ in ComplianceAudit.AUDIT_TYPE_CHOICES:
        by_type[atype] = ComplianceAudit.objects.filter(audit_type=atype).count()

    return {
        "generated_at": timezone.now().isoformat(),
        "summary": {"by_status": by_status, "by_type": by_type, "total": ComplianceAudit.objects.count()},
        "audits": [
            {
                "id": a.id,
                "reference": a.reference,
                "audit_type": a.audit_type,
                "title": a.title,
                "status": a.status,
                "owner": a.owner.get_full_name() if a.owner else "",
                "due_date": a.due_date.isoformat() if a.due_date else None,
                "findings": a.findings or [],
                "corrective_actions": a.corrective_actions or [],
                "findings_count": len(a.findings or []),
                "corrective_actions_count": len(a.corrective_actions or []),
                "evidence_url": a.evidence_file.url if a.evidence_file else None,
                "started_at": a.started_at.isoformat() if a.started_at else None,
                "completed_at": a.completed_at.isoformat() if a.completed_at else None,
            }
            for a in audits
        ],
    }


def build_policy_management() -> dict:
    policies = PolicyDocument.objects.all().order_by("category", "-review_date")
    today = timezone.localdate()
    soon = _days_out(30)

    by_category = {}
    for category, _ in PolicyDocument.CATEGORY_CHOICES:
        by_category[category] = policies.filter(category=category).count()

    recent_reviews = policies.filter(review_date__lte=soon)

    ack_required_ids = set(
        policies.filter(acknowledgement_required=True).values_list("id", flat=True)
    )
    ack_counts = {}
    if ack_required_ids:
        ack_counts = {
            pid: PolicyAcknowledgement.objects.filter(policy_id=pid).values("user").distinct().count()
            for pid in ack_required_ids
        }

    return {
        "generated_at": timezone.now().isoformat(),
        "summary": {
            "total": policies.count(),
            "by_category": by_category,
            "requiring_review_soon": recent_reviews.count(),
            "expired": policies.filter(status="expired").count(),
        },
        "policies": [
            {
                "id": p.id,
                "category": p.category,
                "title": p.title,
                "version": p.version,
                "status": p.status,
                "approval_date": p.approval_date.isoformat() if p.approval_date else None,
                "review_date": p.review_date.isoformat() if p.review_date else None,
                "acknowledgement_required": p.acknowledgement_required,
                "acknowledgement_count": ack_counts.get(p.id, 0),
                "content_url": p.content_url,
                "file_url": p.file.url if p.file else None,
            }
            for p in policies
        ],
    }


def build_risk_register(*, limit: int = 200) -> dict:
    risks = ComplianceRisk.objects.select_related("owner").order_by("-review_date", "-created_at")[:limit]
    by_category = {}
    for cat, _ in ComplianceRisk.CATEGORY_CHOICES:
        by_category[cat] = ComplianceRisk.objects.filter(category=cat).count()
    by_status = {}
    for status, _ in ComplianceRisk.STATUS_CHOICES:
        by_status[status] = ComplianceRisk.objects.filter(status=status).count()

    def _score_map(risk) -> int:
        mapping = {"low": 1, "medium": 2, "high": 3, "critical": 4}
        return mapping.get(risk.likelihood, 1) * mapping.get(risk.impact, 1)

    critical_open = [
        r for r in ComplianceRisk.objects.filter(status="open") if _score_map(r) >= 9
    ]

    return {
        "generated_at": timezone.now().isoformat(),
        "summary": {
            "total": ComplianceRisk.objects.count(),
            "by_category": by_category,
            "by_status": by_status,
            "critical_open": len(critical_open),
        },
        "risks": [
            {
                "id": r.id,
                "reference": r.reference,
                "category": r.category,
                "title": r.title,
                "description": r.description,
                "likelihood": r.likelihood,
                "impact": r.impact,
                "score": _score_map(r),
                "mitigation": r.mitigation,
                "owner": r.owner.get_full_name() if r.owner else "",
                "review_date": r.review_date.isoformat() if r.review_date else None,
                "status": r.status,
            }
            for r in risks
        ],
    }


def build_compliance_calendar(*, days: int = 90, limit: int = 100) -> dict:
    today = timezone.localdate()
    end = today + timedelta(days=days)
    events = (
        ComplianceCalendarEvent.objects.select_related("owner")
        .filter(due_date__lte=end)
        .order_by("due_date")[:limit]
    )

    by_status = {}
    for status, _ in ComplianceCalendarEvent.STATUS_CHOICES:
        by_status[status] = ComplianceCalendarEvent.objects.filter(status=status).count()

    return {
        "generated_at": timezone.now().isoformat(),
        "range": {"start": today.isoformat(), "end": end.isoformat()},
        "summary": by_status,
        "events": [
            {
                "id": e.id,
                "title": e.title,
                "event_type": e.event_type,
                "due_date": e.due_date.isoformat() if e.due_date else None,
                "status": _calendar_display_status(e, today),
                "stored_status": e.status,
                "owner": e.owner.get_full_name() if e.owner else "",
                "notes": e.notes,
                "related_entity_type": e.related_entity_type,
                "related_entity_id": e.related_entity_id,
            }
            for e in events
        ],
    }


def build_ceo_governance_dashboard() -> dict:
    compliance = build_compliance_dashboard()
    audits = build_audit_center(limit=20)
    risks = build_risk_register(limit=50)
    policies = build_policy_management()
    calendar = build_compliance_calendar(days=60, limit=30)

    # outstanding approvals (operational items requiring CEO/compliance attention)
    pending_merchants = Merchant.objects.filter(status="pending").count()
    pending_drivers = DriverProfile.objects.filter(status="pending").count()
    pending_partners = 0
    try:
        from partners.models import Partner

        pending_partners = Partner.objects.filter(contract_status="pending").count()
    except Exception:
        pass

    # legal action items derived from policy reviews and overdue audits
    legal_items = []
    if policies["summary"]["requiring_review_soon"] > 0:
        legal_items.append(f"{policies['summary']['requiring_review_soon']} policies require review")
    overdue_audits = ComplianceAudit.objects.filter(
        status__in=["planned", "in_progress", "pending_findings"],
        due_date__lt=timezone.localdate(),
    ).count()
    if overdue_audits > 0:
        legal_items.append(f"{overdue_audits} audits are overdue")

    return {
        "generated_at": timezone.now().isoformat(),
        "compliance_score": compliance["overall_compliance_score"],
        "critical_risks": risks["summary"]["critical_open"],
        "audit_progress": {
            "total": audits["summary"]["total"],
            "by_status": audits["summary"]["by_status"],
        },
        "outstanding_approvals": {
            "pending_merchants": pending_merchants,
            "pending_drivers": pending_drivers,
            "pending_partners": pending_partners,
            "outstanding_policy_acknowledgements": compliance["outstanding_policy_acknowledgements"],
        },
        "policy_review_status": policies["summary"],
        "legal_action_items": legal_items,
        "upcoming_deadlines": calendar["events"][:10],
    }


def build_compliance_governance_suite() -> dict:
    return {
        "generated_at": timezone.now().isoformat(),
        "compliance_dashboard": build_compliance_dashboard(),
        "audit_center": build_audit_center(),
        "policy_management": build_policy_management(),
        "risk_register": build_risk_register(),
        "compliance_calendar": build_compliance_calendar(),
        "ceo_governance_dashboard": build_ceo_governance_dashboard(),
    }
