/**
 * Regression: Business Performance (/admin/ceo) must not hide a genuine zero.
 *
 * The backend reports customer_satisfaction as a real 0, but the card rendered "—"
 * because of `overview.customer_satisfaction || "—"` — `0 || "—"` is falsy, so a real
 * zero was displayed as unavailable. The inverse of the fabrication bug.
 *
 * Also pins the neighbouring Operational Health cards, which used to render
 * "undefined%" and "— min" when their fields were absent.
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";

import CeoExecutiveDashboard from "../CeoExecutiveDashboard";
import { fetchCeoMasterDashboard } from "../ceoMasterApi";
import { fetchExecutiveDashboard, fetchPendingWithdrawals } from "../../executive/executiveApi";

jest.mock("../ceoMasterApi", () => {
  const actual = jest.requireActual("../ceoMasterApi");
  return {
    ...actual,
    fetchCeoMasterDashboard: jest.fn(),
    postCeoApproveOnboarding: jest.fn(),
    postCeoBroadcast: jest.fn(),
    postCeoFreeze: jest.fn(),
  };
});

jest.mock("../../executive/executiveApi", () => ({
  fetchExecutiveDashboard: jest.fn(),
  fetchPendingWithdrawals: jest.fn(),
}));

jest.mock("../../layouts/AdminShell", () => ({
  AdminShellPage: ({ children }) => children,
}));

// jsdom does not implement IntersectionObserver, which the page uses for scroll-spy.
beforeAll(() => {
  global.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  };
});

function card(label) {
  return screen.getByText(label).closest(".ceo-exec__card");
}

beforeEach(() => {
  jest.clearAllMocks();
  fetchExecutiveDashboard.mockResolvedValue(null);
  fetchPendingWithdrawals.mockResolvedValue([]);
});

test("a genuine zero customer_satisfaction renders 0, not an em dash", async () => {
  fetchCeoMasterDashboard.mockResolvedValue({
    executive_overview: {
      customer_satisfaction: 0,
      platform_health_score: 99,
      driver_acceptance_rate_pct: 100,
      cancellation_rate_pct: 0,
    },
  });

  render(<CeoExecutiveDashboard />);
  await waitFor(() => expect(screen.getByText("Average Rating")).toBeInTheDocument());

  expect(card("Average Rating").textContent).toContain("0");
  expect(card("Average Rating").textContent).not.toContain("—");
});

test("an absent customer_satisfaction still renders an em dash", async () => {
  fetchCeoMasterDashboard.mockResolvedValue({ executive_overview: { platform_health_score: 99 } });

  render(<CeoExecutiveDashboard />);
  await waitFor(() => expect(screen.getByText("Average Rating")).toBeInTheDocument());

  expect(card("Average Rating").textContent).toContain("—");
});

test("Operational Health never renders 'undefined%' or a dash with a unit", async () => {
  fetchCeoMasterDashboard.mockResolvedValue({ executive_overview: {} });

  render(<CeoExecutiveDashboard />);
  await waitFor(() => expect(screen.getByText("Ride Completion Rate")).toBeInTheDocument());

  expect(document.body.textContent).not.toContain("undefined");
  // a missing ETA must be just the dash, never "— min"
  expect(card("Average ETA / Wait").textContent).not.toContain("— min");
  expect(card("Driver Acceptance Rate").textContent).toContain("—");
});

test("a 404 on load reports a deployment problem, never the raw axios string", async () => {
  fetchCeoMasterDashboard.mockRejectedValue({ response: { status: 404, data: "<html>Not Found</html>" } });

  render(<CeoExecutiveDashboard />);

  await waitFor(() => expect(screen.getByText(/not found on this backend/i)).toBeInTheDocument());
  expect(document.body.textContent).not.toMatch(/Request failed with status code/i);
});
