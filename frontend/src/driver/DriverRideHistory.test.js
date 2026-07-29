import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import DriverRideHistory from "./DriverRideHistory";
import authenticatedApi from "../auth/authenticatedApi";

jest.mock("../auth/authenticatedApi", () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

jest.mock("../marketConfig", () => ({
  formatMoney: (value) => `${value} MRU`,
  MARKET: { currency: "MRU" },
}));

const baseResponse = (overrides = {}) => ({
  count: 1,
  total_pages: 1,
  current_page: 1,
  page_size: 20,
  results: [
    {
      id: 1,
      pickup: "Central Market",
      destination: "Airport",
      pickup_address: "Central Market",
      destination_address: "Airport",
      fare: "500",
      driver_earning: "400",
      status: "completed",
      ride_type: "regular",
      distance_km: "5.5",
      rating: 5,
      stop_count: 0,
      created_at: "2026-07-20T10:00:00Z",
      completed_at: "2026-07-20T10:30:00Z",
      rider_name: "Ahmad",
    },
  ],
  ...overrides,
});

const emptyResponse = (overrides = {}) => ({
  count: 0,
  total_pages: 1,
  current_page: 1,
  page_size: 20,
  results: [],
  ...overrides,
});

function mockGet(response) {
  authenticatedApi.get.mockResolvedValueOnce({ data: response });
}

beforeEach(() => {
  authenticatedApi.get.mockClear();
});

afterEach(() => {
  authenticatedApi.get.mockClear();
});

describe("DriverRideHistory foundation", () => {
  it("renders visible h1 and loading state, then loads and displays rides", async () => {
    mockGet(baseResponse());
    render(<DriverRideHistory />);

    expect(screen.getByRole("heading", { name: "Ride History" })).toBeInTheDocument();
    expect(screen.getByText("Loading ride history...")).toBeInTheDocument();

    await waitFor(() =>
      expect(screen.getByText("Central Market")).toBeInTheDocument()
    );
    expect(screen.getByText("Airport")).toBeInTheDocument();
    expect(screen.getByText("400 MRU")).toBeInTheDocument();
    expect(screen.getByText("1 ride")).toBeInTheDocument();
    expect(authenticatedApi.get).toHaveBeenCalledWith(
      expect.stringMatching(/\/drivers\/me\/rides\/\?page=1/)
    );
  });

  it("uses DriverErrorState on fetch failure and supports retry", async () => {
    authenticatedApi.get.mockRejectedValueOnce(new Error("Network"));
    render(<DriverRideHistory />);

    await waitFor(() =>
      expect(screen.getByText("Could not load ride history")).toBeInTheDocument()
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    const retry = screen.getByRole("button", { name: "Try again" });
    expect(retry).toBeInTheDocument();

    mockGet(baseResponse());
    fireEvent.click(retry);

    await waitFor(() =>
      expect(screen.getByText("Central Market")).toBeInTheDocument()
    );
  });

  it("shows truthful general empty state", async () => {
    mockGet(emptyResponse());
    render(<DriverRideHistory />);

    await waitFor(() =>
      expect(screen.getByText("No rides yet.")).toBeInTheDocument()
    );
    expect(
      screen.getByText("Your completed and cancelled rides will appear here.")
    ).toBeInTheDocument();
  });

  it("shows filtered empty state when no results match filters", async () => {
    mockGet(baseResponse());
    mockGet(emptyResponse());
    render(<DriverRideHistory />);

    await waitFor(() =>
      expect(screen.getByText("Central Market")).toBeInTheDocument()
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancelled" }));

    await waitFor(() =>
      expect(screen.getByText("No rides match these filters.")).toBeInTheDocument()
    );
    expect(screen.getByText("Try adjusting your filters.")).toBeInTheDocument();
  });

  it("has visible date input labels", async () => {
    mockGet(baseResponse());
    render(<DriverRideHistory />);

    await waitFor(() =>
      expect(screen.getByLabelText("From")).toBeInTheDocument()
    );
    expect(screen.getByLabelText("To")).toBeInTheDocument();
  });

  it("uses aria-pressed on status filter buttons and resets page to 1 on filter change", async () => {
    mockGet(baseResponse());
    mockGet(baseResponse({ current_page: 1, total_pages: 2 }));
    render(<DriverRideHistory />);

    await waitFor(() =>
      expect(screen.getByText("Central Market")).toBeInTheDocument()
    );

    const allBtn = screen.getByRole("button", { name: "All" });
    const completedBtn = screen.getByRole("button", { name: "Completed" });

    expect(allBtn).toHaveAttribute("aria-pressed", "true");
    expect(completedBtn).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(completedBtn);

    await waitFor(() => {
      const lastCall = authenticatedApi.get.mock.calls[authenticatedApi.get.mock.calls.length - 1][0];
      expect(lastCall).toContain("status=completed");
      expect(lastCall).toContain("page=1");
    });
  });

  it("prevents fetch and shows validation when from date is after to date", async () => {
    mockGet(baseResponse());
    render(<DriverRideHistory />);

    await waitFor(() =>
      expect(screen.getByText("Central Market")).toBeInTheDocument()
    );

    const fromInput = screen.getByLabelText("From");
    const toInput = screen.getByLabelText("To");

    const afterInitial = authenticatedApi.get.mock.calls.length;
    fireEvent.change(toInput, { target: { value: "2026-07-20" } });
    await waitFor(() =>
      expect(authenticatedApi.get).toHaveBeenCalledTimes(afterInitial + 1)
    );

    const afterTo = authenticatedApi.get.mock.calls.length;
    fireEvent.change(fromInput, { target: { value: "2026-07-30" } });

    await waitFor(() =>
      expect(
        screen.getByText("From date cannot be later than To date.")
      ).toBeInTheDocument()
    );

    // Validation blocks the invalid range fetch; only the valid partial To fetch was made
    expect(authenticatedApi.get).toHaveBeenCalledTimes(afterTo);
    const invalidCall = authenticatedApi.get.mock.calls.find((call) =>
      String(call[0]).includes("date_from=2026-07-30") &&
      String(call[0]).includes("date_to=2026-07-20")
    );
    expect(invalidCall).toBeUndefined();
  });

  it("paginates correctly: previous disabled on page 1, next enabled when available", async () => {
    mockGet(baseResponse({ current_page: 1, total_pages: 2 }));
    render(<DriverRideHistory />);

    await waitFor(() =>
      expect(screen.getByText("Page 1 of 2")).toBeInTheDocument()
    );

    const previous = screen.getByRole("button", { name: "Previous page" });
    const next = screen.getByRole("button", { name: "Next page" });

    expect(previous).toBeDisabled();
    expect(next).not.toBeDisabled();
  });

  it("advances page and disables next on the final page", async () => {
    mockGet(baseResponse({ current_page: 1, total_pages: 2 }));
    mockGet(baseResponse({ current_page: 2, total_pages: 2, results: [{ ...baseResponse().results[0], id: 2 }] }));
    render(<DriverRideHistory />);

    await waitFor(() =>
      expect(screen.getByText("Page 1 of 2")).toBeInTheDocument()
    );

    fireEvent.click(screen.getByRole("button", { name: "Next page" }));

    await waitFor(() =>
      expect(screen.getByText("Page 2 of 2")).toBeInTheDocument()
    );

    const previous = screen.getByRole("button", { name: "Previous page" });
    const next = screen.getByRole("button", { name: "Next page" });

    expect(previous).not.toBeDisabled();
    expect(next).toBeDisabled();
  });

  it("prefers driver_earning and displays zero as real zero", async () => {
    mockGet({
      ...baseResponse(),
      results: [{ ...baseResponse().results[0], driver_earning: "0", fare: "500" }],
    });
    render(<DriverRideHistory />);

    await waitFor(() =>
      expect(screen.getByText("0 MRU")).toBeInTheDocument()
    );
  });

  it("shows missing earning as —", async () => {
    mockGet({
      ...baseResponse(),
      results: [{ ...baseResponse().results[0], driver_earning: undefined, fare: undefined }],
    });
    render(<DriverRideHistory />);

    await waitFor(() =>
      expect(screen.getByText("—")).toBeInTheDocument()
    );
  });

  it("renders status visible text", async () => {
    mockGet(baseResponse({ results: [{ ...baseResponse().results[0], status: "cancelled" }] }));
    render(<DriverRideHistory />);

    await waitFor(() =>
      expect(screen.getByText("cancelled")).toBeInTheDocument()
    );
  });

  it("renders optional fields only when present", async () => {
    mockGet({
      ...baseResponse(),
      results: [
        {
          id: 3,
          pickup: "A",
          destination: "B",
          fare: "300",
          driver_earning: "250",
          status: "completed",
          created_at: "2026-07-20T10:00:00Z",
          completed_at: "2026-07-20T10:30:00Z",
        },
      ],
    });
    render(<DriverRideHistory />);

    await waitFor(() =>
      expect(screen.getByText("A")).toBeInTheDocument()
    );
    expect(screen.queryByText("Rider:")).not.toBeInTheDocument();
    expect(screen.queryByText("km")).not.toBeInTheDocument();
    expect(screen.queryByText("Rating:")).not.toBeInTheDocument();
  });

  it("does not call a ride-detail endpoint", async () => {
    mockGet(baseResponse());
    render(<DriverRideHistory />);

    await waitFor(() =>
      expect(screen.getByText("Central Market")).toBeInTheDocument()
    );

    expect(authenticatedApi.get).toHaveBeenCalledWith(
      expect.stringMatching(/\/drivers\/me\/rides\//)
    );
    expect(authenticatedApi.get).not.toHaveBeenCalledWith(
      expect.stringMatching(/\/rides\/\d+\//)
    );
  });
});
