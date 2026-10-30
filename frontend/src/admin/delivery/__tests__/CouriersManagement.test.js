/**
 * Phase 5 — Courier Management (list page) tests.
 *
 * Verifies the directory loads through the admin API, KPIs come from the
 * server-side summary, filters/search are passed to the backend, and the drawer
 * opens with the selected courier.
 */
import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import CouriersManagement from "../CouriersManagement";
import {
  fetchAdminCourierDetail,
  fetchAdminCouriers,
  fetchCourierAuditTrail,
  fetchCourierDeliveries,
  fetchCourierDocumentBlob,
} from "../deliveryApi";

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

const COURIERS = [
  {
    id: 11,
    user_id: 101,
    name: "Moussa Coura",
    email: "moussa@yala.test",
    phone_number: "+22245000101",
    phone_verified: true,
    is_active: true,
    status: "approved",
    status_label: "Approved",
    courier_status: "approved",
    courier_status_label: "Approved",
    is_suspended: false,
    suspension_reason: "",
    delivery_mode_enabled: true,
    courier_online: true,
    vehicle_type: "motorcycle",
    city_name: "Nouakchott",
    plate_number: "AB-123",
    total_deliveries_completed: 12,
    delivery_rating: "4.8",
    signature_complete: true,
    documents_total: 4,
    documents_pending: 1,
    documents_approved: 3,
    date_joined: "2026-02-01T10:00:00Z",
  },
  {
    id: 12,
    user_id: 102,
    name: "Aicha Mint",
    email: "aicha@yala.test",
    phone_number: "+22245000102",
    phone_verified: false,
    is_active: true,
    status: "pending",
    status_label: "Pending",
    courier_status: "pending",
    courier_status_label: "Pending",
    is_suspended: false,
    suspension_reason: "",
    delivery_mode_enabled: false,
    courier_online: false,
    vehicle_type: "bicycle",
    city_name: "Nouakchott",
    plate_number: "",
    total_deliveries_completed: 0,
    delivery_rating: "5.0",
    signature_complete: false,
    documents_total: 2,
    documents_pending: 2,
    documents_approved: 0,
    date_joined: "2026-03-01T10:00:00Z",
  },
];

const SUMMARY = {
  total: 2,
  approved: 1,
  pending: 1,
  rejected: 0,
  suspended: 0,
  online: 1,
};

beforeEach(() => {
  jest.clearAllMocks();
  fetchAdminCouriers.mockResolvedValue({
    count: 2,
    page: 1,
    page_size: 25,
    total_pages: 1,
    results: COURIERS,
    summary: SUMMARY,
  });
  fetchAdminCourierDetail.mockResolvedValue({
    ...COURIERS[0],
    documents: [],
    onboarding: { message: "Ready", steps: [] },
    legal_signature: { signature_complete: true, signed_full_name: "Moussa Coura" },
    delivery_settings: { delivery_mode_enabled: true, vehicle_type: "motorcycle" },
    earnings: null,
    wallet: null,
  });
  fetchCourierDeliveries.mockResolvedValue({
    count: 0,
    page: 1,
    page_size: 10,
    total_pages: 1,
    summary: null,
    results: [],
  });
  fetchCourierAuditTrail.mockResolvedValue([]);
  fetchCourierDocumentBlob.mockResolvedValue(new Blob(["x"], { type: "image/png" }));
});

test("renders courier rows and server-side KPI summary", async () => {
  render(<CouriersManagement />);

  expect(await screen.findByText("Moussa Coura")).toBeInTheDocument();
  expect(screen.getByText("Aicha Mint")).toBeInTheDocument();

  const totalCard = screen.getByText("Total couriers").closest(".admin-kpi");
  expect(within(totalCard).getByText("2")).toBeInTheDocument();
  const onlineCard = screen
    .getByText("Online now", { selector: ".admin-kpi__label" })
    .closest(".admin-kpi");
  expect(within(onlineCard).getByText("1")).toBeInTheDocument();
});

test("flags missing signatures and pending documents", async () => {
  render(<CouriersManagement />);

  await screen.findByText("Moussa Coura");
  expect(screen.getByText("Missing")).toBeInTheDocument();
  expect(screen.getByText("1 of 4")).toBeInTheDocument();
});

test("passes the queue filter and search to the backend", async () => {
  render(<CouriersManagement />);
  await screen.findByText("Moussa Coura");

  fireEvent.change(screen.getByRole("combobox", { name: "Queue" }), {
    target: { value: "suspended" },
  });
  await waitFor(() =>
    expect(fetchAdminCouriers).toHaveBeenLastCalledWith(
      expect.objectContaining({ queue: "suspended", page: 1 })
    )
  );

  const searchInput = await screen.findByPlaceholderText(/search name/i);
  fireEvent.change(searchInput, { target: { value: "aicha" } });
  await waitFor(() =>
    expect(fetchAdminCouriers).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: "aicha" })
    )
  );
});

test("opens the drawer for the selected courier", async () => {
  render(<CouriersManagement />);
  await screen.findByText("Moussa Coura");

  fireEvent.click(screen.getAllByRole("button", { name: "View" })[0]);

  await waitFor(() => expect(fetchAdminCourierDetail).toHaveBeenCalledWith(11));
  expect(await screen.findByRole("dialog")).toBeInTheDocument();
});

test("surfaces a backend failure without crashing", async () => {
  fetchAdminCouriers.mockRejectedValue({ response: { data: { detail: "Directory unavailable" } } });
  render(<CouriersManagement />);

  expect((await screen.findAllByText("Directory unavailable")).length).toBeGreaterThan(0);
});
