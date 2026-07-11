import { useEffect, useRef } from "react";

import { DELIVERY_WS_URL } from "../apiConfig";
import {
  preloadNotificationSound,
  startDeliveryOfferAlertLoop,
  stopDeliveryOfferAlert,
  unlockRideRequestSound,
} from "../native/sound";

function mergeOfferMessage(available, message) {
  if (!message?.delivery_id) return available;
  if (available.some((item) => item.id === message.delivery_id)) {
    return available;
  }

  return [
    {
      id: message.delivery_id,
      pickup: message.pickup || "Pickup",
      destination: message.destination || "Dropoff",
      fare: message.fare || "0",
      distance_km: message.distance_km || "0",
      package_type: message.package_type || "small",
      service_category: message.service_category || "package",
      status: "requested",
      is_fragile: Boolean(message.is_fragile),
      is_scheduled: Boolean(message.is_scheduled),
    },
    ...available,
  ];
}

function getPushPayload(detail) {
  if (!detail) return null;
  return detail.data || detail.notification?.data || detail;
}

/**
 * Real-time delivery offer alerts via WebSocket + foreground push events.
 */
export default function useDeliveryCourierRealtime({
  enabled,
  hasActiveDelivery,
  load,
  setAvailable,
  setDismissedOfferId,
  setHighlightedOfferId,
  onReconnect,
}) {
  const loadRef = useRef(load);
  const setAvailableRef = useRef(setAvailable);
  const setDismissedOfferIdRef = useRef(setDismissedOfferId);
  const setHighlightedOfferIdRef = useRef(setHighlightedOfferId);
  const onReconnectRef = useRef(onReconnect);
  const retryRef = useRef(1000);
  const hadConnectedRef = useRef(false);

  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useEffect(() => {
    setAvailableRef.current = setAvailable;
  }, [setAvailable]);

  useEffect(() => {
    setDismissedOfferIdRef.current = setDismissedOfferId;
  }, [setDismissedOfferId]);

  useEffect(() => {
    setHighlightedOfferIdRef.current = setHighlightedOfferId;
  }, [setHighlightedOfferId]);

  useEffect(() => {
    onReconnectRef.current = onReconnect;
  }, [onReconnect]);

  useEffect(() => {
    preloadNotificationSound();
  }, []);

  useEffect(() => {
    if (!enabled) {
      stopDeliveryOfferAlert();
      return undefined;
    }
    unlockRideRequestSound().catch(() => {});
    return () => {
      stopDeliveryOfferAlert();
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || hasActiveDelivery) {
      stopDeliveryOfferAlert();
      return undefined;
    }

    const handleIncomingOffer = async (message, { forceAlert = true } = {}) => {
      if (message?.delivery_id) {
        setAvailableRef.current((current) => mergeOfferMessage(current, message));
        setDismissedOfferIdRef.current(null);
        setHighlightedOfferIdRef.current(message.delivery_id);
      }
      await loadRef.current();
      if (forceAlert) {
        const body = message?.pickup
          ? `${message.pickup} → ${message.destination || "Dropoff"} · ${message.fare || "0"} MRU`
          : "Pickup nearby — tap to accept or decline";
        try {
          await startDeliveryOfferAlertLoop({
            title: "New Delivery Request",
            body,
          });
        } catch (e) {
          console.log("Delivery offer alert failed:", e?.message || e);
        }
      }
    };

    let cancelled = false;
    let retryTimer = null;
    let ws = null;
    hadConnectedRef.current = false;

    const handleRealtimeMessage = (message) => {
      if (!message?.type) return;

      if (message.type === "delivery_new_request") {
        handleIncomingOffer(message);
        return;
      }

      if (
        message.type === "delivery_status_update" ||
        message.type === "delivery_assigned" ||
        message.type === "delivery_stop_completed"
      ) {
        loadRef.current();
      }
    };

    const buildUrl = () => {
      const token = localStorage.getItem("access");
      if (!token) return DELIVERY_WS_URL;
      const separator = DELIVERY_WS_URL.includes("?") ? "&" : "?";
      return `${DELIVERY_WS_URL}${separator}token=${encodeURIComponent(token)}`;
    };

    const connect = () => {
      if (cancelled || !DELIVERY_WS_URL) return;
      ws = new WebSocket(buildUrl());

      ws.onopen = () => {
        const wasReconnect = hadConnectedRef.current;
        hadConnectedRef.current = true;
        retryRef.current = 1000;
        if (wasReconnect) {
          onReconnectRef.current?.();
        }
      };

      ws.onmessage = (event) => {
        try {
          handleRealtimeMessage(JSON.parse(event.data));
        } catch (_) {
          // Ignore malformed websocket payloads.
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

    const onPush = (event) => {
      const payload = getPushPayload(event.detail);
      if (payload?.type === "delivery_new_request") {
        handleIncomingOffer({
          delivery_id: Number(payload.delivery_id),
          pickup: payload.pickup,
          destination: payload.destination,
          fare: payload.fare,
          distance_km: payload.distance_km,
        });
      }
    };

    window.addEventListener("yala:push-received", onPush);
    return () => {
      cancelled = true;
      if (retryTimer) window.clearTimeout(retryTimer);
      ws?.close();
      window.removeEventListener("yala:push-received", onPush);
      stopDeliveryOfferAlert();
    };
  }, [enabled, hasActiveDelivery]);
}
