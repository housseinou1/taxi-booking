/**
 * FinanceAnalyticsCenter — role-based financial restriction.
 *
 * REGRESSION GUARD: this page is routed under /admin/ops-center/finance, which is
 * gated to the `ops` module, and it rendered Revenue, Driver & Courier Finances,
 * Payments and Wallets with NO permission check at all. Operations Managers and
 * Supervisors must see operational information only.
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";

import FinanceAnalyticsCenter from "../FinanceAnalyticsCenter";
import { usePermissions } from "../../permissions/PermissionContext";

jest.mock("../opsDashboardApi", () => ({ fetchOpsDashboard: jest.fn() }));
jest.mock("../../../auth/authenticatedApi", () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));
jest.mock("../../permissions/PermissionContext");

const opsUser = () => ({
  permissions: { role: "ops_manager", modules: ["ops", "rides"], actions: {} },
  canView: (module) => ["ops", "rides"].includes(module),
  canAction: () => false,
  canApprove: () => false,
  canExport: () => false,
});

const financeUser = () => ({
  permissions: { role: "ceo", elevated: true, modules: ["ops", "finance"] },
  canView: () => true,
  canAction: () => true,
  canApprove: () => true,
  canExport: () => true,
});

beforeEach(() => {
  jest.clearAllMocks();
  const opsApi = require("../opsDashboardApi");
  opsApi.fetchOpsDashboard.mockResolvedValue({});
  const api = require("../../../auth/authenticatedApi").default;
  api.get.mockResolvedValue({ data: {} });
});

describe("FinanceAnalyticsCenter role gating", () => {
  test("REGRESSION: an Operations Manager sees Restricted instead of money sections", async () => {
    usePermissions.mockReturnValue(opsUser());
    render(<FinanceAnalyticsCenter />);

    await waitFor(() => expect(screen.getByText("Restricted")).toBeInTheDocument());
    // The financial sections must not be present.
    expect(screen.queryByText(/A\. Revenue/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Platform commission/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/D\. Wallets/)).not.toBeInTheDocument();
    expect(screen.getByText(/require the Finance capability/i)).toBeInTheDocument();
  });

  test("an Operations Manager still gets the operational sections", async () => {
    usePermissions.mockReturnValue(opsUser());
    render(<FinanceAnalyticsCenter />);

    await waitFor(() => expect(screen.getByText("Restricted")).toBeInTheDocument());
    expect(screen.getByText("Performance")).toBeInTheDocument();
    expect(screen.getByText("Leaderboards")).toBeInTheDocument();
    expect(screen.getByText("Trends")).toBeInTheDocument();
  });

  test("a CEO/finance user sees the full financial breakdown", async () => {
    usePermissions.mockReturnValue(financeUser());
    render(<FinanceAnalyticsCenter />);

    await waitFor(() => expect(screen.getByText(/A\. Revenue/)).toBeInTheDocument());
    expect(screen.getAllByText(/Platform commission/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/D\. Wallets/)).toBeInTheDocument();
    expect(screen.queryByText(/require the Finance capability/i)).not.toBeInTheDocument();
  });
});
