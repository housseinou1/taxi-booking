import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { formatMoney } from "../../../marketConfig";
import FinanceOperationsCenter from "../FinanceOperationsCenter";

// DataTable → ExportMenu wraps its items in AdminActionGuard, which needs a
// permissions provider. Pass-through keeps the export controls rendered.
jest.mock("../../components/guards/AdminActionGuard", () => ({
  __esModule: true,
  default: ({ children }) => children,
}));

jest.mock("../financeOpsApi", () => ({
  __esModule: true,
  fetchFinanceOperations: jest.fn(),
  exportFinanceReport: jest.fn(),
  approveWithdrawal: jest.fn(),
  rejectWithdrawal: jest.fn(),
  markWithdrawalPaid: jest.fn(),
  REPORT_TYPES: [
    { id: "daily", label: "Daily Financial Report" },
    { id: "weekly", label: "Weekly Report" },
  ],
}));

const { fetchFinanceOperations, approveWithdrawal } = require("../financeOpsApi");

const mockPayload = {
  generated_at: "2024-03-15T12:30:00Z",
  date: "2024-03-15",
  period: "daily",
  reconciliation: {
    date: "2024-03-15",
    totals: {
      ride_revenue: "1000.00",
      delivery_revenue: "2000.00",
      platform_commission: "3000.00",
      driver_earnings: "4000.00",
      courier_earnings: "5000.00",
      wallet_deposits: "6000.00",
      wallet_withdrawals: "7000.00",
      wallet_balance: "8000.00",
      failed_payments: "9000.00",
      failed_payments_count: 3,
      refunds: "1100.00",
      pending_settlements: "1200.00",
      pending_settlements_count: 2,
      pending_withdrawals: "1300.00",
      pending_withdrawals_count: 4,
    },
    reconciliation: {
      status: "balanced",
      label: "Balanced",
      operations_total: "45000.00",
      payments_total: "45000.00",
      difference_amount: "0.00",
    },
  },
  payment_providers: {
    providers: [
      {
        key: "bankily",
        label: "Bankily",
        successful: { count: 10, amount: "5000.00" },
        failed: { count: 1, amount: "500.00" },
        pending: { count: 2, amount: "800.00" },
        reversed: { count: 0, amount: "0.00" },
      },
    ],
  },
  withdrawals: {
    summary: {
      pending: { count: 1, amount: "1300.00" },
      approved: { count: 0, amount: "0.00" },
      paid: { count: 2, amount: "2000.00" },
      total_amount: "3300.00",
    },
    withdrawals: [
      {
        id: 55,
        driver_name: "Amadou Ba",
        driver_email: "amadou@example.com",
        amount: "1300.00",
        currency: "MRU",
        payout_display: "Bankily",
        status: "pending",
        created_at: "2024-03-15T09:00:00Z",
      },
    ],
  },
  revenue_analytics: {
    charts: {
      daily: [{ date: "2024-03-15", revenue: 1000 }],
      weekly: [{ start: "2024-03-11", revenue: 7000 }],
      by_service: [{ service: "ride", label: "Ride", revenue: "1000.00", count: 5 }],
      by_payment_method: [{ key: "bankily", label: "Bankily", revenue: "1000.00", count: 5 }],
      by_city: [{ city: "Nouakchott", revenue: "1000.00", trips: 5 }],
    },
  },
  accounting: {
    daily: {
      title: "Daily Financial Report",
      start_date: "2024-03-15",
      end_date: "2024-03-15",
      metrics: {
        gross_revenue: "45000.00",
        platform_commission: "3000.00",
        net_cash_flow: "2500.00",
        outstanding_withdrawals: "1300.00",
      },
    },
  },
  audit: {
    entries: [
      {
        id: 1,
        timestamp: "2024-03-15T10:00:00Z",
        user: "ceo@yala.mr",
        action: "withdrawal_approved",
        amount: "1300.00",
        before: { status: "pending" },
        after: { status: "approved" },
        summary: "Approved withdrawal 55",
      },
    ],
  },
};

beforeEach(() => {
  fetchFinanceOperations.mockResolvedValue(mockPayload);
});

