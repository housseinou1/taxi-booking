/**
 * Executive Operations Center — Home Dashboard (Commit 1)
 *
 * Unified executive view providing complete operational visibility
 * across Driver, Rider, and Delivery verticals.
 *
 * Designed for: CEO, COO, Operations Manager, Finance Director, Support Manager
 *
 * Does NOT modify backend logic, pricing, ride matching, or payments.
 * UI + data display only.
 */
import React, { useCallback, useEffect, useState } from "react";

import { formatMoney } from "../../marketConfig";
import authenticatedApi from "../../auth/authenticatedApi";
import { API_URL } from "../../apiConfig";
import "./OpsCenterHome.css";

// ─── Data fetching ───────────────────────────────────────────────────────────

async function fetchOpsCenterData() {
  try {
    const [health, analytics, finance] = await Promise.allSettled([
      authenticatedApi.get(`${API_URL}/health/`),
      authenticatedApi.get(`${API_URL}/rides/analytics/admin/`),
      authenticatedApi.get(`${API_URL}/operations/admin/dashboard/`),
    ]);
    return {
      health: health.status === "fulfilled" ? health.value.data : null,
      analytics: analytics.status === "fulfilled" ? analytics.value.data : null,
      finance: finance.status === "fulfilled" ? finance.value.data : null,
    };
  } catch {
    return { health: null, analytics: null, finance: null };
  }
}

// ─── Components ──────────────────────────────────────────────────────────────

function KpiCard({ label, value, icon, tone = "neutral" }) {
  return (
    <article className={`ops-kpi ops-kpi--${tone}`} aria-label={`${label}: ${value}`}>
      <span className="ops-kpi__icon" aria-hidden="true">{icon}</span>
      <div className="ops-kpi__body">
        <span className="ops-kpi__value">{value}</span>
        <span className="ops-kpi__label">{label}</span>
      </div>
    </article>
  );
}

function SectionHeader({ title, subtitle }) {
  return (
    <header className="ops-section__header">
      <h2 className="ops-section__title">{title}</h2>
      {subtitle && <p className="ops-section__subtitle">{subtitle}</p>}
    </header>
  );
}

function SystemHealthBar({ health }) {
  if (!health) return null;
  const services = [
    { key: "database", label: "Database", status: health.database },
    { key: "redis", label: "Redis", status: health.redis },
    { key: "api", label: "API", status: health.status },
  ];
  return (
    <div className="ops-health-bar" role="status" aria-label="System health">
      {services.map((svc) => (
        <span
          key={svc.key}
          className={`ops-health-bar__item ops-health-bar__item--${svc.status === "ok" ? "ok" : "down"}`}
        >
          <span className="ops-health-bar__dot" aria-hidden="true" />
          {svc.label}
        </span>
      ))}
    </div>
  );
}

