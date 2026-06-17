import React from "react";

import GoogleTripMap from "../maps/GoogleTripMap";

const toPoint = (lat, lng) => {
  const point = [Number(lat), Number(lng)];
  return point.some(Number.isNaN) ? null : point;
};

const getAddress = (ride, key) =>
  ride?.[key] || ride?.[`${key}_address`] || (key === "pickup" ? "Pickup" : "Drop-off");

function DriverMap({ driverLocation, activeRide, availableRides = [], onRouteUpdate }) {
  const [routeToPickup, setRouteToPickup] = React.useState([]);
  const [tripRoute, setTripRoute] = React.useState([]);
  const [routeSummary, setRouteSummary] = React.useState(null);
  const [nextInstruction, setNextInstruction] = React.useState("Continue toward the pickup");
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
  const etaTitle = mapRide
    ? activeRide?.status === "in_progress"
      ? "Drop-off ETA"
      : "Pickup ETA"
    : "Ready for requests";
  const etaValue = routeSummary ? `${routeSummary.etaMinutes} min` : "--";
  const distanceValue = routeSummary ? `${routeSummary.distanceKm.toFixed(1)} km` : "--";

  React.useEffect(() => {
    let cancelled = false;

    const fetchRoute = async (start, end) => {
      if (!start || !end) return null;

      if (window.google?.maps?.DirectionsService) {
        try {
          const googleRoute = await fetchGoogleDirections(start, end);
          if (googleRoute) return googleRoute;
        } catch (error) {
          console.log("Google Directions unavailable, using route fallback:", error);
        }
      }

      const url = `https://router.project-osrm.org/route/v1/driving/${start[1]},${start[0]};${end[1]},${end[0]}?overview=full&geometries=geojson&steps=true`;
      const response = await fetch(url);
      const data = await response.json();
      const route = data.routes?.[0];

      if (!route) return null;

      return {
        points: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
        distanceKm: route.distance / 1000,
        etaMinutes: Math.max(1, Math.round(route.duration / 60)),
        instruction: getRouteInstruction(route.legs?.[0]?.steps || []),
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
        const activeRoute = activeRide?.status === "in_progress" ? destinationRoute : pickupRoute;
        setRouteSummary(activeRoute || null);
        setNextInstruction(
          activeRoute?.instruction ||
            (activeRide?.status === "in_progress"
              ? "Continue toward the drop-off"
              : "Continue toward the rider pickup")
        );
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
  }, [activeRide?.status, driverPoint, dropoffPoint, mapRide?.id, pickupPoint]);

  React.useEffect(() => {
    if (onRouteUpdate) onRouteUpdate(routeSummary);
  }, [onRouteUpdate, routeSummary]);

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

      <div style={floatingEtaCardStyle}>
        <span style={etaLabelStyle}>{etaTitle}</span>
        <strong style={etaValueStyle}>{etaValue}</strong>
        <span style={etaDistanceStyle}>{distanceValue}</span>
      </div>

      {activeRide && ["accepted", "driver_arriving", "in_progress"].includes(activeRide.status) && (
        <div style={navigationInstructionStyle}>
          <span style={navigationInstructionEyebrowStyle}>
            {activeRide.status === "in_progress" ? "Navigate to drop-off" : "Navigate to pickup"}
          </span>
          <strong style={navigationInstructionTextStyle}>{nextInstruction}</strong>
          <span style={navigationInstructionMetaStyle}>
            {routeSummary
              ? `${routeSummary.etaMinutes} min · ${routeSummary.distanceKm.toFixed(1)} km`
              : "Recalculating route..."}
          </span>
        </div>
      )}

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
            animated: true,
          },
          {
            id: "trip-route",
            path: tripRoute,
            color: "#f97316",
            weight: 5,
            opacity: 0.72,
            animated: activeRide?.status === "in_progress",
          },
        ]}
      />
    </div>
  );
}

