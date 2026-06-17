import { calculateDistanceKm } from "../../marketConfig";

const OSRM_BASE_URL = "https://router.project-osrm.org/route/v1/driving";

/**
 * Average driving speed assumption (km/h) used for ETA estimation
 * when OSRM is unavailable and we fall back to haversine distance.
 */
const FALLBACK_SPEED_KMH = 30;

/**
 * Fetch a driving route from OSRM for the given waypoints.
 *
 * @param {Array<[number, number]>} points - Array of [lat, lng] coordinate pairs (min 2)
 * @returns {Promise<{points: [number,number][], distanceKm: number, etaMinutes: number} | null>}
 */
async function fetchOSRMRoute(points) {
  if (!Array.isArray(points) || points.length < 2 || points.some((point) => !point)) {
    return null;
  }

  // OSRM expects coordinates as lng,lat pairs separated by semicolons
  const coordinates = points.map((point) => `${point[1]},${point[0]}`).join(";");
  const url = `${OSRM_BASE_URL}/${coordinates}?overview=full&geometries=geojson`;

  const response = await fetch(url);
  const data = await response.json();
  const route = data.routes?.[0];

  if (!route) return null;

  return {
    points: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
    distanceKm: route.distance / 1000,
    etaMinutes: Math.max(1, Math.round(route.duration / 60)),
  };
}

/**
 * Calculate a fallback route result using haversine (straight-line) distances
 * when OSRM is unavailable.
 *
 * @param {Array<[number, number]>} points - Array of [lat, lng] coordinate pairs (min 2)
 * @returns {{points: [number,number][], distanceKm: number, etaMinutes: number} | null}
 */
function calculateHaversineFallback(points) {
  if (!Array.isArray(points) || points.length < 2 || points.some((point) => !point)) {
    return null;
  }

  // Sum haversine distances between consecutive points
  let totalDistanceKm = 0;
  for (let i = 1; i < points.length; i++) {
    const segmentDistance = calculateDistanceKm(points[i - 1], points[i]);
    if (segmentDistance == null) return null;
    totalDistanceKm += segmentDistance;
  }

  totalDistanceKm = Math.max(1, Math.round(totalDistanceKm * 10) / 10);
  const etaMinutes = Math.max(1, Math.round((totalDistanceKm / FALLBACK_SPEED_KMH) * 60));

  return {
    points,
    distanceKm: totalDistanceKm,
    etaMinutes,
  };
}

/**
 * Get a driving route between waypoints.
 * Attempts OSRM first; falls back to haversine straight-line calculation on failure.
 *
 * @param {Array<[number, number]>} points - Array of [lat, lng] coordinate pairs (min 2)
 * @returns {Promise<{points: [number,number][], distanceKm: number, etaMinutes: number} | null>}
 */
async function getRoute(points) {
  try {
    const route = await fetchOSRMRoute(points);
    if (route) return route;
  } catch (error) {
    // OSRM unavailable — fall through to haversine fallback
    console.log("OSRM route service unavailable, using haversine fallback:", error.message);
  }

  // Fallback: use haversine distance calculation
  return calculateHaversineFallback(points);
}

const routeService = {
  getRoute,
};

export default routeService;
export { getRoute, fetchOSRMRoute, calculateHaversineFallback, OSRM_BASE_URL, FALLBACK_SPEED_KMH };
