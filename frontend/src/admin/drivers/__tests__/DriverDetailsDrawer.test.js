import React from "react";
import { render, screen, within, waitFor } from "@testing-library/react";

import DriverDetailsDrawer from "../DriverDetailsDrawer";
import {
  getDriverActivity,
  getDriverAuditTrail,
  getDriverEarnings,
  getDriverPayouts,
  getDriverRideHistory,
} from "../driversApi";

// Stage 2 per-driver admin endpoints are mocked; nothing hits the network.
jest.mock("../driversApi", () => ({
  getDriverActivity: jest.fn(),
  getDriverAuditTrail: jest.fn(),
  getDriverEarnings: jest.fn(),
  getDriverPayouts: jest.fn(),
  getDriverRideHistory: jest.fn(),
}));

const EMPTY_BUCKET = {
  earnings_mru: null,
  commission_mru: null,
  payout_mru: null,
  ride_count: 0,
  currency: "MRU",
};

function mockEmptyStage2() {
  getDriverActivity.mockResolvedValue({ last_login: null, last_seen: null, last_seen_device: null });
  getDriverEarnings.mockResolvedValue({
    total: EMPTY_BUCKET,
    today: EMPTY_BUCKET,
    week: EMPTY_BUCKET,
    month: EMPTY_BUCKET,
    currency: "MRU",
  });
  getDriverRideHistory.mockResolvedValue({
    count: 0,
    page: 1,
    page_size: 10,
    total_pages: 1,
    results: [],
    summary: {
      total_rides: 0,
      completed_rides: 0,
      cancelled_rides: 0,
      total_earnings_mru: null,
      average_earning_mru: null,
    },
  });
  getDriverPayouts.mockResolvedValue({ count: 0, page: 1, page_size: 25, total_pages: 1, results: [] });
  getDriverAuditTrail.mockResolvedValue([]);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockEmptyStage2();
});

// The drawer wraps its mutating buttons in AdminActionGuard -> usePermissions;
// mock the permission context so it renders without a provider.
jest.mock("../../permissions/PermissionContext", () => ({
  usePermissions: () => ({
    permissions: { role: "ceo", modules: ["drivers"], actions: {}, feature_flags: {} },
    canView: () => true,
    canAction: () => true,
    canApprove: () => true,
    canExport: () => true,
  }),
}));

const DRIVER = {
  id: 7,
  user_id: 107,
  driver_code: "D007",
  driver_name: "Amadou Ba",
  email: "amadou@mail.com",
  phone_number: "+221700000001",
  is_courier: false,
  status: "approved",
  is_active: true,
  is_available: true,
  city_name: "Nouakchott",
  region_name: "Nouakchott-Nord",
  national_id_number: "ID-12345",
  national_id_document: "/media/ids/amadou.jpg",
  driver_photo: "/media/photos/amadou.jpg",
  license_file: "/media/licenses/amadou.jpg",
  license_status: "valid",
  license_expires_at: "2027-01-01T00:00:00Z",
  vehicle_registration_status: "expiring_soon",
  vehicle_registration_expires_at: "2026-02-01T00:00:00Z",
  insurance_status: "valid",
  insurance_expires_at: "2027-03-01T00:00:00Z",
  vignette_status: "expired",
  vignette_expires_at: "2024-01-01T00:00:00Z",
  vehicle_make: "Toyota",
  vehicle_model: "Corolla",
  vehicle_color: "White",
  vehicle_plate: "RIM-111",
  driver_category_label: "Sedan",
  total_rides_completed: 40,
  total_rides_cancelled: 3,
  acceptance_rate_computed: 92.5,
  average_rating: "4.75",
  date_joined: "2024-01-10T10:00:00Z",
};

function renderDrawer(props = {}) {
  return render(
    <DriverDetailsDrawer
      driver={DRIVER}
      open
      getFileUrl={(p) => p}
      onClose={jest.fn()}
      onApprove={jest.fn()}
      onReject={jest.fn()}
      onSuspendToggle={jest.fn()}
      {...props}
    />
  );
}

test("renders personal information from the loaded driver dict", () => {
  renderDrawer();
  const section = screen.getByText("Personal information").closest(".drivers-detail__section");
  expect(within(section).getByText("Full name").closest(".drivers-detail__field")).toHaveTextContent("Amadou Ba");
  expect(within(section).getByText("City / region").closest(".drivers-detail__field")).toHaveTextContent(
    "Nouakchott · Nouakchott-Nord"
  );
});

test("account, verification, and availability are three distinct fields", () => {
  renderDrawer();
  const section = screen.getByText("Account information").closest(".drivers-detail__section");
  expect(within(section).getByText("Account status")).toBeInTheDocument();
  expect(within(section).getByText("Verification status")).toBeInTheDocument();
  expect(within(section).getByText("Availability")).toBeInTheDocument();
});

