import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import ActionPanel, { getActionForRideStatus, isOfflineToggleDisabled } from "./ActionPanel";
import { DriverProvider } from "../context/DriverContext";

// ─── Mock axios ─────────────────────────────────────────────────────────────
jest.mock("axios", () => ({
  post: jest.fn(() => Promise.resolve({ data: { status: "success" } })),
}));

const axios = require("axios");

// ─── Helper: render with DriverProvider ─────────────────────────────────────
function renderWithProvider(ui, { initialValues = {} } = {}) {
  return render(
    <DriverProvider initialValues={initialValues}>{ui}</DriverProvider>
  );
}

// ─── Unit Tests for getActionForRideStatus ──────────────────────────────────

describe("getActionForRideStatus", () => {
  it('returns Accept action for "requested" status', () => {
    const action = getActionForRideStatus("requested");
    expect(action).toEqual({ label: "Accept", endpoint: "accept", color: "#00A651" });
  });

  it('returns Arrived action for "driver_arriving" status', () => {
    const action = getActionForRideStatus("driver_arriving");
    expect(action).toEqual({ label: "Arrived", endpoint: "arrived", color: "#F59E0B" });
  });

  it('returns Start Ride action for "driver_arrived" status', () => {
    const action = getActionForRideStatus("driver_arrived");
    expect(action).toEqual({ label: "Start Ride", endpoint: "start", color: "#F97316" });
  });

  it('returns Complete Ride action for "in_progress" status', () => {
    const action = getActionForRideStatus("in_progress");
    expect(action).toEqual({ label: "Complete Ride", endpoint: "complete", color: "#2563EB" });
  });

  it("returns null for completed status", () => {
    expect(getActionForRideStatus("completed")).toBeNull();
  });

  it("returns null for cancelled status", () => {
    expect(getActionForRideStatus("cancelled")).toBeNull();
  });

  it("returns null for null/undefined", () => {
    expect(getActionForRideStatus(null)).toBeNull();
    expect(getActionForRideStatus(undefined)).toBeNull();
  });
});

// ─── Unit Tests for isOfflineToggleDisabled ─────────────────────────────────

describe("isOfflineToggleDisabled", () => {
  it("returns false when no active ride", () => {
    expect(isOfflineToggleDisabled(null)).toBe(false);
  });

  it("returns false when ride has no status", () => {
    expect(isOfflineToggleDisabled({})).toBe(false);
  });

  it("returns false for requested status", () => {
    expect(isOfflineToggleDisabled({ status: "requested" })).toBe(false);
  });

  it("returns true for driver_arriving status", () => {
    expect(isOfflineToggleDisabled({ status: "driver_arriving" })).toBe(true);
  });

  it("returns true for driver_arrived status", () => {
    expect(isOfflineToggleDisabled({ status: "driver_arrived" })).toBe(true);
  });

  it("returns true for in_progress status", () => {
    expect(isOfflineToggleDisabled({ status: "in_progress" })).toBe(true);
  });

  it("returns false for completed status", () => {
    expect(isOfflineToggleDisabled({ status: "completed" })).toBe(false);
  });

  it("returns false for cancelled status", () => {
    expect(isOfflineToggleDisabled({ status: "cancelled" })).toBe(false);
  });
});

// ─── Component Tests ────────────────────────────────────────────────────────

