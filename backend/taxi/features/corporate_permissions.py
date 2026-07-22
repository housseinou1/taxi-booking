"""Permissions for Yala Business Accounts."""

from rest_framework.permissions import BasePermission

from .corporate_service import get_company_admin_profile


class IsCorporateAdmin(BasePermission):
    def has_permission(self, request, view):
        return get_company_admin_profile(request.user) is not None
