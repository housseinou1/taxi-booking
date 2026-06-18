import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import axios from "axios";

import DriverProfilePage from "./DriverProfilePage";

jest.mock("axios");

const baseResponse = {
  first_name: "Ahmed",
  last_name: "Driver",
  email: "ahmed@example.com",
  is_available: true,
  driver_level: "gold",
};

const profileResponse = {
  first_name: "Ahmed",
  last_name: "Driver",
  vehicle: {
    make: "Toyota",
    model: "Corolla",
    plate_number: "NKC-1234",
  },
};

const statsResponse = {
  total_rides_completed: 120,
  average_rating: 4.8,
  years_driving: 4,
};

function setupLocationMock() {
  const originalLocation = window.location;
  delete window.location;
  window.location = { ...originalLocation, href: "http://localhost/driver/profile" };
  return () => {
    window.location = originalLocation;
  };
}

function mockProfileEndpoints() {
  axios.get.mockImplementation((url) => {
    if (url.includes("/drivers/me/profile/")) return Promise.resolve({ data: profileResponse });
    if (url.includes("/drivers/me/stats/")) return Promise.resolve({ data: statsResponse });
    if (url.includes("/drivers/me/documents/")) return Promise.resolve({ data: { documents: [] } });
    if (url.includes("/drivers/me/feedback/reviews/")) return Promise.resolve({ data: { results: [] } });
    if (url.includes("/drivers/me/achievements/")) return Promise.resolve({ data: { achievements: [] } });
    if (url.includes("/drivers/me/")) return Promise.resolve({ data: baseResponse });
    return Promise.resolve({ data: {} });
  });
}

async function renderProfile(props = {}) {
  await act(async () => {
    render(<DriverProfilePage {...props} />);
  });
  await waitFor(() => {
    expect(screen.getByText("Ahmed Driver")).toBeInTheDocument();
  });
}

describe("DriverProfilePage button behavior", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Storage.prototype.getItem = jest.fn(() => "test-token");
    Storage.prototype.removeItem = jest.fn();
    mockProfileEndpoints();
  });

  it("uses onBack callback when close button is clicked", async () => {
    const restoreLocation = setupLocationMock();
    const onBack = jest.fn();
    await renderProfile({ onBack });

    fireEvent.click(screen.getByLabelText("Close profile"));

    expect(onBack).toHaveBeenCalledTimes(1);
    restoreLocation();
  });

  it("navigates to driver dashboard when close button is clicked without onBack", async () => {
    const restoreLocation = setupLocationMock();
    await renderProfile();

    fireEvent.click(screen.getByLabelText("Close profile"));

    expect(window.location.href).toBe("/driver");
    restoreLocation();
  });

  it("navigates when edit and menu action buttons are clicked", async () => {
    const restoreLocation = setupLocationMock();
    await renderProfile();

    fireEvent.click(screen.getByRole("button", { name: "Edit driver profile" }));
    expect(window.location.href).toBe("/driver/profile/edit");

    fireEvent.click(screen.getByRole("button", { name: /Settings/i }));
    expect(window.location.href).toBe("/settings");

    restoreLocation();
  });

  it("clears auth storage and navigates to login on logout", async () => {
    const restoreLocation = setupLocationMock();
    await renderProfile();

    fireEvent.click(screen.getByRole("button", { name: /Log out/i }));

    expect(Storage.prototype.removeItem).toHaveBeenCalledWith("access");
    expect(Storage.prototype.removeItem).toHaveBeenCalledWith("refresh");
    expect(Storage.prototype.removeItem).toHaveBeenCalledWith("user");
    expect(window.location.href).toBe("/login");
    restoreLocation();
  });
});
