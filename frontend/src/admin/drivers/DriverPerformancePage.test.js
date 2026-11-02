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
import { getDriverEarnings, getDriverRideHistory } from "./driversApi";

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

/**
 * Driver Performance profile — earnings, charts, history and the date range.
 *
 * The date-range assertion matters: the ride-history endpoint applies date_from /
 * date_to server-side, so this proves the selector is wired to the API rather than
 * silently filtering a client-side slice.
 */
const EARNINGS = {
  today: { earnings_mru: "150.00", commission_mru: "25.00", payout_mru: "150.00", ride_count: 2 },
  week: { earnings_mru: "900.00", commission_mru: "150.00", payout_mru: "900.00", ride_count: 11 },
  month: { earnings_mru: "4100.00", commission_mru: "700.00", payout_mru: "4100.00", ride_count: 48 },
  total: {
    earnings_mru: "91200.00",
    commission_mru: "15800.00",
    payout_mru: "91200.00",
    ride_count: 1204,
  },
  currency: "MRU",
};

const rideAt = (daysAgo) => {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString();
};

const HISTORY = {
  count: 2,
  page: 1,
  page_size: 100,
  total_pages: 1,
  summary: {
    total_rides: 10,
    completed_rides: 7,
    cancelled_rides: 2,
    total_earnings_mru: "91200.00",
    average_earning_mru: "76.00",
  },
  results: [
    {
      id: 501,
      status: "completed",
      fare: "200.00",
      driver_earning: "160.00",
      rating: 5,
      created_at: rideAt(0),
      completed_at: rideAt(0),
    },
    {
      id: 502,
      status: "cancelled",
      fare: "150.00",
      driver_earning: null,
      rating: null,
      created_at: rideAt(1),
      completed_at: null,
    },
  ],
};

const openProfile = async () => {
  render(<DriverPerformancePage mode="performance" />);
  const viewButtons = await screen.findAllByRole("button", { name: "View profile" });
  fireEvent.click(viewButtons[0]);
  await waitFor(() => expect(screen.getByText(/performance profile/)).toBeInTheDocument());
};

describe("DriverPerformanceProfile", () => {
  beforeEach(() => {
    getDriverEarnings.mockResolvedValue(EARNINGS);
    getDriverRideHistory.mockResolvedValue(HISTORY);
  });

  it("renders real earnings buckets instead of a raw payload", async () => {
    await openProfile();
    await screen.findByText("Earnings today");

    // Read the KPI value cell directly: the same number can legitimately appear in
    // the ride-history table too.
    const kpiValue = (label) =>
      screen.getByText(label).closest(".admin-kpi").querySelector(".admin-kpi__value").textContent;

    expect(kpiValue("Earnings today")).toContain("150 MRU");
    expect(kpiValue("This month")).toContain("4,100 MRU");
    expect(kpiValue("All-time earnings")).toContain("91,200 MRU");
  });

  it("renders the chart set built from backend data", async () => {
    await openProfile();
    expect(await screen.findByText("Driver earnings by period (MRU)")).toBeInTheDocument();
    expect(screen.getByText("Platform commission by period (MRU)")).toBeInTheDocument();
    expect(screen.getByText(/Completed trips — last 14 days/)).toBeInTheDocument();
    expect(screen.getByText("Average customer rating over time")).toBeInTheDocument();
    expect(screen.getByText("Ride outcomes (lifetime)")).toBeInTheDocument();
  });

  it("renders the ride history table with real fares, earnings and ratings", async () => {
    await openProfile();
    expect(await screen.findByText("Ride history")).toBeInTheDocument();
    expect(await screen.findByText(/160 MRU/)).toBeInTheDocument();
    expect(screen.getByText("5.0 / 5")).toBeInTheDocument();
    expect(screen.getByText("Not rated")).toBeInTheDocument();
  });

  it("applies the date range server-side through the history API", async () => {
    await openProfile();
    await waitFor(() => expect(getDriverRideHistory).toHaveBeenCalled());

    const dateInputs = document.querySelectorAll('input[type="date"]');
    expect(dateInputs.length).toBeGreaterThanOrEqual(2);
    fireEvent.change(dateInputs[0], { target: { value: "2026-01-01" } });
    fireEvent.change(dateInputs[1], { target: { value: "2026-01-31" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() =>
      expect(getDriverRideHistory).toHaveBeenCalledWith(
        10,
        expect.objectContaining({ date_from: "2026-01-01", date_to: "2026-01-31" })
      )
    );
  });

  it("shows an inline error when earnings cannot be loaded", async () => {
    getDriverEarnings.mockRejectedValue(new Error("Request failed (HTTP 500)."));
    await openProfile();
    expect(await screen.findByText(/Request failed \(HTTP 500\)\./)).toBeInTheDocument();
  });

  it("discloses when the charts are limited by pagination", async () => {
    // 437 matching rides but only the first page is returned.
    getDriverRideHistory.mockResolvedValue({ ...HISTORY, count: 437 });
    await openProfile();

    expect(
      await screen.findByText("These charts cover only part of this driver's history")
    ).toBeInTheDocument();
    // The exact window must be stated, not implied.
    expect(screen.getByText("437")).toBeInTheDocument();
    expect(screen.getAllByText(/Partial window/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Narrow the date range below/)).toBeInTheDocument();
  });

  it("states the full window when nothing is truncated", async () => {
    await openProfile();
    expect(await screen.findByText(/Built from all 2 rides/)).toBeInTheDocument();
    expect(
      screen.queryByText("These charts cover only part of this driver's history")
    ).not.toBeInTheDocument();
    expect(screen.getAllByText(/All 2 rides in this filter/).length).toBeGreaterThan(0);
  });

  it("reports missing money values as 'No data' rather than 0", async () => {
    getDriverEarnings.mockResolvedValue({
      ...EARNINGS,
      today: { earnings_mru: null, commission_mru: null, ride_count: 0 },
    });
    await openProfile();
    expect((await screen.findAllByText("No data")).length).toBeGreaterThan(0);
  });
});

