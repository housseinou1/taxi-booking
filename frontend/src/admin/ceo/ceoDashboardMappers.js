import { formatTimestamp } from "../components/library/utils/formatters";

const SEVERITY_TONE = {
  critical: "danger",
  high: "danger",
  medium: "warning",
  low: "info",
};

export function buildExecutiveAlerts({ master, health, mapData }) {
  const alerts = [];
  const overview = master?.executive_overview || {};
  const ops = master?.operations || {};
  const fleet = master?.fleet || {};
  const ai = master?.ai_insights || {};
  const finance = master?.financial_overview || {};

  const push = (alert) => {
    alerts.push({
      id: alert.id || `${alert.type}-${alert.timestamp}`,
      severity: alert.severity || "medium",
      tone: SEVERITY_TONE[alert.severity] || "warning",
      title: alert.title,
      timestamp: alert.timestamp || master?.generated_at,
      owner: alert.owner || "Operations",
      status: alert.status || "open",
      actionHref: alert.actionHref,
      actionLabel: alert.actionLabel || "View",
    });
  };

  if (health && health.status && health.status !== "ok") {
    push({
      id: "health-degraded",
      severity: "critical",
      type: "system_outage",
      title: `Platform health: ${health.status}`,
      owner: "System Admin",
      actionHref: "/admin/status",
    });
  }

  if (ops.emergency_cases > 0) {
    push({
      id: "emergency-cases",
      severity: "critical",
      type: "incident",
      title: `${ops.emergency_cases} emergency case(s) open`,
      owner: "Trust & Safety",
      actionHref: "/admin/trust-safety",
    });
  }

  if (ops.open_incidents > 0) {
    push({
      id: "open-incidents",
      severity: "high",
      type: "incident",
      title: `${ops.open_incidents} safety incident(s) open`,
      owner: "Trust & Safety",
      actionHref: "/admin/trust-safety",
    });
  }

  if ((overview.cancellation_rate_pct || 0) >= 15) {
    push({
      id: "high-cancel-rate",
      severity: "high",
      type: "cancellation",
      title: `Cancellation rate ${overview.cancellation_rate_pct}%`,
      owner: "Operations",
      actionHref: "/admin/ops-control",
    });
  }

  const waiting = fleet?.supply_demand?.waiting_riders || 0;
  const density = fleet?.supply_demand?.driver_density || 0;
  if (waiting > 5 && density < waiting) {
    push({
      id: "low-driver-availability",
      severity: "high",
      type: "supply",
      title: "Low driver availability vs demand",
      owner: "Operations",
      actionHref: "/admin/fleet",
    });
  }

  if ((overview.failed_payments_today || 0) > 0) {
    push({
      id: "payment-failures",
      severity: "medium",
      type: "payment",
      title: `${overview.failed_payments_today} payment failure(s) today`,
      owner: "Finance",
      actionHref: "/admin/finance-ops",
    });
  }

  if ((finance.outstanding_refunds?.count || 0) > 0) {
    push({
      id: "outstanding-refunds",
      severity: "medium",
      type: "payment",
      title: `${finance.outstanding_refunds.count} outstanding refund(s)`,
      owner: "Finance",
      actionHref: "/admin/finance-ops",
    });
  }

  if ((ops.driver_expired_documents || 0) > 0) {
    push({
      id: "expired-docs",
      severity: "medium",
      type: "compliance",
      title: `${ops.driver_expired_documents} expired driver document(s)`,
      owner: "Driver Ops",
      actionHref: "/admin/fleet",
    });
  }

  (ai.fraud_alerts || []).forEach((item, index) => {
    push({
      id: `fraud-${index}`,
      severity: item.severity || "high",
      type: "security",
      title: item.title || item.message || "Fraud alert",
      owner: "Security",
      actionHref: "/admin/trust-safety",
    });
  });

  if (ai.biggest_operational_issue) {
    const issue = ai.biggest_operational_issue;
    push({
      id: "ai-top-issue",
      severity: issue.severity || "high",
      type: "ops",
      title: issue.title || issue.message || "Operational issue detected",
      owner: "Operations",
      actionHref: "/admin/ops-control",
    });
  }

  return alerts.sort((a, b) => {
    const rank = { critical: 0, high: 1, medium: 2, low: 3 };
    return (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9);
  });
}

export function buildActivityFeed({ master, withdrawals = [] }) {
  const items = [];
  const ops = master?.operations || {};
  const approvals = ops.approval_queues || {};

  (ops.recent_rides || []).slice(0, 5).forEach((ride) => {
    items.push({
      id: `ride-${ride.id}`,
      title: `Ride #${ride.id} ${ride.status || "updated"}`,
      description: ride.rider_name || ride.pickup || "Trip activity",
      timestamp: ride.created_at || ride.updated_at || master?.generated_at,
      type: "ride",
    });
  });

  (approvals.pending_merchants || []).slice(0, 3).forEach((merchant) => {
    items.push({
      id: `merchant-${merchant.id}`,
      title: "Merchant pending approval",
      description: merchant.business_name || merchant.email,
      timestamp: master?.generated_at,
      type: "merchant",
    });
  });

  withdrawals.slice(0, 5).forEach((row) => {
    items.push({
      id: `withdrawal-${row.id}`,
      title: "Large payout pending",
      description: `#${row.id} · ${row.amount} MRU`,
      timestamp: row.created_at || master?.generated_at,
      type: "payout",
    });
  });

  if ((ops.emergency_cases || 0) > 0) {
    items.push({
      id: "critical-incident",
      title: "Critical incident queue active",
      description: `${ops.emergency_cases} emergency case(s)`,
      timestamp: master?.generated_at,
      type: "incident",
    });
  }

  return items.slice(0, 12);
}

