import { getAppType } from "../native/platform";

export function getCurrentAppVersion() {
  if (typeof window !== "undefined" && window.__YALA_APP_VERSION__) {
    return window.__YALA_APP_VERSION__;
  }
  return process.env.REACT_APP_BUILD_VERSION || "";
}

export function getAppVersionLabel() {
  const version = getCurrentAppVersion();
  if (!version || version === "0.0.0") return "";
  return `Version ${version}`;
}

export function getAppDisplayName() {
  const appType = getAppType();
  if (appType === "driver") return "Yala Driver";
  if (appType === "delivery") return "Yala Delivery";
  if (appType === "rider") return "Yala Rider";
  return "Yala";
}
