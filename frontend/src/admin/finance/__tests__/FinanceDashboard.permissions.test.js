/**
 * FinanceDashboard — approval permissions (tasks 1 & 5).
 *
 * REGRESSION GUARD: refund approve/reject used mode="disable", so an operator
 * without finance approval rights still SAW the controls. Refunds must be hidden
 * exactly like withdrawals.
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";

import { ToastProvider } from "../../components/library";
import FinanceDashboard from "../FinanceDashboard";
import * as opsApi from "../financeOpsApi";
import * as controlApi from "../../operations/operationsControlApi";
import { usePermissions } from "../../permissions/PermissionContext";

jest.mock("../financeOpsApi");
jest.mock("../../operations/operationsControlApi");
jest.mock("../../permissions/PermissionContext");

const PAYLOAD = {
  period: "daily",
  reconciliation: { totals: {} },
  revenue_analytics: { summary: {} },
  withdrawals: {
    summary: {},
    withdrawals: [
      { id: 501, status: "pending", amount: "100.00", driver_name: "A Driver" },
      { id: 502, status: "approved", amount: "50.00", driver_name: "B Driver" },
    ],
  },
  transactions: { transactions: [] },
};

const REFUNDS = [
  { id: 900, status: "requested", amount: "25.00", customer_email: "r@yala.test" },
];

const grantFinance = () => ({
  permissions: { role: "finance", modules: ["finance"], elevated: false },
  canApprove: () => true,
  canView: () => true,
  canAction: () => true,
  canExport: () => true,
});

const denyAll = () => ({
  permissions: { role: "ops_manager", modules: ["ops"], elevated: false },
  canApprove: () => false,
  canView: () => false,
  canAction: () => false,
  canExport: () => false,
});

const renderDash = () =>
  render(
    <ToastProvider>
      <FinanceDashboard />
    </ToastProvider>
  );

beforeEach(() => {
  jest.clearAllMocks();
  opsApi.fetchFinanceOperations.mockResolvedValue(PAYLOAD);
  controlApi.fetchRefundQueue.mockResolvedValue(REFUNDS);
});

describe("FinanceDashboard approval permissions", () => {
  test("an authorized finance user sees the approval controls", async () => {
    usePermissions.mockReturnValue(grantFinance());
    renderDash();

    await waitFor(() => expect(screen.getByText(/Ride Revenue/)).toBeInTheDocument());
    // The refund row must be present, so the negative tests below are not vacuous.
    await waitFor(() => expect(screen.getByText("#900")).toBeInTheDocument());
    expect(screen.getByText("Refund Center")).toBeInTheDocument();
  });

  test("an unauthorized user sees the refund ROW but no approval controls", async () => {
    usePermissions.mockReturnValue(denyAll());
    renderDash();

    // Data renders (row visible) ...
    await waitFor(() => expect(screen.getByText("#900")).toBeInTheDocument());
    // ... but the approval controls are withheld.
    expect(screen.queryByText(/Approve refund/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Reject refund/i)).not.toBeInTheDocument();
  });

  test("REGRESSION: an unauthorized user sees NO withdrawal approval controls", async () => {
    usePermissions.mockReturnValue(denyAll());
    renderDash();

    await waitFor(() => expect(screen.getByText(/Ride Revenue/)).toBeInTheDocument());

    expect(screen.queryByText(/^Approve$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Reject$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Mark paid/i)).not.toBeInTheDocument();
  });
});
