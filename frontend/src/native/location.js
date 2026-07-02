/**
 * Location and GPS abstraction layer.
 * Supports foreground and background location tracking for drivers.
 * No-ops gracefully in browser mode.
 */

import { isNative, getPlatform, isDeliveryCourierApp } from './platform';

let Geolocation = null;
let BackgroundGeolocation = null;
try {
  const geoMod = require('@capacitor/geolocation');
  Geolocation = geoMod.Geolocation;
} catch {
  // Geolocation plugin not available
}

try {
  const bgMod = require('@capacitor-community/background-geolocation');
  BackgroundGeolocation = bgMod.BackgroundGeolocation;
} catch {
  // Background geolocation plugin not available
}

let watcherId = null;

/**
 * Requests location permission from the user.
 * In browser mode, returns granted (browser handles its own permission flow).
 *
 * @param {boolean} background - Whether to request background location permission
 * @returns {Promise<{granted: boolean, reason?: string}>}
 */
export async function requestLocationPermission(background = false) {
  if (!isNative() || !Geolocation) {
    return { granted: true };
  }

  try {
    const perm = await Geolocation.requestPermissions();
    if (perm.location !== 'granted') {
      return { granted: false, reason: 'foreground_denied' };
    }

    if (background && getPlatform() === 'android') {
      // Android requires separate background location permission
      try {
        const bgPerm = await Geolocation.requestPermissions({
          permissions: ['coarseLocation'],
        });
        if (bgPerm.location !== 'granted') {
          return { granted: false, reason: 'background_denied' };
        }
      } catch {
        return { granted: false, reason: 'background_denied' };
      }
    }

    return { granted: true };
  } catch {
    return { granted: false, reason: 'permission_error' };
  }
}

/**
 * Starts background location tracking. Sends location updates via the provided
 * WebSocket connection. Designed for driver apps.
 *
 * @param {WebSocket} wsConnection - Active WebSocket connection to send location updates
 */
export async function startBackgroundLocationTracking(wsConnection) {
  if (!isNative() || !BackgroundGeolocation) return;

  try {
    const isDeliveryApp = isDeliveryCourierApp();
    watcherId = await BackgroundGeolocation.addWatcher(
      {
        backgroundMessage: isDeliveryApp
          ? 'Yala Delivery is tracking your location'
          : 'Yala Driver is tracking your location',
        backgroundTitle: isDeliveryApp ? 'Yala Delivery' : 'Location Active',
        requestPermissions: true,
        stale: false,
        distanceFilter: 10, // meters
      },
      (location, error) => {
        if (error) return;
        if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
          wsConnection.send(
            JSON.stringify({
              type: 'location_update',
              latitude: location.latitude,
              longitude: location.longitude,
              timestamp: new Date().toISOString(),
            })
          );
        }
      }
    );
  } catch {
    // Background location tracking failed to start
  }
}

/**
 * Stops background location tracking.
 */
export async function stopBackgroundLocationTracking() {
  if (!BackgroundGeolocation || !watcherId) return;

  try {
    await BackgroundGeolocation.removeWatcher({ id: watcherId });
    watcherId = null;
  } catch {
    // Failed to stop watcher — may already be stopped
    watcherId = null;
  }
}
