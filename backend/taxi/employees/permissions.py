"""Role-based access control for the Employee Management backend.

Three Django Groups gate the module, following the existing admin RBAC idiom
(``operations.executive_permissions``): a group-set constant, predicate
helpers that reuse ``user_in_groups`` (superuser bypass; otherwise must be
``is_staff`` AND in a named group), and DRF ``BasePermission`` subclasses.

Server-side enforcement is the authoritative security boundary — the admin
shell's module visibility (admin_permissions_service) is UX only and must never
be relied on for authorization.

Role hierarchy (least privilege; higher roles inherit lower capabilities):

    HR Staff      -> view authorized employees, register, update permitted info
    HR Manager    -> all HR Staff + approve card issuance/renewal/replacement,
                     review card history
    Administrator -> manage HR permissions, activate/deactivate/revoke cards,
                     review audit logs

``Administrator`` is expressed via the existing top-level admin groups
(``CEO`` / ``Super Admin``) plus a dedicated ``Administrator`` group, so a
platform owner already has full access.
"""

from rest_framework.permissions import BasePermission

from operations.executive_permissions import user_in_groups

# Django Group names. These are created idempotently by the
# ``ensure_employee_groups`` helper (and can also be managed in Django admin).
HR_STAFF_GROUP = "HR Staff"
HR_MANAGER_GROUP = "HR Manager"
ADMINISTRATOR_GROUP = "Administrator"

# Admin-tier groups that always include employee administration. These are
# existing platform-owner groups; adding them here does not change their
# existing privileges elsewhere.
ADMIN_TIER_GROUPS = {"CEO", "Super Admin", ADMINISTRATOR_GROUP}

# Group sets per capability tier (higher tiers are supersets).
HR_STAFF_GROUPS = {HR_STAFF_GROUP, HR_MANAGER_GROUP} | ADMIN_TIER_GROUPS
HR_MANAGER_GROUPS = {HR_MANAGER_GROUP} | ADMIN_TIER_GROUPS
EMPLOYEE_ADMIN_GROUPS = set(ADMIN_TIER_GROUPS)

# All groups this feature introduces (for idempotent provisioning).
EMPLOYEE_GROUPS = (HR_STAFF_GROUP, HR_MANAGER_GROUP, ADMINISTRATOR_GROUP)


def is_hr_staff(user) -> bool:
    """Can view/register/update employees (HR Staff and above)."""
    return user_in_groups(user, HR_STAFF_GROUPS)


def is_hr_manager(user) -> bool:
    """Can approve card issuance/renewal/replacement and review history."""
    return user_in_groups(user, HR_MANAGER_GROUPS)


def is_employee_admin(user) -> bool:
    """Can manage HR permissions, activate/deactivate/revoke cards, view audit."""
    return user_in_groups(user, EMPLOYEE_ADMIN_GROUPS)


def can_view_employee_dob(user) -> bool:
    """Field-level permission to read an employee's date of birth.

    DOB is sensitive HR data. Only the administrator tier (Administrator / CEO /
    Super Admin, plus superusers) may read it. General HR Staff and HR Managers
    can register/update employees but must NOT see DOB in read responses. This
    is the server-side gate behind the ``employees.view_dob`` capability and the
    serializer's conditional DOB field.
    """
    return is_employee_admin(user)


def employee_capabilities(user) -> dict:
    """Explicit employee action capabilities for the admin permissions payload.

    The frontend uses these to decide which controls to display; the backend
    DRF permission classes remain the authoritative enforcement regardless.
    """
    return {
        "employees.view": is_hr_staff(user),
        "employees.register": is_hr_staff(user),
        "employees.update": is_hr_staff(user),
        "employees.manage_cards": is_hr_manager(user),
        "employees.administer": is_employee_admin(user),
        "employees.view_dob": can_view_employee_dob(user),
    }


class IsHrStaff(BasePermission):
    """HR Staff tier: view/register/update employees. Superuser bypasses."""

    def has_permission(self, request, view):
        return is_hr_staff(request.user)


class IsHrManager(BasePermission):
    """HR Manager tier: approvals + card history review."""

    def has_permission(self, request, view):
        return is_hr_manager(request.user)


class IsEmployeeAdministrator(BasePermission):
    """Administrator tier: HR permission management, card revocation, audit."""

    def has_permission(self, request, view):
        return is_employee_admin(request.user)


def ensure_employee_groups():
    """Idempotently create the three employee Django Groups.

    Safe to call from a data migration or a management command. Does not assign
    users to groups and does not alter existing groups.
    """
    from django.contrib.auth.models import Group

    created = {}
    for name in EMPLOYEE_GROUPS:
        _group, was_created = Group.objects.get_or_create(name=name)
        created[name] = was_created
    return created
