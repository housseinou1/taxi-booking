import { useCallback, useEffect, useState } from "react";
import { API_URL } from "../../apiConfig";

const DEFAULT_POLL_MS = 15000;

export function useRideChatUnread(rideId, { poll = true, pollIntervalMs = DEFAULT_POLL_MS } = {}) {
  const [unreadCount, setUnreadCount] = useState(0);

  const refreshUnread = useCallback(async () => {
    if (!rideId) {
      setUnreadCount(0);
      return;
    }

    const token = localStorage.getItem("access");
    if (!token) {
      setUnreadCount(0);
      return;
    }

    try {
      const response = await fetch(`${API_URL}/chat/${rideId}/unread/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return;
      const data = await response.json();
      setUnreadCount(Number(data.unread || 0));
    } catch (error) {
      // Keep last known count on transient failures.
    }
  }, [rideId]);

  useEffect(() => {
    refreshUnread();
    if (!poll) {
      return undefined;
    }

    const intervalId = window.setInterval(refreshUnread, pollIntervalMs);
    const handlePush = () => refreshUnread();
    window.addEventListener("yala:push-received", handlePush);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("yala:push-received", handlePush);
    };
  }, [poll, pollIntervalMs, refreshUnread]);

  return { unreadCount, refreshUnread };
}

export default useRideChatUnread;