test("performance renders real counters and honest empty states for Stage-2 gaps", () => {
  renderDrawer();
  const section = screen.getByText("Performance").closest(".drivers-detail__section");
  expect(within(section).getByText("Completed rides").closest(".drivers-detail__field")).toHaveTextContent("40");
  expect(within(section).getByText("Acceptance rate").closest(".drivers-detail__field")).toHaveTextContent("92.5%");
  expect(within(section).getByText("Average rating").closest(".drivers-detail__field")).toHaveTextContent("4.75");
});

test("all-time net earnings render N/A (never 0) when the driver has no completed rides", async () => {
  renderDrawer();
  const section = screen.getByText("Performance").closest(".drivers-detail__section");
  const field = within(section)
    .getByText("Driver earnings (net, all time)")
    .closest(".drivers-detail__field");
  await waitFor(() => expect(field).toHaveTextContent("N/A"));
  expect(field).not.toHaveTextContent("0.00");
});

test("completed rides render N/A (never 0) when the key is absent", () => {
  renderDrawer({ driver: { ...DRIVER, total_rides_completed: undefined } });
  const section = screen.getByText("Performance").closest(".drivers-detail__section");
  const field = within(section).getByText("Completed rides").closest(".drivers-detail__field");
  expect(field).toHaveTextContent("N/A");
  expect(field).not.toHaveTextContent("0");
});

test("average rating renders N/A (never 0) when null", () => {
  renderDrawer({ driver: { ...DRIVER, average_rating: null } });
  const section = screen.getByText("Performance").closest(".drivers-detail__section");
  const field = within(section).getByText("Average rating").closest(".drivers-detail__field");
  expect(field).toHaveTextContent("N/A");
});

test("last login / last seen / device are honest 'N/A' when the backend has no data", async () => {
  renderDrawer();
  const section = screen.getByText("Account information").closest(".drivers-detail__section");
  const lastLogin = within(section).getByText("Last login").closest(".drivers-detail__field");
  await waitFor(() => expect(lastLogin).toHaveTextContent("N/A"));
  expect(within(section).getByText("Last seen").closest(".drivers-detail__field")).toHaveTextContent("N/A");
  expect(within(section).getByText("Last active device").closest(".drivers-detail__field")).toHaveTextContent(
    "N/A"
  );
});

test("identity document and license links use the public getFileUrl (serving unchanged)", () => {
  renderDrawer();
  expect(screen.getByRole("link", { name: /view national id document/i })).toHaveAttribute(
    "href",
    "/media/ids/amadou.jpg"
  );
  expect(screen.getByRole("link", { name: /view license/i })).toHaveAttribute(
    "href",
    "/media/licenses/amadou.jpg"
  );
});

test("vehicle section renders make/model/color/plate but NOT year or seating capacity", () => {
  const { container } = renderDrawer();
  const section = screen.getByText("Vehicle information").closest(".drivers-detail__section");
  expect(within(section).getByText("Make").closest(".drivers-detail__field")).toHaveTextContent("Toyota");
  expect(within(section).getByText("Plate").closest(".drivers-detail__field")).toHaveTextContent("RIM-111");
  expect(container.textContent).not.toMatch(/seating capacity/i);
  expect(within(section).queryByText(/vehicle year/i)).not.toBeInTheDocument();
});

test("no delete control is ever rendered in the drawer", () => {
  renderDrawer();
  expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
});

test("does not surface latitude/longitude or other unexpected sensitive fields", () => {
  const { container } = renderDrawer({
    driver: { ...DRIVER, current_lat: 18.0735, current_lng: -15.9582 },
  });
  expect(container.textContent).not.toContain("18.0735");
  expect(container.textContent).not.toContain("-15.9582");
});

test("driver agreement section shows 'Not signed' and the completion message when incomplete", () => {
  // Pending driver with no legal_signature (incomplete) — Approve must be blocked.
  renderDrawer({
    driver: { ...DRIVER, status: "pending", legal_signature: { signature_complete: false } },
  });
  const section = screen.getByText("Driver Agreement / Legal").closest(".drivers-detail__section");
  expect(within(section).getByText("Not signed")).toBeInTheDocument();
  expect(
    within(section).getByText(
      /must complete the electronic signature in the Yala Driver app before approval/i
    )
  ).toBeInTheDocument();
});

test("Approve is disabled for a pending driver whose e-signature is incomplete", () => {
  renderDrawer({
    driver: { ...DRIVER, status: "pending", legal_signature: { signature_complete: false } },
  });
  const approve = screen.getByRole("button", { name: /^approve$/i });
  expect(approve).toBeDisabled();
  // A clear on-screen explanation accompanies the disabled Approve.
  expect(
    screen.getByText(/Approve is disabled: the driver must complete the electronic signature/i)
  ).toBeInTheDocument();
});

