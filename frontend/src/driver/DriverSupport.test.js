import React from "react";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import DriverSupport, { EmergencySupportButton } from "./DriverSupport";

// ─── Mock axios ─────────────────────────────────────────────────────────────
jest.mock("axios");
const axios = require("axios");

// ─── Mock localStorage ──────────────────────────────────────────────────────
beforeEach(() => {
  Storage.prototype.getItem = jest.fn(() => "test-token");
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("DriverSupport", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    axios.get.mockResolvedValue({ data: [] });
    axios.post.mockResolvedValue({ data: { id: 1, status: "open" } });
  });

  it("renders the Support Center page with header", async () => {
    await act(async () => {
      render(<DriverSupport />);
    });

    expect(screen.getByText(/Support Center/)).toBeInTheDocument();
    expect(screen.getByText("Get help, chat with support, or report an emergency")).toBeInTheDocument();
  });

  it("renders all support tabs", async () => {
    await act(async () => {
      render(<DriverSupport />);
    });

    expect(screen.getByRole("tab", { name: /Help Center/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Contact/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Live Chat/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Safety/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /FAQ/ })).toBeInTheDocument();
  });

  // ─── Help Center ───────────────────────────────────────────────────────────

  it("displays Help Center with categorized articles by default", async () => {
    await act(async () => {
      render(<DriverSupport />);
    });

    expect(screen.getByText("Browse help articles by category")).toBeInTheDocument();
    expect(screen.getByText("Getting Started")).toBeInTheDocument();
    expect(screen.getByText("Rides & Navigation")).toBeInTheDocument();
    expect(screen.getByText("Earnings & Payments")).toBeInTheDocument();
    expect(screen.getByText("Account & Profile")).toBeInTheDocument();
    expect(screen.getByText("Vehicle & Documents")).toBeInTheDocument();
    expect(screen.getByText("Safety & Security")).toBeInTheDocument();
  });

  it("shows articles when a category is selected", async () => {
    await act(async () => {
      render(<DriverSupport />);
    });

    await act(async () => {
      fireEvent.click(screen.getByLabelText("View Getting Started articles"));
    });

    expect(screen.getByText("How to go online and start receiving rides")).toBeInTheDocument();
    expect(screen.getByText("Understanding the ride request process")).toBeInTheDocument();
    expect(screen.getByText("Setting up your driver profile")).toBeInTheDocument();
  });

  it("navigates back to categories from article list", async () => {
    await act(async () => {
      render(<DriverSupport />);
    });

    await act(async () => {
      fireEvent.click(screen.getByLabelText("View Getting Started articles"));
    });

    expect(screen.getByText("← Back to Categories")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByLabelText("Back to categories"));
    });

    expect(screen.getByText("Browse help articles by category")).toBeInTheDocument();
  });

  // ─── Contact Support Form ─────────────────────────────────────────────────

  it("renders Contact Support form with subject and message fields", async () => {
    await act(async () => {
      render(<DriverSupport />);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("tab", { name: /Contact/ }));
    });

    expect(screen.getByText("Send a message to our support team")).toBeInTheDocument();
    expect(screen.getByLabelText("Subject")).toBeInTheDocument();
    expect(screen.getByLabelText("Message")).toBeInTheDocument();
    expect(screen.getByText("Send Message")).toBeInTheDocument();
  });

  it("submits contact form successfully", async () => {
    axios.post.mockResolvedValue({ data: { id: 1 } });

    await act(async () => {
      render(<DriverSupport />);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("tab", { name: /Contact/ }));
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText("Subject"), {
        target: { value: "Test issue" },
      });
      fireEvent.change(screen.getByLabelText("Message"), {
        target: { value: "I need help with my account" },
      });
    });

    await act(async () => {
      fireEvent.submit(screen.getByText("Send Message").closest("form"));
    });

    await waitFor(() => {
      expect(screen.getByText(/Your message has been sent/)).toBeInTheDocument();
    });
  });

  it("shows error when contact form submission fails", async () => {
    axios.post.mockRejectedValue(new Error("Network error"));

    await act(async () => {
      render(<DriverSupport />);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("tab", { name: /Contact/ }));
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText("Subject"), {
        target: { value: "Test issue" },
      });
      fireEvent.change(screen.getByLabelText("Message"), {
        target: { value: "Help needed" },
      });
    });

    await act(async () => {
      fireEvent.submit(screen.getByText("Send Message").closest("form"));
    });

    await waitFor(() => {
      expect(screen.getByText(/Failed to send message/)).toBeInTheDocument();
    });
  });

  // ─── Live Chat ────────────────────────────────────────────────────────────

  it("renders Live Chat interface", async () => {
    await act(async () => {
      render(<DriverSupport />);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("tab", { name: /Live Chat/ }));
    });

    expect(screen.getByText("Connect with a support agent in real time")).toBeInTheDocument();
    expect(screen.getByLabelText("Start live chat with support agent")).toBeInTheDocument();
  });

  it("shows queue confirmation after initiating live chat", async () => {
    axios.post.mockResolvedValue({ data: { id: 1, status: "open" } });

    await act(async () => {
      render(<DriverSupport />);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("tab", { name: /Live Chat/ }));
    });

    await act(async () => {
      fireEvent.click(screen.getByLabelText("Start live chat with support agent"));
    });

    await waitFor(() => {
      expect(screen.getByText("Request Queued")).toBeInTheDocument();
      expect(
        screen.getByText(/Your chat request has been queued/)
      ).toBeInTheDocument();
    });
  });

  it("shows error when live chat initiation fails", async () => {
    axios.post.mockRejectedValue(new Error("Server error"));

    await act(async () => {
      render(<DriverSupport />);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("tab", { name: /Live Chat/ }));
    });

    await act(async () => {
      fireEvent.click(screen.getByLabelText("Start live chat with support agent"));
    });

    await waitFor(() => {
      expect(screen.getByText(/Failed to initiate chat/)).toBeInTheDocument();
    });
  });

  // ─── FAQ ──────────────────────────────────────────────────────────────────

  it("renders FAQ tab with search input", async () => {
    await act(async () => {
      render(<DriverSupport />);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("tab", { name: /FAQ/ }));
    });

    expect(screen.getByText("Find answers to common questions")).toBeInTheDocument();
    expect(screen.getByLabelText("Search FAQ articles")).toBeInTheDocument();
  });

  it("displays FAQ articles organized by category when no search", async () => {
    axios.get.mockResolvedValue({ data: [] });

    await act(async () => {
      render(<DriverSupport />);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("tab", { name: /FAQ/ }));
    });

    await waitFor(() => {
      // Category-organized FAQ should show categories
      expect(screen.getByText("🚀 Getting Started")).toBeInTheDocument();
      expect(screen.getByText("🗺️ Rides & Navigation")).toBeInTheDocument();
    });
  });

  it("performs keyword search on FAQ", async () => {
    const searchResults = [
      { id: 1, title: "How to earn more", summary: "Tips for maximizing earnings" },
    ];
    axios.get.mockResolvedValue({ data: { results: searchResults } });

    await act(async () => {
      render(<DriverSupport />);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("tab", { name: /FAQ/ }));
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText("Search FAQ articles"), {
        target: { value: "earnings" },
      });
    });

    // Advance debounce timer
    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining("/drivers/me/support/faq/?search=earnings"),
        expect.any(Object)
      );
    });
  });

  it("shows empty state when FAQ search returns no results", async () => {
    axios.get.mockResolvedValue({ data: { results: [] } });

    await act(async () => {
      render(<DriverSupport />);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("tab", { name: /FAQ/ }));
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText("Search FAQ articles"), {
        target: { value: "nonexistent" },
      });
    });

    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(screen.getByText(/No results found/)).toBeInTheDocument();
    });
  });

  // ─── Safety Center ────────────────────────────────────────────────────────

  it("renders Safety Center with emergency info and resources", async () => {
    await act(async () => {
      render(<DriverSupport />);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("tab", { name: /Safety/ }));
    });

    expect(screen.getByText("Need Immediate Help?")).toBeInTheDocument();
    expect(screen.getByText("Safety Resources")).toBeInTheDocument();
    expect(screen.getByText("Emergency Support Button")).toBeInTheDocument();
    expect(screen.getByText("Report a Safety Incident")).toBeInTheDocument();
  });

  // ─── Emergency Support Button ─────────────────────────────────────────────

  it("renders persistent Emergency Support button", async () => {
    await act(async () => {
      render(<DriverSupport />);
    });

    const emergencyBtn = screen.getByLabelText("Emergency Support");
    expect(emergencyBtn).toBeInTheDocument();
    expect(emergencyBtn).toHaveStyle({ position: "fixed" });
  });
});

