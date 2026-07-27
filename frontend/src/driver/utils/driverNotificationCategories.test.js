import {
  getDriverNotificationCategory,
  getDriverNotificationDeepLink,
  getDriverNotificationIcon,
} from "./driverNotificationCategories";

describe("driverNotificationCategories", () => {
  test("maps ride request types to ride category", () => {
    expect(getDriverNotificationCategory("ride_request")).toBe("ride");
    expect(getDriverNotificationCategory("ride_cancelled")).toBe("ride");
  });

  test("maps document types to documents category", () => {
    expect(getDriverNotificationCategory("document_status")).toBe("documents");
    expect(getDriverNotificationCategory("document_expiry_renewal_7d")).toBe("documents");
    expect(getDriverNotificationCategory("driver_approved")).toBe("documents");
  });

  test("maps earnings and announcements", () => {
    expect(getDriverNotificationCategory("payment_completed")).toBe("earnings");
    expect(getDriverNotificationCategory("announcement")).toBe("announcements");
    expect(getDriverNotificationCategory("command_broadcast")).toBe("announcements");
  });

  test("returns icons and deep links", () => {
    expect(getDriverNotificationIcon("payment_completed")).toBe("💰");
    expect(
      getDriverNotificationDeepLink({
        rawType: "document_status",
        deep_link: "/driver/documents",
      }),
    ).toBe("/driver/documents");
  });
});
