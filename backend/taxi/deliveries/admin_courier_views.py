"""Courier management for Yala Delivery — admin surface (professional profile,
vehicle-type document verification, requirement-gated approvals, investigation).

Mirrors the Yala Driver management experience for couriers **without merging the
two modules**: couriers keep their own delivery endpoints, terminology and screens,
while reusing the same underlying driver profile/documents records.

All endpoints are read-only (`GET`) except none — approve/reject/suspend/reactivate
stay in the existing, already-audited approval endpoints
(`security.views.admin_courier_action`, `admin_approvals.views.courier_action`),
which now enforce the vehicle-type requirement gate, so approval logic has a single
source of truth.
"""

from __future__ import annotations

from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response

from legal.services import courier_has_complete_signature, serialize_courier_signature
from taxi.drivers.models import DriverDocument

from .admin_views import (
    _courier_deliveries_queryset,
    _courier_delivery_summary,
    _courier_online,
    _courier_queryset,
    _earnings_buckets,
    _serialize_admin_courier,
    _settings_for,
)
from .courier_onboarding import (
    DOCUMENT_LABELS,
    get_courier_approval_blockers,
    get_required_courier_document_types,
)
from .vehicle_types import get_delivery_vehicle_label, normalize_delivery_vehicle_type
from operations.admin_module_permissions import require_admin_module

DOCUMENT_STATES = ("missing", "pending_review", "approved", "rejected", "expired")


def _vehicle_type(profile, settings) -> str:
    return normalize_delivery_vehicle_type(
        getattr(settings, "delivery_vehicle_type", "") or ""
    )


def build_document_checklist(profile, vehicle_type: str) -> dict:
    """Vehicle-type-aware document checklist with the five admin states.

    A bicycle courier is never required to supply automobile documents; anything
    they uploaded beyond their own requirements is reported under ``not_required``
    (visible, never a blocker).
    """
    required_types = list(get_required_courier_document_types(vehicle_type))
    today = timezone.now().date()
    documents = {}
    for document in DriverDocument.objects.filter(driver=profile).order_by("-uploaded_at"):
        documents.setdefault(document.document_type, document)

    rows = []
    for doc_type in required_types:
        document = documents.get(doc_type)
        if document is None:
            account_doc = (
                getattr(profile.user, "national_id_document", None)
                if doc_type == "national_id"
                else None
            )
            rows.append(
                {
                    "document_type": doc_type,
                    "label": DOCUMENT_LABELS.get(doc_type, doc_type),
                    "required": True,
                    "state": "pending_review" if account_doc else "missing",
                    "document_id": None,
                    "source": "account" if account_doc else "",
                    "uploaded_at": None,
                    "expires_at": None,
                    "rejection_reason": "",
                }
            )
            continue

        if document.status == "rejected":
            state = "rejected"
        elif document.expires_at and document.expires_at < today:
            state = "expired"
        elif document.status == "approved":
            state = "approved"
        else:
            state = "pending_review"

        rows.append(
            {
                "document_type": doc_type,
                "label": DOCUMENT_LABELS.get(doc_type, doc_type),
                "required": True,
                "state": state,
                "document_id": document.id,
                "source": "upload",
                "uploaded_at": document.uploaded_at,
                "expires_at": document.expires_at,
                "rejection_reason": document.rejection_reason,
            }
        )

    not_required = []
    for doc_type, document in documents.items():
        if doc_type in required_types:
            continue
        not_required.append(
            {
                "document_type": doc_type,
                "label": DOCUMENT_LABELS.get(doc_type, doc_type),
                "state": (
                    "expired"
                    if (document.expires_at and document.expires_at < today)
                    else document.status
                ),
                "document_id": document.id,
                "uploaded_at": document.uploaded_at,
            }
        )

    return {
        "vehicle_type": vehicle_type,
        "vehicle_label": get_delivery_vehicle_label(vehicle_type),
        "required_document_types": required_types,
        "requirements": rows,
        "not_required": not_required,
        "states": {state: sum(1 for row in rows if row["state"] == state) for state in DOCUMENT_STATES},
    }


