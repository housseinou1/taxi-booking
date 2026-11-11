/**
 * Phase 5 — Courier details drawer tests.
 *
 * Verifies:
 *  - documents render from metadata and open through the authenticated endpoint
 *    (never a public media URL)
 *  - the electronic-signature gate blocks Approve when incomplete
 *  - approve/reject go through the approval-center API; suspend/reactivate use the
 *    delivery endpoints with a mandatory reason
 *  - delivery history + audit trail are loaded per courier
 */
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import CourierDetailsDrawer from "../CourierDetailsDrawer";
import {
  approveCourier,
  fetchCourierAuditTrail,
  fetchCourierDeliveries,
  fetchCourierDocumentBlob,
  fetchCourierRequirements,
  fetchCourierSignatureBlob,
  reactivateCourier,
  rejectCourier,
  suspendCourier,
} from "../deliveryApi";

jest.mock("../deliveryApi");

const COURIER = {
  id: 11,
  user_id: 101,
  name: "Moussa Coura",
  email: "moussa@yala.test",
  phone_number: "+22245000101",
  phone_verified: true,
  is_active: true,
  status: "pending",
  status_label: "Pending",
  courier_status: "pending",
  courier_status_label: "Pending",
  is_suspended: false,
  suspension_reason: "",
  courier_online: false,
  vehicle_type: "motorcycle",
  city_name: "Nouakchott",
  plate_number: "AB-123",
  total_deliveries_completed: 12,
  delivery_rating: "4.8",
  signature_complete: true,
  documents: [
    {
      id: 5,
      type: "national_id",
      label: "National ID",
      status: "approved",
      display_status: "Approved",
      is_uploaded: true,
      uploaded_at: "2026-02-02T10:00:00Z",
      expires_at: "2027-02-02",
    },
  ],
  onboarding: { message: "Your courier profile is complete.", steps: [] },
  legal_signature: {
    signature_complete: true,
    signed_full_name: "Moussa Coura",
    terms_version: "v1.0",
    terms_accepted_at: "2026-02-01T10:00:00Z",
    legal_declaration_accepted: true,
    signed_ip_address: "127.0.0.1",
    signed_device_info: "Android",
    terms_version_current: true,
    requires_resign: false,
    signature_image_available: true,
  },
  delivery_settings: {
    delivery_mode_enabled: true,
    vehicle_type: "motorcycle",
    max_package_size: "large",
    accepts_food: true,
    accepts_pharmacy: false,
    accepts_fragile: true,
    delivery_cities: ["Nouakchott"],
    is_suspended: false,
    suspension_reason: "",
    chat_warnings: 0,
  },
  earnings: {
    today: { count: 1, earnings: "220", commission: "55" },
    week: { count: 3, earnings: "660", commission: "165" },
    month: { count: 9, earnings: "1980", commission: "495" },
    total: { count: 12, earnings: "2640", commission: "660" },
  },
  wallet: {
    wallet_balance: "0",
    available_balance: "2640",
    pending_balance: "0",
    total_earned: "2640",
    completed_deliveries: 12,
  },
  delivery_summary: { total: 2, delivered: 1, cancelled: 1, active: 0, exceptions: 0 },
};

const REQUIREMENTS = {
  courier_id: 11,
  vehicle_type: "motorcycle",
  vehicle_label: "Motorcycle",
  documents: {
    vehicle_type: "motorcycle",
    vehicle_label: "Motorcycle",
    required_document_types: ["national_id", "license", "carte_grise", "insurance"],
    requirements: [
      {
        document_type: "national_id",
        label: "National ID",
        required: true,
        state: "approved",
        document_id: 5,
        expires_at: "2027-02-02",
        rejection_reason: "",
      },
      {
        document_type: "license",
        label: "Driver License",
        required: true,
        state: "pending_review",
        document_id: 6,
        expires_at: null,
        rejection_reason: "",
      },
      {
        document_type: "carte_grise",
        label: "Carte Grise (Vehicle Registration)",
        required: true,
        state: "missing",
        document_id: null,
        expires_at: null,
        rejection_reason: "",
      },
      {
        document_type: "insurance",
        label: "Insurance",
        required: true,
        state: "expired",
        document_id: 7,
        expires_at: "2026-01-01",
        rejection_reason: "",
      },
    ],
    not_required: [],
    states: { approved: 1, pending_review: 1, missing: 1, rejected: 0, expired: 1 },
  },
  approval_blockers: {
    vehicle_type: "motorcycle",
    vehicle_label: "Motorcycle",
    required_document_types: ["national_id", "license", "carte_grise", "insurance"],
    missing_document_types: ["carte_grise"],
    expired_document_types: ["insurance"],
    signature_complete: true,
    blocked: true,
    reasons: [
      "Missing or rejected document(s): Carte Grise (Vehicle Registration)",
      "Expired document(s): Insurance",
    ],
  },
  read_only: true,
};

