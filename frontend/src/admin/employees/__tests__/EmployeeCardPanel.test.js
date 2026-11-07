import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

import EmployeeCardPanel from "../EmployeeCardPanel";
import * as api from "../employeesApi";

jest.mock("../employeesApi", () => {
  const actual = jest.requireActual("../employeesApi");
  return {
    ...actual,
    fetchCards: jest.fn(),
    fetchCardQr: jest.fn(),
    fetchCardPdf: jest.fn(),
    fetchEmployee: jest.fn(),
    fetchPhoto: jest.fn(),
    fetchSignature: jest.fn(),
    fetchCeoIdCardSignaturePreview: jest.fn(),
    issueCard: jest.fn(),
    renewCard: jest.fn(),
    replaceCard: jest.fn(),
    activateCard: jest.fn(),
    deactivateCard: jest.fn(),
    revokeCard: jest.fn(),
  };
});

// A valid card expiring far in the future (Active).
const activeCard = {
  id: 10,
  card_number: "CARD-10",
  status: "valid",
  status_display: "Valid",
  issued_at: "2026-01-01",
  expires_at: "2099-01-01",
  renewal_count: 0,
};

beforeEach(() => {
  jest.clearAllMocks();
  global.URL.createObjectURL = jest.fn(() => "blob:card-qr");
  global.URL.revokeObjectURL = jest.fn();
  api.fetchCardQr.mockResolvedValue({ data: new Blob(["png"], { type: "image/png" }) });
  // Card document + employee record + photograph defaults: a complete card, so the
  // preview/print path is exercised rather than skipped.
  api.fetchCardPdf.mockResolvedValue({
    data: new Blob(["%PDF-1.4"], { type: "application/pdf" }),
  });
  api.fetchEmployee.mockResolvedValue({
    data: {
      employee_number: "E1",
      full_name: "Aicha Mint Ahmed",
      job_title: "Dispatcher",
      department: "Operations",
      employment_status: "active",
    },
  });
  api.fetchPhoto.mockResolvedValue({ data: new Blob(["png"], { type: "image/png" }) });
  api.fetchCeoIdCardSignaturePreview.mockRejectedValue({ response: { status: 404 } });
});

function renderPanel(overrides = {}) {
  return render(
    <EmployeeCardPanel
      employeeNumber="E1"
      canManage={false}
      canAdminister={false}
      notify={jest.fn()}
      {...overrides}
    />
  );
}

test("renders current card with Active status chip", async () => {
  api.fetchCards.mockResolvedValue({ data: [activeCard] });
  renderPanel();
  expect(await screen.findByText("CARD-10")).toBeInTheDocument();
  expect(screen.getByText("Active")).toBeInTheDocument();
});

test("manager sees issue/renew/replace, staff does not", async () => {
  api.fetchCards.mockResolvedValue({ data: [activeCard] });
  const { unmount } = renderPanel({ canManage: true });
  await screen.findByText("CARD-10");
  expect(screen.getByRole("button", { name: /renew card/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /replace card/i })).toBeInTheDocument();
  unmount();

  api.fetchCards.mockResolvedValue({ data: [activeCard] });
  renderPanel({ canManage: false });
  await screen.findByText("CARD-10");
  expect(screen.queryByRole("button", { name: /renew card/i })).not.toBeInTheDocument();
});

test("administrator sees revoke; clicking it opens confirmation and calls revokeCard", async () => {
  api.fetchCards.mockResolvedValue({ data: [activeCard] });
  api.revokeCard.mockResolvedValue({ data: {} });
  renderPanel({ canAdminister: true });
  await screen.findByText("CARD-10");

  fireEvent.click(screen.getByRole("button", { name: /^revoke$/i }));
  // Confirmation dialog appears.
  expect(await screen.findByText(/are you sure you want to revoke/i)).toBeInTheDocument();

  // Confirm inside the dialog.
  const confirmButtons = screen.getAllByRole("button", { name: /revoke/i });
  fireEvent.click(confirmButtons[confirmButtons.length - 1]);

  await waitFor(() => expect(api.revokeCard).toHaveBeenCalledWith("E1", 10, {}));
  // Refetch after action.
  await waitFor(() => expect(api.fetchCards).toHaveBeenCalledTimes(2));
});

