import React from "react";

/**
 * NotificationIcon - Floating circular button with unread badge.
 *
 * Props:
 * - unreadCount: number - number of unread notifications
 * - onTap: function - called when button is tapped
 */
export default function NotificationIcon({ unreadCount = 0, onTap }) {
  return (
    <button
      type="button"
      onClick={onTap}
      style={styles.button}
      aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
    >
      <span style={styles.icon} aria-hidden="true">N</span>
      {unreadCount > 0 && (
        <span style={styles.badge}>
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}
    </button>
  );
}

const styles = {
  button: {
    position: "fixed",
    top: 16,
    right: 16,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: "50%",
    background: "var(--panel-bg, rgba(11, 18, 32, 0.92))",
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
    border: "1px solid rgba(255,255,255,0.1)",
    boxShadow: "var(--floating-shadow, 0 4px 20px rgba(0,0,0,0.25))",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    WebkitTapHighlightColor: "transparent",
    padding: 0,
  },
  icon: {
    width: 22,
    height: 22,
    borderRadius: "50%",
    background: "rgba(255,255,255,0.14)",
    color: "#fff",
    display: "grid",
    placeItems: "center",
    fontSize: 12,
    fontWeight: 950,
    lineHeight: 1,
  },
  badge: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    background: "var(--driver-red, #EF4444)",
    color: "#fff",
    fontSize: 10,
    fontWeight: 800,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 4px",
  },
};
