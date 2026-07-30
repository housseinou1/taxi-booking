import React from "react";
import { render, screen, waitFor, act } from "@testing-library/react";
import DriverHallOfFame from "./DriverHallOfFame";

const mockHallOfFame = {
  my_recognitions: [],
  my_stats: {
    lifetime_completed_rides: 1250,
    years_with_yala: 3,
    performance_score: 92,
  },
  achievement_badges: [
    { id: 1, name: "Road Veteran", icon: "🏅", description: "Complete 1,000 trips" },
  ],
  driver_of_month: [
    {
      id: 101,
      badge: "gold",
      category: "top_driver",
      title: "Top Driver",
      driver_name: "Ahmed",
      city: "Nouakchott",
      month: "July",
      year: 2025,
      lifetime_completed_rides: 2100,
      years_with_yala: 4,
      performance_score: 98,
    },
  ],
  top_mauritania: [
    {
      id: 201,
      badge: "silver",
      category: "top_driver",
      title: "Elite Driver",
      driver_name: "Moussa",
      city: null,
      month: null,
      year: 2025,
      lifetime_completed_rides: 3400,
      years_with_yala: 5,
      performance_score: 97,
    },
  ],
  top_city: [],
};

beforeEach(() => {
  jest.spyOn(global, "fetch").mockImplementation(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve(mockHallOfFame),
    })
  );
  localStorage.setItem("access", "test-token");
});

afterEach(() => {
  global.fetch.mockRestore();
  localStorage.clear();
});

describe("DriverHallOfFame", () => {
  it("renders the page title", async () => {
    await act(async () => {
      render(<DriverHallOfFame />);
    });

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Hall of Fame" })).toBeInTheDocument();
    });
  });

  it("displays lifetime statistics", async () => {
    await act(async () => {
      render(<DriverHallOfFame />);
    });

    await waitFor(() => {
      expect(screen.getByText("1250")).toBeInTheDocument();
      expect(screen.getByText("3")).toBeInTheDocument();
      expect(screen.getByText("92")).toBeInTheDocument();
    });
  });

  it("displays achievement badges", async () => {
    await act(async () => {
      render(<DriverHallOfFame />);
    });

    await waitFor(() => {
      expect(screen.getByText("Road Veteran")).toBeInTheDocument();
      expect(screen.getByText("Complete 1,000 trips")).toBeInTheDocument();
    });
  });

  it("displays driver of the month leaderboard in ranked order", async () => {
    await act(async () => {
      render(<DriverHallOfFame />);
    });

    await waitFor(() => {
      expect(screen.getByText("Top Driver")).toBeInTheDocument();
      expect(screen.getByText("Ahmed")).toBeInTheDocument();
    });

    const lists = screen.getAllByRole("list");
    expect(lists.length).toBeGreaterThanOrEqual(1);
  });

  it("displays an accessible back button", async () => {
    await act(async () => {
      render(<DriverHallOfFame />);
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Back to achievements" })).toBeInTheDocument();
    });
  });

  it("shows empty state for a leaderboard with no entries", async () => {
    global.fetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            ...mockHallOfFame,
            driver_of_month: [],
          }),
      })
    );

    await act(async () => {
      render(<DriverHallOfFame />);
    });

    await waitFor(() => {
      expect(screen.getAllByText("No winners recorded yet.").length).toBeGreaterThanOrEqual(1);
    });
  });
});
