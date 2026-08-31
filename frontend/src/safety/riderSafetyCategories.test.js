import {
  RIDER_INCIDENT_CATEGORIES,
  RIDER_SAFETY_TIP_KEYS,
  getVerificationFields,
} from "./riderSafetyCategories";

describe("riderSafetyCategories", () => {
  it("defines structured incident categories", () => {
    expect(RIDER_INCIDENT_CATEGORIES.length).toBeGreaterThanOrEqual(6);
    expect(RIDER_INCIDENT_CATEGORIES[0].backendType).toBeTruthy();
  });

  it("includes safety education tip keys", () => {
    expect(RIDER_SAFETY_TIP_KEYS).toContain("riderCheckDriver");
    expect(RIDER_SAFETY_TIP_KEYS).toContain("useSos");
  });

  it("builds ride verification fields", () => {
    const fields = getVerificationFields({
      driver_first_name: "Ali",
      driver_last_name: "Sow",
      vehicle_make: "Toyota",
      vehicle_model: "Corolla",
      vehicle_color: "White",
      plate_number: "1234 AB 01",
      driver_verified: true,
    });
    expect(fields.driverName).toBe("Ali Sow");
    expect(fields.vehicle).toContain("Toyota");
    expect(fields.plate).toBe("1234 AB 01");
    expect(fields.verified).toBe(true);
  });
});
