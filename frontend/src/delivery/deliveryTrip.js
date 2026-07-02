export const TRIP_STAGES = {
  ARRIVING: "arriving",
  PICKUP: "pickup",
  TRANSIT: "transit",
  DROPOFF: "dropoff",
  DONE: "done",
};

export function getTripStage(delivery) {
  if (!delivery) return null;
  if (delivery.status === "accepted") return TRIP_STAGES.PICKUP;
  if (delivery.status === "courier_arriving") return TRIP_STAGES.ARRIVING;
  if (delivery.status === "picked_up") return TRIP_STAGES.TRANSIT;
  if (delivery.status === "in_transit" || delivery.status === "delivering") return TRIP_STAGES.DROPOFF;
  if (delivery.status === "delivered") return TRIP_STAGES.DONE;
  return null;
}

export function getTripHeadline(delivery) {
  const stage = getTripStage(delivery);
  if (stage === TRIP_STAGES.PICKUP) return "On the way to pickup";
  if (stage === TRIP_STAGES.ARRIVING) return "At pickup";
  if (stage === TRIP_STAGES.TRANSIT) return "On the way to dropoff";
  if (stage === TRIP_STAGES.DROPOFF) return "Arrived at dropoff";
  if (stage === TRIP_STAGES.DONE) return "Delivery complete";
  return "Active delivery";
}

export function getTripSubtitle(delivery) {
  const stage = getTripStage(delivery);
  if (stage === TRIP_STAGES.PICKUP) return "Navigate to the pickup location";
  if (stage === TRIP_STAGES.ARRIVING) return "Confirm package pickup with sender PIN";
  if (stage === TRIP_STAGES.TRANSIT) return "Head to the dropoff location";
  if (stage === TRIP_STAGES.DROPOFF) return "Confirm delivery with recipient PIN";
  return "";
}

export function getTripPrimaryCta(delivery) {
  const stage = getTripStage(delivery);
  if (stage === TRIP_STAGES.PICKUP) return "I've Arrived";
  if (stage === TRIP_STAGES.TRANSIT) return "Picked Up";
  if (stage === TRIP_STAGES.DROPOFF) return "Arrived at Dropoff";
  return null;
}

export function getNavigationPoint(delivery) {
  if (!delivery) return null;

  const stage = getTripStage(delivery);
  if (stage === TRIP_STAGES.PICKUP || stage === TRIP_STAGES.ARRIVING) {
    return pointFrom(delivery.pickup_lat, delivery.pickup_lng, delivery.pickup);
  }

  const pendingStop = delivery.stops?.find((stop) => stop.status !== "delivered");
  if (pendingStop) {
    return pointFrom(pendingStop.latitude, pendingStop.longitude, pendingStop.address);
  }

  return pointFrom(delivery.destination_lat, delivery.destination_lng, delivery.destination);
}

function pointFrom(lat, lng, label) {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { lat: latitude, lng: longitude, label: label || "Destination" };
}

export function openExternalNavigation(point) {
  if (!point) return;
  const url = `https://www.google.com/maps/dir/?api=1&destination=${point.lat},${point.lng}&travelmode=driving`;
  window.open(url, "_blank", "noopener,noreferrer");
}

export function buildRoutePoints(delivery, driverPosition) {
  if (!delivery) return [];

  const stage = getTripStage(delivery);
  const nav = getNavigationPoint(delivery);
  const points = [];

  if (driverPosition) points.push(driverPosition);
  if (nav) points.push([nav.lat, nav.lng]);
  if (
    (stage === TRIP_STAGES.TRANSIT || stage === TRIP_STAGES.DROPOFF) &&
    delivery.destination_lat &&
    delivery.destination_lng
  ) {
    points.push([Number(delivery.destination_lat), Number(delivery.destination_lng)]);
  }

  return points;
}

export const COURIER_TIMELINE_STEPS = [
  { key: "accepted", label: "Accepted" },
  { key: "arriving_pickup", label: "Arriving at pickup" },
  { key: "arrived_pickup", label: "Arrived at pickup" },
  { key: "picked_up", label: "Picked up" },
  { key: "in_transit", label: "In transit" },
  { key: "arrived_dropoff", label: "Arrived at dropoff" },
  { key: "pin_proof", label: "PIN / proof required" },
  { key: "complete", label: "Complete" },
];

export function getCourierTimelineStep(
  delivery,
  { dropoffArrived = false, showPickupProof = false, showDropoffProof = false } = {}
) {
  if (!delivery) return 0;

  const status = delivery.status;

  if (status === "delivered") return 7;
  if (showDropoffProof || status === "delivering") return 6;
  if (dropoffArrived) return 5;
  if (status === "in_transit") return 4;
  if (status === "picked_up") return 3;
  if (showPickupProof || status === "courier_arriving") return 2;
  if (status === "accepted") return 1;

  return 0;
}

export function getCourierTripEta(delivery) {
  const minutes = delivery?.estimated_duration_minutes;
  if (Number.isFinite(Number(minutes)) && Number(minutes) > 0) {
    return `~${Math.round(Number(minutes))} min`;
  }
  return "~30 min";
}

export function getCourierTripHeadline(delivery, timelineStep) {
  const step = COURIER_TIMELINE_STEPS[timelineStep];
  return step?.label || getTripHeadline(delivery);
}
