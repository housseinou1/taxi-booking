import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import CourierDetailsPage from "../CourierDetailsPage";
import {
  approveCourier,
  fetchAdminCourierDetail,
  fetchCourierAuditTrail,
  fetchCourierDeliveries,
  fetchCourierDocumentBlob,
  fetchCourierRequirements,
  fetchCourierSignatureBlob,
  rejectCourier,
  suspendCourier,
} from "../deliveryApi";

jest.mock("../deliveryApi");

jest.mock("../../layouts/AdminShell", () => ({
  AdminShellPage: ({ children }) => <div data-testid="shell">{children}</div>,
}));

jest.mock("../../components/guards/AdminActionGuard", () => ({
  __esModule: true,
  default: ({ children }) => children,
}));

jest.mock("../../permissions/PermissionContext", () => ({
  usePermissions: () => ({
    canView: () => true,
    canAction: () => true,
    canApprove: () => true,
    canExport: () => true,
  }),
}));

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
};

const REQUIREMENTS = {
  courier_id: 11,
  vehicle_type: "motorcycle",
  vehicle_label: "Motorcycle",
  documents: {
    requirements: [
      {
        document_type: "national_id",
        label: "National ID",
        state: "approved",
        expires_at: "2027-02-02",
      },
    ],
    not_required: [],
  },
  approval_blockers: { blocked: false, reasons: [] },
};

beforeEach(() => {
  jest.clearAllMocks();
  fetchAdminCourierDetail.mockResolvedValue(COURIER);
  fetchCourierRequirements.mockResolvedValue(REQUIREMENTS);
  fetchCourierDeliveries.mockResolvedValue({
    count: 1,
    page: 1,
    page_size: 10,
    total_pages: 1,
    summary: { total: 1, delivered: 1, active: 0, cancelled: 0, exceptions: 0 },
    results: [
      {
        id: 501,
        status: "delivered",
        pickup: "A",
        destination: "B",
        fare: "100",
        driver_earning: "80",
        delivered_at: "2026-02-03T10:00:00Z",
      },
    ],
  });
  fetchCourierAuditTrail.mockResolvedValue([]);
  fetchCourierDocumentBlob.mockResolvedValue(new Blob(["x"], { type: "image/png" }));
  fetchCourierSignatureBlob.mockResolvedValue(new Blob(["sig"], { type: "image/png" }));
  approveCourier.mockResolvedValue({ message: "Courier approved" });
  rejectCourier.mockResolvedValue({ message: "Courier rejected" });
  suspendCourier.mockResolvedValue({ message: "Courier suspended", is_suspended: true });
  window.open = jest.fn();
  window.URL.createObjectURL = jest.fn(() => "blob:courier-doc");
});

function renderPage(id = 11) {
  return render(<CourierDetailsPage courierId={id} pathname={`/admin/delivery/couriers/${id}`} />);
}

test("renders the full-width courier dashboard with tabs", async () => {
  renderPage();
  expect(await screen.findByText("Moussa Coura")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Back to Courier Management/i })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Overview" })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Documents & Verification" })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Electronic Agreement" })).toBeInTheDocument();
});

test("flags city mismatch and pending docs without changing records", async () => {
  fetchAdminCourierDetail.mockResolvedValue({
    ...COURIER,
    status: "approved",
    status_label: "Approved",
    courier_status: "approved",
    courier_status_label: "Approved",
    city_name: "Nouadhibou",
    delivery_settings: {
      ...COURIER.delivery_settings,
      delivery_cities: ["Nouakchott"],
    },
    documents: [
      {
        id: 5,
        type: "national_id",
        label: "National ID",
        status: "pending_review",
        display_status: "Pending review",
        is_uploaded: true,
        uploaded_at: "2026-02-02T10:00:00Z",
      },
    ],
  });
  renderPage();
  expect(
    await screen.findByText(/Account city is Nouadhibou, but delivery service cities are Nouakchott/i)
  ).toBeInTheDocument();
  expect(screen.getByText(/CEO operating-city transfer is required/i)).toBeInTheDocument();
  expect(
    screen.getByText(/Account status is Approved while 1 document is still Pending Review/i)
  ).toBeInTheDocument();
});

test("blocks approval until the electronic signature is complete", async () => {
  fetchAdminCourierDetail.mockResolvedValue({
    ...COURIER,
    signature_complete: false,
    legal_signature: { ...COURIER.legal_signature, signature_complete: false },
  });
  renderPage();
  expect(await screen.findByRole("button", { name: "Approve" })).toBeDisabled();
});

test("opens documents through the authenticated endpoint", async () => {
  renderPage();
  await screen.findByText("Moussa Coura");
  fireEvent.click(screen.getByRole("tab", { name: "Documents & Verification" }));
  fireEvent.click(await screen.findByRole("button", { name: "View" }));
  await waitFor(() => expect(fetchCourierDocumentBlob).toHaveBeenCalledWith(11, 5));
});

test("approves through the approval-center endpoint with confirmation", async () => {
  renderPage();
  await screen.findByText("Moussa Coura");
  fireEvent.click(screen.getByRole("button", { name: "Approve" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
  await waitFor(() => expect(approveCourier).toHaveBeenCalledWith(11));
});

test("loads delivery history in the deliveries tab", async () => {
  renderPage();
  await screen.findByText("Moussa Coura");
  fireEvent.click(screen.getByRole("tab", { name: "Deliveries & Performance" }));
  expect(await screen.findByText("#501")).toBeInTheDocument();
});