const HISTORY = {
  count: 2,
  page: 1,
  page_size: 10,
  total_pages: 1,
  summary: { total: 2, delivered: 1, cancelled: 1, active: 0, exceptions: 0 },
  results: [
    {
      id: 501,
      status: "delivered",
      pickup: "Marché Central",
      destination: "Tevragh Zeina",
      fare: "275",
      driver_earning: "220",
      delivered_at: "2026-03-01T09:00:00Z",
    },
  ],
};

function renderDrawer(overrides = {}) {
  return render(
    <CourierDetailsDrawer
      courier={{ ...COURIER, ...overrides }}
      loading={false}
      error=""
      onClose={() => {}}
      onRetry={() => {}}
      onActionComplete={() => {}}
    />
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  fetchCourierDeliveries.mockResolvedValue(HISTORY);
  fetchCourierAuditTrail.mockResolvedValue([]);
  fetchCourierRequirements.mockResolvedValue(REQUIREMENTS);
  fetchCourierDocumentBlob.mockResolvedValue(new Blob(["x"], { type: "image/png" }));
  fetchCourierSignatureBlob.mockResolvedValue(new Blob(["sig"], { type: "image/png" }));
  approveCourier.mockResolvedValue({ message: "Courier approved" });
  rejectCourier.mockResolvedValue({ message: "Courier rejected" });
  suspendCourier.mockResolvedValue({ message: "Courier suspended", is_suspended: true });
  reactivateCourier.mockResolvedValue({ message: "Courier reactivated", is_suspended: false });
  window.open = jest.fn();
  window.URL.createObjectURL = jest.fn(() => "blob:courier-doc");
});

test("renders signature, settings, earnings and delivery history", async () => {
  renderDrawer();

  expect(document.querySelector(".courier-detail-drawer")).toBeTruthy();
  expect(screen.getAllByText("Moussa Coura").length).toBeGreaterThan(0);
  expect(screen.getByText("Electronic signature (courier agreement)")).toBeInTheDocument();
  expect(screen.getAllByText("v1.0").length).toBeGreaterThan(0);
  expect(screen.getAllByText("2640 MRU").length).toBeGreaterThan(0);
  expect(await screen.findByText("#501")).toBeInTheDocument();
  expect(fetchCourierDeliveries).toHaveBeenCalledWith(11, { page: 1, page_size: 10 });
});

test("opens documents through the authenticated endpoint, never a public URL", async () => {
  renderDrawer();

  fireEvent.click(screen.getByRole("button", { name: "View" }));

  await waitFor(() => expect(fetchCourierDocumentBlob).toHaveBeenCalledWith(11, 5));
  expect(window.URL.createObjectURL).toHaveBeenCalled();
});

test("blocks approval until the electronic signature is complete", () => {
  renderDrawer({
    signature_complete: false,
    legal_signature: { ...COURIER.legal_signature, signature_complete: false },
  });

  expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
  expect(
    screen.getByText(/Approval is blocked until the courier completes the electronic signature/i)
  ).toBeInTheDocument();
});


