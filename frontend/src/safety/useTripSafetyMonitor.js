import { useCallback, useEffect, useRef, useState } from "react";

import {
  fetchMonitoringStatus,
  respondToSafetyCheck,
  sendMonitoringPing,
} from "./safetyApi";

export default function useTripSafetyMonitor({ rideId, enabled = false, intervalMs = 45000 }) {
  const [openEvent, setOpenEvent] = useState(null);
  const lastPingRef = useRef(0);

  const refreshStatus = useCallback(async () => {
    if (!rideId || !enabled) return;
    try {
      const data = await fetchMonitoringStatus(rideId);
      setOpenEvent(data.open_event || null);
    } catch (_) {
      // ignore polling errors during active trips
    }
  }, [enabled, rideId]);

  const sendPing = useCallback(async () => {
    if (!rideId || !enabled || !navigator.geolocation) return;
    const now = Date.now();
    if (now - lastPingRef.current < intervalMs - 5000) return;
    lastPingRef.current = now;

    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const data = await sendMonitoringPing({
            ride_id: rideId,
            latitude: coords.latitude,
            longitude: coords.longitude,
            accuracy: coords.accuracy,
            speed: coords.speed,
          });
          if (data.safety_event) {
            setOpenEvent(data.safety_event);
          }
        } catch (_) {
          // ignore transient GPS upload failures
        }
      },
      () => {},
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 }
    );
  }, [enabled, intervalMs, rideId]);

  useEffect(() => {
    if (!enabled || !rideId) {
      setOpenEvent(null);
      return undefined;
    }
    refreshStatus();
    sendPing();
    const timer = window.setInterval(() => {
      refreshStatus();
      sendPing();
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [enabled, intervalMs, refreshStatus, rideId, sendPing]);

  const respond = useCallback(
    async (isSafe, note = "") => {
      if (!openEvent?.id) return;
      const updated = await respondToSafetyCheck({
        event_id: openEvent.id,
        is_safe: isSafe,
        note,
      });
      setOpenEvent(updated.status === "open" ? updated : null);
      return updated;
    },
    [openEvent]
  );

  return { openEvent, respond, refreshStatus };
}