const getRouteInstruction = (steps) => {
  const step = steps.find((item) => item?.maneuver?.type && item.maneuver.type !== "depart") || steps[0];
  if (!step) return "Continue toward the pickup";

  const road = step.name ? ` onto ${step.name}` : "";
  const modifier = String(step.maneuver?.modifier || "").replace(/_/g, " ");
  const type = step.maneuver?.type;

  if (type === "arrive") return "Arrive at your destination";
  if (type === "turn") return `Turn ${modifier || "ahead"}${road}`;
  if (type === "roundabout" || type === "rotary") return `Enter the roundabout${road}`;
  if (type === "merge") return `Merge ${modifier}${road}`.trim();
  return `Continue ${modifier}${road}`.trim();
};

const fetchGoogleDirections = (start, end) =>
  new Promise((resolve, reject) => {
    const service = new window.google.maps.DirectionsService();
    service.route(
      {
        origin: { lat: start[0], lng: start[1] },
        destination: { lat: end[0], lng: end[1] },
        travelMode: window.google.maps.TravelMode.DRIVING,
        provideRouteAlternatives: true,
      },
      (result, status) => {
        if (status !== "OK" || !result?.routes?.[0]?.legs?.[0]) {
          reject(new Error(`Google Directions status: ${status}`));
          return;
        }

        const route = result.routes[0];
        const leg = route.legs[0];
        const firstInstruction = leg.steps?.[0]?.instructions
          ? stripInstructionHtml(leg.steps[0].instructions)
          : "Continue toward the pickup";

        resolve({
          points: route.overview_path.map((point) => [point.lat(), point.lng()]),
          distanceKm: Number(leg.distance?.value || 0) / 1000,
          etaMinutes: Math.max(1, Math.round(Number(leg.duration?.value || 60) / 60)),
          instruction: firstInstruction,
          provider: "google",
        });
      }
    );
  });

const stripInstructionHtml = (instruction) => {
  const element = document.createElement("div");
  element.innerHTML = instruction;
  return element.textContent || element.innerText || "Continue toward the pickup";
};

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

const floatingEtaCardStyle = {
  position: "absolute",
  zIndex: 520,
  top: "74px",
  left: "50%",
  transform: "translateX(-50%)",
  minWidth: "156px",
  padding: "10px 14px",
  borderRadius: "18px",
  background: "rgba(255, 255, 255, 0.96)",
  color: "#111827",
  boxShadow: "0 18px 38px rgba(15, 23, 42, 0.22)",
  display: "grid",
  justifyItems: "center",
  gap: "3px",
  pointerEvents: "none",
};

const etaLabelStyle = {
  color: "#667085",
  fontSize: "0.72rem",
  fontWeight: 950,
  textTransform: "uppercase",
};

const etaValueStyle = {
  fontSize: "1.55rem",
  lineHeight: 1,
  fontWeight: 950,
};

const etaDistanceStyle = {
  color: "#475467",
  fontSize: "0.86rem",
  fontWeight: 900,
};

const navigationInstructionStyle = {
  position: "absolute",
  zIndex: 530,
  left: "14px",
  right: "14px",
  bottom: "18px",
  padding: "13px 15px",
  borderRadius: "8px",
  background: "rgba(11, 18, 32, 0.94)",
  color: "white",
  boxShadow: "0 18px 38px rgba(15, 23, 42, 0.28)",
  display: "grid",
  gap: "3px",
  pointerEvents: "none",
};

const navigationInstructionEyebrowStyle = {
  color: "#86efac",
  fontSize: "0.68rem",
  fontWeight: 950,
  textTransform: "uppercase",
};

const navigationInstructionTextStyle = {
  fontSize: "1rem",
  lineHeight: 1.25,
};

const navigationInstructionMetaStyle = {
  color: "#cbd5e1",
  fontSize: "0.76rem",
  fontWeight: 800,
};

export default DriverMap;
