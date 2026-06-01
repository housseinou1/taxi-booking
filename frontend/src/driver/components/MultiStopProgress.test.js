import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import MultiStopProgress, {
  getStopStatus,
  getNextPendingStop,
  getNavigationDestination,
} from "./MultiStopProgress";

// ─── Unit Tests for getStopStatus ───────────────────────────────────────────

describe("getStopStatus", () => {
  it('returns "pending" when arrived_at and departed_at are both null', () => {
    expect(getStopStatus({ arrived_at: null, departed_at: null })).toBe("pending");
  });

  it('returns "pending" when stop is null/undefined', () => {
    expect(getStopStatus(null)).toBe("pending");
    expect(getStopStatus(undefined)).toBe("pending");
  });

  it('returns "arrived" when arrived_at is set but departed_at is null', () => {
    expect(
      getStopStatus({ arrived_at: "2024-01-01T10:00:00Z", departed_at: null })
    ).toBe("arrived");
  });

  it('returns "departed" when both arrived_at and departed_at are set', () => {
    expect(
      getStopStatus({
        arrived_at: "2024-01-01T10:00:00Z",
        departed_at: "2024-01-01T10:05:00Z",
      })
    ).toBe("departed");
  });
});

// ─── Unit Tests for getNextPendingStop ──────────────────────────────────────

describe("getNextPendingStop", () => {
  it("returns null for empty array", () => {
    expect(getNextPendingStop([])).toBeNull();
  });

  it("returns null for null/undefined input", () => {
    expect(getNextPendingStop(null)).toBeNull();
    expect(getNextPendingStop(undefined)).toBeNull();
  });

  it("returns the first pending stop in order", () => {
    const stops = [
      { stop_order: 1, location_name: "Stop A", arrived_at: "2024-01-01T10:00:00Z", departed_at: "2024-01-01T10:05:00Z" },
      { stop_order: 2, location_name: "Stop B", arrived_at: null, departed_at: null },
      { stop_order: 3, location_name: "Stop C", arrived_at: null, departed_at: null },
    ];
    const result = getNextPendingStop(stops);
    expect(result.location_name).toBe("Stop B");
    expect(result.stop_order).toBe(2);
  });

  it("returns null when all stops are departed", () => {
    const stops = [
      { stop_order: 1, location_name: "Stop A", arrived_at: "2024-01-01T10:00:00Z", departed_at: "2024-01-01T10:05:00Z" },
      { stop_order: 2, location_name: "Stop B", arrived_at: "2024-01-01T10:10:00Z", departed_at: "2024-01-01T10:15:00Z" },
    ];
    expect(getNextPendingStop(stops)).toBeNull();
  });

  it("handles unsorted stops correctly", () => {
    const stops = [
      { stop_order: 3, location_name: "Stop C", arrived_at: null, departed_at: null },
      { stop_order: 1, location_name: "Stop A", arrived_at: "2024-01-01T10:00:00Z", departed_at: "2024-01-01T10:05:00Z" },
      { stop_order: 2, location_name: "Stop B", arrived_at: null, departed_at: null },
    ];
    const result = getNextPendingStop(stops);
    expect(result.location_name).toBe("Stop B");
  });
});

// ─── Unit Tests for getNavigationDestination ────────────────────────────────

describe("getNavigationDestination", () => {
  it("returns null when rideStatus is not in_progress", () => {
    const stops = [
      { stop_order: 1, location_name: "Stop A", arrived_at: null, departed_at: null },
    ];
    expect(getNavigationDestination(stops, "driver_arriving")).toBeNull();
    expect(getNavigationDestination(stops, "driver_arrived")).toBeNull();
    expect(getNavigationDestination(stops, "completed")).toBeNull();
  });

  it("returns next pending stop when in_progress with pending stops", () => {
    const stops = [
      { stop_order: 1, location_name: "Stop A", arrived_at: "2024-01-01T10:00:00Z", departed_at: "2024-01-01T10:05:00Z" },
      { stop_order: 2, location_name: "Stop B", arrived_at: null, departed_at: null },
    ];
    const result = getNavigationDestination(stops, "in_progress");
    expect(result.location_name).toBe("Stop B");
  });

  it("returns null when in_progress and all stops are departed (navigate to final destination)", () => {
    const stops = [
      { stop_order: 1, location_name: "Stop A", arrived_at: "2024-01-01T10:00:00Z", departed_at: "2024-01-01T10:05:00Z" },
      { stop_order: 2, location_name: "Stop B", arrived_at: "2024-01-01T10:10:00Z", departed_at: "2024-01-01T10:15:00Z" },
    ];
    expect(getNavigationDestination(stops, "in_progress")).toBeNull();
  });

  it("returns null when stops array is empty", () => {
    expect(getNavigationDestination([], "in_progress")).toBeNull();
  });
});

