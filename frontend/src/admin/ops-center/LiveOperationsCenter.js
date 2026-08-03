/**
 * Live Operations Center — Real-Time Map + Sidebar (Mission 17 Commit 2)
 *
 * Full-screen operations map with floating panels for dispatchers,
 * operations managers, and the CEO.
 *
 * Does NOT modify backend logic, pricing, dispatch, or payments.
 * UI + real-time data display only.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import authenticatedApi from "../../auth/authenticatedApi";
import { API_URL } from "../../apiConfig";
import "./LiveOperationsCenter.css";

// ─── Map Icons ───────────────────────────────────────────────────────────────

function createIcon(color, label) {
  return L.divIcon({
    className: "ops-map-marker",
    html: `<span class="ops-map-marker__dot" style="background:${color}" title="${label}"></span>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

const ICONS = {
  driver: createIcon("#10b981", "Driver"),
  courier: createIcon("#f59e0b", "Courier"),
  rider: createIcon("#3b82f6", "Rider"),
  trip: createIcon("#059669", "Active Trip"),
  delivery: createIcon("#d97706", "Delivery"),
  sos: createIcon("#ef4444", "SOS"),
};

const FILTERS = [
  { id: "drivers", label: "Drivers", color: "#10b981" },
  { id: "couriers", label: "Couriers", color: "#f59e0b" },
  { id: "riders", label: "Riders", color: "#3b82f6" },
  { id: "trips", label: "Trips", color: "#059669" },
  { id: "deliveries", label: "Deliveries", color: "#d97706" },
  { id: "sos", label: "SOS", color: "#ef4444" },
];

const DEFAULT_CENTER = [18.0735, -15.9582]; // Nouakchott
const DEFAULT_ZOOM = 13;

// ─── Data Fetching ───────────────────────────────────────────────────────────

async function fetchLiveData() {
  try {
    const response = await authenticatedApi.get(`${API_URL}/operations/admin/dashboard/`);
    return response.data;
  } catch {
    return null;
  }
}

// ─── Map Auto-Fit ────────────────────────────────────────────────────────────

function MapBoundsUpdater({ markers }) {
  const map = useMap();
  useEffect(() => {
    if (markers.length > 1) {
      const bounds = L.latLngBounds(markers.map((m) => [m.lat, m.lng]));
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    }
  }, [markers, map]);
  return null;
}

// ─── Sidebar Panel ───────────────────────────────────────────────────────────

function SidebarPanel({ title, count, icon, items, onSelect, selected }) {
  return (
    <section className="ops-live__panel" aria-label={title}>
      <header className="ops-live__panel-header">
        <span className="ops-live__panel-icon" aria-hidden="true">{icon}</span>
        <h3 className="ops-live__panel-title">{title}</h3>
        <span className="ops-live__panel-count">{count}</span>
      </header>
      {items.length > 0 && (
        <ul className="ops-live__panel-list">
          {items.slice(0, 8).map((item) => (
            <li
              key={item.id}
              className={`ops-live__panel-item ${selected?.id === item.id ? "is-selected" : ""}`}
              onClick={() => onSelect(item)}
              onKeyDown={(e) => e.key === "Enter" && onSelect(item)}
              tabIndex={0}
              role="button"
              aria-label={`${item.label || item.name || item.id}`}
            >
              <span className="ops-live__panel-item-name">{item.label || item.name || `#${item.id}`}</span>
              <span className="ops-live__panel-item-status">{item.status || ""}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ─── Details Panel ───────────────────────────────────────────────────────────

function DetailsPanel({ marker, onClose }) {
  if (!marker) return null;
  return (
    <aside className="ops-live__details" aria-label="Selected item details">
      <header className="ops-live__details-header">
        <h3 className="ops-live__details-title">{marker.name || marker.label || `#${marker.id}`}</h3>
        <button className="ops-live__details-close" onClick={onClose} aria-label="Close details">✕</button>
      </header>
      <div className="ops-live__details-body">
        {marker.photo && <img src={marker.photo} alt="" className="ops-live__details-photo" />}
        <dl className="ops-live__details-dl">
          <dt>Type</dt><dd>{marker.kind}</dd>
          <dt>Status</dt><dd>{marker.status || "active"}</dd>
          {marker.vehicle && <><dt>Vehicle</dt><dd>{marker.vehicle}</dd></>}
          {marker.phone && <><dt>Phone</dt><dd>{marker.phone}</dd></>}
          {marker.destination && <><dt>Destination</dt><dd>{marker.destination}</dd></>}
          {marker.fare && <><dt>Fare</dt><dd>{marker.fare} MRU</dd></>}
          <dt>Location</dt><dd>{marker.lat?.toFixed(4)}, {marker.lng?.toFixed(4)}</dd>
        </dl>
      </div>
    </aside>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function LiveOperationsCenter() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [activeFilters, setActiveFilters] = useState(
    () => new Set(FILTERS.map((f) => f.id))
  );
  const [selectedMarker, setSelectedMarker] = useState(null);
  const intervalRef = useRef(null);

  const load = useCallback(async () => {
    const result = await fetchLiveData();
    if (result) {
      setData(result);
      setLastUpdated(new Date());
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    intervalRef.current = setInterval(load, 12000);
    return () => clearInterval(intervalRef.current);
  }, [load]);

  const toggleFilter = (id) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Build markers from data
  const allMarkers = useMemo(() => {
    if (!data) return [];
    const markers = [];
    const raw = data.map_data || data.markers || data;

    const driversList = raw.drivers || raw.online_drivers || [];
    const couriersList = raw.couriers || raw.online_couriers || [];
    const ridersList = raw.riders || raw.active_riders || [];
    const tripsList = raw.trips || raw.active_rides || [];
    const deliveriesList = raw.deliveries || raw.active_deliveries || [];
    const sosList = raw.sos || raw.sos_alerts || [];

    if (activeFilters.has("drivers")) {
      driversList.forEach((d) => {
        if (d.lat && d.lng) markers.push({ ...d, kind: "driver", icon: ICONS.driver });
      });
    }
    if (activeFilters.has("couriers")) {
      couriersList.forEach((c) => {
        if (c.lat && c.lng) markers.push({ ...c, kind: "courier", icon: ICONS.courier });
      });
    }
    if (activeFilters.has("riders")) {
      ridersList.forEach((r) => {
        if (r.lat && r.lng) markers.push({ ...r, kind: "rider", icon: ICONS.rider });
      });
    }
    if (activeFilters.has("trips")) {
      tripsList.forEach((t) => {
        if (t.lat && t.lng) markers.push({ ...t, kind: "trip", icon: ICONS.trip });
      });
    }
    if (activeFilters.has("deliveries")) {
      deliveriesList.forEach((d) => {
        if (d.lat && d.lng) markers.push({ ...d, kind: "delivery", icon: ICONS.delivery });
      });
    }
    if (activeFilters.has("sos")) {
      sosList.forEach((s) => {
        if (s.lat && s.lng) markers.push({ ...s, kind: "sos", icon: ICONS.sos });
      });
    }
    return markers;
  }, [data, activeFilters]);

  // Sidebar data
  const sidebarPanels = useMemo(() => {
    if (!data) return [];
    const raw = data.map_data || data.markers || data;
    return [
      { id: "trips", title: "Active Rides", icon: "🚖", items: raw.trips || raw.active_rides || [] },
      { id: "deliveries", title: "Active Deliveries", icon: "📦", items: raw.deliveries || raw.active_deliveries || [] },
      { id: "drivers", title: "Online Drivers", icon: "🟢", items: raw.drivers || raw.online_drivers || [] },
      { id: "couriers", title: "Online Couriers", icon: "🟠", items: raw.couriers || raw.online_couriers || [] },
      { id: "sos", title: "SOS Alerts", icon: "🚨", items: raw.sos || raw.sos_alerts || [] },
    ];
  }, [data]);

  if (loading && !data) {
    return (
      <div className="ops-live ops-live--loading" role="status">
        <div className="ops-live__spinner" />
        <p>Loading Live Operations...</p>
      </div>
    );
  }

  return (
    <div className="ops-live">
      {/* ─── Top Bar ───────────────────────────────────────── */}
      <header className="ops-live__topbar">
        <h1 className="ops-live__topbar-title">Live Operations Center</h1>
        <div className="ops-live__topbar-meta">
          {lastUpdated && (
            <time className="ops-live__topbar-time">
              Updated {lastUpdated.toLocaleTimeString()}
            </time>
          )}
          <span className="ops-live__topbar-count">
            {allMarkers.length} active on map
          </span>
        </div>
      </header>

      {/* ─── Filter Bar ────────────────────────────────────── */}
      <nav className="ops-live__filters" aria-label="Map filters">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            className={`ops-live__filter-btn ${activeFilters.has(f.id) ? "is-active" : ""}`}
            onClick={() => toggleFilter(f.id)}
            aria-pressed={activeFilters.has(f.id)}
            style={{ "--filter-color": f.color }}
          >
            <span className="ops-live__filter-dot" aria-hidden="true" />
            {f.label}
          </button>
        ))}
      </nav>

      {/* ─── Main Layout ───────────────────────────────────── */}
      <div className="ops-live__layout">
        {/* Sidebar */}
        <aside className="ops-live__sidebar" aria-label="Operations sidebar">
          {sidebarPanels.map((panel) => (
            <SidebarPanel
              key={panel.id}
              title={panel.title}
              count={panel.items.length}
              icon={panel.icon}
              items={panel.items}
              onSelect={setSelectedMarker}
              selected={selectedMarker}
            />
          ))}
        </aside>

        {/* Map */}
        <main className="ops-live__map-container" aria-label="Operations map">
          <MapContainer
            center={DEFAULT_CENTER}
            zoom={DEFAULT_ZOOM}
            className="ops-live__map"
            zoomControl={true}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://osm.org/copyright">OSM</a>'
            />
            <MapBoundsUpdater markers={allMarkers} />
            {allMarkers.map((marker, idx) => (
              <Marker
                key={`${marker.kind}-${marker.id || idx}`}
                position={[marker.lat, marker.lng]}
                icon={marker.icon}
                eventHandlers={{ click: () => setSelectedMarker(marker) }}
              >
                <Popup>
                  <strong>{marker.name || marker.label || marker.kind}</strong>
                  <br />
                  {marker.status || "active"}
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </main>

        {/* Details Panel */}
        <DetailsPanel marker={selectedMarker} onClose={() => setSelectedMarker(null)} />
      </div>
    </div>
  );
}
