import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

import FleetPerformanceCenter from "./FleetPerformanceCenter";
import {
  assignFleetTraining,
  exportFleetReport,
  fetchFleetDashboard,
  fetchFleetVehicles,
  notifyFleetDriver,
  reactivateFleetDriver,
  suspendFleetDriver,
} from "./fleetApi";

jest.mock("../layouts/useOperatingCityOptions", () => ({
  useOperatingCityOptions: () => ({
    options: [
      { value: "", label: "All cities" },
      { value: "3", label: "Nouakchott — Nouakchott" },
    ],
    loading: false,
    error: null,
    reload: jest.fn(),
  }),
}));

jest.mock("./fleetApi", () => {
  const actual = jest.requireActual("./fleetApi");
  return {
    ...actual,
    fetchFleetDashboard: jest.fn(),
    fetchFleetVehicles: jest.fn(),
    exportFleetReport: jest.fn(),
    suspendFleetDriver: jest.fn(),
    reactivateFleetDriver: jest.fn(),
    notifyFleetDriver: jest.fn(),
    assignFleetTraining: jest.fn(),
    approveFleetDocument: jest.fn(),
    rejectFleetDocument: jest.fn(),
  };
});

/** Long name included on purpose to exercise ellipsis/overflow handling. */
const LONG_NAME =
  "Abdallahi Mohamed El Moustapha Ould Cheikh Ahmed Vall Ould Mohamed Lemine";

function driver(overrides = {}) {
  return {
    driver_id: 1,
    user_id: 11,
    driver_name: "Amadou Diallo",
    driver_email: "amadou@example.com",
    status: "approved",
    current_status: "online",
    score: 92,
    score_band: "excellent",
    acceptance_rate: 96.5,
    cancellation_rate: 2.1,
    rating_average: 4.8,
    completion_rate: 98,
    total_trips: 240,
    completed_rides: 240,
    cancelled_rides: 5,
    revenue_today: "1200.00",
    revenue_week: "8400.00",
    revenue_month: "36000.00",
    wallet_balance: "5000.00",
    last_online: "2026-10-28T10:00:00Z",
    badges: ["top_performer"],
    is_suspended: false,
    ...overrides,
  };
}

const DASHBOARD = {
  generated_at: "2026-10-28T10:00:00Z",
  overview: {
    total_registered: 62,
    approved_drivers: 58,
    online_drivers: 12,
    busy_drivers: 7,
    offline_drivers: 39,
    suspended_drivers: 3,
    expired_document_drivers: 4,
    active_trips: 7,
    waiting_riders: 5,
  },
  map: {
    live_map: { markers: { drivers: [{ id: 1, lat: 18.07, lng: -15.95, kind: "driver" }] } },
    heat_map: { points: [{ lat: 18.08, lng: -15.96, intensity: 0.6, label: "Centre" }] },
    busy_zones: [
      { lat: 18.07, lng: -15.95, label: "Sebkha", waiting_riders: 4, drivers_nearby: 1 },
    ],
    low_coverage_zones: [
      { lat: 18.09, lng: -15.97, label: "Toujounine", demand_supply_ratio: 3.5 },
    ],
  },
  drivers: [
    driver({ driver_id: 1, user_id: 11, score: 92, score_band: "excellent" }),
    driver({
      driver_id: 2,
      user_id: 12,
      driver_name: LONG_NAME,
      driver_email: "long.name@example.com",
      score: 45,
      score_band: "risk",
      status: "pending",
      current_status: "offline",
      cancellation_rate: 22.4,
      total_trips: 12,
      completed_rides: 12,
      cancelled_rides: 9,
      revenue_month: "900.00",
    }),
  ],
  documents: {
    generated_at: "2026-10-28T10:00:00Z",
    summary: {
      valid: 30,
      expired: 4,
      expiring_30d: 9,
      expiring_15d: 5,
      expiring_7d: 3,
      expiring_1d: 1,
    },
    buckets: {
      valid: [
        {
          id: 1,
          driver_email: "amadou@example.com",
          document_label: "Insurance",
          expires_at: "2027-05-01",
          days_remaining: 180,
        },
      ],
      expired: [
        {
          id: 2,
          driver_email: "long.name@example.com",
          document_label: "Registration",
          expires_at: "2026-09-01",
          days_remaining: -57,
        },
      ],
      expiring_30d: [],
      expiring_15d: [],
      expiring_7d: [],
      expiring_1d: [],
    },
    reminder_windows: [30, 15, 7, 1],
  },
  ceo: {
    generated_at: "2026-10-28T10:00:00Z",
    top_drivers: [
      driver({ driver_id: 1, score: 92, score_band: "excellent" }),
      driver({
        driver_id: 2,
        driver_name: LONG_NAME,
        score: 88,
        score_band: "strong",
        revenue_month: "41000.00",
      }),
    ],
    lowest_drivers: [
      driver({
        driver_id: 2,
        driver_name: LONG_NAME,
        score: 45,
        score_band: "risk",
        cancellation_rate: 22.4,
        status: "pending",
      }),
    ],
    revenue_by_driver: [{ driver_id: 1, name: "Amadou Diallo", revenue_month: "36000.00", trips: 240 }],
    revenue_by_city: [
      {
        city_id: 3,
        city_name: "Nouakchott",
        driver_count: 40,
        revenue_month: "500000.00",
        online_now: 10,
      },
    ],
    fleet_utilization_pct: 20.7,
    average_earnings_month: "21000.00",
    acceptance_trend: { current_avg: 88.4, label: "Fleet acceptance points (7d snapshot)" },
    cancellation_trend: { current_pct: 6.2, previous_pct: 4.8, direction: "up" },
  },
};

