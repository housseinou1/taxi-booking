import { useEffect } from "react";

import { API_URL } from "../apiConfig";
import { apiRequest } from "./DeliveryShared";

export default function useCourierLocationReporter({ enabled }) {
  useEffect(() => {
    if (!enabled || !navigator.geolocation) return undefined;

    const report = (position) => {
      apiRequest(`${API_URL}/deliveries/courier/location/`, {
        method: "POST",
        body: JSON.stringify({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        }),
      }).catch(() => {
        // ignore transient location upload failures
      });
    };

    const watchId = navigator.geolocation.watchPosition(report, () => {}, {
      enableHighAccuracy: true,
      maximumAge: 10000,
      timeout: 15000,
    });

    return () => navigator.geolocation.clearWatch(watchId);
  }, [enabled]);
}
