import React, { useCallback, useEffect, useState } from "react";

import { API_URL } from "../apiConfig";
import {
  fetchAdminActiveTrips,
  fetchAdminResponseLog,
  fetchAdminTripReplay,
} from "../safety/safetyApi";


export default function SafetyAdminPanel() {
  const [data, setData] = useState({ summary: {}, incidents: [] });
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("incidents");
  const [activeTrips, setActiveTrips] = useState([]);
  const [responseLogs, setResponseLogs] = useState([]);
  const [replay, setReplay] = useState(null);
  const token = localStorage.getItem("access");
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const query = filter ? `?status=${filter}` : "";
      const response = await fetch(`${API_URL}/safety/admin/incidents/${query}`, { headers });
      const next = await response.json();
      setData(response.ok ? next : { summary: {}, incidents: [] });
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, token]);

  const refreshActiveTrips = useCallback(async () => {
    try {
      const payload = await fetchAdminActiveTrips();
      setActiveTrips(Array.isArray(payload.active_trips) ? payload.active_trips : []);
    } catch (_) {
      setActiveTrips([]);
    }
  }, []);

  const refreshResponseLog = useCallback(async () => {
    try {
      const payload = await fetchAdminResponseLog();
      setResponseLogs(Array.isArray(payload.logs) ? payload.logs : []);
    } catch (_) {
      setResponseLogs([]);
    }
  }, []);

  useEffect(() => {
    refresh();
    refreshActiveTrips();
    refreshResponseLog();
    const interval = setInterval(() => {
      refresh();
      refreshActiveTrips();
      refreshResponseLog();
    }, 15000);
    return () => clearInterval(interval);
  }, [refresh, refreshActiveTrips, refreshResponseLog]);

  const updateIncident = async (incident, status) => {
    const notes =
      status === "resolved" || status === "dismissed"
        ? window.prompt("Resolution notes are required:", incident.resolution_notes || "")
        : incident.resolution_notes || "";
    if ((status === "resolved" || status === "dismissed") && !notes?.trim()) return;
    await fetch(`${API_URL}/safety/admin/incidents/${incident.id}/`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ status, resolution_notes: notes }),
    });
    refresh();
    refreshResponseLog();
  };

  const loadReplay = async (rideId) => {
    try {
      const payload = await fetchAdminTripReplay(rideId);
      setReplay(payload);
    } catch (_) {
      setReplay(null);
    }
  };

  const summary = data.summary || {};
  const incidents = Array.isArray(data.incidents) ? data.incidents : [];
  const activeSosTrips = activeTrips.filter((trip) => Number(trip.active_sos_count || 0) > 0);

  return (
    <section className="safety-admin">
      <SafetyAdminStyles />
      <div className="safety-admin-head">
        <div>
          <span>Live operations</span>
          <h2>Safety & Emergency Center</h2>
          <p>Active SOS alerts, live trip tracking, trip replay, and emergency response logs.</p>
        </div>
        <select value={filter} onChange={(event) => setFilter(event.target.value)}>
          <option value="">All incidents</option>
          <option value="open">Open</option>
          <option value="acknowledged">Acknowledged</option>
          <option value="investigating">Investigating</option>
          <option value="resolved">Resolved</option>
          <option value="dismissed">Dismissed</option>
        </select>
      </div>

      <div className="safety-tabs">
        {[
          ["incidents", "SOS Alerts"],
          ["live", "Live Trips"],
          ["replay", "Trip Replay"],
          ["log", "Response Log"],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={tab === key ? "is-active" : ""}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="safety-kpis">
        <Kpi label="Critical active" value={summary.critical} critical />
        <Kpi label="Open" value={summary.open} />
        <Kpi label="Live trips" value={activeTrips.length} />
        <Kpi label="Active SOS trips" value={activeSosTrips.length} critical={activeSosTrips.length > 0} />
        <Kpi label="Resolved" value={summary.resolved} />
      </div>

      {tab === "incidents" && (
        <>
          {loading && <p>Refreshing safety alerts...</p>}
          {!loading && incidents.length === 0 && <p>No safety incidents found.</p>}
          <div className="safety-incident-table">
            {incidents.map((incident) => (
              <article key={incident.id} className={incident.severity === "critical" ? "critical" : ""}>
                <div className="incident-title">
                  <div>
                    <span>{incident.reference}</span>
                    <h3>{incident.incident_type.replaceAll("_", " ")}</h3>
                  </div>
                  <b>{incident.status}</b>
                </div>
                <div className="incident-details">
                  <p><strong>Reporter:</strong> {incident.reporter_name} ({incident.reporter_role})</p>
                  <p><strong>Reported user:</strong> {incident.reported_user_name || "Not specified"}</p>
                  <p><strong>Ride:</strong> {incident.ride || "Not linked"}</p>
                  <p><strong>Created:</strong> {new Date(incident.created_at).toLocaleString()}</p>
                  <p><strong>Location:</strong> {incident.latitude && incident.longitude ? `${incident.latitude}, ${incident.longitude}` : "GPS unavailable"}</p>
                  <p><strong>Description:</strong> {incident.description || "No description"}</p>
                </div>
                {incident.latitude && incident.longitude && (
                  <a href={`https://www.google.com/maps?q=${incident.latitude},${incident.longitude}`} target="_blank" rel="noreferrer">
                    Open GPS location
                  </a>
                )}
                <div className="incident-actions">
                  <button onClick={() => updateIncident(incident, "acknowledged")}>Acknowledge</button>
                  <button onClick={() => updateIncident(incident, "investigating")}>Investigate</button>
                  <button onClick={() => updateIncident(incident, "resolved")}>Resolve</button>
                  <button onClick={() => updateIncident(incident, "dismissed")}>Dismiss</button>
                  {incident.ride ? (
                    <button onClick={() => { setTab("replay"); loadReplay(incident.ride); }}>
                      Trip replay
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      {tab === "live" && (
        <div className="safety-incident-table">
          {activeTrips.length === 0 ? <p>No active trips right now.</p> : null}
          {activeTrips.map((trip) => (
            <article key={trip.ride_id} className={trip.active_sos_count ? "critical" : ""}>
              <div className="incident-title">
                <div>
                  <span>Ride #{trip.ride_id}</span>
                  <h3>{trip.status}</h3>
                </div>
                {trip.active_sos_count ? <b>SOS active</b> : <b>Live</b>}
              </div>
              <div className="incident-details">
                <p><strong>Route:</strong> {trip.pickup} → {trip.destination}</p>
                <p><strong>Driver:</strong> {trip.driver_name}</p>
                <p><strong>Vehicle:</strong> {[trip.vehicle_make, trip.vehicle_model, trip.vehicle_color, trip.plate_number].filter(Boolean).join(" · ")}</p>
                <p><strong>Location:</strong> {trip.driver_latitude && trip.driver_longitude ? `${trip.driver_latitude}, ${trip.driver_longitude}` : "Awaiting GPS"}</p>
              </div>
              <div className="incident-actions">
                {trip.driver_latitude && trip.driver_longitude ? (
                  <a href={`https://www.google.com/maps?q=${trip.driver_latitude},${trip.driver_longitude}`} target="_blank" rel="noreferrer">
                    Track live
                  </a>
                ) : null}
                <button type="button" onClick={() => { setTab("replay"); loadReplay(trip.ride_id); }}>
                  Trip replay
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {tab === "replay" && (
        <div className="safety-replay">
          <label>
            Ride ID
            <input
              type="number"
              placeholder="Enter ride ID"
              onKeyDown={(event) => {
                if (event.key === "Enter") loadReplay(event.currentTarget.value);
              }}
            />
          </label>
          {!replay ? <p>Enter a ride ID to load trip replay.</p> : (
            <>
              <p><strong>Ride #{replay.ride?.ride_id}</strong> · {replay.ride?.status}</p>
              <p>{replay.pings?.length || 0} GPS pings · {replay.safety_events?.length || 0} safety events</p>
              <div className="safety-replay-list">
                {(replay.pings || []).slice(-20).map((ping, index) => (
                  <div key={`${ping.recorded_at}-${index}`}>
                    {new Date(ping.recorded_at).toLocaleTimeString()} · {ping.latitude}, {ping.longitude}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {tab === "log" && (
        <div className="safety-replay-list">
          {responseLogs.length === 0 ? <p>No emergency response actions logged yet.</p> : null}
          {responseLogs.map((log) => (
            <article key={log.id} className="safety-log-row">
              <strong>{log.incident_reference}</strong>
              <span>{log.action.replaceAll("_", " ")} · {log.actor_name || "System"}</span>
              <small>{new Date(log.created_at).toLocaleString()}</small>
              {log.note ? <p>{log.note}</p> : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function Kpi({ label, value = 0, critical = false }) {
  return <div className={critical ? "critical" : ""}><span>{label}</span><strong>{value || 0}</strong></div>;
}

function SafetyAdminStyles() {
  return <style>{`
    .safety-admin { color:#111827; }
    .safety-admin-head { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; margin-bottom:16px; }
    .safety-admin-head span { color:#b91c1c; font-size:12px; font-weight:900; text-transform:uppercase; }
    .safety-admin-head h2 { margin:5px 0; letter-spacing:0; }
    .safety-admin-head p { color:#64748b; margin:0; }
    .safety-admin-head select { min-width:180px; padding:10px; border:1px solid #cbd5e1; border-radius:6px; }
    .safety-tabs { display:flex; gap:8px; margin-bottom:12px; flex-wrap:wrap; }
    .safety-tabs button { border:1px solid #cbd5e1; background:#fff; border-radius:999px; padding:8px 12px; font-weight:800; cursor:pointer; }
    .safety-tabs button.is-active { background:#111827; color:#fff; border-color:#111827; }
    .safety-kpis { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:10px; margin-bottom:16px; }
    .safety-kpis>div { border:1px solid #e2e8f0; border-radius:7px; padding:12px; background:#fff; }
    .safety-kpis>div.critical { border-color:#fca5a5; background:#fef2f2; }
    .safety-kpis span { display:block; color:#64748b; font-size:12px; font-weight:800; }
    .safety-kpis strong { display:block; margin-top:5px; font-size:25px; }
    .safety-incident-table { display:grid; gap:10px; }
    .safety-incident-table article { border:1px solid #e2e8f0; border-left:5px solid #f59e0b; border-radius:7px; padding:13px; background:#fff; }
    .safety-incident-table article.critical { border-left-color:#dc2626; background:#fff7f7; }
    .incident-title { display:flex; justify-content:space-between; gap:12px; }
    .incident-title span { font-size:12px; color:#64748b; font-weight:900; }
    .incident-title h3 { margin:3px 0; text-transform:capitalize; letter-spacing:0; }
    .incident-title b { height:max-content; border-radius:4px; background:#e2e8f0; padding:5px 8px; text-transform:capitalize; }
    .incident-details { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:4px 14px; }
    .incident-details p { margin:5px 0; overflow-wrap:anywhere; }
    .safety-incident-table a { display:inline-block; margin:8px 8px 0 0; color:#1d4ed8; font-weight:800; }
    .incident-actions { display:flex; flex-wrap:wrap; gap:7px; margin-top:8px; }
    .incident-actions button { border:1px solid #cbd5e1; border-radius:5px; background:#f8fafc; padding:8px 10px; font-weight:800; cursor:pointer; }
    .safety-replay, .safety-replay-list { display:grid; gap:8px; }
    .safety-replay input { padding:10px; border:1px solid #cbd5e1; border-radius:6px; }
    .safety-log-row { border:1px solid #e2e8f0; border-radius:8px; padding:10px 12px; background:#fff; display:grid; gap:4px; }
    @media(max-width:900px){ .safety-kpis{grid-template-columns:repeat(2,1fr)} .incident-details{grid-template-columns:1fr} }
  `}</style>;
}
