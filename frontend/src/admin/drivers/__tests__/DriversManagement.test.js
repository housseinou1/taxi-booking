import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";

import DriversManagement from "../DriversManagement";
import {
  getDriverActivity,
  getDriverAuditTrail,
  getDriverEarnings,
  getDriverPayouts,
  getDriverRideHistory,
} from "../driversApi";

// DataTable's export toolbar + the RBAC guards read usePermissions via
// AdminActionGuard — mock the permission context so the module renders without
// a provider and all actions are allowed.
jest.mock("../../permissions/PermissionContext", () => ({
  usePermissions: () => ({
    permissions: { role: "ceo", modules: ["drivers"], actions: {}, feature_flags: {} },
    canView: () => true,
    canAction: () => true,
    canApprove: () => true,
    canExport: () => true,
  }),
}));

// Opening the details drawer triggers the Stage 2 per-driver fetches; mock
// them so the table tests never touch the network. CRA's Jest config uses
// resetMocks, so implementations are (re)applied in beforeEach.
jest.mock("../driversApi", () => ({
  getDriverActivity: jest.fn(),
  getDriverAuditTrail: jest.fn(),
  getDriverEarnings: jest.fn(),
  getDriverPayouts: jest.fn(),
  getDriverRideHistory: jest.fn(),
}));

beforeEach(() => {
  const emptyBucket = { earnings_mru: null, commission_mru: null, payout_mru: null, ride_count: 0, currency: "MRU" };
  getDriverActivity.mockResolvedValue({ last_login: null, last_seen: null, last_seen_device: null });
  getDriverEarnings.mockResolvedValue({
    total: emptyBucket,
    today: emptyBucket,
    week: emptyBucket,
    month: emptyBucket,
    currency: "MRU",
  });
  getDriverPayouts.mockResolvedValue({ count: 0, total_pages: 1, results: [] });
  getDriverAuditTrail.mockResolvedValue([]);
  getDriverRideHistory.mockResolvedValue({ count: 0, total_pages: 1, results: [], summary: null });
});

const DRIVERS = [
  {
    id: 1,
    user_id: 101,
    driver_code: "D001",
    driver_name: "Amadou Ba",
    email: "amadou@mail.com",
    phone_number: "+221700000001",
    vehicle_plate: "RIM-111",
    driver_category_label: "Sedan",
    car_type: "sedan",
    is_courier: false,
    status: "approved",
    is_active: true,
    is_available: true,
    city_name: "Nouakchott",
    total_rides_completed: 40,
    average_rating: "4.75",
    license_status: "valid",
    vehicle_registration_status: "valid",
    insurance_status: "valid",
    date_joined: "2024-01-10T10:00:00Z",
  },
  {
    id: 2,
    user_id: 102,
    driver_code: "D002",
    driver_name: "Fatou Sow",
    email: "fatou@mail.com",
    phone_number: "+221700000002",
    vehicle_plate: "RIM-222",
    driver_category_label: "Van",
    is_courier: false,
    status: "pending",
    is_active: true,
    is_available: false,
    city_name: "Nouadhibou",
    // total_rides_completed ABSENT -> must render N/A, never 0.
    average_rating: null,
    license_status: "expiring_soon",
    // Signed, eligible pending driver -> Approve must remain enabled.
    legal_signature: { signature_complete: true },
    date_joined: "2024-03-05T10:00:00Z",
  },
  {
    id: 3,
    user_id: 103,
    driver_code: "D003",
    driver_name: "Moussa Diop",
    email: "moussa@mail.com",
    phone_number: "+221700000003",
    vehicle_plate: "RIM-333",
    driver_category_label: "Sedan",
    is_courier: false,
    status: "rejected",
    is_active: false,
    is_available: false,
    city_name: "Nouakchott",
    total_rides_completed: 7,
    average_rating: "3.10",
    date_joined: "2024-02-01T10:00:00Z",
  },
];

function renderModule(props = {}) {
  return render(
    <DriversManagement
      drivers={DRIVERS}
      getFileUrl={(p) => p}
      onApproveDriver={jest.fn()}
      onRejectDriver={jest.fn()}
      onBlockUser={jest.fn()}
      onReintegrate={jest.fn()}
      {...props}
    />
  );
}

