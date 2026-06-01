import React, { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import { API_URL, WS_URL } from "../../apiConfig";
import { formatMoney } from "../../marketConfig";

const STATUS_STEPS = [
  { key: "matching", label: "Matching" },
  { key: "driver_assigned", label: "Assigned" },
  { key: "driver_arriving", label: "Arriving" },
  { key: "passenger_pickup", label: "Pickup" },
  { key: "in_progress", label: "In Progress" },
  { key: "drop_off_stop", label: "Drop-off" },
  { key: "completed", label: "Completed" },
];

const COMMUNICATION_STATUSES = ["driver_arriving", "driver_arrived"];

export default function ShareRideScreen({ rideId }) {
  const [ride, setRide] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef(null);

  const fetchRide = useCallback(async () => {
    try {
      const token = localStorage.getItem("access");
      const res = await axios.get(`${API_URL}/api/rides/share/${rideId}/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setRide(res.data);
      setError("");
    } catch (err) {
      setError(
        err.response?.data?.error ||
          err.response?.data?.detail ||
          "Failed to load ride details."
      );
    } finally {
      setLoading(false);
    }
  }, [rideId]);

  const connectWebSocket = useCallback(() => {
    const token = localStorage.getItem("access");
    const wsUrl = `${WS_URL}?token=${token}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
      reconnectAttemptRef.current = 0;
      // Join session group
      if (ride?.session_id) {
        ws.send(
          JSON.stringify({ type: "join_session", session_id: ride.session_id })
        );
      }
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleWsMessage(data);
      } catch (e) {
        // ignore parse errors
      }
    };

    ws.onclose = () => {
      setWsConnected(false);
      scheduleReconnect();
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [ride?.session_id]);

  const scheduleReconnect = useCallback(() => {
    const attempt = reconnectAttemptRef.current;
    const delay = Math.min(Math.pow(2, attempt) * 1000, 16000);
    reconnectAttemptRef.current = attempt + 1;

    reconnectTimerRef.current = setTimeout(() => {
      connectWebSocket();
    }, delay);
  }, [connectWebSocket]);

  const handleWsMessage = useCallback(
    (data) => {
      switch (data.type) {
        case "share_status_update":
          setRide((prev) =>
            prev
              ? { ...prev, status: data.status, eta_minutes: data.updated_eta_minutes }
              : prev
          );
          break;
        case "share_driver_assigned":
          setRide((prev) => (prev ? { ...prev, driver: data.driver, status: "driver_assigned" } : prev));
          break;
        case "share_matched":
          setRide((prev) =>
            prev
              ? {
                  ...prev,
                  passengers_count: data.passengers_count,
                  other_passengers: data.other_passengers,
                  status: "matching",
                }
              : prev
          );
          break;
        case "share_passenger_added":
          setRide((prev) =>
            prev
              ? {
                  ...prev,
                  stops: data.new_stops,
                  other_passengers: [
                    ...(prev.other_passengers || []),
                    data.passenger_name,
                  ],
                }
              : prev
          );
          break;
        case "share_passenger_removed":
          setRide((prev) =>
            prev
              ? { ...prev, stops: data.updated_stops, fare: data.updated_fares?.fare || prev.fare }
              : prev
          );
          break;
        case "share_fare_updated":
          setRide((prev) =>
            prev
              ? { ...prev, fare: data.new_fare, savings: data.new_savings }
              : prev
          );
          break;
        case "share_your_pickup":
        case "share_your_dropoff":
          // Could trigger a notification
          break;
        case "driver_location":
          setRide((prev) =>
            prev
              ? { ...prev, driver_location: { lat: data.lat, lng: data.lng } }
              : prev
          );
          break;
        default:
          break;
      }
    },
    []
  );

  useEffect(() => {
    fetchRide();
  }, [fetchRide]);

  useEffect(() => {
    if (ride && !wsRef.current) {
      connectWebSocket();
    }
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
    };
  }, [ride, connectWebSocket]);

  const handleCallDriver = () => {
    if (ride?.driver?.phone) {
      window.location.href = `tel:${ride.driver.phone}`;
    }
  };

  const handleChatDriver = () => {
    // Navigate to chat or open chat modal
    window.location.href = `/ride/share/${rideId}/chat`;
  };

  const handleEmergency = () => {
    window.location.href = "tel:117";
  };

  const handleShareTrip = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "My Yala Share Ride",
          text: `I'm on a Yala Share ride. Track my trip!`,
          url: window.location.href,
        });
      } catch (e) {
        // User cancelled
      }
    }
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loadingContainer}>
          <div style={styles.spinner} />
          <p style={styles.loadingText}>Loading ride...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.errorContainer}>
          <p style={styles.errorText}>{error}</p>
          <button onClick={fetchRide} style={styles.retryButton}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!ride) return null;

  const currentStepIndex = STATUS_STEPS.findIndex((s) => s.key === ride.status);
  const canCommunicate = COMMUNICATION_STATUSES.includes(ride.status);

  return (
    <div style={styles.container}>
      {/* Connection status */}
      {!wsConnected && (
        <div style={styles.connectionBanner} role="alert">
          Reconnecting...
        </div>
      )}

      {/* Status progress bar */}
      <div style={styles.progressContainer} aria-label="Ride progress">
        <div style={styles.progressTrack}>
          {STATUS_STEPS.map((s, i) => (
            <div key={s.key} style={styles.progressStep}>
              <div
                style={{
                  ...styles.progressCircle,
                  backgroundColor:
                    i <= currentStepIndex
                      ? "#00A651"
                      : "rgba(255,255,255,0.15)",
                }}
              />
              {i < STATUS_STEPS.length - 1 && (
                <div
                  style={{
                    ...styles.progressLine,
                    backgroundColor:
                      i < currentStepIndex
                        ? "#00A651"
                        : "rgba(255,255,255,0.1)",
                  }}
                />
              )}
            </div>
          ))}
        </div>
        <div style={styles.progressLabels}>
          {STATUS_STEPS.map((s, i) => (
            <span
              key={s.key}
              style={{
                ...styles.progressLabel,
                color:
                  i <= currentStepIndex
                    ? "#00A651"
                    : "rgba(255,255,255,0.4)",
                fontWeight: i === currentStepIndex ? 700 : 400,
              }}
            >
              {s.label}
            </span>
          ))}
        </div>
      </div>

      {/* Driver card */}
      {ride.driver && (
        <div style={styles.driverCard}>
          <div style={styles.driverInfo}>
            <div style={styles.driverPhoto}>
              {ride.driver.photo_url ? (
                <img
                  src={`${API_URL}${ride.driver.photo_url}`}
                  alt={ride.driver.name}
                  style={styles.driverImg}
                />
              ) : (
                <span style={styles.driverInitial}>
                  {ride.driver.name?.charAt(0) || "D"}
                </span>
              )}
            </div>
            <div>
              <div style={styles.driverName}>{ride.driver.name}</div>
              <div style={styles.driverVehicle}>
                {ride.driver.vehicle} • {ride.driver.plate_number}
              </div>
              <div style={styles.driverRating}>
                {"★".repeat(Math.round(ride.driver.rating || 0))}
                {"☆".repeat(5 - Math.round(ride.driver.rating || 0))}
                <span style={styles.ratingNumber}>
                  {" "}
                  {ride.driver.rating?.toFixed(1)}
                </span>
              </div>
            </div>
          </div>
          {ride.eta_minutes && (
            <div style={styles.etaBadge}>
              <span style={styles.etaValue}>{ride.eta_minutes}</span>
              <span style={styles.etaLabel}>min</span>
            </div>
          )}
        </div>
      )}

      {/* Ride details */}
      <div style={styles.detailsCard}>
        <div style={styles.detailRow}>
          <span style={styles.detailLabel}>Your fare</span>
          <span style={styles.detailValue}>{formatMoney(ride.fare)}</span>
        </div>
        {ride.savings > 0 && (
          <div style={styles.detailRow}>
            <span style={styles.detailLabel}>Savings</span>
            <span style={styles.savingsValue}>
              {formatMoney(ride.savings)}
            </span>
          </div>
        )}
        <div style={styles.detailRow}>
          <span style={styles.detailLabel}>Passengers</span>
          <span style={styles.detailValue}>
            {ride.passengers_count || 1} in this ride
          </span>
        </div>
        {ride.other_passengers && ride.other_passengers.length > 0 && (
          <div style={styles.detailRow}>
            <span style={styles.detailLabel}>Sharing with</span>
            <span style={styles.detailValue}>
              {ride.other_passengers.join(", ")}
            </span>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div style={styles.actionsContainer}>
        {canCommunicate && (
          <>
            <button
              onClick={handleCallDriver}
              style={styles.actionButton}
              aria-label="Call driver"
            >
              <span style={styles.actionIcon}>📞</span>
              <span style={styles.actionLabel}>Call</span>
            </button>
            <button
              onClick={handleChatDriver}
              style={styles.actionButton}
              aria-label="Chat with driver"
            >
              <span style={styles.actionIcon}>💬</span>
              <span style={styles.actionLabel}>Chat</span>
            </button>
          </>
        )}
        <button
          onClick={handleShareTrip}
          style={styles.actionButton}
          aria-label="Share trip"
        >
          <span style={styles.actionIcon}>📤</span>
          <span style={styles.actionLabel}>Share</span>
        </button>
        <button
          onClick={handleEmergency}
          style={styles.emergencyButton}
          aria-label="Emergency"
        >
          <span style={styles.actionIcon}>🚨</span>
          <span style={styles.actionLabel}>SOS</span>
        </button>
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: "100vh",
    backgroundColor: "#0B1220",
    color: "#FFFFFF",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    padding: "20px",
    maxWidth: "428px",
    margin: "0 auto",
  },
  loadingContainer: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "60vh",
  },
  spinner: {
    width: "40px",
    height: "40px",
    border: "3px solid rgba(255,255,255,0.1)",
    borderTopColor: "#00A651",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
  },
  loadingText: {
    marginTop: "16px",
    color: "rgba(255,255,255,0.6)",
    fontSize: "14px",
  },
  errorContainer: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "60vh",
    textAlign: "center",
  },
  errorText: {
    color: "#EF4444",
    fontSize: "15px",
    marginBottom: "16px",
  },
  retryButton: {
    padding: "12px 24px",
    borderRadius: "12px",
    border: "1px solid #00A651",
    backgroundColor: "transparent",
    color: "#00A651",
    fontSize: "14px",
    fontWeight: 600,
    cursor: "pointer",
  },
  connectionBanner: {
    backgroundColor: "rgba(239,68,68,0.15)",
    border: "1px solid rgba(239,68,68,0.3)",
    borderRadius: "8px",
    padding: "8px 12px",
    fontSize: "12px",
    color: "#EF4444",
    textAlign: "center",
    marginBottom: "12px",
  },
  progressContainer: {
    marginBottom: "24px",
  },
  progressTrack: {
    display: "flex",
    alignItems: "center",
    marginBottom: "8px",
  },
  progressStep: {
    display: "flex",
    alignItems: "center",
    flex: 1,
  },
  progressCircle: {
    width: "12px",
    height: "12px",
    borderRadius: "50%",
    transition: "background-color 300ms ease",
    flexShrink: 0,
  },
  progressLine: {
    flex: 1,
    height: "2px",
    marginLeft: "4px",
    marginRight: "4px",
    transition: "background-color 300ms ease",
  },
  progressLabels: {
    display: "flex",
    justifyContent: "space-between",
  },
  progressLabel: {
    fontSize: "9px",
    textAlign: "center",
    transition: "color 300ms ease",
  },
  driverCard: {
    backgroundColor: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "20px",
    padding: "16px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "16px",
  },
  driverInfo: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  driverPhoto: {
    width: "48px",
    height: "48px",
    borderRadius: "50%",
    backgroundColor: "rgba(0,166,81,0.2)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  driverImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  driverInitial: {
    fontSize: "20px",
    fontWeight: 700,
    color: "#00A651",
  },
  driverName: {
    fontSize: "15px",
    fontWeight: 600,
    color: "#FFFFFF",
  },
  driverVehicle: {
    fontSize: "12px",
    color: "rgba(255,255,255,0.6)",
    marginTop: "2px",
  },
  driverRating: {
    fontSize: "12px",
    color: "#D4AF37",
    marginTop: "2px",
  },
  ratingNumber: {
    color: "rgba(255,255,255,0.5)",
  },
  etaBadge: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    backgroundColor: "rgba(0,166,81,0.15)",
    borderRadius: "12px",
    padding: "8px 14px",
  },
  etaValue: {
    fontSize: "20px",
    fontWeight: 700,
    color: "#00A651",
  },
  etaLabel: {
    fontSize: "10px",
    color: "rgba(255,255,255,0.5)",
  },
  detailsCard: {
    backgroundColor: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "20px",
    padding: "16px",
    marginBottom: "16px",
  },
  detailRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 0",
    borderBottom: "1px solid rgba(255,255,255,0.05)",
  },
  detailLabel: {
    fontSize: "13px",
    color: "rgba(255,255,255,0.6)",
  },
  detailValue: {
    fontSize: "14px",
    fontWeight: 500,
    color: "#FFFFFF",
  },
  savingsValue: {
    fontSize: "14px",
    fontWeight: 600,
    color: "#D4AF37",
  },
  actionsContainer: {
    display: "flex",
    gap: "10px",
    justifyContent: "center",
    flexWrap: "wrap",
  },
  actionButton: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "4px",
    padding: "12px 16px",
    borderRadius: "16px",
    border: "1px solid rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.06)",
    color: "#FFFFFF",
    cursor: "pointer",
    minWidth: "64px",
    transition: "background-color 300ms ease",
  },
  emergencyButton: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "4px",
    padding: "12px 16px",
    borderRadius: "16px",
    border: "1px solid rgba(239,68,68,0.3)",
    backgroundColor: "rgba(239,68,68,0.1)",
    color: "#EF4444",
    cursor: "pointer",
    minWidth: "64px",
    transition: "background-color 300ms ease",
  },
  actionIcon: {
    fontSize: "20px",
  },
  actionLabel: {
    fontSize: "11px",
    fontWeight: 500,
  },
};
