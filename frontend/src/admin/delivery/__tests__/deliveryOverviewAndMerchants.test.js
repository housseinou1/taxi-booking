/**
 * Phase 5 — Delivery overview + merchant directory tests.
 *
 * Verifies the overview KPIs come from the read-only overview endpoint (with an
 * honest em dash when the backend reports no fare yet) and that the merchant
 * directory is read-only (list + filters only, no mutation controls).
 */
import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import DeliveryManagement from "../DeliveryManagement";
import MerchantsDirectory from "../MerchantsDirectory";
import { fetchAdminMerchants, fetchDeliveryOverview } from "../deliveryApi";

jest.mock("../deliveryApi");

// Render the page body without the full admin shell (the shell itself needs the
// real permission context); the page under test is what these suites cover.
jest.mock("../../layouts/AdminShell", () => ({
  AdminShellPage: ({ children }) => children,
}));

jest.mock("../../permissions/PermissionContext", () => ({
  PermissionProvider: ({ children }) => children,
  usePermissions: () => ({
    permissions: { role: "ceo", modules: ["delivery"], actions: {}, feature_flags: {} },
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

const OVERVIEW = {
  couriers: { total: 4, approved: 2, pending: 1, rejected: 0, suspended: 1, online: 2 },
  deliveries: {
    total: 12,
    active: 3,
    delivered: 8,
    cancelled: 1,
    exceptions: 0,
    delivered_fare: "2200",
  },
  open_disputes: 1,
  merchants: { total: 5, pending: 2, approved: 3, suspended: 0 },
  // Task 7 additive block: busy + available + offline === eligible_pool.
  operations: {
    couriers: {
      eligible_pool: 2,
      busy: 0,
      available: 2,
      offline: 0,
      in_exception: 0,
      approved_but_suspended: 0,
    },
    deliveries: { pending: 0, pending_scheduled: 0 },
    definitions: {},
  },
  recent_deliveries: [
    {
      id: 900,
      status: "delivered",
      service_category: "package",
      pickup: "Marché",
      destination: "Ksar",
      customer_name: "Amina Diallo",
      fare: "275",
      created_at: "2026-03-01T08:00:00Z",
    },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  fetchDeliveryOverview.mockResolvedValue(OVERVIEW);
  fetchAdminMerchants.mockResolvedValue({
    count: 1,
    page: 1,
    page_size: 25,
    total_pages: 1,
    summary: { total: 5, pending: 2, approved: 3, rejected: 0, suspended: 0 },
    results: [
      {
        id: 3,
        business_name: "Alpha Market",
        owner_name: "Alpha",
        owner_email: "alpha@yala.test",
        city: "Nouakchott",
        merchant_type: "grocery",
        merchant_type_label: "Grocery Store",
        status: "approved",
        total_orders: 21,
        rating: "4.5",
        created_at: "2026-01-05T10:00:00Z",
      },
    ],
  });
});

test("overview renders courier and delivery KPIs from the backend", async () => {
  render(<DeliveryManagement />);

  // Money is formatted from the backend decimal string, so thousands are grouped.
  expect((await screen.findAllByText("2,200 MRU")).length).toBeGreaterThan(0);

  const totalCard = screen.getByText("Total deliveries").closest(".admin-kpi");
  expect(within(totalCard).getByText("12")).toBeInTheDocument();
  const activeCard = screen.getByText("Active deliveries").closest(".admin-kpi");
  expect(within(activeCard).getByText("3")).toBeInTheDocument();
  const completedCard = screen.getByText("Completed deliveries").closest(".admin-kpi");
  expect(within(completedCard).getByText("8")).toBeInTheDocument();
  const availableCard = screen.getByText("Available couriers").closest(".admin-kpi");
  expect(within(availableCard).getByText("2")).toBeInTheDocument();
  const approvalsCard = screen.getByText("Pending courier approvals").closest(".admin-kpi");
  expect(within(approvalsCard).getByText("1")).toBeInTheDocument();

  // The courier and merchant pipeline panels carry the per-status breakdown.
  const courierPanel = screen.getByText("Couriers").closest(".dlvops-panel");
  expect(within(courierPanel).getByText("4")).toBeInTheDocument();
  const merchantPanel = screen.getByText("Merchants").closest(".dlvops-panel");
  expect(within(merchantPanel).getByText("5")).toBeInTheDocument();

  expect(await screen.findByText("900")).toBeInTheDocument();
});

test("overview shows an em dash instead of a fake zero fare", async () => {
  fetchDeliveryOverview.mockResolvedValue({
    ...OVERVIEW,
    deliveries: { ...OVERVIEW.deliveries, delivered_fare: null },
  });

  render(<DeliveryManagement />);

  const revenueCard = await screen.findByText("Delivery revenue");
  expect(
    within(revenueCard.closest(".admin-kpi")).getAllByText("—").length
  ).toBeGreaterThan(0);
});

test("overview surfaces a backend failure without crashing", async () => {
  fetchDeliveryOverview.mockRejectedValue({ response: { data: { detail: "overview boom" } } });
  render(<DeliveryManagement />);
  expect((await screen.findAllByText("overview boom")).length).toBeGreaterThan(0);
});

test("merchant directory lists merchants and passes filters to the backend", async () => {
  render(<MerchantsDirectory />);

  expect(await screen.findByText("Alpha Market")).toBeInTheDocument();
  expect(screen.getAllByText("Grocery Store").length).toBeGreaterThan(0);

  fireEvent.change(screen.getByRole("combobox", { name: "Status" }), {
    target: { value: "pending" },
  });
  await waitFor(() =>
    expect(fetchAdminMerchants).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "pending", page: 1 })
    )
  );
});

test("merchant directory offers no mutation controls", async () => {
  render(<MerchantsDirectory />);
  await screen.findByText("Alpha Market");

  expect(screen.queryByRole("button", { name: /^approve$/i })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /^suspend/i })).not.toBeInTheDocument();
  expect(screen.getByText(/Read-only directory/i)).toBeInTheDocument();
});
