/**
 * Phase 2 tests: Rides Management module (client + table/status logic).
 *
 * Verifies the API query builder, the client calls, and the presentation helpers
 * that drive the professional table (status tones, filters, columns).
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";

import { buildRidesQuery, fetchAdminRides, fetchAdminRideDetail } from "../ridesApi";
import {
  STATUS_OPTIONS,
  RIDE_TYPE_OPTIONS,
  RIDE_COLUMNS,
  SERVER_SORT_FIELDS,
  Filters,
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
    [
      "id", "created_at", "status", "ride_type", "pickup", "destination",
      "rider_name", "driver_name", "fare", "app_fee", "payment_status",
    ].forEach((id) => expect(ids).toContain(id));
  });

  it("never renders a pickup PIN column", () => {
    expect(RIDE_COLUMNS.map((c) => c.id)).not.toContain("pickup_pin");
  });

  it("only advertises sorting the backend can actually perform", () => {
    // The backend (ADMIN_RIDE_SORT_FIELDS) silently falls back to -created_at for an
    // unknown ordering key. Advertising a sort it cannot do would toggle the header
    // while the rows never moved, so every sortable column must be in the allow-list.
    const sortable = RIDE_COLUMNS.filter((c) => c.sortable).map((c) => c.id);
    expect(sortable.length).toBeGreaterThan(0);
    sortable.forEach((id) => expect(SERVER_SORT_FIELDS).toContain(id));
  });

  it("does not claim the Ride ID column is sortable", () => {
    // REGRESSION: `id` was marked sortable while the backend has no "id" sort key.
    const idColumn = RIDE_COLUMNS.find((c) => c.id === "id");
    expect(idColumn.sortable).toBeFalsy();
    expect(SERVER_SORT_FIELDS).not.toContain("id");
  });

  it("renders every column label without an empty or duplicated label", () => {
    const labels = RIDE_COLUMNS.map((c) => c.label);
    labels.forEach((label) => expect(typeof label === "string" && label.trim().length).toBeTruthy());
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe("Rides filters", () => {
  const baseFilters = { status: "", ride_type: "", date_from: "", date_to: "" };
  const renderFilters = (overrides = {}) => {
    const onChange = jest.fn();
    const onClear = jest.fn();
    const { container } = render(
      <Filters
        filters={{ ...baseFilters, ...overrides }}
        onChange={onChange}
        onClear={onClear}
      />
    );
    return { onChange, onClear, container };
  };

  it("uses searchable comboboxes for status and ride category", () => {
    renderFilters();
    const combos = screen.getAllByRole("combobox");
    expect(combos).toHaveLength(2);
    expect(screen.getByText("Ride status")).toBeInTheDocument();
    expect(screen.getByText("Ride category")).toBeInTheDocument();
  });

  it("does not fall back to a native select", () => {
    const { container } = renderFilters();
    // A native <select> cannot be searched and lets an invalid option be submitted.
    expect(container.querySelectorAll("select")).toHaveLength(0);
  });

  it("emits the chosen status so the server-side filter is applied", () => {
    const { onChange } = renderFilters();
    fireEvent.click(screen.getAllByRole("combobox")[0]);
    fireEvent.click(screen.getByRole("option", { name: /completed/i }));
    expect(onChange).toHaveBeenCalledWith("status", "completed");
  });

  it("emits an empty status when the 'all statuses' option is chosen", () => {
    const { onChange } = renderFilters({ status: "completed" });
    fireEvent.click(screen.getAllByRole("combobox")[0]);
    fireEvent.click(screen.getByRole("option", { name: /all statuses/i }));
    expect(onChange).toHaveBeenCalledWith("status", "");
  });

  it("keeps the date range bound to the backend's date_from / date_to fields", () => {
    const { onChange } = renderFilters();
    fireEvent.change(screen.getByLabelText(/from \(date range\)/i), {
      target: { value: "2026-01-01" },
    });
    expect(onChange).toHaveBeenCalledWith("date_from", "2026-01-01");

    fireEvent.change(screen.getByLabelText(/to \(date range\)/i), {
      target: { value: "2026-01-31" },
    });
    expect(onChange).toHaveBeenCalledWith("date_to", "2026-01-31");
  });

  it("does not render filters the backend cannot honour", () => {
    const { container } = renderFilters();
    // City/wilaya, Driver, Rider, Payment status and Cancellation reason have no
    // server-side support; showing them would be a control that silently no-ops.
    const text = container.textContent.toLowerCase();
    ["city", "wilaya", "cancellation reason", "payment status"].forEach((unsupported) => {
      expect(text).not.toContain(unsupported);
    });
  });

  it("calls onClear from the clear control", () => {
    const { onClear } = renderFilters({ status: "completed" });
    fireEvent.click(screen.getByRole("button", { name: /clear filters/i }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
