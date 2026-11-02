/**
 * Driver Documents Management.
 *
 * Covers the row-building merge (queue + review state), the KPI derivation, the
 * approve/reject wiring, and the explicit error state when the backend fails.
 */
jest.mock("../permissions/PermissionContext", () => ({
  usePermissions: () => ({
    canView: () => true,
    canAction: () => true,
    canApprove: () => true,
    canExport: () => true,
  }),
}));

jest.mock("./driverAdminApi", () => {
  const actual = jest.requireActual("./driverAdminApi");
  return {
    ...actual,
    getDriverApprovalQueue: jest.fn(),
    getDriverDirectory: jest.fn(),
    approveDriverDocument: jest.fn(),
    rejectDriverDocument: jest.fn(),
  };
});

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import DriverDocumentsPage, {
  buildDocumentRows,
  computeDocumentKpis,
} from "./DriverDocumentsPage";
import {
  approveDriverDocument,
  getDriverApprovalQueue,
  getDriverDirectory,
  rejectDriverDocument,
} from "./driverAdminApi";

const QUEUE = [
  {
    id: 1,
    profile_id: 10,
    full_name: "Awa Diallo",
    email: "awa@example.com",
    phone_number: "22001122",
    city_name: "Nouakchott",
    car_type: "Taxi",
    status: "pending",
    date_joined: "2026-01-01T00:00:00Z",
    documents: [
      {
        id: 77,
        document_type: "license",
        document_type_display: "License",
        file_url: "/media/license.pdf",
        status: "pending",
        rejection_reason: "",
        expires_at: null,
      },
    ],
    approval_history: [
      { action: "submitted", admin_name: "system", reason: "", timestamp: "2026-01-02T00:00:00Z" },
    ],
  },
];

const DIRECTORY = [
  {
    id: 10,
    user_id: 1,
    driver_name: "Awa Diallo",
    city_name: "Nouakchott",
    status: "pending",
    all_required_documents_uploaded: false,
    documents_under_review: true,
    missing_document_types: ["insurance"],
    expired_document_types: ["license"],
    expiring_soon_documents: [],
    documents_alert_level: "error",
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  getDriverApprovalQueue.mockResolvedValue(QUEUE);
  getDriverDirectory.mockResolvedValue(DIRECTORY);
  approveDriverDocument.mockResolvedValue({ message: "Document approved." });
  rejectDriverDocument.mockResolvedValue({ message: "Document rejected." });
});

describe("buildDocumentRows", () => {
  it("creates an actionable row per uploaded document, carrying the document id", () => {
    const rows = buildDocumentRows(QUEUE, DIRECTORY);
    const docRow = rows.find((row) => row.document_id === 77);
    expect(docRow).toBeDefined();
    expect(docRow.driver_name).toBe("Awa Diallo");
    expect(docRow.city).toBe("Nouakchott");
    expect(docRow.actionable).toBe(true);
    expect(docRow.driver_id).toBe(10);
  });

  it("creates a non-actionable row for a missing document, because no file exists to review", () => {
    const rows = buildDocumentRows(QUEUE, DIRECTORY);
    const missingRow = rows.find((row) => row.status === "missing");
    expect(missingRow).toBeDefined();
    expect(missingRow.document_id).toBeNull();
    expect(missingRow.actionable).toBe(false);
  });

  it("does not invent rows when a driver has no documents and no reported gaps", () => {
    const rows = buildDocumentRows(
      [{ id: 2, profile_id: 20, full_name: "No Docs", documents: [] }],
      [{ id: 20, user_id: 2, missing_document_types: [] }]
    );
    expect(rows).toEqual([]);
  });
});

describe("computeDocumentKpis", () => {
  it("derives every KPI from backend review state", () => {
    const rows = buildDocumentRows(QUEUE, DIRECTORY);
    const kpis = computeDocumentKpis(DIRECTORY, rows);
    expect(kpis.totalDrivers).toBe(1);
    expect(kpis.awaitingApproval).toBe(1);
    expect(kpis.expiredDrivers).toBe(1);
    expect(kpis.missingDrivers).toBe(1);
    expect(kpis.expiringSoon).toBe(0);
    expect(kpis.verifiedDrivers).toBe(0);
  });

  it("reports zeros for an empty fleet rather than throwing", () => {
    expect(computeDocumentKpis([], [])).toEqual({
      totalDrivers: 0,
      verifiedDrivers: 0,
      awaitingApproval: 0,
      rejectedDrivers: 0,
      expiredDrivers: 0,
      expiringSoon: 0,
      missingDrivers: 0,
    });
  });
});

describe("DriverDocumentsPage", () => {
  it("renders the register with real backend rows", async () => {
    render(<DriverDocumentsPage mode="documents" />);
    expect(await screen.findByText("Driver Documents")).toBeInTheDocument();
    expect(await screen.findAllByText("Awa Diallo")).not.toHaveLength(0);
    expect(screen.getByText("Missing required documents")).toBeInTheDocument();
  });

  it("discloses that the figures come from the approvals queue, not a full register", async () => {
    render(<DriverDocumentsPage mode="documents" />);
    expect(await screen.findByText("What these figures cover")).toBeInTheDocument();
    // The limitation must be stated plainly, not implied.
    expect(screen.getByText(/not represented/)).toBeInTheDocument();
    expect(screen.getByText(/admin approvals queue/)).toBeInTheDocument();
  });

  it("approves a document through the audited admin endpoint", async () => {
    render(<DriverDocumentsPage mode="documents" />);
    const approve = await screen.findByRole("button", { name: "Approve" });
    fireEvent.click(approve);
    await waitFor(() => expect(approveDriverDocument).toHaveBeenCalledWith(77));
  });

  it("requires a reason before rejecting, then posts it", async () => {
    render(<DriverDocumentsPage mode="documents" />);
    fireEvent.click(await screen.findByRole("button", { name: "Reject" }));

    const confirm = screen.getByRole("button", { name: "Reject document" });
    expect(confirm).toBeDisabled();
    expect(rejectDriverDocument).not.toHaveBeenCalled();

    fireEvent.change(screen.getByPlaceholderText(/blurred/i), {
      target: { value: "Expired licence" },
    });
    expect(confirm).not.toBeDisabled();
    fireEvent.click(confirm);
    await waitFor(() => expect(rejectDriverDocument).toHaveBeenCalledWith(77, "Expired licence"));
  });

  it("surfaces a backend failure instead of rendering a fake success", async () => {
    getDriverApprovalQueue.mockRejectedValue(new Error("Request failed (HTTP 500)."));
    render(<DriverDocumentsPage mode="documents" />);
    expect(
      await screen.findByText(/Document queue: Request failed \(HTTP 500\)\./)
    ).toBeInTheDocument();
  });

  it("shows only undecided documents in verification mode", async () => {
    // An approved document must drop out of the verification queue. The directory
    // fixture is cleared of missing types so the queue is genuinely empty.
    getDriverDirectory.mockResolvedValue([{ ...DIRECTORY[0], missing_document_types: [] }]);
    getDriverApprovalQueue.mockResolvedValue([
      {
        ...QUEUE[0],
        documents: [{ ...QUEUE[0].documents[0], id: 99, status: "approved" }],
      },
    ]);
    render(<DriverDocumentsPage mode="verification" />);
    expect(await screen.findByText("Document Verification")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText("No documents are waiting for review.")).toBeInTheDocument()
    );
  });
});
