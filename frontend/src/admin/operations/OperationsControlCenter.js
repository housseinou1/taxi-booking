import React, { useCallback, useEffect, useMemo, useState } from "react";

import { formatMoney } from "../../marketConfig";
import { getStoredUser } from "../../auth/session";
import { updateSupportTicket } from "../beta/supportApi";
import {
  approveRefund,
  createCommandIncident,
  createGrowthPromo,
  fetchOperationsControlBundle,
  fetchRefundQueue,
  postAccountAction,
  postCancelRide,
  postCeoBroadcast,
  postCeoFreeze,
  postCommandIncidentAction,
  postForceAssign,
  postIncidentAction,
  postPauseDriver,
  postReassignRide,
  rejectRefund,
  searchSupportTickets,
} from "./operationsControlApi";
import { subscribeOperationsUpdates } from "./opsSocket";
import "./OperationsCenter.css";
import "./OperationsControlCenter.css";

const MODULES = [
  { id: "dispatch", label: "Live Dispatch" },
  { id: "drivers", label: "Driver Monitoring" },
  { id: "incidents", label: "Incidents" },
  { id: "support", label: "Support Center" },
  { id: "fleet", label: "Fleet Health" },
  { id: "analytics", label: "Ops Analytics" },
  { id: "tasks", label: "Task Board" },
  { id: "ceo", label: "CEO Command" },
];

const INCIDENT_TYPES = [
  "Accident",
  "Unsafe driving",
  "Passenger complaint",
  "Driver complaint",
  "Lost property",
  "Payment dispute",
  "Emergency event",
];

const POLL_MS = 15000;

