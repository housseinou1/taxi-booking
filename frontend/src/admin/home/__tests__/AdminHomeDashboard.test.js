/**
 * Component tests for AdminHomeDashboard.
 *
 * Cover: loading, real values, honest empty states, API error + retry,
 * and embedded-vs-standalone chrome.
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";

import AdminHomeDashboard from "../AdminHomeDashboard";
import useAdminHomeData from "../useAdminHomeData";

jest.mock("../useAdminHomeData", () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock("../../permissions/PermissionContext", () => ({
  useOptionalPermissions: () => ({
    canView: () => false,
    hasFeature: () => false,
  }),
}));

const NO_DATA_LABEL = "Not enough data yet";

/** A fully-populated, verified-shape data payload. */
function loaded(overrides = {}) {
  return {
    loading: false,
    error: null,
    kpis: [
      { key: "completed_rides", label: "Completed Rides", value: 55, trend: null, sparkline: [], tone: "amber" },
      { key: "completed_deliveries", label: "Completed Deliveries", value: 17, trend: null, sparkline: [], tone: "blue" },
      {
        key: "gross_revenue",
        label: "Total Revenue",
        value: 21090.17,
        suffix: "MRU",
        trend: null,
        sparkline: [0.2, 0.6, 1],
        tone: "cyan",
      },
      { key: "active_drivers", label: "Active Drivers", value: 95, trend: null, sparkline: [], tone: "green" },
      { key: "active_riders", label: "Active Customers", value: 136, trend: null, sparkline: [], tone: "purple" },
    ],
    financeChart: [
      { date: "2026-11-01", label: "Nov 01", revenue: 100 },
      { date: "2026-11-02", label: "Nov 02", revenue: 200 },
    ],
    ordersMix: { total: 72, rides: 55, deliveries: 17, ridesPct: 76.4, delPct: 23.6 },
    orderStatusToday: [
      { key: "ongoing", label: "Ongoing", value: 6, hint: "" },
      { key: "completed_today", label: "Completed", value: 42, hint: "" },
      { key: "scheduled", label: "Scheduled", value: 5, hint: "" },
      { key: "cancelled", label: "Cancelled", value: 1, hint: "" },
    ],
    operationsPipeline: [
      { key: "ongoing", label: "Ongoing", value: 8 },
      { key: "completed", label: "Completed", value: 55 },
    ],
    cityPerformance: [{ id: 1, name: "Nouakchott", revenue: 1000, pct: 68 }],
    executiveMeta: { period: "daily", start_date: "2026-11-01", end_date: "2026-11-05" },
    today: { new_rides: 0, new_deliveries: 0, new_registrations: null, open_safety_reports: 0 },
    pending: { pending_drivers: 8, pending_riders: 0, pending_couriers: 2 },
    activity: [{ text: "Ride #85 - cancelled", meta: "2026-07-24T14:50:17Z", tone: "ok" }],
    health: [{ name: "API Services", status: "ok", ok: true, label: "ok" }],
    alerts: [],
    approvals: {},
    generatedAt: "2026-11-05T16:55:08Z",
    live: {
      connected: false,
      pollMs: 30000,
      lastUpdatedAt: "2026-11-05T16:55:08Z",
      serverGeneratedAt: "2026-11-05T16:55:08Z",
    },
    refreshing: false,
    reload: jest.fn(),
    ...overrides,
  };
}

const EMPTY_KPIS = loaded().kpis.map((k) => ({ ...k, value: null }));

afterEach(() => jest.clearAllMocks());

describe("loading", () => {
  it("shows a loading state and no KPI figures", () => {
    useAdminHomeData.mockReturnValue({
      loading: true,
      error: null,
      kpis: [],
      financeChart: [],
      ordersMix: null,
      operationsPipeline: [],
      cityPerformance: [],
      today: {},
      pending: {},
      activity: [],
      health: [],
    });
    render(<AdminHomeDashboard embedded />);
    expect(screen.queryByText("136")).toBeNull();
  });
});