test("manager issue action opens confirmation and calls issueCard", async () => {
  api.fetchCards.mockResolvedValue({ data: [] });
  api.issueCard.mockResolvedValue({ data: {} });
  renderPanel({ canManage: true });
  await screen.findByText(/no id card/i);

  fireEvent.click(screen.getByRole("button", { name: /issue card/i }));
  expect(await screen.findByText(/are you sure you want to issue/i)).toBeInTheDocument();
  const confirmButtons = screen.getAllByRole("button", { name: /issue card/i });
  fireEvent.click(confirmButtons[confirmButtons.length - 1]);
  await waitFor(() => expect(api.issueCard).toHaveBeenCalledWith("E1"));
});

test("403 on a card action produces a toast and does not crash", async () => {
  api.fetchCards.mockResolvedValue({ data: [activeCard] });
  api.revokeCard.mockRejectedValue({ response: { status: 403, data: {} } });
  const notify = jest.fn();
  renderPanel({ canAdminister: true, notify });
  await screen.findByText("CARD-10");

  fireEvent.click(screen.getByRole("button", { name: /^revoke$/i }));
  await screen.findByText(/are you sure you want to revoke/i);
  const confirmButtons = screen.getAllByRole("button", { name: /revoke/i });
  fireEvent.click(confirmButtons[confirmButtons.length - 1]);

  await waitFor(() =>
    expect(notify).toHaveBeenCalledWith("danger", expect.stringMatching(/not authorized/i))
  );
  // Still shows the card — no crash.
  expect(screen.getByText("CARD-10")).toBeInTheDocument();
});

// ── Phase 6: verification QR (authenticated blob) ────────────────────────────

test("loads the current card QR through the authenticated endpoint and renders it", async () => {
  api.fetchCards.mockResolvedValue({ data: [activeCard] });
  renderPanel();

  await screen.findByText("CARD-10");
  await waitFor(() => expect(api.fetchCardQr).toHaveBeenCalledWith("E1", 10));

  const image = await screen.findByAltText("ID card verification QR");
  expect(image).toHaveAttribute("src", "blob:card-qr");
  expect(screen.getByText("Download QR")).toBeInTheDocument();
});

test("QR is not requested when no card has been issued", async () => {
  api.fetchCards.mockResolvedValue({ data: [] });
  renderPanel();

  await screen.findByText(/No ID card has been issued yet/i);
  expect(api.fetchCardQr).not.toHaveBeenCalled();
});

test("QR failure is surfaced without breaking the panel", async () => {
  api.fetchCards.mockResolvedValue({ data: [activeCard] });
  api.fetchCardQr.mockRejectedValue({ response: { status: 403 } });

  renderPanel();

  await screen.findByText("CARD-10");
  expect(await screen.findByText(/not authorized to view the card QR/i)).toBeInTheDocument();
  expect(screen.getByText("Card history")).toBeInTheDocument();
});


// ── Card document output: preview, PDF download, printing ────────────────────

