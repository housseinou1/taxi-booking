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

  it("shows loading state while loading", () => {
    render(<DriverDashboardContent {...baseProps} loading />);
    expect(screen.getByText("Loading dashboard")).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows error retry state when error is provided", () => {
    const onRetry = jest.fn();
    render(<DriverDashboardContent {...baseProps} error="Network error" onRetry={onRetry} />);
    expect(screen.getByText("Unable to load dashboard")).toBeInTheDocument();
    expect(screen.getByText("Network error")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("renders compact top bar with driver name and actions", () => {
    render(<DriverDashboardContent {...baseProps} />);
    expect(screen.getByText("Amadou Diallo")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open notifications" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open menu" })).toBeInTheDocument();
  });

  it("displays offline status and a go-online control", () => {
    render(<DriverDashboardContent {...baseProps} isOnline={false} />);
    expect(screen.getByText(/You are offline/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /go online/i })).toBeInTheDocument();
  });

  it("displays online status and a go-offline control", () => {
    render(<DriverDashboardContent {...baseProps} isOnline />);
    expect(screen.getByText(/You are online/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /go offline/i })).toBeInTheDocument();
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

  it("shows today's trips and earnings in the collapsed bottom sheet", () => {
    render(<DriverDashboardContent {...baseProps} />);
    expect(screen.getAllByText("Trips").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Earnings").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("4").length).toBeGreaterThanOrEqual(1);
  });

  it("expands the bottom sheet to reveal performance metrics", () => {
    const { container } = render(<DriverDashboardContent {...baseProps} />);
    const grip = screen.getByRole("button", { name: /expand dashboard/i });
    const sheet = container.querySelector(".driver-dashboard-content__bottom-sheet");
    fireEvent.click(grip);
    expect(sheet.classList.contains("is-expanded")).toBe(true);
    expect(screen.getByText("Today's performance")).toBeInTheDocument();
    expect(screen.getByText("Acceptance")).toBeInTheDocument();
    expect(screen.getByText("Completion")).toBeInTheDocument();
    expect(screen.getByText("Quick actions")).toBeInTheDocument();
  });

  it("collapses the bottom sheet after expanding", () => {
    const { container } = render(<DriverDashboardContent {...baseProps} />);
    const grip = screen.getByRole("button", { name: /expand dashboard/i });
    const sheet = container.querySelector(".driver-dashboard-content__bottom-sheet");
    fireEvent.click(grip);
    expect(sheet.classList.contains("is-expanded")).toBe(true);
    fireEvent.click(grip);
    expect(sheet.classList.contains("is-collapsed")).toBe(true);
  });

  it("renders quick actions with valid driver routes when expanded", () => {
    render(<DriverDashboardContent {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /expand dashboard/i }));
    const actionLabels = ["Open earnings", "Open ride history", "Open documents", "Open support"];
    actionLabels.forEach((label) => {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    });
  });

  it("renders recent trips when data is available in expanded view", () => {
    render(<DriverDashboardContent {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /expand dashboard/i }));
    expect(screen.getByText("Teyarett")).toBeInTheDocument();
    expect(screen.getByText("Sebkha")).toBeInTheDocument();
    expect(screen.getByText("View all trips")).toBeInTheDocument();
  });

  it("omits the recent trips section when no completed rides", () => {
    render(<DriverDashboardContent {...baseProps} recentRides={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /expand dashboard/i }));
    expect(screen.queryByText("Recent trips")).not.toBeInTheDocument();
  });
});
