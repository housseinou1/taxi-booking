import { MARKET } from "../marketConfig";

/** Must match backend `arrive_max_distance_m` / market waiting policy. */
export const ARRIVE_MAX_DISTANCE_M = Number(MARKET?.waiting?.arriveMaxDistanceM ?? 350);
export const ARRIVE_MAX_DISTANCE_KM = ARRIVE_MAX_DISTANCE_M / 1000;

/**
 * Parse and validate a lat/lng pair.
 * Auto-corrects common longitude/latitude swap when |lat| > 90.
 * @returns {{ lat: number, lng: number } | null}
 */
export function parseGeoCoord(lat, lng) {
  if (lat == null || lng == null || lat === "" || lng === "") {
    return null;
  }

  let parsedLat = Number(lat);
  let parsedLng = Number(lng);

  if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) {
    return null;
  }

  if (Math.abs(parsedLat) > 90 && Math.abs(parsedLng) <= 90) {
    const swappedLat = parsedLng;
    const swappedLng = parsedLat;
    parsedLat = swappedLat;
    parsedLng = swappedLng;
  } else if (
    parsedLat < 0 &&
    parsedLat > -25 &&
    parsedLng > 0 &&
    parsedLng < 30 &&
    Math.abs(parsedLat) < 25
  ) {
    const swappedLat = parsedLng;
    const swappedLng = parsedLat;
    parsedLat = swappedLat;
    parsedLng = swappedLng;
  }

  if (Math.abs(parsedLat) > 90 || Math.abs(parsedLng) > 180) {
    return null;
  }

  if (parsedLat === 0 && parsedLng === 0) {
    return null;
  }

  return { lat: parsedLat, lng: parsedLng };
}

/** Great-circle distance in meters; null when coords invalid. */
export function haversineMeters(lat1, lng1, lat2, lng2) {
  const a = parseGeoCoord(lat1, lng1);
  const b = parseGeoCoord(lat2, lng2);
  if (!a || !b) return null;

  const toRad = (deg) => (deg * Math.PI) / 180;
  const radiusM = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const phi1 = toRad(a.lat);
  const phi2 = toRad(b.lat);
  const sinHalf =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLng / 2) ** 2;
  return radiusM * 2 * Math.atan2(Math.sqrt(sinHalf), Math.sqrt(1 - sinHalf));
}

export function distanceToPickupM(driverLat, driverLng, pickupLat, pickupLng) {
  return haversineMeters(driverLat, driverLng, pickupLat, pickupLng);
}

export function isWithinArriveDistanceM(distanceM) {
  return (
    distanceM != null &&
    Number.isFinite(Number(distanceM)) &&
    Number(distanceM) <= ARRIVE_MAX_DISTANCE_M
  );
}

/**
 * Shared arrive gate for UI + API body.
 * @returns {{
 *   reliable: boolean,
 *   distanceM: number|null,
 *   distanceKm: number|null,
 *   near: boolean,
 *   arriveBody: {lat:number,lng:number}|null,
 *   pickup: {lat:number,lng:number}|null,
 *   driver: {lat:number,lng:number}|null,
 * }}
 */
export function computeArriveGate({
  driverPosition,
  pickupLat,
  pickupLng,
  outsideServiceArea = false,
}) {
  const pickup = parseGeoCoord(pickupLat, pickupLng);
  const driver = Array.isArray(driverPosition)
    ? parseGeoCoord(driverPosition[0], driverPosition[1])
    : null;

  if (!pickup || !driver) {
    return {
      reliable: false,
      distanceM: null,
      distanceKm: null,
      near: false,
      arriveBody: null,
      pickup,
      driver,
      outsideServiceArea: Boolean(outsideServiceArea),
    };
  }

  const distanceM = distanceToPickupM(driver.lat, driver.lng, pickup.lat, pickup.lng);
  const distanceKm =
    distanceM != null && Number.isFinite(distanceM) ? distanceM / 1000 : null;

  logRideGeoDebug("arrive-gate", {
    driverLat: driver.lat,
    driverLng: driver.lng,
    pickupLat: pickup.lat,
    pickupLng: pickup.lng,
    distanceM,
    maxM: ARRIVE_MAX_DISTANCE_M,
    outsideServiceArea: Boolean(outsideServiceArea),
  });

  return {
    reliable: distanceM != null && !outsideServiceArea,
    distanceM,
    distanceKm,
    near: !outsideServiceArea && isWithinArriveDistanceM(distanceM),
    arriveBody: { lat: driver.lat, lng: driver.lng },
    pickup,
    driver,
    outsideServiceArea: Boolean(outsideServiceArea),
  };
}

export function logRideGeoDebug(context, payload) {
  if (typeof window !== "undefined" && window.Capacitor) {
    console.warn(`[ride-geo] ${context}`, payload);
    return;
  }
  if (process.env.NODE_ENV !== "production") {
    console.log(`[ride-geo] ${context}`, payload);
  }
}
