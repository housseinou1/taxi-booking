import React, { useCallback, useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

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
import { usePermissions } from "../permissions/PermissionContext";
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

const MARKER_KINDS = [
  { id: "drivers", label: "Drivers", color: "#00a651" },
  { id: "couriers", label: "Couriers", color: "#38bdf8" },
  { id: "riders_waiting", label: "Waiting Riders", color: "#fbbf24" },
  { id: "trips", label: "Active Trips", color: "#a78bfa" },
  { id: "deliveries", label: "Active Deliveries", color: "#fb923c" },
  { id: "sos", label: "SOS", color: "#f87171" },
];

function markerIcon(color, label) {
  return L.divIcon({
    className: "ops-live-marker",
    html: `<span class="ops-live-marker__dot" style="background:${color}"></span>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

/** Fit the viewport to the visible markers without inventing coordinates. */
function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 13);
      return;
    }
    map.fitBounds(
      L.latLngBounds(points.map((point) => [point.lat, point.lng])),
      { padding: [40, 40], maxZoom: 15 }
    );
  }, [points, map]);
  return null;
}

function LiveMap({ mapData, cityLabel, loading }) {
  const [enabled, setEnabled] = useState(
    () => new Set(MARKER_KINDS.map((kind) => kind.id))
  );

  // Only real, numeric coordinates from the backend are plotted. Anything
  // without a usable lat/lng is dropped rather than guessed.
  const all = useMemo(() => {
    const payload = mapData?.markers || {};
    const out = [];
    MARKER_KINDS.forEach((kind) => {
      (payload[kind.id] || []).forEach((item) => {
        if (typeof item?.lat !== "number" || typeof item?.lng !== "number") return;
        out.push({ ...item, kind: kind.id, kindLabel: kind.label, color: kind.color });
      });
    });
    return out;
  }, [mapData]);

  const visible = useMemo(
    () => all.filter((marker) => enabled.has(marker.kind)),
    [all, enabled]
  );

  const toggle = (id) => {
    setEnabled((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const counts = useMemo(() => {
    const map = {};
    all.forEach((marker) => {
      map[marker.kind] = (map[marker.kind] || 0) + 1;
    });
    return map;
  }, [all]);

  return (
    <section className="ops-panel" aria-labelledby="ops-map-title">
      <header className="ops-panel__head">
        <h2 className="ops-panel__title" id="ops-map-title">
          Live Operations Map
        </h2>
        <span className="ops-panel__meta">
          {mapData?.generated_at
            ? `Locations updated ${formatTime(mapData.generated_at)}`
            : "Awaiting location data"}
          {cityLabel ? ` · ${cityLabel}` : ""}
        </span>
      </header>

      <div className="ops-map__filters" role="group" aria-label="Filter map markers">
        {MARKER_KINDS.map((kind) => (
          <button
            key={kind.id}
            type="button"
            className={`ops-map__filter ${enabled.has(kind.id) ? "is-on" : ""}`}
            aria-pressed={enabled.has(kind.id)}
            onClick={() => toggle(kind.id)}
          >
            <span className="ops-map__swatch" style={{ background: kind.color }} aria-hidden="true" />
            {kind.label}
            <span className="ops-map__count">{counts[kind.id] || 0}</span>
          </button>
        ))}
      </div>

      <div className="ops-map__frame">
        {loading && !all.length ? (
          <div className="ops-map__state">Loading live locations…</div>
        ) : all.length === 0 ? (
          <div className="ops-map__state ops-map__state--empty">
            <strong>No live location data available</strong>
            <p>
              The fleet service reported no drivers, couriers, trips or deliveries with
              coordinates for this city. The map will populate as soon as vehicles report
              their position.
            </p>
          </div>
        ) : visible.length === 0 ? (
          <div className="ops-map__state ops-map__state--empty">
            <strong>All marker categories are hidden</strong>
            <p>Enable a category above to display its live positions.</p>
          </div>
        ) : (
          <MapContainer
            className="ops-map__canvas"
            center={[visible[0].lat, visible[0].lng]}
            zoom={12}
            scrollWheelZoom
          >
            <TileLayer
              attribution="&copy; OpenStreetMap contributors"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <FitBounds points={visible} />
            {visible.map((marker) => (
              <Marker
                key={`${marker.kind}-${marker.id}`}
                position={[marker.lat, marker.lng]}
                icon={markerIcon(marker.color, marker.label || marker.kindLabel)}
              >
                <Popup>
                  <strong>{marker.label || marker.name || marker.reference || `#${marker.id}`}</strong>
                  <br />
                  {marker.kindLabel}
                  {marker.vehicle_plate ? (
                    <>
                      <br />
                      {marker.vehicle_plate}
                    </>
                  ) : null}
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        )}
      </div>
    </section>
  );
}

/**
 * Data-accuracy contract (matches the rest of YALA Admin):
 *   0  -> the backend confirmed the value IS zero
 *   —  -> the metric is unavailable / not provided
 * A missing key is therefore never rendered as a false zero.
 */
function metric(value) {
  return value === undefined || value === null ? "—" : value;
}

const KPI_SPEC = [
  { key: "online_drivers", label: "Online Drivers", icon: "🚗", tone: "success", hint: "Available for dispatch" },
  { key: "busy_drivers", label: "Busy Drivers", icon: "🛣️", tone: "info", hint: "Currently on a trip" },
  { key: "offline_drivers", label: "Offline Drivers", icon: "💤", tone: "neutral", hint: "Not connected" },
  { key: "online_couriers", label: "Available Couriers", icon: "📦", tone: "info", hint: "Ready for delivery" },
  { key: "active_trips", label: "Active Trips", icon: "🛰️", tone: "success", hint: "In progress now" },
  { key: "active_deliveries", label: "Active Deliveries", icon: "🚚", tone: "info", hint: "In progress now" },
  { key: "waiting_riders", label: "Waiting Riders", icon: "👤", tone: "warning", hint: "Awaiting a driver" },
];

