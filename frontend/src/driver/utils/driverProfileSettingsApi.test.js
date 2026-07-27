import {
  getAccountStatusLabel,
  getSeatingCapacity,
  getVehicleVerificationStatus,
} from "./driverProfileSettingsApi";

describe("driverProfileSettingsApi helpers", () => {
  it("maps account status labels", () => {
    expect(getAccountStatusLabel({ status: "approved", isActive: true })).toBe("Active");
    expect(getAccountStatusLabel({ status: "pending", isActive: true })).toBe("Pending");
    expect(getAccountStatusLabel({ status: "approved", isActive: false })).toBe("Suspended");
  });

  it("maps seating capacity from car type", () => {
    expect(getSeatingCapacity("xl")).toBe(6);
    expect(getSeatingCapacity("regular")).toBe(4);
  });

  it("derives vehicle verification status from documents", () => {
    expect(getVehicleVerificationStatus([]).status).toBe("missing");
    expect(
      getVehicleVerificationStatus([
        { document_type: "insurance", file: "a.pdf", status: "approved" },
        { document_type: "carte_grise", file: "b.pdf", status: "approved" },
      ]).status
    ).toBe("verified");
  });
});
