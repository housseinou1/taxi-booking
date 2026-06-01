import React, { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import { API_URL, WS_URL } from "../../apiConfig";
import { formatMoney } from "../../marketConfig";

export default function DriverShareView({ sessionId }) {
  const [session, setSession] = useState(null);
  const [stops, setStops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const wsRef = useRef(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef(null);

  const fetchSession = useCallback(async () => {
    try {
      const token = localStorage.getItem("access");
      const [sessionRes, stopsRes] = await Promise.all([
        axios.get(`${API_URL}/api/rides/share/session/${sessionId}/`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        axios.get(`${API_URL}/api/rides/share/session/${sessionId}/stops/`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      setSession(sessionRes.data);
      setStops(stopsRes.data.stops || stopsRes.data || []);
      setError("");
    } catch (err) {
      setError(
        err.response?.data?.error ||
          err.response?.data?.detail ||
          "Failed to load session."
      );
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  const connectWebSocket = useCallback(() => {
    const token = localStorage.getItem("access");
    const ws = new WebSocket(`${WS_URL}?token=${token}`);
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectAttemptRef.current = 0;
      ws.send(JSON.stringify({ type: "join_session", session_id: sessionId }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleWsMessage(data);
      } catch (e) {
        // ignore
      }
    };

    ws.onclose = () => {
      const attempt = reconnectAttemptRef.current;
      const delay = Math.min(Math.pow(2, attempt) * 1000, 16000);
      reconnectAttemptRef.current = attempt + 1;
      reconnectTimerRef.current = setTimeout(connectWebSocket, delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [sessionId]);

  const handleWsMessage = useCallback((data) => {
    switch (data.type) {
      case "share_stops_updated":
        setStops(data.stops || []);
        setSession((prev) =>
          prev ? { ...prev, passengers_count: data.passenger_count } : prev
        );
        break;
      case "share_status_update":
        setSession((prev) => (prev ? { ...prev, status: data.status } : prev));
        break;
      case "share_passenger_added":
        setStops(data.new_stops || []);
        break;
      case "share_passenger_removed":
        setStops(data.updated_stops || []);
        break;
      default:
        break;
    }
  }, []);

  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  useEffect(() => {
    connectWebSocket();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
    };
  }, [connectWebSocket]);

  const handleConfirmPickup = async (stopId) => {
    setActionLoading(true);
    try {
      const token = localStorage.getItem("access");
      await axios.post(
        `${API_URL}/api/rides/share/session/${sessionId}/pickup/`,
        { stop_id: stopId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      // Refresh stops
      await fetchSession();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to confirm pickup.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmDropoff = async (stopId) => {
    setActionLoading(true);
    try {
      const token = localStorage.getItem("access");
      await axios.post(
        `${API_URL}/api/rides/share/session/${sessionId}/dropoff/`,
        { stop_id: stopId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      await fetchSession();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to confirm drop-off.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleNavigate = (stop) => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${stop.latitude},${stop.longitude}`;
    window.open(url, "_blank");
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loadingContainer}>
          <div style={styles.spinner} />
          <p style={styles.loadingText}>Loading session...</p>
        </div>
      </div>
    );
  }

  if (error && !session) {
    return (
      <div style={styles.container}>
        <div style={styles.errorContainer}>
          <p style={styles.errorText}>{error}</p>
          <button onClick={fetchSession} style={styles.retryButton}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  const currentStop = stops.find((s) => !s.completed_at);
  const passengersCount = session?.passengers_count || stops.filter(
    (s) => s.stop_type === "pickup"
  ).length;

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.title}>Share Session</h1>
        <div style={styles.headerBadge}>
          <span style={styles.badgeText}>
            {passengersCount} passenger{passengersCount !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Earnings card */}
      <div style={styles.earningsCard}>
        <span style={styles.earningsLabel}>Session Earnings</span>
        <span style={styles.earningsValue}>
          {formatMoney(session?.driver_earnings || 0)}
        </span>
      </div>

      {/* Error banner */}
      {error && (
        <div style={styles.errorBanner} role="alert">
          {error}
        </div>
      )}

      {/* Stop list */}
      <div style={styles.stopsList}>
        <h3 style={styles.stopsTitle}>Stops</h3>
        {stops.map((stop, index) => {
          const isCompleted = !!stop.completed_at;
          const isCurrent = currentStop && currentStop.stop_order === stop.stop_order;
          const isPickup = stop.stop_type === "pickup";

          return (
            <div
              key={stop.id || index}
              style={{
                ...styles.stopItem,
                borderColor: isCurrent
                  ? "#00A651"
                  : isCompleted
                  ? "rgba(0,166,81,0.3)"
                  : "rgba(255,255,255,0.1)",
                backgroundColor: isCurrent
                  ? "rgba(0,166,81,0.08)"
                  : "rgba(255,255,255,0.06)",
                opacity: isCompleted ? 0.6 : 1,
              }}
            >
              <div style={styles.stopHeader}>
                <div style={styles.stopInfo}>
                  <span
                    style={{
                      ...styles.stopIcon,
                      backgroundColor: isPickup
                        ? "rgba(0,166,81,0.2)"
                        : "rgba(239,68,68,0.2)",
                      color: isPickup ? "#00A651" : "#EF4444",
                    }}
                  >
                    {isPickup ? "↑" : "↓"}
                  </span>
                  <div>
                    <div style={styles.stopName}>
                      {isPickup ? "Pickup" : "Drop-off"} #{Math.ceil((index + 1) / 2)}{" "}
                      ({stop.passenger_name || stop.location_name})
                    </div>
                    <div style={styles.stopLocation}>
                      {stop.location_name}
                    </div>
                    {stop.eta_minutes > 0 && !isCompleted && (
                      <div style={styles.stopEta}>
                        ETA: {stop.eta_minutes} min
                      </div>
                    )}
                  </div>
                </div>
                <div style={styles.stopStatus}>
                  {isCompleted ? (
                    <span style={styles.completedBadge}>✓</span>
                  ) : isCurrent ? (
                    <span style={styles.currentBadge}>Current</span>
                  ) : (
                    <span style={styles.pendingBadge}>Pending</span>
                  )}
                </div>
              </div>

              {/* Action buttons for current stop */}
              {isCurrent && (
                <div style={styles.stopActions}>
                  <button
                    onClick={() => handleNavigate(stop)}
                    style={styles.navigateButton}
                    aria-label={`Navigate to ${stop.location_name}`}
                  >
                    🧭 Navigate
                  </button>
                  <button
                    onClick={() =>
                      isPickup
                        ? handleConfirmPickup(stop.id || index)
                        : handleConfirmDropoff(stop.id || index)
                    }
                    disabled={actionLoading}
                    style={{
                      ...styles.confirmStopButton,
                      opacity: actionLoading ? 0.6 : 1,
                    }}
                    aria-label={
                      isPickup ? "Confirm pickup" : "Confirm drop-off"
                    }
                  >
                    {actionLoading
                      ? "..."
                      : isPickup
                      ? "✓ Confirm Pickup"
                      : "✓ Confirm Drop-off"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
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
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "20px",
  },
  title: {
    fontSize: "22px",
    fontWeight: 700,
    color: "#FFFFFF",
  },
  headerBadge: {
    backgroundColor: "rgba(0,166,81,0.15)",
    borderRadius: "20px",
    padding: "6px 14px",
  },
  badgeText: {
    fontSize: "13px",
    fontWeight: 600,
    color: "#00A651",
  },
  earningsCard: {
    backgroundColor: "rgba(212,175,55,0.08)",
    border: "1px solid rgba(212,175,55,0.3)",
    borderRadius: "20px",
    padding: "20px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "20px",
  },
  earningsLabel: {
    fontSize: "14px",
    color: "rgba(255,255,255,0.7)",
  },
  earningsValue: {
    fontSize: "24px",
    fontWeight: 700,
    color: "#D4AF37",
  },
  errorBanner: {
    backgroundColor: "rgba(239,68,68,0.15)",
    border: "1px solid #EF4444",
    borderRadius: "12px",
    padding: "12px 16px",
    color: "#EF4444",
    fontSize: "14px",
    marginBottom: "16px",
    textAlign: "center",
  },
  stopsList: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  stopsTitle: {
    fontSize: "16px",
    fontWeight: 600,
    color: "#FFFFFF",
    marginBottom: "4px",
  },
  stopItem: {
    borderRadius: "16px",
    border: "1px solid rgba(255,255,255,0.1)",
    padding: "16px",
    transition: "all 300ms ease",
  },
  stopHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  stopInfo: {
    display: "flex",
    gap: "12px",
    alignItems: "flex-start",
  },
  stopIcon: {
    width: "32px",
    height: "32px",
    borderRadius: "8px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "16px",
    fontWeight: 700,
    flexShrink: 0,
  },
  stopName: {
    fontSize: "14px",
    fontWeight: 600,
    color: "#FFFFFF",
  },
  stopLocation: {
    fontSize: "12px",
    color: "rgba(255,255,255,0.5)",
    marginTop: "2px",
  },
  stopEta: {
    fontSize: "11px",
    color: "#00A651",
    marginTop: "4px",
  },
  stopStatus: {},
  completedBadge: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "24px",
    height: "24px",
    borderRadius: "50%",
    backgroundColor: "rgba(0,166,81,0.2)",
    color: "#00A651",
    fontSize: "14px",
    fontWeight: 700,
  },
  currentBadge: {
    fontSize: "11px",
    fontWeight: 600,
    color: "#00A651",
    backgroundColor: "rgba(0,166,81,0.15)",
    padding: "4px 10px",
    borderRadius: "10px",
  },
  pendingBadge: {
    fontSize: "11px",
    color: "rgba(255,255,255,0.4)",
  },
  stopActions: {
    display: "flex",
    gap: "8px",
    marginTop: "12px",
    paddingTop: "12px",
    borderTop: "1px solid rgba(255,255,255,0.08)",
  },
  navigateButton: {
    flex: 1,
    padding: "12px",
    borderRadius: "12px",
    border: "1px solid rgba(255,255,255,0.15)",
    backgroundColor: "rgba(255,255,255,0.06)",
    color: "#FFFFFF",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
    transition: "background-color 300ms ease",
  },
  confirmStopButton: {
    flex: 1,
    padding: "12px",
    borderRadius: "12px",
    border: "none",
    backgroundColor: "#00A651",
    color: "#FFFFFF",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
    transition: "opacity 300ms ease",
  },
};
