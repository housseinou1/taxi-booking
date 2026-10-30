/**
 * Phase 9 — CEO Reporting Centre tests.
 *
 * Verifies the city-separated + combined report renders Nouakchott and
 * Nouadhibou blocks, that period/city selections are passed to the backend, that
 * the protected-CEO posture card renders, and that the page exposes NO financial
 * action (read-only oversight only).
 */
import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import CeoReportingCenter from "../CeoReportingCenter";
import { fetchCeoCityReport, fetchCeoSecurityPosture } from "../ceoReportingApi";

jest.mock("../ceoReportingApi", () => {
  const actual = jest.requireActual("../ceoReportingApi");
  return {
    ...actual,
    fetchCeoCityReport: jest.fn(),
    fetchCeoSecurityPosture: jest.fn(),
  };
});

jest.mock("../../layouts/AdminShell", () => ({
  AdminShellPage: ({ children }) => children,
}));

jest.mock("../../permissions/PermissionContext", () => ({
  PermissionProvider: ({ children }) => children,
  usePermissions: () => ({
    permissions: { role: "ceo", modules: ["ceo"], actions: {}, feature_flags: {} },
    loading: false,
    error: null,
    reloadPermissions: () => {},
    logout: () => {},
    canView: () => true,
    canAction: () => true,
    canExport: () => true,
    canAccessCurrentPath: true,
    routeDenial: null,
    sessionWarningOpen: false,
    extendSession: () => {},
  }),
}));

function cityBlock(name, rides, deliveries, fare, commission, pending) {
  return {
    city: name,
    rides: { total: rides, completed: rides, cancelled: 0, rider_no_show: 0, completed_fare: fare, driver_earnings: "800.00", platform_commission_tracked: false },
    deliveries: { total: deliveries, delivered: deliveries, cancelled: 0, exceptions: 0, delivered_fare: "500.00", courier_earnings: "400.00", platform_commission: commission },
    revenue: { rides_fare: fare, deliveries_fare: "500.00", total_fare: fare, courier_earnings: "400.00", driver_earnings: "800.00" },
    commissions: { deliveries_platform_commission: commission, rides_platform_commission_tracked: false },
    withdrawals: { total: 1, pending: 1, approved: 0, rejected: 0, paid: 0, requested_amount: pending, pending_amount: pending, approved_amount: "0", paid_amount: "0" },
    accounts: { riders: 4, drivers: 2, couriers: 1, active: 6, inactive: 1 },
  };
}

const REPORT = {
  period: "monthly",
  range: { from: "2026-10-01", to: "2026-10-24" },
  timezone_note: "All timestamps are UTC.",
  cities: {
    Nouakchott: cityBlock("Nouakchott", 10, 5, "12000.00", "600.00", "1500.00"),
    Nouadhibou: cityBlock("Nouadhibou", 4, 2, "4000.00", "200.00", "300.00"),
  },
  combined: cityBlock("Combined", 14, 7, "16000.00", "800.00", "1800.00"),
  comparison: [
    { city: "Nouakchott", total_fare: "12000.00", rides_completed: 10, deliveries_delivered: 5, withdrawals_pending_amount: "1500.00" },
    { city: "Nouadhibou", total_fare: "4000.00", rides_completed: 4, deliveries_delivered: 2, withdrawals_pending_amount: "300.00" },
  ],
  notes: { read_only: "This report performs no financial mutation." },
};

const POSTURE = {
  account: { email: "ceo@yala.test", is_ceo_authority: true, protected_groups: ["CEO", "Super Admin"], is_staff: true, is_superuser: false },
  protected_permissions: {
    ceo_only_endpoints: true,
    cannot_be_modified_by_subordinates: [
      "Rider suspend/reactivate endpoints refuse staff accounts.",
      "CEO account actions refuse the acting account itself.",
    ],
    note: "CEO authority is defined by group membership.",
  },
  strong_authentication: { totp_enrolled: true, totp_confirmed: true, totp_confirmed_at: "2026-10-01T09:00:00Z", recommended: true },
  recent_sensitive_actions: { window_hours: 24, count: 2, latest: [] },
  audit_trail_available: true,
};

