import React from "react";
import { renderHook, act } from "@testing-library/react";
import { DriverProvider, useDriverContext, DRIVER_ACTIONS } from "./DriverContext";

function wrapper({ children }) {
  return <DriverProvider>{children}</DriverProvider>;
}

describe("DriverContext", () => {
  it("provides initial state", () => {
    const { result } = renderHook(() => useDriverContext(), { wrapper });

    expect(result.current.state.isOnline).toBe(false);
    expect(result.current.state.activeRide).toBeNull();
    expect(result.current.state.driverLevel.level).toBe("bronze");
    expect(result.current.state.driverLevel.progress).toBe(0);
    expect(result.current.state.notifications.unreadCount).toBe(0);
    expect(result.current.state.notifications.items).toEqual([]);
    expect(result.current.state.driverProfile).toBeNull();
    expect(result.current.state.connectionStatus.isConnected).toBe(false);
    expect(result.current.state.connectionStatus.error).toBeNull();
  });

  it("throws when used outside DriverProvider", () => {
    // Suppress console.error for this test
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});

    expect(() => {
      renderHook(() => useDriverContext());
    }).toThrow("useDriverContext must be used within a DriverProvider");

    spy.mockRestore();
  });

  it("setOnline updates isOnline state", () => {
    const { result } = renderHook(() => useDriverContext(), { wrapper });

    act(() => {
      result.current.setOnline(true);
    });

    expect(result.current.state.isOnline).toBe(true);

    act(() => {
      result.current.setOnline(false);
    });

    expect(result.current.state.isOnline).toBe(false);
  });

  it("setActiveRide updates activeRide state", () => {
    const { result } = renderHook(() => useDriverContext(), { wrapper });

    const ride = { id: 1, status: "driver_arriving", pickup: "Airport" };

    act(() => {
      result.current.setActiveRide(ride);
    });

    expect(result.current.state.activeRide).toEqual(ride);

    act(() => {
      result.current.setActiveRide(null);
    });

    expect(result.current.state.activeRide).toBeNull();
  });

  it("setDriverLevel updates level info", () => {
    const { result } = renderHook(() => useDriverContext(), { wrapper });

    act(() => {
      result.current.setDriverLevel({ level: "gold", progress: 75 });
    });

    expect(result.current.state.driverLevel.level).toBe("gold");
    expect(result.current.state.driverLevel.progress).toBe(75);
    // benefits should remain from initial state (merged)
    expect(result.current.state.driverLevel.benefits).toEqual([]);
  });

  it("addNotification adds to items and increments unreadCount", () => {
    const { result } = renderHook(() => useDriverContext(), { wrapper });

    const notification1 = { id: 1, type: "ride_request", message: "New ride" };
    const notification2 = { id: 2, type: "achievement", message: "Level up!" };

    act(() => {
      result.current.addNotification(notification1);
    });

    expect(result.current.state.notifications.items).toHaveLength(1);
    expect(result.current.state.notifications.unreadCount).toBe(1);

    act(() => {
      result.current.addNotification(notification2);
    });

    expect(result.current.state.notifications.items).toHaveLength(2);
    expect(result.current.state.notifications.unreadCount).toBe(2);
    // Most recent first
    expect(result.current.state.notifications.items[0]).toEqual(notification2);
  });

  it("markNotificationsRead resets unreadCount to 0", () => {
    const { result } = renderHook(() => useDriverContext(), { wrapper });

    act(() => {
      result.current.addNotification({ id: 1, message: "test" });
      result.current.addNotification({ id: 2, message: "test2" });
    });

    expect(result.current.state.notifications.unreadCount).toBe(2);

    act(() => {
      result.current.markNotificationsRead();
    });

    expect(result.current.state.notifications.unreadCount).toBe(0);
    // Items should still be there
    expect(result.current.state.notifications.items).toHaveLength(2);
  });

  it("setDriverProfile updates profile data", () => {
    const { result } = renderHook(() => useDriverContext(), { wrapper });

    const profile = {
      id: 1,
      name: "Amadou",
      vehicle_make: "Toyota",
      status: "approved",
    };

    act(() => {
      result.current.setDriverProfile(profile);
    });

    expect(result.current.state.driverProfile).toEqual(profile);
  });

  it("setConnectionStatus updates connection state", () => {
    const { result } = renderHook(() => useDriverContext(), { wrapper });

    act(() => {
      result.current.setConnectionStatus({ isConnected: true });
    });

    expect(result.current.state.connectionStatus.isConnected).toBe(true);
    expect(result.current.state.connectionStatus.error).toBeNull();

    act(() => {
      result.current.setConnectionStatus({ error: "Connection lost" });
    });

    expect(result.current.state.connectionStatus.isConnected).toBe(true);
    expect(result.current.state.connectionStatus.error).toBe("Connection lost");
  });

  it("resetState returns to initial state", () => {
    const { result } = renderHook(() => useDriverContext(), { wrapper });

    act(() => {
      result.current.setOnline(true);
      result.current.setActiveRide({ id: 1 });
      result.current.setDriverLevel({ level: "elite", progress: 100 });
      result.current.addNotification({ id: 1, message: "test" });
    });

    act(() => {
      result.current.resetState();
    });

    expect(result.current.state.isOnline).toBe(false);
    expect(result.current.state.activeRide).toBeNull();
    expect(result.current.state.driverLevel.level).toBe("bronze");
    expect(result.current.state.notifications.unreadCount).toBe(0);
  });

  it("accepts initialValues override", () => {
    function customWrapper({ children }) {
      return (
        <DriverProvider initialValues={{ isOnline: true, driverLevel: { level: "silver", progress: 50, benefits: ["priority"] } }}>
          {children}
        </DriverProvider>
      );
    }

    const { result } = renderHook(() => useDriverContext(), {
      wrapper: customWrapper,
    });

    expect(result.current.state.isOnline).toBe(true);
    expect(result.current.state.driverLevel.level).toBe("silver");
    expect(result.current.state.driverLevel.progress).toBe(50);
  });

  it("dispatch works directly with action objects", () => {
    const { result } = renderHook(() => useDriverContext(), { wrapper });

    act(() => {
      result.current.dispatch({
        type: DRIVER_ACTIONS.SET_ONLINE,
        payload: true,
      });
    });

    expect(result.current.state.isOnline).toBe(true);
  });
});
