/**
 * RideDetailsDrawer — read-only ride detail panel for Rides Management.
 *
 * REGRESSION GUARD (why this file exists):
 * The original drawer had a malformed JSX tree: the whole ride-detail block was
 * nested *inside* the Retry <button> and *inside* the `error ? (...)` branch. It
 * compiled cleanly, so the build passed, and the existing suite only covered the
 * API client and the presentation helpers — so nothing caught it. The effect was
 * that ride details never rendered at all: with no error the `error ?` branch was
 * false, so the drawer body was empty.
 *
 * These tests render the component for real and assert (a) the detail content is
 * present with no error, and (b) the content is NOT inside a button.
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";

import RideDetailsDrawer from "../RideDetailsDrawer";

const RIDE = {
  id: 42,
  status: "completed",
  ride_type: "Regular",
  pickup: "Ksar, Nouakchott",
  destination: "Tevragh Zeina",
  distance_km: "12.40",
  rider_name: "Aichetou Mint Sidi",
  rider_email: "aichetou@example.mr",
  rider_phone: "+22245001122",
  driver_name: "Mohamed Ould Ahmed",
  driver_email: "mohamed@example.mr",
  driver_phone: "+22245003344",
  fare: "250.00",
  app_fee: "25.00",
  driver_earning: "225.00",
  waiting_fee: "0.00",
  cancellation_fee: null,
  payment_status: "completed",
  created_at: "2026-01-05T08:15:00Z",
  completed_at: "2026-01-05T08:47:00Z",
};

describe("RideDetailsDrawer", () => {
  test("renders the ride detail sections when a ride is supplied and there is no error", () => {
    render(<RideDetailsDrawer ride={RIDE} loading={false} error="" onClose={jest.fn()} />);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Ride #42")).toBeInTheDocument();

    // Every section the administrator needs to inspect must be reachable.
    ["Route", "Rider", "Driver", "Fare & payment", "Timeline"].forEach((heading) => {
      expect(screen.getByText(heading)).toBeInTheDocument();
    });

    // Driver and rider information.
    expect(screen.getByText("Aichetou Mint Sidi")).toBeInTheDocument();
    expect(screen.getByText("Mohamed Ould Ahmed")).toBeInTheDocument();

    // Pickup and destination.
    expect(screen.getByText("Ksar, Nouakchott")).toBeInTheDocument();
    expect(screen.getByText("Tevragh Zeina")).toBeInTheDocument();
  });

  test("REGRESSION: detail content is not nested inside the Retry button", () => {
    render(<RideDetailsDrawer ride={RIDE} loading={false} error="" onClose={jest.fn()} />);

    // The malformed tree made every field a child of the error-state button.
    expect(screen.getByText("Ksar, Nouakchott").closest("button")).toBeNull();
    expect(screen.getByText("Aichetou Mint Sidi").closest("button")).toBeNull();

    // With no error there must be no Retry control at all.
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
  });

  test("shows the error state with a Retry action and no ride content", () => {
    const onRetry = jest.fn();
    render(
      <RideDetailsDrawer
        ride={null}
        loading={false}
        error="The ride details endpoint was not found on this backend (HTTP 404). This is a configuration problem, not missing data."
        onClose={jest.fn()}
        onRetry={onRetry}
      />
    );

    expect(screen.getByText(/configuration problem, not missing data/i)).toBeInTheDocument();

    const retry = screen.getByRole("button", { name: /retry/i });
    fireEvent.click(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);

    // No ride means no sections.
    expect(screen.queryByText("Route")).not.toBeInTheDocument();
    expect(screen.queryByText("Fare & payment")).not.toBeInTheDocument();
  });

  test("renders nothing when closed", () => {
    const { container } = render(
      <RideDetailsDrawer ride={null} loading={false} error="" onClose={jest.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  test("shows the cancellation section only for a cancelled ride", () => {
    const { unmount } = render(
      <RideDetailsDrawer ride={RIDE} loading={false} error="" onClose={jest.fn()} />
    );
    expect(screen.queryByText("Cancellation")).not.toBeInTheDocument();
    unmount();

    render(
      <RideDetailsDrawer
        ride={{
          ...RIDE,
          status: "cancelled",
          cancelled_by: "rider",
          cancellation_reason: "rider_changed_mind",
        }}
        loading={false}
        error=""
        onClose={jest.fn()}
      />
    );
    expect(screen.getByText("Cancellation")).toBeInTheDocument();
    expect(screen.getByText("rider_changed_mind")).toBeInTheDocument();
  });

  test("closes on Escape", () => {
    const onClose = jest.fn();
    render(<RideDetailsDrawer ride={RIDE} loading={false} error="" onClose={onClose} />);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
