/**
 * FinanceDashboard KPI mapping.
 *
 * REGRESSION GUARD: the dashboard read `data.kpi_summary`, but the finance
 * operations endpoint does not return that key (verified live:
 * `has kpi_summary? False`), so all twelve cards rendered an em dash. The
 * authoritative figures live in `reconciliation.totals`.
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";

import { ToastProvider } from "../../components/library";
import FinanceDashboard from "../FinanceDashboard";
import * as opsApi from "../financeOpsApi";
import * as controlApi from "../../operations/operationsControlApi";

const renderDashboard = () =>
  render(
    <ToastProvider>
      <FinanceDashboard />
    </ToastProvider>
  );

jest.mock("../financeOpsApi");
jest.mock("../../operations/operationsControlApi");
jest.mock("../../permissions/PermissionContext", () => ({
  usePermissions: () => ({
    permissions: { role: "ceo", elevated: true },
    canApprove: () => true,
    canView: () => true,
    canAction: () => true,
    canExport: () => true,
  }),
}));

const PAYLOAD = {
  period: "daily",
  reconciliation: {
    totals: {
      ride_revenue: "1200.00",
      delivery_revenue: "300.00",
      gross_revenue: "1500.00",
      platform_commission: "225.00",
      driver_earnings: "975.00",
      courier_earnings: "210.00",
      wallet_balance: "5200.00",
      pending_withdrawals: "100.00",
      refunds: "50.00",
      failed_payments: "0",
      pending_settlements: "0",
    },
  },
  revenue_analytics: { summary: {} },
  withdrawals: { summary: { paid: { amount: "400.00", count: 2 }, withdrawals: [] }, withdrawals: [] },
  transactions: { transactions: [] },
};

beforeEach(() => {
  jest.clearAllMocks();
  opsApi.fetchFinanceOperations.mockResolvedValue(PAYLOAD);
  controlApi.fetchRefundQueue.mockResolvedValue([]);
});

describe("FinanceDashboard KPIs", () => {
  test("REGRESSION: ride revenue and platform commission render from reconciliation.totals", async () => {
    renderDashboard();

    await waitFor(() => expect(screen.getByText("Ride Revenue")).toBeInTheDocument());
    expect(screen.getByText("Platform Commission (Rides)")).toBeInTheDocument();
    // The values must be present, not em dashes.
    expect(screen.getByText(/1,200/)).toBeInTheDocument();
    expect(screen.getByText(/225/)).toBeInTheDocument();
  });

  test("REGRESSION: labels follow the backend financial definitions", async () => {
    renderDashboard();
    await waitFor(() => expect(screen.getByText("Ride Revenue")).toBeInTheDocument());

    // Old labels that no longer match the backend payload.
    expect(screen.queryByText("Revenue Today")).not.toBeInTheDocument();
    expect(screen.queryByText("Platform Fees")).not.toBeInTheDocument();
    expect(screen.queryByText("Net Revenue")).not.toBeInTheDocument();

    // New definitions.
    expect(screen.getByText("Gross Revenue")).toBeInTheDocument();
    expect(screen.getByText("Delivery Revenue")).toBeInTheDocument();
    expect(screen.getByText("Pending Withdrawals")).toBeInTheDocument();
    expect(screen.getByText("Paid Withdrawals")).toBeInTheDocument();
  });
});
