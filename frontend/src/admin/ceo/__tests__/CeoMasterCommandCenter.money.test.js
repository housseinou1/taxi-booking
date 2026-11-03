/**
 * Regression: the CEO command centre must NOT fabricate a financial zero.
 *
 * The live CEO Dashboard showed "0 MRU" for Revenue Today/Week/Month while adjacent
 * KPIs correctly showed "—". Cause: formatMoney(null|undefined) returns "0 MRU", so a
 * revenue field the API did not report was rendered as a real zero.
 *
 * This test pins the platform contract for the Executive Overview cards:
 *   - an absent value renders the em dash, never "0 MRU"
 *   - a genuine zero still renders "0 MRU"
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";

import CeoMasterCommandCenter from "../CeoMasterCommandCenter";
import { fetchCeoMasterOverview } from "../ceoMasterApi";
import { fetchExecutiveMetrics } from "../executiveMetricsApi";

jest.mock("../ceoMasterApi", () => {
  const actual = jest.requireActual("../ceoMasterApi");
  return {
    ...actual,
    fetchCeoMasterDashboard: jest.fn(),
    fetchCeoMasterOverview: jest.fn(),
    fetchCeoMasterFinance: jest.fn(),
    fetchCeoMasterOperations: jest.fn(),
    fetchCeoMasterGrowth: jest.fn(),
    fetchCeoMasterFleet: jest.fn(),
    fetchCeoMasterAiInsights: jest.fn(),
    fetchCeoMasterReadiness: jest.fn(),
  };
});

jest.mock("../executiveMetricsApi", () => {
  const actual = jest.requireActual("../executiveMetricsApi");
  return { ...actual, fetchExecutiveMetrics: jest.fn() };
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

beforeEach(() => {
  jest.clearAllMocks();
  fetchExecutiveMetrics.mockResolvedValue({});
});

test("an absent revenue value renders the em dash, never a fabricated 0 MRU", async () => {
  // total_revenue_* deliberately omitted, exactly as an API that does not report them
  fetchCeoMasterOverview.mockResolvedValue({
    total_riders: 12,
    total_drivers: 5,
  });

  render(<CeoMasterCommandCenter />);

  await waitFor(() => {
    expect(screen.getByText("Revenue Today")).toBeInTheDocument();
  });

  const card = screen.getByText("Revenue Today").closest(".ceo-master-card");
  expect(card).toBeTruthy();

  // Must be unavailable, NOT a fabricated zero.
  expect(card.textContent).toContain("—");
  expect(card.textContent).not.toContain("0 MRU");
});

test("a genuine zero revenue still renders as 0 MRU", async () => {
  fetchCeoMasterOverview.mockResolvedValue({
    total_revenue_today: "0",
    total_riders: 3,
  });

  render(<CeoMasterCommandCenter />);

  await waitFor(() => {
    expect(screen.getByText("Revenue Today")).toBeInTheDocument();
  });

  const card = screen.getByText("Revenue Today").closest(".ceo-master-card");
  expect(card.textContent).toContain("0 MRU");
});
