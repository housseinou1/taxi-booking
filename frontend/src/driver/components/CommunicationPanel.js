import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDriverContext } from "../context/DriverContext";
import { getNavigationDestination } from "./MultiStopProgress";

// ─── Yala Branding Colors ───────────────────────────────────────────────────
const COLORS = {
  primaryGreen: "#00A651",
  goldAccent: "#D4AF37",
  darkNavy: "#0B1220",
  white: "#FFFFFF",
  gray: "#6B7280",
  lightGray: "#9CA3AF",
  errorRed: "#EF4444",
};

// ─── Constants ──────────────────────────────────────────────────────────────
const MAX_MESSAGE_LENGTH = 500;
const DELIVERY_TIMEOUT_MS = 5000;
const COMMUNICATION_STATUSES = ["driver_arriving", "driver_arrived"];

// ─── Exported Helpers ───────────────────────────────────────────────────────

/**
 * Determines whether communication controls (Call/Chat) should be visible.
 * Visible only during driver_arriving or driver_arrived states.
 *
 * @param {string|null|undefined} rideStatus
 * @returns {boolean}
 */
export function isCommunicationVisible(rideStatus) {
  if (!rideStatus) return false;
  return COMMUNICATION_STATUSES.includes(rideStatus);
}

/**
 * Validates a chat message against the 500-character limit.
 *
 * @param {string} message
 * @returns {{ isValid: boolean, remaining: number }}
 */
export function validateChatMessage(message) {
  const length = typeof message === "string" ? message.length : 0;
  return {
    isValid: length > 0 && length <= MAX_MESSAGE_LENGTH,
    remaining: MAX_MESSAGE_LENGTH - length,
  };
}

/**
 * Determines the navigation destination based on ride status and stops.
 * - driver_arriving / driver_arrived → pickup location
 * - in_progress → next stop (multi-stop) or drop-off location
 *
 * @param {Object} ride - The active ride object
 * @returns {{ type: string, location: Object|null } | null}
 */
export function getNavDestination(ride) {
  if (!ride || !ride.status) return null;

  const status = ride.status;

  if (status === "driver_arriving" || status === "driver_arrived") {
    // Navigate to pickup location
    if (ride.pickup_latitude && ride.pickup_longitude) {
      return {
        type: "pickup",
        location: {
          latitude: ride.pickup_latitude,
          longitude: ride.pickup_longitude,
          name: ride.pickup_location || "Pickup",
        },
      };
    }
    return null;
  }

  if (status === "in_progress") {
    // Multi-stop: navigate to next pending stop
    if (ride.stops && ride.stops.length > 0) {
      const nextStop = getNavigationDestination(ride.stops, status);
      if (nextStop) {
        return {
          type: "stop",
          location: {
            latitude: nextStop.latitude,
            longitude: nextStop.longitude,
            name: nextStop.location_name || "Next Stop",
          },
        };
      }
    }

    // No pending stops or no stops at all → navigate to drop-off
    if (ride.destination_latitude && ride.destination_longitude) {
      return {
        type: "dropoff",
        location: {
          latitude: ride.destination_latitude,
          longitude: ride.destination_longitude,
          name: ride.destination_location || "Drop-off",
        },
      };
    }
    return null;
  }

  return null;
}

/**
 * CommunicationPanel - Driver-rider communication controls.
 *
 * Features:
 * - Call Rider button (visible during driver_arriving/driver_arrived)
 * - Chat Rider button with in-app messaging (visible during driver_arriving/driver_arrived)
 * - 500-character message limit with remaining count
 * - Delivery failure indicator after 5 seconds with retry
 * - Navigation button: pickup for arriving/arrived, drop-off for in_progress
 * - Multi-stop navigation: cycles through stops in order during in_progress
 *
 * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, Multi-stop rides
 *
 * @param {Object} props
 * @param {Function} props.sendMessage - WebSocket sendMessage function
 * @param {Function} [props.onCall] - Callback when Call Rider is tapped
 * @param {Function} [props.onNavigate] - Callback when Navigation is tapped (receives destination)
 */
