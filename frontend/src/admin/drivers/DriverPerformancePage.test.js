/**
 * Driver Performance Monitoring.
 *
 * Covers the per-view column sets, the fleet KPI derivation from backend counts,
 * the "insufficient data" distinction, and the explicit error states.
 */
jest.mock("../permissions/PermissionContext", () => ({
  usePermissions: () => ({
    canView: () => true,
    canAction: () => true,
    canApprove: () => true,
    canExport: () => true,
  }),
}));

jest.mock("./driverAdminApi", () => {
  const actual = jest.requireActual("./driverAdminApi");
  return {
    ...actual,
    getDriverDirectory: jest.fn(),
    getDriverPerformanceSummary: jest.fn(),
    getSafetyIncidents: jest.fn(),
  };
});

jest.mock("./driversApi", () => {
  const actual = jest.requireActual("./driversApi");
  return {
    ...actual,
    getDriverEarnings: jest.fn(),
    getDriverRideHistory: jest.fn(),
  };
});

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import DriverPerformancePage, { columnsFor } from "./DriverPerformancePage";
import {
  getDriverDirectory,
  getDriverPerformanceSummary,
  getSafetyIncidents,
} from "./driverAdminApi";

const SUMMARY = {
  average_score: 82.5,
  excellent_count: 1,
  watch_count: 1,
  driver_count: 2,
  drivers: [
    {
      driver_id: 10,
      user_id: 1,
      driver_name: "Awa Diallo",
      driver_email: "awa@example.com",
      status: "approved",
      driver_category: "taxi",
      performance_points: 95,
      score: 91,
      score_band: "excellent",
      acceptance_rate: 96.5,
      cancellation_rate: 2.1,
      rating_average: 4.8,
      completed_rides: 240,
      accepted_rides: 250,
      received_rides: 260,
      missed_rides: 4,
      declined_rides: 6,
      cancelled_rides: 5,
      account_risk_flag: false,
      account_under_review: false,
      account_risk_reason: "",
      on_time_rate: 88.0,
      on_time_arrivals: 44,
      arrival_samples: 50,
      recommendation: "Reward",
    },
    {
      driver_id: 11,
      user_id: 2,
      driver_name: "Moussa Kane",
      driver_email: "moussa@example.com",
      status: "approved",
      driver_category: "taxi",
      score: 44,
      score_band: "watch",
      acceptance_rate: 60.0,
      cancellation_rate: 22.5,
      rating_average: 0,
      completed_rides: 3,
      accepted_rides: 5,
      received_rides: 10,
      missed_rides: 2,
      declined_rides: 4,
      cancelled_rides: 2,
      account_risk_flag: true,
      account_under_review: false,
      account_risk_reason: "High cancellation rate",
      on_time_rate: 0,
      on_time_arrivals: 0,
      arrival_samples: 0,
      recommendation: "Review",
    },
  ],
};

const DIRECTORY = [
  {
    id: 10,
    user_id: 1,
    driver_name: "Awa Diallo",
    city_name: "Nouakchott",
    driver_photo: "",
    car_type: "Taxi",
    driver_category_label: "Taxi",
    status: "approved",
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  getDriverPerformanceSummary.mockResolvedValue(SUMMARY);
  getDriverDirectory.mockResolvedValue(DIRECTORY);
  getSafetyIncidents.mockResolvedValue([{ id: 1 }, { id: 2 }]);
});

