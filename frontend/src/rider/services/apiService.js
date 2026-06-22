import { API_URL } from "../../apiConfig";
import riderApi from "./authenticatedApi";

/**
 * Centralized API client for the Rider app.
 * All API calls use JWT Bearer token from localStorage and return
 * structured responses or throw structured errors.
 */

/**
 * Retrieve the JWT access token from localStorage.
 * @returns {string|null} The token or null if not stored.
 */
export function getToken() {
  return localStorage.getItem("access");
}

/**
 * Build the Authorization header object for authenticated requests.
 * @returns {object} Headers object with Bearer token.
 * @throws {Error} If no token is available.
 */
function authHeaders() {
  const token = getToken();
  if (!token) {
    throw new ApiError("No authentication token found", 401, "auth_required");
  }
  return { Authorization: `Bearer ${token}` };
}

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
    const response = await riderApi.post(`${API_URL}/rides/request/`, {
      pickup: params.pickup_address || "",
      destination: params.destination_address || "",
      pickup_address: params.pickup_address || "",
      destination_address: params.destination_address || "",
      pickup_lat: params.pickup_latitude,
      pickup_lng: params.pickup_longitude,
      destination_lat: params.destination_latitude,
      destination_lng: params.destination_longitude,
      distance_km: params.distance_km,
      distance: params.distance_km,
      ride_type: params.ride_type,
      fare: params.estimated_fare,
      stops: params.stops || [],
      promo_code: params.promo_code || undefined,
    }, {
      headers: authHeaders(),
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
      },
      {
        headers: authHeaders(),
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
    const response = await riderApi.get(`${API_URL}/rides/history/`, {
      headers: authHeaders(),
    });

    return Array.isArray(response.data) ? response.data : [];
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
      },
      {
        headers: authHeaders(),
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
      stop,
      { headers: authHeaders() }
    );
    return response.data;
  } catch (error) {
    throw handleError(error);
  }
}

/**
 * Get the rider's currently active ride (if any).
 * Fetches ride history and returns the first ride with an active status.
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
    const rides = await getRideHistory();
    const activeRide = rides.find((ride) => activeStatuses.has(ride.status));
    return activeRide || null;
  } catch (error) {
    throw handleError(error);
  }
}

/**
 * Fetch the authenticated rider's profile.
 * @returns {Promise<object>} Rider profile data including phone, picture, etc.
 */
export async function getRiderProfile() {
  try {
    const response = await riderApi.get(`${API_URL}/auth/me/`, {
      headers: authHeaders(),
    });

    return response.data;
  } catch (error) {
    throw handleError(error);
  }
}

const apiService = {
  getToken,
  requestRide,
  addRideStop,
  cancelRide,
  getRideHistory,
  validatePromo,
  getActiveRide,
  getRiderProfile,
};

export default apiService;
