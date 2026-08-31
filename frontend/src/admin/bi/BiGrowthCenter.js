import React, { useCallback, useEffect, useMemo, useState } from "react";

import { formatMoney } from "../../marketConfig";
import { exportBiGrowthReport, fetchBiGrowthCenter } from "./biGrowthApi";
import "./BiGrowthCenter.css";

const REFRESH_MS = 30000;
const PERIODS = ["daily", "weekly", "monthly", "quarterly", "annual"];

const MODULES = [
  { id: "kpis", label: "Executive KPIs" },
  { id: "customers", label: "Customers" },
  { id: "drivers", label: "Drivers" },
  { id: "geo", label: "Geography" },
  { id: "financial", label: "Financial" },
  { id: "growth", label: "Growth" },
  { id: "alerts", label: "Alerts" },
];

const FINANCIAL_REPORTS = [
  { id: "financial_daily", label: "Daily Financial Report" },
  { id: "financial_weekly", label: "Weekly Financial Report" },
  { id: "financial_monthly", label: "Monthly Financial Report" },
  { id: "tax_summary", label: "Tax Summary" },
  { id: "commission_summary", label: "Commission Summary" },
  { id: "driver_payout_summary", label: "Driver Payout Summary" },
];

function Metric({ label, value, tone = "" }) {
  return (
    <div className="bi-growth__card">
      <div className="bi-growth__label">{label}</div>
      <div className={`bi-growth__value ${tone ? `bi-growth__value--${tone}` : ""}`}>{value ?? "—"}</div>
    </div>
  );
}