const VEHICLES = {
  today: "2026-10-28",
  expiry_alert_days: 30,
  count: 2,
  vehicles: [
    {
      driver_id: 1,
      driver_name: "Amadou Diallo",
      driver_status: "approved",
      vehicle: { make: "Toyota", model: "Corolla", plate_number: "1234 AB" },
      documents: { registration: "ok", insurance: "ok", vignette: "ok", licence: "ok" },
    },
    {
      driver_id: 2,
      driver_name: LONG_NAME,
      driver_status: "pending",
      vehicle: { make: "Hyundai", model: "Accent", plate_number: "5678 CD" },
      documents: {
        registration: "expired",
        insurance: "ok",
        vignette: "expiring_soon",
        licence: "missing",
      },
    },
  ],
  expiring_documents: [],
  note: "Derived from DriverProfile vehicle fields.",
};

beforeEach(() => {
  jest.clearAllMocks();
  fetchFleetDashboard.mockResolvedValue({ data: DASHBOARD });
  fetchFleetVehicles.mockResolvedValue({ data: VEHICLES });
  exportFleetReport.mockResolvedValue({ data: new Blob(["a,b"]) });
  suspendFleetDriver.mockResolvedValue({ data: {} });
  reactivateFleetDriver.mockResolvedValue({ data: {} });
  notifyFleetDriver.mockResolvedValue({ data: {} });
  assignFleetTraining.mockResolvedValue({ data: {} });
  window.URL.createObjectURL = jest.fn(() => "blob:mock");
  window.URL.revokeObjectURL = jest.fn();
});

async function renderCenter() {
  const utils = render(<FleetPerformanceCenter />);
  // Wait for post-load content: the tab bar only renders once the dashboard has
  // resolved, so this avoids asserting against the loading skeleton.
  await screen.findByRole("button", { name: "Fleet Overview" });
  return utils;
}

function openTab(label) {
  fireEvent.click(screen.getByRole("button", { name: label }));
}

/** The KPI card that contains the given label — lets value assertions stay unambiguous. */
function kpi(label) {
  // Scope to KPI labels: the same words also appear as table status pills.
  const [node] = screen.getAllByText(label, { selector: ".fleet-kpi__label" });
  const card = node?.closest(".fleet-kpi");
  if (!card) throw new Error(`No KPI card found for "${label}"`);
  return within(card);
}