function KpiCards({ fleet, emergency, loading }) {
  const counts = fleet?.counts || {};
  const cards = [
    ...KPI_SPEC.map((spec) => ({ ...spec, value: metric(counts[spec.key]) })),
    {
      key: "emergency_alerts",
      label: "Emergency Alerts",
      icon: "🚨",
      tone: emergency?.open_count > 0 ? "danger" : "success",
      hint:
        emergency?.critical_count > 0
          ? `${emergency.critical_count} critical`
          : "No open incidents",
      value: metric(emergency?.open_count),
    },
  ];

  return (
    <div className="ops-live-kpis" role="list" aria-label="Operational key performance indicators">
      {cards.map((card) => (
        <article
          key={card.key}
          role="listitem"
          className={`ops-live-kpi ops-live-kpi--${card.tone}`}
          aria-label={`${card.label}: ${card.value}`}
        >
          <span className="ops-live-kpi__icon" aria-hidden="true">
            {card.icon}
          </span>
          <div className="ops-live-kpi__body">
            <span className="ops-live-kpi__value">{loading ? "…" : card.value}</span>
            <span className="ops-live-kpi__label">{card.label}</span>
            {card.hint ? <span className="ops-live-kpi__hint">{card.hint}</span> : null}
          </div>
        </article>
      ))}
    </div>
  );
}

export default function OperationsCenter() {
  const { cityId } = usePermissions();
  const [tab, setTab] = useState("overview");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [wsConnected, setWsConnected] = useState(false);
  const [actionMessage, setActionMessage] = useState("");

  const canDispatch = data?.permissions?.dispatch;
  const cityLabel = cityId
    ? String(cityId).charAt(0).toUpperCase() + String(cityId).slice(1)
    : "All cities";

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
      <header className="ops-page__header">
        <div className="ops-page__heading">
          <h1 className="ops-page__title">Real-Time Operations Center</h1>
          <p className="ops-page__subtitle">
            Live dispatch, fleet monitoring and operational intelligence across YALA
            Technologies.
          </p>
        </div>
        <div className="ops-page__controls">
          <span className="ops-page__city" title="Active city filter">
            <span aria-hidden="true">📍</span> {cityLabel}
          </span>
          <span className={`ops-page__live ${wsConnected ? "is-live" : "is-polling"}`}>
            <span className="ops-page__live-dot" aria-hidden="true" />
            {wsConnected ? "Live" : "Polling 8s"}
          </span>
          <span className="ops-page__updated">Updated {formatTime(data?.generated_at)}</span>
          <button
            type="button"
            className="ops-page__refresh"
            onClick={load}
            disabled={loading}
            aria-label="Refresh operations data"
          >
            ⟳ Refresh
          </button>
        </div>
      </header>

      {error && <div className="ops-center__alert ops-center__alert--critical">{error}</div>}
      {actionMessage && <div className="ops-center__alert">{actionMessage}</div>}

      <div className="ops-tabs" role="tablist" aria-label="Operations Center sections">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`ops-tab-${item.id}`}
            aria-selected={tab === item.id}
            aria-controls={`ops-panel-${item.id}`}
            tabIndex={tab === item.id ? 0 : -1}
            className={`ops-tab ${tab === item.id ? "is-active" : ""}`}
            onClick={() => setTab(item.id)}
            onKeyDown={(event) => {
              const index = TABS.findIndex((entry) => entry.id === item.id);
              if (event.key === "ArrowRight") {
                event.preventDefault();
                setTab(TABS[(index + 1) % TABS.length].id);
              } else if (event.key === "ArrowLeft") {
                event.preventDefault();
                setTab(TABS[(index - 1 + TABS.length) % TABS.length].id);
              }
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="ops-stack" id="ops-panel-overview" role="tabpanel" aria-labelledby="ops-tab-overview">
          <KpiCards fleet={data?.fleet} emergency={data?.emergency} loading={loading} />
          <LiveMap mapData={data?.map} cityLabel={cityLabel} loading={loading} />
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
            <div className="ops-center__metric"><div className="ops-center__metric-label">Requests</div><div className="ops-center__metric-value">{metric(data?.analytics?.requests)}</div></div>
            <div className="ops-center__metric"><div className="ops-center__metric-label">Acceptance</div><div className="ops-center__metric-value">{metric(data?.analytics?.acceptance_rate)}%</div></div>
            <div className="ops-center__metric"><div className="ops-center__metric-label">Completion</div><div className="ops-center__metric-value">{metric(data?.analytics?.completion_rate)}%</div></div>
            <div className="ops-center__metric"><div className="ops-center__metric-label">Cancellation</div><div className="ops-center__metric-value">{metric(data?.analytics?.cancellation_rate)}%</div></div>
            <div className="ops-center__metric"><div className="ops-center__metric-label">Avg ETA</div><div className="ops-center__metric-value">{metric(data?.analytics?.average_eta_minutes)}m</div></div>
            <div className="ops-center__metric"><div className="ops-center__metric-label">Avg Wait</div><div className="ops-center__metric-value">{metric(data?.analytics?.average_wait_minutes)}m</div></div>
            <div className="ops-center__metric"><div className="ops-center__metric-label">Revenue / hr</div><div className="ops-center__metric-value">{data?.analytics?.revenue_per_hour === undefined || data?.analytics?.revenue_per_hour === null ? "—" : formatMoney(data.analytics.revenue_per_hour)}</div></div>
          </div>
        </div>
      )}
    </div>
  );
}
