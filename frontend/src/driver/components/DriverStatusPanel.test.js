import React from "react";
import { render, screen } from "@testing-library/react";

import DriverStatusPanel from "./DriverStatusPanel";

describe("DriverStatusPanel active ride workflow", () => {
  const activeRide = {
    id: 42,
    status: "driver_arrived",
    rider_name: "Aminata Diallo",
    rider_picture: "https://example.com/rider.jpg",
    pickup: "Ksar",
    destination: "Arafat",
    fare: 350,
    ride_type: "regular",
  };

  it("shows rider identity, route, and fare for an active ride", () => {
    render(<DriverStatusPanel activeRide={activeRide} />);

    expect(screen.getByText("Aminata Diallo")).toBeInTheDocument();
    expect(screen.getByAltText("Aminata Diallo")).toHaveAttribute(
      "src",
      "https://example.com/rider.jpg"
    );
    expect(screen.getByText("Ksar")).toBeInTheDocument();
    expect(screen.getByText("Arafat")).toBeInTheDocument();
    expect(screen.getByText("350 MRU")).toBeInTheDocument();
  });

  it("renders the existing ride status action inside the active ride panel", () => {
    render(
      <DriverStatusPanel
        activeRide={activeRide}
        rideActions={<div>Slide Right to Start Ride</div>}
      />
    );

    expect(screen.getByText("Slide Right to Start Ride")).toBeInTheDocument();
  });
});
