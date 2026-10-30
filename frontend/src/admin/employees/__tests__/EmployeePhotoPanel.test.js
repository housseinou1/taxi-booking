import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import EmployeePhotoPanel from "../EmployeePhotoPanel";
import * as api from "../employeesApi";

jest.mock("../employeesApi", () => {
  const actual = jest.requireActual("../employeesApi");
  return { ...actual, fetchPhoto: jest.fn(), uploadPhoto: jest.fn() };
});

let createdUrls = 0;

beforeEach(() => {
  jest.clearAllMocks();
  createdUrls = 0;
  // Re-establish the implementation each time (clearAllMocks wipes call data;
  // we reassign so createObjectURL always returns a usable URL string).
  global.URL.createObjectURL = jest.fn(() => `blob:mock-${++createdUrls}`);
  global.URL.revokeObjectURL = jest.fn();
});

// Camera tests spy on document.createElement (canvas capture); restore so the
// spy's reset implementation can never leak into the next test (resetMocks
// clears implementations but does not restore spies).
afterEach(() => {
  jest.restoreAllMocks();
});

function makeBlob() {
  return new Blob(["x"], { type: "image/jpeg" });
}

test("renders placeholder when no photo exists (404)", async () => {
  api.fetchPhoto.mockRejectedValue({ response: { status: 404 } });
  render(<EmployeePhotoPanel employeeNumber="E1" notify={jest.fn()} />);
  await waitFor(() => expect(api.fetchPhoto).toHaveBeenCalled());
  expect(screen.getByLabelText(/no photograph/i)).toBeInTheDocument();
});

test("successful upload calls uploadPhoto, refetches, and revokes the old URL", async () => {
  // First load succeeds (creates one object URL), then upload, then refetch.
  api.fetchPhoto.mockResolvedValue({ data: makeBlob() });
  api.uploadPhoto.mockResolvedValue({ data: { detail: "ok", has_photo: true } });
  const notify = jest.fn();
  render(<EmployeePhotoPanel employeeNumber="E1" notify={notify} />);

  await waitFor(() => expect(global.URL.createObjectURL).toHaveBeenCalled());

  const file = new File(["img"], "p.jpg", { type: "image/jpeg" });
  const input = document.querySelector("#emp-photo-input");
  fireEvent.change(input, { target: { files: [file] } });

  await waitFor(() => expect(api.uploadPhoto).toHaveBeenCalledWith("E1", file));
  // Refetch happens after upload (2 total fetches, 2 object URLs created).
  await waitFor(() => expect(api.fetchPhoto).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(global.URL.createObjectURL).toHaveBeenCalledTimes(2));
  // Old object URL revoked when the new one loads (and/or on refetch).
  await waitFor(() => expect(global.URL.revokeObjectURL).toHaveBeenCalled());
  await waitFor(() =>
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ tone: "success" }))
  );
});

test("400 upload error surfaces the backend detail", async () => {
  api.fetchPhoto.mockRejectedValue({ response: { status: 404 } });
  api.uploadPhoto.mockRejectedValue({
    response: { status: 400, data: { detail: "File too large" } },
  });
  render(<EmployeePhotoPanel employeeNumber="E1" notify={jest.fn()} />);
  await waitFor(() => expect(api.fetchPhoto).toHaveBeenCalled());

  const file = new File(["img"], "p.jpg", { type: "image/jpeg" });
  fireEvent.change(document.querySelector("#emp-photo-input"), { target: { files: [file] } });

  expect(await screen.findByText(/file too large/i)).toBeInTheDocument();
});

test("403 upload error shows a not-authorized message", async () => {
  api.fetchPhoto.mockRejectedValue({ response: { status: 404 } });
  api.uploadPhoto.mockRejectedValue({ response: { status: 403, data: {} } });
  const notify = jest.fn();
  render(<EmployeePhotoPanel employeeNumber="E1" notify={notify} />);
  await waitFor(() => expect(api.fetchPhoto).toHaveBeenCalled());

  const file = new File(["img"], "p.jpg", { type: "image/jpeg" });
  fireEvent.change(document.querySelector("#emp-photo-input"), { target: { files: [file] } });

  await waitFor(() =>
    expect(notify).toHaveBeenCalledWith("danger", expect.stringMatching(/not authorized/i))
  );
});

// ── Phase 6: camera capture (browser APIs only) ──────────────────────────────

function mockCamera({ reject = false } = {}) {
  const track = { stop: jest.fn() };
  const stream = { getTracks: () => [track] };
  Object.defineProperty(global.navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: reject
        ? jest.fn(() => Promise.reject(new Error("denied")))
        : jest.fn(() => Promise.resolve(stream)),
    },
  });
  return { track, stream };
}

test("captures a photo from the camera and uploads it as a JPEG", async () => {
  const { track } = mockCamera();
  api.fetchPhoto.mockRejectedValue({ response: { status: 404 } });
  api.uploadPhoto.mockResolvedValue({ data: { detail: "ok" } });

  // jsdom has no canvas implementation: stub the capture surface only.
  const originalCreateElement = document.createElement.bind(document);
  jest.spyOn(document, "createElement").mockImplementation((tag) => {
    const element = originalCreateElement(tag);
    if (tag === "canvas") {
      element.getContext = () => ({ drawImage: jest.fn() });
      element.toBlob = (callback) => callback(new Blob(["jpg"], { type: "image/jpeg" }));
    }
    return element;
  });

  render(<EmployeePhotoPanel employeeNumber="E1" notify={jest.fn()} />);
  await waitFor(() => expect(api.fetchPhoto).toHaveBeenCalled());

  fireEvent.click(screen.getByRole("button", { name: /take photo/i }));
  await waitFor(() => expect(global.navigator.mediaDevices.getUserMedia).toHaveBeenCalled());

  fireEvent.click(await screen.findByRole("button", { name: /capture photo/i }));

  await waitFor(() => expect(api.uploadPhoto).toHaveBeenCalled());
  const [, file] = api.uploadPhoto.mock.calls[0];
  expect(file.type).toBe("image/jpeg");
  // The hardware is released after capture.
  await waitFor(() => expect(track.stop).toHaveBeenCalled());
  // Preview closes back to the upload/capture controls.
  expect(await screen.findByRole("button", { name: /take photo/i })).toBeInTheDocument();
});

test("camera permission failure degrades to file upload with a clear message", async () => {
  mockCamera({ reject: true });
  api.fetchPhoto.mockRejectedValue({ response: { status: 404 } });

  render(<EmployeePhotoPanel employeeNumber="E1" notify={jest.fn()} />);
  await waitFor(() => expect(api.fetchPhoto).toHaveBeenCalled());

  fireEvent.click(screen.getByRole("button", { name: /take photo/i }));

  expect(
    await screen.findByText(/Camera unavailable or permission denied/i)
  ).toBeInTheDocument();
  expect(api.uploadPhoto).not.toHaveBeenCalled();
  expect(screen.getByText(/Upload photograph/i)).toBeInTheDocument();
});

test("unsupported browsers fall back to file upload", async () => {
  Object.defineProperty(global.navigator, "mediaDevices", {
    configurable: true,
    value: undefined,
  });
  api.fetchPhoto.mockRejectedValue({ response: { status: 404 } });

  render(<EmployeePhotoPanel employeeNumber="E1" notify={jest.fn()} />);
  await waitFor(() => expect(api.fetchPhoto).toHaveBeenCalled());

  fireEvent.click(screen.getByRole("button", { name: /take photo/i }));

  expect(
    await screen.findByText(/does not support camera capture/i)
  ).toBeInTheDocument();
});

