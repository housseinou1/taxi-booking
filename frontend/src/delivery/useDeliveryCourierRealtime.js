import { useEffect, useRef } from "react";

import { subscribeRideUpdates } from "../socket";
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
}) {
  const loadRef = useRef(load);
  const setAvailableRef = useRef(setAvailable);
  const setDismissedOfferIdRef = useRef(setDismissedOfferId);
  const setHighlightedOfferIdRef = useRef(setHighlightedOfferId);

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
        try {
          await startDeliveryOfferAlertLoop();
        } catch (e) {
          console.log("Delivery offer alert failed:", e?.message || e);
        }
      }
    };

    const unsubWs = subscribeRideUpdates((message) => {
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
    });

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
      unsubWs();
      window.removeEventListener("yala:push-received", onPush);
      stopDeliveryOfferAlert();
    };
  }, [enabled, hasActiveDelivery]);
}
