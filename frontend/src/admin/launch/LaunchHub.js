import React, { useCallback, useEffect, useState } from "react";

import { formatMoney } from "../../marketConfig";
import {
  createIncident,
  exportIncidentReport,
  exportReconciliation,
  fetchLaunchHub,
  fetchSupportQueue,
  postAlertAck,
  updateIncident,
} from "./launchApi";
import "./LaunchHub.css";

const TABS = [
  { id: "control", label: "Launch Control" },
  { id: "incidents", label: "Incidents" },
  { id: "support", label: "Support" },
  { id: "onboarding", label: "Onboarding" },
  { id: "finance", label: "Finance" },
  { id: "kpis", label: "CEO KPIs" },
  { id: "alerts", label: "Alerts" },
  { id: "checklist", label: "Checklist" },
];

const TRAFFIC_ICON = { healthy: "🟢", warning: "🟡", critical: "🔴" };

function Traffic({ status, label }) {
  const key = status || "warning";
  return (
    <span className={`launch__traffic launch__traffic--${key}`}>
      {TRAFFIC_ICON[key] || "🟡"} {label || key}
    </span>
  );
}

function MetricCard({ label, value }) {
  return (
    <div className="launch__card">
      <div className="launch__card-label">{label}</div>
      <div className="launch__card-value">{value}</div>
    </div>
  );
}

