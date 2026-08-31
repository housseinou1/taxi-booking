import React, { useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const DEFAULT_CENTER = [18.0735, -15.9582];

function createDivIcon(className, label) {
  return L.divIcon({
    className: "admin-map-marker-wrap",
    html: `<div class="admin-map-marker ${className}">${label || ""}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

export function DriverMarker({ position, label, popup }) {
  return (
    <Marker position={position} icon={createDivIcon("admin-map-marker--driver", "D")}>
      {popup ? <Popup>{popup}</Popup> : null}
    </Marker>
  );
}

export function RideMarker({ position, label, popup }) {
  return (
    <Marker position={position} icon={createDivIcon("admin-map-marker--ride", "R")}>
      {popup ? <Popup>{popup}</Popup> : null}
    </Marker>
  );
}

export function DeliveryMarker({ position, label, popup }) {
  return (
    <Marker position={position} icon={createDivIcon("admin-map-marker--delivery", "L")}>
      {popup ? <Popup>{popup}</Popup> : null}
    </Marker>
  );
}

export function MapLegend({ items = [] }) {
  return (
    <div className="admin-map-legend" aria-label="Map legend">
      {items.map((item) => (
        <div key={item.label} className="admin-map-legend__item">
          <span className={`admin-map-marker admin-map-marker--${item.type}`} aria-hidden="true" />
          {item.label}
        </div>
      ))}
    </div>
  );
}

export function MapToolbar({ children }) {
  return <div className="admin-map-toolbar">{children}</div>;
}

export function MapFilters({ children, onReset }) {
  return (
    <div className="admin-map-filters">
      {children}
      {onReset ? (
        <button type="button" className="admin-lib-btn admin-lib-btn--ghost" onClick={onReset}>
          Reset
        </button>
      ) : null}
    </div>
  );
}

export function HeatmapOverlay({ points = [] }) {
  // Lightweight circle overlay approximation for admin heatmap layer
  return (
    <>
      {points.map((point, index) => (
        <Marker
          key={point.id || index}
          position={[point.lat, point.lng]}
          icon={L.divIcon({
            className: "admin-heatmap-dot-wrap",
            html: `<div class="admin-heatmap-dot" style="opacity:${Math.min(1, point.intensity || 0.5)}"></div>`,
            iconSize: [16, 16],
            iconAnchor: [8, 8],
          })}
        />
      ))}
    </>
  );
}

function MapClickHandler({ onMapClick }) {
  useMapEvents({
    click(e) {
      onMapClick?.({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

export default function LiveMap({
  center = DEFAULT_CENTER,
  zoom = 12,
  height = 360,
  loading,
  error,
  empty,
  children,
  toolbar,
  filters,
  legend,
  onMapClick,
  onRefresh,
}) {
  const mapKey = useMemo(() => `${center[0]}-${center[1]}-${zoom}`, [center, zoom]);

  if (loading) return <div className="admin-map-shell admin-map-shell--loading" style={{ height }} aria-busy="true" />;
  if (error) return <div className="admin-map-shell admin-map-shell--error" style={{ height }}>{error}</div>;
  if (empty) return <div className="admin-map-shell admin-map-shell--empty" style={{ height }}>No map data</div>;

  return (
    <section className="admin-map-shell" style={{ height }} aria-label="Live map">
      {toolbar}
      {filters}
      <div className="admin-map-shell__canvas">
        <MapContainer key={mapKey} center={center} zoom={zoom} style={{ height: "100%", width: "100%" }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {onMapClick ? <MapClickHandler onMapClick={onMapClick} /> : null}
          {children}
        </MapContainer>
        {legend}
      </div>
      {onRefresh ? (
        <button type="button" className="admin-map-shell__refresh admin-lib-btn admin-lib-btn--ghost" onClick={onRefresh}>
          Refresh map
        </button>
      ) : null}
    </section>
  );
}
