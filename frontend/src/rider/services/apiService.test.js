import axios from "axios";
import {
  getToken,
  requestRide,
  cancelRide,
  getRideHistory,
  validatePromo,
  getActiveRide,
  getRiderProfile,
  ApiError,
} from "./apiService";

// ─── Mock dependencies ──────────────────────────────────────────────────────

jest.mock("axios", () => ({
  get: jest.fn(),
  post: jest.fn(),
}));

jest.mock("../../apiConfig", () => ({
  API_URL: "http://localhost:8000",
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

function setToken(value) {
  if (value) {
    localStorage.setItem("access", value);
  } else {
    localStorage.removeItem("access");
  }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("apiService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    setToken("test-jwt-token");
  });

  // ─── getToken ───────────────────────────────────────────────────────────

  describe("getToken", () => {
    it("returns the token from localStorage", () => {
      expect(getToken()).toBe("test-jwt-token");
    });

    it("returns null when no token exists", () => {
      localStorage.removeItem("access");
      expect(getToken()).toBeNull();
    });
  });

  // ─── requestRide ────────────────────────────────────────────────────────

  describe("requestRide", () => {
    it("sends a POST to /rides/request/ with correct params and auth", async () => {
      const rideData = { id: 1, status: "requested", pin_code: "1234" };
      axios.post.mockResolvedValueOnce({ data: { ride: rideData } });

      const params = {
        pickup_latitude: 18.09,
        pickup_longitude: -15.97,
        destination_latitude: 18.10,
        destination_longitude: -15.96,
        stops: [],
        ride_type: "regular",
        distance_km: 3.5,
        estimated_fare: 250,
        pickup_address: "Pickup St",
        destination_address: "Dest Ave",
      };

      const result = await requestRide(params);

      expect(axios.post).toHaveBeenCalledWith(
        "http://localhost:8000/rides/request/",
        expect.objectContaining({
          pickup_lat: 18.09,
          pickup_lng: -15.97,
          destination_lat: 18.10,
          destination_lng: -15.96,
          ride_type: "regular",
          distance_km: 3.5,
          fare: 250,
          stops: [],
        }),
        expect.objectContaining({ headers: { Authorization: "Bearer test-jwt-token" } })
      );
      expect(result).toEqual(rideData);
    });

    it("throws ApiError on failure", async () => {
      axios.post.mockRejectedValueOnce({
        response: { status: 400, data: { detail: "Invalid coordinates" } },
      });

      await expect(
        requestRide({
          pickup_latitude: 0,
          pickup_longitude: 0,
          destination_latitude: 0,
          destination_longitude: 0,
          stops: [],
          ride_type: "regular",
          distance_km: 0,
          estimated_fare: 0,
        })
      ).rejects.toThrow(ApiError);
    });

    it("throws ApiError when no token is present", async () => {
      setToken(null);

      await expect(
        requestRide({
          pickup_latitude: 18.09,
          pickup_longitude: -15.97,
          destination_latitude: 18.10,
          destination_longitude: -15.96,
          stops: [],
          ride_type: "regular",
          distance_km: 3.5,
          estimated_fare: 250,
        })
      ).rejects.toThrow(ApiError);
    });
  });

  // ─── cancelRide ─────────────────────────────────────────────────────────

  describe("cancelRide", () => {
    it("sends POST to /rides/cancel/{id}/ with reason and auth", async () => {
      axios.post.mockResolvedValueOnce({
        data: { cancellation_fee: "50.00", refund_status: "Refund released" },
      });

      const result = await cancelRide(42, "Changed my mind");

      expect(axios.post).toHaveBeenCalledWith(
        "http://localhost:8000/rides/cancel/42/",
        { reason: "Changed my mind", cancelled_by: "rider" },
        expect.objectContaining({ headers: { Authorization: "Bearer test-jwt-token" } })
      );
      expect(result).toEqual({
        success: true,
        cancellation_fee: "50.00",
        message: "Refund released",
      });
    });

    it("throws ApiError on cancel failure", async () => {
      axios.post.mockRejectedValueOnce({
        response: { status: 403, data: { detail: "Cannot cancel this ride" } },
      });

      await expect(cancelRide(42, "reason")).rejects.toThrow(ApiError);
    });
  });

  // ─── getRideHistory ─────────────────────────────────────────────────────

  describe("getRideHistory", () => {
    it("fetches ride history with auth header", async () => {
      const rides = [
        { id: 1, status: "completed", fare: 200 },
        { id: 2, status: "in_progress", fare: 350 },
      ];
      axios.get.mockResolvedValueOnce({ data: rides });

      const result = await getRideHistory();

      expect(axios.get).toHaveBeenCalledWith(
        "http://localhost:8000/rides/history/",
        expect.objectContaining({ headers: { Authorization: "Bearer test-jwt-token" } })
      );
      expect(result).toEqual(rides);
    });

    it("returns empty array if response is not an array", async () => {
      axios.get.mockResolvedValueOnce({ data: null });

      const result = await getRideHistory();
      expect(result).toEqual([]);
    });

    it("throws ApiError on network failure", async () => {
      axios.get.mockRejectedValueOnce({ request: {} });

      await expect(getRideHistory()).rejects.toThrow(ApiError);
    });
  });

  // ─── validatePromo ──────────────────────────────────────────────────────

  describe("validatePromo", () => {
    it("sends POST to /promotions/validate/ with code and fare", async () => {
      const promoResult = {
        valid: true,
        discount_amount: 50,
        final_fare: 200,
        discount_type: "fixed",
        error_code: null,
        message: "Promo applied",
      };
      axios.post.mockResolvedValueOnce({ data: promoResult });

      const result = await validatePromo("SUMMER50", 250);

      expect(axios.post).toHaveBeenCalledWith(
        "http://localhost:8000/promotions/validate/",
        { code: "SUMMER50", estimated_fare: 250 },
        expect.objectContaining({ headers: { Authorization: "Bearer test-jwt-token" } })
      );
      expect(result).toEqual(promoResult);
    });

    it("throws ApiError for rate-limited requests", async () => {
      axios.post.mockRejectedValueOnce({
        response: {
          status: 429,
          data: { detail: "Too many promo code attempts" },
        },
      });

      await expect(validatePromo("CODE", 100)).rejects.toThrow(ApiError);
    });
  });

  // ─── getActiveRide ──────────────────────────────────────────────────────

  describe("getActiveRide", () => {
    it("returns the first active ride from history", async () => {
      const rides = [
        { id: 1, status: "completed" },
        { id: 2, status: "in_progress" },
        { id: 3, status: "accepted" },
      ];
      axios.get.mockResolvedValueOnce({ data: rides });

      const result = await getActiveRide();
      expect(result).toEqual({ id: 2, status: "in_progress" });
    });

    it("returns null when no active ride exists", async () => {
      const rides = [
        { id: 1, status: "completed" },
        { id: 2, status: "cancelled" },
      ];
      axios.get.mockResolvedValueOnce({ data: rides });

      const result = await getActiveRide();
      expect(result).toBeNull();
    });

    it("returns null for empty ride history", async () => {
      axios.get.mockResolvedValueOnce({ data: [] });

      const result = await getActiveRide();
      expect(result).toBeNull();
    });
  });

  // ─── getRiderProfile ────────────────────────────────────────────────────

  describe("getRiderProfile", () => {
    it("fetches rider profile from /auth/me/", async () => {
      const profile = {
        phone_number: "+22212345678",
        profile_picture: "https://example.com/pic.jpg",
        member_since_year: "2023",
      };
      axios.get.mockResolvedValueOnce({ data: profile });

      const result = await getRiderProfile();

      expect(axios.get).toHaveBeenCalledWith(
        "http://localhost:8000/auth/me/",
        expect.objectContaining({ headers: { Authorization: "Bearer test-jwt-token" } })
      );
      expect(result).toEqual(profile);
    });

    it("refreshes and retries when the access token is expired", async () => {
      localStorage.setItem("refresh", "valid-refresh");
      axios.get
        .mockRejectedValueOnce({
          response: {
            status: 401,
            data: { detail: "Token expired", code: "token_not_valid" },
          },
        })
        .mockResolvedValueOnce({ data: { id: 7, email: "rider@example.com" } });
      axios.post.mockResolvedValueOnce({ data: { access: "new-access" } });

      const profile = await getRiderProfile();

      expect(profile.id).toBe(7);
      expect(localStorage.getItem("access")).toBe("new-access");
    });
  });

  // ─── Error handling ─────────────────────────────────────────────────────

  describe("error handling", () => {
    it("creates structured ApiError with status and code from response", async () => {
      axios.get.mockRejectedValueOnce({
        response: {
          status: 404,
          data: { detail: "Not found", error_code: "not_found" },
        },
      });

      const error = await getRideHistory().catch((e) => e);
      expect(error).toBeInstanceOf(ApiError);
      expect(error.message).toBe("Not found");
      expect(error.status).toBe(404);
      expect(error.code).toBe("not_found");
    });

    it("handles network errors without response", async () => {
      axios.get.mockRejectedValueOnce({ request: {} });

      const error = await getRideHistory().catch((e) => e);
      expect(error).toBeInstanceOf(ApiError);
      expect(error.status).toBe(0);
      expect(error.code).toBe("network_error");
    });
  });
});
