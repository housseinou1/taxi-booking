import {
  ARRIVE_MAX_DISTANCE_M,
  computeArriveGate,
  distanceToPickupM,
  parseGeoCoord,
} from "./rideGeo";

describe("rideGeo", () => {
  it("rejects null and zero coordinates", () => {
    expect(parseGeoCoord(null, 1)).toBeNull();
    expect(parseGeoCoord(0, 0)).toBeNull();
  });

  it("corrects lat/lng swap", () => {
    const point = parseGeoCoord(-15.955, 18.085);
    expect(point).toEqual({ lat: 18.085, lng: -15.955 });
  });

  it("returns 0m for same pickup and driver point", () => {
    const meters = distanceToPickupM(18.085, -15.955, 18.085, -15.955);
    expect(meters).toBeLessThan(1);
  });

  it("does not show fake 0km when gps is unreliable", () => {
    const gate = computeArriveGate({
      driverPosition: [18.085, -15.955],
      pickupLat: 18.085,
      pickupLng: -15.955,
      gpsReliable: false,
    });
    expect(gate.reliable).toBe(false);
    expect(gate.distanceKm).toBeNull();
    expect(gate.near).toBe(false);
  });

  it("marks near when within arrive max distance", () => {
    const gate = computeArriveGate({
      driverPosition: [18.085, -15.955],
      pickupLat: 18.0851,
      pickupLng: -15.9551,
      gpsReliable: true,
    });
    expect(gate.near).toBe(true);
    expect(gate.distanceM).toBeLessThan(ARRIVE_MAX_DISTANCE_M);
    expect(gate.arriveBody).toEqual({ lat: 18.085, lng: -15.955 });
  });
});
