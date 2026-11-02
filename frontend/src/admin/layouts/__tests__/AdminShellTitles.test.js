/**
 * Page identity in the admin shell: browser tab title, breadcrumb and a single H1.
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";

import { AdminShellPage } from "../AdminShell";

jest.mock("../../permissions/PermissionContext", () => ({
  PermissionProvider: ({ children }) => children,
  usePermissions: () => ({
    permissions: { role: "ceo", elevated: true, modules: [], actions: {}, feature_flags: {} },
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

beforeEach(() => {
  if (!window.matchMedia) {
    window.matchMedia = () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    });
  }
});

describe("AdminShell page titles", () => {
  it("names the tab and breadcrumb after the active menu entry", async () => {
    render(
      <AdminShellPage pathname="/admin/ceo" title="Executive Overview">
        <p>content</p>
      </AdminShellPage>
    );
    await waitFor(() => expect(document.title).toBe("Business Performance · YALA Admin"));
    const crumbs = screen.getByRole("navigation", { name: /breadcrumb/i });
    expect(crumbs).toHaveTextContent("Executive Command Center");
    expect(crumbs).toHaveTextContent("Business Performance");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("does not add a second H1 when the page renders its own", async () => {
    render(
      <AdminShellPage pathname="/admin/vehicles" title="Vehicle Management">
        <h1>Vehicle Management</h1>
      </AdminShellPage>
    );
    await waitFor(() =>
      expect(screen.getAllByRole("heading", { level: 1, name: "Vehicle Management" })).toHaveLength(1)
    );
  });
});
