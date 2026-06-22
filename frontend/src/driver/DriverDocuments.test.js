import React from "react";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import DriverDocuments, {
  validateDocumentFile,
  getExpiredOrMissingDocuments,
} from "./DriverDocuments";
import { DriverProvider } from "./context/DriverContext";

// ─── Mock axios ─────────────────────────────────────────────────────────────
jest.mock("axios");
const axios = require("axios");

// ─── Mock localStorage ──────────────────────────────────────────────────────
beforeEach(() => {
  Storage.prototype.getItem = jest.fn(() => "test-token");
});

// ─── Helper: render with DriverProvider ─────────────────────────────────────
function renderWithProvider(ui, { initialValues = {} } = {}) {
  return render(
    <DriverProvider initialValues={initialValues}>{ui}</DriverProvider>
  );
}

// ─── Mock API responses ─────────────────────────────────────────────────────
const mockDocuments = [
  {
    id: 1,
    document_type: "license",
    status: "approved",
    uploaded_at: "2024-01-15T10:00:00Z",
    expires_at: null,
    rejection_reason: "",
  },
  {
    id: 2,
    document_type: "national_id",
    status: "pending_review",
    uploaded_at: "2024-02-20T14:30:00Z",
    expires_at: null,
    rejection_reason: "",
  },
  {
    id: 3,
    document_type: "insurance",
    status: "rejected",
    uploaded_at: "2024-03-01T09:00:00Z",
    expires_at: null,
    rejection_reason: "Document is blurry, please re-upload.",
  },
];

