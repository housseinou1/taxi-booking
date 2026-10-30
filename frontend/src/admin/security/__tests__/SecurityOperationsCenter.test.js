/**
 * Phase 11 — Security Operations Center tests.
 *
 * Verifies the four read-only sections render, that filters are forwarded to the
 * backend, that the outstanding-issues register surfaces the tracked items with
 * their checks, and that the console exposes no state-changing control.
 */
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import SecurityOperationsCenter from "../SecurityOperationsCenter";
import {
  fetchOutstandingIssues,
  fetchSecurityAccessReview,
  fetchSecurityAuditStream,
  fetchSecurityOverview,
} from "../securityConsoleApi";

jest.mock("../securityConsoleApi", () => {
  const actual = jest.requireActual("../securityConsoleApi");
  return {
    ...actual,
    fetchSecurityOverview: jest.fn(),
    fetchSecurityAuditStream: jest.fn(),
    fetchSecurityAccessReview: jest.fn(),
    fetchOutstandingIssues: jest.fn(),
  };
});

jest.mock("../../layouts/AdminShell", () => ({
  AdminShellPage: ({ children }) => children,
}));

jest.mock("../../permissions/PermissionContext", () => ({
  PermissionProvider: ({ children }) => children,
  usePermissions: () => ({
    permissions: { role: "ceo", modules: ["security"], actions: {}, feature_flags: {} },
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

const OVERVIEW = {
  audit: {
    total: 120,
    last_24h: 9,
    last_7d: 40,
    high_risk_last_7d: 5,
    top_actions_7d: [{ action: "admin_action", total: 5 }],
  },
  administrators: { staff: 4, superusers: 1, without_totp: 2, active_last_7d: 3 },
  fraud: { total: 3, by_status: [{ status: "open", total: 2 }], open_last_7d: 1 },
  delivery_verification: { events_last_24h: 30, failures_last_24h: 2 },
  protection: { protected_groups: ["CEO", "Super Admin"], guarantees: ["Protected accounts cannot be demoted."] },
  read_only: true,
};

const AUDIT = {
  count: 1,
  page: 1,
  total_pages: 1,
  results: [
    {
      id: 7,
      created_at: "2026-10-24T09:00:00Z",
      action: "admin_action",
      entity_type: "system",
      entity_id: "user:2",
      summary: "Admin role changed for support@yala.test",
      actor_email: "founder@yala.test",
      high_risk: true,
    },
  ],
};

const ACCESS = {
  count: 1,
  results: [
    {
      id: 1,
      name: "Founder CEO",
      email: "founder@yala.test",
      groups: ["CEO"],
      is_superuser: false,
      totp_confirmed: true,
      last_login: null,
      days_since_login: null,
      flags: ["protected", "never_logged_in"],
      protected: true,
    },
  ],
  summary: {
    total: 1,
    protected: 1,
    without_totp: 0,
    never_logged_in: 1,
    stale_login: 0,
    superusers: 0,
  },
};

const ISSUES = {
  count: 4,
  blocking_count: 0,
  items: [
    {
      id: "css-order-build-warnings",
      title: "Frontend build CSS-order (mini-css-extract-plugin) warnings",
      category: "build-hygiene",
      severity: "low",
      blocking: false,
      status: "mitigated",
      summary: "Build warnings are mitigated by the CI workaround.",
      owner_action: "Optional cleanup of CSS import order.",
      evidence: "ci.yml sets CI=false for the build step",
      checks: [
        { name: "ci_build_workaround_present", ok: true, detail: "workaround present" },
      ],
    },
    {
      id: "public-qr-verification",
      title: "Public employee ID-card QR verification",
      category: "feature-blocked",
      severity: "high",
      blocking: false,
      status: "blocked_by_design",
      summary: "Activation deliberately off.",
      owner_action: "Do not switch on until rate limiting and retention purge exist.",
      evidence: "public-qr-verification-design.md",
      checks: [
        { name: "public_route_absent", ok: true, detail: "no public route" },
        { name: "retention_purge_command", ok: false, detail: "missing purge job" },
      ],
    },
  ],
  read_only: true,
  financial_activation: false,
  public_qr_activation: false,
};


describe("SecurityOperationsCenter (Phase 11)", () => {
  beforeEach(() => {
    fetchSecurityOverview.mockResolvedValue(OVERVIEW);
    fetchSecurityAuditStream.mockResolvedValue(AUDIT);
    fetchSecurityAccessReview.mockResolvedValue(ACCESS);
    fetchOutstandingIssues.mockResolvedValue(ISSUES);
  });

  it("renders the posture KPIs from the overview payload", async () => {
    render(<SecurityOperationsCenter />);

    expect(await screen.findByText("Audit events (24h)")).toBeInTheDocument();
    expect(screen.getByText("High-risk actions (7d)")).toBeInTheDocument();
    expect(screen.getByText("Without strong auth")).toBeInTheDocument();
    expect(screen.getByText("Verification failures (24h)")).toBeInTheDocument();
  });

  it("declares itself read-only and never exposes a state-changing control", async () => {
    render(<SecurityOperationsCenter />);

    expect(await screen.findByText("Read-only supervision")).toBeInTheDocument();
    const labels = screen.getAllByRole("button").map((button) => button.textContent.trim());
    expect(labels).not.toContain("Suspend");
    expect(labels).not.toContain("Block");
    expect(labels).not.toContain("Approve");
    expect(labels).not.toContain("Revoke access");
  });

  it("renders the audit stream with high-risk marking", async () => {
    render(<SecurityOperationsCenter />);

    expect(
      await screen.findByText("Admin role changed for support@yala.test")
    ).toBeInTheDocument();
    expect(screen.getAllByText("high").length).toBeGreaterThan(0);
  });

  it("forwards audit filters to the backend", async () => {
    const { container } = render(<SecurityOperationsCenter />);
    await screen.findByText("Admin role changed for support@yala.test");

    fireEvent.change(screen.getByLabelText("Filter by action"), {
      target: { value: "refund" },
    });
    await waitFor(() =>
      expect(fetchSecurityAuditStream).toHaveBeenCalledWith(
        expect.objectContaining({ action: "refund", page: 1 })
      )
    );

    // The shared DataTable swaps in a skeleton while loading, so wait for the
    // table (and therefore the filter inputs) to be back before interacting.
    await screen.findByText("Admin role changed for support@yala.test");
    const fromInput = container.querySelector('input[aria-label="Filter from date"]');
    expect(fromInput).not.toBeNull();
    fireEvent.change(fromInput, { target: { value: "2026-10-01" } });
    await waitFor(() =>
      expect(fetchSecurityAuditStream).toHaveBeenCalledWith(
        expect.objectContaining({ date_from: "2026-10-01" })
      )
    );
  });

  it("renders the access review with protected and strong-auth flags", async () => {
    render(<SecurityOperationsCenter />);

    expect((await screen.findAllByText("founder@yala.test")).length).toBeGreaterThan(0);
    expect(screen.getByText("protected")).toBeInTheDocument();
    expect(screen.getByText("never logged in")).toBeInTheDocument();
    expect(screen.getByText("1 administrators")).toBeInTheDocument();
  });

  it("forwards the access-review flag filter", async () => {
    render(<SecurityOperationsCenter />);
    await screen.findAllByText("founder@yala.test");

    fireEvent.change(screen.getByLabelText("Filter by access flag"), {
      target: { value: "no_totp" },
    });
    await waitFor(() =>
      expect(fetchSecurityAccessReview).toHaveBeenCalledWith({ flag: "no_totp" })
    );
  });

  it("renders the outstanding issues register with checks and owner actions", async () => {
    render(<SecurityOperationsCenter />);

    expect(
      await screen.findByText("Public employee ID-card QR verification")
    ).toBeInTheDocument();
    expect(screen.getByText("blocked by design")).toBeInTheDocument();
    expect(screen.getByText("public_route_absent")).toBeInTheDocument();
    expect(screen.getByText("retention_purge_command")).toBeInTheDocument();
    expect(
      screen.getByText("Do not switch on until rate limiting and retention purge exist.")
    ).toBeInTheDocument();
  });

  it("reports load failures instead of rendering silently empty sections", async () => {
    fetchSecurityOverview.mockRejectedValue({
      response: { data: { detail: "Not allowed" } },
    });
    fetchOutstandingIssues.mockRejectedValue({
      response: { data: { detail: "Issues unavailable" } },
    });
    render(<SecurityOperationsCenter />);

    expect(await screen.findByText("Not allowed")).toBeInTheDocument();
    expect(await screen.findByText("Issues unavailable")).toBeInTheDocument();
  });
});

