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
import AdminIcon from "../layouts/icons/AdminIcon";
import "./TrustSafetyCenter.css";
import useUrlTab from "../layouts/useUrlTab";
import { AdminPageTitle } from "../layouts/AdminPageHeading";

const TABS = [
  { id: "overview", label: "Overview", icon: "grid" },
  { id: "emergency", label: "Emergency (SOS)", icon: "alert" },
  { id: "monitoring", label: "Safety Monitoring", icon: "activity" },
  { id: "incidents", label: "Incident Queue", icon: "inbox" },
  { id: "drivers", label: "Driver Safety", icon: "car" },
  { id: "riders", label: "Rider Safety", icon: "users" },
  { id: "ceo", label: "CEO Dashboard", icon: "briefcase" },
  { id: "reports", label: "Reporting", icon: "bar-chart" },
  { id: "audit", label: "Audit Log", icon: "scroll" },
];

const STATUS_ACTIONS = [
  { status: "assigned", label: "Assign" },
  { status: "investigating", label: "Investigate" },
  { status: "resolved", label: "Resolve" },
  { status: "closed", label: "Close" },
];

const STATUS_TONE = {
  new: "info",
  assigned: "info",
  investigating: "warning",
  in_progress: "warning",
  resolved: "success",
  closed: "neutral",
};

