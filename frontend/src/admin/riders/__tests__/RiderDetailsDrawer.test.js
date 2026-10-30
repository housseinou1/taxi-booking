import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";

import RiderDetailsDrawer from "../RiderDetailsDrawer";
import {
  getRiderActivity,
  getRiderAuditLogs,
  getRiderSupport,
  getRiderPayments,
  getRiderRideHistory,
} from "../ridersApi";

jest.mock("../ridersApi");

const RIDER = {
  id: 7,
  full_name: "Amina Diallo",
  email: "amina@mail.com",
  phone_number: "+221700000001",
  rider_status: "approved",
  rider_status_label: "Approved",
  is_active: true,
  phone_verified: true,
  has_national_id_document: false,
  rider_rating_count: 0,
  date_joined: "2026-01-10T10:00:00Z",
};

const HISTORY = {
  count: 2,
  page: 1,
  page_size: 25,
  total_pages: 1,
  results: [
    {
      id: 101,
      pickup: "Airport",
      destination: "Downtown",
      driver_name: "Omar Ba",
      driver_email: "omar@mail.com",
      status: "completed",
      fare: "1500.00",
      payment_status: "paid",
      created_at: "2026-02-01T08:00:00Z",
      completed_at: "2026-02-01T08:30:00Z",
      rating: 5,
      review: "Great trip",
      driver_rating: 4,
      driver_review: null,
    },
    {
      id: 102,
      pickup: "Market",
      destination: null,
      driver_name: null,
      driver_email: null,
      status: "cancelled",
      fare: "900.00",
      payment_status: null,
      created_at: "2026-02-02T08:00:00Z",
      completed_at: null,
      rating: null,
      review: null,
      driver_rating: null,
      driver_review: null,
    },
  ],
  summary: {
    total_rides: 2,
    completed_rides: 1,
    cancelled_rides: 1,
    total_spend_mru: "1500.00",
    average_fare_mru: "1500.00",
  },
};

const PAYMENTS = {
  count: 1,
  page: 1,
  page_size: 25,
  total_pages: 1,
  results: [
    {
      transaction_id: "TXN-1",
      ride_id: 101,
      amount: "1500.00",
      currency: "MRU",
      method: "card",
      status: "completed",
      created_at: "2026-02-01T08:31:00Z",
    },
  ],
  refunds: [
    {
      id: 5,
      amount: "200.00",
      currency: "MRU",
      reason: "overcharge",
      status: "approved",
      created_at: "2026-02-03T08:00:00Z",
      resolved_at: null,
    },
  ],
};

const ACTIVITY = {
  last_login: "2026-03-01T09:00:00Z",
  last_seen: "2026-03-02T10:00:00Z",
  last_seen_device: "Pixel 7",
};

const AUDIT = [
  { id: 1, action: "admin_action", summary: "Rider approved", created_at: "2026-03-01T09:05:00Z" },
];

function resolveAll() {
  getRiderRideHistory.mockResolvedValue(HISTORY);
  getRiderPayments.mockResolvedValue(PAYMENTS);
  getRiderActivity.mockResolvedValue(ACTIVITY);
  getRiderAuditLogs.mockResolvedValue(AUDIT);
  getRiderSupport.mockResolvedValue({ count: 0, open_count: 0, results: [] });
}

