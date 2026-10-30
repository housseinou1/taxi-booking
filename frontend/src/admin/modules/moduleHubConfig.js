/**
 * YALA Admin module hub configuration (Phase 1).
 *
 * Each entry powers a professional landing page for a navigation section and
 * links to the existing, already-working module pages. This deliberately does
 * NOT duplicate those modules — it gives each sidebar section a real, navigable
 * home and a consistent enterprise presentation.
 */

export const MODULE_HUBS = {
  rides: {
    module: "rides",
    title: "Rides Management",
    subtitle: "Taxi ride operations: live rides, completed trips, cancellations and reports.",
    links: [
      { label: "Live Operations", path: "/admin/operations", description: "Real-time ride and dispatch monitoring." },
      { label: "Ops Control Center", path: "/admin/operations", description: "Operational control and queues." },
      { label: "Ride Analytics", path: "/admin/business-intelligence", description: "Volume, completion and cancellation trends." },
      { label: "Dispatch Analytics", path: "/admin/bi", description: "Dispatch performance in the BI warehouse." },
      { label: "Safety & Incidents", path: "/admin/trust-safety", description: "Safety reports linked to rides." },
    ],
    endpoints: [
      { label: "Admin ride analytics", path: "/rides/analytics/admin/", note: "Ride volume and performance metrics." },
      { label: "Dispatch analytics", path: "/rides/analytics/admin/dispatch/", note: "Dispatch timing and acceptance." },
      { label: "Ride history", path: "/rides/history/", note: "Staff ride history feed." },
    ],
  },
  drivers: {
    module: "drivers",
    title: "Drivers Management",
    subtitle: "Driver applications, approvals, signatures, documents, earnings and performance.",
    links: [
      { label: "Driver Approvals", path: "/admin/approvals", description: "Review and approve driver applications." },
      { label: "Fleet Center", path: "/admin/fleet", description: "Fleet performance and vehicle oversight." },
      { label: "Driver Incentives", path: "/admin/incentives", description: "Incentive programmes and payouts." },
      { label: "Driver Academy", path: "/admin/academy", description: "Training and certification." },
      // Was "/admin/legacy" (not a registered route).
      { label: "Drivers Dashboard", path: "/admin/drivers/dashboard", description: "Live driver and fleet overview." },
    ],
    endpoints: [
      { label: "Driver list", path: "/drivers/list/", note: "Admin driver directory with totals and ratings." },
      { label: "Driver ride history", path: "/rides/admin/driver/<id>/history/", note: "Per-driver completed and cancelled rides." },
      { label: "Driver earnings", path: "/rides/admin/driver/<id>/earnings/", note: "Total, daily, weekly and monthly earnings." },
      { label: "Driver payouts", path: "/payments/admin/driver/<id>/payouts/", note: "Withdrawal requests for a driver." },
      { label: "Driver activity", path: "/auth/admin/driver/<id>/activity/", note: "Last login, last seen and device." },
    ],
  },
  riders: {
    module: "riders",
    title: "Riders Management",
    subtitle: "Rider accounts, verification, ride history, payments, activity and account management.",
    links: [
      // Was "/admin/legacy" (not a registered route).
      { label: "Riders Dashboard", path: "/admin/riders/dashboard", description: "Live rider overview and verification." },
      { label: "Customer Support", path: "/admin/support", description: "Rider support conversations and tickets." },
      { label: "Trust & Safety", path: "/admin/trust-safety", description: "Rider safety incidents and reports." },
      { label: "Customer Growth", path: "/admin/customer-growth", description: "Rider growth and retention analytics." },
    ],
    endpoints: [
      { label: "Users directory", path: "/auth/users/", note: "Rider accounts with verification status." },
      { label: "Rider ride history", path: "/rides/admin/rider/<id>/history/", note: "Per-rider ride history with summary." },
      { label: "Rider payments", path: "/payments/admin/rider/<id>/payments/", note: "Payment history and refunds." },
      { label: "Rider activity", path: "/auth/admin/rider/<id>/activity/", note: "Last login, last seen and device." },
    ],
  },
};

