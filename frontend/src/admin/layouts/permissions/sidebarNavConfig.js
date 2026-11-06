/**
 * YALA TECHNOLOGIES — ADMIN SIDEBAR NAVIGATION
 * FAST • SAFE • RELIABLE 🇲🇷
 *
 * Single source of truth for the Admin sidebar. Organises the EXISTING admin
 * pages into the twelve approved business sections of the enterprise navigation
 * spec (Executive Command Center … Settings & Configuration).
 *
 * Rules honoured here:
 *  - Every `path` below is a real route registered in `App.js`. No link is
 *    invented; features that do not exist are omitted (see the report).
 *  - `module` is the RBAC module id from `permissions/adminRouteAccess.js`.
 *    Visibility is driven by `permissions.modules`, never by hiding alone —
 *    `AdminShellInner` still enforces `canAccessCurrentPath` and the backend
 *    still enforces its own permissions.
 *  - CEO Command Center (`/admin/ceo-master`) and Executive Dashboard
 *    (`/admin/ceo`) are distinct entries and are never duplicated.
 */

export const SIDEBAR_NAV_ITEMS = [
  // ── HOME ────────────────────────────────────────────────────────────────────
  {
    id: "home",
    module: "home",
    label: "Home Dashboard",
    icon: "🏠",
    // `/admin` is the routed admin home (Operations Console inside AdminShell).
    // The backend's `home_route` currently returns `/admin/home/ceo`, which is
    // NOT registered in App.js, so linking it would render the public landing
    // page. Point at the real route instead.
    path: "/admin",
  },

  // ── EXECUTIVE COMMAND CENTER ────────────────────────────────────────────────
  {
    id: "ceo",
    module: "ceo",
    label: "Executive Command Center",
    icon: "👔",
    children: [
      { id: "ceo-master", module: "ceo", label: "CEO Command Center", path: "/admin/ceo-master", icon: "🎯" },
      { id: "ceo-dashboard", module: "ceo", label: "Executive Dashboard", path: "/admin/ceo", icon: "📊" },
      { id: "executive", module: "ceo", label: "Executive Overview", path: "/admin/executive", icon: "🧭" },
      { id: "ceo-control", module: "ceo", label: "CEO Control Center", path: "/admin/ceo-control", icon: "🛡" },
      { id: "ceo-reports", module: "ceo", label: "CEO Reports", path: "/admin/ceo-reports", icon: "📄" },
      { id: "board", module: "ceo", label: "Board Reports", path: "/admin/board-reports", icon: "📑" },
      { id: "cities", module: "ceo", label: "City Management", path: "/admin/cities", icon: "🏙" },
    ],
  },

  // ── 2. OPERATIONS MANAGEMENT ────────────────────────────────────────────────
  {
    id: "ops",
    module: "ops",
    label: "Operations Management",
    icon: "📡",
    children: [
      { id: "ops-control", module: "ops", label: "Operations Control Center", path: "/admin/operations-control", icon: "🎛" },

      { id: "ops-overview", module: "ops", label: "Operations Overview", path: "/admin/operations", icon: "🗂" },
      { id: "ops-center", module: "ops", label: "Ops Center Home", path: "/admin/ops-center", icon: "🧮" },
      { id: "ops-live", module: "ops", label: "Live Operations", path: "/admin/ops-center/live", icon: "📍" },
      { id: "ops-command", module: "ops", label: "Ops Command Center", path: "/admin/ops-center/command", icon: "🧭" },
      { id: "rides", module: "rides", label: "Ride Management", path: "/admin/rides", icon: "🚕" },
      { id: "rides-live", module: "rides", label: "Live Rides", path: "/admin/rides/live", icon: "🛰" },
      { id: "rides-reports", module: "rides", label: "Ride Reports", path: "/admin/rides/reports", icon: "📈" },
      { id: "smart-pricing", module: "ops", label: "Smart Pricing Dispatch", path: "/admin/smart-pricing", icon: "💹" },
      { id: "multi-city", module: "ops", label: "Multi-City Operations", path: "/admin/multi-city", icon: "🌍", featureFlag: "multi_city" },
      { id: "ai-ops", module: "ops", label: "AI Operations", path: "/admin/ai-operations", icon: "🤖" },
    ],
  },

  // ── 3. DRIVERS & FLEET MANAGEMENT ───────────────────────────────────────────
  {
    id: "drivers-fleet",
    module: "drivers",
    label: "Drivers & Fleet Management",
    icon: "🚕",
    children: [
      // Driver Management dropdown, ordered per the YALA admin brief. Existing
      // pages are reused rather than reimplemented; only the five `driver-*`
      // paths below are new, and each renders a real module.
      { id: "drivers-overview", module: "drivers", label: "Driver Overview", path: "/admin/drivers/dashboard", icon: "📊" },
      { id: "drivers", module: "drivers", label: "Driver Management", path: "/admin/drivers", icon: "🧑‍✈️" },
      { id: "approvals", module: "drivers", label: "Driver Applications", path: "/admin/approvals", icon: "✅" },
      { id: "driver-documents", module: "drivers", label: "Driver Documents", path: "/admin/driver-documents", icon: "📄" },
      { id: "driver-verification", module: "drivers", label: "Document Verification", path: "/admin/driver-verification", icon: "🔍" },
      { id: "driver-performance", module: "drivers", label: "Driver Performance", path: "/admin/driver-performance", icon: "🎯" },
      { id: "driver-ratings", module: "drivers", label: "Driver Ratings", path: "/admin/driver-ratings", icon: "⭐" },
      { id: "driver-activity", module: "drivers", label: "Driver Activity", path: "/admin/driver-activity", icon: "📈" },
      // Safety incidents are owned by the trust_safety module; this entry reuses
      // the existing Trust & Safety Center at a driver-focused path.
      { id: "driver-safety", module: "trust_safety", label: "Driver Safety", path: "/admin/driver-safety", icon: "🚨" },
      { id: "fleet", module: "drivers", label: "Fleet Management", path: "/admin/fleet", icon: "🚙", featureFlag: "fleet_center" },
      { id: "vehicles", module: "drivers", label: "Vehicle Management", path: "/admin/vehicles", icon: "🚗" },
      { id: "academy", module: "drivers", label: "Driver Academy", path: "/admin/academy", icon: "🎓" },
      { id: "hall-of-fame", module: "drivers", label: "Hall of Fame", path: "/admin/hall-of-fame", icon: "🏆" },
    ],
  },

  // ── 4. RIDER & CUSTOMER MANAGEMENT ──────────────────────────────────────────
  {
    id: "riders",
    module: "riders",
    label: "Rider & Customer Management",
    icon: "👥",
    children: [
      { id: "riders-dashboard", module: "riders", label: "Riders Dashboard", path: "/admin/riders/dashboard", icon: "📊" },
      { id: "riders", module: "riders", label: "Rider Management", path: "/admin/riders", icon: "🗂" },
      { id: "customer-growth", module: "marketing", label: "Customer Growth", path: "/admin/customer-growth", icon: "🌱" },
      { id: "marketing", module: "marketing", label: "Marketing & Promotions", path: "/admin/growth", icon: "📣" },
    ],
  },

  // ── 5. YALA DELIVERY MANAGEMENT ─────────────────────────────────────────────
  {
    id: "delivery",
    module: "delivery",
    label: "YALA Delivery Management",
    icon: "📦",
    children: [
      { id: "delivery-dashboard", module: "delivery", label: "Delivery Dashboard", path: "/admin/delivery", icon: "🚚" },
      { id: "delivery-directory", module: "delivery", label: "Delivery Directory", path: "/admin/delivery/directory", icon: "📋" },
      { id: "delivery-cities", module: "delivery", label: "City Analytics", path: "/admin/delivery/cities", icon: "🏙" },
      { id: "delivery-couriers", module: "delivery", label: "Courier Management", path: "/admin/delivery/couriers", icon: "🧑‍🔧" },
      { id: "delivery-merchants", module: "delivery", label: "Merchant Management", path: "/admin/delivery/merchants", icon: "🏪" },
      { id: "delivery-support", module: "delivery", label: "Delivery Support", path: "/admin/delivery/support", icon: "🎧" },
      { id: "merchant-platform", module: "business", label: "Merchant Platform", path: "/admin/merchant-platform", icon: "🤝" },
    ],
  },

  // ── 7. EMPLOYEES & HUMAN RESOURCES ──────────────────────────────────────────
  {
    id: "employees",
    module: "employees",
    label: "Employees & Human Resources",
    icon: "🧑‍💼",
    children: [
      { id: "employees-directory", module: "employees", label: "Employees", path: "/admin/employees", icon: "🗂" },
      { id: "hr", module: "employees", label: "HR Management", path: "/admin/hr", icon: "📋" },
      { id: "attendance", module: "employees", label: "Attendance Management", path: "/admin/attendance", icon: "⏰" },
      { id: "verification", module: "employees", label: "Employee Verification", path: "/admin/verification", icon: "🪪" },
      { id: "break-notifications", module: "employees", label: "Break Notifications", path: "/admin/break-notifications", icon: "🔔" },
    ],
  },
  // ── 8. CUSTOMER SUPPORT ─────────────────────────────────────────────────────
  {
    id: "support",
    module: "support",
    label: "Customer Support",
    icon: "🎧",
    children: [
      { id: "support-console", module: "support", label: "Support Dashboard", path: "/admin/support", icon: "📞" },
      { id: "beta-feedback", module: "support", label: "Beta Feedback", path: "/admin/beta-feedback", icon: "💬" },
      { id: "beta", module: "support", label: "Beta Program", path: "/admin/beta", icon: "🧪" },
    ],
  },

  // ── 6. FINANCE & ACCOUNTING ─────────────────────────────────────────────────
  {
    id: "finance",
    module: "finance",
    label: "Finance & Accounting",
    icon: "💰",
    children: [
      { id: "financial-overview", module: "finance", label: "Financial Overview", path: "/admin/ops-center/finance", icon: "💵" },
      { id: "payments", module: "finance", label: "Payment Management", path: "/admin/payments", icon: "🧾" },
      { id: "finance-ops", module: "finance", label: "Finance Operations", path: "/admin/finance-ops", icon: "💳" },
      { id: "finance-approvals", module: "finance", label: "Refund & Payout Approvals", path: "/admin/finance-approvals", icon: "✅" },
      { id: "withdrawals", module: "finance", label: "Driver & Courier Payouts", path: "/admin/withdrawals", icon: "🏦" },
      { id: "withdrawal-accounts", module: "finance", label: "Settlement Accounts", path: "/admin/withdrawal-accounts", icon: "🏛" },
      { id: "incentives", module: "finance", label: "Driver Incentives", path: "/admin/incentives", icon: "🎁" },
    ],
  },

  // ── 9. TRUST & SAFETY ───────────────────────────────────────────────────────
  {
    id: "trust-safety",
    module: "trust_safety",
    label: "Trust & Safety",
    icon: "🛡",
    children: [
      { id: "trust-safety-center", module: "trust_safety", label: "Trust & Safety Center", path: "/admin/trust-safety", icon: "🚨" },
      { id: "safety-incidents", module: "trust_safety", label: "Safety Incidents", path: "/admin/safety", icon: "🆘" },
      { id: "security-ops", module: "security", label: "Security Dashboard", path: "/admin/security", icon: "🔐" },
      { id: "security-audit", module: "security", label: "Audit Logs", path: "/admin/security/audit", icon: "📜" },
      { id: "security-fraud", module: "security", label: "Fraud Monitoring", path: "/admin/security/fraud", icon: "🕵" },
      { id: "compliance", module: "compliance", label: "Compliance & Governance", path: "/admin/compliance-governance", icon: "⚖" },
    ],
  },

  // ── 10. REPORTS & ANALYTICS ─────────────────────────────────────────────────
  {
    id: "reports",
    module: "analytics",
    label: "Reports & Analytics",
    icon: "📈",
    children: [
      { id: "business-intelligence", module: "analytics", label: "Reports & Analytics", path: "/admin/business-intelligence", icon: "🧠" },
      { id: "bi", module: "analytics", label: "BI Warehouse", path: "/admin/bi", icon: "📊" },
      { id: "share-analytics", module: "analytics", label: "Share & Referral Analytics", path: "/admin/share-analytics", icon: "🔗" },
    ],
  },

  // ── 11. PLATFORM ADMINISTRATION ─────────────────────────────────────────────
  {
    id: "platform",
    module: "system",
    label: "Platform Administration",
    icon: "⚙",
    children: [
      { id: "launch", module: "launch", label: "Launch Hub", path: "/admin/launch", icon: "🚀" },
      { id: "command", module: "launch", label: "Launch Command", path: "/admin/command", icon: "🧭" },
      { id: "operations-command", module: "launch", label: "Launch Operations Command", path: "/admin/operations-command", icon: "🎯" },
      { id: "business", module: "business", label: "Business Hub", path: "/admin/business", icon: "🏢" },
      { id: "business-accounts", module: "business", label: "Business Accounts", path: "/admin/business-accounts", icon: "🧾" },
      { id: "partner-platform", module: "business", label: "Partner Platform", path: "/admin/partner-platform", icon: "🔗" },
    ],
  },

  // ── 12. SETTINGS & CONFIGURATION ────────────────────────────────────────────
  // Platform configuration surfaces. Every path here is an existing, registered
  // page; nothing is invented. Roles & Permissions and Pricing & Dispatch keep
  // their own RBAC modules, so `filterNavItems` shows each entry only to a role
  // that has been granted it (the CEO/elevated bypass is unchanged).
  {
    id: "settings",
    module: "system",
    label: "Settings & Configuration",
    icon: "🛠",
    children: [
      { id: "status", module: "system", label: "System Status", path: "/admin/status", icon: "🩺" },
      { id: "api-gateway", module: "system", label: "API Gateway", path: "/admin/api-gateway", icon: "🔌" },
      { id: "roles", module: "employees", label: "Roles & Permissions", path: "/admin/roles", icon: "🔑" },
      { id: "pricing-config", module: "ops", label: "Pricing & Dispatch Configuration", path: "/admin/pricing-dispatch", icon: "💹" },
    ],
  },
];

