import React, { useCallback, useEffect, useMemo, useState } from "react";

import { API_URL } from "../../apiConfig";
import authenticatedApi from "../../auth/authenticatedApi";
import { formatMoney } from "../../marketConfig";
import { fetchExecutiveDashboard, fetchPendingWithdrawals } from "../executive/executiveApi";
import {
  ceoMasterReportUrl,
  fetchCeoMasterDashboard,
  postCeoApproveOnboarding,
  postCeoBroadcast,
  postCeoFreeze,
} from "./ceoMasterApi";
import "./CeoExecutiveDashboard.css";

const REFRESH_MS = 20000;
const SECTIONS = [
  { id: "live", label: "Live Ops" },
  { id: "today", label: "Today" },
  { id: "finance", label: "Finance" },
  { id: "health", label: "Health" },
  { id: "map", label: "Map" },
  { id: "approvals", label: "Approvals" },
  { id: "staff", label: "Staff" },
  { id: "analytics", label: "Analytics" },
  { id: "security", label: "Security" },
  { id: "actions", label: "Actions" },
];

function MetricCard({ label, value, sub, tone = "", na = false }) {
  return (
    <div className={`ceo-exec__card ${na ? "ceo-exec__card--na" : ""}`}>
      <div className="ceo-exec__metric-label">
        {label}
        {na ? <span className="ceo-exec__na-badge">v2</span> : null}
      </div>
      <div className={`ceo-exec__metric-value ${tone ? `ceo-exec__metric-value--${tone}` : ""}`}>
        {na ? "—" : value ?? "—"}
      </div>
      {sub ? <div className="ceo-exec__metric-sub">{sub}</div> : null}
    </div>
  );
}

function BarChart({ data = [], valueKey = "revenue", labelKey = "label", formatValue }) {
  const max = Math.max(...data.map((item) => Number(item[valueKey] || item.count || 0)), 1);
  return (
    <div className="ceo-exec__chart">
      {data.map((point) => {
        const raw = Number(String(point[valueKey] || point.count || 0).replace(/[^\d.-]/g, "")) || 0;
        const height = Math.max(4, (raw / max) * 120);
        const title = formatValue ? formatValue(raw, point) : String(raw);
        return (
          <div key={point.hour ?? point.date ?? point.label} style={{ flex: 1, minWidth: 0 }}>
            <div className="ceo-exec__bar" style={{ height: `${height}px` }} title={title} />
            <div className="ceo-exec__bar-label">{point[labelKey]}</div>
          </div>
        );
      })}
    </div>
  );
}

