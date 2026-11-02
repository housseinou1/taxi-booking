/**
 * Driver Documents & Performance API client.
 *
 * These guard the contract with the backend: the exact endpoints, the HTTP
 * methods, and the requirement that a rejection always carries a reason.
 */
jest.mock("../../delivery/DeliveryShared", () => ({
  apiRequest: jest.fn(),
}));

import { apiRequest } from "../../delivery/DeliveryShared";
import {
  approveDriverDocument,
  daysUntilExpiry,
  documentStatusTone,
  documentTypeLabel,
  expiryBand,
  getDriverApprovalQueue,
  getDriverDirectory,
  getDriverPerformanceSummary,
  rejectDriverDocument,
} from "./driverAdminApi";

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockResolvedValue({});
});

describe("driverAdminApi endpoints", () => {
  it("reads the approvals queue, which is the only admin source of document ids", async () => {
    await getDriverApprovalQueue();
    expect(apiRequest.mock.calls[0][0]).toContain("/admin/approvals/drivers/");
  });

  it("reads the admin driver directory and the performance summary", async () => {
    await getDriverDirectory();
    expect(apiRequest.mock.calls[0][0]).toContain("/drivers/list/");

    apiRequest.mockClear();
    await getDriverPerformanceSummary();
    expect(apiRequest.mock.calls[0][0]).toContain("/drivers/performance/");
  });

  it("forwards filter params as a query string", async () => {
    await getDriverPerformanceSummary({ status: "approved", risk: "1" });
    const url = apiRequest.mock.calls[0][0];
    expect(url).toContain("status=approved");
    expect(url).toContain("risk=1");
  });

  it("approves a document by POST to the document-scoped endpoint", async () => {
    await approveDriverDocument(42);
    const [url, options] = apiRequest.mock.calls[0];
    expect(url).toContain("/admin/documents/42/approve/");
    expect(options.method).toBe("POST");
  });

  it("sends the rejection reason the backend requires", async () => {
    await rejectDriverDocument(42, "  Blurred image  ");
    const [url, options] = apiRequest.mock.calls[0];
    expect(url).toContain("/admin/documents/42/reject/");
    expect(options.method).toBe("POST");
    expect(options.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(options.body)).toEqual({ reason: "Blurred image" });
  });

  it("propagates API failures instead of swallowing them", async () => {
    apiRequest.mockRejectedValueOnce(new Error("Request failed (HTTP 403)."));
    await expect(approveDriverDocument(7)).rejects.toThrow("HTTP 403");
  });
});

describe("document presentation helpers", () => {
  it("labels known document types and humanises unknown ones", () => {
    expect(documentTypeLabel("license")).toBe("Driver's License");
    expect(documentTypeLabel("vehicle_registration")).toBe("Vehicle Registration");
    expect(documentTypeLabel("custom_local_permit")).toBe("Custom Local Permit");
  });

  it("maps verification statuses to chip tones", () => {
    expect(documentStatusTone("approved")).toBe("success");
    expect(documentStatusTone("rejected")).toBe("danger");
    expect(documentStatusTone("expired")).toBe("danger");
    expect(documentStatusTone("pending")).toBe("warning");
    expect(documentStatusTone("missing")).toBe("neutral");
  });

  it("returns null rather than a fake zero when no expiry is recorded", () => {
    expect(daysUntilExpiry(null)).toBeNull();
    expect(daysUntilExpiry("")).toBeNull();
    expect(daysUntilExpiry("not-a-date")).toBeNull();
  });

  it("bands expiry using the backend notification thresholds", () => {
    const inDays = (days) => new Date(Date.now() + days * 86400000).toISOString();
    expect(expiryBand(inDays(-1))).toBe("expired");
    expect(expiryBand(inDays(3))).toBe("critical");
    expect(expiryBand(inDays(20))).toBe("soon");
    expect(expiryBand(inDays(200))).toBe("valid");
    expect(expiryBand(null)).toBe("none");
  });
});
