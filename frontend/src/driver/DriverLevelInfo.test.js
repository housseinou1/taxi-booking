import React from "react";
import { render, screen, act, waitFor } from "@testing-library/react";
import { DriverProvider } from "./context/DriverContext";

// ─── Mock axios ─────────────────────────────────────────────────────────────
jest.mock("axios", () => ({
  get: jest.fn(() => Promise.resolve({ data: {} })),
  post: jest.fn(() => Promise.resolve({ data: {} })),
}));

describe("DriverLevelInfo", () => {
  const axios = require("axios");

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.setItem("access", "test-token");

    axios.get.mockImplementation((url) => {
      if (url.includes("/drivers/me/level/requirements")) {
        return Promise.resolve({
          data: {
            levels: {
              silver: { rides: 50, rating: 4.5, acceptance: 70, completion: 85 },
              gold: { rides: 200, rating: 4.7, acceptance: 80, completion: 90 },
              platinum: { rides: 350, rating: 4.8, acceptance: 85, completion: 93 },
              elite: { rides: 500, rating: 4.9, acceptance: 90, completion: 95 },
            },
          },
        });
      }
      if (url.includes("/drivers/me/level")) {
        return Promise.resolve({
          data: {
            level: "silver",
            progress: 45,
            total_rides_completed: 120,
            average_rating: 4.6,
            acceptance_rate: 78,
            completion_rate: 88,
            below_metrics: [],
            days_below_threshold: 0,
            demotion_warning_sent: false,
          },
        });
      }
      return Promise.resolve({ data: {} });
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("renders the page title", async () => {
    const DriverLevelInfo = require("./DriverLevelInfo").default;

    await act(async () => {
      render(
        <DriverProvider>
          <DriverLevelInfo />
        </DriverProvider>
      );
    });

    await waitFor(() => {
      expect(screen.getByText("Driver Level")).toBeInTheDocument();
    });
  });

  it("displays the current level badge", async () => {
    const DriverLevelInfo = require("./DriverLevelInfo").default;

    await act(async () => {
      render(
        <DriverProvider>
          <DriverLevelInfo />
        </DriverProvider>
      );
    });

    await waitFor(() => {
      const badges = screen.getAllByLabelText("Driver level: Silver");
      // One in the current level card header, one in the levels list
      expect(badges.length).toBeGreaterThanOrEqual(1);
      expect(badges[0]).toBeInTheDocument();
    });
  });

  it("displays progress bar toward next level", async () => {
    const DriverLevelInfo = require("./DriverLevelInfo").default;

    await act(async () => {
      render(
        <DriverProvider>
          <DriverLevelInfo />
        </DriverProvider>
      );
    });

    await waitFor(() => {
      expect(screen.getByRole("progressbar")).toBeInTheDocument();
      expect(screen.getByText("45%")).toBeInTheDocument();
    });
  });

  it("displays all five level cards with benefits", async () => {
    const DriverLevelInfo = require("./DriverLevelInfo").default;

    await act(async () => {
      render(
        <DriverProvider>
          <DriverLevelInfo />
        </DriverProvider>
      );
    });

    await waitFor(() => {
      expect(screen.getByText("Levels & Benefits")).toBeInTheDocument();
    });

    // All levels should be displayed
    const levelBadges = screen.getAllByRole("status");
    // One in the current level card + 5 in the level cards list = 6
    expect(levelBadges.length).toBe(6);
  });

  it("shows requirements for non-bronze levels", async () => {
    const DriverLevelInfo = require("./DriverLevelInfo").default;

    await act(async () => {
      render(
        <DriverProvider>
          <DriverLevelInfo />
        </DriverProvider>
      );
    });

    await waitFor(() => {
      // Silver requirements
      expect(screen.getByText("50+")).toBeInTheDocument();
      // Gold requirements
      expect(screen.getByText("200+")).toBeInTheDocument();
      // Platinum requirements
      expect(screen.getByText("350+")).toBeInTheDocument();
      // Elite requirements
      expect(screen.getByText("500+")).toBeInTheDocument();
    });
  });

  it("marks the current level with 'Current' tag", async () => {
    const DriverLevelInfo = require("./DriverLevelInfo").default;

    await act(async () => {
      render(
        <DriverProvider>
          <DriverLevelInfo />
        </DriverProvider>
      );
    });

    await waitFor(() => {
      expect(screen.getByText("Current")).toBeInTheDocument();
    });
  });

  it("shows demotion warning when metrics are below threshold", async () => {
    axios.get.mockImplementation((url) => {
      if (url.includes("/drivers/me/level/requirements")) {
        return Promise.resolve({ data: { levels: {} } });
      }
      if (url.includes("/drivers/me/level")) {
        return Promise.resolve({
          data: {
            level: "gold",
            progress: 60,
            total_rides_completed: 220,
            average_rating: 4.5,
            acceptance_rate: 72,
            completion_rate: 87,
            below_metrics: ["acceptance_rate", "completion_rate"],
            days_below_threshold: 8,
            demotion_warning_sent: true,
          },
        });
      }
      return Promise.resolve({ data: {} });
    });

    const DriverLevelInfo = require("./DriverLevelInfo").default;

    await act(async () => {
      render(
        <DriverProvider>
          <DriverLevelInfo />
        </DriverProvider>
      );
    });

    await waitFor(() => {
      expect(screen.getByText("Demotion Warning")).toBeInTheDocument();
      expect(screen.getByText("acceptance_rate")).toBeInTheDocument();
      expect(screen.getByText("completion_rate")).toBeInTheDocument();
    });
  });

  it("shows 100% progress for Elite level", async () => {
    axios.get.mockImplementation((url) => {
      if (url.includes("/drivers/me/level/requirements")) {
        return Promise.resolve({ data: { levels: {} } });
      }
      if (url.includes("/drivers/me/level")) {
        return Promise.resolve({
          data: {
            level: "elite",
            progress: 100,
            total_rides_completed: 600,
            average_rating: 4.95,
            acceptance_rate: 92,
            completion_rate: 96,
            below_metrics: [],
            days_below_threshold: 0,
            demotion_warning_sent: false,
          },
        });
      }
      return Promise.resolve({ data: {} });
    });

    const DriverLevelInfo = require("./DriverLevelInfo").default;

    await act(async () => {
      render(
        <DriverProvider>
          <DriverLevelInfo />
        </DriverProvider>
      );
    });

    await waitFor(() => {
      expect(screen.getByText("100%")).toBeInTheDocument();
      expect(screen.getByText("Max Level Reached")).toBeInTheDocument();
    });
  });

  it("shows loading state initially", () => {
    // Make the API call hang
    axios.get.mockImplementation(() => new Promise(() => {}));

    const DriverLevelInfo = require("./DriverLevelInfo").default;

    render(
      <DriverProvider>
        <DriverLevelInfo />
      </DriverProvider>
    );

    expect(screen.getByText("Loading level info...")).toBeInTheDocument();
  });

  it("shows error state on API failure", async () => {
    axios.get.mockRejectedValue(new Error("Network error"));

    const DriverLevelInfo = require("./DriverLevelInfo").default;

    await act(async () => {
      render(
        <DriverProvider>
          <DriverLevelInfo />
        </DriverProvider>
      );
    });

    await waitFor(() => {
      expect(
        screen.getByText("Failed to load level information. Please try again.")
      ).toBeInTheDocument();
      expect(screen.getByText("Retry")).toBeInTheDocument();
    });
  });
});