describe("columnsFor", () => {
  it("exposes activity counters in activity mode", () => {
    const ids = columnsFor("activity", () => {}).map((column) => column.id);
    ["received_rides", "accepted_rides", "declined_rides", "missed_rides", "cancelled_rides"].forEach(
      (id) => expect(ids).toContain(id)
    );
  });

  it("exposes the rating and complaints view in ratings mode", () => {
    const ids = columnsFor("ratings", () => {}).map((column) => column.id);
    expect(ids).toContain("rating_average");
    expect(ids).toContain("account_risk_flag");
    expect(ids).not.toContain("acceptance_rate");
  });

  it("exposes score, acceptance and cancellation in the default mode", () => {
    const ids = columnsFor("performance", () => {}).map((column) => column.id);
    ["acceptance_rate", "cancellation_rate", "on_time_rate", "score", "recommendation"].forEach((id) =>
      expect(ids).toContain(id)
    );
  });

  it("renders 'No data' for on-time when no arrival samples exist, rather than 0%", () => {
    const column = columnsFor("performance", () => {}).find((item) => item.id === "on_time_rate");
    const rendered = column.render({ arrival_samples: 0, on_time_rate: 0 });
    expect(JSON.stringify(rendered)).toContain("No data");
  });

  it("shows a real percentage when arrival samples do exist", () => {
    const column = columnsFor("performance", () => {}).find((item) => item.id === "on_time_rate");
    expect(column.render({ arrival_samples: 10, on_time_rate: 90 })).toBe("90.0%");
  });
});

describe("DriverPerformancePage", () => {
  it("renders fleet KPIs from backend values", async () => {
    render(<DriverPerformancePage mode="performance" />);
    expect(await screen.findByText("Driver Performance")).toBeInTheDocument();
    await screen.findByText("Average score");

    // Read each KPI's value cell directly, so the assertion cannot accidentally
    // match a table cell that happens to hold the same number.
    const kpiValue = (label) =>
      screen.getByText(label).closest(".admin-kpi").querySelector(".admin-kpi__value").textContent;

    // average_score comes straight from the backend summary.
    expect(kpiValue("Average score")).toContain("82.5");
    // 240 + 3 completed rides, summed from the backend per-driver counts.
    expect(kpiValue("Completed rides")).toContain("243");
    // Safety incident count from /safety/admin/incidents/.
    expect(kpiValue("Safety incidents")).toContain("2");
  });

  it("exposes the five performance dropdown filters", async () => {
    render(<DriverPerformancePage mode="performance" />);
    // Wait for data: DataTable renders a skeleton (no filter bar) while loading.
    await screen.findByText("Awa Diallo");
    const filterBar = document.querySelector(".admin-filter-bar");
    expect(filterBar).toBeTruthy();
    const selects = filterBar.querySelectorAll("select");
    expect(selects).toHaveLength(5);
    selects.forEach((select) => expect(select.options.length).toBeGreaterThan(1));
  });

  it("renders backend driver rows without recomputing scores client-side", async () => {
    render(<DriverPerformancePage mode="performance" />);
    expect(await screen.findByText("Awa Diallo")).toBeInTheDocument();
    expect(await screen.findByText("Moussa Kane")).toBeInTheDocument();
    expect(screen.getByText("91")).toBeInTheDocument();
    expect(screen.getByText("Reward")).toBeInTheDocument();
  });

  it("shows the driver profile with the documented scoring note", async () => {
    render(<DriverPerformancePage mode="performance" />);
    const viewButtons = await screen.findAllByRole("button", { name: "View profile" });
    fireEvent.click(viewButtons[0]);
    await waitFor(() => expect(screen.getByText(/performance profile/)).toBeInTheDocument());
    expect(screen.getByText(/never suspend a driver automatically/)).toBeInTheDocument();
  });

  it("reports a performance failure instead of rendering fabricated numbers", async () => {
    getDriverPerformanceSummary.mockRejectedValue(new Error("Request failed (HTTP 500)."));
    render(<DriverPerformancePage mode="performance" />);
    expect(await screen.findByText(/Performance: Request failed \(HTTP 500\)\./)).toBeInTheDocument();
  });

  it("keeps the console usable when only the safety subsystem fails", async () => {
    getSafetyIncidents.mockRejectedValue(new Error("Safety offline."));
    render(<DriverPerformancePage mode="performance" />);
    expect(
      await screen.findByText(/Safety incidents unavailable: Safety offline\./)
    ).toBeInTheDocument();
    expect(await screen.findByText("Awa Diallo")).toBeInTheDocument();
  });
});