beforeEach(() => {
  jest.clearAllMocks();
  fetchCeoCityReport.mockResolvedValue(REPORT);
  fetchCeoSecurityPosture.mockResolvedValue(POSTURE);
});

test("renders city-separated and combined statistics", async () => {
  render(<CeoReportingCenter />);

  expect(await screen.findByText("Combined (all cities)")).toBeInTheDocument();
  expect(screen.getAllByText("Nouakchott").length).toBeGreaterThan(0);
  expect(screen.getAllByText("Nouadhibou").length).toBeGreaterThan(0);

  const combinedKpi = screen
    .getByText("Combined total fare", { selector: ".admin-kpi__label" })
    .closest(".admin-kpi");
  expect(within(combinedKpi).getByText("16000.00 MRU")).toBeInTheDocument();

  expect(screen.getByText(/2026-10-01 → 2026-10-24/)).toBeInTheDocument();
});

test("renders the city comparison table with both cities", async () => {
  render(<CeoReportingCenter />);

  expect(await screen.findByText("City comparison")).toBeInTheDocument();
  expect(screen.getAllByText("12000.00 MRU").length).toBeGreaterThan(0);
  expect(screen.getAllByText("4000.00 MRU").length).toBeGreaterThan(0);
});

test("passes period and city selection to the backend", async () => {
  render(<CeoReportingCenter />);
  await screen.findByText("Combined (all cities)");

  fireEvent.change(screen.getByRole("combobox", { name: "Report period" }), {
    target: { value: "daily" },
  });
  await waitFor(() =>
    expect(fetchCeoCityReport).toHaveBeenLastCalledWith(
      expect.objectContaining({ period: "daily" })
    )
  );

  fireEvent.change(screen.getByRole("combobox", { name: "Report cities" }), {
    target: { value: "Nouadhibou" },
  });
  await waitFor(() =>
    expect(fetchCeoCityReport).toHaveBeenLastCalledWith(
      expect.objectContaining({ cities: "Nouadhibou" })
    )
  );
});

test("custom period sends the date range", async () => {
  render(<CeoReportingCenter />);
  await screen.findByText("Combined (all cities)");

  fireEvent.change(screen.getByRole("combobox", { name: "Report period" }), {
    target: { value: "custom" },
  });
  fireEvent.change(await screen.findByLabelText("Report from date"), {
    target: { value: "2026-09-01" },
  });
  fireEvent.change(screen.getByLabelText("Report to date"), {
    target: { value: "2026-09-30" },
  });

  await waitFor(() =>
    expect(fetchCeoCityReport).toHaveBeenLastCalledWith(
      expect.objectContaining({ period: "custom", date_from: "2026-09-01", date_to: "2026-09-30" })
    )
  );
});

test("renders the protected-CEO posture card", async () => {
  render(<CeoReportingCenter />);

  expect(await screen.findByText("CEO access protection")).toBeInTheDocument();
  expect(
    screen.getByText(/holds protected CEO authority/i)
  ).toBeInTheDocument();
  expect(screen.getByText(/Enabled/)).toBeInTheDocument();
  expect(
    screen.getByText(/Rider suspend\/reactivate endpoints refuse staff accounts/i)
  ).toBeInTheDocument();
});

test("offers no financial action anywhere on the page", async () => {
  render(<CeoReportingCenter />);
  await screen.findByText("Combined (all cities)");

  for (const name of [/^approve$/i, /^reject$/i, /mark.*paid/i, /transfer/i]) {
    expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
  }
  expect(screen.getByText(/no financial mutation/i)).toBeInTheDocument();
});

test("surfaces backend failures without crashing", async () => {
  fetchCeoCityReport.mockRejectedValue({ response: { data: { detail: "report unavailable" } } });
  fetchCeoSecurityPosture.mockRejectedValue({
    response: { data: { detail: "posture unavailable" } },
  });

  render(<CeoReportingCenter />);

  expect(await screen.findByText("report unavailable")).toBeInTheDocument();
  expect(await screen.findByText("posture unavailable")).toBeInTheDocument();
});

