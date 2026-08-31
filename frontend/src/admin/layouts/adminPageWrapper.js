import React from "react";

import CeoCommandCenter from "../ceo/CeoCommandCenter";
import FinanceDashboard from "../finance/FinanceDashboard";
import OpsManagerDashboard from "../operations/OpsManagerDashboard";
import DriverOpsDashboard from "../operations/DriverOpsDashboard";
import SupportCenter from "../support/SupportCenter";
import MarketingCenter from "../marketing/MarketingCenter";
import AnalyticsCenter from "../analytics/AnalyticsCenter";
import SystemAdminDashboard from "../system/SystemAdminDashboard";
import RoleHomeDashboard from "../home/RoleHomeDashboard";
import { AdminShellPage, isAdminShellEnabled } from "./AdminShell";

/** Role home routes — mirrors backend HOME_ROUTES */
export const ADMIN_HOME_ROUTE_CONFIG = [
  { page: "admin-home-ceo", path: "/admin/home/ceo", role: "ceo", title: "CEO Home" },
  { page: "admin-home-ops", path: "/admin/home/ops", role: "ops", title: "Operations Home" },
  { page: "admin-home-support", path: "/admin/home/support", role: "support", title: "Support Home" },
  { page: "admin-home-finance", path: "/admin/home/finance", role: "finance", title: "Finance Home" },
  { page: "admin-home-drivers", path: "/admin/home/drivers", role: "driver_ops", title: "Driver Ops Home" },
  { page: "admin-home-marketing", path: "/admin/home/marketing", role: "marketing", title: "Marketing Home" },
  { page: "admin-home-analytics", path: "/admin/home/analytics", role: "analytics", title: "Analytics Home" },
  { page: "admin-home-system", path: "/admin/home/system", role: "system_admin", title: "System Admin Home" },
];

export function wrapAdminModule(pathname, title, children) {
  if (!isAdminShellEnabled()) {
    return children;
  }
  return (
    <AdminShellPage pathname={pathname} title={title}>
      <div className="admin-shell__legacy-module">{children}</div>
    </AdminShellPage>
  );
}

export function renderAdminHomePage(pathname, role, title) {
  let content = <RoleHomeDashboard roleOverride={role} />;
  if (role === "ceo") content = <CeoCommandCenter />;
  if (role === "ops") content = <OpsManagerDashboard />;
  if (role === "finance") content = <FinanceDashboard />;
  if (role === "driver_ops") content = <DriverOpsDashboard />;
  if (role === "support") content = <SupportCenter />;
  if (role === "marketing") content = <MarketingCenter />;
  if (role === "analytics") content = <AnalyticsCenter />;
  if (role === "system_admin") content = <SystemAdminDashboard />;
  return (
    <AdminShellPage pathname={pathname} title={title}>
      {content}
    </AdminShellPage>
  );
}
