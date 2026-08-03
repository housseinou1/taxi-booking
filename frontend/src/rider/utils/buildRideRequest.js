import { calculateDistanceKm } from "../../marketConfig";

/**
 * Resolve trip distance for the ride request payload.
 * Prefer routed distance, then fall back to straight-line segments between stops.
 */
export function resolveBookingDistanceKm({ pickup, destination, stops, routeInfo }) {
  const routeDistance = Number(routeInfo?.distanceKm);
  if (Number.isFinite(routeDistance) && routeDistance >= 0.1 && routeDistance <= 500) {
    return Math.round(routeDistance * 100) / 100;
  }

  const points = [
    pickup?.position,
    ...(stops || []).map((stop) => stop?.position).filter(Boolean),
    destination?.position,
  ].filter(Boolean);

  if (points.length < 2) {
    return 0.1;
  }

  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    const segment = calculateDistanceKm(points[index - 1], points[index]);
    if (segment == null) {
      return 0.1;
    }
    total += segment;
  }

  const resolved = Math.max(0.1, Math.round(total * 100) / 100);
  return resolved <= 500 ? resolved : 0.1;
}

/**
 * Transform booking state into an API request payload for ride creation.
 * Maps the internal booking state to the RideRequestParams format expected by
 * the /rides/request/ endpoint.
 *
 * @param {object} bookingState - The current booking state from RideContext
 * @param {object} bookingState.pickup - Pickup location { label, position: [lat, lng] }
 * @param {object} bookingState.destination - Destination location { label, position: [lat, lng] }
 * @param {Array} bookingState.stops - Array of stop locations (0-3 items)
 * @param {string} bookingState.rideType - Selected ride type key
 * @param {number} bookingState.fare - Estimated fare amount
 * @param {object} [bookingState.routeInfo] - Route info { distanceKm, etaMinutes }
 * @param {string} [bookingState.promoCode] - Optional promo code
 * @returns {object|null} RideRequestParams or null if state is invalid
 */
export function buildRideRequest(bookingState) {
  if (!bookingState) return null;

  const { pickup, destination, stops, rideType, fare, routeInfo, promoCode } = bookingState;

  // Validate required fields
  if (!pickup || !pickup.position || !destination || !destination.position) {
    return null;
  }

  if (!rideType) {
    return null;
  }

  const payload = {
    pickup_latitude: pickup.position[0],
    pickup_longitude: pickup.position[1],
    pickup_address: pickup.label || pickup.address || "",
    destination_latitude: destination.position[0],
    destination_longitude: destination.position[1],
    destination_address: destination.label || destination.address || "",
    stops: (stops || []).filter((stop) => stop?.position).map((stop, index) => ({
      latitude: stop.position[0],
      longitude: stop.position[1],
      location_name: stop.label || stop.address || `Stop ${index + 1}`,
      stop_order: index + 1,
    })),
    ride_type: rideType,
    distance_km: resolveBookingDistanceKm({ pickup, destination, stops, routeInfo }),
    estimated_fare: fare || 0,
  };

  if (promoCode) {
    payload.promo_code = promoCode;
  }

  if (bookingState.rideTermsAccepted) {
    payload.ride_terms_accepted = true;
    payload.terms_accepted = true;
  }
  if (bookingState.privacyAccepted) {
    payload.privacy_accepted = true;
    payload.privacy_policy_accepted = true;
  }

  if (bookingState.billingSource === "corporate") {
    payload.billing_source = "corporate";
    if (bookingState.costCenter) {
      payload.cost_center = bookingState.costCenter;
    }
  }

  return payload;
}
