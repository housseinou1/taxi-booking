import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import RideDashboard from "./RideDashboard";

jest.mock("../RideStatusButtons", () => {
  const ReactLocal = require("react");
  return function MockRideStatusButtons() {
    return ReactLocal.createElement(
      "div",
      { "data-testid": "ride-status-buttons" },
      "Ride status actions"
    );
  };
});

const baseCompletedRide = {
  id: 8842,
  status: "completed",
  payment_status: "pending_verification",
  fare: 1200,
  payment_tip_amount: 150,
  app_fee: 120,
  rider_name: "Aicha Sidi",
  rider_phone: "+222 45 67 89 00",
  pickup: "Tevragh Zeina",
  destination: "Nouakchott Airport",
};

const baseActiveRideWithStops = {
  id: 5541,
  status: "in_progress",
  fare: 900,
  app_fee: 90,
  payment_tip_amount: 0,
  rider_name: "Mariam",
  pickup: "Ksar",
  destination: "Port de Peche",
  stops: [
    {
      stop_order: 1,
      location_name: "Stop One",
      latitude: 18.11,
      longitude: -15.95,
      arrived_at: "2026-06-01T10:00:00Z",
      departed_at: "2026-06-01T10:04:00Z",
    },
    {
      stop_order: 2,
      location_name: "Stop Two",
      latitude: 18.12,
      longitude: -15.96,
      arrived_at: null,
      departed_at: null,
    },
  ],
};

describe("RideDashboard receipt actions", () => {
  const renderDashboard = (rides) =>
    render(
      React.createElement(RideDashboard, {
        rides,
        availableRides: [],
        isOnline: true,
        fetchRides: jest.fn(),
      })
    );

  const originalShare = navigator.share;
  const originalClipboard = navigator.clipboard;
  const originalOpen = window.open;

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.setItem("access", "test-token");
    Object.defineProperty(navigator, "share", {
      value: undefined,
      configurable: true,
    });
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: jest.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
    window.open = jest.fn();
  });

  afterEach(() => {
    localStorage.clear();
    Object.defineProperty(navigator, "share", {
      value: originalShare,
      configurable: true,
    });
    Object.defineProperty(navigator, "clipboard", {
      value: originalClipboard,
      configurable: true,
    });
    window.open = originalOpen;
  });

  it("shows print and share actions for completed rides", () => {
    renderDashboard([baseCompletedRide]);

    expect(screen.getByText("Needs Action")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Print receipt" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Share with rider" })).toBeInTheDocument();
  });

  it("prints a driver receipt when print is clicked", () => {
    const printDocument = {
      open: jest.fn(),
      write: jest.fn(),
      close: jest.fn(),
    };
    const printWindow = {
      document: printDocument,
      focus: jest.fn(),
      print: jest.fn(),
    };
    const frame = {
      style: {},
      contentWindow: printWindow,
      remove: jest.fn(),
    };

    renderDashboard([baseCompletedRide]);

    const appendSpy = jest
      .spyOn(document.body, "appendChild")
      .mockImplementation((node) => node);
    const originalCreateElement = document.createElement.bind(document);
    const createSpy = jest.spyOn(document, "createElement");

    createSpy.mockImplementation((tagName) => {
      if (tagName === "iframe") {
        return frame;
      }
      return originalCreateElement(tagName);
    });

    jest.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Print receipt" }));
    jest.runOnlyPendingTimers();
    jest.useRealTimers();

    expect(printDocument.write).toHaveBeenCalled();
    expect(printWindow.print).toHaveBeenCalled();

    appendSpy.mockRestore();
    createSpy.mockRestore();
  });

  it("copies and opens WhatsApp when native share is unavailable", async () => {
    renderDashboard([baseCompletedRide]);
    fireEvent.click(screen.getByRole("button", { name: "Share with rider" }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalled();
      expect(window.open).toHaveBeenCalledWith(
        expect.stringContaining("https://wa.me/22245678900?text="),
        "_blank",
        "noopener,noreferrer"
      );
    });

    expect(
      await screen.findByText("Receipt copied and WhatsApp opened for rider sharing.")
    ).toBeInTheDocument();
  });

  it("uses native share when navigator.share is available", async () => {
    const shareMock = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", {
      value: shareMock,
      configurable: true,
    });

    renderDashboard([baseCompletedRide]);
    fireEvent.click(screen.getByRole("button", { name: "Share with rider" }));

    await waitFor(() => {
      expect(shareMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Yala Receipt #8842",
          text: expect.stringContaining("Yala Ride Receipt #8842"),
        })
      );
    });

    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
    expect(window.open).not.toHaveBeenCalled();
    expect(await screen.findByText("Receipt shared successfully.")).toBeInTheDocument();
  });

  it("navigates driver to next pending stop", () => {
    renderDashboard([baseActiveRideWithStops]);

    const navigateButton = screen.getByLabelText("Navigate to Stop Two");
    fireEvent.click(navigateButton);

    expect(window.open).toHaveBeenCalledWith(
      expect.stringContaining("destination=18.12%2C-15.96"),
      "_blank",
      "noopener,noreferrer"
    );
  });
});
