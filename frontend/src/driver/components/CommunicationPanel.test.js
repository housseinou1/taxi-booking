import React from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import CommunicationPanel, {
  isCommunicationVisible,
  validateChatMessage,
  getNavDestination,
} from "./CommunicationPanel";
import { DriverProvider } from "../context/DriverContext";

// ─── Helper: render with DriverProvider ─────────────────────────────────────
function renderWithProvider(ui, { initialValues = {} } = {}) {
  return render(
    <DriverProvider initialValues={initialValues}>{ui}</DriverProvider>
  );
}

// ─── Unit Tests for isCommunicationVisible ──────────────────────────────────

describe("isCommunicationVisible", () => {
  it("returns true for driver_arriving status", () => {
    expect(isCommunicationVisible("driver_arriving")).toBe(true);
  });

  it("returns true for driver_arrived status", () => {
    expect(isCommunicationVisible("driver_arrived")).toBe(true);
  });

  it("returns false for in_progress status", () => {
    expect(isCommunicationVisible("in_progress")).toBe(false);
  });

  it("returns false for requested status", () => {
    expect(isCommunicationVisible("requested")).toBe(false);
  });

  it("returns false for completed status", () => {
    expect(isCommunicationVisible("completed")).toBe(false);
  });

  it("returns false for cancelled status", () => {
    expect(isCommunicationVisible("cancelled")).toBe(false);
  });

  it("returns false for null", () => {
    expect(isCommunicationVisible(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isCommunicationVisible(undefined)).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isCommunicationVisible("")).toBe(false);
  });
});

// ─── Unit Tests for validateChatMessage ─────────────────────────────────────