function humanize(value) {
  if (value == null || value === "") return "—";
  if (String(value).toLowerCase() === "sos") return "SOS";
  const text = String(value).replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function sumOrNull(...values) {
  const numbers = values.filter((value) => typeof value === "number" && Number.isFinite(value));
  return numbers.length ? numbers.reduce((total, value) => total + value, 0) : null;
}

function display(value) {
  if (value == null || value === "") return "—";
  if (typeof value === "number" && !Number.isFinite(value)) return "—";
  return value;
}

function StatusChip({ status }) {
  const tone = STATUS_TONE[String(status || "").toLowerCase()] || "neutral";
  return <span className={`ts-chip ts-chip--${tone}`}>{humanize(status)}</span>;
}

function MetricCard({ label, value, sub, icon = "activity", tone = "neutral", critical = false }) {
  const resolvedTone = critical && Number(value) > 0 ? "danger" : tone;
  return (
    <div className={`ts-kpi ts-kpi--${resolvedTone}`}>
      <span className="ts-kpi__icon">
        <AdminIcon name={icon} size={18} />
      </span>
      <div className="ts-kpi__body">
        <div className="ts-kpi__label">{label}</div>
        <div className="ts-kpi__value">{display(value)}</div>
        {sub ? <div className="ts-kpi__sub">{sub}</div> : null}
      </div>
    </div>
  );
}

function Panel({ title, subtitle, icon, actions, children }) {
  return (
    <section className="ts-panel">
      <header className="ts-panel__head">
        <div className="ts-panel__title">
          {icon ? (
            <span className="ts-panel__icon">
              <AdminIcon name={icon} size={16} />
            </span>
          ) : null}
          <div>
            <h3>{title}</h3>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
        </div>
        {actions ? <div className="ts-panel__actions">{actions}</div> : null}
      </header>
      <div className="ts-panel__body">{children}</div>
    </section>
  );
}

function EmptyState({ icon = "inbox", title, hint }) {
  return (
    <div className="ts-empty">
      <AdminIcon name={icon} size={22} />
      <strong>{title}</strong>
      {hint ? <span>{hint}</span> : null}
    </div>
  );
}

function scoreTone(score) {
  if (score == null) return "neutral";
  if (score < 60) return "danger";
  if (score < 80) return "warning";
  return "success";
}

function ProfileFacts({ items }) {
  return (
    <dl className="ts-facts">
      {items.map(([label, value]) => (
        <div key={label} className="ts-facts__item">
          <dt>{label}</dt>
          <dd>{display(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function ReportView({ data }) {
  if (data == null) return <EmptyState icon="bar-chart" title="Select a report" hint="Choose a report type above." />;
  if (typeof data !== "object") return <p className="ts-muted">{String(data)}</p>;
  const entries = Object.entries(data);
  if (!entries.length) return <EmptyState icon="bar-chart" title="No data in this report" />;
  const scalars = entries.filter(([, value]) => value == null || typeof value !== "object");
  const groups = entries.filter(([, value]) => value != null && typeof value === "object");
  return (
    <div className="ts-report">
      {scalars.length ? <ProfileFacts items={scalars.map(([key, value]) => [humanize(key), typeof value === "boolean" ? (value ? "Yes" : "No") : value])} /> : null}
      {groups.map(([key, value]) => (
        <div key={key} className="ts-report__group">
          <h4>{humanize(key)}</h4>
          {Array.isArray(value) ? (
            value.length ? (
              <ul className="ts-list">
                {value.slice(0, 20).map((row, index) => (
                  <li key={index}>
                    {row && typeof row === "object"
                      ? Object.entries(row).map(([k, v]) => `${humanize(k)}: ${v == null || typeof v === "object" ? "—" : v}`).join(" · ")
                      : String(row)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ts-muted">No records.</p>
            )
          ) : (
            <ProfileFacts items={Object.entries(value).map(([k, v]) => [humanize(k), v == null || typeof v === "object" ? "—" : v])} />
          )}
        </div>
      ))}
    </div>
  );
}

export default function TrustSafetyCenter() {
  const [tab, setTab] = useUrlTab(TABS.map((item) => item.id), "overview");
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

  const openIncidents = sumOrNull(queueSummary.new, queueSummary.assigned, queueSummary.investigating);
  const safetyScore = data?.safety_score;
  const sosTrips = activeTrips.filter((trip) => trip.active_sos_count > 0);

  return (
    <div className="ts">
      <header className="ts-hero">
        <div className="ts-hero__text">
          <p className="ts-hero__eyebrow">
            <AdminIcon name="shield-check" size={14} /> Security & Compliance
          </p>
          <h1><AdminPageTitle>Trust & Safety Center</AdminPageTitle></h1>
          <p>Emergency SOS, safety monitoring, incident management, safety profiles and executive reporting.</p>
        </div>
        <div className="ts-hero__side">
          <div className={`ts-score ts-score--${scoreTone(safetyScore)}`}>
            <span className="ts-score__label">Safety score</span>
            <span className="ts-score__value">{display(safetyScore)}</span>
          </div>
          <button type="button" className="ts-btn" onClick={load}>
            <AdminIcon name="refresh" size={15} /> Refresh
          </button>
        </div>
      </header>

      {error ? (
        <div className="ts-alert" role="alert">
          <AdminIcon name="alert" size={16} /> {error}
        </div>
      ) : null}
      {loading && !data ? <p className="ts-muted">Loading Trust & Safety Center…</p> : null}

      <nav className="ts-tabs" role="tablist" aria-label="Trust & Safety sections">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={`ts-tab ${tab === item.id ? "ts-tab--active" : ""}`}
            onClick={() => setTab(item.id)}
          >
            <AdminIcon name={item.icon} size={15} />
            {item.label}
          </button>
        ))}
      </nav>

      {tab === "overview" && data ? (
        <>
          <div className="ts-kpis">
            <MetricCard label="Open incidents" value={openIncidents} icon="inbox" tone="info" />
            <MetricCard label="Critical open" value={queueSummary.critical_open} icon="alert" critical />
            <MetricCard label="Monitoring alerts" value={monitoring.alert_count} icon="activity" tone="warning" />
            <MetricCard label="SOS (24h)" value={kpi.last_24h?.sos} icon="bell" critical />
            <MetricCard label="Active trips" value={activeTrips.length} icon="route" tone="success" />
            <MetricCard
              label="Avg resolution"
              value={data.ceo_preview?.avg_resolution_hours ? `${data.ceo_preview.avg_resolution_hours}h` : null}
              icon="clock"
              tone="info"
            />
          </div>
          <Panel title="Recent emergency alerts" subtitle="Latest SOS incidents reported on the platform." icon="alert">
            {emergencyList.length === 0 ? (
              <EmptyState icon="shield-check" title="No SOS alerts" hint="Emergency alerts appear here as soon as they are raised." />
            ) : (
              <div className="ts-stack">
                {emergencyList.slice(0, 8).map((incident) => (
                  <IncidentCard key={incident.id} incident={incident} onAction={handleIncidentAction} compact />
                ))}
              </div>
            )}
          </Panel>
        </>
      ) : null}

      {tab === "emergency" && (
        <>
          <div className="ts-kpis">
            <MetricCard label="Active SOS trips" value={sosTrips.length} icon="alert" critical />
            <MetricCard label="Live trips" value={activeTrips.length} icon="route" tone="success" />
          </div>
          <Panel title="Active SOS & live trips" subtitle="Trips in progress, SOS first." icon="route">
            {activeTrips.length === 0 ? (
              <EmptyState icon="route" title="No live trips" />
            ) : (
              <div className="ts-stack">
                {activeTrips.map((trip) => (
                  <article key={trip.ride_id} className={`ts-item ${trip.active_sos_count ? "ts-item--critical" : ""}`}>
                    <div className="ts-item__main">
                      <div className="ts-item__title">
                        <strong>Ride #{trip.ride_id}</strong>
                        {trip.active_sos_count ? <span className="ts-chip ts-chip--danger">SOS ×{trip.active_sos_count}</span> : null}
                      </div>
                      <p>{trip.pickup} → {trip.destination}</p>
                      <p className="ts-muted">Driver: {trip.driver_name || "Unassigned"}</p>
                    </div>
                    <StatusChip status={trip.status} />
                  </article>
                ))}
              </div>
            )}
          </Panel>
          <Panel title="Recent SOS incidents" icon="bell">
            {(incidents.incidents || []).filter((i) => i.incident_type === "sos").length === 0 ? (
              <EmptyState icon="shield-check" title="No SOS incidents" />
            ) : (
              <div className="ts-stack">
                {(incidents.incidents || []).filter((i) => i.incident_type === "sos").map((incident) => (
                  <IncidentCard key={incident.id} incident={incident} onAction={handleIncidentAction} />
                ))}
              </div>
            )}
          </Panel>
        </>
      )}

      {tab === "monitoring" && (
        <Panel
          title="Safety monitoring alerts"
          subtitle="Automatic detection of route deviations, long stops and other risks."
          icon="activity"
          actions={
            <button type="button" className="ts-btn ts-btn--primary" onClick={handleMonitoringScan}>
              <AdminIcon name="search" size={15} /> Run scan
            </button>
          }
        >
          {Object.keys(monitoring.by_type || {}).length ? (
            <div className="ts-kpis">
              {Object.entries(monitoring.by_type || {}).map(([type, count]) => (
                <MetricCard key={type} label={humanize(type)} value={count} icon="activity" tone="warning" />
              ))}
            </div>
          ) : null}
          {(monitoring.alerts || []).length === 0 ? (
            <EmptyState icon="shield-check" title="No monitoring alerts" hint="Run a scan to check live trips." />
          ) : (
            <div className="ts-stack">
              {(monitoring.alerts || []).map((alert) => (
                <article key={alert.id} className={`ts-item ${alert.severity === "critical" ? "ts-item--critical" : ""}`}>
                  <div className="ts-item__main">
                    <div className="ts-item__title">
                      <strong>{alert.label || humanize(alert.event_type)}</strong>
                    </div>
                    <p>{alert.message}</p>
                    {alert.ride_id ? <p className="ts-muted">Ride #{alert.ride_id}</p> : null}
                  </div>
                  <span className={`ts-chip ts-chip--${alert.severity === "critical" ? "danger" : "warning"}`}>{humanize(alert.severity || "alert")}</span>
                </article>
              ))}
            </div>
          )}
        </Panel>
      )}

      {tab === "incidents" && (
        <Panel
          title="Incident queue"
          subtitle="Assign, investigate and resolve reported incidents."
          icon="inbox"
          actions={
            <label className="ts-field">
              <span>Status</span>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">All statuses</option>
                <option value="new">New</option>
                <option value="assigned">Assigned</option>
                <option value="investigating">Investigating</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>
            </label>
          }
        >
          <div className="ts-kpis">
            <MetricCard label="New" value={queueSummary.new} icon="inbox" tone="info" />
            <MetricCard label="Assigned" value={queueSummary.assigned} icon="user-check" tone="info" />
            <MetricCard label="Investigating" value={queueSummary.investigating} icon="search" tone="warning" />
            <MetricCard label="Resolved" value={queueSummary.resolved} icon="check-square" tone="success" />
            <MetricCard label="Closed" value={queueSummary.closed} icon="lock" />
          </div>
          {(incidents.incidents || []).length === 0 ? (
            <EmptyState icon="inbox" title="No incidents match this filter" />
          ) : (
            <div className="ts-stack">
              {(incidents.incidents || []).map((incident) => (
                <IncidentCard key={incident.id} incident={incident} onAction={handleIncidentAction} />
              ))}
            </div>
          )}
        </Panel>
      )}

      {tab === "drivers" && (
        <Panel title="Driver safety profile" subtitle="Ratings, reports, document violations and emergencies." icon="car">
          <form
            className="ts-search"
            onSubmit={(e) => {
              e.preventDefault();
              loadDriverProfile();
            }}
          >
            <AdminIcon name="search" size={16} />
            <input type="number" placeholder="Driver user ID" value={profileId} onChange={(e) => setProfileId(e.target.value)} />
            <button type="submit" className="ts-btn ts-btn--primary">Load profile</button>
          </form>
          {driverProfile ? (
            <>
              <div className="ts-profile-head">
                <strong>{driverProfile.user?.name}</strong>
                <span className="ts-muted">{driverProfile.user?.email}</span>
                {driverProfile.is_suspended ? <span className="ts-chip ts-chip--danger">Suspended</span> : <span className="ts-chip ts-chip--success">Active</span>}
              </div>
              <ProfileFacts
                items={[
                  ["Rating", driverProfile.ratings?.average],
                  ["Rated trips", driverProfile.ratings?.count],
                  ["Accidents / reports", driverProfile.accidents],
                  ["Document violations", driverProfile.document_violations?.length || 0],
                  ["Complaints", driverProfile.complaints?.length || 0],
                  ["Emergencies", driverProfile.emergency_history?.length || 0],
                ]}
              />
            </>
          ) : (
            <EmptyState icon="car" title="No driver selected" hint="Enter a driver user ID to view safety history." />
          )}
        </Panel>
      )}

      {tab === "riders" && (
        <Panel title="Rider safety profile" subtitle="Cancellations, abuse and fraud reports, disputes and blacklist status." icon="users">
          <form
            className="ts-search"
            onSubmit={(e) => {
              e.preventDefault();
              loadRiderProfile();
            }}
          >
            <AdminIcon name="search" size={16} />
            <input type="number" placeholder="Rider user ID" value={profileId} onChange={(e) => setProfileId(e.target.value)} />
            <button type="submit" className="ts-btn ts-btn--primary">Load profile</button>
          </form>
          {riderProfile ? (
            <>
              <div className="ts-profile-head">
                <strong>{riderProfile.user?.name}</strong>
                <span className="ts-muted">{riderProfile.user?.email}</span>
                {riderProfile.blacklist?.is_blacklisted ? <span className="ts-chip ts-chip--danger">Blacklisted</span> : <span className="ts-chip ts-chip--success">In good standing</span>}
              </div>
              <ProfileFacts
                items={[
                  ["Cancellations (30d)", riderProfile.frequent_cancellations],
                  ["Abuse reports", riderProfile.abuse_reports],
                  ["Fraud flags", riderProfile.fraud_reports?.length || 0],
                  ["Payment disputes", riderProfile.payment_disputes?.length || 0],
                ]}
              />
            </>
          ) : (
            <EmptyState icon="users" title="No rider selected" hint="Enter a rider user ID to view safety history." />
          )}
        </Panel>
      )}

      {tab === "ceo" && (
        ceoData ? (
          <>
            <div className="ts-kpis">
              <MetricCard label="Safety score" value={ceoData.safety_score} icon="shield-check" tone={scoreTone(ceoData.safety_score)} />
              <MetricCard label="Open incidents" value={ceoData.open_incidents} icon="inbox" tone="info" />
              <MetricCard label="Emergency alerts (24h)" value={ceoData.emergency_alerts_24h} icon="alert" critical />
              <MetricCard label="Avg resolution" value={ceoData.avg_resolution_hours ? `${ceoData.avg_resolution_hours}h` : null} icon="clock" tone="info" />
              <MetricCard label="Monitoring alerts" value={ceoData.monitoring_alerts} icon="activity" tone="warning" />
            </div>
            <div className="ts-columns">
              <Panel title="High-risk areas" subtitle="Locations with the most SOS alerts." icon="map-pin">
                {(ceoData.high_risk_areas || []).length === 0 ? (
                  <EmptyState icon="map-pin" title="No high-risk areas" />
                ) : (
                  <ul className="ts-list">
                    {(ceoData.high_risk_areas || []).slice(0, 6).map((area, index) => (
                      <li key={index}>
                        <span>{area.lat?.toFixed?.(3)}, {area.lng?.toFixed?.(3)}</span>
                        <span className="ts-muted">{display(area.sos)} SOS · {display(area.rides)} active rides</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
              <Panel title="Repeat offenders" subtitle="Accounts with several reported incidents." icon="user">
                {(ceoData.repeat_offenders || []).length === 0 ? (
                  <EmptyState icon="user-check" title="No repeat offenders" />
                ) : (
                  <ul className="ts-list">
                    {(ceoData.repeat_offenders || []).map((user) => (
                      <li key={user.user_id}>
                        <span>{user.name} <span className="ts-muted">({humanize(user.role)})</span></span>
                        <span className="ts-chip ts-chip--warning">{display(user.incident_count)} incidents</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          </>
        ) : (
          <p className="ts-muted">Loading CEO safety dashboard…</p>
        )
      )}

      {tab === "reports" && (
        <Panel
          title="Safety reporting"
          subtitle="KPI and periodic safety reports."
          icon="bar-chart"
          actions={
            <div className="ts-segmented">
              {["kpi", "daily", "weekly", "monthly"].map((type) => (
                <button
                  key={type}
                  type="button"
                  className={reportType === type ? "ts-segmented__btn ts-segmented__btn--active" : "ts-segmented__btn"}
                  onClick={() => setReportType(type)}
                >
                  {type === "kpi" ? "Safety KPI" : humanize(type)}
                </button>
              ))}
            </div>
          }
        >
          <ReportView data={reportData} />
        </Panel>
      )}

      {tab === "audit" && (
        <div className="ts-columns">
          <Panel title="Audit trail" subtitle="Every Trust & Safety action, newest first." icon="scroll">
            {(audit.audit_trail || []).length === 0 ? (
              <EmptyState icon="scroll" title="No audit entries" />
            ) : (
              <ol className="ts-timeline">
                {(audit.audit_trail || []).map((entry) => (
                  <li key={entry.id}>
                    <strong>{entry.summary}</strong>
                    <span className="ts-muted">
                      {humanize(entry.action)} · {entry.actor || "System"} · {entry.created_at ? new Date(entry.created_at).toLocaleString() : "—"}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
          <Panel title="Response logs" subtitle="Actions taken on incidents." icon="clipboard">
            {(audit.response_logs || []).length === 0 ? (
              <EmptyState icon="clipboard" title="No response logs" />
            ) : (
              <ol className="ts-timeline">
                {(audit.response_logs || []).map((log) => (
                  <li key={log.id}>
                    <strong>{log.incident_reference}</strong>
                    <span className="ts-muted">{humanize(log.action)} · {log.actor_name || "System"}</span>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}

function IncidentCard({ incident, onAction, compact = false }) {
  const critical = incident.priority === "Critical" || incident.severity === "critical";
  return (
    <article className={`ts-item ${critical ? "ts-item--critical" : ""}`}>
      <div className="ts-item__main">
        <div className="ts-item__title">
          <strong>{incident.reference}</strong>
          <span className="ts-muted">{humanize(incident.incident_type)}</span>
          {incident.priority ? (
            <span className={`ts-chip ts-chip--${critical ? "danger" : "neutral"}`}>{incident.priority}</span>
          ) : null}
        </div>
        <p>{incident.description || "No description"}</p>
        {!compact ? (
          <p className="ts-muted">
            Reporter: {incident.reporter?.name || "—"}
            {incident.reporter?.role ? ` (${humanize(incident.reporter.role)})` : ""}
            {incident.latitude && incident.longitude ? (
              <>
                {" · "}
                <a href={`https://www.google.com/maps?q=${incident.latitude},${incident.longitude}`} target="_blank" rel="noreferrer">
                  Open GPS location
                </a>
              </>
            ) : null}
          </p>
        ) : null}
        {!compact ? (
          <div className="ts-actions">
            {STATUS_ACTIONS.map((action) => (
              <button key={action.status} type="button" className="ts-btn ts-btn--sm" onClick={() => onAction(incident, action.status)}>
                {action.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <StatusChip status={incident.status} />
    </article>
  );
}
