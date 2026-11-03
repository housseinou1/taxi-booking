/**
 * Phase 7 — Finance & Withdrawals monitoring page tests.
 *
 * Verifies the page is read-only: it loads KPIs and the queue through GET calls,
 * passes filters/search to the backend, opens the review drawer, and exposes NO
 * approve / reject / mark-paid / transfer control.
 */
import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import WithdrawalsMonitoring from "../WithdrawalsMonitoring";
import { fetchAdminWithdrawals, fetchFinanceOverview, fetchWithdrawalDetail } from "../withdrawalsApi";

jest.mock("../withdrawalsApi", () => {
  const actual = jest.requireActual("../withdrawalsApi");
  return {
    ...actual,
    fetchAdminWithdrawals: jest.fn(),
    fetchFinanceOverview: jest.fn(),
    fetchWithdrawalDetail: jest.fn(),
  };
});

jest.mock("../../layouts/AdminShell", () => ({
  AdminShellPage: ({ children }) => children,
}));

jest.mock("../../permissions/PermissionContext", () => ({
  PermissionProvider: ({ children }) => children,
  usePermissions: () => ({
    permissions: {
      role: "finance",
      modules: ["finance"],
      actions: { "finance.approve_withdrawal": true },
      feature_flags: {},
    },
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

const ROWS = [
  {
    id: 11,
    amount: "1500.00",
    currency: "MRU",
    status: "pending",
    note: "First request",
    admin_note: "",
    approved_at: null,
    paid_at: null,
    created_at: "2026-10-20T09:00:00Z",
    payout_method_label: "bankily +22245000141",
    requester: { id: 3, name: "Moussa Coura", email: "moussa@yala.test", is_courier: false },
  },
  {
    id: 12,
    amount: "700.00",
    currency: "MRU",
    status: "paid",
    created_at: "2026-10-19T09:00:00Z",
    paid_at: "2026-10-19T12:00:00Z",
    payout_method_label: "bankily +22245000141",
    requester: { id: 4, name: "Aicha Mint", email: "aicha@yala.test", is_courier: true },
  },
];

const SUMMARY = {
  total: 2,
  pending: 1,
  approved: 0,
  rejected: 0,
  paid: 1,
  pending_amount: "1500.00",
  approved_amount: "0",
  paid_amount: "700.00",
  rejected_amount: "0",
  total_amount: "2200.00",
};

beforeEach(() => {
  jest.clearAllMocks();
  fetchAdminWithdrawals.mockResolvedValue({
    count: 2,
    page: 1,
    page_size: 25,
    total_pages: 1,
    results: ROWS,
    summary: SUMMARY,
  });
  fetchFinanceOverview.mockResolvedValue({
    withdrawals: { ...SUMMARY, open_amount: "1500.00", paid_last_30d_amount: "700.00", paid_last_30d_count: 1 },
    wallets: { wallets: 1, total_balance: "5000.00", total_pending_balance: "0" },
    refunds: { total: 0, requested: 0 },
    merchant_payouts: { total: 0, pending: 0, paid: 0, pending_amount: "0" },
    review_actions_frozen: true,
    review_actions_frozen_reason: "frozen",
  });
  fetchWithdrawalDetail.mockResolvedValue({
    ...ROWS[0],
    reference: "WD-REF-1",
    timeline: [{ label: "Requested", at: "2026-10-20T09:00:00Z", actor: "", note: "First request" }],
    wallet: { has_wallet: true, balance: "5000.00", pending_balance: "0", open_withdrawal_amount: "1500.00" },
    wallet_transactions: [],
    review_actions_frozen: true,
    review_actions_frozen_reason: "frozen",
  });
});

test("renders queue KPIs and rows from the read-only endpoints", async () => {
  render(<WithdrawalsMonitoring />);

  expect(await screen.findByText("Moussa Coura")).toBeInTheDocument();
  const pendingCard = screen.getByText("Pending", { selector: ".admin-kpi__label" }).closest(".admin-kpi");
  expect(within(pendingCard).getByText("1")).toBeInTheDocument();
  expect(within(pendingCard).getByText("1,500 MRU")).toBeInTheDocument();

  const walletsCard = screen
    .getByText("Wallet balances", { selector: ".admin-kpi__label" })
    .closest(".admin-kpi");
  expect(within(walletsCard).getByText("5000.00")).toBeInTheDocument();
});

test("states clearly that review actions are frozen", async () => {
  render(<WithdrawalsMonitoring />);
  expect(await screen.findByText(/Review actions are frozen|actions are\s+frozen/i)).toBeInTheDocument();
});

test("offers no approve, reject, mark-paid or transfer control", async () => {
  render(<WithdrawalsMonitoring />);
  await screen.findByText("Moussa Coura");

  expect(screen.queryByRole("button", { name: /^approve$/i })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /^reject$/i })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /mark.*paid/i })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /transfer/i })).not.toBeInTheDocument();
});

test("passes status filter and search to the backend", async () => {
  render(<WithdrawalsMonitoring />);
  await screen.findByText("Moussa Coura");

  const statusSelect = screen.getByRole("combobox", { name: "Filter by status" });
  fireEvent.change(statusSelect, {
    target: { value: "pending" },
  });
  await waitFor(() =>
    expect(fetchAdminWithdrawals).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "pending", page: 1 })
    )
  );

  const searchInput = await screen.findByPlaceholderText(/search requester/i);
  fireEvent.change(searchInput, { target: { value: "moussa" } });
  await waitFor(() =>
    expect(fetchAdminWithdrawals).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: "moussa" })
    )
  );
});

test("opens the read-only review drawer", async () => {
  render(<WithdrawalsMonitoring />);
  await screen.findByText("Moussa Coura");

  fireEvent.click(screen.getAllByRole("button", { name: "Review" })[0]);

  await waitFor(() => expect(fetchWithdrawalDetail).toHaveBeenCalledWith(11));
  expect(await screen.findByRole("dialog")).toBeInTheDocument();
  expect(screen.getByText(/Read-only review/i)).toBeInTheDocument();
});

test("surfaces a backend failure without crashing", async () => {
  fetchAdminWithdrawals.mockRejectedValue({
    response: { data: { detail: "queue unavailable" } },
  });
  render(<WithdrawalsMonitoring />);
  expect((await screen.findAllByText("queue unavailable")).length).toBeGreaterThan(0);
});
