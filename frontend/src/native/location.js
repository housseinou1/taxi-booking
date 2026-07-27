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
  // `@capacitor-community/background-geolocation` ships only native (Android/iOS)
  // code and has no web/JS entry point. Use Webpack's non-bundled require escape
  // hatch (`__non_webpack_require__`) so the production web build never tries to
  // statically resolve the package. At runtime the plugin is loaded only where a
  // real CommonJS require exists (native Capacitor container); on the web there is
  // no such require, so `BackgroundGeolocation` stays null and every caller
  // no-ops via its existing `!BackgroundGeolocation` guards — exactly as before.
  /* eslint-disable-next-line no-undef */
  const nativeRequire = typeof __non_webpack_require__ === "function" ? __non_webpack_require__ : null;
  if (nativeRequire) {
    const bgMod = nativeRequire("@capacitor-community/background-geolocation");
    BackgroundGeolocation = bgMod.BackgroundGeolocation;
  }
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
 * Watches the device foreground location and invokes the callback on every update.
 * Prefers the Capacitor Geolocation plugin on native installs (more reliable on
 * Android WebViews) and falls back to the browser navigator.geolocation API.
 *
 * @param {Object} options
 * @param {(position: {lat: number, lng: number, accuracy?: number}) => void} options.onLocation - Called with each location update
 * @param {(error: {code?: number, message: string}) => void} options.onError - Called on errors
 * @param {boolean} [options.enableHighAccuracy=true]
 * @param {number} [options.timeout=12000]
 * @param {number} [options.maximumAge=5000]
 * @returns {Promise<() => void>} Cleanup function that stops watching
 */
export async function watchForegroundLocation({
  onLocation,
  onError,
  enableHighAccuracy = true,
  timeout = 12000,
  maximumAge = 5000,
}) {
  const handleError = (error) => {
    const message = error?.message || "GPS unavailable";
    const code = error?.code;
    if (onError) onError({ code, message });
  };

  // Native Capacitor path: more reliable on Android, triggers system permission dialog
  if (isNative() && Geolocation) {
    try {
      // Request permissions first so the user sees the system dialog if needed
      const perm = await Geolocation.requestPermissions();
      if (perm.location !== 'granted') {
        handleError({ code: 1, message: "Location permission denied" });
        return () => {};
      }

      // Get an immediate current position so the UI is not stuck waiting for watch events
      try {
        const current = await Geolocation.getCurrentPosition({
          enableHighAccuracy,
          timeout,
          maximumAge,
        });
        if (onLocation) {
          onLocation({
            lat: current.coords.latitude,
            lng: current.coords.longitude,
            accuracy: current.coords.accuracy,
          });
        }
      } catch (e) {
        // getCurrentPosition may fail; the watcher below will keep retrying
        handleError(e);
      }

      const watcher = await Geolocation.watchPosition(
        {
          enableHighAccuracy,
          timeout,
          maximumAge,
        },
        (position, error) => {
          if (error) {
            handleError(error);
            return;
          }
          if (position?.coords && onLocation) {
            onLocation({
              lat: position.coords.latitude,
              lng: position.coords.longitude,
              accuracy: position.coords.accuracy,
            });
          }
        }
      );

      return () => {
        try {
          Geolocation.clearWatch({ id: watcher });
        } catch {
          // Ignore cleanup errors
        }
      };
    } catch (e) {
      handleError(e);
    }
  }

  // Browser / fallback path
  if (!navigator.geolocation) {
    handleError({ message: "GPS is not available on this device." });
    return () => {};
  }

  const watchId = navigator.geolocation.watchPosition(
    (position) => {
      if (onLocation) {
        onLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
      }
    },
    (error) => handleError(error),
    { enableHighAccuracy, maximumAge, timeout }
  );

  return () => navigator.geolocation.clearWatch(watchId);
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
