import {
  getPreferredNavApp,
  NAV_APP_GOOGLE,
  NAV_APP_WAZE,
} from "./driverNavigationPrefs";

export function getRidePoint(ride, target = "pickup") {
  if (!ride) return null;
  const lat = target === "pickup" ? ride.pickup_lat : ride.destination_lat;
  const lng = target === "pickup" ? ride.pickup_lng : ride.destination_lng;
  if (lat == null || lng == null) return null;
  const nLat = Number(lat);
  const nLng = Number(lng);
  if (!Number.isFinite(nLat) || !Number.isFinite(nLng)) return null;
  return { lat: nLat, lng: nLng };
}

export function getNavigationUrls(ride, target = "pickup") {
  const point = getRidePoint(ride, target);
  if (!point) return null;
  const destination = `${point.lat},${point.lng}`;
  return {
    google: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving`,
    waze: `https://www.waze.com/ul?ll=${encodeURIComponent(destination)}&navigate=yes&zoom=17`,
  };
}

export function openExternalNavigation(ride, target = "pickup", app = getPreferredNavApp()) {
  const urls = getNavigationUrls(ride, target);
  if (!urls) return false;
  const url = app === NAV_APP_WAZE ? urls.waze : urls.google;
  try {
    window.open(url, "_blank", "noopener,noreferrer");
    return true;
  } catch {
    return false;
  }
}
