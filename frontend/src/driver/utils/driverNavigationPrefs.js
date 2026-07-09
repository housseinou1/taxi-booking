const AUTO_NAV_KEY = "yala_driver_auto_nav";
const NAV_APP_KEY = "yala_driver_nav_app";
const VOICE_KEY = "yala_driver_voice_guidance";

export const NAV_APP_GOOGLE = "google";
export const NAV_APP_WAZE = "waze";

export function getAutoNavigationEnabled() {
  if (typeof window === "undefined") return true;
  const raw = localStorage.getItem(AUTO_NAV_KEY);
  return raw !== "false";
}

export function setAutoNavigationEnabled(enabled) {
  localStorage.setItem(AUTO_NAV_KEY, enabled ? "true" : "false");
}

export function getPreferredNavApp() {
  if (typeof window === "undefined") return NAV_APP_GOOGLE;
  const raw = localStorage.getItem(NAV_APP_KEY);
  return raw === NAV_APP_WAZE ? NAV_APP_WAZE : NAV_APP_GOOGLE;
}

export function setPreferredNavApp(app) {
  localStorage.setItem(NAV_APP_KEY, app === NAV_APP_WAZE ? NAV_APP_WAZE : NAV_APP_GOOGLE);
}

export function getVoiceGuidanceEnabled() {
  if (typeof window === "undefined") return true;
  const raw = localStorage.getItem(VOICE_KEY);
  return raw !== "false";
}

export function setVoiceGuidanceEnabled(enabled) {
  localStorage.setItem(VOICE_KEY, enabled ? "true" : "false");
}
