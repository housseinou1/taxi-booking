/**
 * Phase 8 — CEO Control Center tests.
 *
 * Verifies the CEO surface: the approvals inbox renders read-only with the
 * frozen-financial notice, the account directory filters/search are passed to the
 * backend, suspend/reactivate require a reason and call the audited account
 * action, protected (staff) accounts expose no action, and the audit trail loads
 * with the selected scope. No financial approval control exists anywhere.
 */
import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import CeoControlCenter from "../CeoControlCenter";
import { ceoAccountAction, fetchCeoAccounts, fetchCeoApprovals, fetchCeoAuditTrail } from "../ceoControlApi";

jest.mock("../ceoControlApi", () => {
  const actual = jest.requireActual("../ceoControlApi");
  return {
    ...actual,
    fetchCeoApprovals: jest.fn(),
    fetchCeoAccounts: jest.fn(),
    ceoAccountAction: jest.fn(),
    fetchCeoAuditTrail: jest.fn(),
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

const APPROVALS = {
  total_pending: 3,
  city_filter: "all",
  financial_approvals_frozen: true,
  financial_approvals_note: "Refunds and withdrawals are listed read-only.",
  groups: {
    refunds: { count: 1, items: [{ id: 7, type: "refund", title: "Refund #7", amount: "90000", status: "awaiting_ceo", city: "Nouakchott", deep_link: "/admin/finance-ops" }] },
    withdrawals: { count: 1, items: [{ id: 8, type: "withdrawal", title: "Withdrawal #8", amount: "250000", status: "pending", city: "Nouadhibou", deep_link: "/admin/withdrawals" }] },
    drivers: { count: 1, items: [{ id: 9, type: "driver", title: "Driver onboarding: Ali", amount: null, status: "pending", city: "Nouakchott", deep_link: "/admin/drivers" }] },
    couriers: { count: 0, items: [] },
    riders: { count: 0, items: [] },
    merchants: { count: 0, items: [] },
  },
};

const ACCOUNTS = [
  {
    id: 3,
    email: "rider@yala.test",
    name: "Rider One",
    domain: "rider",
    is_active: true,
    is_staff: false,
    actionable: true,
    city_name: "Nouakchott",
    capabilities: { approve: false, suspend: true, deactivate: true, reactivate: false },
  },
  {
    id: 4,
    email: "suspended@yala.test",
    name: "Suspended Rider",
    domain: "rider",
    is_active: false,
    is_staff: false,
    actionable: true,
    city_name: "Nouadhibou",
    capabilities: { approve: true, suspend: false, deactivate: false, reactivate: true },
  },
  {
    id: 5,
    email: "ceo@yala.test",
    name: "Owner",
    domain: "staff",
    is_active: true,
    is_staff: true,
    actionable: false,
    city_name: "Nouakchott",
  },
];

const ACCOUNT_SUMMARY = {
  total: 3,
  active: 2,
  inactive: 1,
  riders: 2,
  drivers: 0,
  couriers: 0,
  merchants: 0,
  employees: 0,
};

beforeEach(() => {
  jest.clearAllMocks();
  fetchCeoApprovals.mockResolvedValue(APPROVALS);
  fetchCeoAccounts.mockResolvedValue({
    count: 3,
    page: 1,
    page_size: 25,
    total_pages: 1,
    results: ACCOUNTS,
    summary: ACCOUNT_SUMMARY,
  });
  fetchCeoAuditTrail.mockResolvedValue({ scope: "me", count: 0, results: [] });
  ceoAccountAction.mockResolvedValue({ message: "CEO suspended account: rider@yala.test" });
});

test("renders the approvals inbox with group counts and the frozen-finance notice", async () => {
  render(<CeoControlCenter />);

  expect(await screen.findByText("Refund #7")).toBeInTheDocument();
  expect(screen.getByText("Withdrawal #8")).toBeInTheDocument();
  expect(screen.getByText(/listed read-only/i)).toBeInTheDocument();

  const pendingCard = screen
    .getByText("Pending approvals", { selector: ".admin-kpi__label" })
    .closest(".admin-kpi");
  expect(within(pendingCard).getByText("3")).toBeInTheDocument();
});

test("inbox items link to the owning module and offer no approval control", async () => {
  render(<CeoControlCenter />);
  await screen.findByText("Refund #7");

  const links = screen.getAllByRole("link", { name: "Open" });
  expect(links.length).toBeGreaterThan(0);
  expect(links[0]).toHaveAttribute("href", "/admin/finance-ops");

  // Financial approvals stay read-only in this center (no approve/reject there).
  expect(screen.queryByRole("button", { name: /^reject$/i })).not.toBeInTheDocument();
});

test("renders the account directory with protected rows having no action", async () => {
  render(<CeoControlCenter />);

  expect(await screen.findByText("rider@yala.test")).toBeInTheDocument();
  expect(screen.getByText("suspended@yala.test")).toBeInTheDocument();
  expect(screen.getByText("Protected account")).toBeInTheDocument();

  const accountsCard = screen
    .getByText("Accounts", { selector: ".admin-kpi__label" })
    .closest(".admin-kpi");
  expect(within(accountsCard).getByText("3")).toBeInTheDocument();
});

test("passes domain/status filters and search to the backend", async () => {
  render(<CeoControlCenter />);
  await screen.findByText("rider@yala.test");

  fireEvent.change(screen.getByRole("combobox", { name: "Filter by domain" }), {
    target: { value: "courier" },
  });
  await waitFor(() =>
    expect(fetchCeoAccounts).toHaveBeenLastCalledWith(
      expect.objectContaining({ domain: "courier", page: 1 })
    )
  );

  const searchInput = await screen.findByPlaceholderText(/search name/i);
  fireEvent.change(searchInput, { target: { value: "nouadhibou" } });
  await waitFor(() =>
    expect(fetchCeoAccounts).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: "nouadhibou" })
    )
  );
});


