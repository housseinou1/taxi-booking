import React, { useCallback, useEffect, useState } from "react";

import {
  fetchCeoSafetyDashboard,
  fetchDriverSafetyProfile,
  fetchIncidentQueue,
  fetchMonitoringPanel,
  fetchRiderSafetyProfile,
  fetchSafetyReport,
  fetchTrustSafetyAudit,
  fetchTrustSafetyDashboard,
  runMonitoringScan,
  updateIncident,
} from "./trustSafetyApi";
import "../beta/BetaDashboard.css";
import "./TrustSafetyCenter.css";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "emergency", label: "Emergency (SOS)" },
  { id: "monitoring", label: "Safety Monitoring" },
  { id: "incidents", label: "Incident Queue" },
  { id: "drivers", label: "Driver Safety" },
  { id: "riders", label: "Rider Safety" },
  { id: "ceo", label: "CEO Dashboard" },
  { id: "reports", label: "Reporting" },
  { id: "audit", label: "Audit Log" },
];

const STATUS_ACTIONS = [
  { status: "assigned", label: "Assign" },
  { status: "investigating", label: "Investigate" },
  { status: "resolved", label: "Resolve" },
  { status: "closed", label: "Close" },
];

function MetricCard({ label, value, sub, critical = false }) {
  return (
    <div className={`beta__card ${critical ? "trust-safety-critical" : ""}`}>
      <div className="beta__card-label">{label}</div>
      <div className="beta__card-value">{value ?? "—"}</div>
      {sub ? <div className="beta__card-sub">{sub}</div> : null}
    </div>
  );
}

function scoreClass(score) {
  if (score == null) return "";
  if (score < 60) return "trust-safety-score--low";
  if (score < 80) return "trust-safety-score--mid";
  return "trust-safety-score--high";
}

