import React, { useEffect, useMemo, useRef } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./MapView.css";

/**
 * Creates a Leaflet DivIcon for a given marker type.
 * Uses CSS classes from MapView.css with design tokens.
 */
function createMarkerIcon(type, animate = false) {
  const sizeMap = {
    pickup: [28, 28],
    destination: [28, 28],
    stop: [22, 22],
    driver: [32, 32],
  };

  const size = sizeMap[type] || [28, 28];
  const animateClass = type === "driver" && animate ? " mapview-marker--animate" : "";
  const driverAnimatedClass = type === "driver" && animate ? " mapview-driver-animated" : "";

  return L.divIcon({
    className: `mapview-marker-wrapper${driverAnimatedClass}`,
    html: `<div class="mapview-marker mapview-marker--${type}${animateClass}">
      <span class="mapview-marker__inner"></span>
    </div>`,
    iconSize: size,
    iconAnchor: [size[0] / 2, size[1] / 2],
    popupAnchor: [0, -size[1] / 2],
  });
}

/**
 * Component that handles map click events.
 */
function MapClickHandler({ onMapClick }) {
  useMapEvents({
    click(e) {
      if (onMapClick) {
        onMapClick([e.latlng.lat, e.latlng.lng]);
      }
    },
  });
  return null;
}

/**
 * Component that auto-fits map bounds to show all markers.
 */
function FitBoundsHandler({ markers, fitBounds }) {
  const map = useMap();

  useEffect(() => {
    if (!fitBounds || !markers || markers.length < 2) return;

    const positions = markers.map((m) => m.position);
    const bounds = L.latLngBounds(positions);

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
    }
  }, [map, markers, fitBounds]);

  return null;
}

/**
 * Animated driver marker component.
 * Uses a ref to smoothly update position without re-mounting.
 */
function AnimatedMarker({ position, icon, label }) {
  const markerRef = useRef(null);
  const prevPositionRef = useRef(position);

  useEffect(() => {
    const marker = markerRef.current;
    if (marker && prevPositionRef.current !== position) {
      // Add animation class to the marker element
      const el = marker.getElement && marker.getElement();
      if (el) {
        el.classList.add("mapview-driver-animated");
      }
      if (marker.setLatLng) {
        marker.setLatLng(position);
      }
      prevPositionRef.current = position;
    }
  }, [position]);

  return (
    <Marker
      ref={markerRef}
      position={position}
      icon={icon}
      title={label || "Driver"}
    />
  );
}

/**
 * MapView - Full-screen Leaflet map component for the rider app.
 *
 * Props:
 * - center: [lat, lng] — map center coordinates
 * - zoom: number — zoom level (default 13)
 * - markers: MapMarker[] — array of markers with type-based icons
 * - routePath: [lat, lng][] — polyline coordinates from OSRM
 * - fitBounds: boolean — auto-fit to show all markers
 * - onMapClick: (latlng: [lat, lng]) => void — click handler
 */
function MapView({
  center,
  zoom = 13,
  markers = [],
  routePath = [],
  fitBounds = false,
  onMapClick,
}) {
  // Memoize marker icons to avoid re-creating on every render
  const markerIcons = useMemo(() => {
    const icons = {};
    const types = ["pickup", "destination", "stop", "driver"];
    types.forEach((type) => {
      icons[type] = createMarkerIcon(type, false);
      icons[`${type}_animated`] = createMarkerIcon(type, true);
    });
    return icons;
  }, []);

  // Separate driver markers (animated) from static markers
  const staticMarkers = markers.filter((m) => m.type !== "driver" || !m.animate);
  const animatedMarkers = markers.filter((m) => m.type === "driver" && m.animate);

  return (
    <div className="mapview-container" data-testid="mapview-container">
      <MapContainer
        center={center}
        zoom={zoom}
        style={{ width: "100%", height: "100%" }}
        zoomControl={true}
        attributionControl={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Handle map click events */}
        {onMapClick && <MapClickHandler onMapClick={onMapClick} />}

        {/* Auto-fit bounds to markers */}
        <FitBoundsHandler markers={markers} fitBounds={fitBounds} />

        {/* Render static markers (pickup, destination, stop, non-animated driver) */}
        {staticMarkers.map((marker) => {
          const iconKey = marker.type;
          return (
            <Marker
              key={marker.id}
              position={marker.position}
              icon={markerIcons[iconKey]}
              title={marker.label || marker.type}
            />
          );
        })}

        {/* Render animated driver markers with smooth transitions */}
        {animatedMarkers.map((marker) => (
          <AnimatedMarker
            key={marker.id}
            position={marker.position}
            icon={markerIcons[`${marker.type}_animated`]}
            label={marker.label}
          />
        ))}

        {/* Render route polyline */}
        {routePath.length >= 2 && (
          <Polyline
            positions={routePath}
            pathOptions={{
              color: "#00A651",
              weight: 4,
              opacity: 0.8,
              lineCap: "round",
              lineJoin: "round",
            }}
          />
        )}
      </MapContainer>
    </div>
  );
}

export default MapView;
