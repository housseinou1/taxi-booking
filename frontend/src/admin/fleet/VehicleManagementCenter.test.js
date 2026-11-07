import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

import VehicleManagementCenter from "./VehicleManagementCenter";
import { exportFleetReport, fetchFleetVehicles } from "./fleetApi";

jest.mock("../layouts/useOperatingCityOptions", () => ({
  useOperatingCityOptions: () => ({
    registryOptions: [
      { value: "", label: "All cities" },
      { value: "3", label: "Nouakchott" },
    ],
    cities: [{ name: "Nouakchott", primary_registry_city_id: 3 }],
    options: [],
    nameFilterOptions: [],
    loading: false,
    error: null,
    reload: jest.fn(),
  }),
}));

jest.mock("./fleetApi", () => {
  const actual = jest.requireActual("./fleetApi");
  return {
    ...actual,
    fetchFleetVehicles: jest.fn(),
    exportFleetReport: jest.fn(),
  };
});

const LONG_DRIVER =
  "Abdallahi Mohamed El Moustapha Ould Cheikh Ahmed Vall Ould Mohamed Lemine";

function vehicle(overrides = {}) {
  return {
    driver_id: 1,
    driver_name: "Amadou Diallo",
    driver_status: "approved",
    city_id: 3,
    vehicle: {
      make: "Toyota",
      model: "Corolla",
      colour: "White",
      plate_number: "1234 AB",
      vehicle_plate: "AB-1234",
      photo_available: true,
    },
    documents: { registration: "valid", insurance: "valid", vignette: "valid", licence: "valid" },
    registration_expires_at: "2027-05-01",
    insurance_expires_at: "2027-06-01",
    vignette_expires_at: "2027-07-01",
    licence_expires_at: "2028-01-01",
    ...overrides,
  };
}

/** Three vehicles chosen so every document state is exercised exactly once. */
const VEHICLES = [
  vehicle({ driver_id: 1, driver_name: "Amadou Diallo", driver_status: "approved" }),
  vehicle({
    driver_id: 2,
    driver_name: LONG_DRIVER,
    driver_status: "pending",
    vehicle: { make: "Hyundai", model: "Accent", colour: "Blue", plate_number: "5678 CD" },
    documents: {
      registration: "expired",
      insurance: "valid",
      vignette: "expiring_soon",
      licence: "missing",
    },
  }),
  vehicle({
    driver_id: 3,
    driver_name: "Fatima Sow",
    driver_status: "rejected",
    vehicle: { make: "Kia", model: "Rio", colour: "Grey", plate_number: "9999 ZZ" },
    documents: {
      registration: "missing",
      insurance: "missing",
      vignette: "missing",
      licence: "missing",
    },
    registration_expires_at: null,
    insurance_expires_at: null,
    vignette_expires_at: null,
    licence_expires_at: null,
  }),
];

const VEHICLE_PAYLOAD = {
  today: "2026-10-30",
  expiry_alert_days: 30,
  count: VEHICLES.length,
  vehicles: VEHICLES,
  expiring_documents: [
    { driver_id: 2, driver_name: LONG_DRIVER, plate: "5678 CD", document: "vignette", state: "expiring_soon" },
  ],
  note: "Derived from DriverProfile vehicle fields.",
};

beforeEach(() => {
  jest.clearAllMocks();
  fetchFleetVehicles.mockResolvedValue({ data: VEHICLE_PAYLOAD });
  exportFleetReport.mockResolvedValue({ data: new Blob(["a,b"]) });
  window.URL.createObjectURL = jest.fn(() => "blob:mock");
  window.URL.revokeObjectURL = jest.fn();
});

async function renderPage() {
  const utils = render(<VehicleManagementCenter />);
  // Wait for post-load content: the toolbar only renders once the fetch resolves.
  await screen.findByLabelText(/Search vehicles by plate, make, model or driver/i);
  return utils;
}

/** The KPI card containing the given label — keeps value assertions unambiguous. */
function kpi(label) {
  const [node] = screen.getAllByText(label, { selector: ".fleet-kpi__label" });
  const card = node?.closest(".fleet-kpi");
  if (!card) throw new Error(`No KPI card found for "${label}"`);
  return within(card);
}

