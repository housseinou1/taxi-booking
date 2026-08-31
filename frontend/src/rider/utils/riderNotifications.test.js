import {
  getRiderNotificationCategory,
  getRiderNotificationIcon,
  isRequiredRiderNotificationType,
} from "./riderNotificationCategories";
import { resolveRiderNotificationDeepLink } from "./notificationDeepLinks";

describe("riderNotificationCategories", () => {
  it("maps ride lifecycle types to categories", () => {
    expect(getRiderNotificationCategory("ride_accepted")).toBe("ride");
    expect(getRiderNotificationCategory("driver_arrived")).toBe("arrival");
    expect(getRiderNotificationCategory("ride_started")).toBe("trip");
    expect(getRiderNotificationCategory("payment_successful")).toBe("payments");
    expect(getRiderNotificationCategory("refund_status")).toBe("refunds");
    expect(getRiderNotificationCategory("support_reply")).toBe("support");
  });

  it("returns icons and required flags", () => {
    expect(getRiderNotificationIcon("driver_arriving")).toBe("📍");
    expect(isRequiredRiderNotificationType("driver_arrived")).toBe(true);
    expect(isRequiredRiderNotificationType("promotion")).toBe(false);
  });
});

describe("notificationDeepLinks", () => {
  beforeEach(() => {
    localStorage.setItem("access", "token");
  });

  it("routes driver arrival to active ride", () => {
    expect(
      resolveRiderNotificationDeepLink({
        rawType: "driver_arrived",
        ride_id: 42,
      })
    ).toBe("/rider-dashboard?ride=42");
  });

  it("routes payment failure to payments screen", () => {
    expect(
      resolveRiderNotificationDeepLink({
        rawType: "payment_failed",
        ride_id: 7,
        payment_id: 3,
      })
    ).toBe("/rider-payments?payment=3");
  });

  it("redirects unauthenticated users to login", () => {
    localStorage.removeItem("access");
    expect(
      resolveRiderNotificationDeepLink({
        rawType: "ride_accepted",
        ride_id: 1,
      })
    ).toBe("/login?next=%2Frider-dashboard%3Fride%3D1");
  });

  it("falls back safely for unknown deep links", () => {
    expect(
      resolveRiderNotificationDeepLink({
        deep_link: "/admin/secret",
      })
    ).toBe("/rider-dashboard");
  });
});
