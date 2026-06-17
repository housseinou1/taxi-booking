import React from "react";
import { formatMoney } from "../../marketConfig";

/**
 * EarningsHeader - Floating pill at top-center showing today's earnings.
 *
 * Props:
 * - earnings: number - today's earnings amount
 * - onTap: function - called on click, navigates to earnings page
 */
export default function EarningsHeader({ earnings = 0, onTap }) {
  return (
    <button
      type="button"
      onClick={onTap}
      style={styles.container}
      aria-label={`Today's earnings: ${formatMoney(earnings)}`}
    >
      <span style={styles.label}>Today</span>
      <strong style={styles.amount}>{formatMoney(earnings)}</strong>
    </button>
  );
}

const styles = {
  container: {
    position: "fixed",
    top: 16,
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: 10,
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 20px",
    borderRadius: 999,
    background: "var(--panel-bg, rgba(11, 18, 32, 0.92))",
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
    border: "1px solid rgba(255,255,255,0.1)",
    boxShadow: "var(--floating-shadow, 0 4px 20px rgba(0,0,0,0.25))",
    cursor: "pointer",
    WebkitTapHighlightColor: "transparent",
  },
  label: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 12,
    fontWeight: 600,
  },
  amount: {
    color: "#fff",
    fontSize: 16,
    fontWeight: 700,
  },
};
