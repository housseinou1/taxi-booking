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
      {
        id: 3,
        title: "Document expiring",
        body: "Upload renewed license",
        created_at: "2026-07-28T06:00:00Z",
        type: "document_status",
        is_read: false,
      },
      {
        id: 4,
        title: "Support reply",
        body: "Your ticket was updated",
        created_at: "2026-07-28T05:00:00Z",
        type: "support_reply",
        is_read: true,
      },
    ],
    unread_count: 2,
  };
}

function emptyResponse() {
  return { items: [], unread_count: 0 };
}

function mockGet(response) {
  authenticatedApi.get.mockResolvedValue({ data: response });
}

function getButton(name) {
  return screen.getByRole("button", { name });
}

describe("DriverNotificationsPage", () => {
  it("shows loading then renders the notification list", async () => {
    mockGet(baseResponse());
    render(<DriverNotificationsPage />);

    await waitFor(() =>
      expect(screen.getByText("New ride request")).toBeInTheDocument()
    );
    expect(screen.getByText("Payment completed")).toBeInTheDocument();
    expect(screen.getByText("Showing 4 of 4", { exact: false })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText("2 unread", { exact: false })).toBeInTheDocument()
    );
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

  it("shows a general empty state", async () => {
    mockGet(emptyResponse());
    render(<DriverNotificationsPage />);

    await waitFor(() =>
      expect(screen.getByText("No notifications yet")).toBeInTheDocument()
    );
    expect(screen.getByText("No notifications")).toBeInTheDocument();
  });

  it("filters by All and Unread", async () => {
    mockGet(baseResponse());
    render(<DriverNotificationsPage />);

    await waitFor(() =>
      expect(screen.getByText("New ride request")).toBeInTheDocument()
    );

    fireEvent.click(getButton("Unread"));

    await waitFor(() =>
      expect(screen.getByText("Showing 2 of 4", { exact: false })).toBeInTheDocument()
    );
    expect(screen.getByText("New ride request")).toBeInTheDocument();
    expect(screen.queryByText("Payment completed", { exact: false })).not.toBeInTheDocument();

    fireEvent.click(getButton("All"));

    await waitFor(() =>
      expect(screen.getByText("Showing 4 of 4", { exact: false })).toBeInTheDocument()
    );
    expect(screen.getByText("Payment completed")).toBeInTheDocument();
  });

  it("filters by category", async () => {
    mockGet(baseResponse());
    render(<DriverNotificationsPage />);

    await waitFor(() =>
      expect(screen.getByText("New ride request")).toBeInTheDocument()
    );

    fireEvent.click(getButton("Rides"));
    await waitFor(() =>
      expect(screen.getByText("Showing 1 of 4", { exact: false })).toBeInTheDocument()
    );
    expect(screen.getByText("New ride request")).toBeInTheDocument();
    expect(screen.queryByText("Payment completed")).not.toBeInTheDocument();

    fireEvent.click(getButton("Payments / Earnings"));
    await waitFor(() =>
      expect(screen.getByText("Payment completed")).toBeInTheDocument()
    );
    expect(screen.queryByText("New ride request")).not.toBeInTheDocument();

    fireEvent.click(getButton("Documents"));
    await waitFor(() =>
      expect(screen.getByText("Document expiring")).toBeInTheDocument()
    );

    fireEvent.click(getButton("System / Support"));
    await waitFor(() =>
      expect(screen.getByText("Support reply")).toBeInTheDocument()
    );
  });

  it("shows aria-pressed on filter buttons", async () => {
    mockGet(baseResponse());
    render(<DriverNotificationsPage />);

    await waitFor(() =>
      expect(screen.getByText("New ride request")).toBeInTheDocument()
    );

    const all = getButton("All");
    expect(all).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(getButton("Unread"));
    await waitFor(() =>
      expect(getButton("Unread")).toHaveAttribute("aria-pressed", "true")
    );
    expect(all).toHaveAttribute("aria-pressed", "false");
  });

  it("uses a neutral fallback for unknown categories and does not navigate", async () => {
    mockGet({
      items: [
        {
          id: 9,
          title: "Unknown alert",
          body: "Something happened",
          created_at: "2026-07-28T04:00:00Z",
          type: "unknown_type",
          is_read: false,
        },
      ],
    });
    render(<DriverNotificationsPage />);

    await waitFor(() =>
      expect(screen.getByText("Unknown alert")).toBeInTheDocument()
    );
    expect(screen.getByText(/Announcements/i)).toBeInTheDocument();

    const title = screen.getByText("Unknown alert");
    expect(title.closest("button")).toBeNull();

    authenticatedApi.post.mockResolvedValue({});
    fireEvent.click(screen.getByRole("button", { name: "Mark Unknown alert as read" }));

    await waitFor(() =>
      expect(authenticatedApi.post).toHaveBeenCalledWith(
        expect.stringMatching(/\/notifications\/read\//),
        { ids: [9] }
      )
    );
    expect(navigateInApp).not.toHaveBeenCalled();
  });

  it("navigates to a valid deep link from the title button", async () => {
    mockGet(baseResponse());
    render(<DriverNotificationsPage />);

    await waitFor(() =>
      expect(screen.getByText("New ride request")).toBeInTheDocument()
    );

    fireEvent.click(screen.getByRole("button", { name: "Open New ride request" }));

    await waitFor(() =>
      expect(navigateInApp).toHaveBeenCalledWith("/driver")
    );
  });

  it("marks one notification as read without navigating", async () => {
    mockGet(baseResponse());
    authenticatedApi.post.mockResolvedValue({});
    render(<DriverNotificationsPage />);

    await waitFor(() =>
      expect(screen.getByText("New ride request")).toBeInTheDocument()
    );

    fireEvent.click(screen.getByRole("button", { name: "Mark New ride request as read" }));

    await waitFor(() =>
      expect(authenticatedApi.post).toHaveBeenCalledWith(
        expect.stringMatching(/\/notifications\/read\//),
        { ids: [1] }
      )
    );
    await waitFor(() =>
      expect(screen.getByText("1 unread", { exact: false })).toBeInTheDocument()
    );
    expect(navigateInApp).not.toHaveBeenCalled();
  });

  it("disables the mark button while marking and prevents duplicate requests", async () => {
    mockGet(baseResponse());
    let resolvePost;
    authenticatedApi.post.mockImplementation(
      () => new Promise((resolve) => { resolvePost = resolve; })
    );
    render(<DriverNotificationsPage />);

    await waitFor(() =>
      expect(screen.getByText("New ride request")).toBeInTheDocument()
    );

    const button = screen.getByRole("button", { name: "Mark New ride request as read" });
    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() => expect(button).toBeDisabled());
    expect(authenticatedApi.post).toHaveBeenCalledTimes(1);

    resolvePost({});
    await waitFor(() =>
      expect(screen.getByText("1 unread", { exact: false })).toBeInTheDocument()
    );
  });

  it("shows a section-level error when marking one fails", async () => {
    mockGet(baseResponse());
    authenticatedApi.post.mockRejectedValue(new Error("Failed"));
    render(<DriverNotificationsPage />);

    await waitFor(() =>
      expect(screen.getByText("New ride request")).toBeInTheDocument()
    );

    fireEvent.click(screen.getByRole("button", { name: "Mark New ride request as read" }));

    await waitFor(() =>
      expect(screen.getByText("Could not mark as read. Try again.")).toBeInTheDocument()
    );
    await waitFor(() =>
      expect(screen.getByText("2 unread", { exact: false })).toBeInTheDocument()
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
        { ids: [1, 2, 3, 4] }
      )
    );
    await waitFor(() =>
      expect(screen.getByText("0 unread", { exact: false })).toBeInTheDocument()
    );
  });

  it("shows a section-level error when mark-all fails", async () => {
    mockGet(baseResponse());
    authenticatedApi.post.mockRejectedValue(new Error("Failed"));
    render(<DriverNotificationsPage />);

    await waitFor(() =>
      expect(screen.getByText("Mark all as read")).toBeInTheDocument()
    );

    fireEvent.click(screen.getByRole("button", { name: "Mark all notifications as read" }));

    await waitFor(() =>
      expect(screen.getByText("Could not mark all as read. Try again.")).toBeInTheDocument()
    );
    await waitFor(() =>
      expect(screen.getByText("2 unread", { exact: false })).toBeInTheDocument()
    );
  });

  it("shows the unread empty state with a Show all action", async () => {
    mockGet(baseResponse());
    authenticatedApi.post.mockResolvedValue({});
    render(<DriverNotificationsPage />);

    await waitFor(() =>
      expect(screen.getByText("New ride request")).toBeInTheDocument()
    );

    fireEvent.click(getButton("Unread"));
    await waitFor(() =>
      expect(screen.getByText("Showing 2 of 4", { exact: false })).toBeInTheDocument()
    );

    fireEvent.click(screen.getByRole("button", { name: "Mark all notifications as read" }));

    await waitFor(() =>
      expect(screen.getByText("No unread notifications")).toBeInTheDocument()
    );
    await waitFor(() =>
      expect(screen.getByText("0 unread", { exact: false })).toBeInTheDocument()
    );

    fireEvent.click(screen.getByRole("button", { name: "Show all" }));
    await waitFor(() =>
      expect(screen.getByText("New ride request")).toBeInTheDocument()
    );
  });

  it("shows the category empty state with a Clear filter action", async () => {
    mockGet({
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
          id: 4,
          title: "Support reply",
          body: "Your ticket was updated",
          created_at: "2026-07-28T05:00:00Z",
          type: "support_reply",
          is_read: true,
        },
      ],
    });
    render(<DriverNotificationsPage />);

    await waitFor(() =>
      expect(screen.getByText("New ride request")).toBeInTheDocument()
    );

    fireEvent.click(getButton("Documents"));

    await waitFor(() =>
      expect(screen.getByText("No notifications in this category")).toBeInTheDocument()
    );

    fireEvent.click(screen.getByRole("button", { name: "Clear filter" }));
    await waitFor(() =>
      expect(screen.getByText("New ride request")).toBeInTheDocument()
    );
  });

  it("supports manual refresh without hiding the list", async () => {
    mockGet(baseResponse());
    render(<DriverNotificationsPage />);

    await waitFor(() =>
      expect(screen.getByText("New ride request")).toBeInTheDocument()
    );

    const refresh = screen.getByRole("button", { name: "Refresh notifications" });
    fireEvent.click(refresh);

    await waitFor(() =>
      expect(refresh).toBeDisabled()
    );
    expect(authenticatedApi.get).toHaveBeenCalledTimes(2);

    await waitFor(() =>
      expect(refresh).toBeEnabled()
    );
    expect(screen.getByText("New ride request")).toBeInTheDocument();
  });

  it("exposes one h1 and landmarks", async () => {
    mockGet(baseResponse());
    render(<DriverNotificationsPage />);

    await waitFor(() =>
      expect(screen.getByText("New ride request")).toBeInTheDocument()
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Notifications");
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByLabelText("Notification filters")).toBeInTheDocument();
    expect(screen.getByLabelText("Notifications list")).toBeInTheDocument();
  });
});
