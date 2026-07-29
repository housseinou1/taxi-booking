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

jest.mock("./utils/driverReceipt", () => ({
  ...jest.requireActual("./utils/driverReceipt"),
  printDriverReceipt: jest.fn(),
  shareDriverReceipt: jest.fn(),
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
    expect(screen.getByText(/Showing 1 ride/i)).toBeInTheDocument();
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

  describe("Ride detail expansion", () => {
    it("expands a ride and fetches detail", async () => {
      mockGet(baseResponse());
      authenticatedApi.get.mockResolvedValueOnce({
        data: {
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
          created_at: "2026-07-20T10:00:00Z",
          completed_at: "2026-07-20T10:30:00Z",
          waiting_fee: "50",
          payment_tip_amount: "100",
          app_fee: "60",
          bonus: "25",
          notes: "Great ride",
          rider_name: "Ahmad",
        },
      });
      render(<DriverRideHistory />);

      await waitFor(() =>
        expect(screen.getByText("Central Market")).toBeInTheDocument()
      );

      fireEvent.click(screen.getByRole("button", { name: /show details/i }));

      await waitFor(() =>
        expect(screen.getByText("Ride details")).toBeInTheDocument()
      );
      expect(screen.getByText("Waiting fee")).toBeInTheDocument();
      expect(screen.getByText("50 MRU")).toBeInTheDocument();
      expect(screen.getByText("Tip")).toBeInTheDocument();
      expect(screen.getByText("100 MRU")).toBeInTheDocument();
      expect(screen.getByText("Commission")).toBeInTheDocument();
      expect(screen.getByText("60 MRU")).toBeInTheDocument();
      expect(screen.getByText("Bonus")).toBeInTheDocument();
      expect(screen.getByText("25 MRU")).toBeInTheDocument();
      expect(screen.getByText("Great ride")).toBeInTheDocument();

      expect(authenticatedApi.get).toHaveBeenCalledWith(
        expect.stringMatching(/\/rides\/1\//)
      );
    });

    it("does not fetch details until expanded", async () => {
      mockGet(baseResponse());
      render(<DriverRideHistory />);

      await waitFor(() =>
        expect(screen.getByText("Central Market")).toBeInTheDocument()
      );
      expect(authenticatedApi.get).toHaveBeenCalledTimes(1);
    });

    it("caches the detail and avoids refetching", async () => {
      mockGet(baseResponse());
      authenticatedApi.get.mockResolvedValueOnce({
        data: {
          id: 1,
          pickup: "Central Market",
          destination: "Airport",
          fare: "500",
          driver_earning: "400",
          status: "completed",
          created_at: "2026-07-20T10:00:00Z",
        },
      });
      render(<DriverRideHistory />);

      await waitFor(() =>
        expect(screen.getByText("Central Market")).toBeInTheDocument()
      );
      const toggle = screen.getByRole("button", { name: /show details/i });

      fireEvent.click(toggle);
      await waitFor(() =>
        expect(screen.getByText("Ride details")).toBeInTheDocument()
      );

      fireEvent.click(toggle);
      expect(screen.queryByText("Ride details")).not.toBeInTheDocument();

      fireEvent.click(toggle);
      expect(screen.getByText("Ride details")).toBeInTheDocument();

      await new Promise((r) => setTimeout(r, 50));
      expect(authenticatedApi.get).toHaveBeenCalledTimes(2);
    });

    it("shows detail loading state", async () => {
      mockGet(baseResponse());
      let resolveDetail;
      authenticatedApi.get.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveDetail = resolve;
          })
      );
      render(<DriverRideHistory />);

      await waitFor(() =>
        expect(screen.getByText("Central Market")).toBeInTheDocument()
      );
      fireEvent.click(screen.getByRole("button", { name: /show details/i }));
      expect(screen.getByText("Loading details…")).toBeInTheDocument();

      resolveDetail({
        data: { id: 1, pickup: "Central Market", destination: "Airport" },
      });
      await waitFor(() =>
        expect(screen.getByText("Ride details")).toBeInTheDocument()
      );
    });

    it("shows detail error and supports retry", async () => {
      mockGet(baseResponse());
      authenticatedApi.get.mockRejectedValueOnce(new Error("Detail failed"));
      render(<DriverRideHistory />);

      await waitFor(() =>
        expect(screen.getByText("Central Market")).toBeInTheDocument()
      );
      fireEvent.click(screen.getByRole("button", { name: /show details/i }));

      await waitFor(() =>
        expect(
          screen.getByText(/Could not load ride details/)
        ).toBeInTheDocument()
      );
      const retry = screen.getByRole("button", { name: "Try again" });
      expect(retry).toBeInTheDocument();

      authenticatedApi.get.mockResolvedValueOnce({
        data: { id: 1, pickup: "Central Market", destination: "Airport" },
      });
      fireEvent.click(retry);

      await waitFor(() =>
        expect(screen.getByText("Ride details")).toBeInTheDocument()
      );
    });

    it("disables receipt actions until detail is loaded", async () => {
      mockGet(baseResponse());
      render(<DriverRideHistory />);

      await waitFor(() =>
        expect(screen.getByText("Central Market")).toBeInTheDocument()
      );
      fireEvent.click(screen.getByRole("button", { name: /show details/i }));

      const print = await screen.findByRole("button", { name: "Print receipt" });
      const share = await screen.findByRole("button", { name: "Share receipt" });
      expect(print).toBeDisabled();
      expect(share).toBeDisabled();
      expect(
        screen.getByText("Receipt actions are available once details load.")
      ).toBeInTheDocument();
    });

    it("reuses driverReceipt.js helpers for print and share", async () => {
      const { printDriverReceipt, shareDriverReceipt } = require("./utils/driverReceipt");
      mockGet(baseResponse());
      const detailData = { id: 1, fare: "500", driver_earning: "400" };
      authenticatedApi.get.mockResolvedValueOnce({ data: detailData });
      render(<DriverRideHistory />);

      await waitFor(() =>
        expect(screen.getByText("Central Market")).toBeInTheDocument()
      );
      fireEvent.click(screen.getByRole("button", { name: /show details/i }));
      await waitFor(() =>
        expect(screen.getByText("Ride details")).toBeInTheDocument()
      );

      fireEvent.click(screen.getByRole("button", { name: "Print receipt" }));
      fireEvent.click(screen.getByRole("button", { name: "Share receipt" }));

      expect(printDriverReceipt).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1 })
      );
      expect(shareDriverReceipt).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1 })
      );
    });

    it("does not invent missing detail fields", async () => {
      mockGet(baseResponse());
      authenticatedApi.get.mockResolvedValueOnce({
        data: {
          id: 1,
          pickup: "Central Market",
          destination: "Airport",
          fare: "500",
          driver_earning: "400",
          status: "completed",
          created_at: "2026-07-20T10:00:00Z",
          completed_at: "2026-07-20T10:30:00Z",
        },
      });
      render(<DriverRideHistory />);

      await waitFor(() =>
        expect(screen.getByText("Central Market")).toBeInTheDocument()
      );
      fireEvent.click(screen.getByRole("button", { name: /show details/i }));
      await waitFor(() =>
        expect(screen.getByText("Ride details")).toBeInTheDocument()
      );

      expect(screen.queryByText("Waiting fee")).not.toBeInTheDocument();
      expect(screen.queryByText("Commission")).not.toBeInTheDocument();
      expect(screen.queryByText("Bonus")).not.toBeInTheDocument();
    });

    it("sets aria-expanded and aria-controls on the detail toggle", async () => {
      mockGet(baseResponse());
      authenticatedApi.get.mockResolvedValueOnce({ data: { id: 1 } });
      render(<DriverRideHistory />);

      await waitFor(() =>
        expect(screen.getByText("Central Market")).toBeInTheDocument()
      );
      const toggle = screen.getByRole("button", { name: /show details/i });
      expect(toggle).toHaveAttribute("aria-expanded", "false");
      const controls = toggle.getAttribute("aria-controls");

      fireEvent.click(toggle);
      await waitFor(() =>
        expect(toggle).toHaveAttribute("aria-expanded", "true")
      );
      expect(document.getElementById(controls)).toBeInTheDocument();
    });
  });

  describe("Search and filtering", () => {
    const searchResponse = {
      count: 2,
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
          created_at: "2026-07-20T10:00:00Z",
          completed_at: "2026-07-20T10:30:00Z",
          rider_name: "Ahmad",
        },
        {
          id: 2,
          pickup: "Train Station",
          destination: "City Mall",
          pickup_address: "Train Station",
          destination_address: "City Mall",
          fare: "300",
          driver_earning: "250",
          status: "cancelled",
          ride_type: "premium",
          distance_km: "3.2",
          rating: null,
          created_at: "2026-07-19T09:00:00Z",
          completed_at: null,
          rider_name: "Fatima",
        },
      ],
    };

    it("filters rides by search query", async () => {
      authenticatedApi.get.mockResolvedValue({ data: searchResponse });
      render(<DriverRideHistory />);

      await waitFor(() =>
        expect(screen.getByText("Rider: Ahmad")).toBeInTheDocument()
      );
      expect(screen.getByText("Rider: Fatima")).toBeInTheDocument();
      expect(screen.getByText(/Showing 2 rides/i)).toBeInTheDocument();

      fireEvent.change(screen.getByLabelText("Search rides"), {
        target: { value: "Ahmad" },
      });

      await waitFor(() =>
        expect(screen.queryByText("Rider: Fatima")).not.toBeInTheDocument()
      );
      expect(screen.getByText("Rider: Ahmad")).toBeInTheDocument();
      expect(screen.getByText(/Showing 1 ride/i)).toBeInTheDocument();
    });

    it("filters by ride type", async () => {
      authenticatedApi.get.mockResolvedValue({ data: searchResponse });
      render(<DriverRideHistory />);

      await waitFor(() =>
        expect(screen.getByText("Rider: Ahmad")).toBeInTheDocument()
      );

      fireEvent.change(screen.getByLabelText("Search rides"), {
        target: { value: "premium" },
      });

      await waitFor(() =>
        expect(screen.queryByText("Rider: Ahmad")).not.toBeInTheDocument()
      );
      expect(screen.getByText("Rider: Fatima")).toBeInTheDocument();
      expect(screen.getByText(/Showing 1 ride/i)).toBeInTheDocument();
    });

    it("clears search and restores the full list", async () => {
      authenticatedApi.get.mockResolvedValue({ data: searchResponse });
      render(<DriverRideHistory />);

      await waitFor(() =>
        expect(screen.getByText("Rider: Ahmad")).toBeInTheDocument()
      );

      fireEvent.change(screen.getByLabelText("Search rides"), {
        target: { value: "Ahmad" },
      });
      await waitFor(() =>
        expect(screen.queryByText("Rider: Fatima")).not.toBeInTheDocument()
      );

      fireEvent.click(screen.getByLabelText("Clear search"));

      await waitFor(() =>
        expect(screen.getByText("Rider: Fatima")).toBeInTheDocument()
      );
      expect(screen.getByText("Rider: Ahmad")).toBeInTheDocument();
      expect(screen.getByText(/Showing 2 rides/i)).toBeInTheDocument();
    });

    it("clear filters resets status, dates, search and page", async () => {
      authenticatedApi.get.mockResolvedValue({ data: searchResponse });
      render(<DriverRideHistory />);

      await waitFor(() =>
        expect(screen.getByText("Rider: Ahmad")).toBeInTheDocument()
      );

      fireEvent.change(screen.getByLabelText("Search rides"), {
        target: { value: "Ahmad" },
      });
      await waitFor(() =>
        expect(screen.queryByText("Rider: Fatima")).not.toBeInTheDocument()
      );

      fireEvent.click(screen.getByRole("button", { name: "Clear all filters" }));

      await waitFor(() =>
        expect(screen.getByText("Rider: Fatima")).toBeInTheDocument()
      );
      expect(screen.getByText("Rider: Ahmad")).toBeInTheDocument();
      expect(screen.getByText(/Showing 2 rides/i)).toBeInTheDocument();
      expect(screen.getByText(/Showing 2 rides/i)).toHaveTextContent(/Page 1 of 1/);
    });

    it("shows empty search state when no matches", async () => {
      authenticatedApi.get.mockResolvedValue({ data: searchResponse });
      render(<DriverRideHistory />);

      await waitFor(() =>
        expect(screen.getByText("Rider: Ahmad")).toBeInTheDocument()
      );

      fireEvent.change(screen.getByLabelText("Search rides"), {
        target: { value: "zzzz" },
      });

      await waitFor(() =>
        expect(screen.getByText("No rides match the current search.")).toBeInTheDocument()
      );
      expect(
        screen.getByText("Try a different search term.")
      ).toBeInTheDocument();
    });

    it("shows active filters and result summary", async () => {
      authenticatedApi.get.mockResolvedValue({ data: searchResponse });
      render(<DriverRideHistory />);

      await waitFor(() =>
        expect(screen.getByText("Rider: Ahmad")).toBeInTheDocument()
      );
      expect(screen.getByText(/Showing 2 rides/i)).toBeInTheDocument();
      expect(screen.getByText(/Showing 2 rides/i)).toHaveTextContent(/Page 1 of 1/);

      fireEvent.change(screen.getByLabelText("Search rides"), {
        target: { value: "Ahmad" },
      });

      await waitFor(() =>
        expect(screen.getByText(/Search: "Ahmad"/i)).toBeInTheDocument()
      );
    });
  });
});
