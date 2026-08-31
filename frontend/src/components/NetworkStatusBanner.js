import React from "react";
import useNetworkStatus from "../hooks/useNetworkStatus";

/**
 * Global network status banner for native mobile apps.
 * Uses .yala-offline-banner and .yala-stale-indicator from App.css.
 */
export default function NetworkStatusBanner() {
  const { isOffline, isSlowConnection, justRestored } = useNetworkStatus();

  if (justRestored) {
    return (
      <div
        className="yala-offline-banner"
        role="status"
        aria-live="polite"
        style={{ background: "#14532d" }}
      >
        Connection restored
      </div>
    );
  }

  if (isOffline) {
    return (
      <div className="yala-offline-banner" role="alert" aria-live="assertive">
        You&apos;re offline — some actions will resume when connection returns
      </div>
    );
  }

  if (isSlowConnection) {
    return (
      <div
        className="yala-stale-indicator"
        role="status"
        aria-live="polite"
        style={{
          position: "fixed",
          top: 8,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 9998,
        }}
      >
        Slow connection — updates may be delayed
      </div>
    );
  }

  return null;
}
