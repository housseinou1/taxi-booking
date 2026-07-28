import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import axios from "axios";

import DriverProfilePage from "./DriverProfilePage";
import { navigateInApp } from "../navigation/inAppNavigation";

jest.mock("axios");
jest.mock("../navigation/inAppNavigation", () => ({
  navigateInApp: jest.fn(),
}));

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
    if (url.includes("/payments/payout-methods/")) return Promise.resolve({ data: [] });
    if (url.includes("/payments/withdrawals/")) {
      return Promise.resolve({ data: { available_balance: "0", withdrawals: [] } });
    }
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

    fireEvent.click(screen.getByLabelText("Back to driver dashboard"));

    expect(onBack).toHaveBeenCalledTimes(1);
    restoreLocation();
  });

  it("navigates to driver dashboard when close button is clicked without onBack", async () => {
    const restoreLocation = setupLocationMock();
    await renderProfile();

    fireEvent.click(screen.getByLabelText("Back to driver dashboard"));

    expect(window.location.href).toBe("/driver");
    restoreLocation();
  });

  it("navigates when edit and menu action buttons are clicked", async () => {
    const restoreLocation = setupLocationMock();
    await renderProfile();

    fireEvent.click(screen.getByRole("button", { name: /Account settings/i }));
    expect(navigateInApp).toHaveBeenCalledWith("/driver/profile/edit");

    fireEvent.click(screen.getByLabelText("Open driver settings"));
    expect(navigateInApp).toHaveBeenCalledWith("/settings");

    restoreLocation();
  });

  it("clears auth storage and navigates to login on logout", async () => {
    const restoreLocation = setupLocationMock();
    await renderProfile();

    fireEvent.click(screen.getByRole("button", { name: /Logout/i }));

    expect(Storage.prototype.removeItem).toHaveBeenCalledWith("access");
    expect(Storage.prototype.removeItem).toHaveBeenCalledWith("refresh");
    expect(Storage.prototype.removeItem).toHaveBeenCalledWith("user");
    expect(window.location.href).toBe("/login");
    restoreLocation();
  });
});

describe("DriverProfilePage account status & fallbacks", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Storage.prototype.getItem = jest.fn(() => "test-token");
    Storage.prototype.removeItem = jest.fn();
  });

  function mockEndpointsWithStatus(status) {
    axios.get.mockImplementation((url) => {
      if (url.includes("/payments/payout-methods/")) return Promise.resolve({ data: [] });
      if (url.includes("/payments/withdrawals/")) {
        return Promise.resolve({ data: { available_balance: "0", withdrawals: [] } });
      }
      if (url.includes("/drivers/me/profile/")) {
        return Promise.resolve({ data: { ...profileResponse, status } });
      }
      if (url.includes("/drivers/me/stats/")) return Promise.resolve({ data: statsResponse });
      if (url.includes("/drivers/me/documents/")) return Promise.resolve({ data: { documents: [] } });
      if (url.includes("/drivers/me/feedback/reviews/")) return Promise.resolve({ data: { results: [] } });
      if (url.includes("/drivers/me/achievements/")) return Promise.resolve({ data: { achievements: [] } });
      if (url.includes("/drivers/me/")) return Promise.resolve({ data: { ...baseResponse, status } });
      return Promise.resolve({ data: {} });
    });
  }

  async function renderWithStatus(status) {
    mockEndpointsWithStatus(status);
    await act(async () => {
      render(<DriverProfilePage />);
    });
    await waitFor(() => {
      expect(screen.getByText("Ahmed Driver")).toBeInTheDocument();
    });
  }

  it("shows the verified badge for an approved driver", async () => {
    const restoreLocation = setupLocationMock();
    await renderWithStatus("approved");
    expect(screen.getByLabelText("Verified driver")).toBeInTheDocument();
    restoreLocation();
  });

  it("does not show the verified badge for a pending driver", async () => {
    const restoreLocation = setupLocationMock();
    await renderWithStatus("pending");
    expect(screen.queryByLabelText("Verified driver")).not.toBeInTheDocument();
    expect(screen.getByText("Pending review")).toBeInTheDocument();
    restoreLocation();
  });

  it("does not show the verified badge for a rejected driver", async () => {
    const restoreLocation = setupLocationMock();
    await renderWithStatus("rejected");
    expect(screen.queryByLabelText("Verified driver")).not.toBeInTheDocument();
    expect(screen.getByText("Rejected")).toBeInTheDocument();
    restoreLocation();
  });

  it("does not show the verified badge for a suspended driver", async () => {
    const restoreLocation = setupLocationMock();
    await renderWithStatus("suspended");
    expect(screen.queryByLabelText("Verified driver")).not.toBeInTheDocument();
    expect(screen.getByText("Suspended")).toBeInTheDocument();
    restoreLocation();
  });

  it("falls back to initials when the driver has no photo", async () => {
    const restoreLocation = setupLocationMock();
    await renderWithStatus("approved");
    // "Ahmed Driver" -> "AD" initials fallback (no photo in fixture)
    expect(screen.getByText("AD")).toBeInTheDocument();
    restoreLocation();
  });

  it("shows the DriverAppStates loading state while the profile is fetching", () => {
    const restoreLocation = setupLocationMock();
    axios.get.mockImplementation(() => new Promise(() => {})); // never resolves
    render(<DriverProfilePage />);
    expect(screen.getByText("Loading your driver profile")).toBeInTheDocument();
    restoreLocation();
  });

  it("shows the DriverAppStates error state when the profile fetch fails", async () => {
    const restoreLocation = setupLocationMock();
    axios.get.mockRejectedValue({ response: { status: 500, data: {} } });
    await act(async () => {
      render(<DriverProfilePage />);
    });
    await waitFor(() => {
      expect(screen.getByText("Profile unavailable")).toBeInTheDocument();
    });
    restoreLocation();
  });
});
