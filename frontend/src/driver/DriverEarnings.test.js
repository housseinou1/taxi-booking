import React from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import DriverEarnings, { formatEarningsMRU } from "./DriverEarnings";
import { DriverProvider } from "./context/DriverContext";

jest.mock("../auth/authenticatedApi", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

jest.mock("../auth/session", () => ({
  ensureValidAccessToken: jest.fn(() => Promise.resolve("test-token")),
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
  const authenticatedApi = require("../auth/authenticatedApi").default;
  const { ensureValidAccessToken } = require("../auth/session");

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    localStorage.setItem("access", "test-token");
    ensureValidAccessToken.mockResolvedValue("test-token");

    authenticatedApi.get.mockImplementation((url) => {
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
    authenticatedApi.get.mockImplementation(() => new Promise(() => {}));

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

  it("shows error state and retry button on API failure", async () => {
    authenticatedApi.get.mockRejectedValue(new Error("Network error"));

    await act(async () => {
      render(
        <DriverProvider>
          <DriverEarnings />
        </DriverProvider>
      );
    });

    await waitFor(() => {
      expect(screen.getByText("Unable to load earnings. Please try again.")).toBeInTheDocument();
      expect(screen.getByText("Retry")).toBeInTheDocument();
    });
  });

  it("keeps the driver session when earnings cannot load", async () => {
    authenticatedApi.get.mockRejectedValue(new Error("Network error"));

    await act(async () => {
      render(
        <DriverProvider>
          <DriverEarnings />
        </DriverProvider>
      );
    });

    await waitFor(() => {
      expect(screen.getByText("Unable to load earnings. Please try again.")).toBeInTheDocument();
    });

    expect(localStorage.getItem("access")).toBe("test-token");
  });

  it("shows empty earnings gracefully", async () => {
    authenticatedApi.get.mockImplementation((url) => {
      if (url.includes("/earnings/chart/")) {
        return Promise.resolve({ data: { chart_data: [] } });
      }
      return Promise.resolve({
        data: {
          earnings: {
            today: { total_earnings: "0.00" },
            week: { total_earnings: "0.00" },
            month: { total_earnings: "0.00" },
            year: { total_earnings: "0.00" },
            lifetime: { total_earnings: "0.00" },
          },
          bonus_breakdowns: {},
        },
      });
    });

    await act(async () => {
      render(
        <DriverProvider>
          <DriverEarnings />
        </DriverProvider>
      );
    });

    await waitFor(() => {
      expect(screen.getByText("No earnings yet.")).toBeInTheDocument();
    });
  });

  it("uses suppressAuthRedirect for earnings requests", async () => {
    await act(async () => {
      render(
        <DriverProvider>
          <DriverEarnings />
        </DriverProvider>
      );
    });

    await waitFor(() => {
      expect(authenticatedApi.get).toHaveBeenCalled();
    });

    const earningsCall = authenticatedApi.get.mock.calls.find((call) =>
      call[0].includes("/drivers/me/earnings/")
    );
    expect(earningsCall?.[1]).toEqual({ suppressAuthRedirect: true });
  });

  it("adds aria-pressed to chart-period tabs", async () => {
    await act(async () => {
      render(
        <DriverProvider>
          <DriverEarnings />
        </DriverProvider>
      );
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /daily/i })).toBeInTheDocument();
    });

    const weeklyTab = screen.getByRole("button", { name: /weekly/i });
    expect(weeklyTab).toHaveAttribute("aria-pressed", "false");

    await act(async () => {
      fireEvent.click(weeklyTab);
    });

    await waitFor(() => {
      expect(weeklyTab).toHaveAttribute("aria-pressed", "true");
    });
  });
});
