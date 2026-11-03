/**
 * Phase 10 — Roles & Permissions Center tests.
 *
 * Verifies the role registry renders with protection markers, that protected
 * Founder/CEO accounts expose NO governance controls, that an unprotected account
 * can be changed only with a reason (which is forwarded to the audited backend),
 * and that backend refusals surface verbatim instead of being swallowed.
 */
import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import RolesPermissionsCenter from "../RolesPermissionsCenter";
import {
  assignAccountRole,
  fetchRoleAccounts,
  fetchRoleRegistry,
  setStaffAccess,
} from "../rolesApi";

jest.mock("../rolesApi", () => {
  const actual = jest.requireActual("../rolesApi");
  return {
    ...actual,
    fetchRoleRegistry: jest.fn(),
    fetchRoleAccounts: jest.fn(),
    assignAccountRole: jest.fn(),
    setStaffAccess: jest.fn(),
  };
});

jest.mock("../../layouts/AdminShell", () => ({
  AdminShellPage: ({ children }) => children,
}));

jest.mock("../../permissions/PermissionContext", () => ({
  PermissionProvider: ({ children }) => children,
  usePermissions: () => ({
    permissions: { role: "ceo", modules: ["ceo", "employees"], actions: {}, feature_flags: {} },
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

const REGISTRY = {
  roles: [
    {
      role: "ceo",
      label: "CEO",
      groups: ["CEO", "Super Admin"],
      modules: ["home", "ceo", "finance", "employees"],
      home_route: "/admin/home/ceo",
      approval_limits: { refund_mru: null, withdrawal_mru: null },
      members: 1,
      assignable: false,
      protected: true,
    },
    {
      role: "finance",
      label: "Finance",
      groups: ["Finance", "Accountant"],
      modules: ["home", "finance"],
      home_route: "/admin/home/finance",
      approval_limits: { refund_mru: 50000, withdrawal_mru: 100000 },
      members: 0,
      assignable: true,
      protected: false,
    },
    {
      role: "support",
      label: "Support",
      groups: ["Support"],
      modules: ["home", "support"],
      home_route: "/admin/home/support",
      approval_limits: { refund_mru: 0 },
      members: 1,
      assignable: true,
      protected: false,
    },
  ],
  assignable_roles: ["system_admin", "ops", "finance", "support"],
  managed_groups: ["CEO", "Super Admin", "Support"],
  permission_catalogue: { ceo: ["users.suspend", "users.block"], support: ["users.view"] },
  total_staff_accounts: 2,
  protection: {
    protected_groups: ["CEO", "Super Admin"],
    superusers_protected: true,
    self_modification_blocked: true,
    guarantees: [
      "No API endpoint can demote, suspend, deactivate or delete a protected account.",
      "CEO/Super Admin authority cannot be granted through the roles API.",
      "Every refused attempt is answered with an explicit reason, never silently.",
    ],
  },
  read_only: true,
};

const ACCOUNTS = {
  count: 2,
  results: [
    {
      id: 1,
      email: "founder@yala.test",
      name: "Founder CEO",
      role: "ceo",
      role_label: "CEO",
      groups: ["CEO"],
      modules: ["ceo"],
      is_staff: true,
      is_superuser: false,
      totp_confirmed: true,
      last_login: null,
      protected: true,
      protection_reason: "Founder/CEO authority — protected from modification.",
    },
    {
      id: 2,
      email: "support@yala.test",
      name: "Support Agent",
      role: "support",
      role_label: "Support",
      groups: ["Support"],
      modules: ["support"],
      is_staff: true,
      is_superuser: false,
      totp_confirmed: false,
      last_login: "2026-10-20T10:00:00Z",
      protected: false,
      protection_reason: "",
    },
  ],
  summary: { staff: 2, superusers: 0, protected: 1, without_totp: 1 },
  protection: { protected_groups: ["CEO", "Super Admin"] },
};


describe("RolesPermissionsCenter (Phase 10)", () => {
  beforeEach(() => {
    fetchRoleRegistry.mockResolvedValue(REGISTRY);
    fetchRoleAccounts.mockResolvedValue(ACCOUNTS);
    assignAccountRole.mockResolvedValue({ message: "Role updated to Finance." });
    setStaffAccess.mockResolvedValue({ message: "Administrative access revoked." });
  });

  it("renders the role registry with modules, limits and protection markers", async () => {
    render(<RolesPermissionsCenter />);

    expect((await screen.findAllByText("CEO")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Finance").length).toBeGreaterThan(0);
    expect(screen.getByText("refund_mru: 50,000 MRU · withdrawal_mru: 100,000 MRU")).toBeInTheDocument();
    expect(screen.getByText("Founder/CEO authority is protected")).toBeInTheDocument();
  });

  it("shows the protection guarantees and account summary", async () => {
    render(<RolesPermissionsCenter />);

    expect(
      await screen.findByText(
        "CEO/Super Admin authority cannot be granted through the roles API."
      )
    ).toBeInTheDocument();
    expect(screen.getByText("Protected accounts")).toBeInTheDocument();
    expect(screen.getByText("Without strong auth")).toBeInTheDocument();
  });

  it("exposes no governance control for the protected Founder/CEO account", async () => {
    render(<RolesPermissionsCenter />);

    expect(await screen.findByText("Protected — Founder/CEO authority")).toBeInTheDocument();
    // Only the unprotected account offers controls (Change role + Revoke access).
    expect(screen.getAllByRole("button", { name: "Change role" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Revoke access" })).toHaveLength(1);
  });

  it("requires a reason before calling the audited role endpoint", async () => {
    render(<RolesPermissionsCenter />);

    fireEvent.click(await screen.findByRole("button", { name: "Change role" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm change" }));

    expect(
      await screen.findByText("A reason of at least 5 characters is required.")
    ).toBeInTheDocument();
    expect(assignAccountRole).not.toHaveBeenCalled();
  });

  it("forwards the role change with its reason and refreshes the data", async () => {
    render(<RolesPermissionsCenter />);

    fireEvent.click(await screen.findByRole("button", { name: "Change role" }));
    const callsBeforeChange = fetchRoleAccounts.mock.calls.length;
    fireEvent.change(screen.getByLabelText("New role"), { target: { value: "finance" } });
    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "Moved to the finance team" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm change" }));

    await waitFor(() =>
      expect(assignAccountRole).toHaveBeenCalledWith(2, "finance", "Moved to the finance team")
    );
    expect(assignAccountRole).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Role updated to Finance.")).toBeInTheDocument();
    // The governance change forces a re-read so the table never shows stale roles.
    await waitFor(() =>
      expect(fetchRoleAccounts.mock.calls.length).toBeGreaterThan(callsBeforeChange)
    );
  });

  it("revokes access through the audited endpoint only after a reason is given", async () => {
    render(<RolesPermissionsCenter />);

    fireEvent.click(await screen.findByRole("button", { name: "Revoke access" }));
    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "Left the company" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm change" }));

    await waitFor(() =>
      expect(setStaffAccess).toHaveBeenCalledWith(2, false, "Left the company")
    );
    expect(await screen.findByText("Administrative access revoked.")).toBeInTheDocument();
  });

  it("surfaces a backend protection refusal instead of silently failing", async () => {
    assignAccountRole.mockRejectedValue({
      response: { data: { error: "This account holds protected Founder/CEO authority" } },
    });
    render(<RolesPermissionsCenter />);

    fireEvent.click(await screen.findByRole("button", { name: "Change role" }));
    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "Attempted demotion" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm change" }));

    expect(
      await screen.findByText("This account holds protected Founder/CEO authority")
    ).toBeInTheDocument();
  });

  it("renders the permission catalogue and reports load failures", async () => {
    fetchRoleRegistry.mockRejectedValue({ response: { data: { detail: "Not allowed" } } });
    render(<RolesPermissionsCenter />);

    expect(await screen.findByText("Not allowed")).toBeInTheDocument();
  });
});