/**
 * RBAC gate for a single nav entry.
 *
 * Elevated staff and the CEO role see the full platform (the Legacy Admin Hub
 * stays CEO-only). Everyone else sees an entry only when its RBAC module is
 * granted, and a feature-flagged entry only when that flag is enabled.
 *
 * Hiding is never the only control: `AdminShellInner` re-checks
 * `canAccessCurrentPath` for the rendered route and the Django API keeps its own
 * authorisation.
 */
function itemAllowed(item, permissions) {
  if (!permissions) return false;
  if (permissions.elevated || permissions.role === "ceo") {
    return item.id !== "legacy" || permissions.role === "ceo";
  }
  if (!(permissions.modules || []).includes(item.module)) return false;
  if (item.featureFlag && !permissions.feature_flags?.[item.featureFlag]) return false;
  return true;
}

export function filterNavItems(permissions) {
  if (!permissions) return [];

  return SIDEBAR_NAV_ITEMS.map((item) => {
    if (!item.children?.length) {
      return itemAllowed(item, permissions) ? item : null;
    }
    const children = item.children.filter((child) => itemAllowed(child, permissions));
    if (!children.length) return null;
    return { ...item, children };
  }).filter(Boolean);
}

export function resolveNavPath(item, permissions) {
  if (item.getPath) return item.getPath(permissions);
  return item.path;
}

export function flattenNavItems(items) {
  const flat = [];
  (items || []).forEach((item) => {
    if (item.children?.length) {
      item.children.forEach((child) => flat.push(child));
    } else {
      flat.push(item);
    }
  });
  return flat;
}

/**
 * Category grouping. Every top-level entry is already a business category, so a
 * group is simply that category; the `section` key keeps the previous export
 * contract for callers that render section headings.
 */
export function groupNavItems(items) {
  return (items || []).map((item) => ({ section: item.label, items: [item] }));
}