export default function CommunicationPanel({ sendMessage, onCall, onNavigate }) {
  const { state } = useDriverContext();
  const { activeRide } = state;

  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState([]);

  const deliveryTimersRef = useRef({});

  // Cleanup delivery timers on unmount
  useEffect(() => {
    return () => {
      Object.values(deliveryTimersRef.current).forEach(clearTimeout);
    };
  }, []);

  const rideStatus = activeRide?.status;
  const showCommunication = isCommunicationVisible(rideStatus);
  const navDestination = useMemo(() => getNavDestination(activeRide), [activeRide]);
  const showNavigation = navDestination !== null;

  const { remaining } = validateChatMessage(chatInput);

  // ─── Call Rider Handler ─────────────────────────────────────────────────
  const handleCallRider = useCallback(() => {
    if (onCall) {
      onCall(activeRide);
    } else if (activeRide?.rider_phone) {
      window.open(`tel:${activeRide.rider_phone}`, "_self");
    }
  }, [activeRide, onCall]);

  // ─── Chat Toggle ────────────────────────────────────────────────────────
  const handleToggleChat = useCallback(() => {
    setIsChatOpen((prev) => !prev);
  }, []);

  // ─── Send Chat Message ──────────────────────────────────────────────────
  const handleSendMessage = useCallback(() => {
    const trimmed = chatInput.trim();
    if (!trimmed || trimmed.length > MAX_MESSAGE_LENGTH) return;
    if (!activeRide) return;

    const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const newMessage = {
      id: messageId,
      text: trimmed,
      timestamp: Date.now(),
      status: "sending", // sending | delivered | failed
    };

    setMessages((prev) => [...prev, newMessage]);
    setChatInput("");

    // Send via WebSocket
    const sent = sendMessage({
      type: "chat_message",
      ride_id: activeRide.id || activeRide.ride_id,
      text: trimmed,
      message_id: messageId,
    });

    if (!sent) {
      // Immediate failure if WebSocket is not connected
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId ? { ...msg, status: "failed" } : msg
        )
      );
      return;
    }

    // Set delivery timeout - mark as failed after 5 seconds
    deliveryTimersRef.current[messageId] = setTimeout(() => {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId && msg.status === "sending"
            ? { ...msg, status: "failed" }
            : msg
        )
      );
      delete deliveryTimersRef.current[messageId];
    }, DELIVERY_TIMEOUT_MS);
  }, [chatInput, activeRide, sendMessage]);

  // ─── Retry Failed Message ──────────────────────────────────────────────
  const handleRetryMessage = useCallback(
    (messageId) => {
      const message = messages.find((msg) => msg.id === messageId);
      if (!message || message.status !== "failed") return;
      if (!activeRide) return;

      // Update status to sending
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId ? { ...msg, status: "sending" } : msg
        )
      );

      const sent = sendMessage({
        type: "chat_message",
        ride_id: activeRide.id || activeRide.ride_id,
        text: message.text,
        message_id: messageId,
      });

      if (!sent) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === messageId ? { ...msg, status: "failed" } : msg
          )
        );
        return;
      }

      // Set delivery timeout
      deliveryTimersRef.current[messageId] = setTimeout(() => {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === messageId && msg.status === "sending"
              ? { ...msg, status: "failed" }
              : msg
          )
        );
        delete deliveryTimersRef.current[messageId];
      }, DELIVERY_TIMEOUT_MS);
    },
    [messages, activeRide, sendMessage]
  );

  // ─── Navigation Handler ─────────────────────────────────────────────────
  const handleNavigate = useCallback(() => {
    if (!navDestination) return;

    if (onNavigate) {
      onNavigate(navDestination);
    } else {
      // Open device's default navigation app
      const { latitude, longitude } = navDestination.location;
      window.open(
        `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`,
        "_blank"
      );
    }
  }, [navDestination, onNavigate]);

  // ─── Handle input change with character limit ───────────────────────────
  const handleInputChange = useCallback((e) => {
    const value = e.target.value;
    if (value.length <= MAX_MESSAGE_LENGTH) {
      setChatInput(value);
    }
  }, []);

  // ─── Mark message as delivered (called externally via ref or prop) ──────
  // This can be triggered when a delivery confirmation comes via WebSocket
  const markMessageDelivered = useCallback((messageId) => {
    if (deliveryTimersRef.current[messageId]) {
      clearTimeout(deliveryTimersRef.current[messageId]);
      delete deliveryTimersRef.current[messageId];
    }
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === messageId ? { ...msg, status: "delivered" } : msg
      )
    );
  }, []);

  // Expose markMessageDelivered for parent components
  useEffect(() => {
    if (window.__communicationPanelRef) {
      window.__communicationPanelRef.markMessageDelivered = markMessageDelivered;
    }
  }, [markMessageDelivered]);

  // ─── Navigation label ───────────────────────────────────────────────────
  const navigationLabel = useMemo(() => {
    if (!navDestination) return "";
    switch (navDestination.type) {
      case "pickup":
        return "Navigate to Pickup";
      case "stop":
        return `Navigate to ${navDestination.location.name}`;
      case "dropoff":
        return "Navigate to Drop-off";
      default:
        return "Navigate";
    }
  }, [navDestination]);

  // Don't render if no ride or ride is in a state with no controls
  if (!activeRide) return null;
  if (!showCommunication && !showNavigation) return null;

  return (
    <div style={containerStyle} role="region" aria-label="Communication panel">
      {/* ─── Communication Buttons (Call & Chat) ─────────────────────────── */}
      {showCommunication && (
        <div style={communicationRowStyle}>
          <button
            onClick={handleCallRider}
            style={callButtonStyle}
            aria-label="Call Rider"
          >
            <span style={buttonIconStyle}>📞</span>
            <span style={buttonTextStyle}>Call Rider</span>
          </button>

          <button
            onClick={handleToggleChat}
            style={{
              ...chatButtonStyle,
              backgroundColor: isChatOpen
                ? COLORS.goldAccent
                : "rgba(212, 175, 55, 0.15)",
            }}
            aria-label="Chat Rider"
            aria-expanded={isChatOpen}
          >
            <span style={buttonIconStyle}>💬</span>
            <span style={buttonTextStyle}>Chat Rider</span>
          </button>
        </div>
      )}

      {/* ─── Chat Interface ──────────────────────────────────────────────── */}
      {showCommunication && isChatOpen && (
        <div style={chatContainerStyle} role="region" aria-label="Chat interface">
          {/* Messages List */}
          <div style={messagesListStyle} aria-live="polite">
            {messages.length === 0 && (
              <div style={emptyMessageStyle}>
                Send a message to the rider
              </div>
            )}
            {messages.map((msg) => (
              <div key={msg.id} style={messageItemStyle}>
                <div style={messageBubbleStyle}>
                  <span style={messageTextStyle}>{msg.text}</span>
                </div>
                <div style={messageMetaStyle}>
                  {msg.status === "sending" && (
                    <span style={sendingIndicatorStyle} aria-label="Sending">
                      Sending...
                    </span>
                  )}
                  {msg.status === "delivered" && (
                    <span style={deliveredIndicatorStyle} aria-label="Delivered">
                      ✓ Delivered
                    </span>
                  )}
                  {msg.status === "failed" && (
                    <span style={failedContainerStyle}>
                      <span style={failedIndicatorStyle} aria-label="Delivery failed">
                        ✗ Failed
                      </span>
                      <button
                        onClick={() => handleRetryMessage(msg.id)}
                        style={retryButtonStyle}
                        aria-label="Retry sending message"
                      >
                        Retry
                      </button>
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Chat Input */}
          <div style={chatInputContainerStyle}>
            <input
              type="text"
              value={chatInput}
              onChange={handleInputChange}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder="Type a message..."
              maxLength={MAX_MESSAGE_LENGTH}
              style={chatInputStyle}
              aria-label="Chat message input"
            />
            <span
              style={{
                ...charCountStyle,
                color: remaining < 50 ? COLORS.errorRed : COLORS.lightGray,
              }}
              aria-label={`${remaining} characters remaining`}
            >
              {remaining}
            </span>
            <button
              onClick={handleSendMessage}
              disabled={!chatInput.trim() || chatInput.length > MAX_MESSAGE_LENGTH}
              style={{
                ...sendButtonStyle,
                opacity: !chatInput.trim() ? 0.5 : 1,
                cursor: !chatInput.trim() ? "not-allowed" : "pointer",
              }}
              aria-label="Send message"
            >
              Send
            </button>
          </div>
        </div>
      )}

      {/* ─── Navigation Button ───────────────────────────────────────────── */}
      {showNavigation && (
        <button
          onClick={handleNavigate}
          style={navigationButtonStyle}
          aria-label={navigationLabel}
        >
          <span style={navIconStyle}>🧭</span>
          <span style={navTextStyle}>{navigationLabel}</span>
        </button>
      )}
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const containerStyle = {
  padding: "12px 16px",
  backgroundColor: "rgba(11, 18, 32, 0.95)",
  borderRadius: "16px",
  border: "1px solid rgba(255, 255, 255, 0.1)",
  backdropFilter: "blur(12px)",
  display: "flex",
  flexDirection: "column",
  gap: "10px",
};

const communicationRowStyle = {
  display: "flex",
  gap: "10px",
};

const callButtonStyle = {
  flex: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "8px",
  padding: "12px 16px",
  borderRadius: "12px",
  border: "none",
  backgroundColor: "rgba(0, 166, 81, 0.15)",
  color: COLORS.primaryGreen,
  fontWeight: 800,
  fontSize: "13px",
  cursor: "pointer",
  transition: "background-color 0.2s ease",
};

const chatButtonStyle = {
  flex: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "8px",
  padding: "12px 16px",
  borderRadius: "12px",
  border: "none",
  color: COLORS.goldAccent,
  fontWeight: 800,
  fontSize: "13px",
  cursor: "pointer",
  transition: "background-color 0.2s ease",
};

const buttonIconStyle = {
  fontSize: "16px",
};

const buttonTextStyle = {
  fontSize: "13px",
  fontWeight: 800,
};

const chatContainerStyle = {
  borderRadius: "12px",
  backgroundColor: "rgba(255, 255, 255, 0.05)",
  border: "1px solid rgba(255, 255, 255, 0.08)",
  overflow: "hidden",
};

const messagesListStyle = {
  maxHeight: "160px",
  overflowY: "auto",
  padding: "10px 12px",
  display: "flex",
  flexDirection: "column",
  gap: "8px",
};

const emptyMessageStyle = {
  color: COLORS.lightGray,
  fontSize: "12px",
  textAlign: "center",
  padding: "16px 0",
};

const messageItemStyle = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-end",
  gap: "2px",
};

const messageBubbleStyle = {
  maxWidth: "80%",
  padding: "8px 12px",
  borderRadius: "12px 12px 4px 12px",
  backgroundColor: COLORS.primaryGreen,
};

const messageTextStyle = {
  color: COLORS.white,
  fontSize: "13px",
  lineHeight: "1.4",
  wordBreak: "break-word",
};

const messageMetaStyle = {
  display: "flex",
  alignItems: "center",
  gap: "6px",
};

const sendingIndicatorStyle = {
  color: COLORS.lightGray,
  fontSize: "10px",
  fontStyle: "italic",
};

const deliveredIndicatorStyle = {
  color: COLORS.primaryGreen,
  fontSize: "10px",
  fontWeight: 700,
};

const failedContainerStyle = {
  display: "flex",
  alignItems: "center",
  gap: "6px",
};

const failedIndicatorStyle = {
  color: COLORS.errorRed,
  fontSize: "10px",
  fontWeight: 700,
};

const retryButtonStyle = {
  padding: "2px 8px",
  borderRadius: "6px",
  border: `1px solid ${COLORS.errorRed}`,
  backgroundColor: "transparent",
  color: COLORS.errorRed,
  fontSize: "10px",
  fontWeight: 800,
  cursor: "pointer",
};

const chatInputContainerStyle = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  padding: "8px 12px",
  borderTop: "1px solid rgba(255, 255, 255, 0.08)",
};

const chatInputStyle = {
  flex: 1,
  padding: "8px 12px",
  borderRadius: "8px",
  border: "1px solid rgba(255, 255, 255, 0.15)",
  backgroundColor: "rgba(255, 255, 255, 0.05)",
  color: COLORS.white,
  fontSize: "13px",
  outline: "none",
};

const charCountStyle = {
  fontSize: "11px",
  fontWeight: 700,
  minWidth: "28px",
  textAlign: "right",
};

const sendButtonStyle = {
  padding: "8px 14px",
  borderRadius: "8px",
  border: "none",
  backgroundColor: COLORS.primaryGreen,
  color: COLORS.white,
  fontSize: "12px",
  fontWeight: 800,
  transition: "opacity 0.2s ease",
};

const navigationButtonStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "8px",
  padding: "12px 16px",
  borderRadius: "12px",
  border: "none",
  backgroundColor: COLORS.primaryGreen,
  color: COLORS.white,
  fontWeight: 800,
  fontSize: "14px",
  cursor: "pointer",
  transition: "background-color 0.2s ease",
  boxShadow: "0 4px 12px rgba(0, 166, 81, 0.3)",
};

const navIconStyle = {
  fontSize: "16px",
};

const navTextStyle = {
  fontSize: "14px",
  fontWeight: 800,
};
