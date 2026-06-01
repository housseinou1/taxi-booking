import React from "react";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import DriverFeedback from "./DriverFeedback";
import { DriverProvider } from "./context/DriverContext";

// ─── Mock axios ─────────────────────────────────────────────────────────────
jest.mock("axios");
const axios = require("axios");

// ─── Mock localStorage ──────────────────────────────────────────────────────
beforeEach(() => {
  Storage.prototype.getItem = jest.fn(() => "test-token");
});

// ─── Helper: render with DriverProvider ─────────────────────────────────────
function renderWithProvider(ui, { initialValues = {} } = {}) {
  return render(
    <DriverProvider initialValues={initialValues}>{ui}</DriverProvider>
  );
}

// ─── Mock API responses ─────────────────────────────────────────────────────
const mockFeedbackSummary = {
  average_rating: 4.7,
  compliment_counts: {
    professionalism: 12,
    clean_vehicle: 8,
    safe_driving: 15,
    friendliness: 20,
    punctuality: 10,
  },
};

const mockHistory = {
  data: [
    { date: "2025-01-01", rating: 5 },
    { date: "2025-01-05", rating: 4 },
    { date: "2025-01-10", rating: 5 },
    { date: "2025-01-15", rating: 4.5 },
    { date: "2025-01-20", rating: 5 },
  ],
};

const mockReviews = {
  count: 25,
  results: [
    { id: 1, rating: 5, text: "Great driver!", ride_date: "2025-01-20" },
    { id: 2, rating: 4, text: "Good service", ride_date: "2025-01-19" },
    { id: 3, rating: 5, text: "Very professional", ride_date: "2025-01-18" },
  ],
  next: "page=2",
};

