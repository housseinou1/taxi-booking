import React from "react";
import { render, screen } from "@testing-library/react";
import DriverPerformanceStrip from "./DriverPerformanceStrip";

const baseStats = {
  acceptance_rate: 85,
  completion_rate: 92,
  cancellation_rate: 3,
  no_show_rate: 1,
  total_rides_no_show: 0,
  average_rating: 4.8,
  driver_score: 88,
  driver_score_label: "Great",
  streak: 5,
  rides_today: 12,
  online_hours_today: 4,
};

describe("DriverPerformanceStrip", () => {
  it("renders metric values", () => {
    render(<DriverPerformanceStrip stats={baseStats} todayEarnings={4800} />);

    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("1200")).toBeInTheDocument(); // 4800 / 4
    expect(screen.getByText(/4\.8/)).toBeInTheDocument();
    expect(screen.getByText("Great")).toBeInTheDocument();
  });

  it("renders streak banner when streak is two or more", () => {
    render(<DriverPerformanceStrip stats={baseStats} todayEarnings={0} />);

    expect(screen.getByText("5 ride streak!")).toBeInTheDocument();
  });

  it("does not render streak banner when streak is below two", () => {
    render(<DriverPerformanceStrip stats={{ ...baseStats, streak: 1 }} todayEarnings={0} />);

    expect(screen.queryByText(/ride streak/i)).not.toBeInTheDocument();
  });

  it("exposes progressbar semantics for ring chips", () => {
    render(<DriverPerformanceStrip stats={baseStats} todayEarnings={0} />);

    const progressbars = screen.getAllByRole("progressbar");
    expect(progressbars.length).toBeGreaterThanOrEqual(3);
  });

  it("falls back to rating and completion from alternative fields", () => {
    const altStats = {
      ...baseStats,
      average_rating: undefined,
      rating: 4.5,
      completion_rate: undefined,
    };
    render(<DriverPerformanceStrip stats={altStats} todayEarnings={0} />);

    expect(screen.getByText(/4\.5/)).toBeInTheDocument();
    expect(screen.getByText(/0%/)).toBeInTheDocument(); // fallback for undefined completion
  });

  it("renders plain no-show chip when rate is zero", () => {
    render(
      <DriverPerformanceStrip
        stats={{
          ...baseStats,
          no_show_rate: 0,
          total_rides_no_show: 0,
          online_hours_today: 0,
          rides_today: 12,
        }}
        todayEarnings={0}
      />
    );

    expect(screen.getByText("No-shows")).toBeInTheDocument();
    expect(screen.getByText("0", { selector: ".driver-perf-chip strong" })).toBeInTheDocument();
  });
});
