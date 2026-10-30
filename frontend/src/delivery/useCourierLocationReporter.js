import { useEffect } from "react";

import { API_URL } from "../apiConfig";
import {
  startBackgroundLocationTracking,
  stopBackgroundLocationTracking,
} from "../native/location";
import { apiRequest } from "./DeliveryShared";

/**
 * Reports the courier's position to `POST /deliveries/courier/location/` for the duration of an
 * active delivery.
 *
 * Two sources feed the same endpoint:
 *  1. Foreground GPS (`navigator.geolocation.watchPosition`) — unchanged behaviour, used while
 *     the courier dashboard is open and on web.
 *  2. The native background watcher (`@capacitor-community/background-geolocation`) — keeps
 *     reporting while the app is minimised or the screen is locked. It is a foreground service
 *     on Android, so it shows a persistent notification, and it is started/stopped with the
 *     active delivery only.
 *
 * `startBackgroundLocationTracking` is idempotent (it refuses to stack a second watcher) and
 * no-ops on web, so mounting this hook twice cannot duplicate updates. The cleanup stops the
 * background service, so a completed delivery, a logout that unmounts the dashboard, or any
 * teardown cannot leave the foreground service running.
 */
export default function useCourierLocationReporter({ enabled }) {
  useEffect(() => {
    if (!enabled) return undefined;

    const post = (lat, lng) => {
      apiRequest(`${API_URL}/deliveries/courier/location/`, {
        method: "POST",
        body: JSON.stringify({ lat, lng }),
      }).catch(() => {
        // ignore transient location upload failures
      });
    };

    // 1) Foreground GPS — preserved exactly as before.
    let watchId = null;
    if (navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(
        (position) => post(position.coords.latitude, position.coords.longitude),
        () => {},
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
      );
    }

    // 2) Background watcher — same endpoint, survives minimise / screen lock.
    startBackgroundLocationTracking({
      onLocation: ({ lat, lng }) => post(lat, lng),
    }).catch(() => {});

    return () => {
      if (watchId !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId);
      }
      // The delivery ended (or the dashboard unmounted): the Android foreground service must
      // not outlive the delivery.
      stopBackgroundLocationTracking().catch(() => {});
    };
  }, [enabled]);
}
