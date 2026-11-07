"""Staff admin shell permissions — maps Django groups to frontend RBAC payload."""

from __future__ import annotations

import hashlib
import json

from operations.executive_permissions import (
    can_ceo_actions,
    can_dispatch_operations,
    can_manage_academy,
    can_manage_api_gateway,
    can_manage_finance,
    can_manage_fleet,
    can_view_analytics,
    can_view_compliance_governance,
    can_view_executive,
    can_view_fleet,
)

ROLE_PRIORITY = (
    ("ceo", frozenset({"CEO", "Super Admin"})),
    ("system_admin", frozenset({"Platform Admin"})),
    ("ops", frozenset({"Operations Manager", "Supervisor"})),
    ("finance", frozenset({"Finance", "Accountant"})),
    ("support", frozenset({"Support"})),
    ("driver_ops", frozenset({"HR", "Training Manager"})),
    # Employee Management (HR) admin-shell role. New dedicated groups only — the
    # legacy "HR" group keeps mapping to driver_ops above, unchanged.
    ("hr", frozenset({"HR Staff", "HR Manager", "Administrator"})),
    ("marketing", frozenset({"Marketing"})),
    ("analytics", frozenset({"Analytics", "Data Analyst"})),
)

# Marketing group "Operations" is handled separately — only maps when no higher role.
MARKETING_GROUP = "Marketing"
OPS_MARKETING_GROUP = "Operations"

HOME_ROUTES = {
    "ceo": "/admin/home/ceo",
    "system_admin": "/admin/home/system",
    "ops": "/admin/home/ops",
    "finance": "/admin/home/finance",
    "support": "/admin/home/support",
    "driver_ops": "/admin/home/drivers",
    "hr": "/admin/employees",
    "marketing": "/admin/home/marketing",
    "analytics": "/admin/home/analytics",
    "staff": "/admin/home/ops",
}

ROLE_LABELS = {
    "ceo": "CEO",
    "system_admin": "System Admin",
    "ops": "Operations",
    "finance": "Finance",
    "support": "Support",
    "driver_ops": "Driver Operations",
    "hr": "Human Resources",
    "marketing": "Marketing",
    "analytics": "Analytics",
    "staff": "Staff",
}

MODULES_BY_ROLE = {
    "ceo": [
        "home",
        "ceo",
        "ops",
        "rides",
        "drivers",
        "riders",
        "delivery",
        "merchants",
        "finance",
        "support",
        "marketing",
        "analytics",
        "system",
        "security",
        "trust_safety",
        "bi",
        "bi_growth",
        "launch",
        "business",
        "status",
        "compliance",
        "employees",
    ],
    "system_admin": ["home", "system", "status", "analytics", "api_gateway", "security"],
    "ops": [
        "home",
        "ops",
        "rides",
        "drivers",
        "riders",
        "delivery",
        "merchants",
        "support",
        "trust_safety",
        "launch",
        "fleet",
        "status",
    ],
    "finance": ["home", "finance", "business", "bi", "security"],
    "support": ["home", "support", "trust_safety", "riders", "rides"],
    "driver_ops": ["home", "drivers", "delivery", "fleet", "academy"],
    "hr": ["home", "employees"],
    "marketing": ["home", "marketing", "launch_growth", "customer_growth", "launch"],
    "analytics": ["home", "analytics", "bi", "bi_growth"],
    "staff": ["home", "ops", "status"],
}

APPROVAL_LIMITS_BY_ROLE = {
    "ceo": {"refund_mru": None, "withdrawal_mru": None, "can_create_refund_request": True},
    "finance": {"refund_mru": 50000, "withdrawal_mru": 100000, "can_create_refund_request": True},
    "ops": {"refund_mru": 0, "withdrawal_mru": 0, "can_create_refund_request": False},
    "support": {"refund_mru": 0, "withdrawal_mru": 0, "can_create_refund_request": True},
    "driver_ops": {"refund_mru": 0, "withdrawal_mru": 0, "can_create_refund_request": False},
    "hr": {"refund_mru": 0, "withdrawal_mru": 0, "can_create_refund_request": False},
    "marketing": {"refund_mru": 0, "withdrawal_mru": 0, "can_create_refund_request": False},
    "analytics": {"refund_mru": 0, "withdrawal_mru": 0, "can_create_refund_request": False},
    "system_admin": {"refund_mru": 0, "withdrawal_mru": 0, "can_create_refund_request": False},
    "staff": {"refund_mru": 0, "withdrawal_mru": 0, "can_create_refund_request": False},
}