function parseMetricNumber(value) {
  return Number(String(value ?? 0).replace(/[^\d.-]/g, "")) || 0;
}

function percentDelta(current, previous) {
  const currentValue = parseMetricNumber(current);
  const previousValue = parseMetricNumber(previous);
  if (!previousValue) return null;
  return Math.round(((currentValue - previousValue) / previousValue) * 1000) / 10;
}

function revenueTrends(chart = []) {
  if (!chart.length) return { day: null, week: null };
  const values = chart.map((row) => parseMetricNumber(row.gross_revenue ?? row.revenue));
  const day =
    values.length >= 2 ? percentDelta(values[values.length - 1], values[values.length - 2]) : null;
  const last7 = values.slice(-7).reduce((sum, value) => sum + value, 0);
  const prev7 = values.slice(-14, -7).reduce((sum, value) => sum + value, 0);
  const week = prev7 ? percentDelta(last7, prev7) : null;
  return { day, week };
}

export function buildKpiDefinitions({ master, financeSummary, analytics }) {
  const o = master?.executive_overview || {};
  const f = master?.financial_overview || {};
  const fleet = master?.fleet || {};
  const rideCounts = master?.operations?.ride_status_counts || {};
  const completionRate = Math.max(0, 100 - (Number(o.cancellation_rate_pct) || 0));
  const grossBookings =
    financeSummary?.gross_revenue ||
    f.summary?.daily?.gross_revenue ||
    o.total_revenue_today;
  const revenueTrend = revenueTrends(analytics?.revenue_by_day || []);
  const cancelTrend = fleet.cancellation_trend || {};
  const cancelDelta =
    cancelTrend.previous_pct != null
      ? percentDelta(cancelTrend.current_pct, cancelTrend.previous_pct)
      : null;

  return [
    {
      id: "revenue_today",
      label: "Revenue Today",
      value: o.total_revenue_today,
      format: "currency",
      href: "/admin/finance-ops",
      tone: "success",
      changePercent: revenueTrend.day,
      periodLabel: "vs yesterday",
      weekChangePercent: revenueTrend.week,
    },
    {
      id: "revenue_week",
      label: "Revenue This Week",
      value: o.total_revenue_week || f.summary?.weekly?.gross_revenue,
      format: "currency",
      href: "/admin/finance-ops",
      changePercent: revenueTrend.week,
      periodLabel: "vs prior week",
    },
    {
      id: "revenue_month",
      label: "Revenue This Month",
      value: o.total_revenue_month || f.summary?.monthly?.gross_revenue,
      format: "currency",
      href: "/admin/finance-ops",
    },
    {
      id: "gross_bookings",
      label: "Gross Bookings",
      value: grossBookings,
      format: "currency",
      href: "/admin/finance-ops",
    },
    {
      id: "active_riders",
      label: "Active Riders",
      value: o.active_riders,
      href: "/admin/customer-growth",
    },
    {
      id: "active_drivers",
      label: "Active Drivers",
      value: o.active_drivers,
      href: "/admin/fleet",
    },
    {
      id: "drivers_online",
      label: "Drivers Online",
      value: o.drivers_online ?? master?.fleet?.drivers_online,
      tone: "success",
      href: "/admin/fleet",
    },
    {
      id: "active_deliveries",
      label: "Active Deliveries",
      value: o.active_deliveries,
      href: "/admin/ops-control",
    },
    {
      id: "ride_requests",
      label: "Ride Requests Today",
      value: rideCounts.requested ?? rideCounts.matching ?? "—",
      href: "/admin/ops-control",
    },
    {
      id: "completed_rides",
      label: "Completed Rides",
      value: o.completed_rides_today,
      href: "/admin/ops-control",
    },
    {
      id: "completion_rate",
      label: "Ride Completion Rate",
      value: completionRate,
      format: "percent",
      tone: completionRate >= 90 ? "success" : completionRate >= 75 ? "warning" : "danger",
      href: "/admin/ops-control",
    },
    {
      id: "cancellation_rate",
      label: "Cancellation Rate",
      value: o.cancellation_rate_pct,
      format: "percent",
      tone: (o.cancellation_rate_pct || 0) <= 10 ? "success" : "danger",
      href: "/admin/ops-control",
      changePercent: cancelDelta,
      periodLabel: "vs prior period",
    },
  ];
}

export function mapChartSeries(list, valueKey = "revenue", labelKey = "label") {
  return (list || []).map((row) => ({
    label: row[labelKey] || row.hour || row.date,
    value: Number(String(row[valueKey] ?? row.count ?? 0).replace(/[^\d.-]/g, "")) || 0,
  }));
}

export function formatExportSummaryRows(kpis) {
  return kpis.map((kpi) => ({
    metric: kpi.label,
    value: kpi.value ?? "—",
  }));
}

export { formatTimestamp };