describe("validateChatMessage", () => {
  it("returns valid for a normal message", () => {
    const result = validateChatMessage("Hello rider!");
    expect(result.isValid).toBe(true);
    expect(result.remaining).toBe(488);
  });

  it("returns remaining as 500 for empty string", () => {
    const result = validateChatMessage("");
    expect(result.isValid).toBe(false);
    expect(result.remaining).toBe(500);
  });

  it("returns valid for exactly 500 characters", () => {
    const msg = "a".repeat(500);
    const result = validateChatMessage(msg);
    expect(result.isValid).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it("returns invalid for 501 characters", () => {
    const msg = "a".repeat(501);
    const result = validateChatMessage(msg);
    expect(result.isValid).toBe(false);
    expect(result.remaining).toBe(-1);
  });

  it("returns remaining correctly for 1 character", () => {
    const result = validateChatMessage("x");
    expect(result.isValid).toBe(true);
    expect(result.remaining).toBe(499);
  });

  it("handles non-string input gracefully", () => {
    const result = validateChatMessage(null);
    expect(result.isValid).toBe(false);
    expect(result.remaining).toBe(500);
  });
});

// ─── Unit Tests for getNavDestination ───────────────────────────────────────

describe("getNavDestination", () => {
  it("returns pickup location for driver_arriving status", () => {
    const ride = {
      status: "driver_arriving",
      pickup_latitude: 18.0735,
      pickup_longitude: -15.9582,
      pickup_location: "Airport",
    };
    const result = getNavDestination(ride);
    expect(result).toEqual({
      type: "pickup",
      location: {
        latitude: 18.0735,
        longitude: -15.9582,
        name: "Airport",
      },
    });
  });

  it("returns pickup location for driver_arrived status", () => {
    const ride = {
      status: "driver_arrived",
      pickup_latitude: 18.0735,
      pickup_longitude: -15.9582,
      pickup_location: "Mall",
    };
    const result = getNavDestination(ride);
    expect(result).toEqual({
      type: "pickup",
      location: {
        latitude: 18.0735,
        longitude: -15.9582,
        name: "Mall",
      },
    });
  });

  it("returns drop-off location for in_progress status without stops", () => {
    const ride = {
      status: "in_progress",
      destination_latitude: 18.1,
      destination_longitude: -15.9,
      destination_location: "Hotel",
    };
    const result = getNavDestination(ride);
    expect(result).toEqual({
      type: "dropoff",
      location: {
        latitude: 18.1,
        longitude: -15.9,
        name: "Hotel",
      },
    });
  });

  it("returns next pending stop for in_progress with multi-stops", () => {
    const ride = {
      status: "in_progress",
      stops: [
        {
          stop_order: 1,
          location_name: "Stop A",
          latitude: 18.05,
          longitude: -15.95,
          arrived_at: "2024-01-01T10:00:00Z",
          departed_at: "2024-01-01T10:05:00Z",
        },
        {
          stop_order: 2,
          location_name: "Stop B",
          latitude: 18.06,
          longitude: -15.96,
          arrived_at: null,
          departed_at: null,
        },
      ],
      destination_latitude: 18.1,
      destination_longitude: -15.9,
      destination_location: "Hotel",
    };
    const result = getNavDestination(ride);
    expect(result).toEqual({
      type: "stop",
      location: {
        latitude: 18.06,
        longitude: -15.96,
        name: "Stop B",
      },
    });
  });

  it("returns drop-off when all stops are departed", () => {
    const ride = {
      status: "in_progress",
      stops: [
        {
          stop_order: 1,
          location_name: "Stop A",
          latitude: 18.05,
          longitude: -15.95,
          arrived_at: "2024-01-01T10:00:00Z",
          departed_at: "2024-01-01T10:05:00Z",
        },
      ],
      destination_latitude: 18.1,
      destination_longitude: -15.9,
      destination_location: "Hotel",
    };
    const result = getNavDestination(ride);
    expect(result).toEqual({
      type: "dropoff",
      location: {
        latitude: 18.1,
        longitude: -15.9,
        name: "Hotel",
      },
    });
  });

  it("returns null for completed status", () => {
    const ride = { status: "completed" };
    expect(getNavDestination(ride)).toBeNull();
  });

  it("returns null for null ride", () => {
    expect(getNavDestination(null)).toBeNull();
  });

  it("returns null for ride without status", () => {
    expect(getNavDestination({})).toBeNull();
  });
});

// ─── Component Tests ────────────────────────────────────────────────────────

describe("CommunicationPanel", () => {
  const mockSendMessage = jest.fn(() => true);

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("renders nothing when no active ride", () => {
    const { container } = renderWithProvider(
      <CommunicationPanel sendMessage={mockSendMessage} />,
      { initialValues: { activeRide: null } }
    );
    // The Emergency Support button is always visible (Req 10.2),
    // but no communication controls should be shown
    expect(screen.queryByLabelText("Call Rider")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Chat Rider")).not.toBeInTheDocument();
  });

  it("renders nothing for completed ride", () => {
    const { container } = renderWithProvider(
      <CommunicationPanel sendMessage={mockSendMessage} />,
      { initialValues: { activeRide: { id: 1, status: "completed" } } }
    );
    // The Emergency Support button is always visible (Req 10.2),
    // but no communication controls should be shown
    expect(screen.queryByLabelText("Call Rider")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Chat Rider")).not.toBeInTheDocument();
  });

  it("shows Call Rider and Chat Rider buttons during driver_arriving", () => {
    renderWithProvider(
      <CommunicationPanel sendMessage={mockSendMessage} />,
      {
        initialValues: {
          activeRide: {
            id: 1,
            status: "driver_arriving",
            pickup_latitude: 18.07,
            pickup_longitude: -15.95,
          },
        },
      }
    );

    expect(screen.getByLabelText("Call Rider")).toBeInTheDocument();
    expect(screen.getByLabelText("Chat Rider")).toBeInTheDocument();
  });

  it("shows Call Rider and Chat Rider buttons during driver_arrived", () => {
    renderWithProvider(
      <CommunicationPanel sendMessage={mockSendMessage} />,
      {
        initialValues: {
          activeRide: {
            id: 1,
            status: "driver_arrived",
            pickup_latitude: 18.07,
            pickup_longitude: -15.95,
          },
        },
      }
    );

    expect(screen.getByLabelText("Call Rider")).toBeInTheDocument();
    expect(screen.getByLabelText("Chat Rider")).toBeInTheDocument();
  });

  it("does not show Call/Chat buttons during in_progress", () => {
    renderWithProvider(
      <CommunicationPanel sendMessage={mockSendMessage} />,
      {
        initialValues: {
          activeRide: {
            id: 1,
            status: "in_progress",
            destination_latitude: 18.1,
            destination_longitude: -15.9,
          },
        },
      }
    );

    expect(screen.queryByLabelText("Call Rider")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Chat Rider")).not.toBeInTheDocument();
  });

  it("shows Navigation button with pickup label during driver_arriving", () => {
    renderWithProvider(
      <CommunicationPanel sendMessage={mockSendMessage} />,
      {
        initialValues: {
          activeRide: {
            id: 1,
            status: "driver_arriving",
            pickup_latitude: 18.07,
            pickup_longitude: -15.95,
            pickup_location: "Airport",
          },
        },
      }
    );

    expect(screen.getByLabelText("Navigate to Pickup")).toBeInTheDocument();
  });

  it("shows Navigation button with drop-off label during in_progress", () => {
    renderWithProvider(
      <CommunicationPanel sendMessage={mockSendMessage} />,
      {
        initialValues: {
          activeRide: {
            id: 1,
            status: "in_progress",
            destination_latitude: 18.1,
            destination_longitude: -15.9,
            destination_location: "Hotel",
          },
        },
      }
    );

    expect(screen.getByLabelText("Navigate to Drop-off")).toBeInTheDocument();
  });

  it("opens chat interface when Chat Rider is clicked", () => {
    renderWithProvider(
      <CommunicationPanel sendMessage={mockSendMessage} />,
      {
        initialValues: {
          activeRide: {
            id: 1,
            status: "driver_arriving",
            pickup_latitude: 18.07,
            pickup_longitude: -15.95,
          },
        },
      }
    );

    fireEvent.click(screen.getByLabelText("Chat Rider"));
    expect(screen.getByLabelText("Chat interface")).toBeInTheDocument();
    expect(screen.getByLabelText("Chat message input")).toBeInTheDocument();
  });

  it("displays remaining character count", () => {
    renderWithProvider(
      <CommunicationPanel sendMessage={mockSendMessage} />,
      {
        initialValues: {
          activeRide: {
            id: 1,
            status: "driver_arriving",
            pickup_latitude: 18.07,
            pickup_longitude: -15.95,
          },
        },
      }
    );

    fireEvent.click(screen.getByLabelText("Chat Rider"));

    // Initially 500 remaining
    expect(screen.getByLabelText("500 characters remaining")).toBeInTheDocument();

    // Type a message
    fireEvent.change(screen.getByLabelText("Chat message input"), {
      target: { value: "Hello" },
    });

    expect(screen.getByLabelText("495 characters remaining")).toBeInTheDocument();
  });

  it("enforces 500-character limit on input", () => {
    renderWithProvider(
      <CommunicationPanel sendMessage={mockSendMessage} />,
      {
        initialValues: {
          activeRide: {
            id: 1,
            status: "driver_arriving",
            pickup_latitude: 18.07,
            pickup_longitude: -15.95,
          },
        },
      }
    );

    fireEvent.click(screen.getByLabelText("Chat Rider"));

    const input = screen.getByLabelText("Chat message input");
    const longMessage = "a".repeat(501);
    fireEvent.change(input, { target: { value: longMessage } });

    // Input should not accept more than 500 characters
    expect(input.value).toBe("");
  });

  it("sends message via WebSocket when Send is clicked", () => {
    renderWithProvider(
      <CommunicationPanel sendMessage={mockSendMessage} />,
      {
        initialValues: {
          activeRide: {
            id: 1,
            status: "driver_arriving",
            pickup_latitude: 18.07,
            pickup_longitude: -15.95,
          },
        },
      }
    );

    fireEvent.click(screen.getByLabelText("Chat Rider"));
    fireEvent.change(screen.getByLabelText("Chat message input"), {
      target: { value: "On my way!" },
    });
    fireEvent.click(screen.getByLabelText("Send message"));

    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "chat_message",
        ride_id: 1,
        text: "On my way!",
      })
    );
  });

  it("shows delivery failure after 5 seconds", async () => {
    renderWithProvider(
      <CommunicationPanel sendMessage={mockSendMessage} />,
      {
        initialValues: {
          activeRide: {
            id: 1,
            status: "driver_arriving",
            pickup_latitude: 18.07,
            pickup_longitude: -15.95,
          },
        },
      }
    );

    fireEvent.click(screen.getByLabelText("Chat Rider"));
    fireEvent.change(screen.getByLabelText("Chat message input"), {
      target: { value: "Hello" },
    });
    fireEvent.click(screen.getByLabelText("Send message"));

    // Advance fake timers by 5 seconds to trigger the delivery timeout
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });

    // After 5 seconds, shows failure indicator with retry button
    expect(screen.getByLabelText("Delivery failed")).toBeInTheDocument();
    expect(screen.getByLabelText("Retry sending message")).toBeInTheDocument();
  });

  it("shows immediate failure when sendMessage returns false", () => {
    const failingSendMessage = jest.fn(() => false);

    renderWithProvider(
      <CommunicationPanel sendMessage={failingSendMessage} />,
      {
        initialValues: {
          activeRide: {
            id: 1,
            status: "driver_arriving",
            pickup_latitude: 18.07,
            pickup_longitude: -15.95,
          },
        },
      }
    );

    fireEvent.click(screen.getByLabelText("Chat Rider"));
    fireEvent.change(screen.getByLabelText("Chat message input"), {
      target: { value: "Hello" },
    });

    act(() => {
      fireEvent.click(screen.getByLabelText("Send message"));
    });

    // Should immediately show failure
    expect(screen.getByLabelText("Delivery failed")).toBeInTheDocument();
  });

  it("retries sending a failed message", async () => {
    renderWithProvider(
      <CommunicationPanel sendMessage={mockSendMessage} />,
      {
        initialValues: {
          activeRide: {
            id: 1,
            status: "driver_arriving",
            pickup_latitude: 18.07,
            pickup_longitude: -15.95,
          },
        },
      }
    );

    fireEvent.click(screen.getByLabelText("Chat Rider"));
    fireEvent.change(screen.getByLabelText("Chat message input"), {
      target: { value: "Hello" },
    });
    fireEvent.click(screen.getByLabelText("Send message"));

    // Wait for failure
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });

    // Click retry
    mockSendMessage.mockClear();
    fireEvent.click(screen.getByLabelText("Retry sending message"));

    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "chat_message",
        text: "Hello",
      })
    );
  });

  it("opens navigation app when Navigation button is clicked", () => {
    const mockOpen = jest.fn();
    window.open = mockOpen;

    renderWithProvider(
      <CommunicationPanel sendMessage={mockSendMessage} />,
      {
        initialValues: {
          activeRide: {
            id: 1,
            status: "driver_arriving",
            pickup_latitude: 18.07,
            pickup_longitude: -15.95,
          },
        },
      }
    );

    fireEvent.click(screen.getByLabelText("Navigate to Pickup"));

    expect(mockOpen).toHaveBeenCalledWith(
      "https://www.google.com/maps/dir/?api=1&destination=18.07,-15.95",
      "_blank"
    );
  });

  it("calls onNavigate callback when provided", () => {
    const onNavigate = jest.fn();

    renderWithProvider(
      <CommunicationPanel
        sendMessage={mockSendMessage}
        onNavigate={onNavigate}
      />,
      {
        initialValues: {
          activeRide: {
            id: 1,
            status: "in_progress",
            destination_latitude: 18.1,
            destination_longitude: -15.9,
            destination_location: "Hotel",
          },
        },
      }
    );

    fireEvent.click(screen.getByLabelText("Navigate to Drop-off"));

    expect(onNavigate).toHaveBeenCalledWith({
      type: "dropoff",
      location: {
        latitude: 18.1,
        longitude: -15.9,
        name: "Hotel",
      },
    });
  });

  it("navigates to next stop for multi-stop ride in progress", () => {
    const onNavigate = jest.fn();

    renderWithProvider(
      <CommunicationPanel
        sendMessage={mockSendMessage}
        onNavigate={onNavigate}
      />,
      {
        initialValues: {
          activeRide: {
            id: 1,
            status: "in_progress",
            stops: [
              {
                stop_order: 1,
                location_name: "Stop A",
                latitude: 18.05,
                longitude: -15.95,
                arrived_at: null,
                departed_at: null,
              },
            ],
            destination_latitude: 18.1,
            destination_longitude: -15.9,
          },
        },
      }
    );

    fireEvent.click(screen.getByLabelText("Navigate to Stop A"));

    expect(onNavigate).toHaveBeenCalledWith({
      type: "stop",
      location: {
        latitude: 18.05,
        longitude: -15.95,
        name: "Stop A",
      },
    });
  });

  it("calls onCall callback when Call Rider is clicked", () => {
    const onCall = jest.fn();

    renderWithProvider(
      <CommunicationPanel
        sendMessage={mockSendMessage}
        onCall={onCall}
      />,
      {
        initialValues: {
          activeRide: {
            id: 1,
            status: "driver_arriving",
            pickup_latitude: 18.07,
            pickup_longitude: -15.95,
            rider_phone: "+22212345678",
          },
        },
      }
    );

    fireEvent.click(screen.getByLabelText("Call Rider"));

    expect(onCall).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, rider_phone: "+22212345678" })
    );
  });

  it("clears input after sending a message", () => {
    renderWithProvider(
      <CommunicationPanel sendMessage={mockSendMessage} />,
      {
        initialValues: {
          activeRide: {
            id: 1,
            status: "driver_arriving",
            pickup_latitude: 18.07,
            pickup_longitude: -15.95,
          },
        },
      }
    );

    fireEvent.click(screen.getByLabelText("Chat Rider"));
    const input = screen.getByLabelText("Chat message input");
    fireEvent.change(input, { target: { value: "Hello" } });
    fireEvent.click(screen.getByLabelText("Send message"));

    expect(input.value).toBe("");
  });

  it("sends message on Enter key press", () => {
    renderWithProvider(
      <CommunicationPanel sendMessage={mockSendMessage} />,
      {
        initialValues: {
          activeRide: {
            id: 1,
            status: "driver_arriving",
            pickup_latitude: 18.07,
            pickup_longitude: -15.95,
          },
        },
      }
    );

    fireEvent.click(screen.getByLabelText("Chat Rider"));
    const input = screen.getByLabelText("Chat message input");
    fireEvent.change(input, { target: { value: "Hello" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "chat_message",
        text: "Hello",
      })
    );
  });

  it("does not send empty message", () => {
    renderWithProvider(
      <CommunicationPanel sendMessage={mockSendMessage} />,
      {
        initialValues: {
          activeRide: {
            id: 1,
            status: "driver_arriving",
            pickup_latitude: 18.07,
            pickup_longitude: -15.95,
          },
        },
      }
    );

    fireEvent.click(screen.getByLabelText("Chat Rider"));
    fireEvent.click(screen.getByLabelText("Send message"));

    expect(mockSendMessage).not.toHaveBeenCalled();
  });
});