function formatDuration(seconds) {
  if (seconds == null) return "—";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

function formatTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function phoneLink(phone) {
  return phone ? `tel:${phone}` : null;
}

function initials(name, email) {
  const source = (name || email || "?").trim();
  const parts = source.split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

function KpiCard({ label, value, tone }) {
  return (
    <div className="ops-ctrl__kpi">
      <div className="ops-ctrl__kpi-label">{label}</div>
      <div className={`ops-ctrl__kpi-value ${tone ? `ops-ctrl__kpi-value--${tone}` : ""}`}>{value}</div>
    </div>
  );
}

function DispatchModule({ bundle, canDispatch, runAction, forceDriverId, setForceDriverId }) {
  const ops = bundle.ops || {};
  const trips = ops.trips || [];
  const waiting = ops.fleet?.waiting_riders || [];
  const incoming = trips.filter((t) => t.status === "requested");
  const assigned = trips.filter((t) => t.driver?.id && t.status !== "requested");
  const unassigned = trips.filter((t) => !t.driver?.id);
  const longestWaiting = [...waiting].sort((a, b) => (b.waiting_seconds || 0) - (a.waiting_seconds || 0)).slice(0, 8);

  const renderTripActions = (trip) => (
    <div className="ops-center__actions">
      <button type="button" className="ops-center__btn" disabled={!canDispatch} onClick={() => runAction("Reassign", () => postReassignRide(trip.id, null, "Legacy OCC reassign — operator confirmed"))}>
        Reassign
      </button>
      <button type="button" className="ops-center__btn danger" disabled={!canDispatch} onClick={() => runAction("Cancel", () => postCancelRide(trip.id, "Legacy OCC cancel — operator confirmed"))}>
        Cancel
      </button>
      {canDispatch && (
        <>
          <input
            className="ops-ctrl__input"
            placeholder="Driver ID"
            value={forceDriverId[trip.id] || ""}
            onChange={(e) => setForceDriverId((prev) => ({ ...prev, [trip.id]: e.target.value }))}
            style={{ width: 90, minWidth: 90 }}
          />
          <button
            type="button"
            className="ops-center__btn"
            onClick={() =>
              runAction("Force assign", () =>
                postForceAssign(trip.id, Number(forceDriverId[trip.id]), "Legacy OCC force assign — operator confirmed")
              )
            }
          >
            Assign
          </button>
        </>
      )}
      {phoneLink(trip.driver?.phone) && <a className="ops-center__btn" href={phoneLink(trip.driver.phone)}>Driver</a>}
      {phoneLink(trip.rider?.phone) && <a className="ops-center__btn" href={phoneLink(trip.rider.phone)}>Rider</a>}
      {trip.driver?.id && (
        <button type="button" className="ops-center__btn" disabled={!canDispatch} onClick={() => runAction("Escalate", () => postPauseDriver(trip.driver.id, true))}>
          Escalate
        </button>
      )}
    </div>
  );

  return (
    <div className="ops-ctrl__split">
      <div className="ops-center__card">
        <h3 className="ops-ctrl__panel-title">Incoming requests ({incoming.length})</h3>
        <table className="ops-center__table">
          <thead><tr><th>ID</th><th>Rider</th><th>Pickup</th><th>Wait</th><th>Actions</th></tr></thead>
          <tbody>
            {incoming.map((trip) => (
              <tr key={trip.id}>
                <td>#{trip.id}</td>
                <td>{trip.rider?.name || "—"}</td>
                <td>{trip.pickup}</td>
                <td>{formatDuration(trip.waiting_seconds)}</td>
                <td>{renderTripActions(trip)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="ops-center__card">
        <h3 className="ops-ctrl__panel-title">Assigned rides ({assigned.length})</h3>
        <table className="ops-center__table">
          <thead><tr><th>ID</th><th>Driver</th><th>Status</th><th>ETA</th><th>Actions</th></tr></thead>
          <tbody>
            {assigned.map((trip) => (
              <tr key={trip.id}>
                <td>#{trip.id}</td>
                <td>{trip.driver?.name || "—"}</td>
                <td>{trip.status}</td>
                <td>{trip.eta_minutes ?? "—"} min</td>
                <td>{renderTripActions(trip)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="ops-center__card">
        <h3 className="ops-ctrl__panel-title">Longest waiting customers</h3>
        <table className="ops-center__table">
          <thead><tr><th>Ride</th><th>Rider</th><th>Wait</th><th>Pickup</th></tr></thead>
          <tbody>
            {longestWaiting.map((row) => (
              <tr key={row.ride_id}>
                <td>#{row.ride_id}</td>
                <td>{row.rider?.name || "—"}</td>
                <td>{formatDuration(row.waiting_seconds)}</td>
                <td>{row.pickup}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="ops-center__card">
        <h3 className="ops-ctrl__panel-title">Unassigned ({unassigned.length}) · Waiting queue ({waiting.length})</h3>
        <p className="ops-center__metric-label">Avg wait this hour: {ops.analytics?.average_wait_minutes ?? "—"} min</p>
        <table className="ops-center__table">
          <thead><tr><th>ID</th><th>Status</th><th>Wait</th><th>Route</th></tr></thead>
          <tbody>
            {unassigned.map((trip) => (
              <tr key={trip.id}>
                <td>#{trip.id}</td>
                <td>{trip.status}</td>
                <td>{formatDuration(trip.waiting_seconds)}</td>
                <td>{trip.pickup} → {trip.destination}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DriverMonitoringModule({ bundle }) {
  const drivers = bundle.fleetDashboard?.drivers || [];
  const onlineMap = {};
  [...(bundle.ops?.fleet?.online_drivers || []), ...(bundle.ops?.fleet?.busy_drivers || [])].forEach((d) => {
    onlineMap[d.id] = d;
  });

  return (
    <div className="ops-center__card">
      <h3 className="ops-ctrl__panel-title">Live driver monitoring ({drivers.length})</h3>
      {drivers.slice(0, 60).map((driver) => {
        const live = onlineMap[driver.user_id];
        const badges = driver.badges || [];
        return (
          <div key={driver.driver_id} className="ops-ctrl__driver-card">
            <div className="ops-ctrl__avatar">{initials(driver.driver_name, driver.email)}</div>
            <div>
              <strong>{driver.driver_name || driver.email}</strong>
              <div className="ops-center__metric-label">
                {driver.current_status} · {driver.phone || "—"} · Score {driver.score ?? "—"}
              </div>
              <div className="ops-center__metric-label">
                Vehicle: {live?.vehicle_plate || "—"} · Trips today: {driver.total_trips ?? 0}
              </div>
              <div className="ops-center__metric-label">
                Location: {live?.lat != null ? `${live.lat.toFixed?.(4) ?? live.lat}, ${live.lng.toFixed?.(4) ?? live.lng}` : "—"}
                · Last online: {formatTime(driver.last_online)}
              </div>
              <div className="ops-center__metric-label">Battery: — · Signal: —</div>
              <div className="ops-ctrl__badges">
                {badges.map((badge) => (
                  <span key={badge} className={`ops-ctrl__badge ${badge.includes("expir") ? "ops-ctrl__badge--warn" : ""}`}>
                    {badge.replace(/_/g, " ")}
                  </span>
                ))}
                {(driver.cancellation_rate || 0) > 15 && <span className="ops-ctrl__badge">High cancellation</span>}
                {(driver.rating || 5) < 4 && <span className="ops-ctrl__badge">Low rating</span>}
              </div>
            </div>
            <div className="ops-center__actions">
              {phoneLink(driver.phone) && <a className="ops-center__btn" href={phoneLink(driver.phone)}>Call</a>}
              <a className="ops-center__btn" href={`/admin/fleet`}>Fleet</a>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function IncidentsModule({ bundle, canDispatch, runAction, onCreated }) {
  const safety = bundle.ops?.emergency?.incidents || [];
  const opsIncidents = bundle.opsIncidents?.incidents || [];
  const [form, setForm] = useState({ type: INCIDENT_TYPES[0], title: "", description: "", severity: "medium" });

  const unified = useMemo(() => {
    const safetyRows = safety.map((row) => ({
      ...row,
      source: "safety",
      title: row.incident_type,
      priority: row.severity,
    }));
    const opsRows = opsIncidents.map((row) => ({
      ...row,
      source: "ops",
      incident_type: row.title,
      priority: row.severity,
      assigned_to: row.owner_email ? { name: row.owner_email } : null,
    }));
    return [...safetyRows, ...opsRows].sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
  }, [safety, opsIncidents]);

  const submitIncident = async () => {
    if (!form.title.trim()) return;
    await createCommandIncident({
      title: `[${form.type}] ${form.title}`,
      description: form.description,
      severity: form.severity,
    });
    setForm({ type: INCIDENT_TYPES[0], title: "", description: "", severity: "medium" });
    onCreated();
  };

  return (
    <div className="ops-ctrl__split">
      <div className="ops-center__card">
        <h3 className="ops-ctrl__panel-title">Create incident ticket</h3>
        <div className="ops-ctrl__form-row">
          <select className="ops-ctrl__select" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            {INCIDENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select className="ops-ctrl__select" value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>
        <input className="ops-ctrl__input" style={{ width: "100%" }} placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <textarea className="ops-ctrl__textarea" placeholder="Description & evidence notes" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <button type="button" className="ops-center__btn" disabled={!canDispatch} onClick={() => runAction("Create incident", submitIncident)}>Open ticket</button>
      </div>

      <div className="ops-center__card">
        <h3 className="ops-ctrl__panel-title">Unified incident inbox ({unified.length})</h3>
        <table className="ops-center__table">
          <thead><tr><th>Ref</th><th>Type</th><th>Priority</th><th>Status</th><th>Assigned</th><th>Actions</th></tr></thead>
          <tbody>
            {unified.map((inc) => (
              <tr key={`${inc.source}-${inc.id}`}>
                <td>{inc.reference || `#${inc.id}`}</td>
                <td>{inc.incident_type || inc.title}</td>
                <td>{inc.priority || inc.severity}</td>
                <td>{inc.status}</td>
                <td>{inc.assigned_to?.name || inc.owner_email || "—"}</td>
                <td>
                  <div className="ops-center__actions">
                    {inc.source === "safety" ? (
                      <>
                        <button type="button" className="ops-center__btn" disabled={!canDispatch} onClick={() => runAction("Ack", () => postIncidentAction(inc.id, "acknowledge"))}>Ack</button>
                        <button type="button" className="ops-center__btn" disabled={!canDispatch} onClick={() => runAction("Escalate", () => postIncidentAction(inc.id, "escalate"))}>Escalate</button>
                        <button type="button" className="ops-center__btn" disabled={!canDispatch} onClick={() => runAction("Close", () => postIncidentAction(inc.id, "close", { notes: "Resolved from Ops Control Center" }))}>Resolve</button>
                      </>
                    ) : (
                      <>
                        <button type="button" className="ops-center__btn" disabled={!canDispatch} onClick={() => runAction("Resolve", () => postCommandIncidentAction(inc.id, { action: "resolve", resolution: "Resolved from Ops Control Center" }))}>Resolve</button>
                        <button type="button" className="ops-center__btn" disabled={!canDispatch} onClick={() => runAction("Escalate", () => postCommandIncidentAction(inc.id, { action: "escalate" }))}>Escalate</button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SupportModule({ bundle, runAction, reload }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState({ tickets: [], trips: [] });
  const [refunds, setRefunds] = useState([]);
  const [promo, setPromo] = useState({ code: "", amount: "500", description: "Support credit" });
  const trips = bundle.ops?.trips || [];

  useEffect(() => {
    fetchRefundQueue().then(setRefunds).catch(() => setRefunds([]));
  }, [bundle]);

  const runSearch = async () => {
    const tickets = await searchSupportTickets(query);
    const q = query.trim().toLowerCase();
    const tripHits = q
      ? trips.filter((t) => String(t.id).includes(q) || (t.rider?.email || "").toLowerCase().includes(q) || (t.driver?.email || "").toLowerCase().includes(q))
      : [];
    setResults({ tickets, trips: tripHits });
  };

  return (
    <div className="ops-ctrl__split">
      <div className="ops-center__card">
        <h3 className="ops-ctrl__panel-title">Search rider · driver · trip</h3>
        <div className="ops-ctrl__form-row">
          <input className="ops-ctrl__input" placeholder="Email, trip ID, reference…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <button type="button" className="ops-center__btn" onClick={runSearch}>Search</button>
        </div>
        {(results.tickets || []).length > 0 && (
          <>
            <h4>Support tickets</h4>
            <table className="ops-center__table">
              <thead><tr><th>Ref</th><th>User</th><th>Category</th><th>Status</th></tr></thead>
              <tbody>
                {results.tickets.slice(0, 20).map((row) => (
                  <tr key={row.id}>
                    <td>{row.reference}</td>
                    <td>{row.user_email}</td>
                    <td>{row.category}</td>
                    <td>{row.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        {(results.trips || []).length > 0 && (
          <>
            <h4>Live trips</h4>
            <table className="ops-center__table">
              <thead><tr><th>ID</th><th>Rider</th><th>Driver</th><th>Status</th><th>Fare</th></tr></thead>
              <tbody>
                {results.trips.map((trip) => (
                  <tr key={trip.id}>
                    <td>#{trip.id}</td>
                    <td>{trip.rider?.name}</td>
                    <td>{trip.driver?.name || "—"}</td>
                    <td>{trip.status}</td>
                    <td>{formatMoney(trip.fare)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        <div className="ops-ctrl__link-row">
          <a href="/admin/support">Full Support Center →</a>
          <a href="/admin/rides">Ride history (admin) →</a>
          <a href="/admin/payments">Payment history →</a>
        </div>
      </div>

      <div className="ops-center__card">
        <h3 className="ops-ctrl__panel-title">Refund queue ({refunds.length})</h3>
        <table className="ops-center__table">
          <thead><tr><th>ID</th><th>Amount</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {refunds.slice(0, 15).map((row) => (
              <tr key={row.id}>
                <td>#{row.id}</td>
                <td>{formatMoney(row.amount)}</td>
                <td>{row.status}</td>
                <td>
                  {row.status === "requested" && (
                    <div className="ops-center__actions">
                      <button type="button" className="ops-center__btn" onClick={() => runAction("Approve refund", () => approveRefund(row.id).then(reload))}>Approve</button>
                      <button type="button" className="ops-center__btn danger" onClick={() => runAction("Reject refund", () => rejectRefund(row.id).then(reload))}>Reject</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3 className="ops-ctrl__panel-title" style={{ marginTop: 20 }}>Issue promo credit</h3>
        <div className="ops-ctrl__form-row">
          <input className="ops-ctrl__input" placeholder="Code" value={promo.code} onChange={(e) => setPromo({ ...promo, code: e.target.value })} />
          <input className="ops-ctrl__input" placeholder="Discount MRU" value={promo.amount} onChange={(e) => setPromo({ ...promo, amount: e.target.value })} />
        </div>
        <button
          type="button"
          className="ops-center__btn"
          onClick={() =>
            runAction("Create promo", () =>
              createGrowthPromo({
                code: promo.code,
                discount_amount: promo.amount,
                description: promo.description,
                max_uses: 1,
                is_active: true,
              }).then(reload)
            )
          }
        >
          Create promo
        </button>

        <h3 className="ops-ctrl__panel-title" style={{ marginTop: 20 }}>Internal notes</h3>
        <p className="ops-center__metric-label">Assign tickets from the Support Center. Open queue: {(bundle.supportOpen?.reports || []).length} tickets.</p>
        {(bundle.supportAssigned?.reports || []).slice(0, 5).map((row) => (
          <div key={row.id} className="ops-ctrl__task-item">
            <strong>{row.reference}</strong> — {row.subject || row.category}
            <button
              type="button"
              className="ops-center__btn"
              style={{ marginLeft: 8 }}
              onClick={() => runAction("Assign to me", () => updateSupportTicket(row.id, { status: "assigned" }).then(reload))}
            >
              Take ticket
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function FleetHealthModule({ bundle }) {
  const docs = bundle.fleetDocuments || {};
  const buckets = docs.buckets || {};
  const drivers = bundle.fleetDashboard?.drivers || [];
  const inactive = drivers.filter((d) => d.current_status === "offline" || d.is_suspended);
  const renewal = drivers.filter((d) => (d.badges || []).includes("document_expiring"));

  const docSections = [
    { key: "expired", label: "Expired documents" },
    { key: "expiring_7d", label: "Expiring ≤ 7 days" },
    { key: "expiring_30d", label: "Expiring ≤ 30 days" },
  ];

  return (
    <div className="ops-ctrl__split">
      {docSections.map(({ key, label }) => (
        <div key={key} className="ops-center__card">
          <h3 className="ops-ctrl__panel-title">{label} ({(buckets[key] || []).length})</h3>
          <table className="ops-center__table">
            <thead><tr><th>Driver</th><th>Document</th><th>Expires</th></tr></thead>
            <tbody>
              {(buckets[key] || []).slice(0, 15).map((doc) => (
                <tr key={doc.id}>
                  <td>{doc.driver_email}</td>
                  <td>{doc.document_label}</td>
                  <td>{doc.expires_at ? new Date(doc.expires_at).toLocaleDateString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      <div className="ops-center__card">
        <h3 className="ops-ctrl__panel-title">Inactive drivers ({inactive.length})</h3>
        {inactive.slice(0, 20).map((d) => (
          <div key={d.driver_id} className="ops-ctrl__task-item">
            {d.driver_name || d.email} — {d.current_status} {d.is_suspended ? "(suspended)" : ""}
          </div>
        ))}
      </div>

      <div className="ops-center__card">
        <h3 className="ops-ctrl__panel-title">Document renewal needed ({renewal.length})</h3>
        {renewal.slice(0, 20).map((d) => (
          <div key={d.driver_id} className="ops-ctrl__task-item">
            {d.driver_name || d.email} — score {d.score ?? "—"}
          </div>
        ))}
      </div>
    </div>
  );
}

function AnalyticsModule({ bundle }) {
  const analytics = bundle.ops?.analytics || {};
  const hourly = bundle.ceo?.analytics?.trips_by_hour || [];
  const maxTrips = Math.max(...hourly.map((h) => h.count || 0), 1);
  const fleetCeo = bundle.fleetDashboard?.ceo || {};

  return (
    <div className="ops-ctrl__split">
      <div className="ops-center__card">
        <h3 className="ops-ctrl__panel-title">Live hour metrics</h3>
        <div className="ops-center__metrics">
          <div className="ops-center__metric"><div className="ops-center__metric-label">Avg pickup wait</div><div className="ops-center__metric-value">{analytics.average_wait_minutes ?? "—"}m</div></div>
          <div className="ops-center__metric"><div className="ops-center__metric-label">Completion rate</div><div className="ops-center__metric-value">{analytics.completion_rate ?? 0}%</div></div>
          <div className="ops-center__metric"><div className="ops-center__metric-label">Cancellation rate</div><div className="ops-center__metric-value">{analytics.cancellation_rate ?? 0}%</div></div>
          <div className="ops-center__metric"><div className="ops-center__metric-label">Driver utilization</div><div className="ops-center__metric-value">{fleetCeo.driver_utilization_pct ?? "—"}%</div></div>
          <div className="ops-center__metric"><div className="ops-center__metric-label">Avg ETA</div><div className="ops-center__metric-value">{analytics.average_eta_minutes ?? "—"}m</div></div>
          <div className="ops-center__metric"><div className="ops-center__metric-label">Requests / hr</div><div className="ops-center__metric-value">{analytics.requests ?? 0}</div></div>
        </div>
      </div>

      <div className="ops-center__card">
        <h3 className="ops-ctrl__panel-title">Hourly demand (today)</h3>
        <div className="ops-ctrl__chart-bars">
          {hourly.filter((_, i) => i % 2 === 0).map((point) => (
            <div
              key={point.hour}
              className="ops-ctrl__chart-bar"
              style={{ height: `${Math.max(8, (point.count / maxTrips) * 100)}%` }}
              title={`${point.label}: ${point.count} trips`}
            >
              <span>{point.hour}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TaskBoardModule({ bundle }) {
  const user = getStoredUser();
  const userId = user?.id;
  const assignedTickets = (bundle.supportAssigned?.reports || []).filter((r) => r.owner_id === userId);
  const openIncidents = [
    ...(bundle.ops?.emergency?.incidents || []),
    ...(bundle.opsIncidents?.incidents || []).filter((i) => i.status !== "resolved"),
  ];
  const approvals = bundle.ceo?.executive_overview?.approval_queues || {};
  const checklist = bundle.checklist?.sections || {};
  const pendingChecklist = Object.values(checklist).flatMap((section) =>
    (section.items || []).filter((item) => !item.done).map((item) => ({ ...item, section: section.label }))
  );

  return (
    <div className="ops-ctrl__split">
      <div className="ops-center__card">
        <h3 className="ops-ctrl__panel-title">My assigned tasks ({assignedTickets.length})</h3>
        {assignedTickets.length === 0 && <div className="ops-center__empty">No tickets assigned to you</div>}
        {assignedTickets.map((row) => (
          <div key={row.id} className="ops-ctrl__task-item">
            <strong>{row.reference}</strong> — {row.severity} · {row.category}
            <div className="ops-center__metric-label">{row.subject || row.description?.slice(0, 80)}</div>
          </div>
        ))}
      </div>

      <div className="ops-center__card">
        <h3 className="ops-ctrl__panel-title">Pending approvals</h3>
        <div className="ops-ctrl__task-item">Merchant onboarding: {approvals.merchant_approval_queue ?? 0}</div>
        <div className="ops-ctrl__task-item">Driver/courier onboarding: {approvals.courier_approval_queue ?? 0}</div>
        <div className="ops-ctrl__task-item">Partner contracts: {approvals.partner_approval_queue ?? 0}</div>
      </div>

      <div className="ops-center__card">
        <h3 className="ops-ctrl__panel-title">Open incidents ({openIncidents.length})</h3>
        {openIncidents.slice(0, 10).map((inc) => (
          <div key={inc.id} className="ops-ctrl__task-item">
            {inc.reference || inc.title} — {inc.status} · {inc.severity}
          </div>
        ))}
      </div>

      <div className="ops-center__card">
        <h3 className="ops-ctrl__panel-title">Daily goals · checklist ({pendingChecklist.length} open)</h3>
        <p className="ops-center__metric-label">Launch checklist progress: {bundle.checklist?.progress?.percent ?? 0}%</p>
        {pendingChecklist.slice(0, 8).map((item) => (
          <div key={item.key} className="ops-ctrl__task-item">{item.section}: {item.label}</div>
        ))}
      </div>
    </div>
  );
}

function CeoCommandModule({ bundle, canCeo, runAction }) {
  const overview = bundle.ceo?.executive_overview || {};
  const readiness = bundle.ceo?.readiness || {};
  const staff = bundle.ceo?.staff_overview || {};
  const [broadcast, setBroadcast] = useState({ title: "YALA Alert", message: "", segment: "all" });
  const [freezeEmail, setFreezeEmail] = useState("");
  const [freezeAction, setFreezeAction] = useState("suspend");

  return (
    <div className="ops-ctrl__split">
      <div className="ops-center__card">
        <h3 className="ops-ctrl__panel-title">Live system health</h3>
        <div className="ops-center__metrics">
          <div className="ops-center__metric"><div className="ops-center__metric-label">Launch score</div><div className="ops-center__metric-value">{readiness.overall_launch_score ?? "—"}</div></div>
          <div className="ops-center__metric"><div className="ops-center__metric-label">Active trips</div><div className="ops-center__metric-value">{overview.active_trips ?? bundle.ops?.analytics?.active_trips ?? 0}</div></div>
          <div className="ops-center__metric"><div className="ops-center__metric-label">Online drivers</div><div className="ops-center__metric-value">{overview.online_drivers ?? bundle.ops?.fleet?.counts?.online_drivers ?? 0}</div></div>
          <div className="ops-center__metric"><div className="ops-center__metric-label">Open incidents</div><div className="ops-center__metric-value">{bundle.ops?.emergency?.open_count ?? 0}</div></div>
        </div>
        <h4 style={{ marginTop: 16 }}>All rides ({(bundle.ops?.trips || []).length})</h4>
        <table className="ops-center__table">
          <thead><tr><th>ID</th><th>Status</th><th>Driver</th><th>Rider</th></tr></thead>
          <tbody>
            {(bundle.ops?.trips || []).slice(0, 25).map((trip) => (
              <tr key={trip.id}>
                <td>#{trip.id}</td>
                <td>{trip.status}</td>
                <td>{trip.driver?.name || "—"}</td>
                <td>{trip.rider?.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="ops-center__card">
        <h3 className="ops-ctrl__panel-title">Employees ({Object.values(staff.teams || {}).flat().length})</h3>
        {Object.entries(staff.teams || {}).map(([team, members]) =>
          members.length > 0 ? (
            <div key={team}>
              <strong>{team.replace(/_/g, " ")}</strong>
              {members.slice(0, 5).map((m) => (
                <div key={m.id} className="ops-ctrl__task-item">{m.name} — {m.email}</div>
              ))}
            </div>
          ) : null
        )}

        <h3 className="ops-ctrl__panel-title" style={{ marginTop: 16 }}>Emergency broadcast</h3>
        <input className="ops-ctrl__input" style={{ width: "100%" }} value={broadcast.title} onChange={(e) => setBroadcast({ ...broadcast, title: e.target.value })} />
        <textarea className="ops-ctrl__textarea" value={broadcast.message} onChange={(e) => setBroadcast({ ...broadcast, message: e.target.value })} />
        <select className="ops-ctrl__select" value={broadcast.segment} onChange={(e) => setBroadcast({ ...broadcast, segment: e.target.value })}>
          <option value="all">All users</option>
          <option value="riders">Riders</option>
          <option value="drivers">Drivers</option>
          <option value="staff">Staff</option>
        </select>
        <button type="button" className="ops-center__btn" disabled={!canCeo} onClick={() => runAction("Broadcast", () => postCeoBroadcast(broadcast))}>Send broadcast</button>

        <h3 className="ops-ctrl__panel-title" style={{ marginTop: 16 }}>Freeze account</h3>
        <div className="ops-ctrl__form-row">
          <input className="ops-ctrl__input" placeholder="User email" value={freezeEmail} onChange={(e) => setFreezeEmail(e.target.value)} />
          <select className="ops-ctrl__select" value={freezeAction} onChange={(e) => setFreezeAction(e.target.value)}>
            <option value="suspend">Suspend rider/driver</option>
            <option value="reactivate">Reactivate</option>
          </select>
          <button type="button" className="ops-center__btn danger" disabled={!canCeo} onClick={() => runAction("Account action", () => postAccountAction({ email: freezeEmail, action: freezeAction }))}>
            Apply
          </button>
        </div>

        <button type="button" className="ops-center__btn danger" disabled={!canCeo} onClick={() => runAction("Platform freeze", () => postCeoFreeze({ enabled: true, reason: "CEO emergency freeze from Ops Control Center" }))}>
          Emergency platform freeze
        </button>

        <div className="ops-ctrl__link-row">
          <a href="/admin/ceo-master">CEO Executive Dashboard →</a>
          <a href="/admin/executive">Executive Dashboard →</a>
        </div>
      </div>
    </div>
  );
}

export default function OperationsControlCenter() {
  const [module, setModule] = useState("dispatch");
  const [bundle, setBundle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [wsConnected, setWsConnected] = useState(false);
  const [forceDriverId, setForceDriverId] = useState({});

  const load = useCallback(async () => {
    try {
      setError("");
      const payload = await fetchOperationsControlBundle();
      setBundle(payload);
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Failed to load operations control center");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    const unsubscribe = subscribeOperationsUpdates(() => {
      setWsConnected(true);
      load();
    });
    return unsubscribe;
  }, [load]);

  const canDispatch = bundle?.ops?.permissions?.dispatch;
  const canCeo = bundle?.ops?.permissions?.ceo_actions;

  const runAction = async (label, fn) => {
    try {
      setActionMessage("");
      await fn();
      setActionMessage(`${label} succeeded`);
      await load();
    } catch (err) {
      setActionMessage(err?.response?.data?.error || err?.response?.data?.detail || `${label} failed`);
    }
  };

  const kpis = useMemo(() => {
    if (!bundle?.ops) return [];
    const fleet = bundle.ops.fleet?.counts || {};
    return [
      { label: "Waiting riders", value: fleet.waiting_riders || 0, tone: fleet.waiting_riders > 5 ? "warn" : "ok" },
      { label: "Active trips", value: fleet.active_trips || 0 },
      { label: "Online drivers", value: fleet.online_drivers || 0 },
      { label: "Open SOS", value: bundle.ops.emergency?.open_count || 0, tone: bundle.ops.emergency?.open_count ? "crit" : "ok" },
      { label: "Open tickets", value: bundle.supportOpen?.reports?.length || 0 },
      { label: "Expired docs", value: bundle.fleetDocuments?.summary?.expired || 0, tone: bundle.fleetDocuments?.summary?.expired ? "warn" : "ok" },
    ];
  }, [bundle]);

  if (loading && !bundle) {
    return <div className="ops-center"><div className="ops-center__empty">Loading Operations Control Center…</div></div>;
  }

  return (
    <div className="ops-center ops-ctrl">
      <header className="ops-center__header ops-ctrl__hero">
        <div>
          <a className="ops-center__back-link" href="/admin">← Admin</a>
          <h1>YALA Operations Control Center</h1>
          <p>Unified dispatch, monitoring, incidents, support, fleet health, analytics, tasks & CEO command</p>
        </div>
        <div className="ops-center__status">
          <span className="ops-center__status-dot" />
          {wsConnected ? "WebSocket live" : "Polling every 15s"} · Updated {formatTime(bundle?.ops?.generated_at)}
        </div>
      </header>

      {error && <div className="ops-center__alert ops-center__alert--critical">{error}</div>}
      {actionMessage && <div className="ops-center__alert">{actionMessage}</div>}
      {(bundle?.errors || []).length > 0 && (
        <div className="ops-center__alert">Partial load: {bundle.errors.length} data source(s) unavailable</div>
      )}

      <div className="ops-ctrl__kpi-row">
        {kpis.map((kpi) => <KpiCard key={kpi.label} {...kpi} />)}
      </div>

      <nav className="ops-ctrl__module-nav">
        {MODULES.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`ops-ctrl__module-btn ${module === item.id ? "active" : ""}`}
            onClick={() => setModule(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {module === "dispatch" && (
        <DispatchModule
          bundle={bundle}
          canDispatch={canDispatch}
          runAction={runAction}
          forceDriverId={forceDriverId}
          setForceDriverId={setForceDriverId}
        />
      )}
      {module === "drivers" && <DriverMonitoringModule bundle={bundle} />}
      {module === "incidents" && (
        <IncidentsModule bundle={bundle} canDispatch={canDispatch} runAction={runAction} onCreated={load} />
      )}
      {module === "support" && <SupportModule bundle={bundle} runAction={runAction} reload={load} />}
      {module === "fleet" && <FleetHealthModule bundle={bundle} />}
      {module === "analytics" && <AnalyticsModule bundle={bundle} />}
      {module === "tasks" && <TaskBoardModule bundle={bundle} />}
      {module === "ceo" && <CeoCommandModule bundle={bundle} canCeo={canCeo} runAction={runAction} />}

      <div className="ops-ctrl__link-row">
        <a href="/admin/operations">Real-Time Operations Center</a>
        <a href="/admin/command">Launch Command</a>
        <a href="/admin/fleet">Fleet & Performance</a>
        <a href="/admin/support">Support Center</a>
      </div>
    </div>
  );
}
