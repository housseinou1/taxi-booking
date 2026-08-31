import { MARKET, getLocationByLabel } from "../../marketConfig";

export const SAVED_PLACES_STORAGE_KEY = "yala_saved_places";

const defaultPlaces = () => [
  {
    id: "home",
    type: "Home",
    name: "Home",
    city: MARKET.defaultCity,
    location: MARKET.defaultPickup.label,
    note: "Default pickup",
    favorite: true,
  },
  {
    id: "work",
    type: "Work",
    name: "Work",
    city: MARKET.defaultCity,
    location: MARKET.defaultDestination.label,
    note: "Daily destination",
    favorite: true,
  },
];

export function loadSavedPlaces() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SAVED_PLACES_STORAGE_KEY) || "[]");
    if (Array.isArray(parsed) && parsed.length) return parsed;
  } catch (error) {
    // fall through
  }
  return defaultPlaces();
}

function resolvePosition(place) {
  if (Array.isArray(place?.position) && place.position.length >= 2) {
    return place.position;
  }
  const resolved = getLocationByLabel(place?.location, place?.city || MARKET.defaultCity);
  return resolved?.position || null;
}

export function toRideLocation(place) {
  if (!place) return null;
  const position = resolvePosition(place);
  if (!position) return null;
  return {
    label: place.location || place.name || place.type,
    position,
    city: place.city || MARKET.defaultCity,
  };
}

/** Home + Work shortcuts for RiderHome map/booking. */
export function getRiderHomeShortcuts() {
  const places = loadSavedPlaces();
  const home = places.find((p) => p.type === "Home") || places[0];
  const work = places.find((p) => p.type === "Work") || places[1];
  const shortcuts = [];

  const homeLoc = toRideLocation(home);
  if (homeLoc) shortcuts.push({ key: "home", label: home?.name || "Home", ...homeLoc });

  const workLoc = toRideLocation(work);
  if (workLoc) shortcuts.push({ key: "work", label: work?.name || "Work", ...workLoc });

  return shortcuts;
}
