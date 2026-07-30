import React from "react";
import { render, screen, act, waitFor } from "@testing-library/react";
import { formatNotificationCount } from "./DriverDashboard";
import { DriverProvider } from "./context/DriverContext";

// ─── Mock dependencies ──────────────────────────────────────────────────────

// Mock axios
jest.mock("axios", () => ({
  get: jest.fn(() => Promise.resolve({ data: {} })),
  post: jest.fn(() => Promise.resolve({ data: {} })),
}));

// Mock GoogleTripMap
jest.mock("../maps/GoogleTripMap", () => {
  return function MockGoogleTripMap(props) {
    return (
      <div data-testid="google-trip-map" data-center={JSON.stringify(props.center)}>
        Map
      </div>
    );
  };
});

// Mock RideStatusButtons
jest.mock("../RideStatusButtons", () => {
  return function MockRideStatusButtons() {
    return <div data-testid="ride-status-buttons">Status Buttons</div>;
  };
});

// Mock useDriverLocation
jest.mock("./hooks/useDriverLocation", () => {
  return jest.fn(() => ({
    location: { lat: 18.0735, lng: -15.9582 },
    locationError: null,
    isTracking: true,
  }));
});

// Mock useDriverWebSocket
jest.mock("./hooks/useDriverWebSocket", () => {
  return jest.fn(() => ({
    isConnected: true,
    connectionError: null,
    sendMessage: jest.fn(),
    reconnect: jest.fn(),
  }));
});

// ─── Unit Tests for formatNotificationCount ─────────────────────────────────

describe("formatNotificationCount", () => {
  it("returns empty string for zero count", () => {
    expect(formatNotificationCount(0)).toBe("");
  });

  it("returns empty string for negative count", () => {
    expect(formatNotificationCount(-5)).toBe("");
  });

  it("returns numeric string for count 1", () => {
    expect(formatNotificationCount(1)).toBe("1");
  });

  it("returns numeric string for count 50", () => {
    expect(formatNotificationCount(50)).toBe("50");
  });

  it("returns numeric string for count 99", () => {
    expect(formatNotificationCount(99)).toBe("99");
  });

  it('returns "99+" for count 100', () => {
    expect(formatNotificationCount(100)).toBe("99+");
  });

  it('returns "99+" for count 500', () => {
    expect(formatNotificationCount(500)).toBe("99+");
  });

  it('returns "99+" for very large count', () => {
    expect(formatNotificationCount(9999)).toBe("99+");
  });
});

// ─── Component Rendering Tests ──────────────────────────────────────────────