describe("real values", () => {
  beforeEach(() => useAdminHomeData.mockReturnValue(loaded()));

  it("renders headline KPI figures from the API", () => {
    render(<AdminHomeDashboard embedded />);
    expect(screen.getByText("136")).toBeTruthy();
    expect(screen.getByText("95")).toBeTruthy();
    expect(screen.getAllByText("55").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("17")).toBeTruthy();
  });

  it("formats revenue with thousands separators and the MRU suffix", () => {
    render(<AdminHomeDashboard embedded />);
    expect(screen.getByText(/21,090\.17/)).toBeTruthy();
    expect(screen.getAllByText(/MRU/).length).toBeGreaterThan(0);
  });

  it("labels executive KPI tiles", () => {
    render(<AdminHomeDashboard embedded />);
    ["Completed Rides", "Completed Deliveries", "Total Revenue", "Active Drivers", "Active Customers"].forEach((l) =>
      expect(screen.getByText(l)).toBeTruthy()
    );
  });

  it("renders the operations console title", () => {
    render(<AdminHomeDashboard embedded />);
    expect(screen.getByText("Operations Console")).toBeTruthy();
  });

  it("renders recent activity from the timeline", () => {
    render(<AdminHomeDashboard embedded />);
    expect(screen.getByText("Ride #85 - cancelled")).toBeTruthy();
  });

  it("never claims a trend it cannot compute on tiles without a revenue series", () => {
    render(<AdminHomeDashboard embedded />);
    expect(screen.getAllByText(/Trend unavailable/).length).toBeGreaterThan(0);
  });

  it("shows the executive three-column chart row and order status column when embedded", () => {
    const { container } = render(<AdminHomeDashboard embedded />);
    expect(screen.getByText("Order status today")).toBeTruthy();
    expect(container.querySelector(".yah-cols--charts.yah-cols--3")).toBeTruthy();
  });
});

describe("empty states", () => {
  it("shows the honest no-data label when every KPI is null", () => {
    useAdminHomeData.mockReturnValue(
      loaded({ kpis: EMPTY_KPIS, activity: [], today: {}, financeChart: [], ordersMix: null, cityPerformance: [] })
    );
    render(<AdminHomeDashboard embedded />);
    expect(screen.getAllByText(NO_DATA_LABEL).length).toBeGreaterThan(0);
  });

  it("shows no-data rather than a fabricated zero for registrations", () => {
    useAdminHomeData.mockReturnValue(loaded());
    render(<AdminHomeDashboard embedded />);
    expect(screen.getByText(/New Registrations/)).toBeTruthy();
    expect(screen.getAllByText(NO_DATA_LABEL).length).toBeGreaterThan(0);
  });

  it("shows an empty activity state when the timeline is empty", () => {
    useAdminHomeData.mockReturnValue(loaded({ activity: [] }));
    render(<AdminHomeDashboard embedded />);
    expect(screen.getByText("Recent Activity")).toBeTruthy();
    expect(screen.getAllByText(NO_DATA_LABEL).length).toBeGreaterThan(0);
  });
});

describe("error handling", () => {
  it("surfaces the API error and offers a retry", () => {
    const reload = jest.fn();
    useAdminHomeData.mockReturnValue(loaded({ error: "Could not reach the YALA API.", reload }));
    render(<AdminHomeDashboard embedded />);
    expect(screen.getByText("Could not reach the YALA API.")).toBeTruthy();
    fireEvent.click(screen.getByText("Retry"));
    expect(reload).toHaveBeenCalled();
  });
});

describe("navigation", () => {
  it("navigates to the audit log from Recent Activity", () => {
    const onNavigate = jest.fn();
    useAdminHomeData.mockReturnValue(loaded());
    render(<AdminHomeDashboard embedded onNavigate={onNavigate} />);
    fireEvent.click(screen.getByText(/View audit log/));
    expect(onNavigate).toHaveBeenCalledWith("/admin/security/audit");
  });
});

describe("embedded vs standalone", () => {
  beforeEach(() => useAdminHomeData.mockReturnValue(loaded()));

  it("embedded hides the standalone header and sidebar", () => {
    const { container } = render(<AdminHomeDashboard embedded />);
    expect(container.querySelector(".yah-top")).toBeNull();
    expect(container.querySelector(".yah-side")).toBeNull();
  });

  it("standalone renders its own header and sidebar", () => {
    const { container } = render(<AdminHomeDashboard />);
    expect(container.querySelector(".yah-top")).toBeTruthy();
    expect(container.querySelector(".yah-side")).toBeTruthy();
  });

  it("shows the signed-in user's name", () => {
    render(<AdminHomeDashboard user={{ first_name: "Housseinou", last_name: "Sakho" }} />);
    expect(screen.getAllByText(/Housseinou Sakho/).length).toBeGreaterThanOrEqual(1);
  });
});
