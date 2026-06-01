import React from "react";
import { render, screen, waitFor, act } from "@testing-library/react";
import DriverProfile from "./DriverProfile";
import { DriverProvider } from "./context/DriverContext";

// ─── Mock axios ─────────────────────────────────────────────────────────────
jest.mock("axios");
const axios = require("axios");

// ─── Mock localStorage ──────────────────────────────────────────────────────
beforeEach(() => {
  Storage.prototype.getItem = jest.fn(() => "test-token");
});

// ─── Helper: render with DriverProvider ─────────────────────────────────────
function renderWithProvider(ui, { initialValues = {} } = {}) {
  return render(
    <DriverProvider initialValues={initialValues}>{ui}</DriverProvider>
  );
}

// ─── Mock API responses ─────────────────────────────────────────────────────
const mockProfile = {
  full_name: "Ahmed Ould Mohamed",
  profile_picture: "https://example.com/photo.jpg",
  driver_level: "gold",
  is_available: true,
  vehicle_make: "Toyota",
  vehicle_model: "Corolla",
  vehicle_color: "White",
  plate_number: "NKC-1234",
};

const mockStats = {
  total_rides: 245,
  average_rating: 4.7,
  years_driving: 3,
  acceptance_rate: 85.5,
  completion_rate: 92.3,
  cancellation_rate: 7.7,
};

const mockEarnings = {
  lifetime: 125000.50,
  monthly: 18500.00,
  weekly: 4200.75,
};

describe("DriverProfile", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("shows loading state initially", async () => {
    axios.get.mockImplementation(() => new Promise(() => {})); // never resolves

    await act(async () => {
      renderWithProvider(<DriverProfile />);
    });

    expect(screen.getByText("Loading profile...")).toBeInTheDocument();
  });

  it("displays driver photo, name, level badge, and online status", async () => {
    axios.get.mockImplementation((url) => {
      if (url.includes("/profile/")) return Promise.resolve({ data: mockProfile });
      if (url.includes("/stats/")) return Promise.resolve({ data: mockStats });
      if (url.includes("/earnings/")) return Promise.resolve({ data: mockEarnings });
      return Promise.resolve({ data: {} });
    });

    await act(async () => {
      renderWithProvider(<DriverProfile />);
    });

    await waitFor(() => {
      expect(screen.getByText("Ahmed Ould Mohamed")).toBeInTheDocument();
    });

    // Level badge
    expect(screen.getByText("Gold")).toBeInTheDocument();
    expect(screen.getByLabelText("Driver level: Gold")).toBeInTheDocument();

    // Online status
    expect(screen.getByText("Online")).toBeInTheDocument();
    expect(screen.getByLabelText("Online")).toBeInTheDocument();

    // Photo
    const photo = screen.getByAltText("Ahmed Ould Mohamed");
    expect(photo).toBeInTheDocument();
    expect(photo).toHaveAttribute("src", "https://example.com/photo.jpg");
  });

  it("displays vehicle details (make, model, color, plate number)", async () => {
    axios.get.mockImplementation((url) => {
      if (url.includes("/profile/")) return Promise.resolve({ data: mockProfile });
      if (url.includes("/stats/")) return Promise.resolve({ data: mockStats });
      if (url.includes("/earnings/")) return Promise.resolve({ data: mockEarnings });
      return Promise.resolve({ data: {} });
    });

    await act(async () => {
      renderWithProvider(<DriverProfile />);
    });

    await waitFor(() => {
      expect(screen.getByText("Toyota")).toBeInTheDocument();
    });

    expect(screen.getByText("Corolla")).toBeInTheDocument();
    expect(screen.getByText("White")).toBeInTheDocument();
    expect(screen.getByText("NKC-1234")).toBeInTheDocument();
  });

  it("displays performance stats (total rides, rating, years, rates)", async () => {
    axios.get.mockImplementation((url) => {
      if (url.includes("/profile/")) return Promise.resolve({ data: mockProfile });
      if (url.includes("/stats/")) return Promise.resolve({ data: mockStats });
      if (url.includes("/earnings/")) return Promise.resolve({ data: mockEarnings });
      return Promise.resolve({ data: {} });
    });

    await act(async () => {
      renderWithProvider(<DriverProfile />);
    });

    await waitFor(() => {
      expect(screen.getByText("245")).toBeInTheDocument();
    });

    // Average rating
    expect(screen.getByText("4.7 ⭐")).toBeInTheDocument();

    // Years driving
    expect(screen.getByText("3")).toBeInTheDocument();

    // Rates
    expect(screen.getByText("85.5%")).toBeInTheDocument();
    expect(screen.getByText("92.3%")).toBeInTheDocument();
    expect(screen.getByText("7.7%")).toBeInTheDocument();
  });

  it("displays earnings summaries in MRU (lifetime, monthly, weekly)", async () => {
    axios.get.mockImplementation((url) => {
      if (url.includes("/profile/")) return Promise.resolve({ data: mockProfile });
      if (url.includes("/stats/")) return Promise.resolve({ data: mockStats });
      if (url.includes("/earnings/")) return Promise.resolve({ data: mockEarnings });
      return Promise.resolve({ data: {} });
    });

    await act(async () => {
      renderWithProvider(<DriverProfile />);
    });

    await waitFor(() => {
      expect(screen.getByText("Lifetime")).toBeInTheDocument();
    });

    // Earnings labels
    expect(screen.getByText("This Month")).toBeInTheDocument();
    expect(screen.getByText("This Week")).toBeInTheDocument();

    // Earnings values in MRU
    expect(screen.getByText(/125,000\.50 MRU/)).toBeInTheDocument();
    expect(screen.getByText(/18,500 MRU/)).toBeInTheDocument();
    expect(screen.getByText(/4,200\.75 MRU/)).toBeInTheDocument();
  });

  it("shows error state and retry button on API failure", async () => {
    axios.get.mockRejectedValue(new Error("Network error"));

    await act(async () => {
      renderWithProvider(<DriverProfile />);
    });

    await waitFor(() => {
      expect(screen.getByText("Failed to load profile data. Please try again.")).toBeInTheDocument();
    });

    expect(screen.getByText("Retry")).toBeInTheDocument();
  });

  it("shows offline status when driver is not available", async () => {
    const offlineProfile = { ...mockProfile, is_available: false };

    axios.get.mockImplementation((url) => {
      if (url.includes("/profile/")) return Promise.resolve({ data: offlineProfile });
      if (url.includes("/stats/")) return Promise.resolve({ data: mockStats });
      if (url.includes("/earnings/")) return Promise.resolve({ data: mockEarnings });
      return Promise.resolve({ data: {} });
    });

    await act(async () => {
      renderWithProvider(<DriverProfile />);
    });

    await waitFor(() => {
      expect(screen.getByText("Offline")).toBeInTheDocument();
    });

    expect(screen.getByLabelText("Offline")).toBeInTheDocument();
  });
});