describe("VehicleManagementCenter", () => {
  it("renders the page header, breadcrumb and subtitle", async () => {
    await renderPage();

    expect(screen.getByRole("heading", { level: 1, name: "Vehicle Management" })).toBeInTheDocument();
    expect(
      screen.getByText(/Manage fleet vehicles, driver assignments, approval status/i)
    ).toBeInTheDocument();

    const crumbs = screen.getByLabelText(/Breadcrumb/i);
    expect(within(crumbs).getByText("Vehicle Management")).toBeInTheDocument();
    expect(within(crumbs).getByRole("link", { name: "Fleet" })).toHaveAttribute(
      "href",
      "/admin/fleet"
    );

    // Exactly one page title — no duplicated headings.
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("counts vehicles per vehicle, not per document", async () => {
    await renderPage();

    expect(kpi("Total vehicles").getByText("3")).toBeInTheDocument();
    expect(kpi("Approved vehicles").getByText("1")).toBeInTheDocument();
    expect(kpi("Pending approval").getByText("1")).toBeInTheDocument();
    expect(kpi("Rejected").getByText("1")).toBeInTheDocument();
    expect(kpi("Fully compliant").getByText("1")).toBeInTheDocument();
    expect(kpi("With expired documents").getByText("1")).toBeInTheDocument();
    expect(kpi("With missing documents").getByText("2")).toBeInTheDocument();
  });

  it("separates document counts from vehicle counts and labels the unit", async () => {
    await renderPage();

    // 3 vehicles x 4 documents = 12 document slots
    expect(kpi("Documents tracked").getByText("12")).toBeInTheDocument();
    expect(kpi("Valid documents").getByText("5")).toBeInTheDocument();
    expect(kpi("Expiring soon").getByText("1")).toBeInTheDocument();
    expect(kpi("Expired documents").getByText("1")).toBeInTheDocument();
    expect(kpi("Not uploaded").getByText("5")).toBeInTheDocument();

    // The units are stated in the UI so the two numbers can never be confused.
    expect(kpi("Not uploaded").getByText(/Documents with no file on record/i)).toBeInTheDocument();
    expect(
      kpi("With missing documents").getByText(/Vehicles with at least one document not uploaded/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/3 vehicles × 4 tracked documents = 12 document slots/i)
    ).toBeInTheDocument();
  });

  it("renders the vehicle directory with the requested columns", async () => {
    await renderPage();

    const directory = within(screen.getByRole("table", { name: "Vehicle directory" }));

    [
      "Vehicle",
      "License plate",
      "Assigned driver",
      "Approval status",
      "Registration",
      "Insurance",
      "Vignette",
      "Driver's licence",
    ].forEach((column) => {
      expect(directory.getByRole("columnheader", { name: new RegExp(column, "i") })).toBeInTheDocument();
    });

    expect(directory.getByText("Toyota Corolla")).toBeInTheDocument();
    expect(directory.getByText("1234 AB")).toBeInTheDocument();
    expect(directory.getByText("Hyundai Accent")).toBeInTheDocument();
    expect(directory.getAllByRole("button", { name: /View details/i }).length).toBe(3);
  });

  it("shows a readable badge for every document state", async () => {
    await renderPage();

    expect(screen.getAllByText("Valid").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Expired").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Expiring soon").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Not uploaded").length).toBeGreaterThan(0);

    // Expiry dates are surfaced where they exist.
    expect(screen.getAllByText(/Expires /).length).toBeGreaterThan(0);
  });

  it("filters by search across plate, make, model and driver", async () => {
    await renderPage();

    const search = screen.getByLabelText(/Search vehicles by plate, make, model or driver/i);

    fireEvent.change(search, { target: { value: "hyundai" } });
    await waitFor(() => expect(screen.queryByText("Toyota Corolla")).not.toBeInTheDocument());
    expect(screen.getByText("Hyundai Accent")).toBeInTheDocument();

    fireEvent.change(search, { target: { value: "9999" } });
    await waitFor(() => expect(screen.queryByText("Hyundai Accent")).not.toBeInTheDocument());
    expect(screen.getByText("Kia Rio")).toBeInTheDocument();
  });

  it("filters by approval status", async () => {
    await renderPage();

    fireEvent.change(screen.getByLabelText(/Filter by vehicle approval status/i), {
      target: { value: "approved" },
    });

    await waitFor(() => expect(screen.queryByText("Kia Rio")).not.toBeInTheDocument());
    expect(screen.getByText("Toyota Corolla")).toBeInTheDocument();
  });

  it("filters by document compliance", async () => {
    await renderPage();

    fireEvent.change(screen.getByLabelText(/Filter by document compliance/i), {
      target: { value: "expired" },
    });

    await waitFor(() => expect(screen.queryByText("Toyota Corolla")).not.toBeInTheDocument());
    expect(screen.getByText("Hyundai Accent")).toBeInTheDocument();
  });

  it("filters by city using real city names", async () => {
    await renderPage();

    const citySelect = screen.getByLabelText(/Filter by city/i);
    expect(within(citySelect).getByRole("option", { name: "Nouakchott" })).toBeInTheDocument();

    fireEvent.change(citySelect, { target: { value: "3" } });
    await waitFor(() => expect(screen.getByText("Toyota Corolla")).toBeInTheDocument());
  });

  it("combines filters and resets them", async () => {
    await renderPage();

    fireEvent.change(screen.getByLabelText(/Filter by vehicle approval status/i), {
      target: { value: "pending" },
    });
    fireEvent.change(screen.getByLabelText(/Filter by document compliance/i), {
      target: { value: "expiring_soon" },
    });

    await waitFor(() => expect(screen.getByText(/2 filters active/i)).toBeInTheDocument());
    expect(screen.getByText("Hyundai Accent")).toBeInTheDocument();
    expect(screen.queryByText("Toyota Corolla")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Reset filters/i }));
    await waitFor(() => expect(screen.getByText("Toyota Corolla")).toBeInTheDocument());
    expect(screen.getByText("Kia Rio")).toBeInTheDocument();
  });

  it("sorts when a column header is clicked", async () => {
    await renderPage();

    fireEvent.click(screen.getByRole("button", { name: /License plate/i }));

    await waitFor(() => {
      const directory = within(screen.getByRole("table", { name: "Vehicle directory" }));
      expect(directory.getByRole("columnheader", { name: /License plate/i })).toHaveAttribute(
        "aria-sort",
        "ascending"
      );
    });
  });

  it("paginates and shows the record count", async () => {
    const many = Array.from({ length: 25 }).map((_, index) =>
      vehicle({
        driver_id: index + 1,
        driver_name: `Driver ${String(index + 1).padStart(2, "0")}`,
        vehicle: { make: "Toyota", model: `M${index + 1}`, plate_number: `P${index + 1}` },
      })
    );
    fetchFleetVehicles.mockResolvedValue({
      data: { ...VEHICLE_PAYLOAD, vehicles: many, count: 25 },
    });

    await renderPage();

    expect(screen.getByText("Driver 01")).toBeInTheDocument();
    expect(screen.queryByText("Driver 11")).not.toBeInTheDocument();
    expect(screen.getByText(/Page 1 of 3/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(screen.getByText(/Page 2 of 3/)).toBeInTheDocument());
    expect(screen.getByText("Driver 11")).toBeInTheDocument();
  });

  it("opens the vehicle details panel with all four sections", async () => {
    await renderPage();

    // Target a specific row so the assertions do not depend on sort order.
    const directory = within(screen.getByRole("table", { name: "Vehicle directory" }));
    const toyotaRow = directory.getByText("Toyota Corolla").closest("tr");
    fireEvent.click(within(toyotaRow).getByRole("button", { name: /View details/i }));

    const drawer = within(await screen.findByRole("region", { name: "Vehicle details" }));

    expect(drawer.getByText("Vehicle information")).toBeInTheDocument();
    expect(drawer.getByText("Assigned driver")).toBeInTheDocument();
    expect(drawer.getByText("Document compliance")).toBeInTheDocument();
    expect(drawer.getByText("Operational status")).toBeInTheDocument();

    // Real values from that row, no invented management actions.
    expect(drawer.getByText("Make")).toBeInTheDocument();
    expect(drawer.getByText("Alternate plate")).toBeInTheDocument();
    expect(drawer.getByText("AB-1234")).toBeInTheDocument();
    expect(drawer.getByText("Toyota")).toBeInTheDocument();
    expect(drawer.getByText(/Documents valid/i)).toBeInTheDocument();
    expect(drawer.getByRole("link", { name: /Open driver management/i })).toHaveAttribute(
      "href",
      "/admin/drivers"
    );
  });

  it("never offers document approval or rejection on this page", async () => {
    await renderPage();
    fireEvent.click(screen.getAllByRole("button", { name: /View details/i })[0]);
    await screen.findByText("Vehicle information");

    expect(screen.queryByRole("button", { name: /^Approve/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Reject/i })).not.toBeInTheDocument();
    // Instead it points at the existing Fleet document center.
    expect(screen.getByRole("link", { name: /Fleet document center/i })).toHaveAttribute(
      "href",
      "/admin/fleet"
    );
  });

  it("lists document expiry alerts from the backend", async () => {
    await renderPage();

    expect(screen.getByText("Document expiry alerts")).toBeInTheDocument();
    // The plate also appears in the directory table, so allow multiple matches.
    expect(screen.getAllByText("5678 CD").length).toBeGreaterThan(1);
    expect(screen.getAllByText("Vignette").length).toBeGreaterThan(0);
  });

  it("exports through the existing fleet report endpoint", async () => {
    await renderPage();

    fireEvent.click(screen.getByRole("button", { name: /Export report/i }));

    await waitFor(() => {
      expect(exportFleetReport).toHaveBeenCalledWith("document_expiration", "csv");
    });
    expect(await screen.findByText(/Exported the document expiration report/i)).toBeInTheDocument();
  });

  it("keeps long driver names from breaking the layout", async () => {
    await renderPage();

    // The full name is retained in the title attribute even when ellipsised in CSS.
    const nodes = screen.getAllByTitle(LONG_DRIVER);
    expect(nodes.length).toBeGreaterThan(0);
    expect(nodes[0]).toHaveTextContent(LONG_DRIVER);
  });

  it("shows an empty state when filters match nothing", async () => {
    await renderPage();

    fireEvent.change(screen.getByLabelText(/Search vehicles by plate, make, model or driver/i), {
      target: { value: "no-such-vehicle-xyz" },
    });

    expect(
      await screen.findByText(/No vehicles match the current filters/i)
    ).toBeInTheDocument();
  });

  it("shows a descriptive empty state when the directory is empty", async () => {
    fetchFleetVehicles.mockResolvedValue({
      data: { ...VEHICLE_PAYLOAD, vehicles: [], count: 0, expiring_documents: [] },
    });

    await renderPage();

    expect(await screen.findByText(/No vehicles are registered yet/i)).toBeInTheDocument();
  });

  it("surfaces a load error with a retry action", async () => {
    fetchFleetVehicles.mockRejectedValue({ response: { data: { detail: "Permission denied" } } });

    render(<VehicleManagementCenter />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Permission denied");
    expect(screen.getByRole("button", { name: /Try again/i })).toBeInTheDocument();
  });

  it("lists operating-city filter options from the shared hook", async () => {
    await renderPage();

    const citySelect = screen.getByLabelText(/Filter by city/i);
    expect(within(citySelect).getByRole("option", { name: "Nouakchott" })).toBeInTheDocument();
    expect(screen.getByText("Toyota Corolla")).toBeInTheDocument();
  });

  it("warns when the directory is truncated by the API row cap", async () => {
    fetchFleetVehicles.mockResolvedValue({
      data: { ...VEHICLE_PAYLOAD, count: 900 },
    });

    await renderPage();

    expect(await screen.findByText(/Partial directory/i)).toBeInTheDocument();
  });
});



