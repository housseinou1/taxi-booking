import React, { useEffect, useId, useMemo } from "react";
import {
  MapContainer,
  Marker,
  Polygon,
  Polyline,
  TileLayer,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./delivery-map.css";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const courierIcon = new L.DivIcon({
  className: "delivery-map-marker delivery-map-marker--courier",
  html: '<div class="delivery-map-marker__pin delivery-map-marker__pin--courier">YD</div>',
  iconSize: [38, 38],
  iconAnchor: [19, 19],
});

const pickupIcon = new L.DivIcon({
  className: "delivery-map-marker delivery-map-marker--pickup",
  html: '<div class="delivery-map-marker__pin delivery-map-marker__pin--pickup"></div>',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});

const destinationIcon = new L.DivIcon({
  className: "delivery-map-marker delivery-map-marker--destination",
  html: '<div class="delivery-map-marker__pin delivery-map-marker__pin--destination"></div>',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});

const stopIcon = new L.DivIcon({
  className: "delivery-map-marker delivery-map-marker--stop",
  html: '<div class="delivery-map-marker__pin delivery-map-marker__pin--stop">S</div>',
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});

function MapAutoCenter({ position }) {
  const map = useMap();
  useEffect(() => {
    if (position) map.setView(position, map.getZoom(), { animate: true });
  }, [position, map]);
  return null;
}

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

export default function DeliveryMapView({
  courierPosition,
  activeDelivery,
  busyAreas = [],
  routePath = [],
  routeColor = "#f58220",
}) {
  const instanceId = useId();
  const center = courierPosition || [18.0735, -15.9582];
  const mapKey = activeDelivery?.id ? `delivery-${activeDelivery.id}` : instanceId;

  const fitPoints = useMemo(() => {
    if (!activeDelivery) return null;
    const points = [];
    if (activeDelivery.pickup_lat && activeDelivery.pickup_lng) {
      points.push([activeDelivery.pickup_lat, activeDelivery.pickup_lng]);
    }
    if (Array.isArray(activeDelivery.stops)) {
      [...activeDelivery.stops]
        .sort((left, right) => Number(left.stop_order || 0) - Number(right.stop_order || 0))
        .forEach((stop) => {
          if (stop.latitude && stop.longitude) points.push([stop.latitude, stop.longitude]);
        });
    }
    if (activeDelivery.destination_lat && activeDelivery.destination_lng) {
      points.push([activeDelivery.destination_lat, activeDelivery.destination_lng]);
    }
    if (courierPosition) points.push(courierPosition);
    return points.length >= 2 ? points : null;
  }, [activeDelivery, courierPosition]);

  const stops = useMemo(() => {
    if (!Array.isArray(activeDelivery?.stops)) return [];
    return [...activeDelivery.stops].sort(
      (left, right) => Number(left.stop_order || 0) - Number(right.stop_order || 0)
    );
  }, [activeDelivery]);

  return (
    <div className="delivery-map-container" data-testid="delivery-map-container">
      <MapContainer
        key={mapKey}
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

        {!activeDelivery && courierPosition ? <MapAutoCenter position={courierPosition} /> : null}
        {activeDelivery && fitPoints ? <FitBounds points={fitPoints} /> : null}

        {courierPosition ? <Marker position={courierPosition} icon={courierIcon} /> : null}

        {activeDelivery?.pickup_lat && activeDelivery?.pickup_lng ? (
          <Marker position={[activeDelivery.pickup_lat, activeDelivery.pickup_lng]} icon={pickupIcon} />
        ) : null}

        {activeDelivery?.destination_lat && activeDelivery?.destination_lng ? (
          <Marker
            position={[activeDelivery.destination_lat, activeDelivery.destination_lng]}
            icon={destinationIcon}
          />
        ) : null}

        {stops.map((stop, index) =>
          stop.latitude && stop.longitude ? (
            <Marker
              key={stop.id || `stop-${index}`}
              position={[stop.latitude, stop.longitude]}
              icon={stopIcon}
            />
          ) : null
        )}

        {routePath && routePath.length > 1 ? (
          <Polyline
            positions={routePath}
            pathOptions={{
              color: routeColor,
              weight: 6,
              opacity: 0.85,
              lineCap: "round",
              lineJoin: "round",
            }}
          />
        ) : null}

        {busyAreas
          ? busyAreas.map((area, index) => (
              <Polygon
                key={`busy-area-${index}`}
                positions={area.coordinates || area}
                pathOptions={{
                  color: area.color || "#f58220",
                  fillColor: area.fillColor || area.color || "#f58220",
                  fillOpacity: area.fillOpacity || 0.15,
                  weight: 2,
                  opacity: 0.6,
                }}
              />
            ))
          : null}
      </MapContainer>
    </div>
  );
}
