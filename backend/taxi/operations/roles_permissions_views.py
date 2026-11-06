"""Phase 10 — Roles & permissions management (CEO-governed, audited).

Read + tightly guarded write surface for administrative accountability:

- ``GET  /operations/admin/roles/``                 role registry: labels, groups,
  modules, home route, approval limits, member counts, and the permission
  catalogue actually in use across staff accounts.
- ``GET  /operations/admin/roles/accounts/``        staff accounts with their role,
  groups, strong-auth status and protection flags.
- ``POST /operations/admin/roles/accounts/<id>/role/``    assign an admin role.
- ``POST /operations/admin/roles/accounts/<id>/access/``  grant/revoke staff access.

GUARANTEES (enforced in code, asserted by tests):
- The Founder/CEO (and every CEO-tier/superuser account) is **protected**: it
  cannot be demoted, deactivated, or have its role changed by any administrator
  (see ``operations.ceo_protection``).
- **No privilege escalation:** the CEO / Super Admin role cannot be granted
  through this API at all, so no subordinate can mint a peer or replace the CEO.
- Every mutation requires a reason and writes an audit row with the previous and
  new state (actor, target, IP).
- No financial data or state is touched anywhere in this module.
"""

from __future__ import annotations

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from security.models import AuditLog
from security.services.audit_service import log_from_request

from .admin_permissions_service import (
    APPROVAL_LIMITS_BY_ROLE,
    HOME_ROUTES,
    MODULES_BY_ROLE,
    ROLE_LABELS,
    ROLE_PRIORITY,
    build_admin_permissions,
    resolve_all_roles,
)
from .ceo_protection import (
    PROTECTED_CEO_GROUPS,
    is_protected_account,
    protection_refusal,
    protection_summary,
)
from .executive_permissions import IsCeoStaff

User = get_user_model()

# Roles an administrator may assign. CEO / Super Admin are deliberately excluded
# so the Founder/CEO authority cannot be created or replaced through this API.
ASSIGNABLE_ROLES = [role for role, _groups in ROLE_PRIORITY if role != "ceo"]

# Every group managed by the roles API (used when replacing a role membership).
MANAGED_ADMIN_GROUPS = sorted({group for _role, groups in ROLE_PRIORITY for group in groups})


def _role_groups(role: str) -> list[str]:
    for candidate, groups in ROLE_PRIORITY:
        if candidate == role:
            return sorted(groups)
    return []


def _role_for_groups(group_names) -> str:
    """Resolve a display role from group membership (mirrors the shell logic)."""
    names = set(group_names)
    for role, groups in ROLE_PRIORITY:
        if names & set(groups):
            return role
    return "staff"


# ─── Role registry (read-only) ───────────────────────────────────────────────


def _staff_users():
    return User.objects.filter(is_staff=True).prefetch_related("groups")


def _permission_catalogue():
    """Union of the action keys the platform actually publishes, per role.

    Computed from the real permission builder over existing staff accounts (plus
    the CEO tier), so the catalogue can never drift from the runtime payload.
    """
    keys: dict[str, set[str]] = {}
    users = list(_staff_users()[:200])
    for user in users:
        try:
            actions = build_admin_permissions(user).get("actions", {})
        except Exception:  # pragma: no cover - defensive: never break the registry
            continue
        role = resolve_all_roles(user)[0] if resolve_all_roles(user) else "staff"
        keys.setdefault(role, set()).update(actions.keys())
    return {role: sorted(values) for role, values in sorted(keys.items())}


