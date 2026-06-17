import React from 'react';
import FareCard from './FareCard';
import { calculateFare } from '../utils/fareCalculator';
import { MARKET } from '../../marketConfig';
import './RideTypeSelector.css';

/**
 * Ride type configuration with display metadata.
 * Order matches the design requirement: Regular, XL, Comfort, Share.
 */
const RIDE_TYPES = [
  { key: 'regular', label: MARKET.fare.regular.label, capacity: '1-4', icon: 'regular' },
  { key: 'xl', label: MARKET.fare.xl.label, capacity: '1-6', icon: 'xl' },
  { key: 'comfort', label: MARKET.fare.comfort.label, capacity: '1-4', icon: 'comfort' },
  { key: 'share', label: MARKET.fare.share.label, capacity: 'Shared', icon: 'share' },
];

/**
 * Formats ETA minutes for display.
 * @param {number|undefined} etaMinutes - Base ETA from OSRM
 * @param {string} rideType - Ride type key for ETA adjustment
 * @returns {string} Formatted ETA text
 */
function formatEta(etaMinutes, rideType) {
  if (etaMinutes == null) return '—';
  // Share rides may take slightly longer due to detours
  const adjusted = rideType === 'share' ? Math.ceil(etaMinutes * 1.2) : Math.ceil(etaMinutes);
  return `${adjusted} min`;
}

/**
 * RideTypeSelector — horizontally scrollable list of FareCards.
 *
 * Props:
 * - distance: route distance in km (used to calculate fares)
 * - etaMinutes: base ETA from OSRM route (optional)
 * - selectedType: currently selected ride type key
 * - onSelect: callback invoked with the selected ride type key
 */
function RideTypeSelector({ distance, etaMinutes, selectedType, onSelect }) {
  return (
    <div className="ride-type-selector" role="radiogroup" aria-label="Select ride type">
      <div className="ride-type-selector__scroll">
        {RIDE_TYPES.map((type) => {
          const fare = calculateFare(type.key, distance);
          const eta = formatEta(etaMinutes, type.key);
          const isSelected = selectedType === type.key;

          return (
            <FareCard
              key={type.key}
              rideType={type.key}
              label={type.label}
              fare={fare}
              eta={eta}
              capacity={type.capacity}
              selected={isSelected}
              onSelect={() => onSelect(type.key)}
            />
          );
        })}
      </div>
    </div>
  );
}

export default RideTypeSelector;
