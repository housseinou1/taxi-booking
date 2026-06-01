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
 * Handles both custom schemes (yala-rider://, yala-driver://)
 * and universal links (https://yala.mr/rider/*, https://yala.mr/driver/*).
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

  // Universal link: https://yala.mr/rider/dashboard → /rider-dashboard
  const universalMatch = url.match(/^https:\/\/yala\.mr\/(rider|driver)\/(.*)$/);
  if (universalMatch) {
    const type = universalMatch[1];
    const path = universalMatch[2].replace(/\/$/, ''); // trim trailing slash

    if (type === 'rider') {
      return path ? `/rider-${path}` : '/rider-dashboard';
    }
    if (type === 'driver') {
      return path ? `/driver/${path}` : '/driver';
    }
  }

  // Universal link without subpath: https://yala.mr/rider/ or https://yala.mr/driver/
  const baseMatch = url.match(/^https:\/\/yala\.mr\/(rider|driver)\/?$/);
  if (baseMatch) {
    return baseMatch[1] === 'rider' ? '/rider-dashboard' : '/driver';
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
