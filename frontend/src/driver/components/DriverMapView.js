import React, { useEffect, useMemo } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  Polygon,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "./DriverMapView.css";
import L from "leaflet";

// Fix default marker icon issue with webpack
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

/**
 * Driver position marker - professional Yala driver mark.
 */
const driverIcon = new L.DivIcon({
  className: "driver-map-marker",
  html: `<div style="width:36px;height:36px;border-radius:50%;background:#0B1220;border:3px solid #00A651;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.3)"><span style="font-size:12px;font-weight:900;color:#fff;letter-spacing:.02em">YD</span></div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

/**
 * Pickup marker - green circle
 */
const pickupIcon = new L.DivIcon({
  className: "driver-map-marker",
  html: `<div style="width:28px;height:28px;border-radius:50%;background:#00A651;border:2px solid #fff;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.3)"><div style="width:10px;height:10px;border-radius:50%;background:#fff"></div></div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

/**
 * Destination marker - red circle
 */
const destinationIcon = new L.DivIcon({
  className: "driver-map-marker",
  html: `<div style="width:28px;height:28px;border-radius:50%;background:#EF4444;border:2px solid #fff;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.3)"><div style="width:10px;height:10px;border-radius:50%;background:#fff"></div></div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

/**
 * Auto-centers map on driver position when no active ride
 */
function MapAutoCenter({ position }) {
  const map = useMap();
  useEffect(() => {
    if (position) {
      map.setView(position, map.getZoom(), { animate: true });
    }
  }, [position, map]);
  return null;
}

/**
 * Fits map bounds to show all relevant points during active ride
 */
function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (points && points.length >= 2) {
      const bounds = L.latLngBounds(points);
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [50, 50], animate: true });
      }
    }
  }, [points, map]);
  return null;
}

/**
 * DriverMapView - Full-screen Leaflet map for the driver dashboard.
 *
 * Props:
 * - driverPosition: [lat, lng] - current driver GPS position
 * - activeRide: object with pickup_lat/lng, destination_lat/lng
 * - busyAreas: array of polygon coordinates [[lat,lng], ...]
 * - routePath: array of [lat, lng] coordinates for route polyline
 */
export default function DriverMapView({
  driverPosition,
  activeRide,
  busyAreas = [],
  routePath = [],
}) {
  const center = driverPosition || [18.0735, -15.9582]; // Default: Nouakchott

  const fitPoints = useMemo(() => {
    if (!activeRide) return null;
    const points = [];
    if (activeRide.pickup_lat && activeRide.pickup_lng) {
      points.push([activeRide.pickup_lat, activeRide.pickup_lng]);
    }
    if (activeRide.destination_lat && activeRide.destination_lng) {
      points.push([activeRide.destination_lat, activeRide.destination_lng]);
    }
    if (driverPosition) points.push(driverPosition);
    return points.length >= 2 ? points : null;
  }, [activeRide, driverPosition]);

  return (
    <div className="driver-map-container" data-testid="driver-map-container">
      <MapContainer
        center={center}
        zoom={14}
        style={{ width: "100%", height: "100%" }}
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />

        {/* Auto-center on driver when no active ride */}
        {!activeRide && driverPosition && (
          <MapAutoCenter position={driverPosition} />
        )}

        {/* Fit bounds to show all points during active ride */}
        {activeRide && fitPoints && <FitBounds points={fitPoints} />}

        {/* Driver position marker */}
        {driverPosition && (
          <Marker position={driverPosition} icon={driverIcon} />
        )}

        {/* Pickup marker (green) */}
        {activeRide?.pickup_lat && activeRide?.pickup_lng && (
          <Marker
            position={[activeRide.pickup_lat, activeRide.pickup_lng]}
            icon={pickupIcon}
          />
        )}

        {/* Destination marker (red) */}
        {activeRide?.destination_lat && activeRide?.destination_lng && (
          <Marker
            position={[activeRide.destination_lat, activeRide.destination_lng]}
            icon={destinationIcon}
          />
        )}

        {/* Route polyline - dark blue, weight 5 */}
        {routePath && routePath.length > 1 && (
          <Polyline
            positions={routePath}
            pathOptions={{
              color: "#0B1220",
              weight: 5,
              opacity: 0.85,
              lineCap: "round",
              lineJoin: "round",
            }}
          />
        )}

        {/* Busy area polygons - semi-transparent colored zones */}
        {busyAreas &&
          busyAreas.map((area, index) => (
            <Polygon
              key={`busy-area-${index}`}
              positions={area.coordinates || area}
              pathOptions={{
                color: area.color || "#FF6B35",
                fillColor: area.fillColor || area.color || "#FF6B35",
                fillOpacity: area.fillOpacity || 0.15,
                weight: 2,
                opacity: 0.6,
              }}
            />
          ))}
      </MapContainer>
    </div>
  );
}
