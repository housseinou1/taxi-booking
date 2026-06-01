import { renderHook, act } from "@testing-library/react";
import useDriverWebSocket, { calculateBackoffDelay } from "./useDriverWebSocket";

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  constructor(url) {
    this.url = url;
    this.readyState = MockWebSocket.CONNECTING;
    this.onopen = null;
    this.onclose = null;
    this.onerror = null;
    this.onmessage = null;
    this.sentMessages = [];
    MockWebSocket.instances.push(this);
  }

  send(data) {
    this.sentMessages.push(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) this.onclose();
  }

  // Test helpers
  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    if (this.onopen) this.onopen();
  }

  simulateMessage(data) {
    if (this.onmessage) {
      this.onmessage({ data: JSON.stringify(data) });
    }
  }

  simulateClose() {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) this.onclose();
  }

  simulateError() {
    if (this.onerror) this.onerror();
  }
}

MockWebSocket.instances = [];

describe("calculateBackoffDelay", () => {
  it("returns 1000ms for attempt 0", () => {
    expect(calculateBackoffDelay(0)).toBe(1000);
  });

  it("returns 2000ms for attempt 1", () => {
    expect(calculateBackoffDelay(1)).toBe(2000);
  });

  it("returns 4000ms for attempt 2", () => {
    expect(calculateBackoffDelay(2)).toBe(4000);
  });

  it("returns 8000ms for attempt 3", () => {
    expect(calculateBackoffDelay(3)).toBe(8000);
  });

  it("returns 16000ms for attempt 4", () => {
    expect(calculateBackoffDelay(4)).toBe(16000);
  });

  it("caps at 16000ms for attempts beyond 4", () => {
    expect(calculateBackoffDelay(5)).toBe(16000);
    expect(calculateBackoffDelay(10)).toBe(16000);
    expect(calculateBackoffDelay(100)).toBe(16000);
  });
});

