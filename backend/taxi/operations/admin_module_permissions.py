"""Module-level backend authorization for admin APIs.

WHY THIS EXISTS
---------------
The admin shell hides navigation per role, but hiding is not authorization: a
staff member can call any admin endpoint directly with their Bearer token. A
prior audit (`.agents/tasks/role-authorization-matrix.txt`) showed that
`/auth/users/`, `/rides/admin/rides/`, `/payments/admin/withdrawals/`,
`/drivers/list/` and others answered **HTTP 200 for every staff role**, because
they were guarded by DRF's `IsAdminUser` — which only checks `user.is_staff`.

This module gives the backend the SAME module taxonomy the frontend already
uses (`MODULES_BY_ROLE` in `admin_permissions_service`), so a view can require a
module and the backend answer matches what the navigation implies.

Function-based views (the common case here)::

    from operations.admin_module_permissions import require_admin_module

    @api_view(["GET"])
    @permission_classes([require_admin_module("finance")])
    def admin_finance_overview(request):
        ...

Class-based views::

    class WithdrawalsView(APIView):
        permission_classes = [HasAdminModule]
        admin_module = "finance"          # or admin_modules = {"a", "b"} for ANY-of

Rules (mirrors `build_admin_permissions`):
  * anonymous  -> denied (the auth layer answers 401 first)
  * non-staff  -> denied
  * superuser  -> allowed (full CEO module set)
  * staff      -> allowed iff the module is in their role's module list

Everything fails CLOSED: an undeclared module denies.
"""

from __future__ import annotations

from rest_framework.permissions import BasePermission

from .admin_permissions_service import MODULES_BY_ROLE, resolve_admin_role

# A superuser is treated as the CEO role, exactly as build_admin_permissions does.
ALL_MODULES = frozenset(MODULES_BY_ROLE["ceo"])


def admin_modules_for(user) -> frozenset:
    """Module ids the user may access, mirroring the admin-shell payload."""
    if not user or not user.is_authenticated:
        return frozenset()
    if user.is_superuser:
        # The founder/CEO superuser (sakho@yala.mr on production, sakho@admin.mr
        # locally) is the ONLY ungrouped staff account on production. This branch
        # is why removing the "unclassified staff" fallback cannot lock it out:
        # a superuser never depends on a role group.
        return ALL_MODULES
    if not user.is_staff:
        return frozenset()
    role = resolve_admin_role(user)
    # An unclassified staff account (no recognised admin role group) gets exactly
    # the "staff" module set the admin shell already shows it - {home, ops,
    # status}. The previous "return ALL_MODULES" shim here was a compatibility
    # measure, not a security boundary, and it contradicted the UI.
    #
    # Removed safely: every staff account that must keep broad admin access has
    # an explicit role or is a superuser. On production the only ungrouped staff
    # account is the founder superuser (handled above); locally the only active
    # ungrouped staff account is the same superuser, and all 14 non-superuser
    # ungrouped accounts are inactive (they cannot authenticate - the login view
    # returns 403 for inactive accounts).
    #
    # Use `python manage.py assign_admin_roles` to classify any staff account
    # that needs more than the default set.
    return frozenset(MODULES_BY_ROLE.get(role, MODULES_BY_ROLE["staff"]))


def user_can_access_module(user, module: str) -> bool:
    return module in admin_modules_for(user)


def user_can_access_any_module(user, modules) -> bool:
    return bool(admin_modules_for(user) & set(modules))


class HasAdminModule(BasePermission):
    """Deny unless the user's admin role grants the view's declared module(s)."""

    def has_permission(self, request, view):
        modules = getattr(view, "admin_modules", None)
        if modules:
            return user_can_access_any_module(request.user, modules)
        module = getattr(view, "admin_module", None)
        if not module:
            # Fail closed: opting into this class requires declaring a module.
            return False
        return user_can_access_module(request.user, module)


def require_admin_module(*modules):
    """Permission-class factory for function-based views.

    Access is granted when the user has ANY of the given modules (logical OR).
    """
    if not modules:
        raise ValueError("require_admin_module() needs at least one module id")

    class _HasRequiredAdminModule(BasePermission):
        def has_permission(self, request, view):
            return user_can_access_any_module(request.user, modules)

    _HasRequiredAdminModule.__name__ = "HasAdminModule[{}]".format(",".join(modules))
    return _HasRequiredAdminModule
