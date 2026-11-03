/**
 * Regression: Executive Overview export + data honesty.
 *
 * Two defects this pins down:
 *  1. handleExport had NO catch, so a failing export (the backend 500s on PDF)
 *     produced no download and no message — a silent failure.
 *  2. The backend returns DRF-JSON-encoded bytes for csv/xlsx, so the browser saves a
 *     JSON string literal that Excel cannot open. A 200 must not be treated as success.
 */
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import ExecutiveDashboard from "../ExecutiveDashboard";
import {
  exportExecutiveReport,
  fetchExecutiveDashboard,
  fetchPendingWithdrawals,
} from "../executiveApi";

jest.mock("../executiveApi", () => ({
  approveWithdrawal: jest.fn(),
  exportExecutiveReport: jest.fn(),
  fetchExecutiveDashboard: jest.fn(),
  fetchPendingWithdrawals: jest.fn(),
  postAccountAction: jest.fn(),
  postExecutiveBroadcast: jest.fn(),
  rejectWithdrawal: jest.fn(),
  setMaintenanceMode: jest.fn(),
}));

const DASHBOARD = {
  live: { live: { active_drivers: 2, active_couriers: 0 }, today: {} },
  finance: { summary: {} },
  operations: {},
  security: {},
  support: {},
  qa: {},
  permissions: { ceo_actions: false },
};

beforeEach(() => {
  jest.clearAllMocks();
  fetchExecutiveDashboard.mockResolvedValue(DASHBOARD);
  fetchPendingWithdrawals.mockResolvedValue([]);
  // jsdom has no real download plumbing
  window.URL.createObjectURL = jest.fn(() => "blob:x");
  window.URL.revokeObjectURL = jest.fn();
});

test("a JSON-wrapped export is reported as a failure, not silently downloaded", async () => {
  // exactly what the backend currently returns for csv/xlsx
  exportExecutiveReport.mockResolvedValue({
    data: '"\\ufeffmessage\\r\\nNo records"',
    headers: { "content-type": "text/csv" },
  });

  render(<ExecutiveDashboard />);
  await waitFor(() => expect(screen.getByText("Active Drivers")).toBeInTheDocument());

  fireEvent.click(screen.getByRole("button", { name: /export csv/i }));

  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toMatch(/did not return a CSV file/i);
  // and no file was handed to the browser
  expect(window.URL.createObjectURL).not.toHaveBeenCalled();
});

test("a failed export surfaces the cause instead of failing silently", async () => {
  exportExecutiveReport.mockRejectedValue({
    response: { status: 500, data: {} },
  });

  render(<ExecutiveDashboard />);
  await waitFor(() => expect(screen.getByText("Active Drivers")).toBeInTheDocument());

  fireEvent.click(screen.getByRole("button", { name: /export pdf/i }));

  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toMatch(/HTTP 500/);
  expect(alert.textContent).toMatch(/server-side problem, not missing data/i);
});

test("a real binary export still downloads", async () => {
  exportExecutiveReport.mockResolvedValue({
    data: new Blob(["PK\u0003\u0004real-xlsx"]),
    headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  });

  render(<ExecutiveDashboard />);
  await waitFor(() => expect(screen.getByText("Active Drivers")).toBeInTheDocument());

  fireEvent.click(screen.getByRole("button", { name: /export excel/i }));

  await waitFor(() => expect(window.URL.createObjectURL).toHaveBeenCalled());
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("an absent count renders an em dash, never a fabricated 0", async () => {
  fetchExecutiveDashboard.mockResolvedValue({
    ...DASHBOARD,
    // active_trips deliberately omitted
    live: { live: { active_drivers: 0, active_couriers: null }, today: {} },
  });

  render(<ExecutiveDashboard />);
  await waitFor(() => expect(screen.getByText("Active Trips")).toBeInTheDocument());

  const card = (label) => screen.getByText(label).closest(".executive__card");
  // genuine zero stays 0
  expect(card("Active Drivers").textContent).toContain("0");
  // absent renders the dash
  expect(card("Active Trips").textContent).toContain("—");
  expect(card("Active Couriers").textContent).toContain("—");
});
