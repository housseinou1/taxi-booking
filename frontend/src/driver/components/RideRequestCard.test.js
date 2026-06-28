import React from "react";
import { render, screen, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RideRequestCard from "./RideRequestCard";

jest.mock("../../native/sound", () => ({
  playRideRequestAlert: jest.fn(() => Promise.resolve(true)),
}));

// ─── Test Helpers ───────────────────────────────────────────────────────────

const mockRide = {
  ride_id: "ride-123",
  pickup: "Sebkha",
  destination: "Toujounine",
  fare: 500,
  distance_km: 4.2,
  countdown: 30,
};

const mockRideWithStops = {
  ...mockRide,
  stops: [
    { location_name: "Ksar", latitude: 18.1, longitude: -15.96 },
    { location_name: "Teyarett", latitude: 18.12, longitude: -15.94 },
  ],
};

const mockRideWithStopCount = {
  ...mockRide,
  stop_count: 3,
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("RideRequestCard", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("renders ride details: pickup, destination, fare, and distance", () => {
    render(
      <RideRequestCard
        ride={mockRide}
        onAccept={jest.fn()}
        onDecline={jest.fn()}
        onExpired={jest.fn()}
      />
    );

    expect(screen.getByText("Sebkha")).toBeInTheDocument();
    expect(screen.getByText("Toujounine")).toBeInTheDocument();
    expect(screen.getByText(/500/)).toBeInTheDocument();
    expect(screen.getByText("4.2 km")).toBeInTheDocument();
  });

  it("displays 30-second countdown timer", () => {
    render(
      <RideRequestCard
        ride={mockRide}
        onAccept={jest.fn()}
        onDecline={jest.fn()}
        onExpired={jest.fn()}
      />
    );

    expect(screen.getByText("30s")).toBeInTheDocument();
  });

  it("decrements countdown every second", () => {
    render(
      <RideRequestCard
        ride={mockRide}
        onAccept={jest.fn()}
        onDecline={jest.fn()}
        onExpired={jest.fn()}
      />
    );

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(screen.getByText("29s")).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(screen.getByText("24s")).toBeInTheDocument();
  });

  it("calls onExpired and shows 'Request expired' when countdown reaches 0", () => {
    const onExpired = jest.fn();
    render(
      <RideRequestCard
        ride={{ ...mockRide, countdown: 3 }}
        onAccept={jest.fn()}
        onDecline={jest.fn()}
        onExpired={onExpired}
      />
    );

    act(() => {
      jest.advanceTimersByTime(3000);
    });

    expect(onExpired).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Request expired")).toBeInTheDocument();
  });

  it("auto-dismisses expired message after 3 seconds by calling onDecline", () => {
    const onDecline = jest.fn();
    render(
      <RideRequestCard
        ride={{ ...mockRide, countdown: 2 }}
        onAccept={jest.fn()}
        onDecline={onDecline}
        onExpired={jest.fn()}
      />
    );

    // Let countdown expire
    act(() => {
      jest.advanceTimersByTime(2000);
    });

    expect(screen.getByText("Request expired")).toBeInTheDocument();

    // Wait for auto-dismiss
    act(() => {
      jest.advanceTimersByTime(3000);
    });

    expect(onDecline).toHaveBeenCalled();
  });

  it("calls onAccept when Accept button is clicked", () => {
    const onAccept = jest.fn();
    render(
      <RideRequestCard
        ride={mockRide}
        onAccept={onAccept}
        onDecline={jest.fn()}
        onExpired={jest.fn()}
      />
    );

    const acceptButton = screen.getByRole("button", { name: /accept/i });
    acceptButton.click();

    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it("calls onDecline when Decline button is clicked", () => {
    const onDecline = jest.fn();
    render(
      <RideRequestCard
        ride={mockRide}
        onAccept={jest.fn()}
        onDecline={onDecline}
        onExpired={jest.fn()}
      />
    );

    const declineButton = screen.getByRole("button", { name: /decline/i });
    declineButton.click();

    expect(onDecline).toHaveBeenCalledTimes(1);
  });

  it("displays multi-stop badge when ride has stops array", () => {
    render(
      <RideRequestCard
        ride={mockRideWithStops}
        onAccept={jest.fn()}
        onDecline={jest.fn()}
        onExpired={jest.fn()}
      />
    );

    expect(screen.getByText(/2 stops/)).toBeInTheDocument();
  });

  it("displays multi-stop badge when ride has stop_count", () => {
    render(
      <RideRequestCard
        ride={mockRideWithStopCount}
        onAccept={jest.fn()}
        onDecline={jest.fn()}
        onExpired={jest.fn()}
      />
    );

    expect(screen.getByText(/3 stops/)).toBeInTheDocument();
  });

  it("does not display multi-stop badge when ride has no stops", () => {
    render(
      <RideRequestCard
        ride={mockRide}
        onAccept={jest.fn()}
        onDecline={jest.fn()}
        onExpired={jest.fn()}
      />
    );

    expect(screen.queryByText(/stops/)).not.toBeInTheDocument();
  });

  it("shows singular 'stop' for single stop", () => {
    const rideWithOneStop = {
      ...mockRide,
      stop_count: 1,
    };

    render(
      <RideRequestCard
        ride={rideWithOneStop}
        onAccept={jest.fn()}
        onDecline={jest.fn()}
        onExpired={jest.fn()}
      />
    );

    expect(screen.getByText(/1 stop$/)).toBeInTheDocument();
  });

  it("has accessible progress bar with countdown value", () => {
    render(
      <RideRequestCard
        ride={mockRide}
        onAccept={jest.fn()}
        onDecline={jest.fn()}
        onExpired={jest.fn()}
      />
    );

    const progressBar = screen.getByRole("progressbar");
    expect(progressBar).toHaveAttribute("aria-valuenow", "30");
    expect(progressBar).toHaveAttribute("aria-valuemax", "30");
  });

  it("uses custom countdown value from ride prop", () => {
    render(
      <RideRequestCard
        ride={{ ...mockRide, countdown: 15 }}
        onAccept={jest.fn()}
        onDecline={jest.fn()}
        onExpired={jest.fn()}
      />
    );

    expect(screen.getByText("15s")).toBeInTheDocument();
  });

  it("displays fallback text when pickup/destination are missing", () => {
    const rideNoAddresses = {
      fare: 300,
      distance_km: 2.5,
      countdown: 30,
    };

    render(
      <RideRequestCard
        ride={rideNoAddresses}
        onAccept={jest.fn()}
        onDecline={jest.fn()}
        onExpired={jest.fn()}
      />
    );

    const routeTexts = document.querySelectorAll(
      ".ride-request-sheet__route-text"
    );
    expect(routeTexts[0]).toHaveTextContent("Pickup");
    expect(routeTexts[1]).toHaveTextContent("Destination");
  });
});