test("offers preview, PDF download and printing for the current card", async () => {
  api.fetchCards.mockResolvedValue({ data: [activeCard] });
  renderPanel();

  expect(await screen.findByText("CARD-10")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Preview ID Card" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Download ID Card (PDF)" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Print ID Card" })).toBeInTheDocument();
});

test("preview modal shows both card faces with real backend employee data", async () => {
  api.fetchCards.mockResolvedValue({ data: [activeCard] });
  renderPanel();

  fireEvent.click(await screen.findByRole("button", { name: "Preview ID Card" }));

  // Front face
  expect(await screen.findByText("OFFICIAL EMPLOYEE IDENTIFICATION")).toBeInTheDocument();
  // Back face — final Founder/CEO-approved content
  expect(screen.getByText("SCAN TO VERIFY")).toBeInTheDocument();
  expect(screen.getByText("Phone: +222 22 11 43 73")).toBeInTheDocument();
  expect(screen.getByText("Email: sakho@admin.mr")).toBeInTheDocument();
  expect(screen.getByText("IF FOUND, PLEASE CONTACT US")).toBeInTheDocument();
  expect(
    screen.getAllByText("This identification card is the property of Yala Technologies.").length
  ).toBeGreaterThan(0);
  expect(screen.getByText("IMPORTANT NOTICE:")).toBeInTheDocument();
  expect(screen.getByText("This card is non-transferable.")).toBeInTheDocument();
  expect(
    screen.getByText("Present upon request by authorized personnel.")
  ).toBeInTheDocument();
  // Employee data comes from the backend record (name appears on both faces).
  expect(screen.getAllByText("Aicha Mint Ahmed").length).toBeGreaterThan(0);
  expect(screen.getByText("Dispatcher")).toBeInTheDocument();
  expect(screen.getByText("Operations")).toBeInTheDocument();
  // The PDF is requested per card, on demand.
  expect(api.fetchCardPdf).toHaveBeenCalledWith("E1", 10);
});

test("preview front face labels the signature and states when none is provided", async () => {
  api.fetchCards.mockResolvedValue({ data: [activeCard] });
  api.fetchSignature.mockRejectedValue({ response: { status: 404 } });
  renderPanel();

  fireEvent.click(await screen.findByRole("button", { name: "Preview ID Card" }));

  const frontCard = document.querySelector(".emp-idcard--front");
  expect(frontCard).toBeTruthy();
  expect(within(frontCard).getByText(/employee signature/i)).toBeInTheDocument();
  expect(within(frontCard.querySelector(".emp-idcard__sig-slot--employee")).getByText(/not provided/i)).toBeInTheDocument();
  // A missing signature is never replaced by an invented one.
  expect(screen.queryByAltText("Employee signature")).toBeNull();
});

test("preview front face shows the employee's stored signature", async () => {
  api.fetchCards.mockResolvedValue({ data: [activeCard] });
  api.fetchSignature.mockResolvedValue({ data: new Blob(["sig"], { type: "image/png" }) });
  renderPanel();

  fireEvent.click(await screen.findByRole("button", { name: "Preview ID Card" }));

  const image = await screen.findByAltText("Employee signature");
  expect(image).toBeInTheDocument();
  expect(screen.getByText(/employee signature/i)).toBeInTheDocument();
  expect(screen.queryByText(/signature not provided/i)).toBeNull();
});

test("preview back face shows the final Founder/CEO-confirmed contact information", async () => {
  api.fetchCards.mockResolvedValue({ data: [activeCard] });
  renderPanel();

  fireEvent.click(await screen.findByRole("button", { name: "Preview ID Card" }));

  // Official card contact information confirmed by the Founder/CEO (2026-10-26).
  expect(screen.getByText("Phone: +222 22 11 43 73")).toBeInTheDocument();
  expect(screen.getByText("Email: sakho@admin.mr")).toBeInTheDocument();
  // Lost/found instruction and verification wording.
  expect(screen.getByText("IF FOUND, PLEASE CONTACT US")).toBeInTheDocument();
  expect(
    screen.getByText("Scan the QR code using the authorized Yala verification system.")
  ).toBeInTheDocument();
  // The superseded contact details must not linger anywhere in the preview.
  expect(screen.queryByText(/45 29 29 29/)).toBeNull();
  expect(screen.queryByText(/admin@yalataxi\.live/)).toBeNull();
});

test("printing and PDF download are blocked until a photograph exists", async () => {
  api.fetchCards.mockResolvedValue({ data: [activeCard] });
  api.fetchPhoto.mockRejectedValue({ response: { status: 404 } });
  renderPanel();

  const download = await screen.findByRole("button", { name: "Download ID Card (PDF)" });
  const print = screen.getByRole("button", { name: "Print ID Card" });

  await waitFor(() => expect(download).toBeDisabled());
  expect(print).toBeDisabled();
  expect(screen.getByText(/photograph is required/i)).toBeInTheDocument();
});

test("generating the card document never triggers a card lifecycle action", async () => {
  api.fetchCards.mockResolvedValue({ data: [activeCard] });
  renderPanel();

  fireEvent.click(await screen.findByRole("button", { name: "Download ID Card (PDF)" }));

  await waitFor(() => expect(api.fetchCardPdf).toHaveBeenCalled());
  expect(api.renewCard).not.toHaveBeenCalled();
  expect(api.replaceCard).not.toHaveBeenCalled();
  expect(api.activateCard).not.toHaveBeenCalled();
  expect(api.deactivateCard).not.toHaveBeenCalled();
  expect(api.revokeCard).not.toHaveBeenCalled();
});

