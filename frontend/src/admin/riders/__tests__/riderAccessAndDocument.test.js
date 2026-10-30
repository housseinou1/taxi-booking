/**
 * Phase 4 tests: rider access management + identity-document privacy.
 *
 * Verifies:
 *  - suspend / reactivate go through the dedicated admin endpoints (audited),
 *    not the generic block toggle
 *  - a suspension reason is mandatory before the request is sent
 *  - the identity document is fetched through the authenticated admin endpoint
 *    and never rendered from a public /media/ URL
 */
import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import RidersManagement from "../RidersManagement";
import {
  fetchRiderDocumentBlob,
  getRiderActivity,
  getRiderAuditLogs,
  getRiderPayments,
  getRiderRideHistory,
  getRiderSupport,
  reactivateRider,
  suspendRider,
} from "../ridersApi";

jest.mock("../ridersApi", () => ({
  fetchRiderDocumentBlob: jest.fn(),
  getRiderActivity: jest.fn(),
  getRiderAuditLogs: jest.fn(),
  getRiderPayments: jest.fn(),
  getRiderRideHistory: jest.fn(),
  getRiderSupport: jest.fn(),
  reactivateRider: jest.fn(),
  suspendRider: jest.fn(),
}));

jest.mock("../../permissions/PermissionContext", () => ({
  usePermissions: () => ({
    permissions: { role: "ceo", modules: ["riders"], actions: {}, feature_flags: {} },
    canView: () => true,
    canAction: () => true,
    canApprove: () => true,
    canExport: () => true,
    canAccessCurrentPath: true,
  }),
}));

const RIDER = {
  id: 1,
  email: "amina@example.com",
  full_name: "Amina Diallo",
  first_name: "Amina",
  last_name: "Diallo",
  phone_number: "+22245000001",
  rider_status: "approved",
  rider_status_label: "Approved",
  is_active: true,
  is_staff: false,
  is_superuser: false,
  user_type: "rider",
  has_national_id_document: true,
  national_id_document: "users/national_ids/amina.png",
  date_joined: "2026-01-05T10:00:00Z",
};

function renderWithDrawer(overrides = {}) {
  const utils = render(
    <RidersManagement
      riders={[{ ...RIDER, ...overrides }]}
      rides={[]}
      getFileUrl={(v) => `https://cdn/${v}`}
    />
  );
  const row = screen.getByText("Amina Diallo").closest("tr");
  fireEvent.click(within(row).getByRole("button", { name: /view details for amina/i }));
  return utils;
}

