import { useCallback, useMemo } from "react";
import axios from "axios";
import { API_URL } from "../../apiConfig";

/**
 * useDriverAPI - Centralized API hook for all driver endpoints.
 *
 * Provides methods for fetching and updating driver data with
 * Bearer token authentication and error handling.
 *
 * All methods return { data, error } objects.
 * On auth failure (401), redirects to login.
 *
 * Endpoints:
 * - fetchProfile()        → GET /drivers/me/profile/
 * - fetchEarnings()       → GET /drivers/me/earnings/
 * - fetchLevel()          → GET /drivers/me/level/
 * - fetchDocuments()      → GET /drivers/me/documents/
 * - fetchFeedback()       → GET /drivers/me/feedback/
 * - fetchAchievements()   → GET /drivers/me/achievements/
 * - fetchSettings()       → GET /drivers/me/settings/
 * - updateSettings(data)  → PATCH /drivers/me/settings/
 * - fetchRideHistory(params) → GET /drivers/me/rides/
 * - fetchFavorites()      → GET /drivers/me/favorites/
 */
export default function useDriverAPI() {
  const token = localStorage.getItem("access");

  const authHeaders = useMemo(
    () => ({
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }),
    [token]
  );

  /**
   * Generic request handler with error handling.
   * @param {function} requestFn - Async function that performs the request
   * @returns {Promise<{ data: any, error: string|null }>}
   */
  const handleRequest = useCallback(
    async (requestFn) => {
      if (!token) {
        window.location.href = "/login";
        return { data: null, error: "Not authenticated" };
      }

      try {
        const response = await requestFn();
        return { data: response.data, error: null };
      } catch (err) {
        const status = err.response?.status;

        // Redirect to login on auth failure
        if (status === 401) {
          localStorage.removeItem("access");
          localStorage.removeItem("refresh");
          localStorage.removeItem("user");
          window.location.href = "/login";
          return { data: null, error: "Session expired" };
        }

        const message =
          err.response?.data?.detail ||
          err.response?.data?.message ||
          err.message ||
          "Request failed";

        return { data: null, error: message };
      }
    },
    [token]
  );

  // ─── Profile ────────────────────────────────────────────────────────────

  const fetchProfile = useCallback(
    () =>
      handleRequest(() =>
        axios.get(`${API_URL}/drivers/me/profile/`, authHeaders)
      ),
    [handleRequest, authHeaders]
  );

  // ─── Earnings ───────────────────────────────────────────────────────────

  const fetchEarnings = useCallback(
    () =>
      handleRequest(() =>
        axios.get(`${API_URL}/drivers/me/earnings/`, authHeaders)
      ),
    [handleRequest, authHeaders]
  );

  // ─── Level ──────────────────────────────────────────────────────────────

  const fetchLevel = useCallback(
    () =>
      handleRequest(() =>
        axios.get(`${API_URL}/drivers/me/level/`, authHeaders)
      ),
    [handleRequest, authHeaders]
  );

  // ─── Documents ──────────────────────────────────────────────────────────

  const fetchDocuments = useCallback(
    () =>
      handleRequest(() =>
        axios.get(`${API_URL}/drivers/me/documents/`, authHeaders)
      ),
    [handleRequest, authHeaders]
  );

  // ─── Feedback ───────────────────────────────────────────────────────────

  const fetchFeedback = useCallback(
    () =>
      handleRequest(() =>
        axios.get(`${API_URL}/drivers/me/feedback/`, authHeaders)
      ),
    [handleRequest, authHeaders]
  );

  // ─── Achievements ──────────────────────────────────────────────────────

  const fetchAchievements = useCallback(
    () =>
      handleRequest(() =>
        axios.get(`${API_URL}/drivers/me/achievements/`, authHeaders)
      ),
    [handleRequest, authHeaders]
  );

  // ─── Settings ──────────────────────────────────────────────────────────

  const fetchSettings = useCallback(
    () =>
      handleRequest(() =>
        axios.get(`${API_URL}/drivers/me/settings/`, authHeaders)
      ),
    [handleRequest, authHeaders]
  );

  const updateSettings = useCallback(
    (data) =>
      handleRequest(() =>
        axios.patch(`${API_URL}/drivers/me/settings/`, data, authHeaders)
      ),
    [handleRequest, authHeaders]
  );

  // ─── Ride History ──────────────────────────────────────────────────────

  const fetchRideHistory = useCallback(
    (params = {}) => {
      const queryParams = new URLSearchParams();
      if (params.page) queryParams.set("page", params.page);
      if (params.status) queryParams.set("status", params.status);
      if (params.date_from) queryParams.set("date_from", params.date_from);
      if (params.date_to) queryParams.set("date_to", params.date_to);

      const queryString = queryParams.toString();
      const url = `${API_URL}/drivers/me/rides/${queryString ? `?${queryString}` : ""}`;

      return handleRequest(() => axios.get(url, authHeaders));
    },
    [handleRequest, authHeaders]
  );

  // ─── Favorites ─────────────────────────────────────────────────────────

  const fetchFavorites = useCallback(
    () =>
      handleRequest(() =>
        axios.get(`${API_URL}/drivers/me/favorites/`, authHeaders)
      ),
    [handleRequest, authHeaders]
  );

  return {
    fetchProfile,
    fetchEarnings,
    fetchLevel,
    fetchDocuments,
    fetchFeedback,
    fetchAchievements,
    fetchSettings,
    updateSettings,
    fetchRideHistory,
    fetchFavorites,
  };
}
