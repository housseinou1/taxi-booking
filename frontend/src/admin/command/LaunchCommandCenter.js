import React, { useCallback, useEffect, useMemo, useState } from "react";

import { formatMoney } from "../../marketConfig";
import {
  createCommandIncident,
  exportCeoSummary,
  fetchCommandDashboard,
  postCommandAlertAction,
  postCommandBroadcast,
  postCommandIncidentAction,
  postCommandNotify,
  postOnboardingPause,
} from "./launchCommandApi";
import "../beta/BetaDashboard.css";
import "./LaunchCommandCenter.css";

const TABS = [
  { id: "live", label: "Live Operations" },
  { id: "heatmap", label: "City Heat Map" },
  { id: "alerts", label: "Operations Alerts" },
  { id: "actions", label: "Operations Actions" },
  { id: "ceo", label: "CEO Daily Summary" },
  { id: "audit", label: "Audit" },
];

const POLL_MS = 20000;

function MetricCard({ label, value, sub }) {
  return (
    <div className="beta__card">
      <div className="beta__card-label">{label}</div>
      <div className="beta__card-value">{value ?? "—"}</div>
      {sub ? <div className="beta__card-sub">{sub}</div> : null}
    </div>
  );
}

function StatusBadge({ status }) {
  const normalized = (status || "unknown").toLowerCase();
  const cls =
    normalized === "healthy" || normalized === "ok"
      ? "command-status--healthy"
      : normalized === "critical" || normalized === "error"
        ? "command-status--critical"
        : "command-status--warning";
  return <span className={`command-status ${cls}`}>{status || "Unknown"}</span>;
}

