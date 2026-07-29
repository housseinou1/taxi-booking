import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import DriverNotificationsPage from "./DriverNotificationsPage";
import authenticatedApi from "../auth/authenticatedApi";
import { navigateInApp } from "../navigation/inAppNavigation";

jest.mock("../auth/authenticatedApi", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));

jest.mock("../navigation/inAppNavigation", () => ({
  navigateInApp: jest.fn(),
}));

beforeEach(() => {
  authenticatedApi.get.mockClear();
  authenticatedApi.post.mockClear();
  navigateInApp.mockClear();
});

afterEach(() => {
  authenticatedApi.get.mockClear();
  authenticatedApi.post.mockClear();
  navigateInApp.mockClear();
});

function baseResponse() {
  return {
    items: [
      {
        id: 1,
        title: "New ride request",
        body: "Pickup nearby",
        created_at: "2026-07-28T08:00:00Z",
        type: "ride_request",
        is_read: false,
      },
      {
        id: 2,
        title: "Payment completed",
        body: "100 MRU",
        created_at: "2026-07-28T07:00:00Z",
        type: "payment_completed",
        is_read: true,
      },
    ],
    unread_count: 1,
  };
}

function mockGet(response) {
  authenticatedApi.get.mockResolvedValue({ data: response });
}

describe("DriverNotificationsPage", () => {
  it("shows loading then renders the notification list", async () => {
    mockGet(baseResponse());
    render(<DriverNotificationsPage />);

    await waitFor(() =>
      expect(screen.getByText("New ride request")).toBeInTheDocument()
    );
    expect(screen.getByText("Payment completed")).toBeInTheDocument();
    expect(screen.getByText("1 unread")).toBeInTheDocument();
    expect(authenticatedApi.get).toHaveBeenCalledWith(
      expect.stringMatching(/\/drivers\/me\/notifications\//)
    );
  });

  it("shows an error state and supports retry", async () => {
    authenticatedApi.get.mockRejectedValueOnce(new Error("Network"));
    render(<DriverNotificationsPage />);

    await waitFor(() =>
      expect(screen.getByText("Could not load notifications")).toBeInTheDocument()
    );

    mockGet(baseResponse());
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() =>
      expect(screen.getByText("New ride request")).toBeInTheDocument()
    );
    expect(authenticatedApi.get).toHaveBeenCalledTimes(2);
  });

  it("shows an empty state when there are no notifications", async () => {
    mockGet({ items: [], unread_count: 0 });
    render(<DriverNotificationsPage />);

    await waitFor(() =>
      expect(screen.getByText("No notifications yet")).toBeInTheDocument()
    );
    expect(screen.getByText("No notifications")).toBeInTheDocument();
  });

  it("distinguishes unread notifications", async () => {
    mockGet(baseResponse());
    render(<DriverNotificationsPage />);

    await waitFor(() =>
      expect(screen.getByText("New ride request")).toBeInTheDocument()
    );
    const unread = screen.getByLabelText(/New ride request unread/i);
    const read = screen.getByLabelText(/Payment completed/i);
    expect(unread).toHaveClass("dnp__item--unread");
    expect(read).not.toHaveClass("dnp__item--unread");
  });

  it("marks one notification as read and navigates to the deep link", async () => {
    mockGet(baseResponse());
    authenticatedApi.post.mockResolvedValue({});
    render(<DriverNotificationsPage />);

    await waitFor(() =>
      expect(screen.getByText("New ride request")).toBeInTheDocument()
    );

    fireEvent.click(screen.getByLabelText(/New ride request unread/i));

    await waitFor(() =>
      expect(navigateInApp).toHaveBeenCalledWith("/driver")
    );
    expect(authenticatedApi.post).toHaveBeenCalledWith(
      expect.stringMatching(/\/notifications\/read\//),
      { ids: [1] }
    );
  });

  it("marks all notifications as read", async () => {
    mockGet(baseResponse());
    authenticatedApi.post.mockResolvedValue({});
    render(<DriverNotificationsPage />);

    await waitFor(() =>
      expect(screen.getByText("Mark all as read")).toBeInTheDocument()
    );

    fireEvent.click(screen.getByRole("button", { name: "Mark all notifications as read" }));

    await waitFor(() =>
      expect(authenticatedApi.post).toHaveBeenCalledWith(
        expect.stringMatching(/\/notifications\/read\//),
        { ids: [1, 2] }
      )
    );
    expect(screen.getByText("0 unread")).toBeInTheDocument();
  });
});