def _profile_payload(profile, request=None) -> dict:
    """Professional courier profile: identity, status, vehicle, docs, performance."""
    settings = _settings_for(profile)
    vehicle_type = _vehicle_type(profile, settings)
    checklist = build_document_checklist(profile, vehicle_type)
    base = _serialize_admin_courier(profile, settings)
    user = profile.user

    summary = _courier_delivery_summary(user) if callable(_courier_delivery_summary) else {}

    return {
        **base,
        # Identity
        "full_name": (user.get_full_name() or "").strip() or user.email,
        "email": user.email,
        "phone_number": getattr(profile, "phone_number", "") or getattr(user, "phone_number", ""),
        "phone_verified": bool(getattr(user, "is_phone_verified", False)),
        "courier_id": getattr(profile, "driver_code", "") or "",
        "profile_photo_available": bool(
            getattr(profile, "profile_photo", None) or getattr(user, "profile_photo", None)
        ),
        "registration_date": user.date_joined,
        # Status / availability
        "account_status": profile.status,
        "status_label": profile.get_status_display(),
        "is_online": _courier_online(profile, settings),
        "is_suspended": bool(getattr(settings, "is_suspended", False)),
        "suspension_reason": getattr(settings, "suspension_reason", "") or "",
        "delivery_mode_enabled": bool(getattr(settings, "delivery_mode_enabled", False)),
        "application_rejection_reason": profile.application_rejection_reason or "",
        # Vehicle
        "vehicle_type": vehicle_type,
        "vehicle_label": get_delivery_vehicle_label(vehicle_type),
        "vehicle_make": getattr(profile, "vehicle_make", "") or "",
        "vehicle_model": getattr(profile, "vehicle_model", "") or "",
        "vehicle_color": getattr(profile, "vehicle_color", "") or "",
        "vehicle_plate": getattr(profile, "vehicle_plate", "") or "",
        "vehicle_required": vehicle_type in {"motorcycle", "car"},
        # Documents & agreement
        "documents": checklist,
        "signature_complete": bool(courier_has_complete_signature(profile)),
        "legal_signature": (
            serialize_courier_signature(profile, request) if request is not None else None
        ),
        "approval_blockers": get_courier_approval_blockers(profile, vehicle_type),
        # Performance & earnings
        "deliveries": summary,
        "earnings": _earnings_buckets(user),
        "can_approve": not get_courier_approval_blockers(profile, vehicle_type)["blocked"],
    }


@api_view(["GET"])
@permission_classes([require_admin_module("delivery")])
def admin_courier_profile(request, driver_id):
    """Full professional courier profile (read-only)."""
    profile = get_object_or_404(_courier_queryset(), pk=driver_id)
    return Response(_profile_payload(profile, request))


@api_view(["GET"])
@permission_classes([require_admin_module("delivery")])
def admin_courier_requirements(request, driver_id):
    """Vehicle-type document requirements + approval verdict (read-only)."""
    profile = get_object_or_404(_courier_queryset(), pk=driver_id)
    settings = _settings_for(profile)
    vehicle_type = _vehicle_type(profile, settings)

    return Response(
        {
            "courier_id": profile.id,
            "vehicle_type": vehicle_type,
            "vehicle_label": get_delivery_vehicle_label(vehicle_type),
            "documents": build_document_checklist(profile, vehicle_type),
            "approval_blockers": get_courier_approval_blockers(profile, vehicle_type),
            "read_only": True,
        }
    )


@api_view(["GET"])
@permission_classes([require_admin_module("delivery")])
def admin_courier_requirements_audit(request):
    """Investigate couriers marked approved while requirements look incomplete.

    **Read-only by design**: this reports the discrepancy for human review and
    never suspends, rejects or otherwise mutates a historical account (§4: do not
    automatically suspend historical accounts).
    """
    rows = []
    for profile in _courier_queryset().select_related("user").order_by("-user__date_joined"):
        if profile.status != "approved":
            continue
        blockers = get_courier_approval_blockers(profile)
        if not blockers["blocked"]:
            continue
        rows.append(
            {
                "courier_id": profile.id,
                "email": profile.user.email,
                "full_name": (profile.user.get_full_name() or "").strip()
                or profile.user.email,
                "status": profile.status,
                "vehicle_type": blockers["vehicle_type"],
                "vehicle_label": blockers["vehicle_label"],
                "missing_document_types": blockers["missing_document_types"],
                "expired_document_types": blockers["expired_document_types"],
                "signature_complete": blockers["signature_complete"],
                "reasons": blockers["reasons"],
                "registration_date": profile.user.date_joined,
            }
        )

    return Response(
        {
            "count": len(rows),
            "results": rows,
            "policy": (
                "Report only. Historical approved accounts are never suspended "
                "automatically; an administrator reviews each case."
            ),
            "read_only": True,
        }
    )

