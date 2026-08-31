import { useCallback, useEffect, useRef, useState } from "react";

const SLOW_RTT_MS = 2000;

/**
 * Shared network status for mobile apps.
 * Detects offline, slow connection (Network Information API when available),
 * and brief "connection restored" state after reconnect.
 */
export default function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [isSlowConnection, setIsSlowConnection] = useState(false);
  const [justRestored, setJustRestored] = useState(false);
  const restoredTimerRef = useRef(null);

  const readConnectionQuality = useCallback(() => {
    const connection = typeof navigator !== "undefined" ? navigator.connection : null;
    if (!connection) {
      setIsSlowConnection(false);
      return;
    }
    const effectiveType = connection.effectiveType || "";
    const rtt = Number(connection.rtt || 0);
    const saveData = Boolean(connection.saveData);
    const slow =
      saveData ||
      effectiveType === "slow-2g" ||
      effectiveType === "2g" ||
      (rtt > 0 && rtt >= SLOW_RTT_MS);
    setIsSlowConnection(Boolean(slow));
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setJustRestored(true);
      if (restoredTimerRef.current) clearTimeout(restoredTimerRef.current);
      restoredTimerRef.current = setTimeout(() => setJustRestored(false), 4000);
      readConnectionQuality();
    };

    const handleOffline = () => {
      setIsOnline(false);
      setJustRestored(false);
      setIsSlowConnection(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    const connection = typeof navigator !== "undefined" ? navigator.connection : null;
    if (connection) {
      connection.addEventListener("change", readConnectionQuality);
    }
    readConnectionQuality();

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      if (connection) {
        connection.removeEventListener("change", readConnectionQuality);
      }
      if (restoredTimerRef.current) clearTimeout(restoredTimerRef.current);
    };
  }, [readConnectionQuality]);

  return { isOnline, isOffline: !isOnline, isSlowConnection, justRestored };
}
