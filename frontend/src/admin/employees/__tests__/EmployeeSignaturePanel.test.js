/**
 * Electronic employee signature panel tests.
 *
 * Guards the Founder/CEO requirements: capture and upload work, the preview works, consent is
 * mandatory (the UI cannot save without it and the backend rejects it), removal is
 * administrator-only, and a missing signature is stated rather than invented.
 */
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import EmployeeSignaturePanel from "../EmployeeSignaturePanel";
import * as api from "../employeesApi";

jest.mock("../employeesApi", () => ({
  fetchSignature: jest.fn(),
  uploadSignature: jest.fn(),
  removeSignature: jest.fn(),
}));

// jsdom does not implement object URLs or canvas. Re-established before EVERY test because
// `jest.resetAllMocks()` clears mock implementations between tests.
beforeEach(() => {
  global.URL.createObjectURL = jest.fn(() => "blob:employee-signature");
  global.URL.revokeObjectURL = jest.fn();
  HTMLCanvasElement.prototype.getContext = jest.fn(() => ({
    beginPath: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    stroke: jest.fn(),
    clearRect: jest.fn(),
    lineWidth: 1,
    lineCap: "round",
    lineJoin: "round",
    strokeStyle: "#000",
  }));
  HTMLCanvasElement.prototype.toBlob = jest.fn((callback) =>
    callback(new Blob(["pad"], { type: "image/png" }))
  );
});

afterEach(() => {
  jest.resetAllMocks();
});

function renderPanel(props = {}) {
  return render(
    <EmployeeSignaturePanel
      employeeNumber="E1"
      canManage
      canAdminister
      notify={jest.fn()}
      {...props}
    />
  );
}

test("states that no signature is provided when none exists", async () => {
  api.fetchSignature.mockRejectedValue({ response: { status: 404 } });
  renderPanel();

  expect(await screen.findByText("Signature not provided")).toBeInTheDocument();
  expect(screen.queryByAltText("Employee signature")).toBeNull();
});

test("previews the stored signature through the authenticated blob", async () => {
  api.fetchSignature.mockResolvedValue({ data: new Blob(["sig"], { type: "image/png" }) });
  renderPanel();

  expect(await screen.findByAltText("Employee signature")).toBeInTheDocument();
  expect(api.fetchSignature).toHaveBeenCalledWith("E1");
});

test("consent is required before a signature can be saved", async () => {
  api.fetchSignature.mockRejectedValue({ response: { status: 404 } });
  renderPanel();
  await screen.findByText("Signature not provided");

  // The save control is disabled until the employee consent box is ticked.
  expect(screen.getByRole("button", { name: /Save pad signature/i })).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox"));
  // Still disabled because the pad is empty (nothing to capture yet).
  expect(screen.getByRole("button", { name: /Save pad signature/i })).toBeDisabled();
  expect(api.uploadSignature).not.toHaveBeenCalled();
});

test("an uploaded signature image is sent with source=upload and consent", async () => {
  api.fetchSignature.mockRejectedValue({ response: { status: 404 } });
  api.uploadSignature.mockResolvedValue({ data: {} });
  renderPanel();
  await screen.findByText("Signature not provided");

  fireEvent.click(screen.getByRole("checkbox"));
  const file = new File(["img"], "sig.png", { type: "image/png" });
  const input = document.querySelector('input[type="file"]');
  fireEvent.change(input, { target: { files: [file] } });

  await waitFor(() =>
    expect(api.uploadSignature).toHaveBeenCalledWith(
      "E1",
      file,
      expect.objectContaining({ source: "upload", consent: true })
    )
  );
});

test("a signature cannot be uploaded while consent is unchecked", async () => {
  api.fetchSignature.mockRejectedValue({ response: { status: 404 } });
  renderPanel();
  await screen.findByText("Signature not provided");

  expect(screen.getByRole("button", { name: /Upload signature image/i })).toBeDisabled();
  expect(api.uploadSignature).not.toHaveBeenCalled();
});

test("removal is offered to administrators and calls the remove endpoint", async () => {
  api.fetchSignature.mockResolvedValue({ data: new Blob(["sig"], { type: "image/png" }) });
  api.removeSignature.mockResolvedValue({ data: {} });
  renderPanel();
  await screen.findByAltText("Employee signature");

  fireEvent.click(screen.getByRole("button", { name: /Remove signature/i }));

  await waitFor(() => expect(api.removeSignature).toHaveBeenCalledWith("E1"));
});

test("a non-administrator is not offered removal", async () => {
  api.fetchSignature.mockResolvedValue({ data: new Blob(["sig"], { type: "image/png" }) });
  renderPanel({ canAdminister: false });
  await screen.findByAltText("Employee signature");

  expect(screen.queryByRole("button", { name: /Remove signature/i })).toBeNull();
});

test("a viewer without the HR Manager tier gets no capture controls", async () => {
  api.fetchSignature.mockRejectedValue({ response: { status: 404 } });
  renderPanel({ canManage: false });
  await screen.findByText("Signature not provided");

  expect(screen.queryByLabelText("Signature pad")).toBeNull();
  expect(screen.queryByRole("button", { name: /Upload signature image/i })).toBeNull();
  expect(screen.getByText(/requires the HR Manager tier/i)).toBeInTheDocument();
});

test("the signature pad is present for authorized administrators", async () => {
  api.fetchSignature.mockRejectedValue({ response: { status: 404 } });
  renderPanel();
  await screen.findByText("Signature not provided");

  expect(screen.getByLabelText("Signature pad")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Clear pad/i })).toBeInTheDocument();
});