function renderDrawer(props = {}) {
  return render(
    <RiderDetailsDrawer
      rider={RIDER}
      open
      rides={[]}
      getFileUrl={(p) => p}
      onClose={jest.fn()}
      onApprove={jest.fn()}
      onReject={jest.fn()}
      onSuspendToggle={jest.fn()}
      {...props}
    />
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

test("fetches all four endpoints with the rider id on open", async () => {
  resolveAll();
  renderDrawer();
  await waitFor(() => expect(getRiderRideHistory).toHaveBeenCalled());
  expect(getRiderRideHistory).toHaveBeenCalledWith(7, expect.objectContaining({ page: 1 }));
  expect(getRiderPayments).toHaveBeenCalledWith(7);
  expect(getRiderActivity).toHaveBeenCalledWith(7);
  expect(getRiderAuditLogs).toHaveBeenCalledWith(7);
});

test("renders statistics from the authoritative summary", async () => {
  resolveAll();
  renderDrawer();
  const stats = await screen.findByText("Statistics");
  const section = stats.closest(".riders-detail__section");
  expect(within(section).getByText("Total rides").closest(".riders-detail__field")).toHaveTextContent("2");
  expect(within(section).getByText("Total spending").closest(".riders-detail__field")).toHaveTextContent(
    "1,500.00 MRU"
  );
});

test("renders ride history rows and driver info", async () => {
  resolveAll();
  renderDrawer();
  expect(await screen.findByText("Omar Ba")).toBeInTheDocument();
  expect(screen.getByText(/Airport → Downtown/)).toBeInTheDocument();
  // #101 appears in the ride-history row AND the ratings list ("Ride #101");
  // assert at least one occurrence rather than a unique match.
  expect(screen.getAllByText("#101").length).toBeGreaterThan(0);
});

test("renders N/A for null ride fields (driver, destination, completed)", async () => {
  resolveAll();
  renderDrawer();
  const cancelledCell = await screen.findByText("#102");
  const row = cancelledCell.closest("tr");
  // destination is null -> "Market → N/A"; driver null -> "N/A"; completed null -> "N/A"
  expect(within(row).getByText(/Market → N\/A/)).toBeInTheDocument();
  expect(within(row).getAllByText("N/A").length).toBeGreaterThan(0);
});

test("renders payment and refund history", async () => {
  resolveAll();
  renderDrawer();
  expect(await screen.findByText("TXN-1")).toBeInTheDocument();
  expect(screen.getByText("overcharge")).toBeInTheDocument();
});

test("renders last login, last seen, and device", async () => {
  resolveAll();
  renderDrawer();
  const label = await screen.findByText("Last seen device");
  expect(label.closest(".riders-detail__field")).toHaveTextContent("Pixel 7");
});

test("renders the rider-filtered audit log entries", async () => {
  resolveAll();
  renderDrawer();
  expect(await screen.findByText(/Rider approved/)).toBeInTheDocument();
});

test("shows an error state when the ride-history fetch rejects", async () => {
  getRiderRideHistory.mockRejectedValue(new Error("history boom"));
  getRiderPayments.mockResolvedValue(PAYMENTS);
  getRiderActivity.mockResolvedValue(ACTIVITY);
  getRiderAuditLogs.mockResolvedValue(AUDIT);
  getRiderSupport.mockResolvedValue({ count: 0, open_count: 0, results: [] });
  renderDrawer();
  // The history error surfaces in every history-backed section (statistics,
  // ride history, ratings & reviews), so assert at least one error node.
  const errors = await screen.findAllByText("history boom");
  expect(errors.length).toBeGreaterThan(0);
});

test("shows an error state when the payments fetch rejects", async () => {
  getRiderRideHistory.mockResolvedValue(HISTORY);
  getRiderPayments.mockRejectedValue(new Error("payments boom"));
  getRiderActivity.mockResolvedValue(ACTIVITY);
  getRiderAuditLogs.mockResolvedValue(AUDIT);
  getRiderSupport.mockResolvedValue({ count: 0, open_count: 0, results: [] });
  renderDrawer();
  // The payments error surfaces in both the payment and refund sub-sections.
  const errors = await screen.findAllByText("payments boom");
  expect(errors.length).toBeGreaterThan(0);
});

test("never renders a sensitive payment field (provider_token / card) even if present", async () => {
  getRiderRideHistory.mockResolvedValue(HISTORY);
  getRiderActivity.mockResolvedValue(ACTIVITY);
  getRiderAuditLogs.mockResolvedValue(AUDIT);
  getRiderSupport.mockResolvedValue({ count: 0, open_count: 0, results: [] });
  // Defensive: even if the API leaked a token, the drawer must not surface it.
  getRiderPayments.mockResolvedValue({
    ...PAYMENTS,
    results: [{ ...PAYMENTS.results[0], provider_token: "SECRET-TOKEN-XYZ", card_number: "4111111111111111" }],
  });
  const { container } = renderDrawer();
  await screen.findByText("TXN-1");
  expect(container.textContent).not.toContain("SECRET-TOKEN-XYZ");
  expect(container.textContent).not.toContain("4111111111111111");
});

test("shows empty states when all sections return no records", async () => {
  getRiderRideHistory.mockResolvedValue({
    count: 0,
    page: 1,
    page_size: 25,
    total_pages: 1,
    results: [],
    summary: { total_rides: 0, completed_rides: 0, cancelled_rides: 0, total_spend_mru: null, average_fare_mru: null },
  });
  getRiderPayments.mockResolvedValue({ count: 0, page: 1, page_size: 25, total_pages: 1, results: [], refunds: [] });
  getRiderActivity.mockResolvedValue({ last_login: null, last_seen: null, last_seen_device: null });
  getRiderAuditLogs.mockResolvedValue([]);
  getRiderSupport.mockResolvedValue({ count: 0, open_count: 0, results: [] });
  renderDrawer();
  expect(await screen.findByText("No rides found for this rider.")).toBeInTheDocument();
  expect(screen.getByText("No payments found for this rider.")).toBeInTheDocument();
  expect(screen.getByText("No activity log entries for this rider.")).toBeInTheDocument();
  // Total spending null -> N/A, never fabricated 0.
  const stats = screen.getByText("Statistics").closest(".riders-detail__section");
  expect(within(stats).getByText("Total spending").closest(".riders-detail__field")).toHaveTextContent("N/A");
});
