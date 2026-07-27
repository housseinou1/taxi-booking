import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import DriverDashboardContent from "./DriverDashboardContent";

jest.mock("../../navigation/inAppNavigation", () => ({
  navigateInApp: jest.fn(),
}));

const baseProps = {
  driverProfile: {
    user: { first_name: "Amadou", last_name: "Diallo" },
    driver_level: "silver",
    is_approved: true,
    driver_photo: null,
  },
  isOnline: false,
  toggleLoading: false,
  toggleError: "",
  documentsBlockOnline: false,
  documentsAlert: false,
  documentsAlertLevel: null,
  todayTripsCount: 4,
  todayEarnings: 1250.5,
  acceptanceRate: 87,
  missedRides: 1,
  driverPerformance: { average_rating: 4.7, completion_rate: 92, online_hours_today: 2.5 },
  earningsByPeriod: { today: 1250.5, week: 8900 },
  recentRides: [
    {
      id: "r1",
      status: "completed",
      destination: "Teyarett",
      fare: 320,
      completed_at: "2026-07-26T14:30:00Z",
    },
    {
      id: "r2",
      status: "completed",
      destination: "Sebkha",
      fare: 150,
      completed_at: "2026-07-25T09:15:00Z",
    },
  ],
  onToggleAvailability: jest.fn(),
  onOpenMenu: jest.fn(),
};

describe("DriverDashboardContent", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("shows loading skeleton while loading", () => {
    render(<DriverDashboardContent {...baseProps} loading />);
    expect(screen.getByText("Loading")).toBeInTheDocument();
  });

  it("shows error retry state when error is provided", () => {
    const onRetry = jest.fn();
    render(<DriverDashboardContent {...baseProps} error="Network error" onRetry={onRetry} />);
    expect(screen.getByText("Unable to load dashboard")).toBeInTheDocument();
    expect(screen.getByText("Network error")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("renders greeting, driver name and verification badge", () => {
    render(<DriverDashboardContent {...baseProps} />);
    expect(screen.getByText(/Amadou Diallo/)).toBeInTheDocument();
    expect(screen.getByText(/Verified/)).toBeInTheDocument();
  });

  it("displays offline status and a large go-online control", () => {
    render(<DriverDashboardContent {...baseProps} isOnline={false} />);
    expect(screen.getByText(/You are offline/)).toBeInTheDocument();
    expect(screen.getByText("Go Online")).toBeInTheDocument();
  });

  it("displays online status and a go-offline control", () => {
    render(<DriverDashboardContent {...baseProps} isOnline />);
    expect(screen.getByText(/You are online/)).toBeInTheDocument();
    expect(screen.getByText("Go Offline")).toBeInTheDocument();
  });

  it("calls onToggleAvailability when the main action is clicked", () => {
    render(<DriverDashboardContent {...baseProps} isOnline={false} />);
    fireEvent.click(screen.getByRole("button", { name: /go online/i }));
    expect(baseProps.onToggleAvailability).toHaveBeenCalled();
  });

  it("shows a document alert with a documents action", () => {
    render(
      <DriverDashboardContent
        {...baseProps}
        documentsAlert
        documentsAlertLevel="danger"
      />
    );
    expect(screen.getByText(/expired or rejected/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /review documents/i })).toBeInTheDocument();
  });

  it("renders performance metrics and earnings cards", () => {
    render(<DriverDashboardContent {...baseProps} />);
    expect(screen.getByText("Trips")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getAllByText(/1,250\.50 MRU/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Rating/)).toBeInTheDocument();
    expect(screen.getByText(/4\.7/)).toBeInTheDocument();
    expect(screen.getByText(/Weekly earnings/)).toBeInTheDocument();
  });

  it("renders quick actions with valid driver routes", () => {
    render(<DriverDashboardContent {...baseProps} />);
    const actionLabels = ["Open earnings", "Open ride history", "Open documents", "Open support"];
    actionLabels.forEach((label) => {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    });
  });

  it("renders recent trips when data is available", () => {
    render(<DriverDashboardContent {...baseProps} />);
    expect(screen.getByText("Teyarett")).toBeInTheDocument();
    expect(screen.getByText("Sebkha")).toBeInTheDocument();
    expect(screen.getByText("View all trips")).toBeInTheDocument();
  });

  it("omits the recent trips section when no completed rides", () => {
    render(<DriverDashboardContent {...baseProps} recentRides={[]} />);
    expect(screen.queryByText("Recent trips")).not.toBeInTheDocument();
  });
});
