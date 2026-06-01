import React from 'react';
import { COLORS, TRANSITIONS, SHADOWS } from './shareConstants';

/**
 * ShareRideCard — Compact ride type selection card for the booking flow.
 * Shows: "Yala Share", fare, savings %, "+3-8 min", "1-2 additional riders"
 * Highlighted border when selected. Green badge "Lowest fare".
 */
export default function ShareRideCard({
  fare = 0,
  economyFare = 0,
  selected = false,
  onSelect,
  additionalTimeRange = '3-8',
}) {
  const savingsPercent = economyFare > 0
    ? Math.round(((economyFare - fare) / economyFare) * 100)
    : 0;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`Select Yala Share ride. Fare ${fare} MRU. Save ${savingsPercent}%. Additional time ${additionalTimeRange} minutes.`}
      aria-pressed={selected}
      style={{
        ...styles.card,
        border: selected
          ? `2px solid ${COLORS.primaryGreen}`
          : `1px solid ${COLORS.cardBorder}`,
        boxShadow: selected ? SHADOWS.card : 'none',
        transform: selected ? 'scale(1.01)' : 'scale(1)',
      }}
    >
      {/* Lowest fare badge */}
      <div style={styles.badge}>
        <span style={styles.badgeText}>Lowest fare</span>
      </div>

      <div style={styles.content}>
        {/* Left: Icon + Name */}
        <div style={styles.left}>
          <div style={styles.iconContainer}>
            <span style={styles.icon}>S</span>
          </div>
          <div style={styles.info}>
            <span style={styles.name}>Yala Share</span>
            <span style={styles.detail}>1-2 additional riders</span>
            <span style={styles.time}>+{additionalTimeRange} min</span>
          </div>
        </div>

        {/* Right: Fare + Savings */}
        <div style={styles.right}>
          <span style={styles.fare}>{fare} MRU</span>
          {savingsPercent > 0 && (
            <span style={styles.savings}>Save {savingsPercent}%</span>
          )}
        </div>
      </div>

      {/* Selection indicator */}
      <div style={{
        ...styles.radio,
        borderColor: selected ? COLORS.primaryGreen : COLORS.lightGray,
        backgroundColor: selected ? COLORS.primaryGreen : 'transparent',
      }}>
        {selected && <div style={styles.radioInner} />}
      </div>
    </button>
  );
}

const styles = {
  card: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    padding: '14px 16px',
    paddingTop: '28px',
    backgroundColor: COLORS.cardBg,
    borderRadius: '12px',
    cursor: 'pointer',
    transition: TRANSITIONS.normal,
    textAlign: 'left',
    outline: 'none',
    boxSizing: 'border-box',
  },
  badge: {
    position: 'absolute',
    top: '8px',
    left: '12px',
    backgroundColor: COLORS.primaryGreen,
    borderRadius: '4px',
    padding: '2px 8px',
  },
  badgeText: {
    color: COLORS.white,
    fontSize: '10px',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: '0.3px',
  },
  content: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  left: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  iconContainer: {
    width: '40px',
    height: '40px',
    borderRadius: '8px',
    backgroundColor: 'rgba(0, 166, 81, 0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    color: COLORS.primaryGreen,
    fontSize: '18px',
    fontWeight: '800',
  },
  info: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  name: {
    color: COLORS.white,
    fontSize: '15px',
    fontWeight: '600',
  },
  detail: {
    color: COLORS.lightGray,
    fontSize: '12px',
  },
  time: {
    color: COLORS.mutedGray,
    fontSize: '11px',
  },
  right: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '2px',
  },
  fare: {
    color: COLORS.white,
    fontSize: '16px',
    fontWeight: '700',
  },
  savings: {
    color: COLORS.goldAccent,
    fontSize: '12px',
    fontWeight: '600',
  },
  radio: {
    position: 'absolute',
    top: '50%',
    right: '16px',
    transform: 'translateY(-50%)',
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    border: '2px solid',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: TRANSITIONS.fast,
  },
  radioInner: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    backgroundColor: COLORS.white,
  },
};
