import React from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import DriverEarnings, { formatEarningsMRU } from "./DriverEarnings";
import { DriverProvider } from "./context/DriverContext";

// ─── Mock dependencies ──────────────────────────────────────────────────────

jest.mock("axios", () => ({
  get: jest.fn(() => Promise.resolve({ data: {} })),
}));

// ─── Unit Tests for formatEarningsMRU ───────────────────────────────────────

describe("formatEarningsMRU", () => {
  it("formats zero with 2 decimal places", () => {
    expect(formatEarningsMRU(0)).toBe("0.00 MRU");
  });

  it("formats whole numbers with 2 decimal places", () => {
    expect(formatEarningsMRU(100)).toBe("100.00 MRU");
  });

  it("formats decimal values with 2 decimal places", () => {
    expect(formatEarningsMRU(1234.5)).toBe("1,234.50 MRU");
  });

  it("formats values with more than 2 decimals rounded to 2", () => {
    expect(formatEarningsMRU(99.999)).toBe("100.00 MRU");
  });

  it("handles null/undefined as zero", () => {
    expect(formatEarningsMRU(null)).toBe("0.00 MRU");
    expect(formatEarningsMRU(undefined)).toBe("0.00 MRU");
  });

  it("formats large values with thousands separator", () => {
    expect(formatEarningsMRU(50000)).toBe("50,000.00 MRU");
  });

  it("always includes MRU currency suffix", () => {
    expect(formatEarningsMRU(1)).toContain("MRU");
  });
});

// ─── Component Rendering Tests ──────────────────────────────────────────────

describe("DriverEarnings", () => {
  const axios = require("axios");

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    localStorage.setItem("access", "test-token");

    axios.get.mockImplementation((url) => {
      if (url.includes("/earnings/chart/")) {
        return Promise.resolve({
          data: {
            data: [
              { value: 100, label: "Mon" },
              { value: 200, label: "Tue" },
              { value: 0, label: "Wed" },
              { value: 150, label: "Thu" },
              { value: 300, label: "Fri" },
              { value: 0, label: "Sat" },
              { value: 50, label: "Sun" },
            ],
          },
        });
      }
      if (url.includes("/earnings/")) {
        return Promise.resolve({
          data: {
            today_earnings: 1500.50,
            week_earnings: 8750.00,
            month_earnings: 35000.75,
            total_earnings: 250000.00,
            breakdown: {
              today: { bonus: 200, incentive: 100, referral: 50 },
              week: { bonus: 1000, incentive: 500, referral: 250 },
              month: { bonus: 4000, incentive: 2000, referral: 1000 },
              lifetime: { bonus: 30000, incentive: 15000, referral: 7500 },
            },
          },
        });
      }
      return Promise.resolve({ data: {} });
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    localStorage.clear();
  });

  it("renders loading state initially", async () => {
    // Make the API call hang
    axios.get.mockImplementation(() => new Promise(() => {}));

    await act(async () => {
      render(
        <DriverProvider>
          <DriverEarnings />
        </DriverProvider>
      );
    });

    expect(screen.getByText("Loading earnings...")).toBeInTheDocument();
  });

  it("renders earnings page with title after loading", async () => {
    await act(async () => {
      render(
        <DriverProvider>
          <DriverEarnings />
        </DriverProvider>
      );
    });

    await waitFor(() => {
      expect(screen.getByText("Earnings")).toBeInTheDocument();
    });
  });

  it("displays period tabs: Today, Week, Month, Lifetime", async () => {
    await act(async () => {
      render(
        <DriverProvider>
          <DriverEarnings />
        </DriverProvider>
      );
    });

    await waitFor(() => {
      expect(screen.getByText("Today")).toBeInTheDocument();
      expect(screen.getByText("Week")).toBeInTheDocument();
      expect(screen.getByText("Month")).toBeInTheDocument();
      expect(screen.getByText("Lifetime")).toBeInTheDocument();
    });
  });

  it("displays today's earnings by default", async () => {
    await act(async () => {
      render(
        <DriverProvider>
          <DriverEarnings />
        </DriverProvider>
      );
    });

    await waitFor(() => {
      expect(screen.getByText("Today's Earnings")).toBeInTheDocument();
      expect(screen.getByText("1,500.50 MRU")).toBeInTheDocument();
    });
  });

  it("switches to week earnings when Week tab is clicked", async () => {
    await act(async () => {
      render(
        <DriverProvider>
          <DriverEarnings />
        </DriverProvider>
      );
    });

    await waitFor(() => {
      expect(screen.getByText("Today")).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Week"));
    });

    expect(screen.getByText("This Week")).toBeInTheDocument();
    expect(screen.getByText("8,750.00 MRU")).toBeInTheDocument();
  });

  it("displays bonus, incentive, and referral line items", async () => {
    await act(async () => {
      render(
        <DriverProvider>
          <DriverEarnings />
        </DriverProvider>
      );
    });

    await waitFor(() => {
      expect(screen.getByText("Bonus")).toBeInTheDocument();
      expect(screen.getByText("Incentive")).toBeInTheDocument();
      expect(screen.getByText("Referral")).toBeInTheDocument();
    });
  });

  it("displays chart period tabs: Daily, Weekly, Monthly", async () => {
    await act(async () => {
      render(
        <DriverProvider>
          <DriverEarnings />
        </DriverProvider>
      );
    });

    await waitFor(() => {
      expect(screen.getByText("Daily")).toBeInTheDocument();
      expect(screen.getByText("Weekly")).toBeInTheDocument();
      expect(screen.getByText("Monthly")).toBeInTheDocument();
    });
  });

  it("renders bar chart with aria-label", async () => {
    await act(async () => {
      render(
        <DriverProvider>
          <DriverEarnings />
        </DriverProvider>
      );
    });

    await waitFor(() => {
      expect(screen.getByLabelText("daily earnings bar chart")).toBeInTheDocument();
    });
  });

  it("shows error state and retry button on API failure", async () => {
    axios.get.mockRejectedValue(new Error("Network error"));

    await act(async () => {
      render(
        <DriverProvider>
          <DriverEarnings />
        </DriverProvider>
      );
    });

    await waitFor(() => {
      expect(screen.getByText("Failed to load earnings. Please try again.")).toBeInTheDocument();
      expect(screen.getByText("Retry")).toBeInTheDocument();
    });
  });

  it("fetches chart data when chart period changes", async () => {
    await act(async () => {
      render(
        <DriverProvider>
          <DriverEarnings />
        </DriverProvider>
      );
    });

    await waitFor(() => {
      expect(screen.getByText("Monthly")).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Monthly"));
    });

    // Verify the chart API was called with monthly period
    const chartCalls = axios.get.mock.calls.filter((call) =>
      call[0].includes("/earnings/chart/")
    );
    const lastChartCall = chartCalls[chartCalls.length - 1];
    expect(lastChartCall[0]).toContain("period=monthly");
  });

  it("displays back to dashboard button", async () => {
    await act(async () => {
      render(
        <DriverProvider>
          <DriverEarnings />
        </DriverProvider>
      );
    });

    await waitFor(() => {
      expect(screen.getByText("← Back to Dashboard")).toBeInTheDocument();
    });
  });
});
