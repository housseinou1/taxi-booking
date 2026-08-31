import React from "react";

const LABELS = {
  admin: "Admin",
  home: "Home",
  ceo: "CEO",
  ops: "Operations",
  support: "Support",
  finance: "Finance",
  drivers: "Driver Ops",
  marketing: "Marketing",
  analytics: "Analytics",
  system: "System",
  "ceo-master": "CEO Command",
  "ops-control": "Operations Center",
  "operations-control": "Operations Center",
  operations: "Operations Center",
  "finance-ops": "Finance Ops",
  payments: "Payments",
  fleet: "Fleet",
  "launch-growth": "Marketing",
  bi: "Analytics",
  "bi-growth": "Growth Intelligence",
  status: "System Health",
  "trust-safety": "Trust & Safety",
  launch: "Launch Hub",
  business: "Business",
  "business-accounts": "Corporate Accounts",
  unauthorized: "Access Denied",
};

export function buildBreadcrumbs(pathname) {
  const parts = (pathname || "/admin").split("/").filter(Boolean);
  if (parts[0] !== "admin") {
    return [{ label: "Admin", path: "/admin" }];
  }
  const crumbs = [{ label: "Admin", path: "/admin" }];
  let acc = "";
  for (let i = 1; i < parts.length; i += 1) {
    const segment = parts[i];
    acc += `/${segment}`;
    const path = `/admin${acc}`;
    const label =
      LABELS[segment] || segment.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    crumbs.push({ label, path });
  }
  return crumbs;
}

export default function AdminBreadcrumbs({ items = [] }) {
  if (!items.length) return null;

  return (
    <nav className="admin-shell__breadcrumbs" aria-label="Breadcrumb">
      <ol>
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={item.path || item.label}>
              {isLast ? (
                <span aria-current="page">{item.label}</span>
              ) : (
                <a href={item.path}>{item.label}</a>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
