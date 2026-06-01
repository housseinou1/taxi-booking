import { useCallback, useEffect, useRef, useState } from "react";
import { WS_URL } from "../../apiConfig";

/**
 * Calculate exponential backoff delay for reconnection attempts.
 * Starts at 1s, doubles each attempt, caps at 16s.
 * @param {number} attempt - Zero-based attempt number
 * @returns {number} Delay in milliseconds
 */
export function calculateBackoffDelay(attempt) {
  return Math.min(Math.pow(2, attempt) * 1000, 16000);
}

/**
 * Custom hook for managing the driver WebSocket connection.
 *
 * Features:
 * - Connects when driver goes online, disconnects when offline
 * - Exponential backoff reconnection: 1s → 2s → 4s → 8s → 16s max
 * - Stops reconnection after 30 seconds and reports error
 * - Message dispatching to registered handlers
 * - Delivers missed events on reconnection (server-side)
 *
 * @param {Object} options
 * @param {boolean} options.isOnline - Whether the driver is currently online
 * @param {function} options.onMessage - Callback for incoming messages
 * @param {string} [options.token] - Auth token for WebSocket connection
 * @returns {Object} { isConnected, connectionError, sendMessage, reconnect }
 */
export default function useDriverWebSocket({ isOnline, onMessage, token }) {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState(null);

  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const attemptRef = useRef(0);
  const reconnectStartRef = useRef(null);
  const isOnlineRef = useRef(isOnline);
  const onMessageRef = useRef(onMessage);

  // Keep refs in sync with latest values
  useEffect(() => {
    isOnlineRef.current = isOnline;
  }, [isOnline]);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const disconnect = useCallback(() => {
    clearReconnectTimer();
    reconnectStartRef.current = null;
    attemptRef.current = 0;

    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      wsRef.current.onopen = null;
      wsRef.current.close();
      wsRef.current = null;
    }

    setIsConnected(false);
  }, [clearReconnectTimer]);

  const scheduleReconnect = useCallback(() => {
    if (!isOnlineRef.current) return;
    if (reconnectTimerRef.current) return;

    // Initialize reconnect start time on first attempt
    if (!reconnectStartRef.current) {
      reconnectStartRef.current = Date.now();
    }

    // Stop reconnection after 30 seconds total
    const elapsed = Date.now() - reconnectStartRef.current;
    if (elapsed >= 30000) {
      setConnectionError(
        "Unable to establish connection. Please check your internet and try again."
      );
      reconnectStartRef.current = null;
      attemptRef.current = 0;
      return;
    }

    const delay = calculateBackoffDelay(attemptRef.current);
    attemptRef.current += 1;

    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      connect(); // eslint-disable-line no-use-before-define
    }, delay);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const connect = useCallback(() => {
    if (!isOnlineRef.current) return;

    // Close existing connection if any
    if (
      wsRef.current &&
      (wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    try {
      // Build WebSocket URL with token if available
      const wsUrl = token ? `${WS_URL}?token=${token}` : WS_URL;
      wsRef.current = new WebSocket(wsUrl);
    } catch (err) {
      scheduleReconnect();
      return;
    }

    wsRef.current.onopen = () => {
      setIsConnected(true);
      setConnectionError(null);
      attemptRef.current = 0;
      reconnectStartRef.current = null;
    };

    wsRef.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (onMessageRef.current) {
          onMessageRef.current(data);
        }
      } catch (e) {
        // Invalid JSON, ignore
      }
    };

    wsRef.current.onclose = () => {
      setIsConnected(false);
      wsRef.current = null;
      if (isOnlineRef.current) {
        scheduleReconnect();
      }
    };

    wsRef.current.onerror = () => {
      // onclose will fire after onerror, which handles reconnection
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [token, scheduleReconnect]);

  /**
   * Send a message through the WebSocket connection.
   * @param {Object} data - Message payload to send
   * @returns {boolean} Whether the message was sent successfully
   */
  const sendMessage = useCallback((data) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
      return true;
    }
    return false;
  }, []);

  /**
   * Manually trigger a reconnection attempt.
   * Resets the error state and reconnection timer.
   */
  const reconnect = useCallback(() => {
    setConnectionError(null);
    attemptRef.current = 0;
    reconnectStartRef.current = null;
    clearReconnectTimer();
    connect();
  }, [connect, clearReconnectTimer]);

  // Connect/disconnect based on online status
  useEffect(() => {
    if (isOnline) {
      setConnectionError(null);
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [isOnline, connect, disconnect]);

  return {
    isConnected,
    connectionError,
    sendMessage,
    reconnect,
  };
}
