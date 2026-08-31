import { getNextPendingStop } from "../../driver/components/MultiStopProgress";

function getCoordinatePair(lat, lng) {
  const parsedLat = Number(lat);
  const parsedLng = Number(lng);
  return Number.isFinite(parsedLat) && Number.isFinite(parsedLng)
    ? [parsedLat, parsedLng]
    : null;
}

/**
 * Resolve the driver's navigation target for the current ride phase.
 */
export function getTrackingTarget(ride) {
  if (!ride) return null;

  if (ride.status === "in_progress") {
    const nextStop = getNextPendingStop(ride.stops || []);
    if (nextStop) {
      return getCoordinatePair(nextStop.latitude, nextStop.longitude);
    }
    return (
      getCoordinatePair(ride.destination_lat, ride.destination_lng) ||
      ride.destination?.position ||
      null
    );
  }

  return getCoordinatePair(ride.pickup_lat, ride.pickup_lng) || ride.pickup?.position || null;
}

function rawDistanceKm(fromPosition, toPosition) {
  const [fromLat, fromLng] = fromPosition.map(Number);
  const [toLat, toLng] = toPosition.map(Number);
  if ([fromLat, fromLng, toLat, toLng].some(Number.isNaN)) {
    return null;
  }

  const earthRadiusKm = 6371;
  const latDelta = ((toLat - fromLat) * Math.PI) / 180;
  const lngDelta = ((toLng - fromLng) * Math.PI) / 180;
  const startLat = (fromLat * Math.PI) / 180;
  const endLat = (toLat * Math.PI) / 180;

  const a =
    Math.sin(latDelta / 2) * Math.sin(latDelta / 2) +
    Math.cos(startLat) *
      Math.cos(endLat) *
      Math.sin(lngDelta / 2) *
      Math.sin(lngDelta / 2);

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Decide whether to refetch a driving route polyline for live tracking.
 */
export function shouldRefetchTrackingRoute(
  previousPosition,
  nextPosition,
  lastFetchedAt,
  { minIntervalMs = 12000, minMoveKm = 0.08 } = {},
) {
  if (!Array.isArray(nextPosition) || nextPosition.length < 2) {
    return false;
  }

  if (!Array.isArray(previousPosition) || previousPosition.length < 2) {
    return true;
  }

  if (lastFetchedAt == null || !Number.isFinite(Number(lastFetchedAt))) {
    return true;
  }

  const movedKm = rawDistanceKm(previousPosition, nextPosition);
  if (movedKm == null) {
    return Date.now() - lastFetchedAt >= minIntervalMs;
  }

  if (movedKm < minMoveKm) {
    return Date.now() - lastFetchedAt >= minIntervalMs;
  }

  return true;
}
