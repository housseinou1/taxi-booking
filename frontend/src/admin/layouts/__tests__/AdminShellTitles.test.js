/**
 * Page identity in the admin shell: browser tab title, breadcrumb and a single H1.
 */
import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";

import { AdminShellPage } from "../AdminShell";
import { AdminPageTitle } from "../AdminPageHeading";
import { URL_CHANGE_EVENT } from "../useUrlTab";

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

  it("shows the selected menu item as the heading of a shared module page", async () => {
    render(
      <AdminShellPage pathname="/admin/ceo" title="Executive Overview">
        <h1>
          <AdminPageTitle>Executive Overview</AdminPageTitle>
        </h1>
      </AdminShellPage>
    );
    const headings = await screen.findAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("Business Performance");
  });

  it("follows the selected tab when the page updates the URL", async () => {
    window.history.pushState({}, "", "/admin/trust-safety?tab=emergency");
    render(
      <AdminShellPage pathname="/admin/trust-safety" title="Trust & Safety Center">
        <h1>
          <AdminPageTitle>Trust & Safety Center</AdminPageTitle>
        </h1>
      </AdminShellPage>
    );
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Emergency Alerts");
    act(() => {
      window.history.replaceState({}, "", "/admin/trust-safety?tab=incidents");
      window.dispatchEvent(new Event(URL_CHANGE_EVENT));
    });
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Incident Management")
    );
    expect(document.title).toBe("Incident Management · YALA Admin");
    window.history.pushState({}, "", "/");
  });

  it("keeps the module's own title outside the shell", () => {
    render(
      <h1>
        <AdminPageTitle>Trust & Safety Center</AdminPageTitle>
      </h1>
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Trust & Safety Center");
  });
});