describe("EmergencySupportButton", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Storage.prototype.getItem = jest.fn(() => "test-token");
    axios.post.mockResolvedValue({ data: { id: 1 } });
  });

  it("renders as a fixed-position button with emergency label", () => {
    render(<EmergencySupportButton />);

    const btn = screen.getByLabelText("Emergency Support");
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveStyle({ position: "fixed", zIndex: 9999 });
  });

  it("sends emergency with GPS location when available", async () => {
    // Mock geolocation
    const mockPosition = {
      coords: { latitude: 18.0735, longitude: -15.9582 },
    };
    const mockGeolocation = {
      watchPosition: jest.fn((success) => {
        success(mockPosition);
        return 1;
      }),
      getCurrentPosition: jest.fn((success) => success(mockPosition)),
      clearWatch: jest.fn(),
    };
    Object.defineProperty(navigator, "geolocation", {
      value: mockGeolocation,
      writable: true,
    });

    axios.post.mockResolvedValue({ data: { id: 1 } });

    await act(async () => {
      render(<EmergencySupportButton />);
    });

    await act(async () => {
      fireEvent.click(screen.getByLabelText("Emergency Support"));
    });

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining("/drivers/me/support/emergency/"),
        expect.objectContaining({
          latitude: 18.0735,
          longitude: -15.9582,
          location_fallback: false,
        }),
        expect.any(Object)
      );
    });

    expect(
      screen.getByText("Emergency alert sent. Support team has your location.")
    ).toBeInTheDocument();
  });

  it("falls back to last known location with warning when GPS unavailable", async () => {
    // Mock geolocation that provides initial position but fails on getCurrentPosition
    const mockPosition = {
      coords: { latitude: 18.0735, longitude: -15.9582 },
    };
    const mockGeolocation = {
      watchPosition: jest.fn((success) => {
        success(mockPosition);
        return 1;
      }),
      getCurrentPosition: jest.fn((_, error) => {
        error(new Error("GPS unavailable"));
      }),
      clearWatch: jest.fn(),
    };
    Object.defineProperty(navigator, "geolocation", {
      value: mockGeolocation,
      writable: true,
    });

    axios.post.mockResolvedValue({ data: { id: 1 } });

    await act(async () => {
      render(<EmergencySupportButton />);
    });

    await act(async () => {
      fireEvent.click(screen.getByLabelText("Emergency Support"));
    });

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining("/drivers/me/support/emergency/"),
        expect.objectContaining({
          latitude: 18.0735,
          longitude: -15.9582,
          location_fallback: true,
        }),
        expect.any(Object)
      );
    });

    expect(
      screen.getByText(/Location shared may not be current/)
    ).toBeInTheDocument();
  });

  it("shows error message when emergency API call fails", async () => {
    const mockGeolocation = {
      watchPosition: jest.fn(() => 1),
      getCurrentPosition: jest.fn((success) =>
        success({ coords: { latitude: 18.0, longitude: -15.9 } })
      ),
      clearWatch: jest.fn(),
    };
    Object.defineProperty(navigator, "geolocation", {
      value: mockGeolocation,
      writable: true,
    });

    axios.post.mockRejectedValue(new Error("Network error"));

    await act(async () => {
      render(<EmergencySupportButton />);
    });

    await act(async () => {
      fireEvent.click(screen.getByLabelText("Emergency Support"));
    });

    await waitFor(() => {
      expect(
        screen.getByText(/Failed to send emergency alert/)
      ).toBeInTheDocument();
    });
  });

  it("disables button while emergency is being activated", async () => {
    const mockGeolocation = {
      watchPosition: jest.fn(() => 1),
      getCurrentPosition: jest.fn(() => {}), // never resolves
      clearWatch: jest.fn(),
    };
    Object.defineProperty(navigator, "geolocation", {
      value: mockGeolocation,
      writable: true,
    });

    await act(async () => {
      render(<EmergencySupportButton />);
    });

    const btn = screen.getByLabelText("Emergency Support");

    await act(async () => {
      fireEvent.click(btn);
    });

    expect(btn).toBeDisabled();
    expect(btn).toHaveTextContent("...");
  });
});
