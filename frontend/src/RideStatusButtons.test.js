import React from "react";
import { render, screen } from "@testing-library/react";

import RideStatusButtons from "./RideStatusButtons";

const makeRide = (status) => ({
  id: 42,
  status,
  pickup_lat: 18.1,
  pickup_lng: -15.9,
  destination_lat: 18.2,
  destination_lng: -15.8,
  stops: [],
});

describe("RideStatusButtons core driver actions", () => {
  it("shows Arrived while the driver is arriving", () => {
    render(
      <RideStatusButtons
        ride={makeRide("driver_arriving")}
        distanceToNextKm={0.1}
        arriveGate={{
          reliable: true,
          near: true,
          distanceM: 100,
          distanceKm: 0.1,
          arriveBody: { lat: 18.1, lng: -15.9 },
        }}
      />
    );

    expect(screen.getByRole("button", { name: "Slide Right to Arrive" })).toBeInTheDocument();
  });

  it("shows Verify PIN after the driver arrives", () => {
    render(<RideStatusButtons ride={makeRide("driver_arrived")} />);

    expect(screen.getByLabelText("Rider pickup PIN")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Verify PIN" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start Ride" })).not.toBeInTheDocument();
  });

  it("shows Start Ride after PIN is verified", () => {
    render(
      <RideStatusButtons
        ride={{ ...makeRide("driver_arrived"), pickup_pin_verified: true }}
      />
    );

    expect(screen.getByRole("button", { name: "Start Ride" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Verify PIN" })).not.toBeInTheDocument();
  });

  it("shows Finish Ride while the ride is in progress", () => {
    render(<RideStatusButtons ride={makeRide("in_progress")} />);

    expect(screen.getByRole("button", { name: "Slide Right to Finish Ride" })).toBeInTheDocument();
  });

  it("shows Mark Arrived when waiting for GPS (manual fallback)", () => {
    render(
      <RideStatusButtons
        ride={makeRide("driver_arriving")}
        gpsUnavailable
        arriveGate={{
          reliable: false,
          near: false,
          distanceM: null,
          distanceKm: null,
          arriveBody: null,
        }}
      />
    );

    const arriveButton = screen.getByRole("button", { name: "Mark Arrived" });
    expect(arriveButton).toBeInTheDocument();
    expect(arriveButton).toHaveAttribute("aria-disabled", "false");
  });

  it("enables arrive when within geofence", () => {
    render(
      <RideStatusButtons
        ride={makeRide("driver_arriving")}
        arriveGate={{
          reliable: true,
          near: true,
          distanceM: 80,
          distanceKm: 0.08,
          arriveBody: { lat: 18.1, lng: -15.9 },
        }}
      />
    );

    expect(screen.getByRole("button", { name: "Slide Right to Arrive" })).toHaveAttribute(
      "aria-disabled",
      "false"
    );
  });

  it("enables Mark Arrived when GPS distance is absurd (out-of-market)", () => {
    render(
      <RideStatusButtons
        ride={makeRide("driver_arriving")}
        arriveGate={{
          reliable: true,
          near: false,
          distanceM: 6029100,
          distanceKm: 6029.1,
          arriveBody: { lat: 40.8, lng: -73.9 },
          outsideServiceArea: true,
        }}
        distanceToNextKm={6029.1}
      />
    );

    expect(screen.getByRole("button", { name: /Mark Arrived|Slide Right to Arrive/i })).toHaveAttribute(
      "aria-disabled",
      "false"
    );
  });
});
