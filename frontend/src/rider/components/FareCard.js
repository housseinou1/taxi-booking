import React from 'react';
import './FareCard.css';

/**
 * Maps ride type keys to display icons (emoji-based).
 */
const RIDE_TYPE_ICONS = {
  regular: '🚗',
  comfort: '✨',
  xl: '🚐',
  share: '👥',
};

/**
 * Returns the icon for a given ride type key.
 * Falls back to a generic car emoji for unknown types.
 * @param {string} rideType - One of 'regular', 'comfort', 'xl', 'share'
 * @returns {string} Emoji icon
 */
export function getRideTypeIcon(rideType) {
  return RIDE_TYPE_ICONS[rideType] || '🚗';
}

/**
 * Formats a fare amount for display in MRU currency.
 * @param {number} amount - The fare amount
 * @returns {string} Formatted fare string
 */
export function formatFare(amount) {
  return `${Math.round(amount)} MRU`;
}

/**
 * FareCard component displaying ride type info with fare, ETA, and capacity.
 *
 * Props:
 * - rideType: 'regular' | 'comfort' | 'xl' | 'share'
 * - label: display name (e.g. "Sakho", "Comfort", "XL", "Share")
 * - fare: calculated fare in MRU
 * - discountedFare: optional discounted fare when promo applied
 * - eta: ETA text (e.g. "3 min")
 * - capacity: capacity text (e.g. "1-4" or "Shared")
 * - selected: whether this card is currently selected
 * - onSelect: callback when card is tapped
 */
function FareCard({ rideType, label, fare, discountedFare, eta, capacity, selected, onSelect }) {
  const icon = getRideTypeIcon(rideType);
  const hasDiscount = discountedFare != null && discountedFare < fare;

  const className = `fare-card fare-card--${rideType}${selected ? ' fare-card--selected' : ''}`;

  return (
    <div
      className={className}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`${label} - ${hasDiscount ? formatFare(discountedFare) : formatFare(fare)} - ${eta} - ${capacity}`}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <span className="fare-card__icon" aria-hidden="true">
        {icon}
      </span>
      <span className="fare-card__label">{label}</span>
      <span className="fare-card__fare">
        {hasDiscount && (
          <span className="fare-card__fare-original">{formatFare(fare)}</span>
        )}
        <span className="fare-card__fare-amount">
          {hasDiscount ? formatFare(discountedFare) : formatFare(fare)}
        </span>
      </span>
      <span className="fare-card__eta">{eta}</span>
      <span className="fare-card__capacity">{capacity}</span>
    </div>
  );
}

export default FareCard;
