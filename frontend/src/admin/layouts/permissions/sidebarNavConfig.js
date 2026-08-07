export const SIDEBAR_NAV_ITEMS = [
  {
    id: "home",
    module: "home",
    label: "Home",
    path: null,
    icon: "🏠",
    getPath: (p) => p?.home_route || "/admin/home/ops",
  },
  {
    id: "ceo",
    module: "ceo",
    label: "CEO Command",
    icon: "👔",
    children: [
      { id: "ceo-master", module: "ceo", label: "Master Command", path: "/admin/ceo-master", icon: "🎯" },
      { id: "board", module: "ceo", label: "Board Reports", path: "/admin/board-reports", icon: "📑" },
    ],
  },
  {
    id: "ops",
    module: "ops",
    label: "Operations",
    icon: "📡",
    children: [
      { id: "ops-control", module: "ops", label: "Control Center", path: "/admin/ops-control", icon: "🎛" },
      { id: "multi-city", module: "ops", label: "Multi-City", path: "/admin/multi-city", icon: "🌍", featureFlag: "multi_city" },
      { id: "smart-pricing", module: "ops", label: "Smart Pricing", path: "/admin/smart-pricing", icon: "💹" },
    ],
  },
  {
    id: "finance",
    module: "finance",
    label: "Finance",
    icon: "💰",
    children: [
      { id: "finance-ops", module: "finance", label: "Finance Ops", path: "/admin/finance-ops", icon: "💳" },
      { id: "payments", module: "finance", label: "Payments", path: "/admin/payments", icon: "🧾" },
    ],
  },
  {
    id: "support",
    module: "support",
    label: "Support",
    icon: "🎧",
    children: [
      { id: "support-console", module: "support", label: "Support Console", path: "/admin/support", icon: "📞" },
      { id: "trust-safety", module: "trust_safety", label: "Trust & Safety", path: "/admin/trust-safety", icon: "🛡" },
    ],
  },
  {
    id: "approvals",
    module: "approvals",
    label: "Approval Center",
    icon: "✅",
    path: "/admin/approvals",
  },
  {
    id: "drivers",
    module: "drivers",
    label: "Driver Ops",
    icon: "🚗",
    children: [
      { id: "fleet", module: "drivers", label: "Fleet Center", path: "/admin/fleet", icon: "🚕", featureFlag: "fleet_center" },
      { id: "academy", module: "drivers", label: "Academy", path: "/admin/academy", icon: "🎓" },
    ],
  },
  {
    id: "marketing",
    module: "marketing",
    label: "Marketing",
    icon: "📣",
    children: [
      { id: "launch-growth", module: "marketing", label: "Launch Growth", path: "/admin/launch-growth", icon: "🚀", featureFlag: "launch_growth" },
      { id: "customer-growth", module: "marketing", label: "Customer Growth", path: "/admin/customer-growth", icon: "📈" },
    ],
  },
  {
    id: "analytics",
    module: "analytics",
    label: "Analytics",
    icon: "📊",
    children: [
      { id: "bi", module: "analytics", label: "BI Warehouse", path: "/admin/bi", icon: "📈" },
      { id: "bi-growth", module: "bi_growth", label: "Growth Intel", path: "/admin/bi-growth", icon: "📉", featureFlag: "bi_growth" },
    ],
  },
    {
        id: "system",
        module: "system",
        label: "System Admin",
        icon: "🔧",
        children: [
          { id: "system-home", module: "system", label: "System Console", path: "/admin/home/system", icon: "🛠" },
          { id: "status", module: "system", label: "System Health", path: "/admin/status", icon: "⚙" },
          { id: "api-gateway", module: "system", label: "API Gateway", path: "/admin/api-gateway", icon: "🔌" },
        ],
    },
  {
    id: "launch",
    module: "launch",
    label: "Launch Hub",
    path: "/admin/launch",
    icon: "🚀",
  },
  {
    id: "business",
    module: "business",
    label: "Business",
    path: "/admin/business-accounts",
    icon: "🏢",
  },
  {
    id: "legacy",
    module: "ceo",
    label: "Legacy Admin Hub",
    path: "/admin/legacy",
    icon: "📋",
  },
];

function itemAllowed(item, permissions) {
  if (!permissions) return false;
  if (permissions.elevated || permissions.role === "ceo") {
    return item.id !== "legacy" || permissions.role === "ceo";
  }
  const allowedModules = new Set(permissions.modules || []);
  if (!allowedModules.has(item.module)) return false;
  if (item.featureFlag && !permissions.feature_flags?.[item.featureFlag]) return false;
  return true;
}

export function filterNavItems(permissions) {
  if (!permissions) return [];

  return SIDEBAR_NAV_ITEMS.map((item) => {
    if (item.children?.length) {
      const children = item.children.filter((child) => itemAllowed(child, permissions));
      if (!children.length) return null;
      if (!itemAllowed(item, permissions) && !children.length) return null;
      return { ...item, children };
    }
    return itemAllowed(item, permissions) ? item : null;
  }).filter(Boolean);
}

export function resolveNavPath(item, permissions) {
  if (item.getPath) return item.getPath(permissions);
  return item.path;
}

export function flattenNavItems(items) {
  const flat = [];
  items.forEach((item) => {
    if (item.children?.length) {
      item.children.forEach((child) => flat.push(child));
    } else {
      flat.push(item);
    }
  });
  return flat;
}