test("approves through the approval-center endpoint", async () => {
  renderDrawer();

  fireEvent.click(screen.getByRole("button", { name: "Approve" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

  await waitFor(() => expect(approveCourier).toHaveBeenCalledWith(11));
  expect(await screen.findByText("Courier approved")).toBeInTheDocument();
});

test("requires a rejection reason before calling the backend", async () => {
  renderDrawer();

  fireEvent.click(screen.getByRole("button", { name: "Reject" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

  expect(rejectCourier).not.toHaveBeenCalled();
  expect(screen.getByText(/rejection reason is required/i)).toBeInTheDocument();
});

test("suspends with a reason through the delivery endpoint", async () => {
  renderDrawer();

  fireEvent.click(screen.getByRole("button", { name: "Suspend courier" }));
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "Repeated delivery failures" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

  await waitFor(() =>
    expect(suspendCourier).toHaveBeenCalledWith(11, "Repeated delivery failures")
  );
  expect(await screen.findByText("Courier suspended")).toBeInTheDocument();
});

test("reactivates a suspended courier", async () => {
  renderDrawer({
    is_suspended: true,
    courier_status: "suspended",
    courier_status_label: "Suspended",
  });

  fireEvent.click(screen.getByRole("button", { name: "Reactivate courier" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

  await waitFor(() => expect(reactivateCourier).toHaveBeenCalledWith(11, ""));
});

test("loads the audit trail for the courier user", async () => {
  fetchCourierAuditTrail.mockResolvedValue([
    {
      id: 1,
      action: "suspend",
      summary: "Courier suspended: moussa@yala.test",
      created_at: "2026-03-02T10:00:00Z",
    },
  ]);

  renderDrawer();

  await waitFor(() => expect(fetchCourierAuditTrail).toHaveBeenCalledWith(101));
  expect(await screen.findByText(/Courier suspended: moussa@yala.test/)).toBeInTheDocument();
});

test("surfaces a delivery-history failure without breaking the drawer", async () => {
  fetchCourierDeliveries.mockRejectedValue({
    response: { data: { detail: "history boom" } },
  });

  renderDrawer();

  expect(await screen.findByText("history boom")).toBeInTheDocument();
  expect(screen.getByText("Administrative actions")).toBeInTheDocument();
});

// ── authenticated signature viewing (Phase 6 security improvement) ──────────

test("opens the courier signature through the authenticated endpoint", async () => {
  renderDrawer();

  fireEvent.click(screen.getByRole("button", { name: /view signature image/i }));

  await waitFor(() => expect(fetchCourierSignatureBlob).toHaveBeenCalledWith(11));
  expect(window.URL.createObjectURL).toHaveBeenCalled();
  expect(window.open).toHaveBeenCalled();
});

test("signature button is disabled when no signature image is on file", () => {
  renderDrawer({
    legal_signature: { ...COURIER.legal_signature, signature_image_available: false },
  });

  expect(screen.getByRole("button", { name: /view signature image/i })).toBeDisabled();
});

test("never renders a public signature URL", async () => {
  renderDrawer();

  fireEvent.click(screen.getByRole("button", { name: /view signature image/i }));
  await waitFor(() => expect(fetchCourierSignatureBlob).toHaveBeenCalled());

  // No <img> pointing at a media path, and no /media/ URL anywhere in the DOM.
  document.querySelectorAll("img").forEach((img) => {
    expect(img.getAttribute("src") || "").not.toContain("/media/");
  });
  expect(document.body.innerHTML).not.toContain("/media/legal/courier_signatures");
});

test("signature failure is surfaced without breaking the drawer", async () => {
  fetchCourierSignatureBlob.mockRejectedValue({
    response: { data: { detail: "signature unavailable" } },
  });

  renderDrawer();

  fireEvent.click(screen.getByRole("button", { name: /view signature image/i }));

  expect(await screen.findByText("signature unavailable")).toBeInTheDocument();
  expect(screen.getByText("Administrative actions")).toBeInTheDocument();
});

test("renders the vehicle-type document checklist with every state", async () => {
  renderDrawer();

  expect(await screen.findByText("Vehicle & document requirements")).toBeInTheDocument();
  // Labels/states may also appear in the pre-existing documents section, so assert
  // presence rather than uniqueness.
  for (const text of [
    "Motorcycle",
    "National ID",
    "Driver License",
    "Carte Grise (Vehicle Registration)",
    "Insurance",
    "Approved",
    "Pending review",
    "Missing",
    "Expired",
  ]) {
    expect(screen.getAllByText(text).length).toBeGreaterThan(0);
  }
});

test("shows the approval blockers and marks the courier as not ready", async () => {
  renderDrawer();

  expect(await screen.findByText("requirements incomplete")).toBeInTheDocument();
  expect(
    screen.getByText("Missing or rejected document(s): Carte Grise (Vehicle Registration)")
  ).toBeInTheDocument();
  expect(screen.getByText("Expired document(s): Insurance")).toBeInTheDocument();
});

test("marks a courier whose requirements are satisfied as ready for approval", async () => {
  fetchCourierRequirements.mockResolvedValue({
    ...REQUIREMENTS,
    documents: {
      ...REQUIREMENTS.documents,
      requirements: REQUIREMENTS.documents.requirements.map((row) => ({
        ...row,
        state: "approved",
      })),
    },
    approval_blockers: { ...REQUIREMENTS.approval_blockers, blocked: false, reasons: [] },
  });

  renderDrawer();

  expect(await screen.findByText("ready for approval")).toBeInTheDocument();
});


