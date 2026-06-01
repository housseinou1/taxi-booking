/**
 * External navigation/maps integration.
 * Opens turn-by-turn directions in the device's default maps application.
 * Supports Google Maps (Android) and Apple Maps (iOS).
 */

import { isNative, getPlatform } from './platform';

/**
 * Formats coordinates into a URL for the device's maps application.
 *
 * @param {number} lat - Destination latitude
 * @param {number} lng - Destination longitude
 * @param {string} label - Optional label for the destination
 * @returns {string} Maps URL compatible with the current platform
 */
export function formatMapsUrl(lat, lng, label = 'Destination') {
  const platform = getPlatform();

  if (platform === 'android') {
    // Google Maps navigation intent
    return `google.navigation:q=${lat},${lng}`;
  }

  if (platform === 'ios') {
    // Apple Maps with driving directions
    return `maps://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`;
  }

  // Web fallback — Google Maps in browser
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

/**
 * Opens turn-by-turn navigation to the given coordinates.
 * On native platforms, opens the device's default maps app.
 * On web, opens Google Maps in a new tab.
 *
 * @param {number} lat - Destination latitude
 * @param {number} lng - Destination longitude
 * @param {string} label - Optional label for the destination
 */
export function openNavigation(lat, lng, label) {
  const url = formatMapsUrl(lat, lng, label);

  if (isNative()) {
    // Use _system to open in external app
    window.open(url, '_system');
  } else {
    window.open(url, '_blank');
  }
}