@api_view(["GET"])
@permission_classes([IsCeoStaff])
def admin_roles_registry(request):
    """Read-only registry of roles, their modules, limits and member counts."""
    staff = list(_staff_users())
    members: dict[str, int] = {}
    for user in staff:
        roles = resolve_all_roles(user)
        role = roles[0] if roles else "staff"
        members[role] = members.get(role, 0) + 1

    roles = []
    for role, groups in ROLE_PRIORITY:
        roles.append(
            {
                "role": role,
                "label": ROLE_LABELS.get(role, role),
                "groups": sorted(groups),
                "modules": MODULES_BY_ROLE.get(role, []),
                "home_route": HOME_ROUTES.get(role, ""),
                "approval_limits": APPROVAL_LIMITS_BY_ROLE.get(role, {}),
                "members": members.get(role, 0),
                "assignable": role in ASSIGNABLE_ROLES,
                "protected": bool(set(groups) & PROTECTED_CEO_GROUPS),
            }
        )

    roles.append(
        {
            "role": "staff",
            "label": ROLE_LABELS.get("staff", "Staff"),
            "groups": [],
            "modules": MODULES_BY_ROLE.get("staff", []),
            "home_route": HOME_ROUTES.get("staff", ""),
            "approval_limits": APPROVAL_LIMITS_BY_ROLE.get("staff", {}),
            "members": members.get("staff", 0),
            "assignable": False,
            "protected": False,
        }
    )

    return Response(
        {
            "roles": roles,
            "assignable_roles": ASSIGNABLE_ROLES,
            "managed_groups": MANAGED_ADMIN_GROUPS,
            "permission_catalogue": _permission_catalogue(),
            "total_staff_accounts": len(staff),
            "protection": protection_summary(),
            "read_only": True,
        }
    )


# ─── Staff accounts (read-only) ──────────────────────────────────────────────


def _serialize_staff_account(user) -> dict:
    groups = sorted(user.groups.values_list("name", flat=True))
    totp = getattr(user, "admin_totp", None)
    return {
        "id": user.id,
        "email": user.email,
        "name": user.get_full_name() or user.email,
        "is_active": user.is_active,
        "is_staff": user.is_staff,
        "is_superuser": user.is_superuser,
        "groups": groups,
        "role": _role_for_groups(groups),
        "role_label": ROLE_LABELS.get(_role_for_groups(groups), _role_for_groups(groups)),
        "modules": MODULES_BY_ROLE.get(_role_for_groups(groups), []),
        "totp_confirmed": bool(totp and totp.is_confirmed),
        "date_joined": user.date_joined,
        "last_login": user.last_login,
        "protected": is_protected_account(user),
        "protection_reason": (
            "Founder/CEO authority — protected from modification."
            if is_protected_account(user)
            else ""
        ),
    }


@api_view(["GET"])
@permission_classes([IsCeoStaff])
def admin_role_accounts(request):
    """Read-only list of administrative accounts with their governance state."""
    queryset = _staff_users().order_by("-is_superuser", "email")

    search = (request.query_params.get("search") or "").strip()
    if search:
        queryset = queryset.filter(
            Q(email__icontains=search)
            | Q(first_name__icontains=search)
            | Q(last_name__icontains=search)
        )

    role_filter = (request.query_params.get("role") or "").strip()
    if role_filter:
        groups = _role_groups(role_filter)
        queryset = queryset.filter(groups__name__in=groups).distinct() if groups else queryset

    accounts = [_serialize_staff_account(user) for user in queryset[:200]]
    return Response(
        {
            "count": len(accounts),
            "results": accounts,
            "summary": {
                "staff": User.objects.filter(is_staff=True).count(),
                "superusers": User.objects.filter(is_superuser=True).count(),
                "protected": sum(1 for row in accounts if row["protected"]),
                "without_totp": sum(1 for row in accounts if not row["totp_confirmed"]),
            },
            "protection": protection_summary(),
        }
    )



# ─── Guarded mutations (role assignment / staff access) ──────────────────────


def _audit_role_change(request, target, summary, details):
    log_from_request(
        request,
        action="admin_action",
        entity_type="system",
        entity_id=f"user:{target.id}",
        summary=summary,
        details=details,
    )


