/**
 * ProtectedActionButton — permission modes.
 *
 * REGRESSION GUARD: the component hard-coded mode="disable", so an operator without
 * approval rights still SAW an approve control (greyed out). Sensitive financial
 * approvals must be hidden entirely from users who cannot perform them.
 */
import React from "react";
import { render, screen } from "@testing-library/react";

import ProtectedActionButton from "../ProtectedActionButton";
import { usePermissions } from "../../../permissions/PermissionContext";

jest.mock("../../../permissions/PermissionContext");

const grant = () => ({
  canView: () => true,
  canAction: () => true,
  canApprove: () => true,
  canExport: () => true,
});

const deny = () => ({
  canView: () => true,
  canAction: () => false,
  canApprove: () => false,
  canExport: () => false,
});

describe("ProtectedActionButton", () => {
  test("renders the button when the action is permitted", () => {
    usePermissions.mockReturnValue(grant());
    render(
      <ProtectedActionButton approve="withdrawal">Approve</ProtectedActionButton>
    );
    expect(screen.getByRole("button", { name: /approve/i })).toBeInTheDocument();
  });

  test("REGRESSION: mode='hide' removes the button entirely when denied", () => {
    usePermissions.mockReturnValue(deny());
    render(
      <ProtectedActionButton approve="withdrawal" mode="hide">
        Approve
      </ProtectedActionButton>
    );
    expect(screen.queryByRole("button", { name: /approve/i })).not.toBeInTheDocument();
  });

  test("REGRESSION: mode='hide' still SHOWS the button when granted (not over-hidden)", () => {
    usePermissions.mockReturnValue(grant());
    render(
      <ProtectedActionButton approve="refund" mode="hide">
        Approve refund
      </ProtectedActionButton>
    );
    expect(screen.getByRole("button", { name: /approve refund/i })).toBeInTheDocument();
  });

  test("the default mode still disables rather than hides (unchanged behaviour)", () => {
    usePermissions.mockReturnValue(deny());
    render(
      <ProtectedActionButton approve="withdrawal">Approve</ProtectedActionButton>
    );
    const button = screen.getByRole("button", { name: /approve/i });
    expect(button).toBeDisabled();
  });
});
