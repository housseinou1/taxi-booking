"""Staff city assignment API (Task 8). CEO / Super Admin / superuser only, fully audited.

GET  /operations/city-assignments/                 list (filters: user_id, city_id, role, include_inactive)
POST /operations/city-assignments/                 create {user_id, city_id, role, notes?}
POST /operations/city-assignments/<id>/revoke/     revoke {reason}  (soft: never deletes)
GET  /operations/city-assignments/me/              the caller's own scope (any authenticated staff)

Creating assignments grants nothing by itself while city scoping is disabled; the assignments
become effective only when DELIVERY_CITY_SCOPING is switched to "enforce".
"""

from __future__ import annotations

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response

from security.services.audit_service import log_from_request

from .city_assignment_models import StaffCityAssignment
from .executive_permissions import IsCeoStaff
from .multi_city_permissions import has_national_access

User = get_user_model()
ROLE_VALUES = [value for value, _label in StaffCityAssignment.ROLE_CHOICES]
ROLE_LABELS = dict(StaffCityAssignment.ROLE_CHOICES)


def _error(detail, code, http=status.HTTP_400_BAD_REQUEST, **extra):
    return Response({"detail": detail, "code": code, **extra}, status=http)


def _int(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def serialize_assignment(a: StaffCityAssignment) -> dict:
    return {
        "id": a.id,
        "user_id": a.user_id,
        "user_name": a.user.get_full_name() or a.user.email,
        "user_email": a.user.email,
        "city_id": a.city_id,
        "city_name": a.city.name,
        "role": a.role,
        "role_label": ROLE_LABELS.get(a.role, a.role),
        "is_active": a.is_active,
        "notes": a.notes,
        "assigned_by_id": a.assigned_by_id,
        "assigned_at": a.assigned_at,
        "revoked_by_id": a.revoked_by_id,
        "revoked_at": a.revoked_at,
        "revoke_reason": a.revoke_reason,
    }


def _queryset():
    return StaffCityAssignment.objects.select_related("user", "city")


@api_view(["GET", "POST"])
@permission_classes([IsCeoStaff])
def city_assignments(request):
    if request.method == "GET":
        qs = _queryset()
        for param, lookup in (("user_id", "user_id"), ("city_id", "city_id")):
            raw = request.query_params.get(param)
            if raw:
                value = _int(raw)
                if value is None:
                    return _error(f"{param} must be an integer id.", "invalid_parameter")
                qs = qs.filter(**{lookup: value})
        role = request.query_params.get("role")
        if role:
            if role not in ROLE_VALUES:
                return _error("Invalid role.", "invalid_role", valid_roles=ROLE_VALUES)
            qs = qs.filter(role=role)
        if str(request.query_params.get("include_inactive", "")).lower() not in {"1", "true", "yes"}:
            qs = qs.filter(is_active=True)
        return Response({"results": [serialize_assignment(a) for a in qs], "roles": StaffCityAssignment.ROLE_CHOICES})

    from locations.models import City as LocationCity

    data = request.data or {}
    user_id, city_id, role = _int(data.get("user_id")), _int(data.get("city_id")), data.get("role")
    if user_id is None or city_id is None:
        return _error("user_id and city_id are required integer ids.", "invalid_parameter")
    if role not in ROLE_VALUES:
        return _error("Invalid role.", "invalid_role", valid_roles=ROLE_VALUES)
    user = User.objects.filter(id=user_id).first()
    if user is None:
        return _error("User not found.", "user_not_found", status.HTTP_404_NOT_FOUND)
    if not user.is_staff or not user.is_active:
        return _error("Only active staff accounts can receive a city assignment.", "not_active_staff")
    if has_national_access(user):
        return _error("This account already has national access; a city assignment is not applicable.",
                      "national_access_user")
    required = StaffCityAssignment.ROLE_REQUIRED_GROUPS[role]
    if not user.groups.filter(name__in=required).exists():
        return _error("The user is not in a staff group that matches this role.", "role_group_mismatch",
                      required_groups=sorted(required))
    city = LocationCity.objects.filter(id=city_id).first()
    if city is None:
        return _error("City not found.", "city_not_found", status.HTTP_404_NOT_FOUND)

    try:
        with transaction.atomic():
            assignment = StaffCityAssignment.objects.create(
                user=user, city=city, role=role, notes=str(data.get("notes") or "")[:1000],
                assigned_by=request.user,
            )
    except IntegrityError:
        return _error("This user already holds this role in this city.", "duplicate_assignment",
                      status.HTTP_409_CONFLICT)
    log_from_request(
        request,
        action="admin_action",
        entity_type="system",
        entity_id=f"city_assignment:{assignment.id}",
        summary=f"Assigned user {user.id} as {role} in city {city.id}",
        details={"assignment_id": assignment.id, "user_id": user.id, "city_id": city.id, "role": role},
    )
    return Response(serialize_assignment(assignment), status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([IsCeoStaff])
def revoke_city_assignment(request, assignment_id):
    reason = str((request.data or {}).get("reason") or "").strip()
    if len(reason) < 5:
        return _error("A revoke reason of at least 5 characters is required.", "reason_required")
    with transaction.atomic():
        assignment = _queryset().select_for_update().filter(id=assignment_id).first()
        if assignment is None:
            return _error("Assignment not found.", "assignment_not_found", status.HTTP_404_NOT_FOUND)
        if not assignment.is_active:
            return _error("Assignment is already revoked.", "already_revoked", status.HTTP_409_CONFLICT)
        assignment.is_active = False
        assignment.revoked_by = request.user
        assignment.revoked_at = timezone.now()
        assignment.revoke_reason = reason[:1000]
        assignment.save(update_fields=["is_active", "revoked_by", "revoked_at", "revoke_reason"])
    log_from_request(
        request,
        action="admin_action",
        entity_type="system",
        entity_id=f"city_assignment:{assignment.id}",
        summary=f"Revoked city assignment {assignment.id}",
        details={"assignment_id": assignment.id, "user_id": assignment.user_id, "city_id": assignment.city_id,
                 "role": assignment.role, "reason": reason[:1000]},
    )
    return Response(serialize_assignment(assignment))


@api_view(["GET"])
@permission_classes([IsAdminUser])
def my_city_scope(request):
    """The caller's own city scope, for UI labelling. Read-only, any staff user."""
    from deliveries.city_scope import get_delivery_scope, scoping_mode

    scope = get_delivery_scope(request.user)
    return Response({
        "scoping_mode": scoping_mode(),
        "national": scope.national,
        "city_ids": sorted(scope.city_ids),
        "roles": sorted(scope.roles),
        "assignments": [
            serialize_assignment(a)
            for a in _queryset().filter(user=request.user, is_active=True)
        ],
    })
