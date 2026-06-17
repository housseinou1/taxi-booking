import React, { useState } from "react";

/**
 * GoOnlineButton - Toggle button for driver online/offline status.
 *
 * Props:
 * - isOnline: boolean - current online status
 * - loading: boolean - whether toggle is in progress
 * - onToggle: function - called when button is pressed
 */
export default function GoOnlineButton({ isOnline, loading, onToggle }) {
  const [pressed, setPressed] = useState(false);

  const label = loading
    ? "Updating..."
    : isOnline
      ? "Go Offline"
      : "Go Online";

  const backgroundColor = isOnline
    ? "var(--driver-red, #EF4444)"
    : "var(--driver-green, #00A651)";

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={loading}
      onTouchStart={() => setPressed(true)}
      onTouchEnd={() => setPressed(false)}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      style={{
        ...styles.button,
        background: backgroundColor,
        opacity: loading ? 0.7 : 1,
        transform: pressed && !loading ? "scale(0.97)" : "scale(1)",
      }}
      aria-label={label}
    >
      {loading && <span style={styles.spinner} aria-hidden="true" />}
      <span style={styles.label}>{label}</span>
    </button>
  );
}

const styles = {
  button: {
    width: "100%",
    height: 56,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    border: "none",
    borderRadius: "var(--button-radius, 14px)",
    color: "#fff",
    fontSize: 18,
    fontWeight: 700,
    cursor: "pointer",
    WebkitTapHighlightColor: "transparent",
    transition: "background 150ms ease, transform 100ms ease",
  },
  label: {
    letterSpacing: -0.3,
  },
  spinner: {
    width: 20,
    height: 20,
    border: "3px solid rgba(255,255,255,0.3)",
    borderTopColor: "#fff",
    borderRadius: "50%",
    animation: "spin 0.6s linear infinite",
  },
};
