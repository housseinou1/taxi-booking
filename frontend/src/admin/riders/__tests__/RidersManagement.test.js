import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";

import RidersManagement from "../RidersManagement";
import {
  getRiderActivity,
  getRiderAuditLogs,
  getRiderSupport,
  getRiderPayments,
  getRiderRideHistory,
} from "../ridersApi";

// The details drawer now fetches rider data from ridersApi on open; mock it so
// opening the drawer in these list-level tests resolves to empty sections
// without hitting the network. (Drawer-specific rendering is covered in
// RiderDetailsDrawer.test.js.) Implementations are set in beforeEach because
// CRA's jest config enables resetMocks, which clears them between tests.
jest.mock("../ridersApi");

beforeEach(() => {
  getRiderRideHistory.mockResolvedValue({ count: 0, total_pages: 1, results: [], summary: null });
  getRiderPayments.mockResolvedValue({ results: [], refunds: [] });
  getRiderActivity.mockResolvedValue({ last_login: null, last_seen: null, last_seen_device: null });
  getRiderAuditLogs.mockResolvedValue([]);
  getRiderSupport.mockResolvedValue({ count: 0, open_count: 0, results: [] });
});

// DataTable's export toolbar reads usePermissions via AdminActionGuard — mock
// the permission context so the module renders without a provider.
jest.mock("../../permissions/PermissionContext", () => ({
  usePermissions: () => ({
    permissions: { role: "ceo", modules: ["riders"], actions: {}, feature_flags: {} },
    canView: () => true,
    canAction: () => true,
    canApprove: () => true,
    canExport: () => true,
  }),
}));

const RIDERS = [
  {
    id: 1,
    full_name: "Amina Diallo",
    email: "amina@mail.com",
    phone_number: "+221700000001",
    rider_status: "approved",
    rider_status_label: "Approved",
    is_active: true,
    phone_verified: true,
    has_national_id_document: true,
    rider_rating_count: 3,
    rider_average_rating: 4.5,
    date_joined: "2026-01-10T10:00:00Z",
  },
  {
    id: 2,
    full_name: "Test Rider",
    email: "qa+tester@example.com",
    phone_number: "+221700000002",
    rider_status: "pending",
    rider_status_label: "Pending",
    is_active: true,
    phone_verified: false,
    has_national_id_document: false,
    date_joined: "2026-03-05T10:00:00Z",
  },
  {
    id: 3,
    full_name: "Mamadou Sy",
    email: "mamadou@mail.com",
    phone_number: "+221700000003",
    rider_status: "rejected",
    rider_status_label: "Rejected",
    is_active: false,
    date_joined: "2026-02-01T10:00:00Z",
  },
];

function renderModule(props = {}) {
  return render(
    <RidersManagement
      riders={RIDERS}
      rides={[]}
      getFileUrl={(p) => p}
      onApproveRider={jest.fn()}
      onRejectRider={jest.fn()}
      onBlockUser={jest.fn()}
      {...props}
    />
  );
}

test("summary cards show real counts from the riders fixture", () => {
  renderModule();
  const totalCard = screen.getByText("Total Riders").closest(".admin-kpi");
  expect(within(totalCard).getByText("3")).toBeInTheDocument();
  const activeCard = screen.getByText("Active Riders").closest(".admin-kpi");
  expect(within(activeCard).getByText("2")).toBeInTheDocument();
  const pendingCard = screen.getByText("Pending Verification").closest(".admin-kpi");
  expect(within(pendingCard).getByText("1")).toBeInTheDocument();
  const verifiedCard = screen.getByText("Verified Riders").closest(".admin-kpi");
  expect(within(verifiedCard).getByText("1")).toBeInTheDocument();
  const suspendedCard = screen.getByText("Suspended Riders").closest(".admin-kpi");
  expect(within(suspendedCard).getByText("1")).toBeInTheDocument();
});

test("account status and verification render as two separate columns", () => {
  renderModule();
  expect(screen.getByRole("columnheader", { name: /identity verification/i })).toBeInTheDocument();
  expect(screen.getByRole("columnheader", { name: /account status/i })).toBeInTheDocument();
});

test("TEST/QA badge appears for a seeded test account", () => {
  renderModule();
  expect(screen.getAllByText("TEST/QA").length).toBeGreaterThan(0);
});

test("completed rides shows N/A (never a fabricated number) when rides are unavailable", () => {
  renderModule({ rides: [] });
  expect(screen.getAllByText("N/A").length).toBeGreaterThan(0);
});

test("search narrows the visible rows", () => {
  renderModule();
  expect(screen.getByText("Amina Diallo")).toBeInTheDocument();
  expect(screen.getByText("Mamadou Sy")).toBeInTheDocument();
  fireEvent.change(screen.getByPlaceholderText(/search name/i), { target: { value: "amina" } });
  expect(screen.getByText("Amina Diallo")).toBeInTheDocument();
  expect(screen.queryByText("Mamadou Sy")).not.toBeInTheDocument();
});

test("verification filter narrows the visible rows", () => {
  renderModule();
  fireEvent.change(screen.getByLabelText("Verification"), { target: { value: "rejected" } });
  expect(screen.getByText("Mamadou Sy")).toBeInTheDocument();
  expect(screen.queryByText("Amina Diallo")).not.toBeInTheDocument();
});

