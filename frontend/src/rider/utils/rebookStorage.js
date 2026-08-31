import { getLocationByLabel } from "../../marketConfig";

export const REBOOK_DESTINATION_KEY = "yala_rebook_destination";

function normalizeLocation(raw) {
  if (!raw) return null;
  if (Array.isArray(raw.position) && raw.position.length >= 2) {
    return {
      label: raw.label || raw.destination_address || "Previous destination",
      position: [Number(raw.position[0]), Number(raw.position[1])],
      city: raw.city || "Nouakchott",
    };
  }
  return null;
}

/**
 * Build a ride location from a history trip row (RideSerializer shape).
 */
export function locationFromHistoryTrip(trip) {
  if (!trip) return null;

  const label = trip.destination_address || trip.destination || "Previous destination";
  const city = trip.city?.name || trip.city_name || trip.city || "Nouakchott";

  const lat = Number(trip.destination_lat);
  const lng = Number(trip.destination_lng);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return { label, position: [lat, lng], city };
  }

  const resolved = getLocationByLabel(label, city);
  if (resolved?.position) {
    return { label: resolved.label || label, position: resolved.position, city: resolved.city || city };
  }

  return { label, position: null, city };
}

export function storeRebookDestination(location) {
  if (!location?.label) return;
  localStorage.setItem(REBOOK_DESTINATION_KEY, JSON.stringify(location));
}

export function consumeRebookDestination() {
  try {
    const raw = localStorage.getItem(REBOOK_DESTINATION_KEY);
    if (!raw) return null;
    localStorage.removeItem(REBOOK_DESTINATION_KEY);
    return normalizeLocation(JSON.parse(raw));
  } catch (error) {
    localStorage.removeItem(REBOOK_DESTINATION_KEY);
    return null;
  }
}
