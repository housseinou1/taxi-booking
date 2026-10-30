/**
 * Lifecycle tests for the courier location reporter (mobile launch — background tracking).
 *
 * Verifies background tracking starts only for an active delivery, stops when the delivery ends
 * or the hook unmounts, that the foreground GPS behaviour is preserved, that both sources feed
 * the same endpoint, and that a second watcher can never be stacked.
 */
import { act, renderHook } from "@testing-library/react";

import useCourierLocationReporter from "../useCourierLocationReporter";
import {
  startBackgroundLocationTracking,
  stopBackgroundLocationTracking,
} from "../../native/location";
import { apiRequest } from "../DeliveryShared";

jest.mock("../../native/location", () => ({
  startBackgroundLocationTracking: jest.fn(),
  stopBackgroundLocationTracking: jest.fn(),
}));

jest.mock("../DeliveryShared", () => ({
  apiRequest: jest.fn(),
}));

jest.mock("../../apiConfig", () => ({ API_URL: "http://api.test" }));

const watchPosition = jest.fn();
const clearWatch = jest.fn();

beforeEach(() => {
  // CRA configures jest with `resetMocks: true`, so mock implementations must be
  // (re)installed here rather than in the jest.mock factory.
  jest.clearAllMocks();
  startBackgroundLocationTracking.mockResolvedValue(undefined);
  stopBackgroundLocationTracking.mockResolvedValue(undefined);
  apiRequest.mockResolvedValue({});
  Object.defineProperty(global.navigator, "geolocation", {
    configurable: true,
    value: { watchPosition, clearWatch },
  });
});

test("does not start any tracking while there is no active delivery", () => {
  renderHook(() => useCourierLocationReporter({ enabled: false }));

  expect(watchPosition).not.toHaveBeenCalled();
  expect(startBackgroundLocationTracking).not.toHaveBeenCalled();
  expect(stopBackgroundLocationTracking).not.toHaveBeenCalled();
});

test("starts foreground GPS and the background watcher for an active delivery", () => {
  renderHook(() => useCourierLocationReporter({ enabled: true }));

  expect(watchPosition).toHaveBeenCalledTimes(1);
  expect(startBackgroundLocationTracking).toHaveBeenCalledTimes(1);
  expect(typeof startBackgroundLocationTracking.mock.calls[0][0].onLocation).toBe("function");
});

test("both the foreground fix and the background fix POST to the courier location endpoint", () => {
  renderHook(() => useCourierLocationReporter({ enabled: true }));

  const onForeground = watchPosition.mock.calls[0][0];
  act(() => onForeground({ coords: { latitude: 18.1, longitude: -15.9 } }));

  const { onLocation } = startBackgroundLocationTracking.mock.calls[0][0];
  act(() => onLocation({ lat: 18.2, lng: -15.8 }));

  expect(apiRequest).toHaveBeenCalledTimes(2);
  expect(apiRequest.mock.calls[0][0]).toBe("http://api.test/deliveries/courier/location/");
  expect(JSON.parse(apiRequest.mock.calls[0][1].body)).toEqual({ lat: 18.1, lng: -15.9 });
  expect(JSON.parse(apiRequest.mock.calls[1][1].body)).toEqual({ lat: 18.2, lng: -15.8 });
});

test("stops foreground and background tracking when the delivery ends", () => {
  const { rerender } = renderHook(
    ({ enabled }) => useCourierLocationReporter({ enabled }),
    { initialProps: { enabled: true } }
  );

  rerender({ enabled: false });

  expect(clearWatch).toHaveBeenCalledTimes(1);
  expect(stopBackgroundLocationTracking).toHaveBeenCalledTimes(1);
});

test("stops background tracking when the dashboard unmounts (e.g. logout)", () => {
  const { unmount } = renderHook(() => useCourierLocationReporter({ enabled: true }));

  unmount();

  expect(stopBackgroundLocationTracking).toHaveBeenCalledTimes(1);
});

test("re-rendering for the same active delivery does not stack a second watcher", () => {
  const { rerender } = renderHook(
    ({ enabled }) => useCourierLocationReporter({ enabled }),
    { initialProps: { enabled: true } }
  );

  rerender({ enabled: true });
  rerender({ enabled: true });

  expect(startBackgroundLocationTracking).toHaveBeenCalledTimes(1);
  expect(watchPosition).toHaveBeenCalledTimes(1);
});
