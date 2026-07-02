import { useCallback, useEffect, useState } from "react";

import { API_URL } from "../apiConfig";
import { playChatMessageSound } from "../native/sound";
import { apiRequest } from "./DeliveryShared";
import { subscribeDeliveryUpdates } from "./deliverySocket";
import { isDeliveryChatAvailable } from "./deliveryChatUtils";

function getCurrentUserId() {
  try {
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    return user?.id || null;
  } catch (_) {
    return null;
  }
}

export function useDeliveryChatUnread(deliveryId, deliveryStatus, { enabled = true, chatOpen = false } = {}) {
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(async () => {
    if (!deliveryId || !enabled || !isDeliveryChatAvailable(deliveryStatus) || chatOpen) {
      if (!chatOpen) setUnread(0);
      return;
    }
    try {
      const data = await apiRequest(`${API_URL}/deliveries/${deliveryId}/messages/unread/`);
      setUnread(Number(data?.unread_count || 0));
    } catch (_) {
      // ignore
    }
  }, [chatOpen, deliveryId, deliveryStatus, enabled]);

  useEffect(() => {
    if (chatOpen) {
      setUnread(0);
      return undefined;
    }
    refresh();
    const intervalId = window.setInterval(refresh, 20000);
    return () => window.clearInterval(intervalId);
  }, [chatOpen, refresh]);

  useEffect(() => {
    if (!deliveryId || !enabled || chatOpen) return undefined;
    const currentUserId = getCurrentUserId();
    const unsub = subscribeDeliveryUpdates((event) => {
      if (Number(event?.delivery_id) !== Number(deliveryId)) return;
      if (
        (event.type === "message_sent" || event.type === "chat_image_sent") &&
        event.message
      ) {
        if (event.message.sender_id !== currentUserId) {
          setUnread((count) => count + 1);
          playChatMessageSound();
        }
      }
      if (event.type === "message_read") {
        setUnread(0);
      }
    });
    return unsub;
  }, [chatOpen, deliveryId, enabled]);

  return { unread, setUnread, refresh };
}