export default function LaunchHub() {
  const [tab, setTab] = useState("control");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [supportFilters, setSupportFilters] = useState({ category: "", status: "", priority: "" });
  const [supportData, setSupportData] = useState(null);
  const [newIncident, setNewIncident] = useState({ title: "", severity: "medium", description: "" });

  const load = useCallback(async () => {
    try {
      setError("");
      const response = await fetchLaunchHub();
      setData(response.data);
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Failed to load launch hub");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSupport = useCallback(async () => {
    try {
      const params = {};
      if (supportFilters.category) params.category = supportFilters.category;
      if (supportFilters.status) params.status = supportFilters.status;
      if (supportFilters.priority) params.priority = supportFilters.priority;
      const response = await fetchSupportQueue(params);
      setSupportData(response.data);
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Failed to load support queue");
    }
  }, [supportFilters]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 20000);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (tab === "support") loadSupport();
  }, [tab, loadSupport]);

  const handleCreateIncident = async (event) => {
    event.preventDefault();
    if (!newIncident.title.trim()) return;
    await createIncident(newIncident);
    setNewIncident({ title: "", severity: "medium", description: "" });
    await load();
  };

  const handleAckAlert = async (alertId) => {
    await postAlertAck(alertId);
    await load();
  };

  const handleExportIncident = async (incidentId) => {
    const response = await exportIncidentReport(incidentId, "csv");
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement("a");
    link.href = url;
    link.download = `incident-${incidentId}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  const handleExportReconciliation = async () => {
    const response = await exportReconciliation("csv");
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement("a");
    link.href = url;
    link.download = "reconciliation.csv";
    link.click();
    window.URL.revokeObjectURL(url);
  };

  const handleIncidentStatus = async (incidentId, status) => {
    await updateIncident(incidentId, { status });
    await load();
  };

  if (loading && !data) {
    return <div className="launch">Loading launch hub…</div>;
  }

  const control = data?.control;
  const metrics = control?.metrics || {};
  const infra = control?.infrastructure || {};
  const incidents = data?.incidents || [];

  return (
    <div className="launch">
      <a href="/admin" className="launch__back">← Admin</a>
      <div className="launch__header">
        <div>
          <h1 className="launch__title">Launch Control Center</h1>
          <p className="launch__subtitle">Commercial launch preparation — Mauritania</p>
        </div>
        <Traffic status={control?.platform_status} label="Platform" />
      </div>

      <div className="launch__tabs">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`launch__tab ${tab === item.id ? "launch__tab--active" : ""}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {error && <div className="launch__error">{error}</div>}

      {tab === "control" && control && (
        <>
          <div className="launch__grid">
            <MetricCard label="Active users" value={metrics.active_users ?? 0} />
            <MetricCard label="Online drivers" value={metrics.online_drivers ?? 0} />
            <MetricCard label="Online couriers" value={metrics.online_couriers ?? 0} />
            <MetricCard label="Active rides" value={metrics.active_rides ?? 0} />
            <MetricCard label="Active deliveries" value={metrics.active_deliveries ?? 0} />
            <MetricCard label="Revenue today" value={formatMoney(metrics.revenue_today || 0)} />
            <MetricCard label="Withdrawals pending" value={metrics.withdrawals_pending ?? 0} />
            <MetricCard label="Failed payments" value={metrics.failed_payments_today ?? 0} />
          </div>
          <div className="launch__panel">
            <h3>Infrastructure</h3>
            <table className="launch__table">
              <thead>
                <tr><th>Service</th><th>Status</th></tr>
              </thead>
              <tbody>
                <tr><td>API uptime</td><td><Traffic status={infra.api?.traffic} /></td></tr>
                <tr><td>Database</td><td><Traffic status={infra.database?.traffic} /></td></tr>
                <tr><td>Redis</td><td><Traffic status={infra.redis?.traffic} /></td></tr>
                <tr><td>Celery ({infra.celery?.workers ?? 0} workers)</td><td><Traffic status={infra.celery?.traffic} /></td></tr>
                <tr><td>WebSocket</td><td><Traffic status={infra.websocket?.traffic} /></td></tr>
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "incidents" && (
        <>
          <form className="launch__form" onSubmit={handleCreateIncident}>
            <h3>Open incident</h3>
            <input placeholder="Title" value={newIncident.title} onChange={(e) => setNewIncident({ ...newIncident, title: e.target.value })} />
            <select value={newIncident.severity} onChange={(e) => setNewIncident({ ...newIncident, severity: e.target.value })}>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <textarea placeholder="Description" rows={3} value={newIncident.description} onChange={(e) => setNewIncident({ ...newIncident, description: e.target.value })} />
            <button type="submit" className="launch__btn launch__btn--primary">Create incident</button>
          </form>
          <div className="launch__panel">
            <h3>Incidents</h3>
            <table className="launch__table">
              <thead>
                <tr><th>Ref</th><th>Title</th><th>Severity</th><th>Status</th><th>Owner</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {incidents.map((row) => (
                  <tr key={row.id}>
                    <td>{row.reference}</td>
                    <td>{row.title}</td>
                    <td>{row.severity}</td>
                    <td>{row.status}</td>
                    <td>{row.owner_email || "—"}</td>
                    <td>
                      <button type="button" className="launch__btn" onClick={() => handleIncidentStatus(row.id, "investigating")}>Investigate</button>
                      {" "}
                      <button type="button" className="launch__btn" onClick={() => handleIncidentStatus(row.id, "resolved")}>Resolve</button>
                      {" "}
                      <button type="button" className="launch__btn" onClick={() => handleExportIncident(row.id)}>Export</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "support" && (
        <>
          <div className="launch__filters">
            <select value={supportFilters.category} onChange={(e) => setSupportFilters({ ...supportFilters, category: e.target.value })}>
              <option value="">All categories</option>
              <option value="driver">Driver</option>
              <option value="payment">Payment</option>
              <option value="delivery">Delivery</option>
            </select>
            <select value={supportFilters.status} onChange={(e) => setSupportFilters({ ...supportFilters, status: e.target.value })}>
              <option value="">All statuses</option>
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
            </select>
            <select value={supportFilters.priority} onChange={(e) => setSupportFilters({ ...supportFilters, priority: e.target.value })}>
              <option value="">All priorities</option>
              <option value="urgent">Urgent</option>
              <option value="normal">Normal</option>
            </select>
          </div>
          <div className="launch__grid">
            <MetricCard label="Open tickets" value={supportData?.counts?.open_tickets ?? data?.support?.counts?.open_tickets ?? 0} />
            <MetricCard label="Driver issues" value={supportData?.counts?.driver_issues ?? 0} />
            <MetricCard label="Payment issues" value={supportData?.counts?.payment_issues ?? 0} />
            <MetricCard label="Delivery issues" value={supportData?.counts?.delivery_issues ?? 0} />
          </div>
          <div className="launch__panel">
            <h3>Support queue</h3>
            <table className="launch__table">
              <thead>
                <tr><th>Category</th><th>Priority</th><th>Status</th><th>Subject</th><th>Created</th></tr>
              </thead>
              <tbody>
                {(supportData?.queue || data?.support?.queue || []).map((row) => (
                  <tr key={`${row.source}-${row.id}`}>
                    <td>{row.category}</td>
                    <td>{row.priority}</td>
                    <td>{row.status}</td>
                    <td>{row.subject}</td>
                    <td>{new Date(row.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "onboarding" && data?.onboarding && (
        <div className="launch__grid">
          <MetricCard label="Pending approval" value={data.onboarding.summary.pending_approval} />
          <MetricCard label="Rejected" value={data.onboarding.summary.rejected} />
          <MetricCard label="Missing documents" value={data.onboarding.summary.missing_documents} />
          <MetricCard label="Expired documents" value={data.onboarding.summary.expired_documents} />
          <MetricCard label="Avg approval (hrs)" value={data.onboarding.summary.average_approval_hours ?? "—"} />
        </div>
      )}

      {tab === "finance" && data?.finance && (
        <>
          <div className="launch__grid">
            <MetricCard label="Ride revenue" value={formatMoney(data.finance.ride_revenue)} />
            <MetricCard label="Delivery revenue" value={formatMoney(data.finance.delivery_revenue)} />
            <MetricCard label="Wallet balance" value={formatMoney(data.finance.wallet_balance)} />
            <MetricCard label="Pending withdrawals" value={formatMoney(data.finance.pending_withdrawals)} />
            <MetricCard label="Completed withdrawals" value={formatMoney(data.finance.completed_withdrawals)} />
            <MetricCard label="Refunds" value={formatMoney(data.finance.refunds)} />
            <MetricCard label="Commission" value={formatMoney(data.finance.commission)} />
          </div>
          <button type="button" className="launch__btn launch__btn--primary" onClick={handleExportReconciliation}>Export reconciliation (CSV)</button>
        </>
      )}

      {tab === "kpis" && data?.kpis && (
        <>
          <div className="launch__grid">
            <MetricCard label="DAU" value={data.kpis.users.dau} />
            <MetricCard label="WAU" value={data.kpis.users.wau} />
            <MetricCard label="MAU" value={data.kpis.users.mau} />
            <MetricCard label="Driver retention %" value={data.kpis.retention.driver_retention_pct ?? "—"} />
            <MetricCard label="Courier retention %" value={data.kpis.retention.courier_retention_pct ?? "—"} />
            <MetricCard label="Avg trip value" value={formatMoney(data.kpis.averages.trip_value)} />
            <MetricCard label="Avg delivery value" value={formatMoney(data.kpis.averages.delivery_value)} />
            <MetricCard label="Cancellation rate %" value={data.kpis.rates.cancellation_rate_pct} />
            <MetricCard label="Completion rate %" value={data.kpis.rates.completion_rate_pct} />
          </div>
          <div className="launch__panel">
            <h3>Growth (14 days — active users)</h3>
            <div className="launch__chart">
              {(data.kpis.growth_chart || []).map((point) => {
                const max = Math.max(...data.kpis.growth_chart.map((p) => p.active_users), 1);
                const height = Math.max(4, (point.active_users / max) * 100);
                return <div key={point.date} className="launch__bar" style={{ height: `${height}%` }} title={`${point.label}: ${point.active_users}`} />;
              })}
            </div>
          </div>
        </>
      )}

      {tab === "alerts" && (
        <div className="launch__panel">
          <h3>Active alerts</h3>
          <table className="launch__table">
            <thead>
              <tr><th>Type</th><th>Severity</th><th>Status</th><th>Message</th><th>Action</th></tr>
            </thead>
            <tbody>
              {(data?.alerts || []).map((alert) => (
                <tr key={alert.id}>
                  <td>{alert.alert_type}</td>
                  <td>{alert.severity}</td>
                  <td>{alert.status}</td>
                  <td>{alert.message}</td>
                  <td>
                    {alert.status === "active" && (
                      <button type="button" className="launch__btn" onClick={() => handleAckAlert(alert.id)}>Acknowledge</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "checklist" && data?.checklist && (
        <div className="launch__panel">
          <h3>Launch checklist — {data.checklist.progress.percent}% complete</h3>
          {Object.entries(data.checklist.sections).map(([key, section]) => (
            <div key={key} className="launch__checklist-section">
              <h4>{section.label}</h4>
              {section.items.map((item) => (
                <div key={item.key} className="launch__check-item">
                  <span>{item.done ? "✅" : "⬜"}</span>
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