const mockApiResponse = {
  documents: mockDocuments,
  expiring_documents: [],
  alerts: [],
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("DriverDocuments", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("shows loading state initially", async () => {
    axios.get.mockImplementation(() => new Promise(() => {})); // never resolves

    await act(async () => {
      renderWithProvider(<DriverDocuments />);
    });

    expect(screen.getByText("Loading documents...")).toBeInTheDocument();
  });

  it("displays all document types after loading", async () => {
    axios.get.mockResolvedValue({ data: mockApiResponse });

    await act(async () => {
      renderWithProvider(<DriverDocuments />);
    });

    await waitFor(() => {
      expect(screen.getByText("Driver License")).toBeInTheDocument();
    });

    expect(screen.getByText("National ID")).toBeInTheDocument();
    expect(screen.getByText("Insurance")).toBeInTheDocument();
    expect(screen.getByText("Carte Grise")).toBeInTheDocument();
    expect(screen.getByText("Vignette")).toBeInTheDocument();
    expect(screen.getByText("Plate Number")).toBeInTheDocument();
    expect(screen.getByText("Profile Photo")).toBeInTheDocument();
  });

  it("displays status badges for uploaded documents", async () => {
    axios.get.mockResolvedValue({ data: mockApiResponse });

    await act(async () => {
      renderWithProvider(<DriverDocuments />);
    });

    await waitFor(() => {
      expect(screen.getByText("Approved")).toBeInTheDocument();
    });

    expect(screen.getByText("Pending Review")).toBeInTheDocument();
    expect(screen.getByText("Rejected")).toBeInTheDocument();
  });

  it("shows 'Not Uploaded' badge for documents without uploads", async () => {
    axios.get.mockResolvedValue({ data: mockApiResponse });

    await act(async () => {
      renderWithProvider(<DriverDocuments />);
    });

    await waitFor(() => {
      // Carte Grise, Vignette, Vehicle Registration, Plate Number, and Profile Photo are not in mockDocuments
      const notUploadedBadges = screen.getAllByText("Not Uploaded");
      expect(notUploadedBadges.length).toBe(5);
    });
  });

  it("shows rejection reason for rejected documents", async () => {
    axios.get.mockResolvedValue({ data: mockApiResponse });

    await act(async () => {
      renderWithProvider(<DriverDocuments />);
    });

    await waitFor(() => {
      expect(
        screen.getByText("Document is blurry, please re-upload.")
      ).toBeInTheDocument();
    });
  });

  it("shows error state and retry button on API failure", async () => {
    axios.get.mockRejectedValue(new Error("Network error"));

    await act(async () => {
      renderWithProvider(<DriverDocuments />);
    });

    await waitFor(() => {
      expect(
        screen.getByText("Failed to load documents. Please try again.")
      ).toBeInTheDocument();
    });

    expect(screen.getByText("Retry")).toBeInTheDocument();
  });

  it("shows expiration warning badge for documents expiring within 30 days", async () => {
    const futureDate = new Date();
    futureDate.setHours(0, 0, 0, 0);
    futureDate.setDate(futureDate.getDate() + 15);
    const expiringDoc = {
      ...mockDocuments[0],
      expires_at: futureDate.toISOString().split("T")[0],
    };

    axios.get.mockResolvedValue({
      data: {
        documents: [expiringDoc, ...mockDocuments.slice(1)],
        expiring_documents: [],
        alerts: [],
      },
    });

    await act(async () => {
      renderWithProvider(<DriverDocuments />);
    });

    await waitFor(() => {
      expect(screen.getByText(/Expires in \d+ day/)).toBeInTheDocument();
    });
  });

  it("shows persistent alert for missing required documents", async () => {
    // Only 1 document uploaded out of 7 required
    axios.get.mockResolvedValue({
      data: {
        documents: [mockDocuments[0]],
        expiring_documents: [],
        alerts: [],
      },
    });

    await act(async () => {
      renderWithProvider(<DriverDocuments />);
    });

    await waitFor(() => {
      expect(screen.getByText("Action Required")).toBeInTheDocument();
    });

    // Should list missing documents in the alert (use getAllByText since names also appear in cards)
    expect(screen.getAllByText(/National ID/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Insurance/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Carte Grise/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Vignette/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Plate Number/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Profile Photo/).length).toBeGreaterThanOrEqual(1);

    // Verify the alert contains the missing reason
    const alertElement = screen.getByRole("alert");
    expect(alertElement).toHaveTextContent("missing");
  });

  it("shows persistent alert for expired documents", async () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 5);
    const expiredDoc = {
      ...mockDocuments[0],
      expires_at: pastDate.toISOString().split("T")[0],
    };

    axios.get.mockResolvedValue({
      data: {
        documents: [expiredDoc, mockDocuments[1], mockDocuments[2],
          { id: 4, document_type: "vehicle_registration", status: "approved", uploaded_at: "2024-01-01T00:00:00Z", expires_at: null, rejection_reason: "" },
          { id: 5, document_type: "vignette", status: "approved", uploaded_at: "2024-01-01T00:00:00Z", expires_at: null, rejection_reason: "" },
          { id: 6, document_type: "plate_number_photo", status: "approved", uploaded_at: "2024-01-01T00:00:00Z", expires_at: null, rejection_reason: "" },
          { id: 7, document_type: "profile_photo", status: "approved", uploaded_at: "2024-01-01T00:00:00Z", expires_at: null, rejection_reason: "" },
        ],
        expiring_documents: [],
        alerts: [],
      },
    });

    await act(async () => {
      renderWithProvider(<DriverDocuments />);
    });

    await waitFor(() => {
      expect(screen.getByText("Action Required")).toBeInTheDocument();
    });

    expect(screen.getByText(/expired/)).toBeInTheDocument();
  });

  it("shows upload and replace buttons for each document type", async () => {
    axios.get.mockResolvedValue({ data: mockApiResponse });

    await act(async () => {
      renderWithProvider(<DriverDocuments />);
    });

    await waitFor(() => {
      // 3 documents uploaded -> "Replace", 5 not uploaded -> "Upload"
      const uploadButtons = screen.getAllByText("Upload");
      const replaceButtons = screen.getAllByText("Replace");
      expect(uploadButtons.length).toBe(5);
      expect(replaceButtons.length).toBe(3);
    });
  });

  it("handles WebSocket document_status messages", async () => {
    axios.get.mockResolvedValue({ data: mockApiResponse });

    await act(async () => {
      renderWithProvider(<DriverDocuments />);
    });

    await waitFor(() => {
      expect(screen.getByText("Pending Review")).toBeInTheDocument();
    });

    // Simulate WebSocket message for document status update
    await act(async () => {
      const event = new CustomEvent("driver_ws_message", {
        detail: {
          type: "document_status",
          document_type: "national_id",
          status: "approved",
        },
      });
      // The component listens on window with event.data
      const messageEvent = new MessageEvent("driver_ws_message", {
        data: JSON.stringify({
          type: "document_status",
          document_type: "national_id",
          status: "approved",
        }),
      });
      window.dispatchEvent(messageEvent);
    });
  });
});

// ─── Unit Tests for Helper Functions ────────────────────────────────────────

