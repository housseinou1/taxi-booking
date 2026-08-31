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
  "/admin/ceo": "ceo",
  "/admin/board-reports": "ceo",
  "/admin/ops-control": "ops",
  "/admin/operations-control": "ops",
  "/admin/operations": "ops",
  "/admin/multi-city": "ops",
  "/admin/ai-operations": "ops",
  "/admin/smart-pricing": "ops",
  "/admin/pricing-dispatch": "ops",
  "/admin/finance-ops": "finance",
  "/admin/payments": "finance",
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
};

export const MODULE_LABELS = {
  home: "Home",
  ceo: "CEO Command",
  ops: "Operations",
  finance: "Finance",
  support: "Support",
  drivers: "Driver Operations",
  marketing: "Marketing",
  analytics: "Analytics",
  system: "System Admin",
  trust_safety: "Trust & Safety",
  launch: "Launch Hub",
  business: "Business",
  compliance: "Compliance",
  bi: "BI Analytics",
  bi_growth: "Growth Intelligence",
  fleet: "Fleet",
  academy: "Academy",
};

export function getModuleForPath(pathname) {
  const normalized = (pathname || "").replace(/\/+$/, "") || "/admin";
  if (PATH_MODULE_MAP[normalized]) return PATH_MODULE_MAP[normalized];
  if (normalized.startsWith("/admin/home/")) return "home";
  return null;
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
