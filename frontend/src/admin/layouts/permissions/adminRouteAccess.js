/** Route ΓåÆ required module id for AdminRouteGuard */

export const PATH_MODULE_MAP = {
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
  // Rides Management
  "/admin/rides": "rides",
  "/admin/rides/live": "rides",
  "/admin/rides/reports": "rides",
  // Drivers Management
  "/admin/drivers": "drivers",
  "/admin/approvals": "drivers",
  "/admin/hall-of-fame": "drivers",
  "/admin/cities": "ceo",
  "/admin/vehicles": "drivers",
  // Riders Management
  "/admin/riders": "riders",
  // Dedicated overview dashboards (new routes, same modules)
  "/admin/drivers/dashboard": "drivers",
  "/admin/riders/dashboard": "riders",
  // Driver Documents & Performance modules (existing endpoints, new admin pages).
  "/admin/driver-documents": "drivers",
  "/admin/driver-verification": "drivers",
  "/admin/driver-performance": "drivers",
  "/admin/driver-ratings": "drivers",
  "/admin/driver-activity": "drivers",
  // Driver Safety reuses the Trust & Safety Center, so it stays in that module.
  "/admin/driver-safety": "trust_safety",
  // Yala Delivery
  "/admin/delivery": "delivery",
  "/admin/delivery/directory": "delivery",
  "/admin/delivery/cities": "delivery",
  "/admin/delivery/couriers": "delivery",
  "/admin/delivery/merchants": "delivery",
  "/admin/delivery/support": "delivery",
  "/admin/merchants": "merchants",
  // Employees & HR
  "/admin/roles": "employees",
  // Security
  "/admin/security": "security",
  "/admin/security/audit": "security",
  "/admin/security/fraud": "security",
  // Finance
  "/admin/withdrawals": "finance",
  "/admin/withdrawal-accounts": "finance",
  "/admin/finance-ops": "finance",
  // Dedicated refund / payout approval surface. FinanceDashboard existed but had no
  // route, so its approval controls were unreachable.
  "/admin/finance-approvals": "finance",
  "/admin/payments": "finance",
  "/admin/incentives": "finance",
  "/admin/support": "support",
  "/admin/beta-feedback": "support",
  "/admin/beta": "support",
  "/admin/fleet": "drivers",
  "/admin/academy": "drivers",
  "/admin/employees": "employees",
  "/admin/attendance": "employees",
  "/admin/hr": "employees",
  "/admin/verification": "employees",
  "/admin/break-notifications": "employees",
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
  "/admin/business": "business",
  "/admin/business-accounts": "business",
  "/admin/merchant-platform": "business",
  "/admin/partner-platform": "business",
  "/admin/command": "launch",
  "/admin/operations-command": "launch",
  "/admin/compliance-governance": "compliance",
  "/admin/legacy": "home",
  "/admin": "home",
  "/admin-dashboard": "home",
  // Routed pages the sidebar links to that had no module mapping. Without these
  // `canAccessPath` default-denied them for every non-elevated role even though
  // the page is registered in App.js. The module must still be granted in
  // `permissions.modules`, so no access is widened by accident.
  "/admin/executive": "ceo",
  "/admin/ops-center": "ops",
  "/admin/ops-center/live": "ops",
  "/admin/ops-center/command": "ops",
  "/admin/ops-center/finance": "finance",
  "/admin/share-analytics": "analytics",
};

export const MODULE_LABELS = {
  home: "Home",
  ceo: "CEO Command Center",
  ops: "Operations",
  rides: "Rides Management",
  drivers: "Drivers Management",
  riders: "Riders Management",
  delivery: "Yala Delivery",
  merchants: "Merchants & Stores",
  security: "Security",
  finance: "Finance",
  support: "Customer Support",
  marketing: "Marketing",
  analytics: "Reports & Analytics",
  system: "Settings",
  trust_safety: "Trust & Safety",
  launch: "Launch Hub",
  business: "Business",
  compliance: "Compliance",
  bi: "BI Analytics",
  bi_growth: "Growth Intelligence",
  fleet: "Fleet",
  academy: "Academy",
  employees: "Employees & HR",
};

export function getModuleForPath(pathname) {
  const normalized = (pathname || "").replace(/\/+$/, "") || "/admin";
  if (PATH_MODULE_MAP[normalized]) return PATH_MODULE_MAP[normalized];
  if (normalized.startsWith("/admin/home/")) return "home";
  return null;
}

/**
 * Resolve a backend-advertised `home_route` to a destination that actually exists.
 *
 * `HOME_ROUTES` (operations/admin_permissions_service.py) advertises `/admin/home/<role>`
 * for nine of its ten roles, but App.js registers none of those paths. An unmatched admin
 * path falls through to `<LandingPage />` (App.js), so following the advertised route would
 * drop an authenticated administrator on the public landing page. `/admin` is the real
 * registered admin home (Operations Console inside AdminShell).
 *
 * Any other advertised route is preserved, so the registered `hr` home
 * (`/admin/employees`) keeps working.
 */
export function resolveRegisteredAdminHome(homeRoute) {
  if (typeof homeRoute !== "string" || !homeRoute) return "/admin";
  if (homeRoute.startsWith("/admin/home/")) return "/admin";
  return homeRoute;
}

export function canAccessPath(permissions, pathname) {
  if (!permissions) return false;
  if (permissions.elevated || permissions.role === "ceo") return true;
  const module = getModuleForPath(pathname);
  // Unknown admin paths default deny ΓÇö map new routes explicitly.
  if (!module) return false;
  return (permissions.modules || []).includes(module);
}

export function getRouteAccessDenial(permissions, pathname) {
  if (!permissions) {
    return {
      requestedRoute: pathname,
      requiredModule: null,
      requiredPermission: "Authenticated staff session",
    };
  }
  if (canAccessPath(permissions, pathname)) return null;

  const requiredModule = getModuleForPath(pathname);
  return {
    requestedRoute: pathname,
    requiredModule,
    requiredPermission: requiredModule
      ? `module:${requiredModule}`
      : "admin.access",
    requiredModuleLabel: MODULE_LABELS[requiredModule] || requiredModule,
  };
}
