import {
  isDeliveryCourierApp,
  isDeliveryUberUI,
  isNativeMobilityApp,
} from "./platform";

describe("native app registration context", () => {
  beforeEach(() => {
    window.__YALA_APP_TYPE__ = undefined;
    localStorage.clear();
  });

  test("rider native app ignores stale courier session", () => {
    window.__YALA_APP_TYPE__ = "rider";
    localStorage.setItem("yala_delivery_courier", "1");

    expect(isNativeMobilityApp()).toBe(true);
    expect(isDeliveryCourierApp()).toBe(false);
    expect(isDeliveryUberUI()).toBe(false);
  });

  test("driver native app ignores stale courier session", () => {
    window.__YALA_APP_TYPE__ = "driver";
    localStorage.setItem("yala_delivery_courier", "1");

    expect(isNativeMobilityApp()).toBe(true);
    expect(isDeliveryCourierApp()).toBe(false);
    expect(isDeliveryUberUI()).toBe(false);
  });

  test("delivery native app stays courier", () => {
    window.__YALA_APP_TYPE__ = "delivery";

    expect(isDeliveryCourierApp()).toBe(true);
    expect(isDeliveryUberUI()).toBe(true);
  });
});
