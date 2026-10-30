/**
 * Phase 2 tests: Rides Management module (client + table/status logic).
 *
 * Verifies the API query builder, the client calls, and the presentation helpers
 * that drive the professional table (status tones, filters, columns).
 */
import { buildRidesQuery, fetchAdminRides, fetchAdminRideDetail } from "../ridesApi";
import {
  STATUS_OPTIONS,
  RIDE_TYPE_OPTIONS,
  RIDE_COLUMNS,
  statusTone,
} from "../RidesManagement";

jest.mock("../../../auth/authenticatedApi", () => ({
  __esModule: true,
  default: { get: jest.fn(() => Promise.resolve({ data: { results: [] } })) },
}));

const authenticatedApi = require("../../../auth/authenticatedApi").default;

describe("ridesApi", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authenticatedApi.get.mockResolvedValue({ data: { results: [], count: 0 } });
  });

  it("omits empty filter values from the query string", () => {
    expect(buildRidesQuery({ status: "", ride_type: "", page: 1 })).toBe("?page=1");
    expect(buildRidesQuery({})).toBe("");
  });

  it("includes provided filters and search", () => {
    const query = buildRidesQuery({ status: "completed", q: "Ksar", page_size: 25 });
    expect(query).toContain("status=completed");
    expect(query).toContain("q=Ksar");
    expect(query).toContain("page_size=25");
  });

  it("requests the admin rides list through the authenticated client", async () => {
    await fetchAdminRides({ page: 2, status: "cancelled" });
    const url = authenticatedApi.get.mock.calls[0][0];
    expect(url).toContain("/rides/admin/rides/");
    expect(url).toContain("page=2");
    expect(url).toContain("status=cancelled");
  });

  it("requests ride detail by id", async () => {
    await fetchAdminRideDetail(42);
    expect(authenticatedApi.get).toHaveBeenCalledWith(
      expect.stringContaining("/rides/admin/rides/42/")
    );
  });
});

describe("Rides table presentation", () => {
  it("offers every backend ride status as a filter", () => {
    const values = STATUS_OPTIONS.map((o) => o.value);
    [
      "requested", "scheduled", "driver_arriving", "driver_arrived",
      "in_progress", "completed", "cancelled", "rider_no_show",
    ].forEach((status) => expect(values).toContain(status));
  });

  it("offers the backend ride types (no invented types)", () => {
    expect(RIDE_TYPE_OPTIONS.map((o) => o.value)).toEqual(
      expect.arrayContaining(["", "Regular", "XL", "Comfort", "Share"])
    );
  });

  it("maps statuses to professional tones", () => {
    expect(statusTone("completed")).toBe("success");
    expect(statusTone("cancelled")).toBe("danger");
    expect(statusTone("rider_no_show")).toBe("danger");
    expect(statusTone("in_progress")).toBe("info");
    expect(statusTone("requested")).toBe("neutral");
  });

  it("exposes the operational columns required by the brief", () => {
    const ids = RIDE_COLUMNS.map((c) => c.id);
    ["id", "status", "pickup", "destination", "rider_name", "driver_name", "fare", "created_at"]
      .forEach((id) => expect(ids).toContain(id));
  });

  it("never renders a pickup PIN column", () => {
    expect(RIDE_COLUMNS.map((c) => c.id)).not.toContain("pickup_pin");
  });

  it("supports server-side sorting on key columns", () => {
    const sortable = RIDE_COLUMNS.filter((c) => c.sortable).map((c) => c.id);
    expect(sortable).toEqual(expect.arrayContaining(["id", "status", "fare", "created_at"]));
  });
});