describe("useDriverWebSocket", () => {
  let originalWebSocket;

  beforeEach(() => {
    jest.useFakeTimers();
    MockWebSocket.instances = [];
    originalWebSocket = global.WebSocket;
    global.WebSocket = MockWebSocket;
    global.WebSocket.OPEN = MockWebSocket.OPEN;
    global.WebSocket.CONNECTING = MockWebSocket.CONNECTING;
    global.WebSocket.CLOSED = MockWebSocket.CLOSED;
    global.WebSocket.CLOSING = MockWebSocket.CLOSING;
  });

  afterEach(() => {
    jest.useRealTimers();
    global.WebSocket = originalWebSocket;
  });

  it("does not connect when offline", () => {
    renderHook(() =>
      useDriverWebSocket({ isOnline: false, onMessage: jest.fn() })
    );

    expect(MockWebSocket.instances).toHaveLength(0);
  });

  it("connects when online", () => {
    renderHook(() =>
      useDriverWebSocket({ isOnline: true, onMessage: jest.fn() })
    );

    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it("reports isConnected true after WebSocket opens", () => {
    const { result } = renderHook(() =>
      useDriverWebSocket({ isOnline: true, onMessage: jest.fn() })
    );

    expect(result.current.isConnected).toBe(false);

    act(() => {
      MockWebSocket.instances[0].simulateOpen();
    });

    expect(result.current.isConnected).toBe(true);
  });

  it("dispatches messages to onMessage callback", () => {
    const onMessage = jest.fn();
    renderHook(() =>
      useDriverWebSocket({ isOnline: true, onMessage })
    );

    act(() => {
      MockWebSocket.instances[0].simulateOpen();
    });

    act(() => {
      MockWebSocket.instances[0].simulateMessage({
        type: "ride_request",
        ride_id: 123,
      });
    });

    expect(onMessage).toHaveBeenCalledWith({
      type: "ride_request",
      ride_id: 123,
    });
  });

  it("sends messages when connected", () => {
    const { result } = renderHook(() =>
      useDriverWebSocket({ isOnline: true, onMessage: jest.fn() })
    );

    act(() => {
      MockWebSocket.instances[0].simulateOpen();
    });

    let sent;
    act(() => {
      sent = result.current.sendMessage({ type: "location_update", lat: 18.07, lng: -15.95 });
    });

    expect(sent).toBe(true);
    expect(MockWebSocket.instances[0].sentMessages).toHaveLength(1);
    expect(JSON.parse(MockWebSocket.instances[0].sentMessages[0])).toEqual({
      type: "location_update",
      lat: 18.07,
      lng: -15.95,
    });
  });

  it("returns false when sending while disconnected", () => {
    const { result } = renderHook(() =>
      useDriverWebSocket({ isOnline: true, onMessage: jest.fn() })
    );

    let sent;
    act(() => {
      sent = result.current.sendMessage({ type: "location_update" });
    });

    expect(sent).toBe(false);
  });

  it("disconnects when going offline", () => {
    const { rerender } = renderHook(
      ({ isOnline }) =>
        useDriverWebSocket({ isOnline, onMessage: jest.fn() }),
      { initialProps: { isOnline: true } }
    );

    act(() => {
      MockWebSocket.instances[0].simulateOpen();
    });

    rerender({ isOnline: false });

    // WebSocket should be closed
    expect(MockWebSocket.instances[0].readyState).toBe(MockWebSocket.CLOSED);
  });

  it("attempts reconnection with exponential backoff on close", () => {
    renderHook(() =>
      useDriverWebSocket({ isOnline: true, onMessage: jest.fn() })
    );

    act(() => {
      MockWebSocket.instances[0].simulateOpen();
    });

    // Simulate disconnect
    act(() => {
      MockWebSocket.instances[0].simulateClose();
    });

    expect(MockWebSocket.instances).toHaveLength(1);

    // After 1s (first backoff), should reconnect
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(MockWebSocket.instances).toHaveLength(2);
  });

  it("shows connection error after 30 seconds of failed reconnection", () => {
    const { result } = renderHook(() =>
      useDriverWebSocket({ isOnline: true, onMessage: jest.fn() })
    );

    act(() => {
      MockWebSocket.instances[0].simulateOpen();
    });

    // Simulate disconnect
    act(() => {
      MockWebSocket.instances[0].simulateClose();
    });

    // Advance past 30 seconds of reconnection attempts
    // 1s + 2s + 4s + 8s + 16s = 31s total
    act(() => { jest.advanceTimersByTime(1000); }); // attempt 0 fires
    act(() => { MockWebSocket.instances[MockWebSocket.instances.length - 1].simulateClose(); });
    act(() => { jest.advanceTimersByTime(2000); }); // attempt 1 fires
    act(() => { MockWebSocket.instances[MockWebSocket.instances.length - 1].simulateClose(); });
    act(() => { jest.advanceTimersByTime(4000); }); // attempt 2 fires
    act(() => { MockWebSocket.instances[MockWebSocket.instances.length - 1].simulateClose(); });
    act(() => { jest.advanceTimersByTime(8000); }); // attempt 3 fires
    act(() => { MockWebSocket.instances[MockWebSocket.instances.length - 1].simulateClose(); });
    act(() => { jest.advanceTimersByTime(16000); }); // attempt 4 fires
    act(() => { MockWebSocket.instances[MockWebSocket.instances.length - 1].simulateClose(); });
    // Now 31s have elapsed, next schedule should trigger error
    act(() => { jest.advanceTimersByTime(16000); });

    expect(result.current.connectionError).toBeTruthy();
  });

  it("includes token in WebSocket URL when provided", () => {
    renderHook(() =>
      useDriverWebSocket({
        isOnline: true,
        onMessage: jest.fn(),
        token: "test-token-123",
      })
    );

    expect(MockWebSocket.instances[0].url).toContain("token=test-token-123");
  });

  it("reconnect() resets error and reconnects", () => {
    const { result } = renderHook(() =>
      useDriverWebSocket({ isOnline: true, onMessage: jest.fn() })
    );

    act(() => {
      MockWebSocket.instances[0].simulateOpen();
    });

    // Force an error state by simulating prolonged disconnection
    act(() => { MockWebSocket.instances[0].simulateClose(); });
    act(() => { jest.advanceTimersByTime(1000); });
    act(() => { MockWebSocket.instances[MockWebSocket.instances.length - 1].simulateClose(); });
    act(() => { jest.advanceTimersByTime(2000); });
    act(() => { MockWebSocket.instances[MockWebSocket.instances.length - 1].simulateClose(); });
    act(() => { jest.advanceTimersByTime(4000); });
    act(() => { MockWebSocket.instances[MockWebSocket.instances.length - 1].simulateClose(); });
    act(() => { jest.advanceTimersByTime(8000); });
    act(() => { MockWebSocket.instances[MockWebSocket.instances.length - 1].simulateClose(); });
    act(() => { jest.advanceTimersByTime(16000); });
    act(() => { MockWebSocket.instances[MockWebSocket.instances.length - 1].simulateClose(); });
    act(() => { jest.advanceTimersByTime(16000); });

    expect(result.current.connectionError).toBeTruthy();

    const instanceCountBefore = MockWebSocket.instances.length;

    act(() => {
      result.current.reconnect();
    });

    expect(result.current.connectionError).toBeNull();
    expect(MockWebSocket.instances.length).toBe(instanceCountBefore + 1);
  });
});
