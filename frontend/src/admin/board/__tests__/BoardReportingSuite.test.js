/**
 * Regression: Board & Investor Reporting Suite (/admin/board-reports).
 *
 * Pins the four defect classes found during the Strategic Reports review:
 *  1. five U+FFFD replacement characters rendered as "" on the page;
 *  2. "undefined%" rendered whenever a percentage field was absent;
 *  3. exports triggered by a bare <a download> that sends no Authorization header, so the
 *     browser saved Django's 401 JSON body as the "report" file;
 *  4. the previous tab's payload left on screen when the next tab's request failed.
 */
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import BoardReportingSuite from "../BoardReportingSuite";
import {
  downloadBoardReport,
  fetchBoardBusinessKpis,
  fetchBoardExecutiveSummary,
  fetchBoardFinancialReport,
  fetchBoardReportingSuite,
} from "../boardReportingApi";

jest.mock("../boardReportingApi", () => ({
  fetchBoardReportingSuite: jest.fn(),
  fetchBoardExecutiveSummary: jest.fn(),
  fetchBoardBusinessKpis: jest.fn(),
  fetchBoardFinancialReport: jest.fn(),
  fetchBoardOperationalReport: jest.fn(),
  fetchBoardGrowthReport: jest.fn(),
  fetchBoardRiskDashboard: jest.fn(),
  fetchBoardStrategicPlanning: jest.fn(),
  downloadBoardReport: jest.fn(),
  saveBlob: jest.fn(),
}));

const EMPTY = {};

beforeEach(() => {
  jest.clearAllMocks();
  fetchBoardReportingSuite.mockResolvedValue(EMPTY);
  fetchBoardExecutiveSummary.mockResolvedValue(EMPTY);
  fetchBoardBusinessKpis.mockResolvedValue(EMPTY);
  fetchBoardFinancialReport.mockResolvedValue(EMPTY);
});

async function renderSuite() {
  render(<BoardReportingSuite />);
  await waitFor(() => expect(screen.getByText("Board & Investor Reporting Suite")).toBeInTheDocument());
}

test("never renders a replacement character or an 'undefined' value", async () => {
  fetchBoardExecutiveSummary.mockResolvedValue({
    cancellation_rate_pct: null,
    completed_rides: 0,
    gmv_mru: 12500,
  });
  await renderSuite();

  const text = document.body.textContent;
  expect(text).not.toContain("\uFFFD");
  expect(text).not.toContain("undefined");
  expect(text).not.toContain("NaN");
});

test("a genuine zero renders 0 while an absent percentage renders a dash", async () => {
  fetchBoardExecutiveSummary.mockResolvedValue({
    completed_rides: 0,
    cancellation_rate_pct: null,
  });
  await renderSuite();

  const completed = screen.getByText("Completed Rides").closest(".beta__card");
  expect(completed.textContent).toContain("0");

  const cancellation = screen.getByText("Cancellation Rate").closest(".beta__card");
  expect(cancellation.textContent).toContain("\u2014");
  expect(cancellation.textContent).not.toContain("%");
});

test("exports are fetched with authentication, never via a bare download link", async () => {
  downloadBoardReport.mockResolvedValue({
    blob: new Blob(["a,b"], { type: "text/csv" }),
    filename: "yala-board-full-weekly.csv",
    contentType: "text/csv",
  });
  await renderSuite();

  fireEvent.click(screen.getByRole("tab", { name: "Export" }));

  // A bare <a download> would send no Authorization header and save the 401 body instead.
  expect(document.querySelectorAll("a[download]")).toHaveLength(0);

  const csvButtons = screen.getAllByRole("button", { name: "CSV" });
  fireEvent.click(csvButtons[0]);

  await waitFor(() => expect(downloadBoardReport).toHaveBeenCalled());
  expect(downloadBoardReport.mock.calls[0][1]).toBe("csv");
  expect(downloadBoardReport.mock.calls[0][2]).toEqual({ period: "weekly" });
});

test("a failed export reports the real error instead of saving a fake file", async () => {
  downloadBoardReport.mockRejectedValue({
    response: { status: 401, data: { detail: "Authentication credentials were not provided." } },
  });
  await renderSuite();

  fireEvent.click(screen.getByRole("tab", { name: "Export" }));
  fireEvent.click(screen.getAllByRole("button", { name: "PDF" })[0]);

  await waitFor(() => expect(screen.getByText(/session has expired/i)).toBeInTheDocument());
});

test("switching tabs clears the previous report so figures cannot appear under the wrong heading", async () => {
  fetchBoardExecutiveSummary.mockResolvedValue({ completed_rides: 4242 });
  fetchBoardBusinessKpis.mockRejectedValue({ response: { status: 500, data: {} } });

  await renderSuite();
  await waitFor(() => expect(screen.getByText("4242")).toBeInTheDocument());

  fireEvent.click(screen.getByRole("tab", { name: "Business KPIs" }));

  await waitFor(() => expect(screen.getByText(/backend failed/i)).toBeInTheDocument());
  expect(screen.queryByText("4242")).not.toBeInTheDocument();
});

test("a 404 reports a deployment problem rather than the raw axios string", async () => {
  fetchBoardReportingSuite.mockRejectedValue({ response: { status: 404, data: "<html>Not Found</html>" } });
  await renderSuite();

  await waitFor(() => expect(screen.getByText(/not found on this backend/i)).toBeInTheDocument());
  expect(document.body.textContent).not.toMatch(/Request failed with status code/i);
});

test("raw JSON is never dumped into the page", async () => {
  await renderSuite();
  expect(document.querySelectorAll("pre.board-report-pre")).toHaveLength(0);
});