export default function TrustSafetyCenter() {
  const [tab, setTab] = useState("overview");
  const [data, setData] = useState(null);
  const [ceoData, setCeoData] = useState(null);
  const [reportData, setReportData] = useState(null);
  const [reportType, setReportType] = useState("kpi");
  const [incidents, setIncidents] = useState({ summary: {}, incidents: [] });
  const [monitoring, setMonitoring] = useState({ alerts: [], by_type: {} });
  const [audit, setAudit] = useState({ audit_trail: [], response_logs: [] });
  const [profileId, setProfileId] = useState("");
  const [driverProfile, setDriverProfile] = useState(null);
  const [riderProfile, setRiderProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      const dashboard = await fetchTrustSafetyDashboard();
      setData(dashboard);
      setMonitoring(dashboard.monitoring || { alerts: [], by_type: {} });
      setIncidents(dashboard.incident_queue || { summary: {}, incidents: [] });

      if (tab === "ceo") {
        setCeoData(await fetchCeoSafetyDashboard());
      }
      if (tab === "reports") {
        setReportData(await fetchSafetyReport(reportType));
      }
      if (tab === "audit") {
        setAudit(await fetchTrustSafetyAudit(80));
      }
      if (tab === "incidents") {
        const queue = await fetchIncidentQueue(statusFilter ? { status: statusFilter } : {});
        setIncidents(queue);
      }
      if (tab === "monitoring") {
        setMonitoring(await fetchMonitoringPanel());
      }
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Failed to load Trust & Safety Center");
    } finally {
      setLoading(false);
    }
  }, [tab, statusFilter, reportType]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 20000);
    return () => clearInterval(interval);
  }, [load]);

  const handleIncidentAction = async (incident, status) => {
    const notes =
      status === "resolved" || status === "closed"
        ? window.prompt("Resolution notes:", incident.resolution_notes || "")
        : incident.resolution_notes || "";
    if ((status === "resolved" || status === "closed") && !notes?.trim()) return;
    await updateIncident(incident.id, { status, resolution_notes: notes });
    await load();
  };

  const handleMonitoringScan = async () => {
    await runMonitoringScan();
    setMonitoring(await fetchMonitoringPanel());
  };

  const loadDriverProfile = async () => {
    if (!profileId) return;
    setDriverProfile(await fetchDriverSafetyProfile(profileId));
  };

  const loadRiderProfile = async () => {
    if (!profileId) return;
    setRiderProfile(await fetchRiderSafetyProfile(profileId));
  };

  const kpi = data?.kpi || {};
  const queueSummary = incidents.summary || data?.incident_queue?.summary || {};
  const emergencyList = data?.recent_emergencies || [];
  const activeTrips = data?.active_trips || [];

  return (
    <div className="beta">
      <header className="beta__header">
        <div>
          <p className="beta__eyebrow">Phase 29 · Closed Beta</p>
          <h1>Trust & Safety Center</h1>
          <p className="beta__subtitle">
            Emergency SOS, safety monitoring, incident management, profiles, CEO metrics, and reporting.
          </p>
        </div>
        <div className={`trust-safety-score ${scoreClass(data?.safety_score)}`}>
          Safety score: {data?.safety_score ?? "—"}
        </div>
      </header>

      {error ? <p className="beta__error">{error}</p> : null}
      {loading && !data ? <p>Loading Trust & Safety Center…</p> : null}

      <div className="trust-safety-tabs">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`trust-safety-tab ${tab === item.id ? "trust-safety-tab--active" : ""}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "overview" && data ? (
        <>
          <div className="trust-safety-grid">
            <MetricCard label="Open incidents" value={queueSummary.new + queueSummary.assigned + queueSummary.investigating} />
            <MetricCard label="Critical open" value={queueSummary.critical_open} critical={queueSummary.critical_open > 0} />
            <MetricCard label="Monitoring alerts" value={monitoring.alert_count} />
            <MetricCard label="SOS (24h)" value={kpi.last_24h?.sos} critical={kpi.last_24h?.sos > 0} />
            <MetricCard label="Active trips" value={activeTrips.length} />
            <MetricCard label="Avg resolution (CEO)" value={data.ceo_preview?.avg_resolution_hours ? `${data.ceo_preview.avg_resolution_hours}h` : "—"} />
          </div>
          <section className="trust-safety-panel">
            <h3>Recent emergency alerts</h3>
            {emergencyList.length === 0 ? <p>No SOS alerts yet.</p> : null}
            {emergencyList.slice(0, 8).map((incident) => (
              <IncidentCard key={incident.id} incident={incident} onAction={handleIncidentAction} compact />
            ))}
          </section>
        </>
      ) : null}

      {tab === "emergency" && (
        <section className="trust-safety-panel">
          <h3>Active SOS & live trips</h3>
          <div className="trust-safety-grid" style={{ marginBottom: "1rem" }}>
            <MetricCard label="Active SOS trips" value={activeTrips.filter((t) => t.active_sos_count > 0).length} critical />
            <MetricCard label="Live trips" value={activeTrips.length} />
          </div>
          {activeTrips.map((trip) => (
            <article
              key={trip.ride_id}
              className={`trust-safety-incident ${trip.active_sos_count ? "trust-safety-incident--critical" : ""}`}
            >
              <strong>Ride #{trip.ride_id}</strong> · {trip.status}
              {trip.active_sos_count ? ` · SOS x${trip.active_sos_count}` : ""}
              <p>{trip.pickup} → {trip.destination}</p>
              <p>Driver: {trip.driver_name || "Unassigned"}</p>
            </article>
          ))}
          <h3 style={{ marginTop: "1.5rem" }}>Recent SOS incidents</h3>
          {(incidents.incidents || []).filter((i) => i.incident_type === "sos").map((incident) => (
            <IncidentCard key={incident.id} incident={incident} onAction={handleIncidentAction} />
          ))}
        </section>
      )}

      {tab === "monitoring" && (
        <section className="trust-safety-panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3>Safety monitoring alerts</h3>
            <button type="button" onClick={handleMonitoringScan}>Run scan</button>
          </div>
          <div className="trust-safety-grid">
            {Object.entries(monitoring.by_type || {}).map(([type, count]) => (
              <MetricCard key={type} label={type.replaceAll("_", " ")} value={count} />
            ))}
          </div>
          {(monitoring.alerts || []).map((alert) => (
            <article key={alert.id} className={`trust-safety-incident ${alert.severity === "critical" ? "trust-safety-incident--critical" : ""}`}>
              <strong>{alert.label || alert.event_type}</strong>
              <p>{alert.message}</p>
              {alert.ride_id ? <p>Ride #{alert.ride_id}</p> : null}
            </article>
          ))}
        </section>
      )}

      {tab === "incidents" && (
        <section className="trust-safety-panel">
          <div style={{ display: "flex", gap: "12px", marginBottom: "12px" }}>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All statuses</option>
              <option value="new">New</option>
              <option value="assigned">Assigned</option>
              <option value="investigating">Investigating</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
          </div>
          <div className="trust-safety-grid">
            <MetricCard label="New" value={queueSummary.new} />
            <MetricCard label="Assigned" value={queueSummary.assigned} />
            <MetricCard label="Investigating" value={queueSummary.investigating} />
            <MetricCard label="Resolved" value={queueSummary.resolved} />
            <MetricCard label="Closed" value={queueSummary.closed} />
          </div>
          {(incidents.incidents || []).map((incident) => (
            <IncidentCard key={incident.id} incident={incident} onAction={handleIncidentAction} />
          ))}
        </section>
      )}

      {tab === "drivers" && (
        <section className="trust-safety-panel">
          <h3>Driver safety profile</h3>
          <div className="trust-safety-profile-search">
            <input
              type="number"
              placeholder="Driver user ID"
              value={profileId}
              onChange={(e) => setProfileId(e.target.value)}
            />
            <button type="button" onClick={loadDriverProfile}>Load profile</button>
          </div>
          {driverProfile ? (
            <div className="trust-safety-row">
              <p><strong>{driverProfile.user.name}</strong> · {driverProfile.user.email}</p>
              <p>Rating: {driverProfile.ratings.average ?? "—"} ({driverProfile.ratings.count} trips)</p>
              <p>Accidents/reports: {driverProfile.accidents} · Suspended: {driverProfile.is_suspended ? "Yes" : "No"}</p>
              <p>Document violations: {driverProfile.document_violations?.length || 0}</p>
              <p>Complaints: {driverProfile.complaints?.length || 0} · Emergencies: {driverProfile.emergency_history?.length || 0}</p>
            </div>
          ) : (
            <p>Enter a driver user ID to view safety history.</p>
          )}
        </section>
      )}

      {tab === "riders" && (
        <section className="trust-safety-panel">
          <h3>Rider safety profile</h3>
          <div className="trust-safety-profile-search">
            <input
              type="number"
              placeholder="Rider user ID"
              value={profileId}
              onChange={(e) => setProfileId(e.target.value)}
            />
            <button type="button" onClick={loadRiderProfile}>Load profile</button>
          </div>
          {riderProfile ? (
            <div className="trust-safety-row">
              <p><strong>{riderProfile.user.name}</strong> · {riderProfile.user.email}</p>
              <p>Cancellations (30d): {riderProfile.frequent_cancellations}</p>
              <p>Abuse reports: {riderProfile.abuse_reports}</p>
              <p>Fraud flags: {riderProfile.fraud_reports?.length || 0}</p>
              <p>Payment disputes: {riderProfile.payment_disputes?.length || 0}</p>
              <p>Blacklisted: {riderProfile.blacklist?.is_blacklisted ? "Yes" : "No"}</p>
            </div>
          ) : (
            <p>Enter a rider user ID to view safety history.</p>
          )}
        </section>
      )}

      {tab === "ceo" && ceoData ? (
        <>
          <div className="trust-safety-grid">
            <MetricCard label="Safety score" value={ceoData.safety_score} />
            <MetricCard label="Open incidents" value={ceoData.open_incidents} />
            <MetricCard label="Emergency alerts (24h)" value={ceoData.emergency_alerts_24h} critical />
            <MetricCard label="Avg resolution" value={ceoData.avg_resolution_hours ? `${ceoData.avg_resolution_hours}h` : "—"} />
            <MetricCard label="Monitoring alerts" value={ceoData.monitoring_alerts} />
          </div>
          <section className="trust-safety-panel">
            <h3>High-risk areas</h3>
            {(ceoData.high_risk_areas || []).slice(0, 6).map((area, index) => (
              <p key={index}>
                {area.lat?.toFixed?.(3)}, {area.lng?.toFixed?.(3)} — {area.sos} SOS · {area.rides} active rides
              </p>
            ))}
          </section>
          <section className="trust-safety-panel">
            <h3>Repeat offenders</h3>
            {(ceoData.repeat_offenders || []).map((user) => (
              <p key={user.user_id}>{user.name} ({user.role}) — {user.incident_count} incidents</p>
            ))}
          </section>
        </>
      ) : null}

      {tab === "reports" && (
        <section className="trust-safety-panel">
          <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
            {["kpi", "daily", "weekly", "monthly"].map((type) => (
              <button
                key={type}
                type="button"
                className={reportType === type ? "trust-safety-tab trust-safety-tab--active" : "trust-safety-tab"}
                onClick={() => setReportType(type)}
              >
                {type === "kpi" ? "Safety KPI" : `${type.charAt(0).toUpperCase()}${type.slice(1)} report`}
              </button>
            ))}
          </div>
          {reportData ? (
            <pre style={{ whiteSpace: "pre-wrap", fontSize: "13px" }}>{JSON.stringify(reportData, null, 2)}</pre>
          ) : (
            <p>Select a report type.</p>
          )}
        </section>
      )}

      {tab === "audit" && (
        <section className="trust-safety-panel">
          <h3>Audit trail</h3>
          {(audit.audit_trail || []).map((entry) => (
            <article key={entry.id} className="trust-safety-incident">
              <strong>{entry.summary}</strong>
              <p>{entry.action} · {entry.actor || "System"} · {new Date(entry.created_at).toLocaleString()}</p>
            </article>
          ))}
          <h3 style={{ marginTop: "1rem" }}>Response logs</h3>
          {(audit.response_logs || []).map((log) => (
            <article key={log.id} className="trust-safety-incident">
              <strong>{log.incident_reference}</strong>
              <p>{log.action} · {log.actor_name || "System"}</p>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}

function IncidentCard({ incident, onAction, compact = false }) {
  const critical = incident.priority === "Critical" || incident.severity === "critical";
  return (
    <article className={`trust-safety-incident ${critical ? "trust-safety-incident--critical" : ""}`}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
        <div>
          <strong>{incident.reference}</strong> · {incident.incident_type}
          <p>{incident.description || "No description"}</p>
          {!compact ? (
            <>
              <p>Status: {incident.status} · Priority: {incident.priority}</p>
              <p>Reporter: {incident.reporter?.name} ({incident.reporter?.role})</p>
              {incident.latitude && incident.longitude ? (
                <a href={`https://www.google.com/maps?q=${incident.latitude},${incident.longitude}`} target="_blank" rel="noreferrer">
                  Open GPS
                </a>
              ) : null}
            </>
          ) : null}
        </div>
        <span>{incident.status}</span>
      </div>
      {!compact ? (
        <div className="trust-safety-actions">
          {STATUS_ACTIONS.map((action) => (
            <button key={action.status} type="button" onClick={() => onAction(incident, action.status)}>
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </article>
  );
}
