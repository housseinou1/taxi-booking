import React from "react";

import GoogleTripMap from "../maps/GoogleTripMap";

const toPoint = (lat, lng) => {
  const point = [Number(lat), Number(lng)];
  return point.some(Number.isNaN) ? null : point;
};

const getAddress = (ride, key) =>
  ride?.[key] || ride?.[`${key}_address`] || (key === "pickup" ? "Pickup" : "Drop-off");

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

      <GoogleTripMap
        center={driverPoint}
        zoom={14}
        style={mapStyle}
        fitPoints={[driverPoint, pickupPoint, dropoffPoint].filter(Boolean)}
        markers={[
          {
            id: "driver",
            position: driverPoint,
            title: `Your live location ${currentLat.toFixed(5)}, ${currentLng.toFixed(5)}`,
            label: "D",
            type: "driver",
          },
          pickupPoint && {
            id: "pickup",
            position: pickupPoint,
            title: `Rider pickup: ${getAddress(mapRide, "pickup")}`,
            label: "P",
          },
          dropoffPoint && {
            id: "dropoff",
            position: dropoffPoint,
            title: `Drop-off: ${getAddress(mapRide, "destination")}`,
            label: "G",
          },
        ].filter(Boolean)}
        polylines={[
          {
            id: "to-pickup",
            path: routeToPickup,
            color: "#2563eb",
            weight: 5,
            opacity: 0.72,
          },
          {
            id: "trip-route",
            path: tripRoute,
            color: "#f97316",
            weight: 5,
            opacity: 0.72,
          },
        ]}
      />
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
