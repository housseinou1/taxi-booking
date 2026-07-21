"""Role-based access for the executive operations dashboard."""

from rest_framework.permissions import BasePermission

EXECUTIVE_GROUPS = {
    "CEO",
    "Super Admin",
    "Accountant",
    "Finance",
    "Operations Manager",
}

FINANCE_GROUPS = {"CEO", "Super Admin", "Accountant", "Finance"}
OPS_GROUPS = {"CEO", "Super Admin", "Operations Manager"}
CEO_ONLY_GROUPS = {"CEO", "Super Admin"}


def user_in_groups(user, group_names: set[str]) -> bool:
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    if not user.is_staff:
        return False
    return user.groups.filter(name__in=group_names).exists()


def can_view_executive(user) -> bool:
    if user.is_superuser or user.is_staff:
        return True
    return user.groups.filter(name__in=EXECUTIVE_GROUPS).exists()


def can_manage_finance(user) -> bool:
    return user_in_groups(user, FINANCE_GROUPS)


def can_manage_operations(user) -> bool:
    return user_in_groups(user, OPS_GROUPS | FINANCE_GROUPS)


def can_ceo_actions(user) -> bool:
    return user_in_groups(user, CEO_ONLY_GROUPS)


class IsExecutiveStaff(BasePermission):
    def has_permission(self, request, view):
        return can_view_executive(request.user)
