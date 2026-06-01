import { renderHook, act } from "@testing-library/react";
import useDriverLocation from "./useDriverLocation";

describe("useDriverLocation", () => {
  let mockWatchPosition;
  let mockClearWatch;
  let watchCallback;
  let watchErrorCallback;

  beforeEach(() => {
    jest.useFakeTimers();
    watchCallback = null;
    watchErrorCallback = null;

    mockWatchPosition = jest.fn((success, error) => {
      watchCallback = success;
      watchErrorCallback = error;
      return 42; // watch ID
    });
    mockClearWatch = jest.fn();

    Object.defineProperty(global.navigator, "geolocation", {
      value: {
        watchPosition: mockWatchPosition,
        clearWatch: mockClearWatch,
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("does not track when offline", () => {
    const onLocationUpdate = jest.fn();
    const { result } = renderHook(() =>
      useDriverLocation({ isOnline: false, onLocationUpdate })
    );

    expect(result.current.isTracking).toBe(false);
    expect(mockWatchPosition).not.toHaveBeenCalled();
  });

  it("starts tracking when online", () => {
    const onLocationUpdate = jest.fn();
    const { result } = renderHook(() =>
      useDriverLocation({ isOnline: true, onLocationUpdate })
    );

    expect(result.current.isTracking).toBe(true);
    expect(mockWatchPosition).toHaveBeenCalled();
  });

  it("updates location when GPS provides position", () => {
    const onLocationUpdate = jest.fn();
    const { result } = renderHook(() =>
      useDriverLocation({ isOnline: true, onLocationUpdate })
    );

    act(() => {
      watchCallback({
        coords: { latitude: 18.0735, longitude: -15.9582 },
      });
    });

    expect(result.current.location).toEqual({ lat: 18.0735, lng: -15.9582 });
    expect(result.current.locationError).toBeNull();
  });

  it("transmits location every 5 seconds", () => {
    const onLocationUpdate = jest.fn();
    renderHook(() =>
      useDriverLocation({ isOnline: true, onLocationUpdate })
    );

    act(() => {
      watchCallback({
        coords: { latitude: 18.0735, longitude: -15.9582 },
      });
    });

    expect(onLocationUpdate).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(onLocationUpdate).toHaveBeenCalledWith({ lat: 18.0735, lng: -15.9582 });

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(onLocationUpdate).toHaveBeenCalledTimes(2);
  });

  it("sets error when GPS permission is denied", () => {
    const onLocationUpdate = jest.fn();
    const { result } = renderHook(() =>
      useDriverLocation({ isOnline: true, onLocationUpdate })
    );

    act(() => {
      watchErrorCallback({ code: 1 }); // PERMISSION_DENIED
    });

    expect(result.current.locationError).toContain("Location access is required");
  });

  it("uses default location when GPS is unavailable and no prior location", () => {
    const onLocationUpdate = jest.fn();
    const defaultLocation = { lat: 18.1, lng: -15.9 };
    const { result } = renderHook(() =>
      useDriverLocation({ isOnline: true, onLocationUpdate, defaultLocation })
    );

    act(() => {
      watchErrorCallback({ code: 2 }); // POSITION_UNAVAILABLE
    });

    expect(result.current.location).toEqual(defaultLocation);
  });

  it("stops tracking when going offline", () => {
    const onLocationUpdate = jest.fn();
    const { result, rerender } = renderHook(
      ({ isOnline }) =>
        useDriverLocation({ isOnline, onLocationUpdate }),
      { initialProps: { isOnline: true } }
    );

    expect(result.current.isTracking).toBe(true);

    rerender({ isOnline: false });

    expect(result.current.isTracking).toBe(false);
    expect(mockClearWatch).toHaveBeenCalledWith(42);
  });

  it("handles missing geolocation API gracefully", () => {
    Object.defineProperty(global.navigator, "geolocation", {
      value: undefined,
      writable: true,
      configurable: true,
    });

    const onLocationUpdate = jest.fn();
    const defaultLocation = { lat: 18.0735, lng: -15.9582 };
    const { result } = renderHook(() =>
      useDriverLocation({ isOnline: true, onLocationUpdate, defaultLocation })
    );

    expect(result.current.locationError).toContain("GPS is not available");
    expect(result.current.location).toEqual(defaultLocation);
  });
});
