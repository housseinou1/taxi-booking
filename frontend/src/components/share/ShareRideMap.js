import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import GoogleTripMap from "../../maps/GoogleTripMap";
import { WS_URL } from "../../apiConfig";

const DRIVER_UPDATE_INTERVAL = 5000; // 5 seconds

export default function ShareRideMap({ driverLocation, stops, myRideId }) {
  const [currentDriverLocation, setCurrentDriverLocation] = useState(
    driverLocation || null
  );
  const wsRef = useRef(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef(null);

  // Update driver location from props
  useEffect(() => {
    if (driverLocation) {
      setCurrentDriverLocation(driverLocation);
    }
  }, [driverLocation]);

  // WebSocket for real-time driver location updates
  useEffect(() => {
    const token = localStorage.getItem("access");
    if (!token) return;

    const connectWs = () => {
      const ws = new WebSocket(`${WS_URL}?token=${token}`);
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttemptRef.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "driver_location" || data.type === "location_update") {
            setCurrentDriverLocation({ lat: data.lat, lng: data.lng });
          }
        } catch (e) {
          // ignore
        }
      };

      ws.onclose = () => {
        const attempt = reconnectAttemptRef.current;
        const delay = Math.min(Math.pow(2, attempt) * 1000, 16000);
        reconnectAttemptRef.current = attempt + 1;
        reconnectTimerRef.current = setTimeout(connectWs, delay);
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connectWs();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
    };
  }, []);

  // Build markers from stops and driver location
  const markers = useMemo(() => {
    const result = [];

    // Driver marker (green car)
    if (currentDriverLocation) {
      result.push({
        id: "driver",
        position: [currentDriverLocation.lat, currentDriverLocation.lng],
        title: "Driver",
        type: "driver",
      });
    }

    // Stop markers
    if (stops && stops.length > 0) {
      stops.forEach((stop, index) => {
        // Skip completed stops
        if (stop.completed_at) return;

        const isMyStop =
          stop.ride_id === myRideId ||
          (stop.name && stop.name.includes("(You)"));
        const isPickup = stop.type === "pickup";

        let markerType = "destination";
        if (isPickup && isMyStop) markerType = "pickup";
        else if (isPickup && !isMyStop) markerType = "pickup";

        result.push({
          id: `stop-${index}`,
          position: [stop.lat, stop.lng],
          title: stop.name || `${stop.type} #${index + 1}`,
          type: markerType,
          label: isMyStop ? "You" : isPickup ? "P" : "D",
        });
      });
    }

    return result;
  }, [currentDriverLocation, stops, myRideId]);

  // Build polyline connecting all active stops
  const polylines = useMemo(() => {
    const activeStops = (stops || []).filter((s) => !s.completed_at);
    if (activeStops.length < 2 && !currentDriverLocation) return [];

    const path = [];

    // Start from driver location if available
    if (currentDriverLocation) {
      path.push([currentDriverLocation.lat, currentDriverLocation.lng]);
    }

    // Add all active stops in order
    activeStops.forEach((stop) => {
      path.push([stop.lat, stop.lng]);
    });

    if (path.length < 2) return [];

    return [
      {
        id: "route",
        path,
        color: "#00A651",
        weight: 4,
        opacity: 0.8,
        animated: true,
      },
    ];
  }, [stops, currentDriverLocation]);

  // Fit points for map bounds
  const fitPoints = useMemo(() => {
    const points = [];
    if (currentDriverLocation) {
      points.push([currentDriverLocation.lat, currentDriverLocation.lng]);
    }
    (stops || [])
      .filter((s) => !s.completed_at)
      .forEach((stop) => {
        points.push([stop.lat, stop.lng]);
      });
    return points;
  }, [currentDriverLocation, stops]);

  // Map center fallback
  const center = useMemo(() => {
    if (currentDriverLocation) {
      return [currentDriverLocation.lat, currentDriverLocation.lng];
    }
    if (stops && stops.length > 0) {
      return [stops[0].lat, stops[0].lng];
    }
    return [18.0735, -15.9582]; // Nouakchott default
  }, [currentDriverLocation, stops]);

  return (
    <div style={styles.mapContainer} aria-label="Share ride map">
      <GoogleTripMap
        center={center}
        markers={markers}
        polylines={polylines}
        fitPoints={fitPoints}
        style={{ borderRadius: "20px" }}
      />

      {/* Legend overlay */}
      <div style={styles.legend}>
        <div style={styles.legendItem}>
          <span style={{ ...styles.legendDot, backgroundColor: "#111827" }} />
          <span style={styles.legendText}>Driver</span>
        </div>
        <div style={styles.legendItem}>
          <span style={{ ...styles.legendDot, backgroundColor: "#16a34a" }} />
          <span style={styles.legendText}>Pickup</span>
        </div>
        <div style={styles.legendItem}>
          <span style={{ ...styles.legendDot, backgroundColor: "#dc2626" }} />
          <span style={styles.legendText}>Drop-off</span>
        </div>
      </div>
    </div>
  );
}

const styles = {
  mapContainer: {
    width: "100%",
    height: "300px",
    borderRadius: "20px",
    overflow: "hidden",
    position: "relative",
    marginBottom: "16px",
  },
  legend: {
    position: "absolute",
    bottom: "12px",
    left: "12px",
    backgroundColor: "rgba(11,18,32,0.85)",
    borderRadius: "10px",
    padding: "8px 12px",
    display: "flex",
    gap: "12px",
    zIndex: 10,
  },
  legendItem: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
  },
  legendDot: {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
  },
  legendText: {
    fontSize: "10px",
    color: "rgba(255,255,255,0.8)",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
};