PATH_MODULE_MAP = {
    "/admin/home/ceo": "home",
    "/admin/home/ops": "home",
    "/admin/home/support": "home",
    "/admin/home/finance": "home",
    "/admin/home/drivers": "home",
    "/admin/home/marketing": "home",
    "/admin/home/analytics": "home",
    "/admin/home/system": "home",
    "/admin/ceo-master": "ceo",
    "/admin/ceo-control": "ceo",
    "/admin/ceo-reports": "ceo",
    "/admin/ceo": "ceo",
    "/admin/board-reports": "ceo",
    "/admin/ops-control": "ops",
    "/admin/operations-control": "ops",
    "/admin/operations": "ops",
    "/admin/multi-city": "ops",
    "/admin/ai-operations": "ops",
    "/admin/smart-pricing": "ops",
    "/admin/pricing-dispatch": "ops",
    # Rides Management
    "/admin/rides": "rides",
    "/admin/rides/live": "rides",
    "/admin/rides/reports": "rides",
    # Drivers Management
    "/admin/drivers": "drivers",
    "/admin/approvals": "drivers",
    # Riders Management
    "/admin/riders": "riders",
    # Yala Delivery
    "/admin/delivery": "delivery",
    "/admin/delivery/couriers": "delivery",
    "/admin/delivery/merchants": "delivery",
    "/admin/delivery/support": "delivery",
    "/admin/merchants": "merchants",
    "/admin/merchant-platform": "merchants",
    # Employees & HR
    "/admin/employees": "employees",
    "/admin/roles": "employees",
    # Security
    "/admin/security": "security",
    "/admin/security/audit": "security",
    "/admin/security/fraud": "security",
    # Finance
    "/admin/finance-ops": "finance",
    "/admin/payments": "finance",
    "/admin/withdrawals": "finance",
    "/admin/incentives": "finance",
    "/admin/support": "support",
    "/admin/beta-feedback": "support",
    "/admin/beta": "support",
    "/admin/fleet": "drivers",
    "/admin/academy": "drivers",
    "/admin/launch-growth": "marketing",
    "/admin/growth-sprint": "marketing",
    "/admin/customer-growth": "marketing",
    "/admin/growth": "marketing",
    "/admin/bi": "analytics",
    "/admin/bi-growth": "analytics",
    "/admin/business-intelligence": "analytics",
    "/admin/growth-intelligence": "analytics",
    "/admin/status": "system",
    "/admin/api-gateway": "system",
    "/admin/trust-safety": "trust_safety",
    "/admin/safety": "trust_safety",
    "/admin/launch": "launch",
    "/admin/command": "launch",
    "/admin/operations-command": "launch",
    "/admin/business": "business",
    "/admin/business-accounts": "business",
    "/admin/partner-platform": "business",
    "/admin/compliance-governance": "compliance",
    "/admin/legacy": "home",
    "/admin": "home",
    "/admin-dashboard": "home",
}


def _user_group_names(user) -> set[str]:
    if not user or not user.is_authenticated:
        return set()
    return set(user.groups.values_list("name", flat=True))


def resolve_all_roles(user) -> list[str]:
    if user.is_superuser:
        return ["ceo", "system_admin"]
    groups = _user_group_names(user)
    roles: list[str] = []
    for role, group_names in ROLE_PRIORITY:
        if groups & group_names:
            roles.append(role)
    if MARKETING_GROUP in groups and "marketing" not in roles:
        roles.append("marketing")
    if not roles and (user.is_staff or can_view_executive(user)):
        roles.append("staff")
    return roles or ["staff"]


def resolve_admin_role(user) -> str:
    roles = resolve_all_roles(user)
    return roles[0] if roles else "staff"


def _permissions_version(user, groups: list[str]) -> str:
    city_id = getattr(user, "city_id", None)
    payload = {
        "uid": user.pk,
        "groups": sorted(groups),
        "staff": user.is_staff,
        "super": user.is_superuser,
        "city_id": city_id,
    }
    digest = hashlib.sha256(json.dumps(payload, sort_keys=True).encode("utf-8")).hexdigest()
    return digest[:16]


def _build_profile(user) -> dict:
    city = getattr(user, "city", None)
    display_name = user.get_full_name() or getattr(user, "username", "") or user.email or "Staff"
    return {
        "id": user.pk,
        "email": getattr(user, "email", "") or "",
        "display_name": display_name,
        "phone": getattr(user, "phone_number", "") or "",
        "city_id": getattr(user, "city_id", None),
        "city_name": getattr(city, "name", None) if city else None,
        "city_slug": getattr(city, "slug", None) if city else None,
        "is_staff": bool(user.is_staff),
        "is_superuser": bool(user.is_superuser),
    }


