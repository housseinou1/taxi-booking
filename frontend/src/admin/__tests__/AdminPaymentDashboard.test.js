import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import AdminPaymentDashboard from "../AdminPaymentDashboard";

// The shell renders the page title/breadcrumbs/theme; render children directly.
jest.mock("../../admin/layouts/AdminShell", () => ({
  __esModule: true,
  AdminShellPage: ({ children }) => <>{children}</>,
}));

// ExportMenu wraps its items in AdminActionGuard, which needs a permissions
// provider. Pass-through keeps the Export control rendered in tests.
jest.mock("../components/guards/AdminActionGuard", () => ({
  __esModule: true,
  default: ({ children }) => children,
}));

jest.mock("../../payments/paymentApi", () => ({
  __esModule: true,
  fetchAdminPaymentDashboard: jest.fn(),
  fetchPaymentsOversight: jest.fn(),
}));

jest.mock("../finance/moosylApi", () => ({
  __esModule: true,
  fetchMoosylOverview: jest.fn().mockResolvedValue({
    data: {
      provider: "moosyl",
      environment: "sandbox",
      mode: "sandbox",
      may_settle: false,
      webhook_url: "/payments/webhooks/moosyl/",
      recent_events: [],
    },
  }),
}));

const { fetchAdminPaymentDashboard, fetchPaymentsOversight } = require("../../payments/paymentApi");

const mockDashboard = {
  total_transactions: 1200,
  gross_volume: "450000.00",
  total_revenue: "67500.00",
  pending_payouts: 12,
  completed_payouts: 340,
  failed_payments: 7,
  wallet_transactions: 88,
};

const mockOversight = {
  period: "weekly",
  cities: [
    {
      city: "Nouakchott",
      payments: {
        count: 900,
        amount: "320000.00",
        platform_commission: "48000.00",
        driver_earnings: "250000.00",
        tips: "4200.00",
        by_method: { bankily: { count: 600, amount: "220000.00" } },
        by_status: { completed: { count: 880, amount: "318000.00" } },
      },
    },
    {
      city: "Combined",
      payments: {
        count: 1200,
        amount: "450000.00",
        platform_commission: "67500.00",
        driver_earnings: "350000.00",
        tips: "7000.00",
        by_method: {
          bankily: { count: 800, amount: "300000.00" },
          card: { count: 400, amount: "150000.00" },
        },
        by_status: {
          completed: { count: 1180, amount: "448000.00" },
          failed: { count: 7, amount: "2000.00" },
        },
      },
    },
  ],
  payouts: {
    pending: { count: 12, amount: "12000.00" },
    approved: { count: 4, amount: "4000.00" },
    paid: { count: 340, amount: "340000.00" },
    rejected: { count: 2, amount: "2000.00" },
    by_role: { driver: {}, courier: {} },
    by_status: {},
  },
  refunds: { awaiting_ceo: { count: 3, amount: "1500.00" }, by_status: {} },
  failed_transactions: {
    total: 7,
    ride_payments: [
      {
        id: 11,
        ride_id: 55,
        amount: "500.00",
        method: "bankily",
        status: "failed",
        reason: "Insufficient funds",
        created_at: "2024-03-15T10:00:00Z",
      },
    ],
    ledger_records: [],
  },
  providers: { providers: [] },
  suspicious: { sampled: 200, flagged: 1 },
  reconciliation: { state: "monitoring_only", note: "Computed from stored records only." },
};

beforeEach(() => {
  fetchAdminPaymentDashboard.mockResolvedValue(mockDashboard);
  fetchPaymentsOversight.mockResolvedValue(mockOversight);
});

describe("AdminPaymentDashboard — Payment Management Center", () => {
  it("renders one page heading and the professional subtitle", async () => {
    render(<AdminPaymentDashboard />);

    await waitFor(() => {
      expect(
        screen.getByText(/Monitor transactions, manage payouts, track refunds/i)
      ).toBeInTheDocument();
    });

    // The shell owns the single page title, so the page must not repeat it.
    expect(
      screen.queryByRole("heading", { name: /^payment management center$/i })
    ).not.toBeInTheDocument();
  });

  it("renders all six navigation tabs including Moosyl", async () => {
    render(<AdminPaymentDashboard />);

    await waitFor(() => {
      expect(screen.getAllByRole("tab")).toHaveLength(6);
    });

    ["Overview", "Transactions", "Payouts", "Refunds", "Payment Providers", "Moosyl"].forEach((label) => {
      expect(screen.getByRole("tab", { name: label })).toBeInTheDocument();
    });

    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });

  it("shows the eight financial KPI cards with backend values", async () => {
    render(<AdminPaymentDashboard />);

    await waitFor(() => {
      expect(screen.getByText("Total Transactions")).toBeInTheDocument();
    });

    [
      "Total Transactions",
      "Gross Transaction Value",
      "Platform Revenue",
      "Pending Payouts",
      "Completed Payouts",
      "Pending Refunds",
      "Failed Transactions",
      "Wallet Transactions",
    ].forEach((label) => {
      // Some labels (e.g. "Failed Transactions") are also section headings, so
      // assert presence rather than uniqueness.
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    });

    // "1,200" is the Total Transactions value and also appears in Payment
    // Performance (payment records), so assert presence.
    expect(screen.getAllByText("1,200").length).toBeGreaterThan(0);
  });

  it("populates the city selector from real oversight city blocks", async () => {
    render(<AdminPaymentDashboard />);

    await waitFor(() => {
      expect(screen.getByLabelText("Select city")).toBeEnabled();
    });

    expect(screen.getByRole("option", { name: "Nouakchott" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "All cities" })).toBeInTheDocument();
  });

  it("supports keyboard navigation between tabs", async () => {
    render(<AdminPaymentDashboard />);

    const overviewTab = await screen.findByRole("tab", { name: "Overview" });
    overviewTab.focus();
    fireEvent.keyDown(overviewTab, { key: "ArrowRight" });

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Transactions" })).toHaveAttribute(
        "aria-selected",
        "true"
      );
    });

    expect(screen.getByRole("tabpanel")).toHaveAttribute(
      "aria-labelledby",
      "payment-tab-transactions"
    );
  });

  it("exposes search, filters and export on the Transactions tab", async () => {
    render(<AdminPaymentDashboard />);

    fireEvent.click(await screen.findByRole("tab", { name: "Transactions" }));

    await waitFor(() => {
      expect(screen.getByText("Transaction History")).toBeInTheDocument();
    });

    expect(screen.getByLabelText("Filter transactions by status")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search transactions…")).toBeInTheDocument();
    // Both the page header and the table toolbar expose export controls.
    expect(screen.getAllByText("Export").length).toBeGreaterThan(0);
  });

  it("keeps the page usable when the oversight request fails", async () => {
    fetchPaymentsOversight.mockRejectedValue(new Error("denied"));
    render(<AdminPaymentDashboard />);

    await waitFor(() => {
      expect(screen.getByText("Total Transactions")).toBeInTheDocument();
    });

    expect(screen.getByText("1,200")).toBeInTheDocument();
  });
});
