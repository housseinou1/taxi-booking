"""Role-based access for the executive operations dashboard."""

from rest_framework.permissions import BasePermission

EXECUTIVE_GROUPS = {
    "CEO",
    "Super Admin",
    "Accountant",
    "Finance",
    "Operations Manager",
    "Supervisor",
}

FINANCE_GROUPS = {"CEO", "Super Admin", "Accountant", "Finance"}
OPS_GROUPS = {"CEO", "Super Admin", "Operations Manager", "Supervisor"}
CEO_ONLY_GROUPS = {"CEO", "Super Admin"}
BOARD_GROUPS = {"CEO", "Super Admin", "Board"}
COMPLIANCE_GROUPS = {"CEO", "Super Admin", "Compliance", "Compliance Manager"}
ANALYTICS_GROUPS = {
    "CEO",
    "Super Admin",
    "Finance",
    "Accountant",
    "Operations Manager",
    "Supervisor",
    "Analytics",
    "Data Analyst",
}
GATEWAY_ADMIN_GROUPS = {"CEO", "Super Admin", "Platform Admin", "Developer Relations"}
ACADEMY_ADMIN_GROUPS = {
    "CEO",
    "Super Admin",
    "HR",
    "Training Manager",
    "Operations",
    "Support",
}
ACADEMY_REPORT_GROUPS = ACADEMY_ADMIN_GROUPS | {"Finance", "Operations Manager", "Supervisor"}
FLEET_GROUPS = {"CEO", "Super Admin", "Operations Manager", "Supervisor"}


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


def can_view_board_reports(user) -> bool:
    return user_in_groups(user, BOARD_GROUPS)


def can_view_compliance_governance(user) -> bool:
    return user_in_groups(user, COMPLIANCE_GROUPS)


def can_view_analytics(user) -> bool:
    return user_in_groups(user, ANALYTICS_GROUPS)


def can_manage_api_gateway(user) -> bool:
    return user_in_groups(user, GATEWAY_ADMIN_GROUPS)


def can_view_gateway_ceo_dashboard(user) -> bool:
    return can_ceo_actions(user)


def can_manage_academy(user) -> bool:
    return user_in_groups(user, ACADEMY_ADMIN_GROUPS)


def can_view_academy_reports(user) -> bool:
    return user_in_groups(user, ACADEMY_REPORT_GROUPS)


OPS_DISPATCH_GROUPS = {"CEO", "Super Admin", "Operations Manager", "Supervisor"}


def can_dispatch_operations(user) -> bool:
    return user_in_groups(user, OPS_DISPATCH_GROUPS)


def can_view_fleet(user) -> bool:
    if user.is_superuser:
        return True
    return user_in_groups(user, FLEET_GROUPS)


def can_manage_fleet(user) -> bool:
    return user_in_groups(user, FLEET_GROUPS)


class IsFleetStaff(BasePermission):
    def has_permission(self, request, view):
        return can_view_fleet(request.user) or can_view_executive(request.user)


class IsOperationsDispatcher(BasePermission):
    def has_permission(self, request, view):
        return can_dispatch_operations(request.user)


class IsExecutiveStaff(BasePermission):
    def has_permission(self, request, view):
        return can_view_executive(request.user)


class IsFinanceStaff(BasePermission):
    def has_permission(self, request, view):
        return can_manage_finance(request.user) or can_view_executive(request.user)


class IsLaunchCommandStaff(BasePermission):
    def has_permission(self, request, view):
        return can_view_executive(request.user) or can_dispatch_operations(request.user)


class IsCeoStaff(BasePermission):
    def has_permission(self, request, view):
        return can_ceo_actions(request.user)


class IsBoardOrCeoStaff(IsCeoStaff):
    """CEO, Super Admin, and Board groups."""

    def has_permission(self, request, view):
        if super().has_permission(request, view):
            return True
        return can_view_board_reports(request.user)


class IsComplianceOrCeoStaff(IsCeoStaff):
    """CEO, Super Admin, and Compliance groups."""

    def has_permission(self, request, view):
        if super().has_permission(request, view):
            return True
        return can_view_compliance_governance(request.user)


class IsAnalyticsStaff(IsCeoStaff):
    """CEO, Finance, Operations, and Analytics groups."""

    def has_permission(self, request, view):
        if super().has_permission(request, view):
            return True
        return can_view_analytics(request.user)


class IsGatewayAdminStaff(BasePermission):
    """CEO, Platform Admin, and Developer Relations groups."""

    def has_permission(self, request, view):
        return can_manage_api_gateway(request.user)


class IsGatewayCeoStaff(BasePermission):
    """CEO-only gateway executive dashboard."""

    def has_permission(self, request, view):
        return can_view_gateway_ceo_dashboard(request.user)


class IsAcademyAdminStaff(BasePermission):
    """HR, Training Manager, and academy admin groups."""

    def has_permission(self, request, view):
        return can_manage_academy(request.user)


class IsAcademyReportStaff(BasePermission):
    """CEO dashboard and academy reports."""

    def has_permission(self, request, view):
        if can_ceo_actions(request.user):
            return True
        return can_view_academy_reports(request.user)
