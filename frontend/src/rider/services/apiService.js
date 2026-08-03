import { API_URL } from "../../apiConfig";
import { calculateDistanceKm } from "../../marketConfig";
import riderApi from "./authenticatedApi";

const MIN_RIDE_DISTANCE_KM = 0.1;
const MAX_RIDE_DISTANCE_KM = 500;

function ensureRequestDistanceKm(params) {
  const direct = Number(params?.distance_km);
  if (Number.isFinite(direct) && direct >= MIN_RIDE_DISTANCE_KM && direct <= MAX_RIDE_DISTANCE_KM) {
    return Math.round(direct * 100) / 100;
  }

  const points = [
    [params?.pickup_latitude, params?.pickup_longitude],
    ...(Array.isArray(params?.stops) ? params.stops : []).map((stop) => [
      stop?.latitude,
      stop?.longitude,
    ]),
    [params?.destination_latitude, params?.destination_longitude],
  ].filter(
    (point) =>
      Array.isArray(point) &&
      point.length === 2 &&
      Number.isFinite(Number(point[0])) &&
      Number.isFinite(Number(point[1])),
  );

  if (points.length < 2) {
    return Math.max(MIN_RIDE_DISTANCE_KM, direct || MIN_RIDE_DISTANCE_KM);
  }

  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    const segment = calculateDistanceKm(points[index - 1], points[index]);
    if (segment == null) {
      return MIN_RIDE_DISTANCE_KM;
    }
    total += segment;
  }

  const resolved = Math.max(MIN_RIDE_DISTANCE_KM, Math.round(total * 100) / 100);
  return resolved <= MAX_RIDE_DISTANCE_KM ? resolved : MIN_RIDE_DISTANCE_KM;
}

/**
 * Centralized API client for the Rider app.
 * All API calls use JWT Bearer token from localStorage and return
 * structured responses or throw structured errors.
 */

/**
 * Structured API error class for consistent error handling.
 */
export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.name = "ApiError";
    this.status = status !== undefined ? status : null;
    this.code = code || null;
  }
}

/**
 * Parse an axios error into a structured ApiError.
 * @param {Error} error - The caught error from axios.
 * @returns {ApiError} A structured error with message, status, and code.
 */
function handleError(error) {
  if (error instanceof ApiError) {
    return error;
  }

  if (error.response) {
    const data = error.response.data;
    const message =
      data?.detail || data?.error || data?.message || "Request failed";
    const status = error.response.status;
    const code = data?.error_code || data?.code || null;
    return new ApiError(message, status, code);
  }

  if (error.request) {
    return new ApiError("Network error — unable to reach server", 0, "network_error");
  }

  return new ApiError(error.message || "Unknown error", null, "unknown");
}

/**
 * Request a new ride.
 * @param {object} params - Ride request parameters.
 * @param {number} params.pickup_latitude
 * @param {number} params.pickup_longitude
 * @param {number} params.destination_latitude
 * @param {number} params.destination_longitude
 * @param {Array} params.stops - Array of stop objects with latitude/longitude.
 * @param {string} params.ride_type - One of: regular, comfort, xl, share.
 * @param {number} params.distance_km
 * @param {number} params.estimated_fare
 * @param {string} [params.promo_code] - Optional promo code.
 * @param {string} [params.pickup_address]
 * @param {string} [params.destination_address]
 * @returns {Promise<object>} The ride response from the API.
 */
export async function requestRide(params) {
  try {
    const distanceKm = ensureRequestDistanceKm(params);
    const response = await riderApi.post(`${API_URL}/rides/request/`, {
      pickup: params.pickup_address || "",
      destination: params.destination_address || "",
      pickup_address: params.pickup_address || "",
      destination_address: params.destination_address || "",
      pickup_lat: params.pickup_latitude,
      pickup_lng: params.pickup_longitude,
      destination_lat: params.destination_latitude,
      destination_lng: params.destination_longitude,
      distance_km: distanceKm,
      distance: distanceKm,
      ride_type: params.ride_type || "regular",
      stops: params.stops || [],
      promo_code: params.promo_code || undefined,
      ride_terms_accepted: Boolean(params.ride_terms_accepted || params.rider_terms_accepted || params.terms_accepted),
      terms_accepted: Boolean(params.terms_accepted || params.ride_terms_accepted || params.rider_terms_accepted),
      privacy_accepted: Boolean(params.privacy_accepted || params.privacy_policy_accepted),
      privacy_policy_accepted: Boolean(params.privacy_policy_accepted || params.privacy_accepted),
    });

    return response.data?.ride || response.data;
  } catch (error) {
    throw handleError(error);
  }
}

