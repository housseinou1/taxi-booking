/**
 * Component tests for AdminHomeDashboard.
 *
 * Cover: loading, real values, honest empty states, API error + retry,
 * Quick Access navigation, and embedded-vs-standalone chrome.
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";

import AdminHomeDashboard from "../AdminHomeDashboard";
import useAdminHomeData from "../useAdminHomeData";

jest.mock("../useAdminHomeData", () => ({
  __esModule: true,
  default: jest.fn(),
}));

const NO_DATA_LABEL = "Not enough data yet";

/** A fully-populated, verified-shape data payload. */
function loaded(overrides = {}) {
  return {
    loading: false,
    error: null,
    kpis: [
      { key: "riders", label: "Total Riders", value: 136, trend: null, tone: "green" },
      { key: "drivers", label: "Total Drivers", value: 95, trend: null, tone: "blue" },
      { key: "delivery", label: "Delivery Drivers", value: 21, trend: null, tone: "purple" },
      { key: "completed", label: "Completed Rides", value: 55, trend: null, tone: "amber" },
      { key: "revenue", label: "Total Revenue", value: 21090.17, suffix: "MRU", trend: null, tone: "cyan" },
      { key: "active", label: "Active Rides", value: 0, trend: null, tone: "green", live: true },
    ],
    today: { new_rides: 0, new_deliveries: 0, new_registrations: null, open_safety_reports: 0 },
    pending: { pending_drivers: 8, pending_riders: 0, pending_couriers: 2 },
    activity: [{ text: "Ride #85 - cancelled", meta: "2026-07-24T14:50:17Z", tone: "ok" }],
    health: [{ name: "API Service", status: "ok", ok: true, label: "ok" }],
    alerts: [],
    approvals: {},
    generatedAt: "2026-11-05T16:55:08Z",
    reload: jest.fn(),
    ...overrides,
  };
}

const EMPTY_KPIS = [
  { key: "riders", label: "Total Riders", value: null, trend: null, tone: "green" },
  { key: "drivers", label: "Total Drivers", value: null, trend: null, tone: "blue" },
  { key: "delivery", label: "Delivery Drivers", value: null, trend: null, tone: "purple" },
  { key: "completed", label: "Completed Rides", value: null, trend: null, tone: "amber" },
  { key: "revenue", label: "Total Revenue", value: null, suffix: "MRU", trend: null, tone: "cyan" },
  { key: "active", label: "Active Rides", value: null, trend: null, tone: "green", live: true },
];

afterEach(() => jest.clearAllMocks());

// ── loading ──────────────────────────────────────────────────────────────────

describe("loading", () => {
  it("shows a loading state and no KPI figures", () => {
    useAdminHomeData.mockReturnValue({
      loading: true, error: null, kpis: [], today: {}, pending: {}, activity: [], health: [],
    });
    render(<AdminHomeDashboard embedded />);
    expect(screen.queryByText("136")).toBeNull();
  });
});

// ── real values ──────────────────────────────────────────────────────────────

describe("real values", () => {
  beforeEach(() => useAdminHomeData.mockReturnValue(loaded()));

  it("renders every KPI figure from the API", () => {
    render(<AdminHomeDashboard embedded />);
    expect(screen.getByText("136")).toBeTruthy();
    expect(screen.getByText("95")).toBeTruthy();
    expect(screen.getByText("21")).toBeTruthy();
    expect(screen.getByText("55")).toBeTruthy();
  });

  it("formats revenue with thousands separators and the MRU suffix", () => {
    render(<AdminHomeDashboard embedded />);
    expect(screen.getByText(/21,090\.17/)).toBeTruthy();
    expect(screen.getByText(/MRU/)).toBeTruthy();
  });

  it("labels every KPI", () => {
    render(<AdminHomeDashboard embedded />);
    ["Total Riders", "Total Drivers", "Delivery Drivers", "Completed Rides", "Total Revenue", "Active Rides"]
      .forEach((l) => expect(screen.getByText(l)).toBeTruthy());
  });

  it("renders recent activity from the timeline", () => {
    render(<AdminHomeDashboard embedded />);
    expect(screen.getByText("Ride #85 - cancelled")).toBeTruthy();
  });

  it("never claims a trend it cannot compute", () => {
    render(<AdminHomeDashboard embedded />);
    expect(screen.getAllByText(/Trend unavailable/).length).toBeGreaterThan(0);
  });
});


