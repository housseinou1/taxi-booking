import React from "react";

import MetricCard from "../components/shared/MetricCard";
import { usePermissions } from "../permissions/PermissionContext";

const ROLE_COPY = {
  ceo: {
    title: "CEO Command Home",
    blurb: "Executive command center with live KPIs, map, alerts, and approvals.",
    links: [
      { href: "/admin/ceo-master", label: "CEO Master Command Center" },
      { href: "/admin/operations", label: "Operations Center" },
      { href: "/admin/finance-ops", label: "Finance Ops" },
    ],
  },
  ops: {
    title: "Operations Home",
    blurb: "Live Operations Control Center with dispatch, map, incidents, and shift handover.",
    links: [
      { href: "/admin/operations", label: "Operations Center" },
      { href: "/admin/fleet", label: "Fleet Performance" },
      { href: "/admin/launch", label: "Launch Hub" },
    ],
  },
  support: {
    title: "Support Home",
    blurb: "Customer support queue and lookups.",
    links: [
      { href: "/admin/support", label: "Support Console" },
      { href: "/admin/trust-safety", label: "Trust & Safety" },
    ],
  },
  finance: {
    title: "Finance Home",
    blurb: "Finance dashboard with KPIs, refunds, payouts, and reports.",
    links: [
      { href: "/admin/finance-ops", label: "Finance Operations" },
      { href: "/admin/payments", label: "Payments Admin" },
    ],
  },
  driver_ops: {
    title: "Driver Operations Home",
    blurb: "Approvals, documents, performance, and compliance.",
    links: [
      { href: "/admin/fleet", label: "Fleet Center" },
      // Was "/admin/legacy", which is not a registered route (it rendered the
      // public landing page). Driver verification is performed in Approvals.
      { href: "/admin/approvals", label: "Driver Approvals & Verification" },
    ],
  },
  marketing: {
    title: "Marketing Home",
    blurb: "Campaigns, promos, and growth.",
    links: [
      // Was "/admin/launch-growth", which is not a registered route.
      { href: "/admin/growth", label: "Growth Expansion" },
      { href: "/admin/customer-growth", label: "Customer Growth" },
    ],
  },
  analytics: {
    title: "Analytics Home",
    blurb: "BI warehouse and growth intelligence.",
    links: [
      { href: "/admin/bi", label: "BI Analytics" },
      // Was "/admin/bi-growth", which is not a registered route.
      { href: "/admin/business-intelligence", label: "BI Growth Center" },
    ],
  },
  system_admin: {
    title: "System Admin Home",
    blurb: "Platform health, security, audit, settings, backups, and disaster recovery.",
    links: [
      // Was "/admin/home/system", which is not a registered route.
      { href: "/admin/security", label: "Security Operations" },
      { href: "/admin/status", label: "Production Status" },
      { href: "/admin/api-gateway", label: "API Gateway" },
    ],
  },
  staff: {
    title: "Staff Home",
    blurb: "Default workspace for staff without a mapped role group.",
    links: [{ href: "/admin/operations", label: "Operations Center" }],
  },
};

export default function RoleHomeDashboard({ roleOverride }) {
  const { permissions } = usePermissions();
  const role = roleOverride || permissions?.role || "staff";
  const copy = ROLE_COPY[role] || ROLE_COPY.staff;

  return (
    <div className="admin-home">
      <p>{copy.blurb}</p>
      <div className="admin-home__cards">
        <MetricCard label="Role" value={permissions?.role_label || role} />
        <MetricCard label="Modules" value={String(permissions?.modules?.length || 0)} />
        <MetricCard label="City filter" value={permissions ? "Ready" : "—"} tone="success" />
        <MetricCard label="Shell" value="v1 Sprint 1" />
      </div>
      <div className="admin-home__links">
        {copy.links.map((link) => (
          <a key={link.href} className="admin-home__link" href={link.href}>
            {link.label}
          </a>
        ))}
      </div>
    </div>
  );
}