describe("FinanceOperationsCenter — finance dashboard", () => {
  it("renders one page heading and the professional subtitle", async () => {
    render(<FinanceOperationsCenter />);

    await waitFor(() => {
      expect(
        screen.getByText(/Accounting, reconciliation and CEO financial oversight/i)
      ).toBeInTheDocument();
    });

    // The shell owns the single page title, so the page must not repeat it.
    expect(
      screen.queryByRole("heading", { name: /^finance operations center$/i })
    ).not.toBeInTheDocument();
  });

  it("shows the reconciliation banner with status, difference, period and timestamp", async () => {
    render(<FinanceOperationsCenter />);

    await waitFor(() => {
      expect(screen.getByLabelText("Reconciliation status")).toBeInTheDocument();
    });

    const banner = screen.getByLabelText("Reconciliation status");
    expect(banner).toHaveTextContent("Balanced");
    expect(banner).toHaveTextContent("Difference");
    expect(banner).toHaveTextContent(formatMoney("0.00"));
    expect(banner).toHaveTextContent("Daily · 2024-03-15");
    // generated_at comes from the backend payload.
    expect(banner).toHaveTextContent(new Date("2024-03-15T12:30:00Z").toLocaleString());
  });

  it("renders all six navigation tabs", async () => {
    render(<FinanceOperationsCenter />);

    await waitFor(() => {
      expect(screen.getAllByRole("tab")).toHaveLength(6);
    });

    [
      "Daily Reconciliation",
      "Payment Providers",
      "Withdrawals",
      "Revenue Analytics",
      "Accounting",
      "Audit",
    ].forEach((label) => {
      expect(screen.getByRole("tab", { name: label })).toBeInTheDocument();
    });
  });

  it("groups the twelve financial metrics into Revenue, Earnings, Wallets and Payments", async () => {
    render(<FinanceOperationsCenter />);

    await waitFor(() => {
      expect(screen.getByText("Ride revenue")).toBeInTheDocument();
    });

    ["Revenue", "Earnings", "Wallets", "Payments"].forEach((section) => {
      expect(screen.getByRole("heading", { name: section })).toBeInTheDocument();
    });

    [
      "Ride revenue",
      "Delivery revenue",
      "Platform commission",
      "Driver earnings",
      "Courier earnings",
      "Wallet deposits",
      "Wallet withdrawals",
      "Wallet balance",
      "Failed payments",
      "Refunds",
      "Pending settlements",
      "Pending withdrawals",
    ].forEach((label) => {
      expect(screen.getByText(label)).toBeInTheDocument();
    });

    // Real backend values are rendered verbatim (MRU via formatMoney).
    expect(screen.getAllByText(formatMoney("1000.00")).length).toBeGreaterThan(0);
    expect(screen.getAllByText(formatMoney("1300.00")).length).toBeGreaterThan(0);
  });

  it("supports keyboard navigation between tabs", async () => {
    render(<FinanceOperationsCenter />);

    const firstTab = await screen.findByRole("tab", { name: "Daily Reconciliation" });
    firstTab.focus();
    fireEvent.keyDown(firstTab, { key: "ArrowRight" });

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Payment Providers" })).toHaveAttribute(
        "aria-selected",
        "true"
      );
    });

    expect(screen.getByRole("tabpanel")).toHaveAttribute(
      "aria-labelledby",
      "finance-tab-providers"
    );
  });

  it("lists withdrawals with status badges and approval actions", async () => {
    render(<FinanceOperationsCenter />);

    fireEvent.click(await screen.findByRole("tab", { name: "Withdrawals" }));

    await waitFor(() => {
      expect(screen.getByText("Amadou Ba")).toBeInTheDocument();
    });

    expect(screen.getAllByText("Pending").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(approveWithdrawal).toHaveBeenCalledWith(55);
  });

  it("flags an unbalanced reconciliation", async () => {
    fetchFinanceOperations.mockResolvedValue({
      ...mockPayload,
      reconciliation: {
        ...mockPayload.reconciliation,
        reconciliation: {
          ...mockPayload.reconciliation.reconciliation,
          status: "difference_detected",
          difference_amount: "250.00",
        },
      },
    });

    render(<FinanceOperationsCenter />);

    await waitFor(() => {
      expect(screen.getByText("Difference detected")).toBeInTheDocument();
    });
  });
});
