/**
 * YALA TECHNOLOGIES — ENTERPRISE TOP NAVIGATION
 *
 * Single source for the horizontal primary nav. Each `path` is registered in
 * App.js and gated by `module` + optional `featureFlag` via `itemAllowed` from
 * `sidebarNavConfig.js` (same RBAC rules as the legacy sidebar).
 */
import { itemAllowed } from "./sidebarNavConfig";
import { idCardAdminUiEnabled } from "../../../config/backendFeatureGates";

export const TOP_NAV_GROUPS = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: "layout",
    children: [
      { id: "dash-exec", module: "home", label: "Executive Overview", path: "/admin", icon: "chart" },
      { id: "dash-live", module: "ops", label: "Live Operations", path: "/admin/ops-center/live", icon: "map-pin" },
      {
        id: "dash-nationwide",
        module: "ops",
        label: "Nationwide Operations",
        path: "/admin/multi-city",
        icon: "layers",
        featureFlag: "multi_city",
      },
      { id: "dash-regional", module: "analytics", label: "Regional Performance", path: "/admin/business-intelligence", icon: "bar" },
      { id: "dash-city-perf", module: "ceo", label: "City Performance", path: "/admin/cities", icon: "pin" },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    icon: "activity",
    children: [
      { id: "ops-rides", module: "rides", label: "Ride Management", path: "/admin/rides", icon: "car" },
      { id: "ops-dispatch", module: "ops", label: "Dispatch", path: "/admin/operations-control", icon: "radio" },
      { id: "ops-bookings", module: "ops", label: "Bookings", path: "/admin/ops-center", icon: "layers" },
      { id: "ops-trips", module: "rides", label: "Trip Monitoring", path: "/admin/rides/live", icon: "eye" },
      { id: "ops-cities", module: "ceo", label: "Cities Management", path: "/admin/cities", icon: "pin" },
      { id: "ops-zones", module: "ops", label: "Operating Zones", path: "/admin/smart-pricing", icon: "gear" },
      {
        id: "ops-transfers",
        module: "ceo",
        label: "City Transfer Requests",
        path: "/admin/administration/city-transfers",
        icon: "activity",
      },
    ],
  },
  {
    id: "drivers",
    label: "Drivers",
    icon: "users",
    children: [
      { id: "drv-mgmt", module: "drivers", label: "Driver Management", path: "/admin/drivers", icon: "user-check" },
      { id: "drv-by-city", module: "drivers", label: "Drivers by City", path: "/admin/fleet", icon: "users", featureFlag: "fleet_center" },
      { id: "drv-apps", module: "drivers", label: "Applications & Approvals", path: "/admin/approvals", icon: "file-plus" },
      { id: "drv-docs", module: "drivers", label: "Documents", path: "/admin/driver-documents", icon: "folder" },
    ],
  },
  {
    id: "customers",
    label: "Customers",
    icon: "user-circle",
    children: [
      { id: "cust-riders", module: "riders", label: "Rider Management", path: "/admin/riders", icon: "users" },
      { id: "cust-profiles", module: "riders", label: "Customer Profiles", path: "/admin/riders/dashboard", icon: "id" },
      { id: "cust-complaints", module: "support", label: "Complaints", path: "/admin/support", icon: "message" },
    ],
  },
  {
    id: "delivery",
    label: "Delivery",
    icon: "package",
    children: [
      { id: "del-couriers", module: "delivery", label: "Couriers", path: "/admin/delivery/couriers", icon: "truck" },
      { id: "del-couriers-city", module: "delivery", label: "Couriers by City", path: "/admin/delivery/cities", icon: "pin" },
      { id: "del-merchants", module: "delivery", label: "Merchants", path: "/admin/delivery/merchants", icon: "store" },
      { id: "del-orders", module: "delivery", label: "Delivery Orders", path: "/admin/delivery/directory", icon: "list" },
      { id: "del-track", module: "delivery", label: "Tracking", path: "/admin/delivery", icon: "map" },
    ],
  },
  {
    id: "fleet",
    label: "Fleet",
    icon: "truck",
    children: [
      { id: "flt-vehicles", module: "drivers", label: "Vehicle Management", path: "/admin/vehicles", icon: "gauge" },
      { id: "flt-overview", module: "drivers", label: "Fleet Overview", path: "/admin/fleet", icon: "pie", featureFlag: "fleet_center" },
      { id: "flt-assign", module: "drivers", label: "Assignments", path: "/admin/drivers", icon: "link" },
      { id: "flt-maint", module: "drivers", label: "Maintenance", path: "/admin/fleet", icon: "wrench", featureFlag: "fleet_center" },
    ],
  },
  {
    id: "finance",
    label: "Finance",
    icon: "credit-card",
    children: [
      { id: "fin-revenue", module: "finance", label: "Revenue", path: "/admin/ops-center/finance", icon: "trend-up" },
      { id: "fin-tx", module: "finance", label: "Transactions", path: "/admin/finance-ops", icon: "repeat" },
      { id: "fin-payments", module: "finance", label: "Payments", path: "/admin/payments", icon: "banknote" },
      { id: "fin-wallets", module: "finance", label: "Wallets", path: "/admin/finance-ops", icon: "wallet" },
      { id: "fin-accounting", module: "business", label: "Accounting", path: "/admin/business-accounts", icon: "scale" },
    ],
  },
  {
    id: "hr",
    label: "Employees & HR",
    icon: "briefcase",
    children: [
      {
        id: "hr-dash",
        module: "employees",
        label: "Employee Dashboard",
        path: "/admin/employees?view=dashboard",
        icon: "chart",
      },
      {
        id: "hr-register",
        module: "employees",
        label: "Employee Registration",
        path: "/admin/employees?view=register",
        icon: "user-plus",
      },
      {
        id: "hr-directory",
        module: "employees",
        label: "Employee Directory",
        path: "/admin/employees?view=directory",
        icon: "users",
      },
      {
        id: "hr-id-cards",
        module: "employees",
        label: "Employee ID Cards",
        path: "/admin/employees/id-cards",
        icon: "badge",
      },
      {
        id: "hr-verify",
        module: "employees",
        label: "Employee Verification",
        path: "/admin/verification",
        icon: "shield",
      },
      { id: "hr-attendance", module: "employees", label: "Employee Attendance", path: "/admin/attendance", icon: "clock" },
      { id: "hr-clock", module: "employees", label: "Clock In / Clock Out", path: "/admin/attendance", icon: "log-in" },
      { id: "hr-reports", module: "employees", label: "Employee Reports", path: "/admin/hr", icon: "file-text" },
      { id: "hr-breaks", module: "employees", label: "Breaks", path: "/admin/break-notifications", icon: "coffee" },
    ],
  },
  {
    id: "safety",
    label: "Safety",
    icon: "shield",
    children: [
      { id: "safe-trust", module: "trust_safety", label: "Trust & Safety", path: "/admin/trust-safety", icon: "shield-alert" },
      { id: "safe-incidents", module: "trust_safety", label: "Incidents", path: "/admin/safety", icon: "alert-triangle" },
      { id: "safe-emergency", module: "launch", label: "Emergency Management", path: "/admin/ops-center/command", icon: "siren" },
      { id: "safe-audit", module: "security", label: "Audit Logs", path: "/admin/security/audit", icon: "scroll" },
    ],
  },
  {
    id: "reports",
    label: "Reports",
    icon: "bar-chart",
    children: [
      { id: "rep-nationwide", module: "analytics", label: "Nationwide Reports", path: "/admin/business-intelligence", icon: "layers" },
      { id: "rep-analytics", module: "analytics", label: "Analytics", path: "/admin/bi", icon: "brain" },
      { id: "rep-fin", module: "ceo", label: "Financial Reports", path: "/admin/board-reports", icon: "file-text" },
      { id: "rep-ops", module: "rides", label: "Operational Reports", path: "/admin/rides/reports", icon: "clipboard" },
    ],
  },
  {
    id: "administration",
    label: "Administration",
    icon: "shield",
    children: [
      { id: "adm-approvals", module: "drivers", label: "CEO Approvals", path: "/admin/approvals", icon: "check" },
      {
        id: "adm-city-transfers",
        module: "ceo",
        label: "City Transfer Approvals",
        path: "/admin/administration/city-transfers",
        icon: "activity",
      },
      { id: "adm-roles", module: "employees", label: "Roles & Permissions", path: "/admin/roles", icon: "key" },
      { id: "adm-platform", module: "system", label: "Platform Settings", path: "/admin/status", icon: "sliders" },
      { id: "adm-areas", module: "ops", label: "Operating Area Configuration", path: "/admin/smart-pricing", icon: "gear" },
    ],
  },
  {
    id: "settings",
    label: "Settings",
    icon: "settings",
    children: [
      { id: "set-platform", module: "system", label: "Platform Configuration", path: "/admin/status", icon: "sliders" },
      { id: "set-roles", module: "employees", label: "Roles & Permissions", path: "/admin/roles", icon: "key" },
      { id: "set-pricing", module: "ops", label: "Pricing & Dispatch", path: "/admin/pricing-dispatch", icon: "percent" },
      { id: "set-system", module: "system", label: "System Settings", path: "/admin/api-gateway", icon: "cpu" },
    ],
  },
];

/**
 * Top-level groups the signed-in role may see (at least one visible child).
 */
export function filterTopNavItems(permissions) {
  return TOP_NAV_GROUPS.map((group) => {
    const children = (group.children || []).filter((child) => {
      if (child.id === "hr-id-cards" && !idCardAdminUiEnabled()) return false;
      return itemAllowed(child, permissions);
    });
    if (!children.length) return null;
    return { ...group, children };
  }).filter(Boolean);
}
