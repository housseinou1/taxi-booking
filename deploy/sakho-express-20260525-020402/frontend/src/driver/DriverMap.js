import React from "react";
import {
  CircleMarker,
  MapContainer,
  Polyline,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";

import "leaflet/dist/leaflet.css";

const toPoint = (lat, lng) => {
  const point = [Number(lat), Number(lng)];
  return point.some(Number.isNaN) ? null : point;
};

const getAddress = (ride, key) =>
  ride?.[key] || ride?.[`${key}_address`] || (key === "pickup" ? "Pickup" : "Drop-off");

function MapAutoFit({ points }) {
  const map = useMap();
  const validPoints = points.filter(Boolean);

  React.useEffect(() => {
    if (validPoints.length === 0) return;

    if (validPoints.length === 1) {
      map.setView(validPoints[0], 14);
      return;
    }

    map.fitBounds(validPoints, {
      padding: [42, 42],
      maxZoom: 15,
    });
  }, [map, validPoints]);

  return null;
}

function DriverMap({ driverLocation, activeRide, availableRides = [] }) {
  const [routeToPickup, setRouteToPickup] = React.useState([]);
  const [tripRoute, setTripRoute] = React.useState([]);
  const [routeSummary, setRouteSummary] = React.useState(null);
  const currentLat = Number(driverLocation?.current_lat || 18.0735);
  const currentLng = Number(driverLocation?.current_lng || -15.9582);
  const mapRide = activeRide || availableRides[0] || null;
  const pickupLat = mapRide?.pickup_lat;
  const pickupLng = mapRide?.pickup_lng;
  const dropoffLat = mapRide?.destination_lat;
  const dropoffLng = mapRide?.destination_lng;

  const driverPoint = React.useMemo(() => [currentLat, currentLng], [currentLat, currentLng]);
  const pickupPoint = React.useMemo(() => toPoint(pickupLat, pickupLng), [pickupLat, pickupLng]);
  const dropoffPoint = React.useMemo(
    () => toPoint(dropoffLat, dropoffLng),
    [dropoffLat, dropoffLng]
  );
  const nextStop =
    activeRide?.status === "in_progress"
      ? dropoffPoint
      : pickupPoint;

  React.useEffect(() => {
    let cancelled = false;

    const fetchRoute = async (start, end) => {
      if (!start || !end) return null;

      const url = `https://router.project-osrm.org/route/v1/driving/${start[1]},${start[0]};${end[1]},${end[0]}?overview=full&geometries=geojson`;
      const response = await fetch(url);
      const data = await response.json();
      const route = data.routes?.[0];

      if (!route) return null;

      return {
        points: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
        distanceKm: route.distance / 1000,
        etaMinutes: Math.max(1, Math.round(route.duration / 60)),
      };
    };

    const loadRoutes = async () => {
      const fallbackToPickup = pickupPoint ? [driverPoint, pickupPoint] : [];
      const fallbackTrip = pickupPoint && dropoffPoint ? [pickupPoint, dropoffPoint] : [];

      try {
        const [pickupRoute, destinationRoute] = await Promise.all([
          fetchRoute(driverPoint, pickupPoint),
          fetchRoute(pickupPoint, dropoffPoint),
        ]);

        if (cancelled) return;

        setRouteToPickup(pickupRoute?.points || fallbackToPickup);
        setTripRoute(destinationRoute?.points || fallbackTrip);
        setRouteSummary(pickupRoute || destinationRoute || null);
      } catch (error) {
        console.log("Route service unavailable:", error);
        if (cancelled) return;

        setRouteToPickup(fallbackToPickup);
        setTripRoute(fallbackTrip);
        setRouteSummary(null);
      }
    };

    loadRoutes();

    return () => {
      cancelled = true;
    };
  }, [driverPoint, dropoffPoint, mapRide?.id, pickupPoint]);

  return (
    <div style={mapBoxStyle}>
      <div style={mapOverlayStyle}>
        <span style={mapStatusStyle}>
          {mapRide
            ? activeRide?.status === "in_progress"
              ? "Tracking drop-off"
              : "Rider pickup located"
            : "Waiting for rider pickup"}
        </span>
        {nextStop && (
          <span style={mapCoordsStyle}>
            {routeSummary
              ? `${routeSummary.etaMinutes} min · ${routeSummary.distanceKm.toFixed(1)} km`
              : `${nextStop[0].toFixed(5)}, ${nextStop[1].toFixed(5)}`}
          </span>
        )}
      </div>

      <MapContainer
        center={driverPoint}
        zoom={14}
        style={mapStyle}
      >
        <MapAutoFit points={[driverPoint, pickupPoint, dropoffPoint]} />

        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {routeToPickup.length === 2 && (
          <Polyline
            positions={routeToPickup}
            pathOptions={{ color: "#2563eb", weight: 5, opacity: 0.72 }}
          />
        )}

        {tripRoute.length === 2 && (
          <Polyline
            positions={tripRoute}
            pathOptions={{ color: "#f97316", weight: 5, opacity: 0.72 }}
          />
        )}

        <CircleMarker
          center={driverPoint}
          radius={10}
          pathOptions={{
            color: "#ffffff",
            fillColor: "#111827",
            fillOpacity: 1,
            weight: 3,
          }}
        >
          <Popup>
            Your live location
            <br />
            Lat: {currentLat.toFixed(5)}
            <br />
            Lng: {currentLng.toFixed(5)}
          </Popup>
        </CircleMarker>

        {pickupPoint && (
          <CircleMarker
            center={pickupPoint}
            radius={10}
            pathOptions={{
              color: "#ffffff",
              fillColor: "#12b76a",
              fillOpacity: 1,
              weight: 3,
            }}
          >
            <Popup>
              Rider pickup
              <br />
              {getAddress(mapRide, "pickup")}
              <br />
              Lat: {pickupPoint[0].toFixed(5)}
              <br />
              Lng: {pickupPoint[1].toFixed(5)}
            </Popup>
          </CircleMarker>
        )}

        {dropoffPoint && (
          <CircleMarker
            center={dropoffPoint}
            radius={10}
            pathOptions={{
              color: "#ffffff",
              fillColor: "#f97316",
              fillOpacity: 1,
              weight: 3,
            }}
          >
            <Popup>
              Drop-off
              <br />
              {getAddress(mapRide, "destination")}
              <br />
              Lat: {dropoffPoint[0].toFixed(5)}
              <br />
              Lng: {dropoffPoint[1].toFixed(5)}
            </Popup>
          </CircleMarker>
        )}
      </MapContainer>
    </div>
  );
}

const mapBoxStyle = {
  background: "#111827",
  padding: "0",
  borderRadius: "0",
  overflow: "hidden",
  border: "none",
  position: "relative",
  height: "100%",
};

const mapStyle = {
  height: "100%",
  width: "100%",
};

const mapOverlayStyle = {
  position: "absolute",
  zIndex: 500,
  top: "14px",
  left: "14px",
  right: "14px",
  display: "flex",
  gap: "10px",
  justifyContent: "space-between",
  alignItems: "center",
  flexWrap: "wrap",
  pointerEvents: "none",
};

const mapStatusStyle = {
  background: "rgba(17, 24, 39, 0.9)",
  color: "white",
  borderRadius: "999px",
  padding: "9px 12px",
  fontSize: "0.82rem",
  fontWeight: 900,
  boxShadow: "0 12px 24px rgba(15, 23, 42, 0.24)",
};

const mapCoordsStyle = {
  background: "rgba(255, 255, 255, 0.92)",
  color: "#111827",
  borderRadius: "999px",
  padding: "9px 12px",
  fontSize: "0.78rem",
  fontWeight: 900,
  boxShadow: "0 12px 24px rgba(15, 23, 42, 0.16)",
};

export default DriverMap;
