import React from "react";

import MetricCard from "../components/shared/MetricCard";
import { usePermissions } from "../permissions/PermissionContext";

const ROLE_COPY = {
  ceo: {
    title: "CEO Command Home",
    blurb: "Executive command center with live KPIs, map, alerts, and approvals.",
    links: [
      { href: "/admin/ceo-master", label: "CEO Master (legacy)" },
      { href: "/admin/ops-control", label: "Operations Center" },
      { href: "/admin/finance-ops", label: "Finance Ops" },
    ],
  },
  ops: {
    title: "Operations Home",
    blurb: "Live Operations Control Center with dispatch, map, incidents, and shift handover.",
    links: [
      { href: "/admin/ops-control", label: "Operations Control Center (legacy modules)" },
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
      { href: "/admin/finance-ops", label: "Finance Operations (legacy)" },
      { href: "/admin/payments", label: "Payments Admin" },
    ],
  },
  driver_ops: {
    title: "Driver Operations Home",
    blurb: "Approvals, documents, performance, and compliance.",
    links: [
      { href: "/admin/fleet", label: "Fleet Center" },
      { href: "/admin/legacy", label: "Driver Verification (legacy hub)" },
    ],
  },
  marketing: {
    title: "Marketing Home",
    blurb: "Campaigns, promos, and growth.",
    links: [
      { href: "/admin/launch-growth", label: "Launch Growth Center" },
      { href: "/admin/customer-growth", label: "Customer Growth" },
    ],
  },
  analytics: {
    title: "Analytics Home",
    blurb: "BI warehouse and growth intelligence.",
    links: [
      { href: "/admin/bi", label: "BI Analytics" },
      { href: "/admin/bi-growth", label: "BI Growth Center" },
    ],
  },
  system_admin: {
    title: "System Admin Home",
    blurb: "Platform health, security, audit, settings, backups, and disaster recovery.",
    links: [
      { href: "/admin/home/system", label: "System Administration Console" },
      { href: "/admin/status", label: "Production Status (legacy)" },
      { href: "/admin/api-gateway", label: "API Gateway" },
    ],
  },
  staff: {
    title: "Staff Home",
    blurb: "Default workspace for staff without a mapped role group.",
    links: [{ href: "/admin/ops-control", label: "Operations Center" }],
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
