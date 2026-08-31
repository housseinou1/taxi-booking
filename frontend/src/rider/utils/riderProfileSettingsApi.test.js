import {
  formatMemberSince,
  getVerificationLabel,
} from "./riderProfileSettingsApi";

describe("riderProfileSettingsApi helpers", () => {
  it("formats member since date", () => {
    expect(formatMemberSince("2024-05-01T00:00:00.000Z")).toMatch(/2024/);
    expect(formatMemberSince(null)).toBe("—");
  });

  it("returns verification labels", () => {
    expect(getVerificationLabel({ rider_status: "approved" })).toBe("Verified");
    expect(getVerificationLabel({ phone_verified: true })).toBe("Phone verified");
    expect(getVerificationLabel({ rider_status: "pending" })).toBe("Pending verification");
  });
});