function HeatMapPanel({ heatMap }) {
  const markers = useMemo(() => {
    const heat = (heatMap?.heat_points || []).slice(0, 60).map((point, index) => ({
      id: `heat-${index}`,
      lat: point.lat,
      lng: point.lng,
      kind: "heat",
      intensity: point.intensity,
      label: point.label || "Demand",
    }));
    const live = heatMap?.live_markers || {};
    const drivers = (live.drivers || []).slice(0, 40).map((item) => ({ ...item, kind: "driver" }));
    const couriers = (live.couriers || []).slice(0, 40).map((item) => ({ ...item, kind: "courier" }));
    const shortages = (heatMap?.shortage_areas || []).slice(0, 20).map((item, index) => ({
      id: `shortage-${index}`,
      lat: item.lat,
      lng: item.lng,
      kind: "shortage",
      label: item.label,
    }));
    return [...heat, ...drivers, ...couriers, ...shortages];
  }, [heatMap]);

  if (!markers.length) {
    return <div className="command-map">No heat map data</div>;
  }

  const lats = markers.map((m) => m.lat);
  const lngs = markers.map((m) => m.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  return (
    <div className="command-map">
      {markers.map((marker) => {
        const x = maxLng === minLng ? 50 : ((marker.lng - minLng) / (maxLng - minLng)) * 100;
        const y = maxLat === minLat ? 50 : ((maxLat - marker.lat) / (maxLat - minLat)) * 100;
        return (
          <span
            key={`${marker.kind}-${marker.id}`}
            className={`command-map__marker command-map__marker--${marker.kind}`}
            style={{
              left: `${x}%`,
              top: `${y}%`,
              opacity: marker.intensity != null ? 0.4 + marker.intensity * 0.6 : 1,
            }}
            title={marker.label}
          />
        );
      })}
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

export default function LaunchCommandCenter() {
  const [tab, setTab] = useState("live");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [broadcastForm, setBroadcastForm] = useState({ audience: "drivers", title: "", message: "" });
  const [notifyForm, setNotifyForm] = useState({ user_id: "", app_type: "driver", title: "", message: "" });
  const [incidentForm, setIncidentForm] = useState({ title: "", description: "", severity: "medium" });
  const [actionLoading, setActionLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      setError("");
      const payload = await fetchCommandDashboard();
      setData(payload);
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Failed to load command center");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  const live = data?.live_operations || {};
  const heatMap = data?.heat_map || {};
  const alerts = data?.alerts?.alerts || [];
  const ceo = data?.ceo_summary || {};
  const auditEntries = data?.audit?.entries || [];
  const permissions = data?.permissions || {};
  const onboardingPaused = data?.onboarding_paused?.enabled;

  const handleBroadcast = async () => {
    setActionLoading(true);
    try {
      await postCommandBroadcast(broadcastForm);
      setBroadcastForm({ audience: "drivers", title: "", message: "" });
      await load();
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Broadcast failed");
    } finally {
      setActionLoading(false);
    }
  };

  const handleNotify = async () => {
    setActionLoading(true);
    try {
      await postCommandNotify({ ...notifyForm, user_id: Number(notifyForm.user_id) });
      setNotifyForm({ user_id: "", app_type: "driver", title: "", message: "" });
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Notify failed");
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleOnboarding = async () => {
    setActionLoading(true);
    try {
      await postOnboardingPause({ enabled: !onboardingPaused, reason: "Command center toggle" });
      await load();
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Onboarding toggle failed");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateIncident = async () => {
    setActionLoading(true);
    try {
      await createCommandIncident(incidentForm);
      setIncidentForm({ title: "", description: "", severity: "medium" });
      await load();
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Create incident failed");
    } finally {
      setActionLoading(false);
    }
  };

  const handleIncidentAction = async (incidentId, payload) => {
    setActionLoading(true);
    try {
      await postCommandIncidentAction(incidentId, payload);
      await load();
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Incident action failed");
    } finally {
      setActionLoading(false);
    }
  };

  const handleAlertAction = async (alertId, action) => {
    try {
      await postCommandAlertAction(alertId, action);
      await load();
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Alert action failed");
    }
  };

  const handleExportCeo = async (format) => {
    const response = await exportCeoSummary(format);
    const ext = format === "xlsx" ? "xlsx" : format === "pdf" ? "pdf" : "csv";
    downloadBlob(response, `ceo-daily-summary.${ext}`);
  };

  if (loading && !data) {
    return <div className="beta">Loading command center…</div>;
  }

  return (
    <div className="beta">
      <header className="beta__header">
        <div>
          <h1>Operations Command Center</h1>
          <p className="beta__subtitle">Daily operations for managers and CEO oversight</p>
        </div>
        <div className="command-toolbar">
          <StatusBadge status={live.platform_status} />
          <span className="beta__muted">Auto-refresh {POLL_MS / 1000}s</span>
          <button type="button" className="beta__btn" onClick={load}>
            Refresh now
          </button>
        </div>
      </header>

      {error ? <div className="beta__error">{error}</div> : null}

      <div className="command-tabs">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`command-tab ${tab === item.id ? "command-tab--active" : ""}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "live" ? (
        <section>
          <div className="beta__grid beta__grid--4">
            <MetricCard label="Active rides" value={live.active_rides} />
            <MetricCard label="Active deliveries" value={live.active_deliveries} />
            <MetricCard label="Online drivers" value={live.online_drivers} />
            <MetricCard label="Online couriers" value={live.online_couriers} />
            <MetricCard label="Open incidents" value={live.open_incidents} sub={`${live.open_safety_incidents || 0} safety · ${live.open_ops_incidents || 0} ops`} />
            <MetricCard label="Open support tickets" value={live.open_support_tickets} />
            <MetricCard label="Pending withdrawals" value={formatMoney(live.pending_withdrawals?.amount)} sub={`${live.pending_withdrawals?.count || 0} requests`} />
            <MetricCard label="Failed payments" value={live.failed_payments?.count} sub={formatMoney(live.failed_payments?.amount)} />
            <MetricCard label="System alerts" value={live.system_alerts} />
            <MetricCard label="Waiting riders" value={live.waiting_riders} />
          </div>
        </section>
      ) : null}

      {tab === "heatmap" ? (
        <section>
          <div className="beta__grid beta__grid--4" style={{ marginBottom: "1rem" }}>
            <MetricCard label="Ride demand" value={heatMap.ride_demand} />
            <MetricCard label="Delivery demand" value={heatMap.delivery_demand} />
            <MetricCard label="Driver density" value={heatMap.driver_density} />
            <MetricCard label="Courier density" value={heatMap.courier_density} />
          </div>
          <HeatMapPanel heatMap={heatMap} />
          <div className="beta__grid beta__grid--2" style={{ marginTop: "1rem" }}>
            <div className="beta__panel">
              <h3>Shortage areas</h3>
              {(heatMap.shortage_areas || []).slice(0, 8).map((area) => (
                <div key={`${area.lat}-${area.lng}`} className="beta__muted">
                  {area.label} — {area.waiting_riders || 0} waiting, {area.drivers_nearby || 0} drivers
                </div>
              ))}
            </div>
            <div className="beta__panel">
              <h3>Long ETA areas</h3>
              {(heatMap.long_eta_areas || []).slice(0, 8).map((area) => (
                <div key={area.ride_id} className="beta__muted">
                  Ride #{area.ride_id} — {area.wait_minutes} min wait · {area.label}
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {tab === "alerts" ? (
        <section>
          <div className="beta__muted" style={{ marginBottom: "0.75rem" }}>
            {data?.alerts?.total || 0} alerts · {data?.alerts?.critical_count || 0} critical
          </div>
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className={`command-alert ${alert.severity === "critical" ? "command-alert--critical" : ""}`}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
                <div>
                  <strong>{alert.category_label || alert.type}</strong>
                  <div>{alert.message || alert.title}</div>
                  <div className="beta__muted">{alert.source} · {alert.severity}</div>
                </div>
                {permissions.dispatch && alert.id && String(alert.id).match(/^\d+$/) ? (
                  <div className="command-actions">
                    <button type="button" onClick={() => handleAlertAction(alert.id, "ack")}>
                      Ack
                    </button>
                    <button type="button" onClick={() => handleAlertAction(alert.id, "resolve")}>
                      Resolve
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </section>
      ) : null}

      {tab === "actions" ? (
        <section className="beta__grid beta__grid--2">
          <div className="beta__panel">
            <h3>Send broadcast</h3>
            <div className="command-toolbar">
              <select
                value={broadcastForm.audience}
                onChange={(e) => setBroadcastForm({ ...broadcastForm, audience: e.target.value })}
              >
                <option value="drivers">Drivers</option>
                <option value="couriers">Couriers</option>
                <option value="riders">Riders</option>
                {permissions.ceo_actions ? <option value="all">All users</option> : null}
              </select>
              <input
                placeholder="Title"
                value={broadcastForm.title}
                onChange={(e) => setBroadcastForm({ ...broadcastForm, title: e.target.value })}
              />
              <textarea
                placeholder="Message"
                value={broadcastForm.message}
                onChange={(e) => setBroadcastForm({ ...broadcastForm, message: e.target.value })}
              />
              <button type="button" className="beta__btn" disabled={!permissions.dispatch || actionLoading} onClick={handleBroadcast}>
                Send broadcast
              </button>
            </div>
          </div>
          <div className="beta__panel">
            <h3>Contact driver / courier</h3>
            <div className="command-toolbar">
              <input
                placeholder="User ID"
                value={notifyForm.user_id}
                onChange={(e) => setNotifyForm({ ...notifyForm, user_id: e.target.value })}
              />
              <select
                value={notifyForm.app_type}
                onChange={(e) => setNotifyForm({ ...notifyForm, app_type: e.target.value })}
              >
                <option value="driver">Driver app</option>
                <option value="delivery">Delivery app</option>
              </select>
              <input
                placeholder="Title"
                value={notifyForm.title}
                onChange={(e) => setNotifyForm({ ...notifyForm, title: e.target.value })}
              />
              <textarea
                placeholder="Message"
                value={notifyForm.message}
                onChange={(e) => setNotifyForm({ ...notifyForm, message: e.target.value })}
              />
              <button type="button" className="beta__btn" disabled={!permissions.dispatch || actionLoading} onClick={handleNotify}>
                Send notification
              </button>
            </div>
          </div>
          <div className="beta__panel">
            <h3>Onboarding</h3>
            <p className="beta__muted">
              Driver onboarding is currently {onboardingPaused ? "paused" : "active"}.
            </p>
            <button type="button" className="beta__btn" disabled={!permissions.dispatch || actionLoading} onClick={handleToggleOnboarding}>
              {onboardingPaused ? "Resume onboarding" : "Pause onboarding"}
            </button>
          </div>
          <div className="beta__panel">
            <h3>Create incident</h3>
            <div className="command-toolbar">
              <input
                placeholder="Title"
                value={incidentForm.title}
                onChange={(e) => setIncidentForm({ ...incidentForm, title: e.target.value })}
              />
              <textarea
                placeholder="Description"
                value={incidentForm.description}
                onChange={(e) => setIncidentForm({ ...incidentForm, description: e.target.value })}
              />
              <select
                value={incidentForm.severity}
                onChange={(e) => setIncidentForm({ ...incidentForm, severity: e.target.value })}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
              <button type="button" className="beta__btn" disabled={!permissions.dispatch || actionLoading} onClick={handleCreateIncident}>
                Create incident
              </button>
            </div>
          </div>
          <div className="beta__panel" style={{ gridColumn: "1 / -1" }}>
            <h3>Open incidents</h3>
            <div className="beta__panel finance-table-wrap">
              <table className="beta__table">
                <thead>
                  <tr>
                    <th>Ref</th>
                    <th>Title</th>
                    <th>Type</th>
                    <th>Severity</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.incidents?.ops || []).map((item) => (
                    <tr key={`ops-${item.id}`}>
                      <td>{item.reference}</td>
                      <td>{item.title}</td>
                      <td>Ops</td>
                      <td>{item.severity}</td>
                      <td className="command-actions">
                        <button type="button" disabled={!permissions.dispatch} onClick={() => handleIncidentAction(item.id, { incident_type: "ops", action: "escalate" })}>
                          Escalate
                        </button>
                        <button type="button" disabled={!permissions.dispatch} onClick={() => handleIncidentAction(item.id, { incident_type: "ops", action: "resolve" })}>
                          Resolve
                        </button>
                      </td>
                    </tr>
                  ))}
                  {(data?.incidents?.safety?.incidents || []).map((item) => (
                    <tr key={`safety-${item.id}`}>
                      <td>{item.reference || item.id}</td>
                      <td>{item.summary || item.incident_type}</td>
                      <td>Safety</td>
                      <td>{item.severity}</td>
                      <td className="command-actions">
                        <button type="button" disabled={!permissions.dispatch} onClick={() => handleIncidentAction(item.id, { incident_type: "safety", action: "escalate" })}>
                          Escalate
                        </button>
                        <button type="button" disabled={!permissions.dispatch} onClick={() => handleIncidentAction(item.id, { incident_type: "safety", action: "resolve" })}>
                          Resolve
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : null}

      {tab === "ceo" ? (
        <section>
          <div className="command-toolbar">
            <button type="button" className="beta__btn" onClick={() => handleExportCeo("csv")}>
              Export CSV
            </button>
            <button type="button" className="beta__btn" onClick={() => handleExportCeo("xlsx")}>
              Export Excel
            </button>
            <button type="button" className="beta__btn" onClick={() => handleExportCeo("pdf")}>
              Export PDF
            </button>
          </div>
          <div className="beta__grid beta__grid--4">
            <MetricCard label="Revenue today" value={formatMoney(ceo.revenue?.gross_today_mru)} />
            <MetricCard label="Completed rides" value={ceo.trips?.completed_rides_today} />
            <MetricCard label="Completed deliveries" value={ceo.deliveries?.completed_deliveries_today} />
            <MetricCard label="Driver utilization" value={`${ceo.utilization?.driver_utilization_pct ?? "—"}%`} />
            <MetricCard label="Fleet utilization" value={`${ceo.utilization?.fleet_utilization_pct ?? "—"}%`} />
            <MetricCard label="New riders (7d)" value={ceo.customer_growth?.new_riders_7d} />
            <MetricCard label="Open support" value={ceo.support_summary?.open_tickets} />
            <MetricCard label="Open incidents" value={ceo.incident_summary?.open_count} />
            <MetricCard label="Failed payments" value={ceo.payment_summary?.failed_today} />
            <MetricCard label="Pending withdrawals" value={ceo.withdrawals?.pending} />
          </div>
        </section>
      ) : null}

      {tab === "audit" ? (
        <section className="beta__panel finance-table-wrap">
          <table className="beta__table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>User</th>
                <th>Action</th>
                <th>Before</th>
                <th>After</th>
                <th>Summary</th>
              </tr>
            </thead>
            <tbody>
              {auditEntries.map((entry) => (
                <tr key={entry.id}>
                  <td>{new Date(entry.timestamp).toLocaleString()}</td>
                  <td>{entry.user}</td>
                  <td>{entry.action}</td>
                  <td>{JSON.stringify(entry.before ?? "—")}</td>
                  <td>{JSON.stringify(entry.after ?? "—")}</td>
                  <td>{entry.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  );
}