test("suspend requires a reason and then calls the audited account action", async () => {
  render(<CeoControlCenter />);
  await screen.findByText("rider@yala.test");

  fireEvent.click(screen.getAllByRole("button", { name: "Suspend" })[0]);
  expect(await screen.findByText(/Suspend account/i)).toBeInTheDocument();

  // Empty reason is blocked client-side (backend also enforces it).
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
  expect(ceoAccountAction).not.toHaveBeenCalled();
  expect(screen.getByText(/reason \(5\+ characters\) is required/i)).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText("Account action reason"), {
    target: { value: "Fraud investigation opened" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

  await waitFor(() =>
    expect(ceoAccountAction).toHaveBeenCalledWith(3, "suspend", "Fraud investigation opened")
  );
  expect(
    await screen.findByText(/CEO suspended account: rider@yala.test/i)
  ).toBeInTheDocument();
});

test("reactivate is offered for an inactive account", async () => {
  render(<CeoControlCenter />);
  await screen.findByText("suspended@yala.test");

  fireEvent.click(screen.getByRole("button", { name: "Reactivate" }));
  fireEvent.change(screen.getByLabelText("Account action reason"), {
    target: { value: "Investigation cleared" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

  await waitFor(() =>
    expect(ceoAccountAction).toHaveBeenCalledWith(4, "reactivate", "Investigation cleared")
  );
});

test("backend refusal is surfaced inside the dialog without crashing", async () => {
  ceoAccountAction.mockRejectedValue({
    response: { data: { error: "Staff and superuser accounts cannot be changed here." } },
  });
  render(<CeoControlCenter />);
  await screen.findByText("rider@yala.test");

  fireEvent.click(screen.getAllByRole("button", { name: "Deactivate" })[0]);
  fireEvent.change(screen.getByLabelText("Account action reason"), {
    target: { value: "Compliance review" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

  expect(
    await screen.findByText(/cannot be changed here/i)
  ).toBeInTheDocument();
  expect(screen.getByText("Audit trail")).toBeInTheDocument();
});


test("audit trail renders the CEO's own actions and switches scope", async () => {
  fetchCeoAuditTrail.mockResolvedValue({
    scope: "me",
    count: 1,
    results: [
      {
        id: 1,
        action: "suspend",
        entity_type: "customer",
        entity_id: "3",
        summary: "CEO suspended account: rider@yala.test",
        reason: "Fraud investigation opened",
        actor_email: "ceo@yala.test",
        ip_address: "10.0.0.1",
        created_at: "2026-10-24T09:00:00Z",
      },
    ],
  });

  render(<CeoControlCenter />);

  expect(await screen.findByText("CEO suspended account: rider@yala.test")).toBeInTheDocument();
  expect(screen.getByText(/Fraud investigation opened/)).toBeInTheDocument();
  expect(fetchCeoAuditTrail).toHaveBeenCalledWith({ scope: "me", limit: 25 });

  fireEvent.change(screen.getByRole("combobox", { name: "Audit scope" }), {
    target: { value: "all" },
  });
  await waitFor(() =>
    expect(fetchCeoAuditTrail).toHaveBeenLastCalledWith({ scope: "all", limit: 25 })
  );
});

test("surfaces backend failures without crashing", async () => {
  fetchCeoApprovals.mockRejectedValue({ response: { data: { detail: "inbox unavailable" } } });
  fetchCeoAccounts.mockRejectedValue({ response: { data: { detail: "directory unavailable" } } });
  fetchCeoAuditTrail.mockRejectedValue({ response: { data: { detail: "audit unavailable" } } });

  render(<CeoControlCenter />);

  expect((await screen.findAllByText("inbox unavailable")).length).toBeGreaterThan(0);
  expect((await screen.findAllByText("directory unavailable")).length).toBeGreaterThan(0);
  expect(await screen.findByText("audit unavailable")).toBeInTheDocument();
});

