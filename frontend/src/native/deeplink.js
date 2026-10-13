/**
 * Deep link and universal link handling.
 * Parses incoming URLs and navigates to the appropriate screen.
 * No-ops in browser mode.
 */

import { isNative } from './platform';

let App = null;
try {
  const mod = require('@capacitor/app');
  App = mod.App;
} catch {
  // App plugin not available
}

/**
 * Parses a deep link URL into an internal route path.
 * Handles the custom schemes (yala-rider://, yala-driver://).
 *
 * The legacy https://yala.mr/* universal links were removed: the yala.mr domain
 * is decommissioned (no DNS, no Digital Asset Links), the production domain is
 * yalataxi.live, and no app ships an https App Link intent-filter, so those URLs
 * could never be delivered to the app.
 *
 * @param {string} url - The deep link URL to parse
 * @returns {string|null} Internal route path or null if URL is invalid
 */
export function parseDeepLink(url) {
  if (!url) return null;

  // Custom scheme: yala-rider://rider-dashboard → /rider-dashboard
  const schemeMatch = url.match(/^yala-(rider|driver):\/\/(.*)$/);
  if (schemeMatch) {
    const path = schemeMatch[2].replace(/^\//, '');
    return '/' + path;
  }

  return null;
}

/**
 * Initializes the deep link listener. When the app is opened via a deep link,
 * the provided navigation function is called with the parsed route.
 *
 * @param {Function} navigateFn - Function to call with the route path (e.g., React Router navigate)
 */
export function initDeepLinkListener(navigateFn) {
  if (!isNative() || !App) return;

  try {
    App.addListener('appUrlOpen', (event) => {
      const route = parseDeepLink(event.url);
      if (route && navigateFn) {
        navigateFn(route);
      }
    });
  } catch {
    // Deep link listener setup failed
  }
}