function GeoMap({ heatpoints = [] }) {
  const points = useMemo(() => {
    const valid = heatpoints.filter((p) => p.lat != null && p.lng != null);
    if (!valid.length) return [];
    const lats = valid.map((p) => p.lat);
    const lngs = valid.map((p) => p.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    return valid.map((p, idx) => ({
      id: idx,
      left: maxLng === minLng ? 50 : ((p.lng - minLng) / (maxLng - minLng)) * 100,
      top: maxLat === minLat ? 50 : (1 - (p.lat - minLat) / (maxLat - minLat)) * 100,
      weight: p.demand || p.weight || 1,
    }));
  }, [heatpoints]);

  return (
    <div className="bi-growth__map">
      {points.map((p) => (
        <span
          key={p.id}
          className="bi-growth__heat"
          style={{
            left: `${p.left}%`,
            top: `${p.top}%`,
            width: `${8 + Math.min(p.weight, 20)}px`,
            height: `${8 + Math.min(p.weight, 20)}px`,
          }}
        />
      ))}
    </div>
  );
}

function downloadBlob(response, filename) {
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.URL.revokeObjectURL(url);
}

export default function BiGrowthCenter() {
  const [data, setData] = useState(null);
  const [period, setPeriod] = useState("monthly");
  const [cityId, setCityId] = useState("");
  const [theme, setTheme] = useState(() => localStorage.getItem("bi-growth-theme") || "dark");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeModule, setActiveModule] = useState("kpis");
  const [lastRefresh, setLastRefresh] = useState(null);

  const params = { period };
  if (cityId) params.city_id = cityId;

  const load = useCallback(async () => {
    try {
      setError("");
      const payload = await fetchBiGrowthCenter(params);
      setData(payload);
      setLastRefresh(new Date());
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Failed to load BI Growth Center");
    } finally {
      setLoading(false);
    }
  }, [period, cityId]);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    localStorage.setItem("bi-growth-theme", theme);
  }, [theme]);

  const handleExport = async (reportType, fmt) => {
    try {
      const response = await exportBiGrowthReport(reportType, fmt, params);
      const ext = fmt === "excel" ? "xlsx" : fmt;
      downloadBlob(response, `yala-bi-${reportType}-${period}.${ext}`);
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Export failed");
    }
  };

  if (loading && !data) {
    return <div className="bi-growth">Loading Business Intelligence & Growth Center…</div>;
  }

  const kpis = data?.executive_kpis || {};
  const customers = data?.customer_analytics || {};
  const drivers = data?.driver_analytics || {};
  const geo = data?.geographic_insights || {};
  const financial = data?.financial_reports || {};
  const growth = data?.growth_insights || {};
  const alerts = data?.alerts || [];

  return (
    <div className={`bi-growth ${theme === "light" ? "bi-growth--light" : ""}`}>
      <header className="bi-growth__header">
        <div>
          <a href="/admin" className="bi-growth__back">← Admin</a>
          <h1>Business Intelligence & Growth Center</h1>
          <p className="bi-growth__subtitle">
            Executive analytics — transform operational data into actionable insights
          </p>
          {lastRefresh ? (
            <p className="bi-growth__subtitle">
              Updated {lastRefresh.toLocaleTimeString()} · refresh {REFRESH_MS / 1000}s
            </p>
          ) : null}
        </div>
        <div className="bi-growth__toolbar">
          <select value={period} onChange={(e) => setPeriod(e.target.value)}>
            {PERIODS.map((p) => (
              <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
            ))}
          </select>
          <input
            type="number"
            placeholder="City ID"
            value={cityId}
            onChange={(e) => setCityId(e.target.value)}
            style={{ width: 90 }}
          />
          <button type="button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
            {theme === "dark" ? "☀ Light" : "🌙 Dark"}
          </button>
          <button type="button" onClick={load} disabled={loading}>Refresh</button>
          <a href="/admin/bi" style={{ color: "var(--muted)", fontSize: "0.82rem" }}>Data Warehouse →</a>
        </div>
      </header>

      {error ? <div className="bi-growth__message bi-growth__message--error">{error}</div> : null}

      <nav className="bi-growth__nav">
        {MODULES.map(({ id, label }) => (
          <a
            key={id}
            href={`#bi-${id}`}
            className={activeModule === id ? "active" : ""}
            onClick={() => setActiveModule(id)}
          >
            {label}
          </a>
        ))}
      </nav>

      {/* MODULE 1 — Executive KPIs */}
      <section id="bi-kpis" className="bi-growth__section">
        <h2 className="bi-growth__section-title">Executive KPIs</h2>
        <div className="bi-growth__grid">
          <Metric label="Daily Revenue" value={formatMoney(kpis.revenue_daily)} tone="gold" />
          <Metric label="Weekly Revenue" value={formatMoney(kpis.revenue_weekly)} tone="gold" />
          <Metric label="Monthly Revenue" value={formatMoney(kpis.revenue_monthly)} tone="gold" />
          <Metric label="Annual Revenue" value={formatMoney(kpis.revenue_annual)} tone="gold" />
          <Metric label="Gross Revenue" value={formatMoney(kpis.gross_revenue)} />
          <Metric label="Net Revenue" value={formatMoney(kpis.net_revenue)} tone="green" />
          <Metric label="Commission Revenue" value={formatMoney(kpis.commission_revenue)} tone="gold" />
          <Metric label="Total Trips" value={kpis.total_trips} />
          <Metric label="Completed Trips" value={kpis.completed_trips} tone="green" />
          <Metric label="Cancelled Trips" value={kpis.cancelled_trips} tone="red" />
          <Metric label="Avg Trip Value" value={formatMoney(kpis.average_trip_value)} />
          <Metric label="Completion Rate" value={`${kpis.completion_rate_pct}%`} tone="green" />
        </div>
      </section>

      {/* MODULE 2 — Customer Analytics */}
      <section id="bi-customers" className="bi-growth__section">
        <h2 className="bi-growth__section-title">Customer Analytics</h2>
        <div className="bi-growth__grid">
          <Metric label="New Riders Today" value={customers.new_riders_today} />
          <Metric label="New (Period)" value={customers.new_riders_period} />
          <Metric label="Active Riders (30d)" value={customers.active_riders} tone="green" />
          <Metric label="Returning Riders" value={customers.returning_riders} />
          <Metric label="Retention 7d" value={customers.retention_7d_pct != null ? `${customers.retention_7d_pct}%` : "—"} />
          <Metric label="Retention 30d" value={customers.retention_30d_pct != null ? `${customers.retention_30d_pct}%` : "—"} />
          <Metric label="Retention 90d" value={customers.retention_90d_pct != null ? `${customers.retention_90d_pct}%` : "—"} />
          <Metric label="Loyalty Members" value={customers.loyalty_members} />
        </div>
        <div className="bi-growth__card bi-growth__card--wide" style={{ marginTop: 14 }}>
          <h3>Top Customers / Highest Spending Riders</h3>
          <table className="bi-growth__table">
            <thead>
              <tr><th>Rider</th><th>Trips</th><th>Total Spent</th></tr>
            </thead>
            <tbody>
              {(customers.top_customers || []).length === 0 ? (
                <tr><td colSpan={3}>No completed ride data yet</td></tr>
              ) : (
                customers.top_customers.map((row) => (
                  <tr key={row.rider_id}>
                    <td>{row.rider__first_name} {row.rider__last_name || row.rider__email}</td>
                    <td>{row.trips}</td>
                    <td>{formatMoney(row.total_spent)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* MODULE 3 — Driver Analytics */}
      <section id="bi-drivers" className="bi-growth__section">
        <h2 className="bi-growth__section-title">Driver Analytics</h2>
        <div className="bi-growth__grid">
          <Metric label="Total Drivers" value={drivers.total_drivers} />
          <Metric label="Active (Online)" value={drivers.active_drivers} tone="green" />
          <Metric label="Acceptance Rate" value={`${drivers.acceptance_rate_pct}%`} />
          <Metric label="Completion Rate" value={`${drivers.completion_rate_pct}%`} />
          <Metric label="Driver Earnings" value={formatMoney(drivers.driver_earnings_mru)} tone="gold" />
          <Metric label="Avg Rating" value={drivers.average_rating ?? "—"} />
          <Metric label="Fleet Utilization" value={`${drivers.fleet_utilization_pct}%`} />
        </div>
        <div className="bi-growth__grid" style={{ marginTop: 14, gridTemplateColumns: "1fr 1fr" }}>
          <div className="bi-growth__card">
            <h3>🏆 Top Drivers (Recognition)</h3>
            <ul className="bi-growth__subtitle">
              {(drivers.coaching?.recognition || drivers.top_20_drivers || []).slice(0, 5).map((d) => (
                <li key={d.driver_id}>{d.driver_name || d.name} — score {d.score}</li>
              ))}
            </ul>
          </div>
          <div className="bi-growth__card">
            <h3>📋 Coaching Needed</h3>
            <ul className="bi-growth__subtitle">
              {(drivers.coaching?.coaching_needed || []).slice(0, 5).map((d) => (
                <li key={d.driver_id}>
                  {d.driver_name} — {(d.badges || []).join(", ") || "review"}
                </li>
              ))}
              {(drivers.coaching?.coaching_needed || []).length === 0 ? <li>None flagged</li> : null}
            </ul>
          </div>
        </div>
        <div className="bi-growth__card bi-growth__card--wide" style={{ marginTop: 14 }}>
          <h3>Top 20 Drivers</h3>
          <table className="bi-growth__table">
            <thead>
              <tr><th>Driver</th><th>Score</th><th>Trips</th><th>Revenue</th></tr>
            </thead>
            <tbody>
              {(drivers.top_20_drivers || []).map((d) => (
                <tr key={d.driver_id}>
                  <td>{d.driver_name || d.name}</td>
                  <td>{d.score}</td>
                  <td>{d.total_trips}</td>
                  <td>{formatMoney(d.revenue_month)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* MODULE 4 — Geographic Insights */}
      <section id="bi-geo" className="bi-growth__section">
        <h2 className="bi-growth__section-title">Geographic Insights</h2>
        <div className="bi-growth__grid">
          <Metric label="Demand Heatpoints" value={(geo.demand_heatpoints || []).length} />
          <Metric label="Shortage Areas" value={(geo.underserved_areas || []).length} tone="orange" />
          <Metric label="Avg Wait Time" value={`${geo.average_wait_time_minutes ?? "—"} min`} />
          <Metric label="Peak Hours" value={(geo.peak_demand_hours || []).length} />
        </div>
        <div className="bi-growth__card bi-growth__card--wide" style={{ marginTop: 14 }}>
          <h3>Ride Demand Heatmap</h3>
          <GeoMap heatpoints={geo.demand_heatpoints} />
        </div>
        <div className="bi-growth__grid" style={{ marginTop: 14, gridTemplateColumns: "1fr 1fr" }}>
          <div className="bi-growth__card">
            <h3>Revenue by Neighborhood</h3>
            <ul className="bi-growth__subtitle">
              {(geo.revenue_by_district || []).slice(0, 8).map((row, idx) => (
                <li key={idx}>City {row.city_id} — {formatMoney(row.revenue_mru)}</li>
              ))}
            </ul>
          </div>
          <div className="bi-growth__card">
            <h3>Underserved Areas</h3>
            <ul className="bi-growth__subtitle">
              {(geo.underserved_areas || []).slice(0, 8).map((area, idx) => (
                <li key={idx}>{area.label || area.name || JSON.stringify(area)}</li>
              ))}
              {(geo.underserved_areas || []).length === 0 ? <li>No shortages detected</li> : null}
            </ul>
          </div>
        </div>
      </section>

      {/* MODULE 5 — Financial Reports */}
      <section id="bi-financial" className="bi-growth__section">
        <h2 className="bi-growth__section-title">Financial Reports</h2>
        <div className="bi-growth__grid">
          <Metric label="Daily Gross" value={formatMoney(financial.daily?.gross_revenue)} tone="gold" />
          <Metric label="Weekly Gross" value={formatMoney(financial.weekly?.gross_revenue)} tone="gold" />
          <Metric label="Monthly Gross" value={formatMoney(financial.monthly?.gross_revenue)} tone="gold" />
          <Metric label="Pending Payouts" value={formatMoney(financial.driver_payout_summary?.pending_amount_mru)} tone="orange" />
          <Metric label="Commission (Period)" value={formatMoney(financial.commission_summary?.platform_commission_mru)} />
          <Metric label="Refunds (Tax)" value={formatMoney(financial.tax_summary?.refunds_mru)} tone="red" />
        </div>
        <div className="bi-growth__card bi-growth__card--wide" style={{ marginTop: 14 }}>
          <h3>Export Reports (PDF / Excel / CSV)</h3>
          <div className="bi-growth__grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
            {FINANCIAL_REPORTS.map((report) => (
              <div key={report.id} className="bi-growth__card">
                <h3>{report.label}</h3>
                <div className="bi-growth__export-row">
                  {["csv", "excel", "pdf"].map((fmt) => (
                    <button key={fmt} type="button" onClick={() => handleExport(report.id, fmt)}>
                      {fmt.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* MODULE 6 — Growth Insights */}
      <section id="bi-growth" className="bi-growth__section">
        <h2 className="bi-growth__section-title">Growth Insights</h2>
        <div className="bi-growth__grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div className="bi-growth__card">
            <h3>Recruit Drivers Here</h3>
            <ul className="bi-growth__subtitle">
              {(growth.recruit_drivers_areas || growth.expansion_areas || []).slice(0, 6).map((a, idx) => (
                <li key={idx}>{a.label || a.suggested_action || a.name || JSON.stringify(a)}</li>
              ))}
            </ul>
          </div>
          <div className="bi-growth__card">
            <h3>High-Demand Hours</h3>
            <ul className="bi-growth__subtitle">
              {(growth.high_demand_hours || []).map((h, idx) => (
                <li key={idx}>{typeof h === "object" ? JSON.stringify(h) : h}</li>
              ))}
            </ul>
          </div>
          <div className="bi-growth__card">
            <h3>Promotion Opportunities</h3>
            <ul className="bi-growth__subtitle">
              {(growth.promotion_opportunities || []).slice(0, 6).map((c) => (
                <li key={c.id}>{c.name} ({c.status})</li>
              ))}
            </ul>
          </div>
          <div className="bi-growth__card">
            <h3>Retention Opportunities</h3>
            <pre className="bi-growth__subtitle" style={{ fontSize: "0.78rem", overflow: "auto" }}>
              {JSON.stringify(growth.retention_opportunities || {}, null, 2)}
            </pre>
          </div>
        </div>
        <div className="bi-growth__card bi-growth__card--wide" style={{ marginTop: 14 }}>
          <h3>Revenue Forecast</h3>
          <div className="bi-growth__grid">
            <Metric label="Daily Forecast" value={formatMoney(growth.revenue_forecast?.daily_revenue)} />
            <Metric label="Weekly Forecast" value={formatMoney(growth.revenue_forecast?.weekly_revenue)} />
            <Metric label="Monthly Forecast" value={formatMoney(growth.revenue_forecast?.monthly_revenue)} />
          </div>
        </div>
      </section>

      {/* MODULE 7 — Alerts */}
      <section id="bi-alerts" className="bi-growth__section">
        <h2 className="bi-growth__section-title">Executive Alerts ({alerts.length})</h2>
        <div className="bi-growth__export-row" style={{ marginBottom: 14 }}>
          {["csv", "excel", "pdf"].map((fmt) => (
            <button key={fmt} type="button" onClick={() => handleExport("alerts", fmt)}>
              Export Alerts {fmt.toUpperCase()}
            </button>
          ))}
        </div>
        {alerts.length === 0 ? (
          <div className="bi-growth__card">No active executive alerts — platform operating normally.</div>
        ) : (
          alerts.map((alert, idx) => (
            <div
              key={alert.id || idx}
              className={`bi-growth__alert ${alert.severity === "critical" ? "bi-growth__alert--critical" : ""}`}
            >
              <strong>{alert.type || alert.alert_type || "alert"}</strong>
              {alert.severity ? ` · ${alert.severity}` : ""}
              <div>{alert.message || alert.title}</div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
