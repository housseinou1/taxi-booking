import { useEffect, useRef } from "react";

import { DELIVERY_WS_URL } from "../apiConfig";

export default function useDeliveryTrackingRealtime({
  deliveryId,
  enabled,
  onStatus,
  onLocation,
  onAssigned,
}) {
  const wsRef = useRef(null);
  const retryRef = useRef(1000);

  useEffect(() => {
    if (!enabled || !deliveryId || !DELIVERY_WS_URL) return undefined;

    let cancelled = false;
    let retryTimer = null;

    const connect = () => {
      if (cancelled) return;
      const token = localStorage.getItem("access");
      const separator = DELIVERY_WS_URL.includes("?") ? "&" : "?";
      const ws = new WebSocket(`${DELIVERY_WS_URL}${separator}token=${token}`);
      wsRef.current = ws;

      ws.onopen = () => {
        retryRef.current = 1000;
        ws.send(JSON.stringify({ type: "join_delivery", delivery_id: deliveryId }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.delivery_id && msg.delivery_id !== deliveryId) return;

          if (msg.type === "delivery_status_update" && msg.status) {
            onStatus?.(msg.status);
          }
          if (msg.type === "delivery_location_update") {
            onLocation?.(msg.lat, msg.lng, msg.eta_minutes);
          }
          if (msg.type === "delivery_assigned") {
            onAssigned?.(msg);
          }
        } catch (_) {
          // ignore malformed websocket payloads
        }
      };

      ws.onclose = () => {
        if (cancelled) return;
        retryTimer = window.setTimeout(() => {
          retryRef.current = Math.min(retryRef.current * 2, 16000);
          connect();
        }, retryRef.current);
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (retryTimer) window.clearTimeout(retryTimer);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [deliveryId, enabled, onAssigned, onLocation, onStatus]);
}
