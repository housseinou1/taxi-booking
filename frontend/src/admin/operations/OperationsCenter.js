import React, { useCallback, useEffect, useMemo, useState } from "react";

import { formatMoney } from "../../marketConfig";
import {
  exportIncidentReport,
  fetchOperationsCenter,
  postCancelDelivery,
  postCancelRide,
  postIncidentAction,
  postPauseDriver,
  postReassignDelivery,
  postReassignRide,
} from "./operationsCenterApi";
import { subscribeOperationsUpdates } from "./opsSocket";
import "./OperationsCenter.css";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "trips", label: "Trips" },
  { id: "deliveries", label: "Deliveries" },
  { id: "emergency", label: "Emergency" },
  { id: "alerts", label: "Alerts" },
  { id: "timeline", label: "Timeline" },
  { id: "analytics", label: "Analytics" },
];

const POLL_MS = 8000;

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
  if (!phone) return null;
  return `tel:${phone}`;
}

function MapPanel({ mapData }) {
  const markers = useMemo(() => {
    const payload = mapData?.markers || {};
    return [
      ...(payload.drivers || []).map((item) => ({ ...item, kind: item.kind || "driver" })),
      ...(payload.couriers || []).map((item) => ({ ...item, kind: "courier" })),
      ...(payload.riders_waiting || []).map((item) => ({ ...item, kind: "rider_waiting" })),
      ...(payload.trips || []).map((item) => ({ ...item, kind: "trip" })),
      ...(payload.deliveries || []).map((item) => ({ ...item, kind: "delivery" })),
      ...(payload.sos || []).map((item) => ({ ...item, kind: "sos" })),
    ];
  }, [mapData]);

  if (!markers.length) {
    return <div className="ops-center__empty">No live map markers</div>;
  }

  const lats = markers.map((item) => item.lat);
  const lngs = markers.map((item) => item.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  return (
    <div className="ops-center__map">
      {markers.map((marker) => {
        const x = maxLng === minLng ? 50 : ((marker.lng - minLng) / (maxLng - minLng)) * 100;
        const y = maxLat === minLat ? 50 : ((maxLat - marker.lat) / (maxLat - minLat)) * 100;
        return (
          <span
            key={`${marker.kind}-${marker.id}`}
            className={`ops-center__marker ops-center__marker--${marker.kind}`}
            style={{ left: `${x}%`, top: `${y}%` }}
            title={marker.label || marker.reference || marker.kind}
          />
        );
      })}
    </div>
  );
}

function FleetMetrics({ fleet }) {
  const counts = fleet?.counts || {};
  return (
    <div className="ops-center__metrics">
      <div className="ops-center__metric"><div className="ops-center__metric-label">Online Drivers</div><div className="ops-center__metric-value">{counts.online_drivers || 0}</div></div>
      <div className="ops-center__metric"><div className="ops-center__metric-label">Busy Drivers</div><div className="ops-center__metric-value">{counts.busy_drivers || 0}</div></div>
      <div className="ops-center__metric"><div className="ops-center__metric-label">Offline</div><div className="ops-center__metric-value">{counts.offline_drivers || 0}</div></div>
      <div className="ops-center__metric"><div className="ops-center__metric-label">Couriers</div><div className="ops-center__metric-value">{counts.online_couriers || 0}</div></div>
      <div className="ops-center__metric"><div className="ops-center__metric-label">Active Trips</div><div className="ops-center__metric-value">{counts.active_trips || 0}</div></div>
      <div className="ops-center__metric"><div className="ops-center__metric-label">Deliveries</div><div className="ops-center__metric-value">{counts.active_deliveries || 0}</div></div>
      <div className="ops-center__metric"><div className="ops-center__metric-label">Waiting Riders</div><div className="ops-center__metric-value">{counts.waiting_riders || 0}</div></div>
    </div>
  );
}

export default function OperationsCenter() {
  const [tab, setTab] = useState("overview");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [wsConnected, setWsConnected] = useState(false);
  const [actionMessage, setActionMessage] = useState("");

  const canDispatch = data?.permissions?.dispatch;

  const load = useCallback(async () => {
    try {
      setError("");
      const payload = await fetchOperationsCenter();
      setData(payload);
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Failed to load operations center");
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
    const unsubscribe = subscribeOperationsUpdates((message) => {
      setWsConnected(true);
      if (
        message?.type === "operations_update" ||
        message?.type === "ride_update" ||
        message?.type === "ride_status_update" ||
        message?.type === "safety_alert"
      ) {
        load();
      }
    });
    return unsubscribe;
  }, [load]);

  const runAction = async (label, fn) => {
    if (!canDispatch) {
      setActionMessage("Dispatch permission required.");
      return;
    }
    try {
      setActionMessage("");
      await fn();
      setActionMessage(`${label} succeeded`);
      await load();
    } catch (err) {
      setActionMessage(err?.response?.data?.error || err?.response?.data?.detail || `${label} failed`);
    }
  };

  if (loading && !data) {
    return <div className="ops-center"><div className="ops-center__empty">Loading operations center…</div></div>;
  }

  return (
    <div className="ops-center">
      <header className="ops-center__header">
        <div>
          <a className="ops-center__back-link" href="/admin">← Admin</a>
          <h1>Real-Time Operations Center</h1>
          <p>Live dispatch console for CEO and Operations Managers</p>
        </div>
        <div className="ops-center__status">
          <span className="ops-center__status-dot" />
          {wsConnected ? "WebSocket live" : "Polling every 8s"} · Updated {formatTime(data?.generated_at)}
        </div>
      </header>

      {error && <div className="ops-center__alert ops-center__alert--critical">{error}</div>}
      {actionMessage && <div className="ops-center__alert">{actionMessage}</div>}

      <div className="ops-center__tabs">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`ops-center__tab ${tab === item.id ? "active" : ""}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="ops-center__grid ops-center__grid--2">
          <div className="ops-center__card">
            <h3>Live Fleet</h3>
            <FleetMetrics fleet={data?.fleet} />
          </div>
          <div className="ops-center__card">
            <h3>Interactive Map</h3>
            <MapPanel mapData={data?.map} />
          </div>
        </div>
      )}

      {tab === "trips" && (
        <div className="ops-center__card">
          <h3>Trip Monitoring</h3>
          <table className="ops-center__table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Status</th>
                <th>Driver / Rider</th>
                <th>Route</th>
                <th>ETA / Wait</th>
                <th>Fare</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {(data?.trips || []).map((trip) => (
                <tr key={trip.id}>
                  <td>#{trip.id}</td>
                  <td>{trip.status}</td>
                  <td>
                    <div>{trip.driver?.name || "Unassigned"}</div>
                    <div>{trip.rider?.name}</div>
                    <div className="ops-center__actions">
                      {phoneLink(trip.driver?.phone) && <a className="ops-center__btn" href={phoneLink(trip.driver.phone)}>Call driver</a>}
                      {phoneLink(trip.rider?.phone) && <a className="ops-center__btn" href={phoneLink(trip.rider.phone)}>Call rider</a>}
                    </div>
                  </td>
                  <td>
                    <div>{trip.pickup}</div>
                    <div>{trip.destination}</div>
                    <div>{trip.vehicle?.plate}</div>
                  </td>
                  <td>
                    <div>ETA {trip.eta_minutes ?? "—"} min</div>
                    <div>Wait {formatDuration(trip.waiting_seconds)}</div>
                  </td>
                  <td>{formatMoney(trip.fare)}</td>
                  <td>
                    <div className="ops-center__actions">
                      <button type="button" className="ops-center__btn" onClick={() => runAction("Reassign", () => postReassignRide(trip.id))}>Reassign</button>
                      <button type="button" className="ops-center__btn danger" onClick={() => runAction("Cancel ride", () => postCancelRide(trip.id))}>Cancel</button>
                      {trip.driver?.id && (
                        <button type="button" className="ops-center__btn" onClick={() => runAction("Pause driver", () => postPauseDriver(trip.driver.id, true))}>Pause driver</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "deliveries" && (
        <div className="ops-center__card">
          <h3>Delivery Monitoring</h3>
          <table className="ops-center__table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Status</th>
                <th>Courier / Customer</th>
                <th>Store / Route</th>
                <th>ETA</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {(data?.deliveries || []).map((delivery) => (
                <tr key={delivery.id}>
                  <td>#{delivery.id}</td>
                  <td>{delivery.status}</td>
                  <td>
                    <div>{delivery.courier?.name || "Unassigned"}</div>
                    <div>{delivery.customer?.name}</div>
                    {phoneLink(delivery.courier?.phone) && <a className="ops-center__btn" href={phoneLink(delivery.courier.phone)}>Call courier</a>}
                  </td>
                  <td>
                    <div>{delivery.store}</div>
                    <div>{delivery.pickup} → {delivery.destination}</div>
                  </td>
                  <td>{delivery.eta_minutes ?? "—"} min</td>
                  <td>
                    <div className="ops-center__actions">
                      <button type="button" className="ops-center__btn" onClick={() => runAction("Reassign delivery", () => postReassignDelivery(delivery.id))}>Reassign</button>
                      <button type="button" className="ops-center__btn danger" onClick={() => runAction("Cancel delivery", () => postCancelDelivery(delivery.id))}>Cancel</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "emergency" && (
        <div className="ops-center__card">
          <h3>Emergency Center · Open {data?.emergency?.open_count || 0}</h3>
          <table className="ops-center__table">
            <thead>
              <tr>
                <th>Ref</th>
                <th>Type</th>
                <th>Severity</th>
                <th>Status</th>
                <th>Reporter</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {(data?.emergency?.incidents || []).map((incident) => (
                <tr key={incident.id}>
                  <td>{incident.reference}</td>
                  <td>{incident.incident_type}</td>
                  <td>{incident.severity}</td>
                  <td>{incident.status}</td>
                  <td>{incident.reporter?.name}</td>
                  <td>
                    <div className="ops-center__actions">
                      <button type="button" className="ops-center__btn" onClick={() => runAction("Acknowledge", () => postIncidentAction(incident.id, "acknowledge"))}>Acknowledge</button>
                      <button type="button" className="ops-center__btn" onClick={() => runAction("Assign", () => postIncidentAction(incident.id, "assign"))}>Assign me</button>
                      <button type="button" className="ops-center__btn" onClick={() => runAction("Escalate", () => postIncidentAction(incident.id, "escalate"))}>Escalate</button>
                      <button type="button" className="ops-center__btn" onClick={() => runAction("Close", () => postIncidentAction(incident.id, "close", { notes: "Resolved from operations center" }))}>Close</button>
                      <button
                        type="button"
                        className="ops-center__btn"
                        onClick={async () => {
                          const response = await exportIncidentReport(incident.id);
                          const url = window.URL.createObjectURL(new Blob([response.data]));
                          const link = document.createElement("a");
                          link.href = url;
                          link.download = `${incident.reference}.csv`;
                          link.click();
                        }}
                      >
                        Export
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "alerts" && (
        <div className="ops-center__card">
          <h3>Live Alerts</h3>
          {(data?.alerts || []).length === 0 && <div className="ops-center__empty">No active alerts</div>}
          {(data?.alerts || []).map((alert) => (
            <div key={alert.id} className={`ops-center__alert ${alert.severity === "critical" ? "ops-center__alert--critical" : ""}`}>
              <strong>{alert.type}</strong> — {alert.message}
            </div>
          ))}
        </div>
      )}

      {tab === "timeline" && (
        <div className="ops-center__card">
          <h3>Operations Timeline</h3>
          {(data?.timeline || []).map((event) => (
            <div key={`${event.type}-${event.entity_id}-${event.at}`} className="ops-center__timeline-item">
              <div className="ops-center__timeline-time">{formatTime(event.at)}</div>
              <div>
                <div>{event.summary}</div>
                <div className="ops-center__metric-label">{event.type}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "analytics" && (
        <div className="ops-center__card">
          <h3>Current Hour Analytics</h3>
          <div className="ops-center__metrics">
            <div className="ops-center__metric"><div className="ops-center__metric-label">Requests</div><div className="ops-center__metric-value">{data?.analytics?.requests || 0}</div></div>
            <div className="ops-center__metric"><div className="ops-center__metric-label">Acceptance</div><div className="ops-center__metric-value">{data?.analytics?.acceptance_rate || 0}%</div></div>
            <div className="ops-center__metric"><div className="ops-center__metric-label">Completion</div><div className="ops-center__metric-value">{data?.analytics?.completion_rate || 0}%</div></div>
            <div className="ops-center__metric"><div className="ops-center__metric-label">Cancellation</div><div className="ops-center__metric-value">{data?.analytics?.cancellation_rate || 0}%</div></div>
            <div className="ops-center__metric"><div className="ops-center__metric-label">Avg ETA</div><div className="ops-center__metric-value">{data?.analytics?.average_eta_minutes ?? "—"}m</div></div>
            <div className="ops-center__metric"><div className="ops-center__metric-label">Avg Wait</div><div className="ops-center__metric-value">{data?.analytics?.average_wait_minutes ?? "—"}m</div></div>
            <div className="ops-center__metric"><div className="ops-center__metric-label">Revenue / hr</div><div className="ops-center__metric-value">{formatMoney(data?.analytics?.revenue_per_hour || 0)}</div></div>
          </div>
        </div>
      )}
    </div>
  );
}