function QuickNav({ items }) {
  return (
    <nav className="ops-quicknav" aria-label="Quick navigation">
      {items.map((item) => (
        <a
          key={item.href}
          href={item.href}
          className="ops-quicknav__item"
          aria-label={item.label}
        >
          <span className="ops-quicknav__icon" aria-hidden="true">{item.icon}</span>
          <span className="ops-quicknav__label">{item.label}</span>
        </a>
      ))}
    </nav>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function OpsCenterHome() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);

  const load = useCallback(async () => {
    try {
      const result = await fetchOpsCenterData();
      setData(result);
      setLastUpdated(new Date());
      setError("");
    } catch {
      setError("Unable to load operations data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [load]);

  if (loading && !data) {
    return (
      <div className="ops-center ops-center--loading" role="status">
        <div className="ops-center__spinner" />
        <p>Loading Executive Operations Center...</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="ops-center ops-center--error" role="alert">
        <h1>Executive Operations Center</h1>
        <p className="ops-center__error">{error}</p>
        <button className="ops-btn ops-btn--primary" onClick={load}>Retry</button>
      </div>
    );
  }

  const analytics = data?.analytics || {};
  const finance = data?.finance || {};
  const health = data?.health || {};

  // Extract metrics (safe defaults)
  const activeDrivers = analytics.active_drivers ?? finance.active_drivers ?? 0;
  const activeCouriers = finance.active_couriers ?? 0;
  const onlineRiders = analytics.active_riders ?? 0;
  const activeTrips = analytics.active_rides ?? analytics.in_progress_rides ?? 0;
  const activeDeliveries = finance.active_deliveries ?? 0;
  const todayRevenue = finance.today_revenue ?? analytics.today_revenue ?? 0;
  const weekRevenue = finance.week_revenue ?? 0;
  const monthRevenue = finance.month_revenue ?? 0;
  const pendingWithdrawals = finance.pending_withdrawals ?? 0;
  const pendingDriverApprovals = finance.pending_driver_approvals ?? 0;
  const pendingCourierApprovals = finance.pending_courier_approvals ?? 0;
  const supportTickets = finance.open_support_tickets ?? 0;
  const completedToday = analytics.completed_rides ?? 0;
  const cancelledToday = analytics.cancelled_rides ?? 0;

  return (
    <div className="ops-center">
      {/* ─── Header ─────────────────────────────────────────── */}
      <header className="ops-center__header">
        <div className="ops-center__header-main">
          <h1 className="ops-center__title">Executive Operations Center</h1>
          <p className="ops-center__subtitle">
            YALA Platform — Real-time operational overview
          </p>
        </div>
        <div className="ops-center__header-meta">
          <SystemHealthBar health={health} />
          {lastUpdated && (
            <time className="ops-center__timestamp">
              Updated {lastUpdated.toLocaleTimeString()}
            </time>
          )}
        </div>
      </header>

      {/* ─── Live Metrics ───────────────────────────────────── */}
      <section className="ops-section" aria-label="Live metrics">
        <SectionHeader title="Live Operations" subtitle="Real-time platform activity" />
        <div className="ops-kpi-grid ops-kpi-grid--live">
          <KpiCard icon="🚗" label="Active Drivers" value={activeDrivers} tone="green" />
          <KpiCard icon="📦" label="Active Couriers" value={activeCouriers} tone="orange" />
          <KpiCard icon="👤" label="Online Riders" value={onlineRiders} tone="blue" />
          <KpiCard icon="🛣️" label="Active Trips" value={activeTrips} tone="green" />
          <KpiCard icon="🚚" label="Active Deliveries" value={activeDeliveries} tone="orange" />
          <KpiCard icon="✅" label="Completed Today" value={completedToday} tone="neutral" />
        </div>
      </section>

      {/* ─── Revenue ────────────────────────────────────────── */}
      <section className="ops-section" aria-label="Revenue">
        <SectionHeader title="Revenue" subtitle="Platform earnings" />
        <div className="ops-kpi-grid ops-kpi-grid--revenue">
          <KpiCard icon="💰" label="Today" value={formatMoney(todayRevenue)} tone="green" />
          <KpiCard icon="📊" label="This Week" value={formatMoney(weekRevenue)} tone="neutral" />
          <KpiCard icon="📈" label="This Month" value={formatMoney(monthRevenue)} tone="neutral" />
          <KpiCard icon="⏳" label="Pending Withdrawals" value={pendingWithdrawals} tone={pendingWithdrawals > 0 ? "amber" : "neutral"} />
        </div>
      </section>

      {/* ─── Approvals & Support ────────────────────────────── */}
      <section className="ops-section" aria-label="Pending actions">
        <SectionHeader title="Action Required" subtitle="Items needing attention" />
        <div className="ops-kpi-grid ops-kpi-grid--actions">
          <KpiCard icon="🪪" label="Driver Approvals" value={pendingDriverApprovals} tone={pendingDriverApprovals > 0 ? "amber" : "neutral"} />
          <KpiCard icon="📋" label="Courier Approvals" value={pendingCourierApprovals} tone={pendingCourierApprovals > 0 ? "amber" : "neutral"} />
          <KpiCard icon="🎫" label="Support Tickets" value={supportTickets} tone={supportTickets > 0 ? "amber" : "neutral"} />
          <KpiCard icon="❌" label="Cancelled Today" value={cancelledToday} tone={cancelledToday > 5 ? "red" : "neutral"} />
        </div>
      </section>

      {/* ─── Quick Navigation ───────────────────────────────── */}
      <section className="ops-section" aria-label="Quick navigation">
        <SectionHeader title="Modules" subtitle="Jump to a specific area" />
        <QuickNav items={[
          { href: "/admin/executive", icon: "📊", label: "Full Executive" },
          { href: "/admin/operations", icon: "⚙️", label: "Operations" },
          { href: "/admin/finance-ops", icon: "💳", label: "Finance" },
          { href: "/admin/ceo-master", icon: "🏢", label: "CEO Command" },
          { href: "/admin/pricing", icon: "💰", label: "Pricing" },
          { href: "/admin/drivers", icon: "🚗", label: "Drivers" },
          { href: "/admin/support", icon: "🎧", label: "Support" },
          { href: "/admin/security", icon: "🔒", label: "Security" },
        ]} />
      </section>
    </div>
  );
}