test("summary cards show real counts from the drivers fixture", () => {
  renderModule();
  // Scope label lookups to the KPI label node so they do not collide with the
  // same words appearing in filter options or status chips.
  const kpiCard = (label) =>
    screen
      .getAllByText(label)
      .map((node) => node.closest(".admin-kpi"))
      .find(Boolean);
  expect(within(kpiCard("Total Drivers")).getByText("3")).toBeInTheDocument();
  expect(within(kpiCard("Approved")).getByText("1")).toBeInTheDocument();
  expect(within(kpiCard("Pending")).getByText("1")).toBeInTheDocument();
  expect(within(kpiCard("Rejected")).getByText("1")).toBeInTheDocument();
  expect(within(kpiCard("Online")).getByText("1")).toBeInTheDocument();
});

test("completed-rides KPI is N/A (never a fabricated 0) when any driver lacks the key", () => {
  renderModule();
  const card = screen.getByText("Completed Rides").closest(".admin-kpi");
  expect(within(card).getByText("N/A")).toBeInTheDocument();
});

test("account, verification, and availability render as three separate columns", () => {
  renderModule();
  expect(screen.getByRole("columnheader", { name: /identity verification/i })).toBeInTheDocument();
  expect(screen.getByRole("columnheader", { name: /account status/i })).toBeInTheDocument();
  expect(screen.getByRole("columnheader", { name: /availability/i })).toBeInTheDocument();
});

test("a driver missing total_rides_completed shows N/A in the rides column", () => {
  renderModule();
  const row = screen.getByText("Fatou Sow").closest("tr");
  // The completed-rides cell (and the null-rating cell) render N/A, never a
  // fabricated 0. Fatou also has a null average_rating, so both cells are N/A.
  expect(within(row).getAllByText("N/A").length).toBeGreaterThan(0);
  expect(within(row).queryByText("0")).not.toBeInTheDocument();
});

test("search narrows the visible rows", () => {
  renderModule();
  expect(screen.getByText("Amadou Ba")).toBeInTheDocument();
  expect(screen.getByText("Moussa Diop")).toBeInTheDocument();
  fireEvent.change(screen.getByPlaceholderText(/search name/i), { target: { value: "amadou" } });
  expect(screen.getByText("Amadou Ba")).toBeInTheDocument();
  expect(screen.queryByText("Moussa Diop")).not.toBeInTheDocument();
});

test("verification filter narrows the visible rows", () => {
  renderModule();
  fireEvent.change(screen.getByLabelText("Verification"), { target: { value: "rejected" } });
  expect(screen.getByText("Moussa Diop")).toBeInTheDocument();
  expect(screen.queryByText("Amadou Ba")).not.toBeInTheDocument();
});

test("account filter narrows the visible rows", () => {
  renderModule();
  fireEvent.change(screen.getByLabelText("Account"), { target: { value: "suspended" } });
  expect(screen.getByText("Moussa Diop")).toBeInTheDocument();
  expect(screen.queryByText("Amadou Ba")).not.toBeInTheDocument();
});

test("availability filter narrows the visible rows", () => {
  renderModule();
  // "Availability" also labels the DataTable column-visibility checkbox, so
  // target the filter dropdown specifically (role=combobox).
  fireEvent.change(screen.getByRole("combobox", { name: "Availability" }), {
    target: { value: "online" },
  });
  expect(screen.getByText("Amadou Ba")).toBeInTheDocument();
  expect(screen.queryByText("Fatou Sow")).not.toBeInTheDocument();
});

test("empty filter result shows the 'no match' message", () => {
  renderModule();
  fireEvent.change(screen.getByPlaceholderText(/search name/i), { target: { value: "zzzz" } });
  expect(screen.getByText("No drivers match your filters")).toBeInTheDocument();
});

test("empty drivers list shows the 'no drivers found' message", () => {
  renderModule({ drivers: [] });
  expect(screen.getByText("No drivers found")).toBeInTheDocument();
});

test("error state is surfaced", () => {
  renderModule({ error: "Failed to load drivers" });
  expect(screen.getByText("Failed to load drivers")).toBeInTheDocument();
});

test("Approve disabled for an approved driver, Reject disabled for a rejected driver", () => {
  renderModule();
  const amadouRow = screen.getByText("Amadou Ba").closest("tr");
  expect(within(amadouRow).getByRole("button", { name: /approve amadou/i })).toBeDisabled();
  const moussaRow = screen.getByText("Moussa Diop").closest("tr");
  expect(within(moussaRow).getByRole("button", { name: /reject moussa/i })).toBeDisabled();
});

test("Approve stays enabled and calls the handler for a signed, eligible pending driver", () => {
  // Fatou (pending) has legal_signature.signature_complete = true.
  const onApproveDriver = jest.fn();
  renderModule({ onApproveDriver });
  const pendingRow = screen.getByText("Fatou Sow").closest("tr");
  const approveBtn = within(pendingRow).getByRole("button", { name: /approve fatou/i });
  expect(approveBtn).not.toBeDisabled();
  fireEvent.click(approveBtn);
  expect(onApproveDriver).toHaveBeenCalledWith(2);
});