// ─── Component Rendering Tests ──────────────────────────────────────────────

describe("MultiStopProgress", () => {
  const mockStops = [
    { stop_order: 1, location_name: "Airport Terminal", latitude: 18.1, longitude: -15.9, arrived_at: "2024-01-01T10:00:00Z", departed_at: "2024-01-01T10:05:00Z" },
    { stop_order: 2, location_name: "Hotel Marché", latitude: 18.2, longitude: -15.8, arrived_at: "2024-01-01T10:10:00Z", departed_at: null },
    { stop_order: 3, location_name: "City Center", latitude: 18.3, longitude: -15.7, arrived_at: null, departed_at: null },
  ];

  it("renders nothing when stops array is empty", () => {
    const { container } = render(
      <MultiStopProgress stops={[]} rideStatus="in_progress" />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders all stops in order with correct labels", () => {
    render(
      <MultiStopProgress stops={mockStops} rideStatus="in_progress" />
    );

    expect(screen.getByText("Airport Terminal")).toBeInTheDocument();
    expect(screen.getByText("Hotel Marché")).toBeInTheDocument();
    // "City Center" appears in both the navigation prompt and the stop list
    const cityCenterElements = screen.getAllByText("City Center");
    expect(cityCenterElements.length).toBeGreaterThanOrEqual(1);
  });

  it("displays correct status badges for each stop", () => {
    render(
      <MultiStopProgress stops={mockStops} rideStatus="in_progress" />
    );

    // Stop 1 is departed, Stop 2 is arrived, Stop 3 is pending
    const badges = screen.getAllByText(/Departed|Arrived|Pending/);
    expect(badges[0]).toHaveTextContent("Departed");
    expect(badges[1]).toHaveTextContent("Arrived");
    expect(badges[2]).toHaveTextContent("Pending");
  });

  it("shows Next Stop navigation prompt during in_progress with pending stops", () => {
    render(
      <MultiStopProgress stops={mockStops} rideStatus="in_progress" />
    );

    expect(screen.getByText("Next Stop:")).toBeInTheDocument();
    // "City Center" appears in both the navigation prompt and the stop list
    const cityCenterElements = screen.getAllByText("City Center");
    expect(cityCenterElements).toHaveLength(2); // once in prompt, once in timeline
  });

  it("shows Final Destination message when all stops are departed during in_progress", () => {
    const allDepartedStops = [
      { stop_order: 1, location_name: "Stop A", latitude: 18.1, longitude: -15.9, arrived_at: "2024-01-01T10:00:00Z", departed_at: "2024-01-01T10:05:00Z" },
      { stop_order: 2, location_name: "Stop B", latitude: 18.2, longitude: -15.8, arrived_at: "2024-01-01T10:10:00Z", departed_at: "2024-01-01T10:15:00Z" },
    ];

    render(
      <MultiStopProgress stops={allDepartedStops} rideStatus="in_progress" />
    );

    expect(screen.getByText("Heading to:")).toBeInTheDocument();
    expect(screen.getByText("Final Destination")).toBeInTheDocument();
  });

  it("does not show navigation prompt when ride is not in_progress", () => {
    render(
      <MultiStopProgress stops={mockStops} rideStatus="driver_arriving" />
    );

    expect(screen.queryByText("Next Stop:")).not.toBeInTheDocument();
    expect(screen.queryByText("Heading to:")).not.toBeInTheDocument();
  });

  it("calls onNavigateToStop with the next pending stop when Navigate button is clicked", () => {
    const onNavigate = jest.fn();

    render(
      <MultiStopProgress
        stops={mockStops}
        rideStatus="in_progress"
        onNavigateToStop={onNavigate}
      />
    );

    const navigateButton = screen.getByLabelText("Navigate to City Center");
    fireEvent.click(navigateButton);

    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith(
      expect.objectContaining({
        stop_order: 3,
        location_name: "City Center",
      })
    );
  });

  it("does not render Navigate button when onNavigateToStop is not provided", () => {
    render(
      <MultiStopProgress stops={mockStops} rideStatus="in_progress" />
    );

    expect(screen.queryByText("Navigate →")).not.toBeInTheDocument();
  });

  it("renders stop numbers correctly", () => {
    render(
      <MultiStopProgress stops={mockStops} rideStatus="in_progress" />
    );

    expect(screen.getByText("Stop 1")).toBeInTheDocument();
    expect(screen.getByText("Stop 2")).toBeInTheDocument();
    expect(screen.getByText("Stop 3")).toBeInTheDocument();
  });

  it("has proper accessibility attributes", () => {
    render(
      <MultiStopProgress stops={mockStops} rideStatus="in_progress" />
    );

    expect(screen.getByRole("list", { name: "Multi-stop ride progress" })).toBeInTheDocument();
    const listItems = screen.getAllByRole("listitem");
    expect(listItems).toHaveLength(3);
  });
});
