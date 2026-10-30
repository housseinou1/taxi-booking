/**
 * Regression test for the /admin/withdrawals runtime crash.
 *
 * The page used to call `usePermissions()` in its own body while the provider was created
 * by `AdminShellPage`, which it rendered as a *child*. React context only flows downwards,
 * so the hook ran with no provider and threw
 * "usePermissions must be used within PermissionProvider".
 *
 * This test deliberately does NOT mock PermissionContext. `AdminShellPage` is mocked to
 * wrap its children in the **real** `PermissionProvider`, which is exactly what the real
 * shell does. If the hook ever moves back outside the provider, this test fails.
 */
import React from "react";
import { render, screen } from "@testing-library/react";

import WithdrawalsMonitoring from "../WithdrawalsMonitoring";

jest.mock("../../layouts/AdminShell", () => {
  const { PermissionProvider } = jest.requireActual("../../permissions/PermissionContext");
  return {
    AdminShellPage: ({ children }) => (
      <PermissionProvider pathname="/admin/withdrawals">{children}</PermissionProvider>
    ),
  };
});

jest.mock("../withdrawalsApi", () => {
  const actual = jest.requireActual("../withdrawalsApi");
  return {
    ...actual,
    fetchAdminWithdrawals: jest.fn().mockResolvedValue({ results: [], count: 0 }),
    fetchFinanceOverview: jest.fn().mockResolvedValue({}),
    fetchWithdrawalDetail: jest.fn().mockResolvedValue({}),
  };
});

// PermissionProvider loads permissions on mount; resolve an elevated (CEO) set.
jest.mock("../../layouts/permissions/adminPermissionsApi", () => ({
  fetchAdminPermissions: jest.fn().mockResolvedValue({
    role: "ceo",
    elevated: true,
    modules: [],
    actions: {},
    feature_flags: {},
  }),
  clearAdminPermissionsCache: jest.fn(),
}));

jest.mock("../../permissions/adminAuditApi", () => ({
  logAdminLogin: jest.fn(),
  logAdminLogout: jest.fn(),
  logAdminPermissionDenied: jest.fn(),
  logAdminSessionTimeout: jest.fn(),
}));

test("renders inside the shell's PermissionProvider without throwing", async () => {
  render(<WithdrawalsMonitoring />);

  // A KPI from the withdrawal content proves the content itself rendered.
  expect(await screen.findByText("Total requests")).toBeInTheDocument();
});

test("the hook still fails loudly outside a provider (guards the invariant)", () => {
  const { usePermissions } = jest.requireActual("../../permissions/PermissionContext");
  const spy = jest.spyOn(console, "error").mockImplementation(() => {});

  function Probe() {
    usePermissions();
    return null;
  }

  expect(() => render(<Probe />)).toThrow(/PermissionProvider/);
  spy.mockRestore();
});