@api_view(["POST"])
@permission_classes([IsCeoStaff])
def admin_role_assign(request, user_id):
    """Assign an administrative role to a staff account. Reason mandatory.

    Refuses to touch protected accounts (Founder/CEO, CEO-tier, superusers, self)
    and refuses to grant the CEO/Super Admin role at all — so no administrator can
    demote the owner or promote themselves into the owner's authority.
    """
    target = get_object_or_404(User, pk=user_id)
    role = (request.data.get("role") or "").strip().lower()
    reason = (request.data.get("reason") or "").strip()

    refusal = protection_refusal(target, request.user)
    if refusal:
        return Response({"error": refusal}, status=status.HTTP_403_FORBIDDEN)

    if not target.is_staff:
        return Response(
            {"error": "Target account is not an administrative account."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if len(reason) < 5:
        return Response(
            {"error": "A reason is required (min 5 characters)."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if role in {"ceo", "super_admin"} or role == "ceo":
        return Response(
            {
                "error": "CEO / Super Admin authority cannot be granted through this API.",
                "assignable_roles": ASSIGNABLE_ROLES,
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    if role not in ASSIGNABLE_ROLES:
        return Response(
            {"error": "Invalid role.", "assignable_roles": ASSIGNABLE_ROLES},
            status=status.HTTP_400_BAD_REQUEST,
        )

    previous_groups = sorted(target.groups.values_list("name", flat=True))
    previous_role = _role_for_groups(previous_groups)
    new_groups = _role_groups(role)

    # Replace only the managed admin groups; unrelated groups are preserved.
    target.groups.remove(*Group.objects.filter(name__in=MANAGED_ADMIN_GROUPS))
    # The role's groups are created on demand — assigning a role must work even
    # when its group row has never been provisioned (otherwise the role would be
    # applied silently and the account would end up with no permissions).
    for group_name in new_groups:
        group, _created = Group.objects.get_or_create(name=group_name)
        target.groups.add(group)

    _audit_role_change(
        request,
        target,
        f"Admin role changed for {target.email}: {previous_role} -> {role}",
        {
            "operation": "role_assign",
            "reason": reason,
            "target_email": target.email,
            "previous_role": previous_role,
            "new_role": role,
            "previous_groups": previous_groups,
            "new_groups": new_groups,
            "source": "roles_api",
        },
    )

    return Response(
        {
            "message": f"Role updated to {ROLE_LABELS.get(role, role)}.",
            "user_id": target.id,
            "previous_role": previous_role,
            "role": role,
            "role_label": ROLE_LABELS.get(role, role),
            "groups": sorted(target.groups.values_list("name", flat=True)),
        }
    )


@api_view(["POST"])
@permission_classes([IsCeoStaff])
def admin_staff_access(request, user_id):
    """Grant or revoke administrative access (``is_staff``). Reason mandatory.

    Revocation is reversible and never deletes the account. Protected accounts
    (Founder/CEO, CEO-tier, superusers) and the acting account are refused.
    """
    target = get_object_or_404(User, pk=user_id)
    enabled_raw = request.data.get("enabled", None)
    reason = (request.data.get("reason") or "").strip()

    refusal = protection_refusal(target, request.user)
    if refusal:
        return Response({"error": refusal}, status=status.HTTP_403_FORBIDDEN)

    if enabled_raw is None:
        return Response(
            {"error": "`enabled` (true/false) is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if len(reason) < 5:
        return Response(
            {"error": "A reason is required (min 5 characters)."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    enabled = str(enabled_raw).strip().lower() in {"true", "1", "yes", "on"}
    previous_state = target.is_staff
    if previous_state == enabled:
        return Response(
            {
                "error": "Administrative access is already in the requested state.",
                "is_staff": previous_state,
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    target.is_staff = enabled
    target.save(update_fields=["is_staff"])

    _audit_role_change(
        request,
        target,
        f"Admin access {'granted' if enabled else 'revoked'} for {target.email}",
        {
            "operation": "staff_access",
            "reason": reason,
            "target_email": target.email,
            "previous_state": previous_state,
            "new_state": enabled,
            "source": "roles_api",
        },
    )

    return Response(
        {
            "message": f"Administrative access {'granted' if enabled else 'revoked'}.",
            "user_id": target.id,
            "is_staff": enabled,
        }
    )

