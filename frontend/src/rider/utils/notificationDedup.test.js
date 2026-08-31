import {
  buildNotificationEventKey,
  clearRiderNotificationDedup,
  shouldShowRiderNotification,
} from "./notificationDedup";

describe("notificationDedup", () => {
  beforeEach(() => {
    sessionStorage.clear();
    clearRiderNotificationDedup();
  });

  it("builds stable event keys", () => {
    expect(
      buildNotificationEventKey({ type: "driver_arrived", rideId: 12, backendId: 5 })
    ).toBe("history:5");
  });

  it("suppresses duplicate events within ttl", () => {
    const key = "ride:driver_arrived:12";
    expect(shouldShowRiderNotification(key, 60000)).toBe(true);
    expect(shouldShowRiderNotification(key, 60000)).toBe(false);
  });
});
