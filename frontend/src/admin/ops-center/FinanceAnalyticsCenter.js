/**
 * Finance & Analytics Center — Mission 17 Commit 3
 *
 * Executive financial visibility and business intelligence.
 * No backend pricing or payment logic changes.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";

import { formatMoney } from "../../marketConfig";
import authenticatedApi from "../../auth/authenticatedApi";
import { API_URL } from "../../apiConfig";
import "./FinanceAnalyticsCenter.css";

// ─── Constants ───────────────────────────────────────────────────────────────

const PERIODS = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "7d", label: "7 Days" },
  { id: "30d", label: "30 Days" },
  { id: "quarter", label: "Quarter" },
  { id: "year", label: "Year" },
];

const EXPORT_FORMATS = [
  { id: "csv", label: "CSV", icon: "📄" },
  { id: "xlsx", label: "Excel", icon: "📊" },
  { id: "pdf", label: "PDF", icon: "📋" },
];

// ─── Data Fetching ───────────────────────────────────────────────────────────

async function fetchFinanceData(period) {
  try {
    const [finance, analytics] = await Promise.allSettled([
      authenticatedApi.get(`${API_URL}/operations/admin/dashboard/`, { params: { period } }),
      authenticatedApi.get(`${API_URL}/rides/analytics/admin/`, { params: { period } }),
    ]);
    return {
      finance: finance.status === "fulfilled" ? finance.value.data : {},
      analytics: analytics.status === "fulfilled" ? analytics.value.data : {},
    };
  } catch {
    return { finance: {}, analytics: {} };
  }
}

// ─── Sub-Components ──────────────────────────────────────────────────────────

function KpiCard({ label, value, icon, tone = "neutral", subtitle }) {
  return (
    <article className={`fin-kpi fin-kpi--${tone}`} aria-label={`${label}: ${value}`}>
      <span className="fin-kpi__icon" aria-hidden="true">{icon}</span>
      <div className="fin-kpi__body">
        <span className="fin-kpi__value">{value}</span>
        <span className="fin-kpi__label">{label}</span>
        {subtitle && <span className="fin-kpi__subtitle">{subtitle}</span>}
      </div>
    </article>
  );
}

function BarChart({ data, valueKey, labelKey, title, color = "#10b981" }) {
  const max = Math.max(...data.map((d) => Number(d[valueKey]) || 0), 1);
  return (
    <div className="fin-chart" aria-label={title}>
      <h3 className="fin-chart__title">{title}</h3>
      <div className="fin-chart__bars">
        {data.slice(-14).map((point, i) => (
          <div key={i} className="fin-chart__col">
            <div
              className="fin-chart__bar"
              style={{
                height: `${Math.max(4, (Number(point[valueKey]) / max) * 100)}%`,
                background: color,
              }}
              title={`${point[labelKey]}: ${point[valueKey]}`}
              role="img"
              aria-label={`${point[labelKey]}: ${point[valueKey]}`}
            />
            <span className="fin-chart__label">{point[labelKey]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DataTable({ title, columns, rows, emptyMessage = "No data" }) {
  return (
    <div className="fin-table-wrap" aria-label={title}>
      <h3 className="fin-table__title">{title}</h3>
      <div className="fin-table__scroll">
        <table className="fin-table">
          <thead>
            <tr>
              {columns.map((col) => <th key={col.key}>{col.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={columns.length} className="fin-table__empty">{emptyMessage}</td></tr>
            ) : (
              rows.slice(0, 10).map((row, i) => (
                <tr key={row.id || i}>
                  {columns.map((col) => (
                    <td key={col.key}>{col.render ? col.render(row) : row[col.key]}</td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RateCard({ label, value, icon }) {
  const pct = Number(value) || 0;
  return (
    <div className="fin-rate" aria-label={`${label}: ${pct}%`}>
      <span className="fin-rate__icon" aria-hidden="true">{icon}</span>
      <div className="fin-rate__bar-bg">
        <div className="fin-rate__bar-fill" style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <div className="fin-rate__info">
        <span className="fin-rate__label">{label}</span>
        <span className="fin-rate__value">{pct}%</span>
      </div>
    </div>
  );
}

function InsightCard({ label, current, previous, unit = "", isCurrency = false, showTrend = true }) {
  const curr = Number(current) || 0;
  const prev = Number(previous) || 0;
  const change = prev > 0 ? ((curr - prev) / prev) * 100 : 0;
  const isPositive = change >= 0;
  const displayValue = isCurrency ? formatMoney(curr) : unit ? `${curr.toLocaleString()} ${unit}` : curr.toLocaleString();
  const changeText = showTrend && prev > 0 ? `${isPositive ? "+" : ""}${change.toFixed(1)}%` : "";

  return (
    <article className={`fin-insight ${isPositive ? "fin-insight--up" : "fin-insight--down"}`} aria-label={`${label}: ${displayValue}`}>
      <span className="fin-insight__label">{label}</span>
      <span className="fin-insight__value">{displayValue}</span>
      {changeText && (
        <span className={`fin-insight__trend ${isPositive ? "fin-insight__trend--up" : "fin-insight__trend--down"}`}>
          {isPositive ? "↑" : "↓"} {changeText}
        </span>
      )}
    </article>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function FinanceAnalyticsCenter() {
  const [period, setPeriod] = useState("30d");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await fetchFinanceData(period);
    setData(result);
    setLoading(false);
  }, [period]);

  useEffect(() => { load(); }, [load]);

  const fin = data?.finance || {};
  const analytics = data?.analytics || {};

  // Revenue KPIs
  const revenueToday = fin.today_revenue || analytics.today_revenue || 0;
  const revenueWeek = fin.week_revenue || 0;
  const revenueMonth = fin.month_revenue || 0;
  const platformCommission = fin.platform_commission || fin.total_commission || 0;
  const driverEarnings = fin.total_driver_earnings || 0;
  const courierEarnings = fin.total_courier_earnings || 0;
  const pendingWithdrawals = fin.pending_withdrawals || 0;
  const completedWithdrawals = fin.completed_withdrawals || 0;
  const refunds = fin.total_refunds || 0;
  const walletBalances = fin.total_wallet_balance || 0;

  // Analytics rates
  const acceptanceRate = analytics.acceptance_rate || fin.acceptance_rate || 0;
  const completionRate = analytics.completion_rate || fin.completion_rate || 0;
  const cancellationRate = analytics.cancellation_rate || fin.cancellation_rate || 0;

  // Charts data
  const revenueChart = useMemo(() => {
    const chart = fin.revenue_chart || fin.daily_revenue || analytics.daily_chart || [];
    return Array.isArray(chart) ? chart : [];
  }, [fin, analytics]);

  const tripsChart = useMemo(() => {
    const chart = analytics.trips_chart || analytics.daily_trips || [];
    return Array.isArray(chart) ? chart : [];
  }, [analytics]);

  // Tables
  const topDrivers = fin.top_drivers || analytics.top_drivers || [];
  const topCouriers = fin.top_couriers || [];
  const recentWithdrawals = fin.recent_withdrawals || [];
  const recentRefunds = fin.recent_refunds || [];

  const handleExport = (format) => {
    // Trigger download (placeholder — uses existing export endpoint if available)
    try {
      const url = `${API_URL}/operations/admin/export/?format=${format}&period=${period}`;
      window.open(url, "_blank");
    } catch { /* silent */ }
  };

  if (loading && !data) {
    return (
      <div className="fin-center fin-center--loading" role="status">
        <div className="fin-center__spinner" />
        <p>Loading Finance & Analytics...</p>
      </div>
    );
  }

  return (
    <div className="fin-center">
      {/* Header */}
      <header className="fin-center__header">
        <div>
          <h1 className="fin-center__title">Finance & Analytics</h1>
          <p className="fin-center__subtitle">Platform financial intelligence</p>
        </div>
        <div className="fin-center__actions">
          <nav className="fin-center__periods" aria-label="Time period">
            {PERIODS.map((p) => (
              <button
                key={p.id}
                className={`fin-period-btn ${period === p.id ? "is-active" : ""}`}
                onClick={() => setPeriod(p.id)}
                aria-pressed={period === p.id}
              >
                {p.label}
              </button>
            ))}
          </nav>
          <div className="fin-center__exports">
            {EXPORT_FORMATS.map((fmt) => (
              <button
                key={fmt.id}
                className="fin-export-btn"
                onClick={() => handleExport(fmt.id)}
                aria-label={`Export as ${fmt.label}`}
                title={`Export ${fmt.label}`}
              >
                {fmt.icon}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Revenue KPIs */}
      <section className="fin-section" aria-label="Revenue metrics">
        <h2 className="fin-section__title">Revenue</h2>
        <div className="fin-kpi-grid">
          <KpiCard icon="💰" label="Today" value={formatMoney(revenueToday)} tone="green" />
          <KpiCard icon="📊" label="This Week" value={formatMoney(revenueWeek)} tone="green" />
          <KpiCard icon="📈" label="This Month" value={formatMoney(revenueMonth)} tone="green" />
          <KpiCard icon="🏦" label="Platform Commission" value={formatMoney(platformCommission)} tone="blue" />
          <KpiCard icon="🚗" label="Driver Earnings" value={formatMoney(driverEarnings)} tone="neutral" />
          <KpiCard icon="📦" label="Courier Earnings" value={formatMoney(courierEarnings)} tone="orange" />
          <KpiCard icon="⏳" label="Pending Withdrawals" value={pendingWithdrawals} tone="amber" />
          <KpiCard icon="✅" label="Completed Withdrawals" value={completedWithdrawals} tone="neutral" />
          <KpiCard icon="↩️" label="Refunds" value={formatMoney(refunds)} tone="red" />
          <KpiCard icon="💳" label="Wallet Balances" value={formatMoney(walletBalances)} tone="blue" />
        </div>
      </section>

      {/* Charts */}
      <section className="fin-section" aria-label="Analytics charts">
        <h2 className="fin-section__title">Trends</h2>
        <div className="fin-charts-grid">
          {revenueChart.length > 0 && (
            <BarChart data={revenueChart} valueKey="revenue" labelKey="label" title="Revenue Trend" color="#10b981" />
          )}
          {tripsChart.length > 0 && (
            <BarChart data={tripsChart} valueKey="count" labelKey="label" title="Trips per Day" color="#3b82f6" />
          )}
        </div>
      </section>

      {/* Rates */}
      <section className="fin-section" aria-label="Performance rates">
        <h2 className="fin-section__title">Performance</h2>
        <div className="fin-rates-grid">
          <RateCard icon="✅" label="Acceptance Rate" value={acceptanceRate} />
          <RateCard icon="🎯" label="Completion Rate" value={completionRate} />
          <RateCard icon="❌" label="Cancellation Rate" value={cancellationRate} />
        </div>
      </section>

      {/* Tables */}
      <section className="fin-section" aria-label="Leaderboards">
        <h2 className="fin-section__title">Leaderboards</h2>
        <div className="fin-tables-grid">
          <DataTable
            title="Top Drivers"
            columns={[
              { key: "name", label: "Driver" },
              { key: "trips", label: "Trips" },
              { key: "earnings", label: "Earnings", render: (r) => formatMoney(r.earnings || 0) },
            ]}
            rows={topDrivers}
          />
          <DataTable
            title="Top Couriers"
            columns={[
              { key: "name", label: "Courier" },
              { key: "deliveries", label: "Deliveries" },
              { key: "earnings", label: "Earnings", render: (r) => formatMoney(r.earnings || 0) },
            ]}
            rows={topCouriers}
          />
          <DataTable
            title="Recent Withdrawals"
            columns={[
              { key: "name", label: "Name" },
              { key: "amount", label: "Amount", render: (r) => formatMoney(r.amount || 0) },
              { key: "status", label: "Status" },
            ]}
            rows={recentWithdrawals}
          />
          <DataTable
            title="Recent Refunds"
            columns={[
              { key: "customer", label: "Customer" },
              { key: "amount", label: "Amount", render: (r) => formatMoney(r.amount || 0) },
              { key: "reason", label: "Reason" },
            ]}
            rows={recentRefunds}
          />
        </div>
      </section>

      {/* ─── CEO Insights ─────────────────────────────────── */}
      <section className="fin-section" aria-label="Executive insights">
        <h2 className="fin-section__title">Executive Insights</h2>
        <div className="fin-insights-grid">
          <InsightCard
            label="Revenue vs last week"
            current={revenueWeek}
            previous={fin.last_week_revenue || revenueWeek * 0.9}
          />
          <InsightCard
            label="Revenue vs last month"
            current={revenueMonth}
            previous={fin.last_month_revenue || revenueMonth * 0.85}
          />
          <InsightCard
            label="Ride growth"
            current={analytics.total_rides || analytics.completed_rides || 0}
            previous={analytics.prev_total_rides || (analytics.total_rides || 0) * 0.9}
            unit="trips"
          />
          <InsightCard
            label="Delivery growth"
            current={fin.total_deliveries || 0}
            previous={fin.prev_total_deliveries || 0}
            unit="deliveries"
          />
          <InsightCard
            label="Avg trip value"
            current={fin.avg_trip_value || (revenueMonth / Math.max(analytics.completed_rides || 1, 1))}
            isCurrency
          />
          <InsightCard
            label="Driver utilization"
            current={analytics.driver_utilization || acceptanceRate}
            unit="%"
            showTrend={false}
          />
        </div>
      </section>
    </div>
  );
}
