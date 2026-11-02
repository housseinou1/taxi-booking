/**
 * YALA TECHNOLOGIES — ADMIN SIDEBAR NAVIGATION
 * FAST • SAFE • RELIABLE 🇲🇷
 *
 * Single source of truth for the Admin sidebar. Organises the EXISTING admin
 * pages into the ten business categories of the enterprise navigation spec.
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

import { getModuleForPath } from "./adminRouteAccess";

/** RBAC module of an admin path; query strings (`?tab=`) select a tab inside the same page. */
function navModule(path) {
  return getModuleForPath(String(path).split("?")[0]) || path;
}

const GROUP_MODULE = {
  ceo: "/admin/ceo-master",
  ops: "/admin/operations",
  drivers_fleet: "/admin/drivers",
  riders: "/admin/riders",
  delivery: "/admin/delivery",
  employees: "/admin/employees",
  support: "/admin/support",
  finance: "/admin/payments",
  security: "/admin/security",
  growth: "/admin/business-intelligence",
  platform: "/admin/status",
};

function nav(id, label, path, icon, extra = {}) {
  return { id, module: navModule(path), label, path, icon, ...extra };
}

export const SIDEBAR_NAV_ITEMS = [
  {
    id: "home",
    module: "home",
    label: "Home Dashboard",
    icon: "home",
    // `/admin` is the routed admin home (the backend `home_route` /admin/home/* is not registered).
    path: "/admin",
  },
  {
    id: "ceo",
    module: navModule(GROUP_MODULE.ceo),
    label: "Executive Command Center",
    icon: "briefcase",
    children: [
      nav("executive", "Executive Overview", "/admin/executive", "compass"),
      nav("ceo-master", "CEO Dashboard", "/admin/ceo-master", "target"),
      nav("ceo-dashboard", "Business Performance", "/admin/ceo", "chart"),
      nav("board", "Strategic Reports", "/admin/board-reports", "files"),
      nav("ceo-control", "CEO Control Center", "/admin/ceo-control", "shield-check"),
      nav("cities", "City Management", "/admin/cities", "city"),
    ],
  },
  {
    id: "ops",
    module: navModule(GROUP_MODULE.ops),
    label: "Operations",
    icon: "radio",
    children: [
      nav("rides", "Ride Management", "/admin/rides", "route"),
      nav("smart-pricing", "Dispatch Management", "/admin/smart-pricing", "activity"),
      nav("ops-live", "Live Tracking", "/admin/ops-center/live", "map-pin"),
      nav("rides-reports", "Ride History", "/admin/rides/reports", "bar-chart"),
      nav("ops-overview", "Operations Overview", "/admin/operations", "grid"),
      nav("ops-center", "Ops Center Home", "/admin/ops-center", "monitor"),
      nav("rides-live", "Live Rides", "/admin/rides/live", "satellite"),
      nav("multi-city", "Multi-City Operations", "/admin/multi-city", "globe", { featureFlag: "multi_city" }),
      nav("ai-ops", "AI Operations", "/admin/ai-operations", "cpu"),
    ],
  },
  {
    id: "drivers-fleet",
    module: navModule(GROUP_MODULE.drivers_fleet),
    label: "Drivers & Fleet",
    icon: "taxi",
    children: [
      nav("drivers", "Driver Management", "/admin/drivers", "user-check"),
      nav("approvals", "Driver Approvals", "/admin/approvals", "check-square"),
      nav("vehicles", "Vehicle Management", "/admin/vehicles", "car"),
      nav("fleet", "Fleet Management", "/admin/fleet", "truck", { featureFlag: "fleet_center" }),
      nav("driver-documents", "Driver Documents", "/admin/approvals?tab=drivers", "file"),
      nav("drivers-dashboard", "Performance Monitoring", "/admin/drivers/dashboard", "chart"),
      nav("academy", "Driver Academy", "/admin/academy", "graduation-cap"),
      nav("hall-of-fame", "Hall of Fame", "/admin/hall-of-fame", "award"),
    ],
  },
  {
    id: "riders",
    module: navModule(GROUP_MODULE.riders),
    label: "Riders",
    icon: "users",
    children: [
      nav("riders", "Rider Management", "/admin/riders", "users"),
      nav("rider-accounts", "Rider Accounts", "/admin/approvals?tab=riders", "user-check"),
      nav("rider-ride-history", "Ride History", "/admin/rides/reports", "route"),
      nav("rider-complaints", "Customer Complaints", "/admin/support?category=rider", "message"),
      nav("riders-dashboard", "Riders Dashboard", "/admin/riders/dashboard", "chart"),
    ],
  },
  {
    id: "delivery",
    module: navModule(GROUP_MODULE.delivery),
    label: "Yala Delivery",
    icon: "package",
    children: [
      nav("delivery-dashboard", "Delivery Management", "/admin/delivery", "package"),
      nav("delivery-couriers", "Courier Management", "/admin/delivery/couriers", "bike"),
      nav("delivery-directory", "Delivery Tracking", "/admin/delivery/directory", "map-pin"),
      nav("courier-approvals", "Courier Approvals", "/admin/approvals?tab=couriers", "check-square"),
      nav("delivery-cities", "City Analytics", "/admin/delivery/cities", "city"),
      nav("delivery-merchants", "Merchant Management", "/admin/delivery/merchants", "store"),
      nav("merchant-platform", "Merchant Platform", "/admin/merchant-platform", "handshake"),
    ],
  },
  {
    id: "employees",
    module: navModule(GROUP_MODULE.employees),
    label: "Employees & Human Resources",
    icon: "id-card",
    children: [
      nav("employees-directory", "Employee Management", "/admin/employees", "users"),
      nav("clock", "Clock In / Clock Out", "/admin/attendance", "clock"),
      nav("break-notifications", "Break Management", "/admin/break-notifications", "bell"),
      nav("verification", "Attendance", "/admin/verification", "clipboard"),
      nav("employee-cards", "Employee ID Cards", "/admin/employees?tab=directory", "id-card"),
      nav("leave", "Leave Management", "/admin/attendance?tab=leave", "files"),
      nav("hr", "HR Management", "/admin/hr", "briefcase"),
    ],
  },
  {
    id: "support",
    module: navModule(GROUP_MODULE.support),
    label: "Customer Support",
    icon: "headset",
    children: [
      nav("support-console", "Support Tickets", "/admin/support", "inbox"),
      nav("support-complaints", "Complaints", "/admin/support?queue=escalated", "alert"),
      nav("support-communication", "Customer Communication", "/admin/support?queue=waiting", "message"),
      nav("beta-feedback", "Beta Feedback", "/admin/beta-feedback", "inbox"),
      nav("beta", "Beta Program", "/admin/beta", "flask"),
    ],
  },
  {
    id: "finance",
    module: navModule(GROUP_MODULE.finance),
    label: "Finance",
    icon: "wallet",
    children: [
      nav("finance-revenue", "Revenue Analytics", "/admin/finance-ops?tab=revenue", "trending-up"),
      nav("payments", "Transactions", "/admin/payments", "credit-card"),
      nav("withdrawals", "Driver Payments", "/admin/withdrawals", "bank"),
      nav("financial-overview", "Commissions", "/admin/ops-center/finance", "pie"),
      nav("finance-accounting", "Accounting", "/admin/finance-ops?tab=accounting", "receipt"),
      nav("finance-ops", "Financial Reports", "/admin/finance-ops", "file"),
      nav("finance-audit", "Financial Audit", "/admin/finance-ops?tab=audit", "scroll"),
      nav("withdrawal-accounts", "Settlement Accounts", "/admin/withdrawal-accounts", "landmark"),
      nav("incentives", "Driver Incentives", "/admin/incentives", "gift"),
    ],
  },
  {
    id: "security",
    module: navModule(GROUP_MODULE.security),
    label: "Security & Compliance",
    icon: "shield",
    children: [
      nav("trust-safety", "Trust & Safety Center", "/admin/trust-safety", "shield-check"),
      nav("incidents", "Incident Management", "/admin/trust-safety?tab=incidents", "alert"),
      nav("emergency", "Emergency Alerts", "/admin/trust-safety?tab=emergency", "bell"),
      nav("driver-verification", "Driver Verification", "/admin/trust-safety?tab=drivers", "user-check"),
      nav("audit-logs", "Audit Logs", "/admin/security/audit", "list"),
      nav("security-ops", "Security Dashboard", "/admin/security", "lock"),
      nav("compliance", "Compliance", "/admin/compliance-governance", "scroll"),
    ],
  },
  {
    id: "growth",
    module: navModule(GROUP_MODULE.growth),
    label: "Growth & Analytics",
    icon: "trending-up",
    children: [
      nav("business-intelligence", "Business Intelligence", "/admin/business-intelligence", "brain"),
      nav("bi", "Performance Analytics", "/admin/bi", "database"),
      nav("growth", "Expansion Management", "/admin/growth", "globe"),
      nav("ceo-reports", "Reports", "/admin/ceo-reports", "bar-chart"),
      nav("customer-growth", "Customer Growth", "/admin/customer-growth", "sprout"),
    ],
  },
  {
    id: "platform",
    module: navModule(GROUP_MODULE.platform),
    label: "Platform Management",
    icon: "settings",
    children: [
      nav("status", "System Status", "/admin/status", "activity"),
      nav("roles", "Roles & Permissions", "/admin/roles", "key"),
      nav("launch", "Application Management", "/admin/launch", "rocket"),
      nav("api-gateway", "API Gateway", "/admin/api-gateway", "plug"),
      nav("command", "Launch Command", "/admin/command", "monitor"),
      nav("operations-command", "Operations Command", "/admin/operations-command", "activity"),
      nav("business", "Business Hub", "/admin/business", "building"),
      nav("business-accounts", "Business Accounts", "/admin/business-accounts", "briefcase"),
      nav("partner-platform", "Partner Platform", "/admin/partner-platform", "link"),
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