/**
 * Cancel an active ride.
 * @param {number} rideId - The ID of the ride to cancel.
 * @param {string} reason - The cancellation reason.
 * @returns {Promise<object>} Cancel response with success status and optional fee.
 */
export async function cancelRide(rideId, reason) {
  try {
    const response = await riderApi.post(
      `${API_URL}/rides/cancel/${rideId}/`,
      {
        reason,
        cancelled_by: "rider",
      }
    );

    return {
      success: true,
      cancellation_fee: response.data.cancellation_fee || null,
      message: response.data.refund_status || response.data.message || null,
    };
  } catch (error) {
    throw handleError(error);
  }
}

/**
 * Fetch the rider's ride history.
 * @returns {Promise<Array>} Array of trip summary objects ordered by most recent.
 */
export async function getRideHistory() {
  try {
    const response = await riderApi.get(`${API_URL}/rides/history/`);
    return Array.isArray(response.data) ? response.data : [];
  } catch (error) {
    throw handleError(error);
  }
}

/**
 * Request an authoritative backend fare estimate for a category and distance.
 * @param {object} params
 * @param {string} params.ride_type
 * @param {number} params.distance_km
 * @returns {Promise<object>} Estimate with base_fare, distance_charge, estimated_fare, etc.
 */
export async function estimateFare(params) {
  try {
    const response = await riderApi.post(`${API_URL}/rides/estimate/`, {
      ride_type: params.ride_type,
      distance_km: params.distance_km,
    });
    return response.data;
  } catch (error) {
    throw handleError(error);
  }
}

/**
 * Validate a promo code against an estimated fare.
 * @param {string} code - The promo code to validate.
 * @param {number} estimatedFare - The current estimated fare for discount calculation.
 * @returns {Promise<object>} Promo validation result with valid, discount_amount, final_fare, etc.
 */
export async function validatePromo(code, estimatedFare) {
  try {
    const response = await riderApi.post(
      `${API_URL}/promotions/validate/`,
      {
        code,
        estimated_fare: estimatedFare,
      }
    );
    return response.data;
  } catch (error) {
    throw handleError(error);
  }
}

/**
 * Add an intermediate stop to an active ride.
 * @param {number} rideId
 * @param {{ location_name: string, latitude: number, longitude: number, stop_order?: number }} stop
 */
export async function addRideStop(rideId, stop) {
  try {
    const response = await riderApi.post(
      `${API_URL}/rides/${rideId}/stops/`,
      stop
    );
    return response.data;
  } catch (error) {
    throw handleError(error);
  }
}

/**
 * Fetch a single ride by id (authoritative status for active tracking).
 * @param {number|string} rideId
 * @returns {Promise<object>}
 */
export async function getRideById(rideId) {
  try {
    const response = await riderApi.get(`${API_URL}/rides/${rideId}/`);
    return response.data;
  } catch (error) {
    throw handleError(error);
  }
}

/**
 * Get the rider's currently active ride (if any).
 * Tries GET /rides/active/ first, then falls back to a history scan.
 * @returns {Promise<object|null>} The active ride or null if none found.
 */
export async function getActiveRide() {
  const activeStatuses = new Set([
    "requested",
    "pending",
    "accepted",
    "driver_arriving",
    "driver_arrived",
    "in_progress",
  ]);

  try {
    const response = await riderApi.get(`${API_URL}/rides/active/`);
    const data = response.data?.ride || response.data;
    if (data?.id && activeStatuses.has(data.status)) {
      return data;
    }
    return null;
  } catch (primaryError) {
    if (primaryError.response?.status !== 404) {
      try {
        const rides = await getRideHistory();
        const activeRide = rides.find((ride) => activeStatuses.has(ride.status));
        if (!activeRide?.id) return null;
        try {
          return await getRideById(activeRide.id);
        } catch (_) {
          return activeRide;
        }
      } catch (fallbackError) {
        throw handleError(fallbackError);
      }
    }
    return null;
  }
}

/**
 * Fetch the authenticated rider's profile.
 * @returns {Promise<object>} Rider profile data including phone, picture, etc.
 */
export async function getRiderProfile() {
  try {
    const response = await riderApi.get(`${API_URL}/auth/me/`);
    return response.data;
  } catch (error) {
    throw handleError(error);
  }
}

const apiService = {
  requestRide,
  addRideStop,
  cancelRide,
  getRideHistory,
  getRideById,
  validatePromo,
  getActiveRide,
  getRiderProfile,
};

export default apiService;
