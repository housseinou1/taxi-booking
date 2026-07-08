import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import RideCancellationModal, {
  DRIVER_NO_SHOW_CANCELLATION_REASONS,
} from "./RideCancellationModal";

function getReasonButton(label) {
  return screen.getByRole("option", {
    name: (_, element) =>
      element?.querySelector(".ride-cancel-reason__label")?.childNodes?.[0]?.textContent?.trim() ===
      label,
  });
}

describe("RideCancellationModal driver no-show gate", () => {
  const baseRide = {
    id: 42,
    status: "driver_arrived",
    driver_arrived_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    rider_call_attempt_count: 2,
    driver_name: "D",
  };

  it("unlocks no-show reasons after wait and two calls", () => {
    const onCancel = jest.fn();
    render(
      <RideCancellationModal
        role="driver"
        ride={baseRide}
        saving={false}
        error=""
        onCancel={onCancel}
        onClose={jest.fn()}
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

  it("locks no-show reasons before free wait / calls", () => {
    const onCancel = jest.fn();
    render(
      <RideCancellationModal
        role="driver"
        ride={{
          ...baseRide,
          driver_arrived_at: new Date().toISOString(),
          rider_call_attempt_count: 0,
        }}
        saving={false}
        error=""
        onCancel={onCancel}
        onClose={jest.fn()}
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

  it("exposes dedicated no-show reason list", () => {
    expect(DRIVER_NO_SHOW_CANCELLATION_REASONS).toContain("Rider no-show");
    expect(DRIVER_NO_SHOW_CANCELLATION_REASONS).toContain("Rider not answering calls");
  });
});
