import { getAppType } from "../native/platform";

const BRAND_LOGOS = {
  rider: "/yala-rider-logo.png",
  driver: "/yala-driver-logo.png",
  delivery: "/yala-delivery-logo.png",
  admin: "/yala-admin-logo.png",
  web: "/yala-rider-logo.png",
};

/**
 * Returns the correct in-app logo for the current (or given) app type.
 */
export function getBrandLogoSrc(appType) {
  const type = appType || getAppType();
  return BRAND_LOGOS[type] || BRAND_LOGOS.web;
}
