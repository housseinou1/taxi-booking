/**
 * Keyboard behavior for the enterprise top navigation.
 */
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import AdminTopNav from "../AdminTopNav";

jest.mock("../../permissions/PermissionContext", () => ({
  usePermissions: () => ({
    permissions: {
      modules: ["home", "rides"],
      feature_flags: {},
      actions: {},
    },
  }),
}));

jest.mock("../permissions/topNavConfig", () => ({
  filterTopNavItems: () => [
    {
      id: "operations",
      label: "Operations",
      icon: "activity",
      children: [
        { id: "r1", module: "rides", label: "Rides", path: "/admin/rides", icon: "car" },
        { id: "r2", module: "rides", label: "Trip Monitoring", path: "/admin/rides/live", icon: "eye" },
      ],
    },
  ],
}));

const realHref = window.location.href;

beforeEach(() => {
  delete window.location;
  window.location = { href: realHref, assign: jest.fn(), replace: jest.fn() };
});

afterAll(() => {
  window.location.href = realHref;
});

test("ArrowDown on group button focuses first menu item", async () => {
  render(<AdminTopNav pathname="/admin" mobileOpen={false} />);
  const groupBtn = screen.getByRole("button", { name: /operations/i });
  groupBtn.focus();
  fireEvent.keyDown(groupBtn, { key: "ArrowDown" });
  const first = screen.getByRole("menuitem", { name: /rides/i });
  await waitFor(() => expect(document.activeElement).toBe(first));
});

test("Escape closes panel and returns focus to group button", () => {
  render(<AdminTopNav pathname="/admin" mobileOpen={false} />);
  const groupBtn = screen.getByRole("button", { name: /operations/i });
  fireEvent.click(groupBtn);
  const first = screen.getByRole("menuitem", { name: /rides/i });
  first.focus();
  fireEvent.keyDown(first, { key: "Escape" });
  expect(document.activeElement).toBe(groupBtn);
});
