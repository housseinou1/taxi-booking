/**
 * Phase 7 — withdrawal review drawer tests.
 *
 * The drawer is read-only: it renders stored request data, the status timeline
 * and (for finance reviewers) the requester/payout/wallet block, and it must
 * never render an approve / reject / mark-paid control.
 */
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import WithdrawalDetailsDrawer from "../WithdrawalDetailsDrawer";
import { fetchWithdrawalDetail } from "../withdrawalsApi";

jest.mock("../withdrawalsApi");

const ROW = {
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
  requester: {
    id: 3,
    name: "Moussa Coura",
    email: "moussa@yala.test",
    phone_number: "+22245000140",
    is_active: true,
    is_courier: false,
  },
};

const DETAIL = {
  ...ROW,
  reference: "WD-REF-1",
  payment_reference: "",
  payout_method: { label: "bankily +22245000141", payout_type: "bankily" },
  timeline: [
    { label: "Requested", at: "2026-10-20T09:00:00Z", actor: "", note: "First request" },
    { label: "OTP verified", at: "2026-10-20T09:01:00Z", actor: "", note: "" },
  ],
  wallet: {
    has_wallet: true,
    balance: "5000.00",
    pending_balance: "0",
    currency: "MRU",
    open_withdrawal_amount: "1500.00",
  },
  wallet_transactions: [
    {
      id: 1,
      transaction_type: "top_up",
      status: "completed",
      amount: "5000.00",
      is_credit: true,
      balance_after: "5000.00",
      reference: "TOPUP-1",
      created_at: "2026-10-18T09:00:00Z",
    },
  ],
  review_actions_frozen: true,
  review_actions_frozen_reason: "Actions are frozen.",
};

function renderDrawer(overrides = {}) {
  return render(
    <WithdrawalDetailsDrawer
      withdrawal={ROW}
      loading={false}
      error=""
      canReview
      onClose={() => {}}
      onRetry={() => {}}
      {...overrides}
    />
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  fetchWithdrawalDetail.mockResolvedValue(DETAIL);
});

test("renders the request, timeline and stored wallet values", async () => {
  renderDrawer();

  await waitFor(() => expect(fetchWithdrawalDetail).toHaveBeenCalledWith(11));
  expect(await screen.findByText("Status timeline")).toBeInTheDocument();
  expect(screen.getAllByText("Requested").length).toBeGreaterThan(0);
  expect(screen.getByText("OTP verified")).toBeInTheDocument();
  expect(screen.getAllByText("5000.00").length).toBeGreaterThan(0);
  expect(screen.getByText("top_up")).toBeInTheDocument();
  expect(screen.getByText(/Stored values only/i)).toBeInTheDocument();
});

test("shows the frozen-actions notice and offers no action controls", async () => {
  renderDrawer();
  await waitFor(() => expect(fetchWithdrawalDetail).toHaveBeenCalled());

  expect(screen.getByText(/Read-only review/i)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /^approve$/i })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /^reject$/i })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /mark.*paid/i })).not.toBeInTheDocument();
});

test("restricts the sensitive block without the finance capability", async () => {
  renderDrawer({ canReview: false });
  await waitFor(() => expect(fetchWithdrawalDetail).toHaveBeenCalled());

  expect(screen.getByText(/Restricted/i)).toBeInTheDocument();
  expect(screen.queryByText("moussa@yala.test")).not.toBeInTheDocument();
  expect(screen.queryByText("bankily +22245000141")).not.toBeInTheDocument();
});

test("surfaces a detail failure without breaking the drawer", async () => {
  fetchWithdrawalDetail.mockRejectedValue({
    response: { data: { detail: "detail unavailable" } },
  });
  renderDrawer();

  expect(await screen.findByText("detail unavailable")).toBeInTheDocument();
  expect(screen.getByText("Request")).toBeInTheDocument();
});

test("retry re-fetches the detail", async () => {
  fetchWithdrawalDetail.mockRejectedValueOnce({
    response: { data: { detail: "detail unavailable" } },
  });
  renderDrawer();

  await screen.findByText("detail unavailable");
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));

  await waitFor(() => expect(fetchWithdrawalDetail).toHaveBeenCalledTimes(2));
  expect(await screen.findByText("Status timeline")).toBeInTheDocument();
});