// ── empty states ─────────────────────────────────────────────────────────────

describe("empty states", () => {
  it("shows the honest no-data label when every KPI is null", () => {
    useAdminHomeData.mockReturnValue(loaded({ kpis: EMPTY_KPIS, activity: [], today: {} }));
    render(<AdminHomeDashboard embedded />);
    expect(screen.getAllByText(NO_DATA_LABEL).length).toBeGreaterThan(0);
  });

  it("shows no-data rather than a fabricated zero for registrations", () => {
    useAdminHomeData.mockReturnValue(loaded());
    render(<AdminHomeDashboard embedded />);
    expect(screen.getByText("New Registrations")).toBeTruthy();
    expect(screen.getAllByText(NO_DATA_LABEL).length).toBeGreaterThan(0);
  });

  it("shows an empty activity state when the timeline is empty", () => {
    useAdminHomeData.mockReturnValue(loaded({ activity: [] }));
    render(<AdminHomeDashboard embedded />);
    expect(screen.getByText("Recent Activity")).toBeTruthy();
    expect(screen.getAllByText(NO_DATA_LABEL).length).toBeGreaterThan(0);
  });
});

// ── error handling ───────────────────────────────────────────────────────────

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

// ── navigation ───────────────────────────────────────────────────────────────

describe("Quick Access navigation", () => {
  it("renders all eight tiles", () => {
    useAdminHomeData.mockReturnValue(loaded());
    render(<AdminHomeDashboard embedded onNavigate={jest.fn()} />);
    [
      "Manage Drivers", "Manage Vehicles", "Manage Riders", "Manage Deliveries",
      "Payments & Finance", "Employees & HR", "Trust & Safety", "Reports & Analytics",
    ].forEach((l) => expect(screen.getByText(l)).toBeTruthy());
  });

  it("navigates each tile to a real admin route", () => {
    const onNavigate = jest.fn();
    useAdminHomeData.mockReturnValue(loaded());
    render(<AdminHomeDashboard embedded onNavigate={onNavigate} />);
    const EXPECTED = {
      "Manage Drivers": "/admin/drivers",
      "Manage Vehicles": "/admin/vehicles",
      "Manage Riders": "/admin/riders",
      "Manage Deliveries": "/admin/delivery",
      "Payments & Finance": "/admin/payments",
      "Employees & HR": "/admin/employees",
      "Trust & Safety": "/admin/trust-safety",
      "Reports & Analytics": "/admin/business-intelligence",
    };
    Object.entries(EXPECTED).forEach(([label, path]) => {
      onNavigate.mockClear();
      fireEvent.click(screen.getByText(label));
      expect(onNavigate).toHaveBeenCalledWith(path);
    });
  });

  it("navigates to the audit log from Recent Activity", () => {
    const onNavigate = jest.fn();
    useAdminHomeData.mockReturnValue(loaded());
    render(<AdminHomeDashboard embedded onNavigate={onNavigate} />);
    fireEvent.click(screen.getByText(/View All Activity/));
    expect(onNavigate).toHaveBeenCalledWith("/admin/security/audit");
  });
});

// ── chrome / embedded mode ───────────────────────────────────────────────────

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
    // Appears twice by design: the welcome banner and the header user chip.
    expect(screen.getAllByText(/Housseinou Sakho/).length).toBeGreaterThanOrEqual(1);
  });
});
