import React, { useCallback, useEffect, useState } from "react";

import { API_URL } from "../apiConfig";


export default function SafetyAdminPanel() {
  const [data, setData] = useState({ summary: {}, incidents: [] });
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
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

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 15000);
    return () => clearInterval(interval);
  }, [refresh]);

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
  };

  const summary = data.summary || {};
  const incidents = Array.isArray(data.incidents) ? data.incidents : [];

  return (
    <section className="safety-admin">
      <SafetyAdminStyles />
      <div className="safety-admin-head">
        <div>
          <span>Live operations</span>
          <h2>Safety & Emergency Center</h2>
          <p>SOS alerts, rider and driver reports, emergency contacts, and incident resolution.</p>
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

      <div className="safety-kpis">
        <Kpi label="Critical active" value={summary.critical} critical />
        <Kpi label="Open" value={summary.open} />
        <Kpi label="Acknowledged" value={summary.acknowledged} />
        <Kpi label="Investigating" value={summary.investigating} />
        <Kpi label="Resolved" value={summary.resolved} />
      </div>

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
              <p>
                <strong>Emergency contacts:</strong>{" "}
                {(incident.emergency_contacts || []).map((contact) => `${contact.name}: ${contact.phone_number}`).join(", ") || "None saved"}
              </p>
            </div>
            {incident.latitude && incident.longitude && (
              <a
                href={`https://www.google.com/maps?q=${incident.latitude},${incident.longitude}`}
                target="_blank"
                rel="noreferrer"
              >
                Open GPS location
              </a>
            )}
            <div className="incident-actions">
              <button onClick={() => updateIncident(incident, "acknowledged")}>Acknowledge</button>
              <button onClick={() => updateIncident(incident, "investigating")}>Investigate</button>
              <button onClick={() => updateIncident(incident, "resolved")}>Resolve</button>
              <button onClick={() => updateIncident(incident, "dismissed")}>Dismiss</button>
            </div>
          </article>
        ))}
      </div>
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
    .safety-incident-table a { display:inline-block; margin:8px 0; color:#1d4ed8; font-weight:800; }
    .incident-actions { display:flex; flex-wrap:wrap; gap:7px; margin-top:8px; }
    .incident-actions button { border:1px solid #cbd5e1; border-radius:5px; background:#f8fafc; padding:8px 10px; font-weight:800; cursor:pointer; }
    @media(max-width:900px){ .safety-kpis{grid-template-columns:repeat(2,1fr)} .incident-details{grid-template-columns:1fr} }
  `}</style>;
}