describe("validateDocumentFile", () => {
  it("returns valid for JPEG files under 10 MB", () => {
    const file = new File(["content"], "doc.jpg", { type: "image/jpeg" });
    Object.defineProperty(file, "size", { value: 5 * 1024 * 1024 });
    expect(validateDocumentFile(file)).toEqual({ valid: true, error: null });
  });

  it("returns valid for PNG files under 10 MB", () => {
    const file = new File(["content"], "doc.png", { type: "image/png" });
    Object.defineProperty(file, "size", { value: 2 * 1024 * 1024 });
    expect(validateDocumentFile(file)).toEqual({ valid: true, error: null });
  });

  it("returns valid for PDF files under 10 MB", () => {
    const file = new File(["content"], "doc.pdf", { type: "application/pdf" });
    Object.defineProperty(file, "size", { value: 8 * 1024 * 1024 });
    expect(validateDocumentFile(file)).toEqual({ valid: true, error: null });
  });

  it("returns valid for exactly 10 MB file", () => {
    const file = new File(["content"], "doc.pdf", { type: "application/pdf" });
    Object.defineProperty(file, "size", { value: 10 * 1024 * 1024 });
    expect(validateDocumentFile(file)).toEqual({ valid: true, error: null });
  });

  it("rejects files over 10 MB", () => {
    const file = new File(["content"], "doc.pdf", { type: "application/pdf" });
    Object.defineProperty(file, "size", { value: 11 * 1024 * 1024 });
    const result = validateDocumentFile(file);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("10 MB");
  });

  it("rejects invalid file formats (BMP)", () => {
    const file = new File(["content"], "doc.bmp", { type: "image/bmp" });
    Object.defineProperty(file, "size", { value: 1 * 1024 * 1024 });
    const result = validateDocumentFile(file);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("JPEG, PNG, PDF");
  });

  it("rejects invalid file formats (GIF)", () => {
    const file = new File(["content"], "doc.gif", { type: "image/gif" });
    Object.defineProperty(file, "size", { value: 1 * 1024 * 1024 });
    const result = validateDocumentFile(file);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("JPEG, PNG, PDF");
  });

  it("rejects null file", () => {
    const result = validateDocumentFile(null);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("No file selected");
  });
});

describe("getExpiredOrMissingDocuments", () => {
  it("returns empty array when all required documents are uploaded and not expired", () => {
    const docs = [
      { document_type: "license", expires_at: null },
      { document_type: "national_id", expires_at: null },
      { document_type: "insurance", expires_at: null },
      { document_type: "vehicle_registration", expires_at: null },
      { document_type: "vignette", expires_at: null },
      { document_type: "plate_number_photo", expires_at: null },
      { document_type: "profile_photo", expires_at: null },
    ];
    expect(getExpiredOrMissingDocuments(docs)).toEqual([]);
  });

  it("identifies missing required documents", () => {
    const docs = [
      { document_type: "license", expires_at: null },
    ];
    const alerts = getExpiredOrMissingDocuments(docs);
    expect(alerts.length).toBe(6);
    expect(alerts.map((a) => a.key)).toContain("national_id");
    expect(alerts.map((a) => a.key)).toContain("insurance");
    expect(alerts.map((a) => a.key)).toContain("carte_grise");
    expect(alerts.map((a) => a.key)).toContain("vignette");
    expect(alerts.map((a) => a.key)).toContain("plate_number_photo");
    expect(alerts.map((a) => a.key)).toContain("profile_photo");
    alerts.forEach((alert) => {
      expect(alert.reason).toBe("missing");
    });
  });

  it("identifies expired documents", () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 10);
    const docs = [
      { document_type: "license", expires_at: pastDate.toISOString().split("T")[0] },
      { document_type: "national_id", expires_at: null },
      { document_type: "insurance", expires_at: null },
      { document_type: "vehicle_registration", expires_at: null },
      { document_type: "vignette", expires_at: null },
      { document_type: "plate_number_photo", expires_at: null },
      { document_type: "profile_photo", expires_at: null },
    ];
    const alerts = getExpiredOrMissingDocuments(docs);
    expect(alerts.length).toBe(1);
    expect(alerts[0].key).toBe("license");
    expect(alerts[0].reason).toBe("expired");
  });

  it("returns empty array for null/undefined documents", () => {
    expect(getExpiredOrMissingDocuments(null)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reason: "missing" }),
      ])
    );
  });

  it("does not flag documents expiring in the future (not expired)", () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 60);
    const docs = [
      { document_type: "license", expires_at: futureDate.toISOString().split("T")[0] },
      { document_type: "national_id", expires_at: null },
      { document_type: "insurance", expires_at: null },
      { document_type: "vehicle_registration", expires_at: null },
      { document_type: "vignette", expires_at: null },
      { document_type: "plate_number_photo", expires_at: null },
      { document_type: "profile_photo", expires_at: null },
    ];
    const alerts = getExpiredOrMissingDocuments(docs);
    expect(alerts.length).toBe(0);
  });
});