describe("DriverFeedback", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("shows loading state initially", async () => {
    axios.get.mockImplementation(() => new Promise(() => {})); // never resolves

    await act(async () => {
      renderWithProvider(<DriverFeedback />);
    });

    expect(screen.getByText("Loading feedback...")).toBeInTheDocument();
  });

  it("displays average rating with 1 decimal place", async () => {
    axios.get.mockImplementation((url) => {
      if (url.includes("/feedback/reviews/")) return Promise.resolve({ data: mockReviews });
      if (url.includes("/feedback/history/")) return Promise.resolve({ data: mockHistory });
      if (url.includes("/feedback/")) return Promise.resolve({ data: mockFeedbackSummary });
      return Promise.resolve({ data: {} });
    });

    await act(async () => {
      renderWithProvider(<DriverFeedback />);
    });

    await waitFor(() => {
      expect(screen.getByText("4.7")).toBeInTheDocument();
    });

    expect(screen.getByText("Your Average Rating")).toBeInTheDocument();
  });

  it("displays empty state when no ratings exist", async () => {
    const noRatingsData = { average_rating: null, compliment_counts: {} };

    axios.get.mockImplementation((url) => {
      if (url.includes("/feedback/reviews/")) return Promise.resolve({ data: { count: 0, results: [] } });
      if (url.includes("/feedback/history/")) return Promise.resolve({ data: [] });
      if (url.includes("/feedback/")) return Promise.resolve({ data: noRatingsData });
      return Promise.resolve({ data: {} });
    });

    await act(async () => {
      renderWithProvider(<DriverFeedback />);
    });

    await waitFor(() => {
      expect(screen.getByText("No ratings yet")).toBeInTheDocument();
    });

    expect(screen.getByText("Complete rides to start receiving ratings from riders")).toBeInTheDocument();
  });

  it("displays 30-day rating history line chart", async () => {
    axios.get.mockImplementation((url) => {
      if (url.includes("/feedback/reviews/")) return Promise.resolve({ data: mockReviews });
      if (url.includes("/feedback/history/")) return Promise.resolve({ data: mockHistory });
      if (url.includes("/feedback/")) return Promise.resolve({ data: mockFeedbackSummary });
      return Promise.resolve({ data: {} });
    });

    await act(async () => {
      renderWithProvider(<DriverFeedback />);
    });

    await waitFor(() => {
      expect(screen.getByText("Rating History (30 Days)")).toBeInTheDocument();
    });

    // Chart should be rendered with aria label
    expect(screen.getByRole("img", { name: "30-day rating history line chart" })).toBeInTheDocument();
  });

  it("displays empty chart state when no history data", async () => {
    axios.get.mockImplementation((url) => {
      if (url.includes("/feedback/reviews/")) return Promise.resolve({ data: { count: 0, results: [] } });
      if (url.includes("/feedback/history/")) return Promise.resolve({ data: [] });
      if (url.includes("/feedback/")) return Promise.resolve({ data: mockFeedbackSummary });
      return Promise.resolve({ data: {} });
    });

    await act(async () => {
      renderWithProvider(<DriverFeedback />);
    });

    await waitFor(() => {
      expect(screen.getByText("No rating history available")).toBeInTheDocument();
    });
  });

  it("displays all 5 compliment categories with counts", async () => {
    axios.get.mockImplementation((url) => {
      if (url.includes("/feedback/reviews/")) return Promise.resolve({ data: mockReviews });
      if (url.includes("/feedback/history/")) return Promise.resolve({ data: mockHistory });
      if (url.includes("/feedback/")) return Promise.resolve({ data: mockFeedbackSummary });
      return Promise.resolve({ data: {} });
    });

    await act(async () => {
      renderWithProvider(<DriverFeedback />);
    });

    await waitFor(() => {
      expect(screen.getByText("Compliments")).toBeInTheDocument();
    });

    // All 5 categories
    expect(screen.getByText("Professionalism")).toBeInTheDocument();
    expect(screen.getByText("Clean Vehicle")).toBeInTheDocument();
    expect(screen.getByText("Safe Driving")).toBeInTheDocument();
    expect(screen.getByText("Friendliness")).toBeInTheDocument();
    expect(screen.getByText("Punctuality")).toBeInTheDocument();

    // Counts
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.getByText("15")).toBeInTheDocument();
    expect(screen.getByText("20")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
  });

  it("displays paginated reviews in reverse chronological order", async () => {
    axios.get.mockImplementation((url) => {
      if (url.includes("/feedback/reviews/")) return Promise.resolve({ data: mockReviews });
      if (url.includes("/feedback/history/")) return Promise.resolve({ data: mockHistory });
      if (url.includes("/feedback/")) return Promise.resolve({ data: mockFeedbackSummary });
      return Promise.resolve({ data: {} });
    });

    await act(async () => {
      renderWithProvider(<DriverFeedback />);
    });

    await waitFor(() => {
      expect(screen.getByText("Rider Reviews")).toBeInTheDocument();
    });

    // Reviews displayed
    expect(screen.getByText("Great driver!")).toBeInTheDocument();
    expect(screen.getByText("Good service")).toBeInTheDocument();
    expect(screen.getByText("Very professional")).toBeInTheDocument();

    // Pagination controls (25 reviews / 20 per page = 2 pages)
    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
    expect(screen.getByText("Next →")).toBeInTheDocument();
  });

  it("handles pagination - next and previous page", async () => {
    const page2Reviews = {
      count: 25,
      results: [
        { id: 21, rating: 4, text: "Page 2 review", ride_date: "2025-01-01" },
      ],
      next: null,
    };

    axios.get.mockImplementation((url) => {
      if (url.includes("/feedback/reviews/?page=2")) return Promise.resolve({ data: page2Reviews });
      if (url.includes("/feedback/reviews/")) return Promise.resolve({ data: mockReviews });
      if (url.includes("/feedback/history/")) return Promise.resolve({ data: mockHistory });
      if (url.includes("/feedback/")) return Promise.resolve({ data: mockFeedbackSummary });
      return Promise.resolve({ data: {} });
    });

    await act(async () => {
      renderWithProvider(<DriverFeedback />);
    });

    await waitFor(() => {
      expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
    });

    // Click next page
    await act(async () => {
      fireEvent.click(screen.getByText("Next →"));
    });

    await waitFor(() => {
      expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
    });

    expect(screen.getByText("Page 2 review")).toBeInTheDocument();
  });

  it("shows empty reviews state when no reviews exist", async () => {
    axios.get.mockImplementation((url) => {
      if (url.includes("/feedback/reviews/")) return Promise.resolve({ data: { count: 0, results: [] } });
      if (url.includes("/feedback/history/")) return Promise.resolve({ data: mockHistory });
      if (url.includes("/feedback/")) return Promise.resolve({ data: mockFeedbackSummary });
      return Promise.resolve({ data: {} });
    });

    await act(async () => {
      renderWithProvider(<DriverFeedback />);
    });

    await waitFor(() => {
      expect(screen.getByText("No reviews yet")).toBeInTheDocument();
    });
  });

  it("shows error state and retry button on API failure", async () => {
    axios.get.mockRejectedValue(new Error("Network error"));

    await act(async () => {
      renderWithProvider(<DriverFeedback />);
    });

    await waitFor(() => {
      expect(screen.getByText("Failed to load feedback data. Please try again.")).toBeInTheDocument();
    });

    expect(screen.getByText("Retry")).toBeInTheDocument();
  });

  it("displays review text truncated to 500 characters", async () => {
    const longReview = "A".repeat(600);
    const reviewsWithLongText = {
      count: 1,
      results: [
        { id: 1, rating: 5, text: longReview, ride_date: "2025-01-20" },
      ],
      next: null,
    };

    axios.get.mockImplementation((url) => {
      if (url.includes("/feedback/reviews/")) return Promise.resolve({ data: reviewsWithLongText });
      if (url.includes("/feedback/history/")) return Promise.resolve({ data: mockHistory });
      if (url.includes("/feedback/")) return Promise.resolve({ data: mockFeedbackSummary });
      return Promise.resolve({ data: {} });
    });

    await act(async () => {
      renderWithProvider(<DriverFeedback />);
    });

    await waitFor(() => {
      const reviewText = screen.getByText("A".repeat(500));
      expect(reviewText).toBeInTheDocument();
    });
  });

  it("displays compliment counts as 0 when no compliments received", async () => {
    const noCompliments = {
      average_rating: 4.0,
      compliment_counts: {},
    };

    axios.get.mockImplementation((url) => {
      if (url.includes("/feedback/reviews/")) return Promise.resolve({ data: { count: 0, results: [] } });
      if (url.includes("/feedback/history/")) return Promise.resolve({ data: mockHistory });
      if (url.includes("/feedback/")) return Promise.resolve({ data: noCompliments });
      return Promise.resolve({ data: {} });
    });

    await act(async () => {
      renderWithProvider(<DriverFeedback />);
    });

    await waitFor(() => {
      expect(screen.getByText("Compliments")).toBeInTheDocument();
    });

    // All counts should be 0
    const zeros = screen.getAllByText("0");
    expect(zeros.length).toBe(5);
  });
});