describe("rider access management (Phase 4)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Re-arm the drawer's data loaders (the repo enables resetMocks, which clears
    // any implementation declared in the module factory).
    getRiderRideHistory.mockResolvedValue({
      results: [], count: 0, total_pages: 1, summary: null,
    });
    getRiderPayments.mockResolvedValue({ results: [], count: 0 });
    getRiderActivity.mockResolvedValue({});
    getRiderAuditLogs.mockResolvedValue([]);
    getRiderSupport.mockResolvedValue({ count: 0, open_count: 0, results: [] });
    suspendRider.mockResolvedValue({});
    reactivateRider.mockResolvedValue({});
    fetchRiderDocumentBlob.mockResolvedValue(new Blob(["x"], { type: "image/png" }));
  });

  it("suspends through the dedicated endpoint once a reason is given", async () => {
    renderWithDrawer();
    fireEvent.click(screen.getByRole("button", { name: "Suspend account" }));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Fraud investigation" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() =>
      expect(suspendRider).toHaveBeenCalledWith(1, "Fraud investigation")
    );
    expect(reactivateRider).not.toHaveBeenCalled();
  });

  it("does not call the backend when the suspension reason is too short", () => {
    renderWithDrawer();
    fireEvent.click(screen.getByRole("button", { name: "Suspend account" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "no" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    expect(suspendRider).not.toHaveBeenCalled();
    expect(
      screen.getByText("A clear reason (5+ characters) is required.")
    ).toBeInTheDocument();
  });

  it("reactivates a suspended rider through the dedicated endpoint", async () => {
    renderWithDrawer({ is_active: false });
    fireEvent.click(screen.getByRole("button", { name: "Reactivate account" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(reactivateRider).toHaveBeenCalledWith(1, ""));
    expect(suspendRider).not.toHaveBeenCalled();
  });

  it("surfaces a backend failure without crashing the drawer", async () => {
    suspendRider.mockRejectedValue(new Error("Server refused"));
    renderWithDrawer();
    fireEvent.click(screen.getByRole("button", { name: "Suspend account" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Policy breach" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    expect(await screen.findByText("Server refused")).toBeInTheDocument();
  });
});


describe("rider identity document privacy (Phase 4)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getRiderRideHistory.mockResolvedValue({
      results: [], count: 0, total_pages: 1, summary: null,
    });
    getRiderPayments.mockResolvedValue({ results: [], count: 0 });
    getRiderActivity.mockResolvedValue({});
    getRiderAuditLogs.mockResolvedValue([]);
    getRiderSupport.mockResolvedValue({ count: 0, open_count: 0, results: [] });
    fetchRiderDocumentBlob.mockResolvedValue(new Blob(["x"], { type: "image/png" }));
    global.URL.createObjectURL = jest.fn(() => "blob:rider-doc");
    global.URL.revokeObjectURL = jest.fn();
    window.open = jest.fn();
  });

  it("never renders a public media URL for the identity document", () => {
    renderWithDrawer();
    const html = document.body.innerHTML;
    expect(html).not.toContain("users/national_ids/amina.png");
    expect(html).not.toContain("https://cdn/users/national_ids");
  });

  it("fetches the document through the authenticated admin endpoint", async () => {
    renderWithDrawer();
    fireEvent.click(screen.getByRole("button", { name: /view national id document/i }));

    await waitFor(() => expect(fetchRiderDocumentBlob).toHaveBeenCalledWith(1));
    expect(global.URL.createObjectURL).toHaveBeenCalled();
  });

  it("shows an error state when the document cannot be fetched", async () => {
    fetchRiderDocumentBlob.mockRejectedValue(new Error("Not authorised"));
    renderWithDrawer();
    fireEvent.click(screen.getByRole("button", { name: /view national id document/i }));
    expect(await screen.findByText("Not authorised")).toBeInTheDocument();
  });

  it("shows an honest empty state when no document is on file", () => {
    renderWithDrawer({ has_national_id_document: false, national_id_document: "" });
    expect(screen.getByText("No document on file")).toBeInTheDocument();
  });
});

describe("rider support integration (Phase 4)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getRiderRideHistory.mockResolvedValue({
      results: [], count: 0, total_pages: 1, summary: null,
    });
    getRiderPayments.mockResolvedValue({ results: [], count: 0 });
    getRiderActivity.mockResolvedValue({});
    getRiderAuditLogs.mockResolvedValue([]);
    getRiderSupport.mockResolvedValue({ count: 0, open_count: 0, results: [] });
    fetchRiderDocumentBlob.mockResolvedValue(new Blob(["x"], { type: "image/png" }));
  });

  it("renders the rider's support tickets", async () => {
    getRiderSupport.mockResolvedValue({
      count: 1,
      open_count: 1,
      results: [
        {
          id: 5,
          reference: "BF-R1",
          category: "ride",
          severity: "P2",
          subject: "Driver was late",
          status: "open",
          created_at: "2026-10-01T09:00:00Z",
          resolved_at: null,
        },
      ],
    });

    renderWithDrawer();

    expect(await screen.findByText("BF-R1")).toBeInTheDocument();
    expect(screen.getByText("Driver was late")).toBeInTheDocument();
    expect(screen.getByText("1 open ticket.")).toBeInTheDocument();
  });

  it("shows an honest empty state when the rider has no tickets", async () => {
    getRiderSupport.mockResolvedValue({ count: 0, open_count: 0, results: [] });
    renderWithDrawer();
    expect(
      await screen.findByText("No support tickets raised by this rider.")
    ).toBeInTheDocument();
  });

  it("surfaces a support failure without breaking the drawer", async () => {
    getRiderSupport.mockRejectedValue(new Error("support boom"));
    renderWithDrawer();
    expect(await screen.findByText("support boom")).toBeInTheDocument();
    expect(screen.getByText("Administrative actions")).toBeInTheDocument();
  });
});


