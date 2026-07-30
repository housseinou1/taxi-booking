import React from "react";
import { render, screen, act, waitFor } from "@testing-library/react";
import DriverAchievements from "./DriverAchievements";

// ─── Mock axios ─────────────────────────────────────────────────────────────
jest.mock("axios", () => ({
  get: jest.fn(() => Promise.resolve({ data: {} })),
}));

const axios = require("axios");

const mockAchievements = {
  achievements: [
    { id: 1, name: "First Ride", icon: "🏅", earned_at: "2025-01-10T00:00:00Z" },
  ],
};

const mockRewards = { points_balance: 1250 };

const mockDashboard = {
  current_level: "Silver",
  total_points: 1250,
  progress_percent: 45,
  points_to_next_level: 250,
  next_level: "Gold",
  today_trips: 3,
  weekly_trips: 12,
  monthly_trips: 48,
  today_earnings: 120,
  weekly_earnings: 850,
  monthly_earnings: 3600,
};

const mockChallenges = {
  challenges: [
    {
      id: 1,
      name: "Weekly Warrior",
      description: "Complete 20 trips this week",
      current_value: 12,
      target_value: 20,
      progress_percent: 60,
      reward_points: 100,
      reward_amount: 200,
      status: "active",
    },
  ],
};

const mockCampaigns = {
  active_campaigns: [
    {
      program_id: "p1",
      name: "Peak Hour Bonus",
      status: "active",
      trips_completed: 8,
      target_value: 15,
      progress_percent: 53,
      trips_remaining: 7,
      estimated_bonus: 500,
    },
  ],
  bonus_summary: { pending_bonus: 300, paid_bonus: 1200 },
};

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.setItem("access", "test-token");
});

afterEach(() => {
  localStorage.clear();
});

function setupMocks() {
  axios.get.mockImplementation((url) => {
    if (url.includes("/drivers/me/achievements/")) {
      return Promise.resolve({ data: mockAchievements });
    }
    if (url.includes("/drivers/me/rewards/dashboard/")) {
      return Promise.resolve({ data: mockDashboard });
    }
    if (url.includes("/drivers/me/rewards/")) {
      return Promise.resolve({ data: mockRewards });
    }
    if (url.includes("/drivers/me/challenges/")) {
      return Promise.resolve({ data: mockChallenges });
    }
    if (url.includes("/incentives/my-progress/")) {
      return Promise.resolve({ data: mockCampaigns });
    }
    return Promise.resolve({ data: {} });
  });
}

describe("DriverAchievements", () => {
  it("renders the page title and reward points", async () => {
    setupMocks();

    await act(async () => {
      render(<DriverAchievements />);
    });

    await waitFor(() => {
      expect(screen.getByText("Achievements & Rewards")).toBeInTheDocument();
    });

    expect(screen.getAllByText("1250").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Silver")).toBeInTheDocument();
  });

  it("renders challenge and campaign progress bars with role", async () => {
    setupMocks();

    await act(async () => {
      render(<DriverAchievements />);
    });

    await waitFor(() => {
      const progressbars = screen.getAllByRole("progressbar");
      expect(progressbars.length).toBeGreaterThanOrEqual(1);
    });

    expect(screen.getByText("Weekly Warrior")).toBeInTheDocument();
    expect(screen.getByText("Peak Hour Bonus")).toBeInTheDocument();
  });

  it("renders achievement badges", async () => {
    setupMocks();

    await act(async () => {
      render(<DriverAchievements />);
    });

    await waitFor(() => {
      expect(screen.getByText("First Ride")).toBeInTheDocument();
    });
  });

  it("renders empty state when no achievements", async () => {
    axios.get.mockImplementation((url) => {
      if (url.includes("/drivers/me/achievements/")) {
        return Promise.resolve({ data: { achievements: [] } });
      }
      return Promise.resolve({ data: {} });
    });

    await act(async () => {
      render(<DriverAchievements />);
    });

    await waitFor(() => {
      expect(screen.getByText("No achievements earned yet.")).toBeInTheDocument();
    });
  });
});