export const MODULE_HUBS_EXTRA = {
  delivery: {
    module: "delivery",
    title: "Yala Delivery",
    subtitle: "Delivery orders, couriers, merchants, dispatch, earnings and support.",
    links: [
      { label: "Courier Management", path: "/admin/delivery/couriers", description: "Courier directory, documents, earnings and account actions." },
      { label: "Merchant Directory", path: "/admin/delivery/merchants", description: "Read-only merchant list; merchant platform management lives in the Merchant Platform section." },
      { label: "Courier Approvals", path: "/admin/approvals", description: "Approve and manage courier applications." },
      { label: "Business Accounts", path: "/admin/business-accounts", description: "Business and corporate accounts." },
      { label: "Trust & Safety", path: "/admin/trust-safety", description: "Delivery incidents and disputes." },
    ],
    endpoints: [
      { label: "Delivery analytics", path: "/deliveries/admin/analytics/", note: "Delivery volume and performance." },
      { label: "Delivery disputes", path: "/deliveries/admin/disputes/", note: "Open and resolved disputes." },
      { label: "Courier directory", path: "/deliveries/admin/couriers/", note: "Courier directory with filters and summary." },
      { label: "Pending couriers", path: "/security/admin/couriers/", note: "Courier verification queue." },
      { label: "Chat cases", path: "/deliveries/admin/chat/cases/", note: "Delivery conversation cases." },
    ],
  },
  merchants: {
    module: "merchants",
    title: "Merchants & Stores",
    subtitle: "Merchant accounts, store approvals, documents, orders and performance.",
    links: [
      { label: "Merchant Platform", path: "/admin/merchant-platform", description: "Merchant platform operations." },
      { label: "Partner Platform", path: "/admin/partner-platform", description: "Partner accounts and settlements." },
      { label: "Business Hub", path: "/admin/business", description: "Business account management." },
    ],
    endpoints: [
      { label: "Pending merchants", path: "/security/admin/merchants/", note: "Merchant approval queue." },
      { label: "Business accounts", path: "/deliveries/admin/business-accounts/", note: "Delivery business accounts." },
    ],
  },
  employees: {
    module: "employees",
    title: "Employees & HR",
    subtitle: "Employee registration, ID cards, departments, roles, permissions and audit history.",
    links: [
      { label: "Employee Management", path: "/admin/employees", description: "Registration, profiles and ID cards." },
      { label: "Roles & Permissions", path: "/admin/roles", description: "Role mapping and access control." },
      { label: "Compliance", path: "/admin/compliance-governance", description: "Policy and compliance governance." },
    ],
    endpoints: [
      { label: "Employees", path: "/employees/", note: "Staff employee directory." },
      { label: "Current permissions", path: "/operations/admin/me/permissions/", note: "Resolved role, modules and feature flags." },
    ],
  },
  finance: {
    module: "finance",
    title: "Finance",
    subtitle: "Revenue, commissions, withdrawals, payouts, refunds and reconciliation.",
    links: [
      { label: "Finance Operations", path: "/admin/finance-ops", description: "Reconciliation and finance operations." },
      { label: "Withdrawals", path: "/admin/withdrawals", description: "Driver and courier withdrawal management." },
      { label: "Payments", path: "/admin/payments", description: "Payment records and refunds." },
      { label: "Business Accounts", path: "/admin/business-accounts", description: "Business and corporate accounts." },
      { label: "Incentives", path: "/admin/incentives", description: "Incentive and bonus payouts." },
    ],
    endpoints: [
      { label: "Finance dashboard", path: "/operations/business/finance/operations/", note: "Finance KPIs and queues." },
      { label: "Withdrawal queue", path: "/payments/withdrawals/", note: "Driver withdrawal requests." },
      { label: "Refund queue", path: "/payments/admin/refunds/", note: "Pending refund approvals." },
    ],
  },
  security: {
    module: "security",
    title: "Security",
    subtitle: "Audit logs, fraud alerts, administrative activity and account actions.",
    links: [
      { label: "Trust & Safety", path: "/admin/trust-safety", description: "Safety incidents and fraud review." },
      { label: "Compliance", path: "/admin/compliance-governance", description: "Compliance audits and policies." },
      { label: "System Health", path: "/admin/status", description: "Platform availability and status." },
    ],
    endpoints: [
      { label: "Audit logs", path: "/security/admin/audit-logs/", note: "Administrative audit trail." },
      { label: "Fraud flags", path: "/security/admin/fraud-flags/", note: "Fraud alerts awaiting review." },
    ],
  },
  withdrawals: {
    module: "finance",
    title: "Withdrawals",
    subtitle: "Driver and courier withdrawal requests, approvals, payouts and history.",
    links: [
      { label: "Finance Operations", path: "/admin/finance-ops", description: "Reconciliation and finance operations." },
      { label: "Payments", path: "/admin/payments", description: "Payment records and refunds." },
      { label: "Audit trail", path: "/admin/security", description: "Administrative action history." },
    ],
    endpoints: [
      { label: "Withdrawal queue", path: "/payments/admin/withdrawals/", note: "Read-only queue with filters and summary." },
      { label: "Finance overview", path: "/payments/admin/finance/overview/", note: "Read-only KPIs and stored wallet totals." },
      { label: "Platform payout accounts", path: "/payments/withdrawal-accounts/", note: "Configured payout destinations." },
    ],
  },
  roles: {
    module: "employees",
    title: "Roles & Permissions",
    subtitle: "Role mapping, module access and administrative permissions.",
    links: [
      { label: "Employees & HR", path: "/admin/employees", description: "Employee directory and ID cards." },
      { label: "Security", path: "/admin/security", description: "Audit trail of administrative actions." },
    ],
    endpoints: [
      { label: "Current permissions", path: "/operations/admin/me/permissions/", note: "Resolved role, modules and feature flags." },
      { label: "Audit logs", path: "/security/admin/audit-logs/", note: "Administrative audit trail." },
    ],
  },
};

export function getModuleHub(key) {
  return MODULE_HUBS[key] || MODULE_HUBS_EXTRA[key] || null;
}
