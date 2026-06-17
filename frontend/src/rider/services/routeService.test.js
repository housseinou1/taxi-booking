import { getRoute, fetchOSRMRoute, calculateHaversineFallback, FALLBACK_SPEED_KMH } from "./routeService";

// Mock fetch globally
global.fetch = jest.fn();

describe("routeService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    console.log.mockRestore();
  });

  describe("fetchOSRMRoute", () => {
    it("returns null for invalid inputs", async () => {
      expect(await fetchOSRMRoute(null)).toBeNull();
      expect(await fetchOSRMRoute([])).toBeNull();
      expect(await fetchOSRMRoute([[1, 2]])).toBeNull();
      expect(await fetchOSRMRoute([null, [1, 2]])).toBeNull();
    });

    it("returns route data from OSRM on success", async () => {
      global.fetch.mockResolvedValueOnce({
        json: async () => ({
          routes: [
            {
              geometry: {
                coordinates: [
                  [-15.978, 18.086],
                  [-15.970, 18.090],
                ],
              },
              distance: 5000,
              duration: 600,
            },
          ],
        }),
      });

      const result = await fetchOSRMRoute([
        [18.086, -15.978],
        [18.090, -15.970],
      ]);

      expect(result).toEqual({
        points: [
          [18.086, -15.978],
          [18.090, -15.970],
        ],
        distanceKm: 5,
        etaMinutes: 10,
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("router.project-osrm.org/route/v1/driving/-15.978,18.086;-15.97,18.09")
      );
    });

    it("returns null when OSRM returns no routes", async () => {
      global.fetch.mockResolvedValueOnce({
        json: async () => ({ routes: [] }),
      });

      const result = await fetchOSRMRoute([
        [18.086, -15.978],
        [18.090, -15.970],
      ]);

      expect(result).toBeNull();
    });

    it("ensures etaMinutes is at least 1", async () => {
      global.fetch.mockResolvedValueOnce({
        json: async () => ({
          routes: [
            {
              geometry: { coordinates: [[-15.978, 18.086], [-15.970, 18.090]] },
              distance: 100,
              duration: 10,
            },
          ],
        }),
      });

      const result = await fetchOSRMRoute([
        [18.086, -15.978],
        [18.090, -15.970],
      ]);

      expect(result.etaMinutes).toBe(1);
    });
  });

  describe("calculateHaversineFallback", () => {
    it("returns null for invalid inputs", () => {
      expect(calculateHaversineFallback(null)).toBeNull();
      expect(calculateHaversineFallback([])).toBeNull();
      expect(calculateHaversineFallback([[1, 2]])).toBeNull();
      expect(calculateHaversineFallback([null, [1, 2]])).toBeNull();
    });

    it("returns route with haversine distance and estimated ETA", () => {
      const points = [
        [18.086, -15.978],
        [18.150, -15.900],
      ];

      const result = calculateHaversineFallback(points);

      expect(result).not.toBeNull();
      expect(result.points).toEqual(points);
      expect(result.distanceKm).toBeGreaterThan(0);
      expect(result.etaMinutes).toBeGreaterThan(0);
      // ETA should be based on fallback speed
      expect(result.etaMinutes).toBe(
        Math.max(1, Math.round((result.distanceKm / FALLBACK_SPEED_KMH) * 60))
      );
    });

    it("sums distances across multiple waypoints", () => {
      const points = [
        [18.086, -15.978],
        [18.100, -15.960],
        [18.150, -15.900],
      ];

      const result = calculateHaversineFallback(points);

      expect(result).not.toBeNull();
      expect(result.points).toEqual(points);
      expect(result.distanceKm).toBeGreaterThan(0);
    });
  });

  describe("getRoute", () => {
    it("returns OSRM route on success", async () => {
      const osrmResponse = {
        routes: [
          {
            geometry: {
              coordinates: [
                [-15.978, 18.086],
                [-15.970, 18.090],
              ],
            },
            distance: 3000,
            duration: 300,
          },
        ],
      };

      global.fetch.mockResolvedValueOnce({
        json: async () => osrmResponse,
      });

      const result = await getRoute([
        [18.086, -15.978],
        [18.090, -15.970],
      ]);

      expect(result).not.toBeNull();
      expect(result.distanceKm).toBe(3);
      expect(result.etaMinutes).toBe(5);
    });

    it("falls back to haversine when OSRM fetch throws", async () => {
      global.fetch.mockRejectedValueOnce(new Error("Network error"));

      const points = [
        [18.086, -15.978],
        [18.150, -15.900],
      ];

      const result = await getRoute(points);

      expect(result).not.toBeNull();
      expect(result.points).toEqual(points);
      expect(result.distanceKm).toBeGreaterThan(0);
      expect(result.etaMinutes).toBeGreaterThan(0);
    });

    it("falls back to haversine when OSRM returns no routes", async () => {
      global.fetch.mockResolvedValueOnce({
        json: async () => ({ routes: [] }),
      });

      const points = [
        [18.086, -15.978],
        [18.150, -15.900],
      ];

      const result = await getRoute(points);

      expect(result).not.toBeNull();
      expect(result.points).toEqual(points);
      expect(result.distanceKm).toBeGreaterThan(0);
    });

    it("returns null for invalid input points", async () => {
      const result = await getRoute(null);
      expect(result).toBeNull();
    });
  });
});
