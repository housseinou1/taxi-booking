import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import RideCancellationModal, {
  DRIVER_NO_SHOW_CANCELLATION_REASONS,
  computeNoShowGate,
} from "./RideCancellationModal";

function getReasonButton(label) {
  return screen.getByRole("option", {
    name: (_, element) =>
      element?.querySelector(".ride-cancel-reason__label")?.childNodes?.[0]?.textContent?.trim() ===
      label,
  });
}

describe("RideCancellationModal Lyft-style rider no-show", () => {
  const baseRide = {
    id: 42,
    status: "driver_arrived",
    driver_arrived_at: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
    rider_call_attempt_count: 0,
    driver_name: "D",
  };

  it("unlocks Rider no-show after max wait near pickup", () => {
    const onCancel = jest.fn();
    render(
      <RideCancellationModal
        role="driver"
        ride={baseRide}
        saving={false}
        error=""
        onCancel={onCancel}
        onClose={jest.fn()}
        distanceToPickupM={40}
      />
    );

    const noShowBtn = getReasonButton("Rider no-show");
    expect(noShowBtn).not.toBeDisabled();
    fireEvent.click(noShowBtn);
    fireEvent.click(screen.getByRole("button", { name: /Confirm Cancellation/i }));
    expect(onCancel).toHaveBeenCalledWith({
      reason: "Rider no-show",
      reason_details: "",
    });
  });

  it("locks Rider no-show before max wait or when far from pickup", () => {
    const onCancel = jest.fn();
    const { rerender } = render(
      <RideCancellationModal
        role="driver"
        ride={{
          ...baseRide,
          driver_arrived_at: new Date().toISOString(),
        }}
        saving={false}
        error=""
        onCancel={onCancel}
        onClose={jest.fn()}
        distanceToPickupM={40}
      />
    );

    expect(getReasonButton("Rider no-show")).toBeDisabled();

    rerender(
      <RideCancellationModal
        role="driver"
        ride={baseRide}
        saving={false}
        error=""
        onCancel={onCancel}
        onClose={jest.fn()}
        distanceToPickupM={400}
      />
    );
    expect(getReasonButton("Rider no-show")).toBeDisabled();

    fireEvent.click(getReasonButton("Vehicle issue"));
    fireEvent.click(screen.getByRole("button", { name: /Confirm Cancellation/i }));
    expect(onCancel).toHaveBeenCalledWith({
      reason: "Vehicle issue",
      reason_details: "",
    });
  });

  it("exposes a single Rider no-show reason", () => {
    expect(DRIVER_NO_SHOW_CANCELLATION_REASONS).toEqual(["Rider no-show"]);
  });

  it("computeNoShowGate uses max wait and GPS", () => {
    const gate = computeNoShowGate(baseRide, { distanceToPickupM: 20 });
    expect(gate.unlocked).toBe(true);
    expect(gate.gpsOk).toBe(true);
    expect(gate.waitOk).toBe(true);
  });
});
