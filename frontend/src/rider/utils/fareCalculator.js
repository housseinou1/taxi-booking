import { MARKET } from '../../marketConfig';

/**
 * Calculate fare for a given ride type and distance.
 * Formula: round((base + distance * perKm) * 100) / 100
 *
 * @param {string} rideType - One of 'regular', 'comfort', 'xl', 'share'
 * @param {number} distanceKm - Distance in kilometers (positive number)
 * @returns {number} Calculated fare in MRU
 */
export function calculateFare(rideType, distanceKm) {
  const pricing = MARKET.fare[rideType] || MARKET.fare.regular;
  const distance = Number(distanceKm || 0);
  return Math.round((pricing.base + distance * pricing.perKm) * 100) / 100;
}