function MapPanel({ mapData, demandZones = [] }) {
  const markers = useMemo(() => {
    const payload = mapData?.markers || {};
    const all = [
      ...(payload.drivers || []).map((item) => ({ ...item, kind: "driver" })),
      ...(payload.couriers || []).map((item) => ({ ...item, kind: "courier" })),
      ...(payload.trips || []).map((item) => ({ ...item, kind: "trip" })),
      ...(payload.deliveries || []).map((item) => ({ ...item, kind: "delivery" })),
      ...(demandZones || []).slice(0, 12).map((item, idx) => ({
        id: `demand-${idx}`,
        lat: item.lat,
        lng: item.lng,
        kind: "demand",
      })),
    ].filter((item) => item.lat != null && item.lng != null);

    if (!all.length) return [];
    const lats = all.map((item) => item.lat);
    const lngs = all.map((item) => item.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    return all.map((item) => {
      const x = maxLng === minLng ? 50 : ((item.lng - minLng) / (maxLng - minLng)) * 100;
      const y = maxLat === minLat ? 50 : (1 - (item.lat - minLat) / (maxLat - minLat)) * 100;
      return { ...item, left: `${x}%`, top: `${y}%` };
    });
  }, [mapData, demandZones]);

  return (
    <div className="ceo-exec__card">
      <h3>Live Operations Map</h3>
      <div className="ceo-exec__map">
        {markers.map((marker) => (
          <span
            key={`${marker.kind}-${marker.id}`}
            className={`ceo-exec__marker ceo-exec__marker--${marker.kind}`}
            style={{ left: marker.left, top: marker.top }}
            title={`${marker.kind} ${marker.id}`}
          />
        ))}
      </div>
      <div className="ceo-exec__legend">
        <span className="driver">Drivers</span>
        <span className="courier">Couriers</span>
        <span className="trip">Active rides</span>
        <span className="delivery">Deliveries</span>
        <span className="demand">High demand</span>
      </div>
    </div>
  );
}

async function fetchProductionHealth() {
  const response = await authenticatedApi.get(`${API_URL}/api/health/status/`);
  return response.data;
}

export default function CeoExecutiveDashboard() {
  const [theme, setTheme] = useState(() => localStorage.getItem("ceo-exec-theme") || "dark");
  const [master, setMaster] = useState(null);
  const [executive, setExecutive] = useState(null);
  const [health, setHealth] = useState(null);
  const [withdrawals, setWithdrawals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [lastRefresh, setLastRefresh] = useState(null);
  const [activeSection, setActiveSection] = useState("live");

  const [broadcastForm, setBroadcastForm] = useState({ title: "", message: "", segment: "all" });
  const [freezeReason, setFreezeReason] = useState("");
  const [actionLoading, setActionLoading] = useState({});

  const load = useCallback(async () => {
    try {
      setError("");
      const [masterData, execData, healthData, pending] = await Promise.all([
        fetchCeoMasterDashboard(),
        fetchExecutiveDashboard({ period: "daily" }).catch(() => null),
        fetchProductionHealth().catch(() => null),
        fetchPendingWithdrawals().catch(() => []),
      ]);
      setMaster(masterData);
      setExecutive(execData);
      setHealth(healthData);
      setWithdrawals(pending.slice(0, 15));
      setLastRefresh(new Date());
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Failed to load CEO dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    localStorage.setItem("ceo-exec-theme", theme);
    document.documentElement.setAttribute("data-ceo-theme", theme);
  }, [theme]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveSection(entry.target.id.replace("ceo-", ""));
        });
      },
      { rootMargin: "-20% 0px -60% 0px", threshold: 0 }
    );
    SECTIONS.forEach(({ id }) => {
      const el = document.getElementById(`ceo-${id}`);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [loading]);

  const overview = master?.executive_overview || {};
  const finance = master?.financial_overview || {};
  const ops = master?.operations || {};
  const fleet = master?.fleet || {};
  const compliance = ops.driver_compliance || {};
  const analytics = master?.analytics || {};
  const staff = master?.staff_overview || {};
  const security = executive?.security || {};
  const support = executive?.support || {};
  const ai = master?.ai_insights || {};
  const approvals = ops.approval_queues || {};

  const netProfit = finance.daily_profit || overview.commission_earned_today;

  const handleApprove = async (entityType, entityId) => {
    const key = `${entityType}-${entityId}`;
    setActionLoading((s) => ({ ...s, [key]: true }));
    try {
      await postCeoApproveOnboarding({
        entity_type: entityType,
        entity_id: Number(entityId),
        note: "CEO executive dashboard approval",
      });
      setMessage(`Approved ${entityType} #${entityId}`);
      await load();
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Approval failed");
    } finally {
      setActionLoading((s) => ({ ...s, [key]: false }));
    }
  };

  const handleWithdrawal = async (id, approve) => {
    setActionLoading((s) => ({ ...s, [`w-${id}`]: true }));
    try {
      const path = approve ? "approve" : "reject";
      await authenticatedApi.post(`${API_URL}/payments/withdrawals/${id}/${path}/`, {});
      setMessage(approve ? `Withdrawal #${id} approved` : `Withdrawal #${id} rejected`);
      await load();
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || "Withdrawal action failed");
    } finally {
      setActionLoading((s) => ({ ...s, [`w-${id}`]: false }));
    }
  };

  const handleBroadcast = async (e) => {
    e.preventDefault();
    try {
      const result = await postCeoBroadcast(broadcastForm);
      setMessage(`Broadcast sent: ${result.sent} recipients (${result.segment})`);
      setBroadcastForm({ title: "", message: "", segment: "all" });
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message);
    }
  };

  const handleFreeze = async (enabled) => {
    try {
      await postCeoFreeze({ enabled, reason: freezeReason || "CEO emergency maintenance" });
      setMessage(enabled ? "Maintenance mode enabled" : "Maintenance mode disabled");
      setFreezeReason("");
      await load();
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message);
    }
  };

  if (loading && !master) {
    return <div className="ceo-exec ceo-exec--dark">Loading CEO Executive Dashboard…</div>;
  }

  return (
    <div className={`ceo-exec ${theme === "light" ? "ceo-exec--light" : ""}`}>
      <header className="ceo-exec__header">
        <div>
          <a href="/admin" className="ceo-exec__back">← Admin Home</a>
          <h1>YALA CEO Executive Dashboard</h1>
          <p className="ceo-exec__subtitle">
            Executive decision center — mobility, delivery, and platform health at a glance
          </p>
        </div>
        <div className="ceo-exec__toolbar">
          <button type="button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
            {theme === "dark" ? "☀ Light" : "🌙 Dark"}
          </button>
          <button type="button" onClick={load} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          <a href={ceoMasterReportUrl("daily")} className="ceo-exec__toolbar button primary" download>
            Daily Report
          </a>
          <a href={ceoMasterReportUrl("weekly")} className="ceo-exec__toolbar button" download>
            Weekly Report
          </a>
        </div>
      </header>

      {lastRefresh ? (
        <div className="ceo-exec__meta">
          Last updated {lastRefresh.toLocaleTimeString()} · Auto-refresh every {REFRESH_MS / 1000}s
          {health?.status ? ` · Platform ${health.status}` : ""}
        </div>
      ) : null}
      {error ? <div className="ceo-exec__message ceo-exec__message--error">{error}</div> : null}
      {message ? <div className="ceo-exec__message ceo-exec__message--success">{message}</div> : null}

      <nav className="ceo-exec__nav" aria-label="Dashboard sections">
        {SECTIONS.map(({ id, label }) => (
          <a
            key={id}
            href={`#ceo-${id}`}
            className={activeSection === id ? "active" : ""}
            onClick={() => setActiveSection(id)}
          >
            {label}
          </a>
        ))}
      </nav>

      {/* SECTION 1 — LIVE OPERATIONS */}
      <section id="ceo-live" className="ceo-exec__section">
        <h2 className="ceo-exec__section-title"><span>🚕</span> Live Operations</h2>
        <div className="ceo-exec__grid ceo-exec__grid--metrics">
          <MetricCard label="Drivers Online" value={overview.drivers_online ?? fleet.drivers_online} tone="green" />
          <MetricCard label="Drivers Offline" value={overview.drivers_offline ?? fleet.drivers_offline} />
          <MetricCard label="Active Rides" value={overview.active_trips} tone="blue" />
          <MetricCard label="Active Deliveries" value={overview.active_deliveries} tone="purple" />
          <MetricCard label="Active Properties" value={null} na />
          <MetricCard label="Riders Online" value={overview.active_riders} tone="blue" />
          <MetricCard label="Couriers Online" value={overview.active_couriers} tone="orange" />
        </div>
      </section>

      {/* SECTION 2 — TODAY'S BUSINESS */}
      <section id="ceo-today" className="ceo-exec__section">
        <h2 className="ceo-exec__section-title"><span>📊</span> Today&apos;s Business</h2>
        <div className="ceo-exec__grid ceo-exec__grid--metrics">
          <MetricCard label="Today's Revenue" value={formatMoney(overview.total_revenue_today)} tone="gold" />
          <MetricCard label="Completed Rides" value={overview.completed_rides_today} />
          <MetricCard label="Delivery Orders" value={overview.completed_deliveries_today} tone="purple" />
          <MetricCard label="Property Payments" value={null} na />
          <MetricCard label="New Riders" value={overview.new_riders_today} tone="blue" />
          <MetricCard label="New Drivers" value={overview.new_drivers_today} tone="green" />
          <MetricCard label="New Landlords" value={null} na />
          <MetricCard label="New Tenants" value={null} na />
        </div>
      </section>

      {/* SECTION 3 — FINANCIAL OVERVIEW */}
      <section id="ceo-finance" className="ceo-exec__section">
        <h2 className="ceo-exec__section-title"><span>💰</span> Financial Overview</h2>
        <div className="ceo-exec__grid ceo-exec__grid--metrics">
          <MetricCard label="Ride Revenue" value={formatMoney(overview.ride_revenue_today)} tone="gold" />
          <MetricCard label="Delivery Revenue" value={formatMoney(overview.delivery_revenue_today)} tone="purple" />
          <MetricCard label="Real Estate Revenue" value={null} na />
          <MetricCard label="Commission Earned" value={formatMoney(overview.commission_earned_today)} tone="gold" />
          <MetricCard
            label="Driver Payouts Pending"
            value={formatMoney(finance.pending_withdrawals?.amount)}
            sub={`${finance.pending_withdrawals?.count || 0} requests`}
            tone="orange"
          />
          <MetricCard
            label="Courier Payouts Pending"
            value={formatMoney(finance.pending_withdrawals?.amount)}
            sub="Shared withdrawal queue"
            tone="orange"
          />
          <MetricCard label="Collector Deposits" value={null} na />
          <MetricCard label="Outstanding Rent" value={null} na />
          <MetricCard label="Net Profit Estimate" value={formatMoney(netProfit)} tone="green" />
          <MetricCard
            label="Outstanding Refunds"
            value={formatMoney(finance.outstanding_refunds?.amount)}
            sub={`${finance.outstanding_refunds?.count || 0} open`}
            tone="red"
          />
        </div>
      </section>

      {/* SECTION 4 — OPERATIONAL HEALTH */}
      <section id="ceo-health" className="ceo-exec__section">
        <h2 className="ceo-exec__section-title"><span>❤️</span> Operational Health</h2>
        <div className="ceo-exec__grid ceo-exec__grid--metrics">
          <MetricCard
            label="Ride Completion Rate"
            value={`${Math.max(0, 100 - (overview.cancellation_rate_pct || 0)).toFixed(1)}%`}
            tone="green"
          />
          <MetricCard label="Driver Acceptance Rate" value={`${overview.driver_acceptance_rate_pct}%`} />
          <MetricCard label="Average ETA / Wait" value={`${overview.average_eta_minutes ?? fleet.average_wait_time_minutes ?? "—"} min`} />
          <MetricCard label="Average Rating" value={overview.customer_satisfaction || "—"} tone="gold" />
          <MetricCard label="Cancelled Rides Today" value={overview.cancelled_rides_today} tone="red" />
          <MetricCard label="Failed Payments" value={overview.failed_payments_today} tone="red" />
          <MetricCard label="Support Tickets" value={ops.support_queue ?? support.open_tickets} tone="orange" />
          <MetricCard
            label="Critical Alerts"
            value={(ops.emergency_cases || 0) + (ops.sos_events_24h || 0) + (ai.fraud_alerts?.length || 0)}
            tone="red"
          />
          <MetricCard label="Platform Health Score" value={overview.platform_health_score} tone="green" />
        </div>
        <h3 className="ceo-exec__subsection-title">Driver Document Compliance</h3>
        <div className="ceo-exec__grid ceo-exec__grid--metrics">
          <MetricCard label="Total Drivers" value={compliance.total_drivers ?? "—"} />
          <MetricCard label="Verified Drivers" value={compliance.verified_drivers ?? "—"} tone="green" />
          <MetricCard
            label="Pending Reviews"
            value={compliance.pending_reviews ?? ops.driver_verification_queue ?? "—"}
            tone="orange"
          />
          <MetricCard
            label="Expired Documents"
            value={compliance.expired_documents ?? ops.driver_expired_documents ?? "—"}
            tone="red"
          />
          <MetricCard label="Rejected Documents" value={compliance.rejected_documents ?? "—"} tone="red" />
          <MetricCard
            label="Compliance %"
            value={
              compliance.compliance_percentage != null
                ? `${compliance.compliance_percentage}%`
                : "—"
            }
            tone="green"
            sub="Approved driver profiles / total registered"
          />
        </div>
      </section>

      {/* SECTION 5 — MAP */}
      <section id="ceo-map" className="ceo-exec__section">
        <h2 className="ceo-exec__section-title"><span>📍</span> Live Map</h2>
        <MapPanel mapData={executive?.map} demandZones={fleet.peak_demand_areas} />
      </section>

      {/* SECTION 6 — APPROVAL CENTER */}
      <section id="ceo-approvals" className="ceo-exec__section">
        <h2 className="ceo-exec__section-title"><span>✅</span> Approval Center</h2>
        <div className="ceo-exec__grid ceo-exec__grid--two">
          <div className="ceo-exec__card">
            <h3>Pending Drivers ({approvals.pending_drivers?.length || 0})</h3>
            <table className="ceo-exec__table">
              <thead>
                <tr><th>ID</th><th>Name</th><th>Action</th></tr>
              </thead>
              <tbody>
                {(approvals.pending_drivers || []).length === 0 ? (
                  <tr><td colSpan={3}>No pending drivers</td></tr>
                ) : (
                  approvals.pending_drivers.map((row) => (
                    <tr key={row.id}>
                      <td>{row.id}</td>
                      <td>{row.user__first_name} {row.user__last_name || row.user__email}</td>
                      <td>
                        <button
                          type="button"
                          className="success"
                          disabled={actionLoading[`driver-${row.id}`]}
                          onClick={() => handleApprove("driver", row.id)}
                        >
                          Approve
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="ceo-exec__card">
            <h3>Pending Couriers ({approvals.pending_couriers?.length || 0})</h3>
            <table className="ceo-exec__table">
              <thead>
                <tr><th>ID</th><th>Name</th><th>Action</th></tr>
              </thead>
              <tbody>
                {(approvals.pending_couriers || []).length === 0 ? (
                  <tr><td colSpan={3}>No pending couriers</td></tr>
                ) : (
                  approvals.pending_couriers.map((row) => (
                    <tr key={row.id}>
                      <td>{row.id}</td>
                      <td>{row.user__first_name} {row.user__last_name || row.user__email}</td>
                      <td>
                        <button
                          type="button"
                          className="success"
                          disabled={actionLoading[`courier-${row.id}`]}
                          onClick={() => handleApprove("courier", row.id)}
                        >
                          Approve
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="ceo-exec__card">
            <h3>Pending Merchants</h3>
            <table className="ceo-exec__table">
              <thead>
                <tr><th>ID</th><th>Business</th><th>Action</th></tr>
              </thead>
              <tbody>
                {(approvals.pending_merchants || []).map((row) => (
                  <tr key={row.id}>
                    <td>{row.id}</td>
                    <td>{row.business_name}</td>
                    <td>
                      <button type="button" className="success" onClick={() => handleApprove("merchant", row.id)}>
                        Approve
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="ceo-exec__card">
            <h3>Large Refunds</h3>
            <table className="ceo-exec__table">
              <thead>
                <tr><th>ID</th><th>Amount</th><th>User</th></tr>
              </thead>
              <tbody>
                {(approvals.pending_refunds || []).map((row) => (
                  <tr key={row.id}>
                    <td>{row.id}</td>
                    <td>{formatMoney(row.amount)}</td>
                    <td>{row.customer__email}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="ceo-exec__card ceo-exec__card--na">
            <h3>Landlords & Employee Accounts <span className="ceo-exec__na-badge">Real Estate v2</span></h3>
            <p className="ceo-exec__metric-sub">Landlord and internal employee onboarding queues activate with the Real Estate module.</p>
          </div>
        </div>
      </section>

      {/* SECTION 7 — EMPLOYEE MANAGEMENT */}
      <section id="ceo-staff" className="ceo-exec__section">
        <h2 className="ceo-exec__section-title"><span>👥</span> Employee Management</h2>
        {["collectors", "supervisors", "accountants", "support_agents", "maintenance"].map((team) => (
          <div key={team} className="ceo-exec__card" style={{ marginBottom: 14 }}>
            <h3>
              {team.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
              {team === "collectors" ? <span className="ceo-exec__na-badge">Real Estate v2</span> : null}
              <span className="ceo-exec__metric-sub" style={{ marginLeft: 8 }}>
                ({staff.totals?.[team] || 0})
              </span>
            </h3>
            {(staff.teams?.[team] || []).length === 0 ? (
              <p className="ceo-exec__metric-sub">
                {team === "collectors" ? "Collectors module not in v1.0" : "No staff assigned to this team"}
              </p>
            ) : (
              <table className="ceo-exec__table">
                <thead>
                  <tr><th>Name</th><th>Status</th><th>Tasks</th><th>Reports</th></tr>
                </thead>
                <tbody>
                  {staff.teams[team].map((member) => (
                    <tr key={member.id}>
                      <td>{member.name}</td>
                      <td><span className="ceo-exec__pill">{member.status}</span></td>
                      <td>{member.assigned_tasks}</td>
                      <td>{member.reports_pending}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}
      </section>

      {/* SECTION 8 — EXECUTIVE ANALYTICS */}
      <section id="ceo-analytics" className="ceo-exec__section">
        <h2 className="ceo-exec__section-title"><span>📈</span> Executive Analytics</h2>
        <div className="ceo-exec__grid ceo-exec__grid--two">
          <div className="ceo-exec__card">
            <h3>Revenue by Hour (Today)</h3>
            <BarChart
              data={(analytics.revenue_by_hour || []).filter((_, i) => i % 2 === 0)}
              valueKey="revenue"
              formatValue={(v) => formatMoney(v)}
            />
          </div>
          <div className="ceo-exec__card">
            <h3>Trips by Hour (Today)</h3>
            <BarChart data={(analytics.trips_by_hour || []).filter((_, i) => i % 2 === 0)} valueKey="count" />
          </div>
          <div className="ceo-exec__card">
            <h3>Revenue by Day (7d)</h3>
            <BarChart
              data={analytics.revenue_by_day || executive?.finance?.chart || []}
              valueKey="gross_revenue"
              labelKey="label"
              formatValue={(v) => formatMoney(v)}
            />
          </div>
          <div className="ceo-exec__card">
            <h3>Trips by City</h3>
            <table className="ceo-exec__table">
              <thead><tr><th>City</th><th>Revenue</th><th>Drivers</th></tr></thead>
              <tbody>
                {(analytics.trips_by_city || []).slice(0, 8).map((row) => (
                  <tr key={row.city_id}>
                    <td>{row.city_name}</td>
                    <td>{formatMoney(row.revenue_month)}</td>
                    <td>{row.driver_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="ceo-exec__grid ceo-exec__grid--three" style={{ marginTop: 14 }}>
          <div className="ceo-exec__card">
            <h3>Top Drivers</h3>
            <ul className="ceo-exec__metric-sub">
              {(analytics.top_drivers || []).slice(0, 5).map((d) => (
                <li key={d.driver_id}>{d.driver_name || d.name} — score {d.score}</li>
              ))}
            </ul>
          </div>
          <div className="ceo-exec__card">
            <h3>Top Couriers</h3>
            <ul className="ceo-exec__metric-sub">
              {(analytics.top_couriers || []).slice(0, 5).map((c) => (
                <li key={c.driver_id}>{c.driver__first_name} {c.driver__last_name} — {c.deliveries} deliveries</li>
              ))}
            </ul>
          </div>
          <div className="ceo-exec__card ceo-exec__card--na">
            <h3>Top Collectors / Landlords <span className="ceo-exec__na-badge">v2</span></h3>
            <p className="ceo-exec__metric-sub">Available when Real Estate module launches.</p>
          </div>
        </div>
      </section>

      {/* SECTION 9 — SECURITY CENTER */}
      <section id="ceo-security" className="ceo-exec__section">
        <h2 className="ceo-exec__section-title"><span>🔒</span> Security Center</h2>
        <div className="ceo-exec__grid ceo-exec__grid--metrics">
          <MetricCard label="Failed Logins (24h)" value={security.failed_logins_24h ?? 0} tone="red" />
          <MetricCard label="Locked / Blocked Accounts" value={security.blocked_accounts ?? 0} tone="red" />
          <MetricCard label="Fraud Alerts" value={security.open_fraud_flags ?? ai.fraud_alerts?.length ?? 0} tone="red" />
          <MetricCard label="Suspicious Transactions" value={security.duplicate_accounts ?? 0} tone="orange" />
          <MetricCard label="Server Health" value={health?.status ?? "—"} tone={health?.status === "ok" ? "green" : "orange"} />
          <MetricCard label="Database" value={health?.checks?.database ?? "—"} tone="green" />
          <MetricCard label="Redis" value={health?.checks?.redis ?? "—"} tone="green" />
          <MetricCard label="API Status" value={health?.checks?.api ?? health?.status ?? "—"} tone="green" />
          <MetricCard label="Celery Workers" value={health?.checks?.celery_workers ?? "—"} />
        </div>
        {(ai.fraud_alerts || []).length > 0 ? (
          <div className="ceo-exec__card ceo-exec__card--alert" style={{ marginTop: 14 }}>
            <h3>Active Fraud Alerts</h3>
            <ul>
              {ai.fraud_alerts.map((alert, idx) => (
                <li key={idx}>{alert.message || JSON.stringify(alert)}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      {/* SECTION 10 — CEO ACTION CENTER */}
      <section id="ceo-actions" className="ceo-exec__section">
        <h2 className="ceo-exec__section-title"><span>⚡</span> CEO Action Center</h2>
        <div className="ceo-exec__actions-row" style={{ marginBottom: 16 }}>
          <a href="#ceo-approvals" className="ceo-exec__toolbar button">Approve Drivers</a>
          <a href="#ceo-approvals" className="ceo-exec__toolbar button">Approve Couriers</a>
          <a href={ceoMasterReportUrl("daily")} download className="ceo-exec__toolbar button primary">View Daily Report</a>
          <a href={ceoMasterReportUrl("weekly")} download className="ceo-exec__toolbar button">View Weekly Report</a>
          <a href={ceoMasterReportUrl("monthly")} download className="ceo-exec__toolbar button">Export Financial Report</a>
        </div>
        <div className="ceo-exec__grid ceo-exec__grid--three">
          <div className="ceo-exec__card">
            <h3>Broadcast Notification</h3>
            <form onSubmit={handleBroadcast} className="ceo-exec__form">
              <input
                placeholder="Title"
                value={broadcastForm.title}
                onChange={(e) => setBroadcastForm({ ...broadcastForm, title: e.target.value })}
                required
              />
              <textarea
                placeholder="Message"
                rows={3}
                value={broadcastForm.message}
                onChange={(e) => setBroadcastForm({ ...broadcastForm, message: e.target.value })}
                required
              />
              <select
                value={broadcastForm.segment}
                onChange={(e) => setBroadcastForm({ ...broadcastForm, segment: e.target.value })}
              >
                <option value="all">All Users</option>
                <option value="riders">Riders</option>
                <option value="drivers">Drivers</option>
                <option value="couriers">Couriers</option>
                <option value="staff">Staff</option>
              </select>
              <button type="submit" className="primary">Send Broadcast</button>
            </form>
          </div>
          <div className="ceo-exec__card">
            <h3>Emergency Maintenance Mode</h3>
            <div className="ceo-exec__form">
              <input
                placeholder="Reason (optional)"
                value={freezeReason}
                onChange={(e) => setFreezeReason(e.target.value)}
              />
              <div className="ceo-exec__actions-row">
                <button type="button" className="danger" onClick={() => handleFreeze(true)}>Enable Maintenance</button>
                <button type="button" onClick={() => handleFreeze(false)}>Disable Maintenance</button>
              </div>
            </div>
          </div>
          <div className="ceo-exec__card">
            <h3>Pending Withdrawals ({withdrawals.length})</h3>
            {withdrawals.length === 0 ? (
              <p className="ceo-exec__metric-sub">No pending withdrawals.</p>
            ) : (
              withdrawals.map((w) => (
                <div key={w.id} style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <span>{formatMoney(w.amount)} #{w.id}</span>
                  <span>
                    <button type="button" className="success" disabled={actionLoading[`w-${w.id}`]} onClick={() => handleWithdrawal(w.id, true)}>✓</button>
                    <button type="button" className="danger" disabled={actionLoading[`w-${w.id}`]} onClick={() => handleWithdrawal(w.id, false)}>✗</button>
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