test("Approve is enabled for a pending driver with a complete e-signature", () => {
  renderDrawer({
    driver: {
      ...DRIVER,
      status: "pending",
      legal_signature: {
        signature_complete: true,
        driver_terms_accepted_at: "2026-07-24T14:11:18Z",
        driver_terms_version: "v1.0",
      },
    },
  });
  const approve = screen.getByRole("button", { name: /^approve$/i });
  expect(approve).not.toBeDisabled();
});

test("driver agreement section renders Signed, date, version, and the signature image when complete", () => {
  renderDrawer({
    driver: {
      ...DRIVER,
      legal_signature: {
        signature_complete: true,
        driver_terms_accepted_at: "2026-07-24T14:11:18Z",
        driver_terms_version: "v1.0",
        signature_image_url: "/media/legal/driver_signatures/amadou.png",
      },
    },
  });
  const section = screen.getByText("Driver Agreement / Legal").closest(".drivers-detail__section");
  expect(within(section).getByText("Signed")).toBeInTheDocument();
  expect(within(section).getByText("Agreement version").closest(".drivers-detail__field")).toHaveTextContent(
    "v1.0"
  );
  const img = within(section).getByRole("img", { name: /agreement signature/i });
  expect(img).toHaveAttribute("src", "/media/legal/driver_signatures/amadou.png");
});

// ─── Stage 2: per-driver admin data ─────────────────────────────────────────

test("Stage 2 fetches use the DriverProfile id (driver.id), never the user id", async () => {
  renderDrawer();
  await waitFor(() => expect(getDriverActivity).toHaveBeenCalled());
  // DRIVER.id = 7 is the DriverProfile id; DRIVER.user_id = 107 must NOT be used.
  expect(getDriverActivity).toHaveBeenCalledWith(7);
  expect(getDriverEarnings).toHaveBeenCalledWith(7);
  expect(getDriverPayouts).toHaveBeenCalledWith(7);
  expect(getDriverRideHistory).toHaveBeenCalledWith(7, expect.objectContaining({ page: 1 }));
  [getDriverActivity, getDriverEarnings, getDriverPayouts].forEach((fn) =>
    expect(fn).not.toHaveBeenCalledWith(107)
  );
});

test("no Stage 2 fetch happens while the drawer is closed", () => {
  render(
    <DriverDetailsDrawer
      driver={DRIVER}
      open={false}
      getFileUrl={(p) => p}
      onClose={jest.fn()}
      onApprove={jest.fn()}
      onReject={jest.fn()}
      onSuspendToggle={jest.fn()}
    />
  );
  expect(getDriverActivity).not.toHaveBeenCalled();
  expect(getDriverEarnings).not.toHaveBeenCalled();
  expect(getDriverPayouts).not.toHaveBeenCalled();
  expect(getDriverRideHistory).not.toHaveBeenCalled();
});

test("activity renders real last login, last seen and device", async () => {
  getDriverActivity.mockResolvedValue({
    last_login: "2026-07-20T08:00:00Z",
    last_seen: "2026-07-21T09:30:00Z",
    last_seen_device: "Pixel 8",
  });
  renderDrawer();
  const section = screen.getByText("Account information").closest(".drivers-detail__section");
  const device = within(section).getByText("Last active device").closest(".drivers-detail__field");
  await waitFor(() => expect(device).toHaveTextContent("Pixel 8"));
  expect(within(section).getByText("Last login").closest(".drivers-detail__field")).not.toHaveTextContent("N/A");
});

test("earnings keep driver earnings and platform commission separate, with N/A for empty periods", async () => {
  const filled = { earnings_mru: "500.00", commission_mru: "120.00", payout_mru: "500.00", ride_count: 2, currency: "MRU" };
  getDriverEarnings.mockResolvedValue({
    total: filled,
    today: EMPTY_BUCKET,
    week: filled,
    month: filled,
    currency: "MRU",
  });
  renderDrawer();
  const section = (await screen.findByText("Earnings")).closest(".drivers-detail__section");
  // Labels appear both as a field <dt> and a table <th>; target the field.
  const field = (label) =>
    within(section)
      .getAllByText(label)
      .find((el) => el.tagName === "DT")
      .closest(".drivers-detail__field");
  await waitFor(() => expect(field("Platform commission")).toHaveTextContent("120.00 MRU"));
  expect(field("Driver earnings (net)")).toHaveTextContent("500.00 MRU");
  // "Today" has no completed rides -> N/A, never a fabricated 0.00.
  const todayRow = within(section).getByText("Today").closest("tr");
  expect(todayRow).toHaveTextContent("N/A");
  expect(todayRow).not.toHaveTextContent("0.00");
});

