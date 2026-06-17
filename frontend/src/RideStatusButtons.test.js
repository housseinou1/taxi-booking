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
    render(<RideStatusButtons ride={makeRide("driver_arriving")} distanceToNextKm={0.1} />);

    expect(screen.getByRole("button", { name: "Slide Right to Arrive" })).toBeInTheDocument();
  });

  it("shows Start Ride after the driver arrives", () => {
    render(<RideStatusButtons ride={makeRide("driver_arrived")} />);

    expect(screen.getByRole("button", { name: "Slide Right to Start Ride" })).toBeInTheDocument();
  });

  it("shows Finish Ride while the ride is in progress", () => {
    render(<RideStatusButtons ride={makeRide("in_progress")} />);

    expect(screen.getByRole("button", { name: "Slide Right to Finish Ride" })).toBeInTheDocument();
  });
});
