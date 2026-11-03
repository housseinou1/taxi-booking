/**
 * Regression: the admin permissions bootstrap must report a precise cause.
 *
 * Production returned HTTP 404 from GET /operations/admin/me/permissions/ because
 * the route was never deployed. PermissionContext previously surfaced axios's
 * generic "Request failed with status code 404", which reads like a bug in the
 * dashboard rather than a missing backend deployment. Every admin page is denied
 * when this call fails, so the message has to be actionable.
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";

import { PermissionProvider, usePermissions } from "../PermissionContext";
import { fetchAdminPermissions } from "../../layouts/permissions/adminPermissionsApi";

jest.mock("../../layouts/permissions/adminPermissionsApi", () => ({
  fetchAdminPermissions: jest.fn(),
  clearAdminPermissionsCache: jest.fn(),
}));

jest.mock("../../../auth/session", () => ({
  clearAuthSession: jest.fn(),
}));

jest.mock("../adminAuditApi", () => ({
  logAdminLogin: jest.fn(),
  logAdminLogout: jest.fn(),
  logAdminPermissionDenied: jest.fn(),
  logAdminSessionTimeout: jest.fn(),
}));

function Probe() {
  const { error, loading } = usePermissions();
  if (loading) return <span>loading</span>;
  return <span data-testid="err">{error || "no-error"}</span>;
}

function renderProbe() {
  return render(
    <PermissionProvider pathname="/admin/ceo-reports">
      <Probe />
    </PermissionProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

test("HTTP 404 reports a deployment/configuration problem, not missing data", async () => {
  fetchAdminPermissions.mockRejectedValue({
    response: { status: 404, data: "<html><body>Not Found</body></html>" },
  });

  renderProbe();

  const err = await screen.findByTestId("err");
  await waitFor(() => expect(err).toHaveTextContent(/404/));
  expect(err).toHaveTextContent(/configuration problem, not missing data/i);
  // The old raw axios text must not leak through.
  expect(err.textContent).not.toMatch(/Request failed with status code/i);
});

test("HTTP 401 tells the operator to sign in again", async () => {
  fetchAdminPermissions.mockRejectedValue({ response: { status: 401, data: {} } });

  renderProbe();

  const err = await screen.findByTestId("err");
  await waitFor(() => expect(err).toHaveTextContent(/session has expired/i));
});

test("no response at all reports an unreachable backend", async () => {
  fetchAdminPermissions.mockRejectedValue(new Error("Network Error"));

  renderProbe();

  const err = await screen.findByTestId("err");
  await waitFor(() => expect(err).toHaveTextContent(/could not reach the yala backend/i));
});

test("a successful load reports no error", async () => {
  fetchAdminPermissions.mockResolvedValue({
    role: "ceo",
    modules: ["ceo"],
    elevated: true,
    feature_flags: {},
  });

  renderProbe();

  const err = await screen.findByTestId("err");
  expect(err).toHaveTextContent("no-error");
});
