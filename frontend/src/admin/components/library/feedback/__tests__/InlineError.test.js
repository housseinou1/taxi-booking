/**
 * Phase 11 — InlineError children fix.
 *
 * The shared component previously accepted `children` but never rendered them, so
 * callers that passed a retry control (or custom copy) silently rendered nothing.
 * These tests pin the fixed behaviour: message renders, children render, and the
 * alert role/ids are preserved.
 */
import React from "react";
import { render, screen } from "@testing-library/react";

import InlineError from "../InlineError";

describe("InlineError (Phase 11 fix)", () => {
  it("renders the default message when nothing is supplied", () => {
    render(<InlineError />);
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong");
  });

  it("renders a custom message", () => {
    render(<InlineError message="Could not load accounts." />);
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load accounts.");
  });

  it("renders children instead of dropping them", () => {
    render(
      <InlineError message="Failed to load.">
        <button type="button">Try again</button>
      </InlineError>
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Failed to load.");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("keeps the alert role and id contract", () => {
    render(<InlineError message="Boom" id="err-1" />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveAttribute("id", "err-1");
  });
});