test("account filter narrows the visible rows", () => {
  renderModule();
  fireEvent.change(screen.getByLabelText("Account"), { target: { value: "suspended" } });
  expect(screen.getByText("Mamadou Sy")).toBeInTheDocument();
  expect(screen.queryByText("Amina Diallo")).not.toBeInTheDocument();
});

test("empty filter result shows the 'no match' message", () => {
  renderModule();
  fireEvent.change(screen.getByPlaceholderText(/search name/i), { target: { value: "zzzz" } });
  expect(screen.getByText("No riders match your filters")).toBeInTheDocument();
});

test("empty riders list shows the 'no riders found' message", () => {
  renderModule({ riders: [] });
  expect(screen.getByText("No riders found")).toBeInTheDocument();
});

test("error state is surfaced", () => {
  renderModule({ error: "Failed to load riders" });
  expect(screen.getByText("Failed to load riders")).toBeInTheDocument();
});

test("Approve is disabled for an already-approved rider, Reject disabled for a rejected rider", () => {
  renderModule();
  const aminaRow = screen.getByText("Amina Diallo").closest("tr");
  expect(within(aminaRow).getByRole("button", { name: /approve verification for amina/i })).toBeDisabled();
  const mamadouRow = screen.getByText("Mamadou Sy").closest("tr");
  expect(within(mamadouRow).getByRole("button", { name: /reject verification for mamadou/i })).toBeDisabled();
});

test("Approve calls the injected handler immediately (its own confirm lives in the handler)", () => {
  const onApproveRider = jest.fn();
  renderModule({ onApproveRider });
  const pendingRow = screen.getByText("Test Rider").closest("tr");
  fireEvent.click(within(pendingRow).getByRole("button", { name: /approve verification for test rider/i }));
  expect(onApproveRider).toHaveBeenCalledWith(2);
});

test("Reject routes through the reason-prompting injected handler", () => {
  const onRejectRider = jest.fn();
  renderModule({ onRejectRider });
  const pendingRow = screen.getByText("Test Rider").closest("tr");
  fireEvent.click(within(pendingRow).getByRole("button", { name: /reject verification for test rider/i }));
  expect(onRejectRider).toHaveBeenCalledWith(2);
});

test("Deactivate requires explicit confirmation before calling the handler", () => {
  const onBlockUser = jest.fn();
  renderModule({ onBlockUser });
  const aminaRow = screen.getByText("Amina Diallo").closest("tr");
  fireEvent.click(within(aminaRow).getByRole("button", { name: /deactivate account for amina/i }));
  // Not called yet — confirmation dialog is open.
  expect(onBlockUser).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Deactivate Account" }));
  // onBlockUser(id, isActive) — isActive true means "deactivate" (block).
  expect(onBlockUser).toHaveBeenCalledWith(1, true);
});

test("Deactivate cancel does not call the handler", () => {
  const onBlockUser = jest.fn();
  renderModule({ onBlockUser });
  const aminaRow = screen.getByText("Amina Diallo").closest("tr");
  fireEvent.click(within(aminaRow).getByRole("button", { name: /deactivate account for amina/i }));
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(onBlockUser).not.toHaveBeenCalled();
});

test("there is NO permanent Delete action in the riders table (deactivate only)", () => {
  renderModule();
  // The dangerous hard-delete button was replaced by Deactivate Account.
  expect(screen.queryByRole("button", { name: /delete account for/i })).not.toBeInTheDocument();
  const aminaRow = screen.getByText("Amina Diallo").closest("tr");
  expect(
    within(aminaRow).getByRole("button", { name: /deactivate account for amina/i })
  ).toBeInTheDocument();
});

test("row Details opens the details drawer", () => {
  renderModule();
  const aminaRow = screen.getByText("Amina Diallo").closest("tr");
  fireEvent.click(within(aminaRow).getByRole("button", { name: /view details for amina/i }));
  expect(screen.getByRole("dialog")).toBeInTheDocument();
});

test("suspending from inside the drawer keeps a single modal surface (no stacking)", () => {
  const onBlockUser = jest.fn();
  renderModule({ onBlockUser });
  // Open the details drawer for Amina.
  const aminaRow = screen.getByText("Amina Diallo").closest("tr");
  fireEvent.click(within(aminaRow).getByRole("button", { name: /view details for amina/i }));
  expect(screen.getByRole("dialog")).toBeInTheDocument(); // drawer only

  // Click "Suspend account" inside the drawer.
  fireEvent.click(screen.getByRole("button", { name: "Suspend account" }));

  // Phase 4: the reason dialog renders INSIDE the drawer, so there is still
  // exactly ONE modal surface (the drawer) and no stacked confirmation dialog.
  const dialogs = screen.getAllByRole("dialog");
  expect(dialogs).toHaveLength(1);
  expect(screen.getByText("Suspend rider account")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();

  // A reason is mandatory: confirming with an empty reason surfaces the rule
  // and does NOT call the backend.
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
  expect(
    screen.getByText("A clear reason (5+ characters) is required.")
  ).toBeInTheDocument();
});

test("loading state renders the table skeleton (no rows)", () => {
  renderModule({ loading: true });
  expect(screen.queryByText("Amina Diallo")).not.toBeInTheDocument();
});
