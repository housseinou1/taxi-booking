import {
  loadNotificationPrefs,
  saveNotificationPrefs,
  shouldDeliverRiderNotification,
  toggleNotificationPref,
} from "./notificationPrefs";

describe("notificationPrefs", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("loads defaults when storage is empty", () => {
    expect(loadNotificationPrefs().ride_updates).toBe(true);
    expect(loadNotificationPrefs().sms).toBe(true);
  });

  it("persists preference toggles", () => {
    toggleNotificationPref("promotions", false);
    expect(loadNotificationPrefs().promotions).toBe(false);
    saveNotificationPrefs({ receipts: false });
    expect(loadNotificationPrefs().receipts).toBe(false);
  });

  it("keeps required categories enabled", () => {
    toggleNotificationPref("ride_updates", false);
    expect(loadNotificationPrefs().ride_updates).toBe(true);
  });

  it("filters optional marketing notifications", () => {
    localStorage.setItem("sx_notifications", "on");
    toggleNotificationPref("promotions", false);
    expect(shouldDeliverRiderNotification("promotions", "promotion")).toBe(false);
    expect(shouldDeliverRiderNotification("arrival", "driver_arrived")).toBe(true);
  });
});
