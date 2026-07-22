from rest_framework.permissions import BasePermission

from operations.executive_permissions import (
    can_ceo_actions,
    can_manage_finance,
    can_view_executive,
    user_in_groups,
)

PARTNER_ADMIN_GROUPS = {"Partner Admin", "Regional Director", "CEO", "Super Admin"}
PARTNER_FINANCE_GROUPS = {"Partner Finance", "Finance", "Accountant", "CEO", "Super Admin"}
PARTNER_OPS_GROUPS = {
    "Partner Operations",
    "Partner Admin",
    "Regional Director",
    "Operations Manager",
    "Supervisor",
    "CEO",
    "Super Admin",
}
REGIONAL_DIRECTOR_GROUPS = {"Regional Director", "CEO", "Super Admin"}


def can_manage_partners(user) -> bool:
    return user_in_groups(user, PARTNER_OPS_GROUPS) or can_view_executive(user)


def can_manage_partner_finance(user) -> bool:
    return user_in_groups(user, PARTNER_FINANCE_GROUPS) or can_manage_finance(user)


def can_view_partner_ceo(user) -> bool:
    return can_ceo_actions(user) or user_in_groups(user, REGIONAL_DIRECTOR_GROUPS)


def can_access_partner_portal(user) -> bool:
    if not user or not user.is_authenticated:
        return False
    profile = getattr(user, "partner_profile", None)
    return profile is not None and profile.is_operational


class IsPartnerPlatformStaff(BasePermission):
    def has_permission(self, request, view):
        return can_manage_partners(request.user)


class IsPartnerFinanceStaff(BasePermission):
    def has_permission(self, request, view):
        return can_manage_partner_finance(request.user)


class IsPartnerCeoStaff(BasePermission):
    def has_permission(self, request, view):
        return can_view_partner_ceo(request.user)


class IsPartnerPortalUser(BasePermission):
    message = "Approved partner account required."

    def has_permission(self, request, view):
        return can_access_partner_portal(request.user)