describe("DriverDashboard", () => {
  const useDriverLocation = require("./hooks/useDriverLocation");
  const useDriverWebSocket = require("./hooks/useDriverWebSocket");
  const axios = require("axios");

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.setItem("access", "test-token");

    // Default mock returns
    useDriverLocation.mockReturnValue({
      location: { lat: 18.0735, lng: -15.9582 },
      locationError: null,
      isTracking: true,
    });

    useDriverWebSocket.mockReturnValue({
      isConnected: true,
      connectionError: null,
      sendMessage: jest.fn(),
      reconnect: jest.fn(),
    });

    axios.get.mockImplementation((url) => {
      if (url.includes("/drivers/me/")) {
        return Promise.resolve({
          data: {
            full_name: "Ahmed Ould Mohamed",
            profile_picture: "https://example.com/photo.jpg",
            driver_level: "gold",
            is_available: true,
          },
        });
      }
      if (url.includes("/earnings/")) {
        return Promise.resolve({ data: { today_earnings: 1500 } });
      }
      if (url.includes("/heatmap/")) {
        return Promise.resolve({ data: [] });
      }
      if (url.includes("/notifications/")) {
        return Promise.resolve({ data: { items: [], unread_count: 5 } });
      }
      return Promise.resolve({ data: {} });
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("renders the full-screen map", async () => {
    const DriverDashboard = require("./DriverDashboard").default;

    await act(async () => {
      render(
        <DriverProvider>
          <DriverDashboard />
        </DriverProvider>
      );
    });

    expect(screen.getByTestId("google-trip-map")).toBeInTheDocument();
  });

  it("displays driver profile info in top bar", async () => {
    const DriverDashboard = require("./DriverDashboard").default;

    await act(async () => {
      render(
        <DriverProvider
          initialValues={{
            driverProfile: {
              full_name: "Ahmed Ould Mohamed",
              profile_picture: "https://example.com/photo.jpg",
              driver_level: "gold",
            },
          }}
        >
          <DriverDashboard />
        </DriverProvider>
      );
    });

    await waitFor(() => {
      expect(screen.getByText("Ahmed Ould Mohamed")).toBeInTheDocument();
    });
  });

  it("displays level badge", async () => {
    const DriverDashboard = require("./DriverDashboard").default;

    await act(async () => {
      render(
        <DriverProvider
          initialValues={{
            driverProfile: {
              full_name: "Test Driver",
              driver_level: "gold",
            },
          }}
        >
          <DriverDashboard />
        </DriverProvider>
      );
    });

    await waitFor(() => {
      expect(screen.getByLabelText("Driver level: Gold")).toBeInTheDocument();
    });
  });

  it("displays notification bell button", async () => {
    const DriverDashboard = require("./DriverDashboard").default;

    await act(async () => {
      render(
        <DriverProvider>
          <DriverDashboard />
        </DriverProvider>
      );
    });

    expect(screen.getByLabelText("Notifications")).toBeInTheDocument();
  });

  it("shows notification badge with count", async () => {
    axios.get.mockImplementation((url) => {
      if (url.includes("/drivers/me/notifications/")) {
        return Promise.resolve({ data: { items: [], unread_count: 42 } });
      }
      if (url.includes("/drivers/me/")) {
        return Promise.resolve({
          data: {
            full_name: "Ahmed Ould Mohamed",
            profile_picture: "https://example.com/photo.jpg",
            driver_level: "gold",
            is_available: true,
          },
        });
      }
      if (url.includes("/earnings/")) {
        return Promise.resolve({ data: { today_earnings: 1500 } });
      }
      if (url.includes("/heatmap/")) {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({ data: {} });
    });

    const DriverDashboard = require("./DriverDashboard").default;

    await act(async () => {
      render(
        <DriverProvider>
          <DriverDashboard />
        </DriverProvider>
      );
    });

    await waitFor(() => {
      expect(screen.getByText("42")).toBeInTheDocument();
    });
  });

  it("shows 99+ for notification count exceeding 99", async () => {
    axios.get.mockImplementation((url) => {
      if (url.includes("/drivers/me/notifications/")) {
        return Promise.resolve({ data: { items: [], unread_count: 150 } });
      }
      if (url.includes("/drivers/me/")) {
        return Promise.resolve({
          data: {
            full_name: "Ahmed Ould Mohamed",
            profile_picture: "https://example.com/photo.jpg",
            driver_level: "gold",
            is_available: true,
          },
        });
      }
      if (url.includes("/earnings/")) {
        return Promise.resolve({ data: { today_earnings: 1500 } });
      }
      if (url.includes("/heatmap/")) {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({ data: {} });
    });

    const DriverDashboard = require("./DriverDashboard").default;

    await act(async () => {
      render(
        <DriverProvider>
          <DriverDashboard />
        </DriverProvider>
      );
    });

    await waitFor(() => {
      expect(screen.getByText("99+")).toBeInTheDocument();
    });
  });

  it("renders GPS error state when location permission is denied", async () => {
    useDriverLocation.mockReturnValue({
      location: null,
      locationError:
        "Location access is required. Please enable location services to use the driver app.",
      isTracking: false,
    });

    const DriverDashboard = require("./DriverDashboard").default;

    await act(async () => {
      render(
        <DriverProvider>
          <DriverDashboard />
        </DriverProvider>
      );
    });

    expect(screen.getByText("GPS Unavailable")).toBeInTheDocument();
    expect(
      screen.getByText(/Location access is required to use the Yala Driver App/)
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Retry enabling GPS")).toBeInTheDocument();
  });

  it("shows connection error banner when WebSocket disconnects", async () => {
    useDriverWebSocket.mockReturnValue({
      isConnected: false,
      connectionError: "Unable to establish connection. Please check your internet and try again.",
      sendMessage: jest.fn(),
      reconnect: jest.fn(),
    });

    const DriverDashboard = require("./DriverDashboard").default;

    await act(async () => {
      render(
        <DriverProvider>
          <DriverDashboard />
        </DriverProvider>
      );
    });

    expect(
      screen.getByText("Unable to establish connection. Please check your internet and try again.")
    ).toBeInTheDocument();
  });

  it("does not show notification badge when count is zero", async () => {
    const DriverDashboard = require("./DriverDashboard").default;

    await act(async () => {
      render(
        <DriverProvider
          initialValues={{
            notifications: { items: [], unreadCount: 0 },
          }}
        >
          <DriverDashboard />
        </DriverProvider>
      );
    });

    // The bell should exist but no badge text
    expect(screen.getByLabelText("Notifications")).toBeInTheDocument();
    // formatNotificationCount(0) returns "" so no badge should render
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });
});