describe("FleetPerformanceCenter", () => {
  it("renders the header, all five tabs and the filter toolbar", async () => {
    await renderCenter();

    expect(
      screen.getByRole("heading", { level: 1, name: /Fleet & Driver Performance Center/i })
    ).toBeInTheDocument();

    ["Fleet Overview", "Driver Performance", "Documents", "CEO Dashboard", "Reports"].forEach(
      (label) => {
        expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
      }
    );

    expect(screen.getByLabelText(/Search drivers by name, email or phone/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Filter by city/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Filter by approval status/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Filter by activity status/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Revenue period/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Refresh/i })).toBeInTheDocument();
  });

  it("shows real overview counters and marks unsupported metrics as unavailable", async () => {
    await renderCenter();

    expect(kpi("Total registered (taxi)").getByText("62")).toBeInTheDocument();
    expect(kpi("Approved (taxi)").getByText("58")).toBeInTheDocument();
    expect(kpi("Online (taxi)").getByText("12")).toBeInTheDocument();
    expect(kpi("Completing trips").getByText("7")).toBeInTheDocument();
    expect(kpi("Waiting riders").getByText("5")).toBeInTheDocument();

    // The brief asked for pending approvals; the API does not expose it.
    expect(screen.getByText("Pending approvals")).toBeInTheDocument();
    expect(kpi("Pending approvals").getByText("Not available")).toBeInTheDocument();
  });

  it("renders vehicle metrics derived from the vehicles directory", async () => {
    await renderCenter();

    expect(screen.getByText("Registered vehicles")).toBeInTheDocument();
    expect(screen.getByText("Road-legal vehicles")).toBeInTheDocument();
    expect(screen.getByText("Awaiting approval")).toBeInTheDocument();
    expect(fetchFleetVehicles).toHaveBeenCalledWith({ limit: 500 });
  });

  it("joins vehicle details into the fleet roster", async () => {
    await renderCenter();

    expect(screen.getByText("Toyota Corolla")).toBeInTheDocument();
    expect(screen.getByText("1234 AB")).toBeInTheDocument();
    expect(screen.getByText("Hyundai Accent")).toBeInTheDocument();
  });

  it("filters the roster by search text", async () => {
    await renderCenter();

    expect(screen.getByText("Amadou Diallo")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Search drivers by name, email or phone/i), {
      target: { value: "long.name" },
    });

    await waitFor(() => {
      expect(screen.queryByText("Amadou Diallo")).not.toBeInTheDocument();
    });
    expect(screen.getByTitle(LONG_NAME)).toBeInTheDocument();
  });

  it("filters the roster by approval status", async () => {
    await renderCenter();

    fireEvent.change(screen.getByLabelText(/Filter by approval status/i), {
      target: { value: "pending" },
    });

    await waitFor(() => {
      expect(screen.queryByText("Amadou Diallo")).not.toBeInTheDocument();
    });
    expect(screen.getByTitle(LONG_NAME)).toBeInTheDocument();
  });

  it("filters the roster by activity status", async () => {
    await renderCenter();

    fireEvent.change(screen.getByLabelText(/Filter by activity status/i), {
      target: { value: "offline" },
    });

    await waitFor(() => {
      expect(screen.queryByText("Amadou Diallo")).not.toBeInTheDocument();
    });
  });

  it("re-fetches the dashboard when city filter changes and on Refresh", async () => {
    await renderCenter();
    expect(fetchFleetDashboard).toHaveBeenCalledWith({});

    fireEvent.change(screen.getByLabelText(/Filter by city/i), { target: { value: "3" } });

    await waitFor(() => {
      expect(fetchFleetDashboard).toHaveBeenCalledWith({ city_id: "3" });
    });

    const refreshButton = screen.getByRole("button", { name: /Refresh/i });
    // The control is disabled while a request is in flight, so wait for it to settle.
    await waitFor(() => expect(refreshButton).not.toBeDisabled());

    const callsBefore = fetchFleetDashboard.mock.calls.length;
    fireEvent.click(refreshButton);
    await waitFor(() => {
      expect(fetchFleetDashboard.mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });

  it("sorts the roster when a column header is clicked", async () => {
    await renderCenter();

    const tripsHeader = screen.getByRole("button", { name: /Trips/i });
    fireEvent.click(tripsHeader);

    await waitFor(() => {
      expect(screen.getByRole("columnheader", { name: /Trips/i })).toHaveAttribute(
        "aria-sort",
        "descending"
      );
    });
  });

  it("paginates the roster", async () => {
    const many = Array.from({ length: 25 }).map((_, index) =>
      driver({
        driver_id: index + 1,
        user_id: 100 + index,
        driver_name: `Driver ${String(index + 1).padStart(2, "0")}`,
        driver_email: `driver${index + 1}@example.com`,
      })
    );
    fetchFleetDashboard.mockResolvedValue({ data: { ...DASHBOARD, drivers: many } });

    await renderCenter();

    expect(screen.getByText("Driver 01")).toBeInTheDocument();
    expect(screen.queryByText("Driver 11")).not.toBeInTheDocument();
    expect(screen.getByText(/Page 1 of 3/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() => {
      expect(screen.getByText(/Page 2 of 3/)).toBeInTheDocument();
    });
    expect(screen.getByText("Driver 11")).toBeInTheDocument();
  });

  it("shows the driver performance table with the requested columns", async () => {
    await renderCenter();
    openTab("Driver Performance");

    expect(await screen.findByText("Performance summary")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Driver name/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Acceptance/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cancellation/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Rating/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Score/i })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /View details/i }).length).toBeGreaterThan(0);
  });

  it("opens the driver drawer and calls the existing driver actions", async () => {
    await renderCenter();

    fireEvent.click(screen.getAllByRole("button", { name: /Details/i })[0]);
    expect(await screen.findByText("Wallet balance")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Suspend driver/i }));
    await waitFor(() => {
      expect(suspendFleetDriver).toHaveBeenCalledWith(11);
    });
  });

  it("lists document buckets and documents the review-queue gap", async () => {
    await renderCenter();
    openTab("Documents");

    expect(await screen.findByText("Document compliance")).toBeInTheDocument();
    expect(
      screen.getByText(/Pending verification and rejected documents are not available/i)
    ).toBeInTheDocument();
    expect(screen.getByText("Insurance")).toBeInTheDocument();
    expect(screen.getByText("Registration")).toBeInTheDocument();
    // "Expired" appears both as a queue heading and as a status pill.
    expect(screen.getAllByText("Expired").length).toBeGreaterThan(0);
  });

  it("renders the four CEO KPI cards with only real comparisons", async () => {
    await renderCenter();
    openTab("CEO Dashboard");

    expect(await screen.findByText("CEO fleet metrics")).toBeInTheDocument();
    expect(screen.getByText("Fleet utilisation")).toBeInTheDocument();
    expect(screen.getByText("Average monthly earnings")).toBeInTheDocument();
    expect(screen.getByText("Acceptance trend")).toBeInTheDocument();
    expect(screen.getByText("Cancellation trend")).toBeInTheDocument();

    // Cancellation has a real previous period; the others must say so.
    expect(screen.getByText(/Previous period 4.8%/)).toBeInTheDocument();
    expect(screen.getAllByText(/No previous-period comparison/i).length).toBe(2);
  });

  it("renders both CEO ranking tables and handles long driver names", async () => {
    await renderCenter();
    openTab("CEO Dashboard");

    expect(await screen.findByText("Top 20 drivers")).toBeInTheDocument();
    expect(screen.getByText("Lowest-performing drivers")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /View all/i })).toBeInTheDocument();

    // Long names are ellipsised in CSS but keep the full value in the title attribute.
    const longNameNodes = screen.getAllByTitle(LONG_NAME);
    expect(longNameNodes.length).toBeGreaterThan(0);
    expect(longNameNodes[0]).toHaveTextContent(LONG_NAME);
  });

  it("jumps to the performance tab from the View all button", async () => {
    await renderCenter();
    openTab("CEO Dashboard");

    fireEvent.click(await screen.findByRole("button", { name: /View all/i }));
    expect(await screen.findByText("Performance summary")).toBeInTheDocument();
  });

  it("lists every supported report and exports through the existing endpoint", async () => {
    await renderCenter();
    openTab("Reports");

    expect(await screen.findByText("Fleet reports")).toBeInTheDocument();
    expect(screen.getByText("Daily Fleet Report")).toBeInTheDocument();
    expect(screen.getByText("Weekly Driver Report")).toBeInTheDocument();
    expect(screen.getByText("Performance Rankings")).toBeInTheDocument();
    expect(screen.getByText("Monthly Revenue Report")).toBeInTheDocument();
    expect(screen.getByText("Document Expiration Report")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: /Export CSV/i })[0]);
    await waitFor(() => {
      expect(exportFleetReport).toHaveBeenCalledWith("daily_fleet", "csv");
    });
  });

  it("documents unsupported report families instead of faking them", async () => {
    await renderCenter();
    openTab("Reports");

    expect(await screen.findByText("Report coverage gaps")).toBeInTheDocument();
    expect(screen.getByText(/Trip activity/)).toBeInTheDocument();
    expect(screen.getByText(/Cancellation analysis/)).toBeInTheDocument();
    expect(screen.getByText(/Vehicle activity/)).toBeInTheDocument();
    expect(screen.getByText(/Date-range filtering/)).toBeInTheDocument();
  });

  it("surfaces a dashboard error with a retry action", async () => {
    fetchFleetDashboard.mockRejectedValue({ response: { data: { detail: "Permission denied" } } });

    render(<FleetPerformanceCenter />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Permission denied");
    expect(screen.getByRole("button", { name: /Try again/i })).toBeInTheDocument();
  });

  it("keeps rendering when the vehicle directory fails", async () => {
    fetchFleetVehicles.mockRejectedValue({ message: "vehicles down" });

    await renderCenter();

    // Dashboard content still renders; only the vehicle block reports the failure.
    expect(screen.getByText("Total registered (taxi)")).toBeInTheDocument();
    expect(await screen.findByText("vehicles down")).toBeInTheDocument();
  });
});