test("ride history renders rows with fare and driver earning, plus the summary", async () => {
  getDriverRideHistory.mockResolvedValue({
    count: 1,
    page: 1,
    page_size: 10,
    total_pages: 1,
    results: [
      {
        id: 901,
        pickup: "Ksar",
        destination: "Tevragh Zeina",
        rider_name: "Aicha Mint",
        rider_email: "aicha@mail.com",
        status: "completed",
        fare: "300.00",
        driver_earning: "240.00",
        payment_status: "paid",
        created_at: "2026-07-20T10:00:00Z",
        completed_at: "2026-07-20T10:25:00Z",
      },
    ],
    summary: {
      total_rides: 1,
      completed_rides: 1,
      cancelled_rides: 0,
      total_earnings_mru: "240.00",
      average_earning_mru: "240.00",
    },
  });
  renderDrawer();
  const row = (await screen.findByText("#901")).closest("tr");
  expect(row).toHaveTextContent("300.00 MRU");
  expect(row).toHaveTextContent("240.00 MRU");
  expect(row).toHaveTextContent("Aicha Mint");
  const section = screen.getByText("Ride history").closest(".drivers-detail__section");
  expect(within(section).getByText("Average earning per ride").closest(".drivers-detail__field")).toHaveTextContent(
    "240.00 MRU"
  );
});

test("payout history renders the redacted method and never a token or card number", async () => {
  getDriverPayouts.mockResolvedValue({
    count: 1,
    page: 1,
    page_size: 25,
    total_pages: 1,
    results: [
      {
        id: 55,
        amount: "1000.00",
        currency: "MRU",
        status: "approved",
        payout_method_label: "bankily 22200000",
        approved_at: "2026-07-21T10:00:00Z",
        paid_at: null,
        created_at: "2026-07-21T09:00:00Z",
        // Defensive: even if these leaked into the payload they must not render.
        provider_token: "tok_SECRET_123",
        card_number: "4111111111111111",
      },
    ],
  });
  const { container } = renderDrawer();
  const row = (await screen.findByText("#55")).closest("tr");
  expect(row).toHaveTextContent("1,000.00 MRU");
  expect(row).toHaveTextContent("bankily 22200000");
  expect(container.textContent).not.toContain("tok_SECRET_123");
  expect(container.textContent).not.toContain("4111111111111111");
  // Approved but unpaid -> Paid column is N/A, and the UI states approval != payment.
  expect(screen.getByText(/does not mean paid/i)).toBeInTheDocument();
});

test("each Stage 2 section shows its own error state when its fetch fails", async () => {
  getDriverEarnings.mockRejectedValue(new Error("earnings boom"));
  getDriverPayouts.mockRejectedValue(new Error("payouts boom"));
  renderDrawer();
  expect(await screen.findByText("earnings boom")).toBeInTheDocument();
  expect(await screen.findByText("payouts boom")).toBeInTheDocument();
  // Stage 1 content is unaffected by Stage 2 failures.
  expect(screen.getByText("Driver Agreement / Legal")).toBeInTheDocument();
});

test("audit history renders the administrator, transition and reason", async () => {
  getDriverAuditTrail.mockResolvedValue([
    {
      id: 7,
      action: "approve",
      entity_type: "driver",
      entity_id: "3",
      summary: "Driver approved",
      actor_email: "ops@yala.mr",
      details: { previous_status: "pending", new_status: "approved", reason: "" },
      created_at: "2026-10-20T10:00:00Z",
    },
    {
      id: 8,
      action: "approval_blocked",
      entity_type: "driver",
      entity_id: "3",
      summary: "Driver approval blocked",
      actor_email: "ops@yala.mr",
      details: {
        previous_status: "pending",
        new_status: "pending",
        reason: "driver_signature_required",
      },
      created_at: "2026-10-21T10:00:00Z",
    },
  ]);

  renderDrawer();

  expect(await screen.findByText("Audit history")).toBeInTheDocument();
  expect(await screen.findByText("approval_blocked")).toBeInTheDocument();
  expect(await screen.findByText("driver_signature_required")).toBeInTheDocument();
  expect((await screen.findAllByText("ops@yala.mr")).length).toBeGreaterThan(0);
});

test("audit history shows an honest empty state when nothing is recorded", async () => {
  renderDrawer();
  expect(
    await screen.findByText("No administrative actions recorded for this driver yet.")
  ).toBeInTheDocument();
});

test("audit history surfaces its own error without breaking the drawer", async () => {
  getDriverAuditTrail.mockRejectedValue(new Error("audit boom"));
  renderDrawer();
  expect(await screen.findByText("audit boom")).toBeInTheDocument();
  expect(screen.getByText("Driver Agreement / Legal")).toBeInTheDocument();
});

test("driver audit trail is requested with the DriverProfile id", async () => {
  renderDrawer();
  await waitFor(() => expect(getDriverAuditTrail).toHaveBeenCalledWith(7));
});