test("Approve is DISABLED in the table for a pending driver with an incomplete signature", () => {
  const onApproveDriver = jest.fn();
  const UNSIGNED = {
    id: 99,
    user_id: 199,
    driver_code: "D099",
    driver_name: "Unsigned Driver",
    email: "unsigned@mail.com",
    phone_number: "+221700000099",
    is_courier: false,
    status: "pending",
    is_active: true,
    is_available: false,
    city_name: "Nouakchott",
    average_rating: null,
    // No legal_signature -> signature incomplete -> Approve must be blocked.
    date_joined: "2024-05-01T10:00:00Z",
  };
  renderModule({ drivers: [UNSIGNED], onApproveDriver });
  const row = screen.getByText("Unsigned Driver").closest("tr");
  const approveBtn = within(row).getByRole("button", { name: /approve unsigned/i });
  expect(approveBtn).toBeDisabled();
  // A disabled button does not invoke the handler.
  fireEvent.click(approveBtn);
  expect(onApproveDriver).not.toHaveBeenCalled();
  // Clear explanation is exposed via the button title.
  expect(approveBtn).toHaveAttribute(
    "title",
    expect.stringMatching(/complete the electronic signature in the Yala Driver app/i)
  );
});

test("Reject routes through the reason-prompting injected handler", () => {
  const onRejectDriver = jest.fn();
  renderModule({ onRejectDriver });
  const pendingRow = screen.getByText("Fatou Sow").closest("tr");
  fireEvent.click(within(pendingRow).getByRole("button", { name: /reject fatou/i }));
  expect(onRejectDriver).toHaveBeenCalledWith(2);
});

test("Suspend requires explicit confirmation and passes user_id + shouldBlock", () => {
  const onBlockUser = jest.fn();
  renderModule({ onBlockUser });
  const amadouRow = screen.getByText("Amadou Ba").closest("tr");
  fireEvent.click(within(amadouRow).getByRole("button", { name: /suspend account for amadou/i }));
  expect(onBlockUser).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Suspend" }));
  expect(onBlockUser).toHaveBeenCalledWith(101, true);
});

test("Reactivate (suspended driver) passes shouldBlock=false", () => {
  const onBlockUser = jest.fn();
  renderModule({ onBlockUser });
  const moussaRow = screen.getByText("Moussa Diop").closest("tr");
  fireEvent.click(within(moussaRow).getByRole("button", { name: /reactivate account for moussa/i }));
  fireEvent.click(screen.getByRole("button", { name: "Reactivate" }));
  expect(onBlockUser).toHaveBeenCalledWith(103, false);
});

test("Suspend cancel does not call the handler", () => {
  const onBlockUser = jest.fn();
  renderModule({ onBlockUser });
  const amadouRow = screen.getByText("Amadou Ba").closest("tr");
  fireEvent.click(within(amadouRow).getByRole("button", { name: /suspend account for amadou/i }));
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(onBlockUser).not.toHaveBeenCalled();
});

test("there is NO delete action anywhere", () => {
  renderModule();
  expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
});

test("row Details opens the details drawer", () => {
  renderModule();
  const amadouRow = screen.getByText("Amadou Ba").closest("tr");
  fireEvent.click(within(amadouRow).getByRole("button", { name: /view details for amadou/i }));
  expect(screen.getByRole("dialog")).toBeInTheDocument();
});

test("suspending from inside the drawer closes the drawer so dialogs do not stack", () => {
  const onBlockUser = jest.fn();
  renderModule({ onBlockUser });
  const amadouRow = screen.getByText("Amadou Ba").closest("tr");
  fireEvent.click(within(amadouRow).getByRole("button", { name: /view details for amadou/i }));
  expect(screen.getByRole("dialog")).toBeInTheDocument(); // drawer only

  fireEvent.click(screen.getByRole("button", { name: "Suspend account" }));

  // Exactly ONE modal surface should be present: the confirmation dialog, NOT
  // the drawer stacked beneath it.
  const dialogs = screen.getAllByRole("dialog");
  expect(dialogs).toHaveLength(1);
  expect(screen.getByRole("button", { name: "Suspend" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Suspend" }));
  expect(onBlockUser).toHaveBeenCalledWith(101, true);
});

test("loading state renders the table skeleton (no rows)", () => {
  renderModule({ loading: true });
  expect(screen.queryByText("Amadou Ba")).not.toBeInTheDocument();
});
