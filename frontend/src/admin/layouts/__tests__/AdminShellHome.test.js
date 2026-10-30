/**
 * Task 6d — Admin "Go home" routing safety.
 *
 * The backend advertises `/admin/home/<role>` as `home_route`
 * (operations/admin_permissions_service.py HOME_ROUTES), but App.js registers none of those
 * paths: an unmatched admin path falls through to `<LandingPage />`. Following the advertised
 * route therefore drops an authenticated administrator on the public landing page.
 *
 * These tests render the real AdminShell error pages and assert the destination is always a
 * registered admin route.
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";

import { AdminShellPage } from "../AdminShell";

let mockHomeRoute = "/admin/home/ceo";

jest.mock("../../permissions/PermissionContext", () => ({
  PermissionProvider: ({ children }) => children,
  usePermissions: () => ({
    permissions: {
      role: "ceo",
      elevated: true,
      modules: ["home"],
      actions: {},
      feature_flags: {},
      home_route: mockHomeRoute,
    },
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

const realLocation = window.location;

beforeEach(() => {
  mockHomeRoute = "/admin/home/ceo";
  if (!window.matchMedia) {
    window.matchMedia = () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    });
  }
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: {
      href: "",
      pathname: "/admin/unauthorized",
      replace: () => {},
      assign: () => {},
    },
  });
});

afterAll(() => {
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: realLocation,
  });
});

test("the 403 page never sends an administrator to an unregistered /admin/home route", () => {
  render(
    <AdminShellPage pathname="/admin/unauthorized" title="Blocked">
      <div>content</div>
    </AdminShellPage>
  );

  fireEvent.click(screen.getByRole("button", { name: /back to dashboard/i }));

  expect(window.location.href).toBe("/admin");
});

test("the 404 page never sends an administrator to an unregistered /admin/home route", () => {
  render(
    <AdminShellPage pathname="/admin/404" title="Missing">
      <div>content</div>
    </AdminShellPage>
  );

  fireEvent.click(screen.getByRole("button", { name: /go to home/i }));

  expect(window.location.href).toBe("/admin");
});

test("a registered backend home route is preserved", () => {
  mockHomeRoute = "/admin/employees";

  render(
    <AdminShellPage pathname="/admin/unauthorized" title="Blocked">
      <div>content</div>
    </AdminShellPage>
  );

  fireEvent.click(screen.getByRole("button", { name: /back to dashboard/i }));

  expect(window.location.href).toBe("/admin/employees");
});
