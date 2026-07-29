import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import DriverNotificationsPage, { formatRelativeTime, groupNotifications } from "./DriverNotificationsPage";
import authenticatedApi from "../auth/authenticatedApi";
import { navigateInApp } from "../navigation/inAppNavigation";

jest.mock("../auth/authenticatedApi", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));

jest.mock("../navigation/inAppNavigation", () => ({
  navigateInApp: jest.fn(),
}));

const NOW = new Date("2026-07-29T14:00:00.000Z");
let dateNowSpy;

beforeEach(() => {
  authenticatedApi.get.mockClear();
  authenticatedApi.post.mockClear();
  navigateInApp.mockClear();
  dateNowSpy = jest.spyOn(Date, "now").mockReturnValue(NOW.getTime());
});

afterEach(() => {
  authenticatedApi.get.mockClear();
  authenticatedApi.post.mockClear();
  navigateInApp.mockClear();
  dateNowSpy.mockRestore();
});

function baseResponse() {
  return {
    items: [
      {
        id: 1,
        title: "New ride request",
        body: "Pickup nearby",
        created_at: "2026-07-29T13:55:00.000Z",
        type: "ride_request",
        is_read: false,
      },
      {
        id: 2,
        title: "Payment completed",
        body: "100 MRU",
        created_at: "2026-07-28T09:40:00.000Z",
        type: "payment_completed",
        is_read: true,
      },
      {
        id: 3,
        title: "Document expiring",
        body: "Upload renewed license",
        created_at: "2026-07-25T12:00:00.000Z",
        type: "document_status",
        is_read: true,
        data: { document_id: 7, days_left: 5 },
      },
      {
        id: 4,
        title: "Support reply",
        body: "Your ticket was updated",
        created_at: "2026-07-25T08:00:00.000Z",
        type: "support_reply",
        is_read: true,
      },
    ],
    unread_count: 1,
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

describe("formatRelativeTime", () => {
  it("returns Just now for times under a minute", () => {
    expect(formatRelativeTime("2026-07-29T13:59:55.000Z", NOW)).toBe("Just now");
  });

  it("returns minutes ago for times under an hour", () => {
    expect(formatRelativeTime("2026-07-29T13:55:00.000Z", NOW)).toBe("5 minutes ago");
    expect(formatRelativeTime("2026-07-29T13:59:00.000Z", NOW)).toBe("1 minute ago");
  });

  it("returns Today at for the same calendar day", () => {
    const result = formatRelativeTime("2026-07-29T10:00:00.000Z", NOW);
    expect(result).toMatch(/Today at/);
  });

  it("returns Yesterday at for the previous calendar day", () => {
    const result = formatRelativeTime("2026-07-28T09:40:00.000Z", NOW);
    expect(result).toMatch(/Yesterday at/);
  });

  it("returns a full date for older timestamps", () => {
    const result = formatRelativeTime("2026-07-25T12:00:00.000Z", NOW);
    expect(result).toMatch(/2026/);
  });

  it("returns empty string for invalid or missing values", () => {
    expect(formatRelativeTime(null, NOW)).toBe("");
    expect(formatRelativeTime("", NOW)).toBe("");
    expect(formatRelativeTime("not-a-date", NOW)).toBe("");
  });
});

describe("groupNotifications", () => {
  it("groups Today, Yesterday, and Earlier", () => {
    const items = baseResponse().items;
    const groups = groupNotifications(items, NOW);

    expect(groups.map((g) => g.label)).toEqual(["Today", "Yesterday", "Earlier"]);
    expect(groups[0].items.map((i) => i.title)).toEqual(["New ride request"]);
    expect(groups[1].items.map((i) => i.title)).toEqual(["Payment completed"]);
    expect(groups[2].items.map((i) => i.title)).toEqual([
      "Document expiring",
      "Support reply",
    ]);
  });

  it("sorts items newest to oldest within a group", () => {
    const items = baseResponse().items.filter((i) => i.id === 3 || i.id === 4);
    const groups = groupNotifications(items, NOW);

    expect(groups[0].items[0].title).toBe("Document expiring");
    expect(groups[0].items[1].title).toBe("Support reply");
  });

  it("skips empty groups", () => {
    const items = [
      { id: 1, title: "A", created_at: "2026-07-29T10:00:00.000Z" },
      { id: 2, title: "B", created_at: "2026-07-28T10:00:00.000Z" },
    ];
    const groups = groupNotifications(items, new Date("2026-07-27T14:00:00.000Z"));
    expect(groups.map((g) => g.label)).toEqual(["Earlier"]);
  });
});

describe("DriverNotificationsPage", () => {
  it("shows loading then renders the notification list", async () => {
    mockGet(baseResponse());
    render(<DriverNotificationsPage />);

    await waitFor(() =>
      expect(screen.getByText("New ride request")).toBeInTheDocument()
    );
    expect(screen.getByText("Payment completed")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Today" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Yesterday" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Earlier" })).toBeInTheDocument();
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
      expect(screen.getByText("New ride request")).toBeInTheDocument()
    );
    expect(screen.getByRole("heading", { name: "Today" })).toBeInTheDocument();
    expect(screen.queryByText("Payment completed")).not.toBeInTheDocument();

    fireEvent.click(getButton("All"));

    await waitFor(() =>
      expect(screen.getByText("Payment completed")).toBeInTheDocument()
    );
  });

  it("filters by category", async () => {
    mockGet(baseResponse());
    render(<DriverNotificationsPage />);

    await waitFor(() =>
      expect(screen.getByText("New ride request")).toBeInTheDocument()
    );

    fireEvent.click(getButton("Rides"));
    await waitFor(() =>
      expect(screen.getByText("New ride request")).toBeInTheDocument()
    );
    expect(screen.queryByText("Payment completed")).not.toBeInTheDocument();

    fireEvent.click(getButton("Payments / Earnings"));
    await waitFor(() =>
      expect(screen.getByText("Payment completed")).toBeInTheDocument()
    );

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
          created_at: "2026-07-29T13:00:00.000Z",
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
      expect(screen.getByText("0 unread", { exact: false })).toBeInTheDocument()
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
      expect(screen.getByText("0 unread", { exact: false })).toBeInTheDocument()
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
      expect(screen.getByText("1 unread", { exact: false })).toBeInTheDocument()
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
      expect(screen.getByText("1 unread", { exact: false })).toBeInTheDocument()
    );
  });

  it("shows the category empty state with a Clear filter action", async () => {
    mockGet({
      items: [
        {
          id: 1,
          title: "New ride request",
          body: "Pickup nearby",
          created_at: "2026-07-29T13:55:00.000Z",
          type: "ride_request",
          is_read: false,
        },
        {
          id: 4,
          title: "Support reply",
          body: "Your ticket was updated",
          created_at: "2026-07-28T09:40:00.000Z",
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

  it("expands and collapses notification details", async () => {
    mockGet(baseResponse());
    render(<DriverNotificationsPage />);

    await waitFor(() =>
      expect(screen.getByText("Document expiring")).toBeInTheDocument()
    );

    const expand = screen.getByRole("button", { name: "Show details" });
    expect(expand).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(expand);
    await waitFor(() =>
      expect(expand).toHaveAttribute("aria-expanded", "true")
    );
    expect(screen.getByText("document_id")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();

    fireEvent.click(expand);
    await waitFor(() =>
      expect(expand).toHaveAttribute("aria-expanded", "false")
    );
    expect(screen.queryByText("document_id")).not.toBeInTheDocument();
  });

  it("only expands one notification at a time", async () => {
    mockGet({
      items: [
        {
          id: 3,
          title: "Document expiring",
          body: "Upload renewed license",
          created_at: "2026-07-25T12:00:00.000Z",
          type: "document_status",
          is_read: true,
          data: { document_id: 7 },
        },
        {
          id: 8,
          title: "Bonus earned",
          body: "50 MRU",
          created_at: "2026-07-25T10:00:00.000Z",
          type: "incentive",
          is_read: true,
          data: { bonus_id: 12 },
        },
      ],
    });
    render(<DriverNotificationsPage />);

    await waitFor(() =>
      expect(screen.getByText("Document expiring")).toBeInTheDocument()
    );

    const expandA = screen.getAllByRole("button", { name: "Show details" })[0];
    const expandB = screen.getAllByRole("button", { name: "Show details" })[1];

    fireEvent.click(expandA);
    await waitFor(() =>
      expect(expandA).toHaveAttribute("aria-expanded", "true")
    );
    expect(expandB).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("document_id")).toBeInTheDocument();
    expect(screen.queryByText("bonus_id")).not.toBeInTheDocument();

    fireEvent.click(expandB);
    await waitFor(() =>
      expect(expandB).toHaveAttribute("aria-expanded", "true")
    );
    expect(expandA).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("document_id")).not.toBeInTheDocument();
    expect(screen.getByText("bonus_id")).toBeInTheDocument();
  });

  it("does not offer an expand control when there is no detail metadata", async () => {
    mockGet({
      items: [
        {
          id: 1,
          title: "Simple note",
          body: "No extra data",
          created_at: "2026-07-29T13:55:00.000Z",
          type: "announcement",
          is_read: true,
        },
      ],
    });
    render(<DriverNotificationsPage />);

    await waitFor(() =>
      expect(screen.getByText("Simple note")).toBeInTheDocument()
    );
    expect(screen.queryByRole("button", { name: "Show details" })).not.toBeInTheDocument();
  });

  it("exposes one h1, section headings, and landmarks", async () => {
    mockGet(baseResponse());
    render(<DriverNotificationsPage />);

    await waitFor(() =>
      expect(screen.getByText("New ride request")).toBeInTheDocument()
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Notifications");
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByLabelText("Notification filters")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Today" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Yesterday" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Earlier" })).toBeInTheDocument();
  });
});
