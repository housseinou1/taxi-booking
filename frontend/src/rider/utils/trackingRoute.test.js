import { getTrackingTarget, shouldRefetchTrackingRoute } from "./trackingRoute";

describe("trackingRoute", () => {
  it("targets pickup before trip starts", () => {
    const target = getTrackingTarget({
      status: "driver_arriving",
      pickup_lat: 18.07,
      pickup_lng: -15.95,
    });
    expect(target).toEqual([18.07, -15.95]);
  });

  it("targets destination during in_progress", () => {
    const target = getTrackingTarget({
      status: "in_progress",
      destination_lat: 18.1,
      destination_lng: -15.94,
      stops: [],
    });
    expect(target).toEqual([18.1, -15.94]);
  });

  it("refetches when driver moved enough", () => {
    const shouldRefetch = shouldRefetchTrackingRoute(
      [18.07, -15.95],
      [18.09, -15.96],
      Date.now(),
    );
    expect(shouldRefetch).toBe(true);
  });

  it("skips refetch when barely moved and interval not elapsed", () => {
    const position = [18.07, -15.95];
    const shouldRefetch = shouldRefetchTrackingRoute(
      position,
      position,
      Date.now() - 1000,
    );
    expect(shouldRefetch).toBe(false);
  });
});