describe("ActionPanel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.setItem("access", "test-token");
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("renders Go Online button when driver is offline", () => {
    renderWithProvider(<ActionPanel />, {
      initialValues: { isOnline: false },
    });

    expect(screen.getByLabelText("Go Online")).toBeInTheDocument();
    expect(screen.getByText("Go Online")).toBeInTheDocument();
  });

  it("renders Go Offline button when driver is online", () => {
    renderWithProvider(<ActionPanel />, {
      initialValues: { isOnline: true },
    });

    expect(screen.getByLabelText("Go Offline")).toBeInTheDocument();
    expect(screen.getByText("Go Offline")).toBeInTheDocument();
  });

  it("toggle button occupies at least 50% width via flex styling", () => {
    renderWithProvider(<ActionPanel />, {
      initialValues: { isOnline: false },
    });

    const toggleBtn = screen.getByLabelText("Go Online");
    // The button has flex: "1 1 55%" and minWidth: "55%"
    expect(toggleBtn.style.minWidth).toBe("55%");
  });

  it("toggle button is green when online", () => {
    renderWithProvider(<ActionPanel />, {
      initialValues: { isOnline: true },
    });

    const toggleBtn = screen.getByLabelText("Go Offline");
    expect(toggleBtn.style.backgroundColor).toBe("rgb(0, 166, 81)");
  });

  it("toggle button is gray when offline", () => {
    renderWithProvider(<ActionPanel />, {
      initialValues: { isOnline: false },
    });

    const toggleBtn = screen.getByLabelText("Go Online");
    expect(toggleBtn.style.backgroundColor).toBe("rgb(107, 114, 128)");
  });

  it("calls API to toggle availability when clicked", async () => {
    axios.post.mockResolvedValueOnce({ data: { is_available: true } });

    renderWithProvider(<ActionPanel />, {
      initialValues: { isOnline: false },
    });

    await act(async () => {
      fireEvent.click(screen.getByLabelText("Go Online"));
    });

    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining("/drivers/availability/toggle/"),
      {},
      expect.objectContaining({ headers: expect.any(Object) })
    );
  });

  it("reverts toggle on API failure", async () => {
    axios.post.mockRejectedValueOnce({
      response: { data: { error: "Server error" } },
    });

    renderWithProvider(<ActionPanel />, {
      initialValues: { isOnline: false },
    });

    await act(async () => {
      fireEvent.click(screen.getByLabelText("Go Online"));
    });

    await waitFor(() => {
      // Should revert back to "Go Online" (offline state)
      expect(screen.getByText("Go Online")).toBeInTheDocument();
    });

    // Error message should be displayed
    expect(screen.getByRole("alert")).toHaveTextContent("Server error");
  });

  it("prevents going offline when ride is active (driver_arriving)", () => {
    renderWithProvider(<ActionPanel />, {
      initialValues: {
        isOnline: true,
        activeRide: { id: 1, status: "driver_arriving" },
      },
    });

    const toggleBtn = screen.getByLabelText("Go Offline");
    // Button should be disabled when ride is active
    expect(toggleBtn).toBeDisabled();

    // Clicking a disabled button should not call the API
    fireEvent.click(toggleBtn);
    expect(axios.post).not.toHaveBeenCalled();
  });

  it("prevents going offline when ride is in_progress", async () => {
    renderWithProvider(<ActionPanel />, {
      initialValues: {
        isOnline: true,
        activeRide: { id: 1, status: "in_progress" },
      },
    });

    const toggleBtn = screen.getByLabelText("Go Offline");
    // Button should be disabled
    expect(toggleBtn).toBeDisabled();
  });

  it("shows Accept button when ride status is requested", () => {
    renderWithProvider(<ActionPanel />, {
      initialValues: {
        isOnline: true,
        activeRide: { id: 1, status: "requested" },
      },
    });

    expect(screen.getByLabelText("Accept")).toBeInTheDocument();
  });

  it("shows Arrived button when ride status is driver_arriving", () => {
    renderWithProvider(<ActionPanel />, {
      initialValues: {
        isOnline: true,
        activeRide: { id: 1, status: "driver_arriving" },
      },
    });

    expect(screen.getByLabelText("Arrived")).toBeInTheDocument();
  });

  it("shows Start Ride button when ride status is driver_arrived", () => {
    renderWithProvider(<ActionPanel />, {
      initialValues: {
        isOnline: true,
        activeRide: { id: 1, status: "driver_arrived" },
      },
    });

    expect(screen.getByLabelText("Start Ride")).toBeInTheDocument();
  });

  it("shows Complete Ride button when ride status is in_progress", () => {
    renderWithProvider(<ActionPanel />, {
      initialValues: {
        isOnline: true,
        activeRide: { id: 1, status: "in_progress" },
      },
    });

    expect(screen.getByLabelText("Complete Ride")).toBeInTheDocument();
  });

  it("does not show action button when no active ride", () => {
    renderWithProvider(<ActionPanel />, {
      initialValues: { isOnline: true, activeRide: null },
    });

    expect(screen.queryByLabelText("Accept")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Arrived")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Start Ride")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Complete Ride")).not.toBeInTheDocument();
  });

  it("does not show action button for completed ride", () => {
    renderWithProvider(<ActionPanel />, {
      initialValues: {
        isOnline: true,
        activeRide: { id: 1, status: "completed" },
      },
    });

    expect(screen.queryByLabelText("Accept")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Arrived")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Start Ride")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Complete Ride")).not.toBeInTheDocument();
  });

  it("calls ride action API when contextual button is clicked", async () => {
    axios.post.mockResolvedValueOnce({ data: { status: "driver_arriving" } });
    const onRideAction = jest.fn();

    renderWithProvider(<ActionPanel onRideAction={onRideAction} />, {
      initialValues: {
        isOnline: true,
        activeRide: { id: 42, status: "requested" },
      },
    });

    await act(async () => {
      fireEvent.click(screen.getByLabelText("Accept"));
    });

    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining("/rides/accept/42/"),
      {},
      expect.objectContaining({ headers: expect.any(Object) })
    );

    await waitFor(() => {
      expect(onRideAction).toHaveBeenCalledWith({ status: "driver_arriving" });
    });
  });

  it("shows error when ride action API fails", async () => {
    axios.post.mockRejectedValueOnce({
      response: { data: { detail: "Invalid transition" } },
    });

    renderWithProvider(<ActionPanel />, {
      initialValues: {
        isOnline: true,
        activeRide: { id: 1, status: "driver_arriving" },
      },
    });

    await act(async () => {
      fireEvent.click(screen.getByLabelText("Arrived"));
    });

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Invalid transition");
    });
  });

  it("shows only one contextual button at a time", () => {
    renderWithProvider(<ActionPanel />, {
      initialValues: {
        isOnline: true,
        activeRide: { id: 1, status: "driver_arrived" },
      },
    });

    // Only Start Ride should be visible
    expect(screen.getByLabelText("Start Ride")).toBeInTheDocument();
    expect(screen.queryByLabelText("Accept")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Arrived")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Complete Ride")).not.toBeInTheDocument();
  });
});