def _build_actions(user) -> dict[str, bool]:
    is_ceo = can_ceo_actions(user)
    is_finance = can_manage_finance(user)
    is_ops = can_dispatch_operations(user)
    is_fleet = can_manage_fleet(user) or can_view_fleet(user)
    is_analytics = can_view_analytics(user)
    is_compliance = can_view_compliance_governance(user)
    is_gateway = can_manage_api_gateway(user)
    is_academy = can_manage_academy(user)
    groups = _user_group_names(user)
    is_support = "Support" in groups

    return {
        "dispatch.force_assign": is_ops,
        "dispatch.reassign": is_ops,
        "dispatch.cancel_ride": is_ops,
        "dispatch.pause_driver": is_ops,
        "finance.approve_refund": is_finance or is_ceo,
        "finance.approve_withdrawal": is_finance or is_ceo,
        "finance.create_refund_request": is_support or is_finance or is_ceo,
        "finance.export": is_finance or is_analytics or is_ceo,
        "drivers.suspend": is_ops or is_ceo,
        "drivers.edit": is_fleet or is_ops or is_ceo,
        "drivers.verify_documents": is_fleet or is_academy or is_ceo,
        "users.delete": is_ceo or user.is_superuser,
        "users.manage_roles": user.is_superuser,
        "ceo.broadcast": is_ceo,
        "ceo.freeze": is_ceo,
        "compliance.view": is_compliance or is_ceo,
        "analytics.export": is_analytics or is_ceo,
        "analytics.view": is_analytics or is_ceo,
        "system.manage_flags": is_ceo or user.is_superuser or is_gateway,
        "marketing.launch_campaign": "Marketing" in groups or is_ceo,
        "support.manage_tickets": is_support or is_ceo,
        "trust_safety.manage": is_compliance or is_ops or is_ceo,
        # Employee Management capabilities (frontend UX gating; backend DRF
        # permission classes remain the authoritative enforcement). Imported
        # locally to avoid any import-order coupling between operations and the
        # employees app at module load.
        **_employee_actions(user),
    }


def _employee_actions(user) -> dict[str, bool]:
    try:
        from employees.permissions import employee_capabilities

        return employee_capabilities(user)
    except Exception:
        # Fail closed: if the employees app is unavailable for any reason, do
        # not grant any employee capability.
        return {
            "employees.view": False,
            "employees.register": False,
            "employees.update": False,
            "employees.manage_cards": False,
            "employees.administer": False,
            "employees.view_dob": False,
        }


def _build_feature_flags(user, role: str, modules: list[str]) -> dict[str, bool]:
    module_set = set(modules)
    return {
        "admin_shell": True,
        "global_search": False,
        "nested_nav": True,
        "multi_city": "ops" in module_set or role == "ceo",
        "bi_growth": "bi_growth" in module_set,
        "launch_growth": "launch_growth" in module_set or "launch" in module_set,
        "fleet_center": "fleet" in module_set or "drivers" in module_set,
        "audit_log_view": role in {"ceo", "system_admin", "finance"},
        "logout_all_devices": True,
        "session_timeout": True,
    }


def can_access_admin_path(user, path: str) -> bool:
    if not user or not user.is_authenticated:
        return False
    if not (user.is_staff or user.is_superuser):
        return False
    if user.is_superuser:
        return True
    module = PATH_MODULE_MAP.get(path.rstrip("/") or path)
    if module is None:
        # Unknown admin paths default deny — map new routes explicitly.
        return False
    role = resolve_admin_role(user)
    modules = set(MODULES_BY_ROLE.get(role, MODULES_BY_ROLE["staff"]))
    if role == "ceo":
        return True
    return module in modules


def get_required_module_for_path(path: str) -> str | None:
    normalized = (path or "").rstrip("/") or "/admin"
    if normalized.startswith("/admin/home/"):
        return "home"
    return PATH_MODULE_MAP.get(normalized)


def build_admin_permissions(user) -> dict:
    role = resolve_admin_role(user)
    groups = sorted(_user_group_names(user))
    additional_roles = [r for r in resolve_all_roles(user) if r != role]
    modules = list(MODULES_BY_ROLE.get(role, MODULES_BY_ROLE["staff"]))
    if user.is_superuser:
        modules = list(MODULES_BY_ROLE["ceo"])

    actions = _build_actions(user)
    approval_limits = dict(APPROVAL_LIMITS_BY_ROLE.get(role, APPROVAL_LIMITS_BY_ROLE["staff"]))
    if user.is_superuser or role == "ceo":
        approval_limits = dict(APPROVAL_LIMITS_BY_ROLE["ceo"])

    profile = _build_profile(user)
    feature_flags = _build_feature_flags(user, role, modules)
    version = _permissions_version(user, groups)

    totp_confirmed = False
    try:
        from admin_2fa.models import AdminTOTP

        totp_obj = AdminTOTP.objects.filter(user=user).first()
        totp_confirmed = bool(totp_obj and totp_obj.is_confirmed)
    except Exception:
        totp_confirmed = False

    return {
        "profile": profile,
        "role": role,
        "role_label": ROLE_LABELS.get(role, role.replace("_", " ").title()),
        "additional_roles": additional_roles,
        "additional_role_labels": [ROLE_LABELS.get(r, r) for r in additional_roles],
        "groups": groups,
        "modules": modules,
        "actions": actions,
        "approval_limits": approval_limits,
        "feature_flags": feature_flags,
        "security": {
            "totp_confirmed": totp_confirmed,
            "session_timeout_enabled": bool(feature_flags.get("session_timeout")),
        },
        "home_route": HOME_ROUTES.get(role, HOME_ROUTES["staff"]),
        "permissions_version": version,
        "elevated": bool(user.is_superuser),
        "email": profile["email"],
        "display_name": profile["display_name"],
        "assigned_city": {
            "id": profile["city_id"],
            "name": profile["city_name"],
            "slug": profile["city_slug"],
        }
        if profile["city_id"]
        else None,
        "cache_ttl_seconds": 900,
    }
