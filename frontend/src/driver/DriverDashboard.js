import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";

import { API_URL } from "../apiConfig";
import { MARKET, formatMoney } from "../marketConfig";
import GoogleTripMap from "../maps/GoogleTripMap";
import useDriverLocation from "./hooks/useDriverLocation";
import useDriverWebSocket from "./hooks/useDriverWebSocket";
import { useDriverContext } from "./context/DriverContext";
import RideStatusButtons from "../RideStatusButtons";
import SafetyEmergencyPanel from "../safety/SafetyEmergencyPanel";
import RideRequestCard from "./components/RideRequestCard";
import LevelBadge from "./components/LevelBadge";
import HamburgerMenu from "./components/HamburgerMenu";
import { playRideAlertChime, vibrateNative, preloadNotificationSound } from "../native/sound";

// ─── Yala Branding Colors ───────────────────────────────────────────────────
const COLORS = {
  primaryGreen: "#00A651",
  goldAccent: "#D4AF37",
  darkNavy: "#0B1220",
  white: "#FFFFFF",
  errorRed: "#EF4444",
  mauritaniaGreen: "#00A651",
  mauritaniaGold: "#D4AF37",
};

// ─── Notification Count Formatter ───────────────────────────────────────────
/**
 * Formats notification count for display.
 * Shows numeric count up to 99, shows "99+" when count exceeds 99.
 * @param {number} count - The unread notification count
 * @returns {string} Formatted count string
 */
export function formatNotificationCount(count) {
  if (count <= 0) return "";
  if (count > 99) return "99+";
  return String(count);
}

// ─── Heatmap Refresh Interval (ms) ─────────────────────────────────────────
const HEATMAP_REFRESH_INTERVAL = 60000;

// ─── Ride Request Countdown (seconds) ──────────────────────────────────────
const RIDE_REQUEST_COUNTDOWN = 30;

// ─── Helper: convert lat/lng to map point ───────────────────────────────────
const toPoint = (lat, lng) => {
  const point = [Number(lat), Number(lng)];
  return point.some(Number.isNaN) ? null : point;
};

// ─── Main Component ─────────────────────────────────────────────────────────
export default function DriverDashboard() {
  const token = localStorage.getItem("access");
  const driverContext = useDriverContext();
  const {
    state,
    setOnline,
    setActiveRide,
    setDriverProfile,
    setNotifications,
    setConnectionStatus,
    addNotification,
    setDriverLevel,
    logout,
  } = driverContext;

  const [todayEarnings, setTodayEarnings] = useState(0);
  const [rideRequest, setRideRequest] = useState(null);
  const [heatmapZones, setHeatmapZones] = useState([]);
  const [routeToPickup, setRouteToPickup] = useState([]);
  const [showSafetyPanel, setShowSafetyPanel] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const alertSoundTimeoutsRef = useRef([]);

  const authHeaders = useMemo(
    () => ({ headers: { Authorization: `Bearer ${token}` } }),
    [token]
  );

  const defaultLocation = useMemo(
    () => ({ lat: MARKET.defaultPickup.position[0], lng: MARKET.defaultPickup.position[1] }),
    []
  );

  // ─── Location Tracking ──────────────────────────────────────────────────
  const handleLocationUpdate = useCallback(
    (coords) => {
      if (!token) return;
      axios
        .post(
          `${API_URL}/drivers/location/update/`,
          { current_lat: coords.lat, current_lng: coords.lng },
          authHeaders
        )
        .catch((err) => console.log("Location update error:", err));
    },
    [authHeaders, token]
  );

  const { location, locationError, isTracking } = useDriverLocation({
    isOnline: state.isOnline,
    onLocationUpdate: handleLocationUpdate,
    defaultLocation,
  });

  // ─── WebSocket ──────────────────────────────────────────────────────────
  const handleWebSocketMessage = useCallback(
    (data) => {
      switch (data.type) {
        case "ride_request":
          // Only show ride request if status is "requested" (not already accepted/cancelled)
          if (data.status && data.status !== "requested") {
            // Stale request — another driver already accepted or rider cancelled
            break;
          }
          setRideRequest(data);
          alertSoundTimeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
          alertSoundTimeoutsRef.current = [];
          // Play notification sound and vibrate for new ride request
          playRideAlertChime().catch(() => {});
          vibrateNative(true).catch(() => {});
          // One clean follow-up chime keeps it noticeable without sounding noisy.
          const followUpId = setTimeout(() => playRideAlertChime().catch(() => {}), 760);
          alertSoundTimeoutsRef.current.push(followUpId);
          break;
        case "ride_status_update":
          if (data.status === "cancelled" || data.status === "completed") {
            setActiveRide(null);
            setRideRequest(null);
          }
          // Dismiss ride request card if another driver accepted the ride
          if (data.status === "accepted" || data.status === "driver_arriving") {
            setRideRequest((current) => {
              // Clear if the status update is for the same ride we're showing
              if (current && (current.ride_id === data.ride_id || current.id === data.ride_id)) {
                return null;
              }
              return current;
            });
          }
          break;
        case "chat_message":
          // Chat messages handled by CommunicationPanel
          addNotification({
            id: Date.now(),
            type: "chat_message",
            message: data.message || "New message from rider",
            timestamp: new Date().toISOString(),
          });
          break;
        case "document_status":
          addNotification({
            id: Date.now(),
            type: "document_status",
            message: data.message || `Document ${data.status || "updated"}`,
            timestamp: new Date().toISOString(),
          });
          break;
        case "achievement_unlocked":
          addNotification({
            id: Date.now(),
            type: "achievement_unlocked",
            message: data.message || `Achievement unlocked: ${data.name || ""}`,
            achievement: data,
            timestamp: new Date().toISOString(),
          });
          break;
        case "level_change":
          setDriverLevel({
            level: data.new_level || data.level,
            progress: data.progress || 0,
          });
          addNotification({
            id: Date.now(),
            type: "level_change",
            message: data.message || `Level changed to ${data.new_level || data.level}`,
            timestamp: new Date().toISOString(),
          });
          break;
        case "location_update":
          // Location updates from server (e.g., rider location during ride)
          break;
        default:
          break;
      }
    },
    [setActiveRide, addNotification, setDriverLevel]
  );

  const { isConnected, connectionError, sendMessage } = useDriverWebSocket({
    isOnline: state.isOnline,
    onMessage: handleWebSocketMessage,
    token,
  });

  // Sync connection status to context
  useEffect(() => {
    setConnectionStatus({ isConnected, error: connectionError });
  }, [isConnected, connectionError, setConnectionStatus]);

  // ─── Fetch Driver Profile & Earnings ────────────────────────────────────
  const fetchDriverData = useCallback(async () => {
    if (!token) return;
    try {
      const [profileRes, earningsRes] = await Promise.all([
        axios.get(`${API_URL}/drivers/me/`, authHeaders),
        axios.get(`${API_URL}/rides/driver/earnings/`, authHeaders),
      ]);
      setDriverProfile(profileRes.data);
      setOnline(Boolean(profileRes.data.is_available));
      setTodayEarnings(earningsRes.data?.today_earnings || 0);
    } catch (err) {
    }
  }, [authHeaders, token, setDriverProfile, setOnline]);

  useEffect(() => {
    fetchDriverData();
  }, [fetchDriverData]);

  // ─── Fetch Heatmap Zones (60-second refresh) ───────────────────────────
  const fetchHeatmap = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/drivers/heatmap/`, authHeaders);
      setHeatmapZones(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      // Heatmap endpoint may not exist yet; silently ignore
      setHeatmapZones([]);
    }
  }, [authHeaders]);

  useEffect(() => {
    if (!state.isOnline) return;
    fetchHeatmap();
    const interval = setInterval(fetchHeatmap, HEATMAP_REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [state.isOnline, fetchHeatmap]);

  // ─── Preload notification sound on mount ───────────────────────────────
  useEffect(() => {
    preloadNotificationSound();
    return () => {
      alertSoundTimeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
      alertSoundTimeoutsRef.current = [];
    };
  }, []);

  // ─── Fetch Notifications ────────────────────────────────────────────────
  const fetchNotifications = useCallback(async () => {
    if (!token) return;
    try {
      const response = await axios.get(`${API_URL}/drivers/me/notifications/`, authHeaders);
      const data = response.data;
      setNotifications({
        items: data.items || [],
        unreadCount: data.unread_count ?? data.unreadCount ?? 0,
      });
    } catch (err) {
      // Notifications endpoint may not exist yet
    }
  }, [authHeaders, token, setNotifications]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // ─── Route Preview (driver → pickup) ───────────────────────────────────
  const activeRide = state.activeRide || rideRequest;
  const driverPoint = useMemo(
    () => [location?.lat || defaultLocation.lat, location?.lng || defaultLocation.lng],
    [location, defaultLocation]
  );

  const pickupPoint = useMemo(
    () => toPoint(activeRide?.pickup_lat, activeRide?.pickup_lng),
    [activeRide]
  );

  useEffect(() => {
    if (!driverPoint || !pickupPoint) {
      setRouteToPickup([]);
      return;
    }

    let cancelled = false;

    const fetchRoute = async () => {
      try {
        const url = `https://router.project-osrm.org/route/v1/driving/${driverPoint[1]},${driverPoint[0]};${pickupPoint[1]},${pickupPoint[0]}?overview=full&geometries=geojson`;
        const response = await fetch(url);
        const data = await response.json();
        const route = data.routes?.[0];
        if (!cancelled && route) {
          setRouteToPickup(route.geometry.coordinates.map(([lng, lat]) => [lat, lng]));
        }
      } catch (err) {
        if (!cancelled) {
          // Fallback: straight line between driver and pickup
          setRouteToPickup([driverPoint, pickupPoint]);
        }
      }
    };

    fetchRoute();
    return () => { cancelled = true; };
  }, [driverPoint, pickupPoint]);

  // ─── Map Markers ───────────────────────────────────────────────────────
  const markers = useMemo(() => {
    const list = [
      {
        id: "driver",
        position: driverPoint,
        title: "Your location",
        label: "D",
        type: "driver",
      },
    ];
    if (pickupPoint) {
      list.push({
        id: "pickup",
        position: pickupPoint,
        title: `Pickup: ${activeRide?.pickup || activeRide?.pickup_address || "Pickup"}`,
        label: "P",
      });
    }
    return list;
  }, [driverPoint, pickupPoint, activeRide]);

  // ─── Heatmap Circles for Map ───────────────────────────────────────────
  const heatmapCircles = useMemo(
    () =>
      heatmapZones
        .filter((zone) => zone.active !== false)
        .map((zone, idx) => ({
          id: `heatmap-${idx}`,
          center: [zone.center_lat, zone.center_lng],
          radius: (zone.radius_km || 1) * 1000,
          color: `rgba(0, 166, 81, ${0.15 + (zone.intensity || 0.5) * 0.35})`,
          fillColor: `rgba(0, 166, 81, ${0.1 + (zone.intensity || 0.5) * 0.25})`,
        })),
    [heatmapZones]
  );

  // ─── Polylines (route preview) ─────────────────────────────────────────
  const polylines = useMemo(() => {
    if (routeToPickup.length < 2) return [];
    return [
      {
        id: "route-to-pickup",
        path: routeToPickup,
        color: COLORS.primaryGreen,
        weight: 5,
        opacity: 0.8,
        animated: true,
      },
    ];
  }, [routeToPickup]);

  // ─── GPS Unavailable Error State ───────────────────────────────────────
  if (locationError && locationError.includes("Location access is required")) {
    return (
      <div style={gpsErrorContainerStyle}>
        {/* Subtle Mauritania flag accent - green/gold stripe at top */}
        <div style={mauritaniaAccentBarStyle} />
        <div style={gpsErrorCardStyle}>
          <div style={gpsErrorIconStyle}>📍</div>
          <h2 style={gpsErrorTitleStyle}>GPS Unavailable</h2>
          <p style={gpsErrorTextStyle}>
            Location access is required to use the Yala Driver App.
            Please enable location services in your device settings to
            see the map and receive ride requests.
          </p>
          <button
            style={gpsErrorButtonStyle}
            onClick={() => window.location.reload()}
            aria-label="Retry enabling GPS"
          >
            Enable Location & Retry
          </button>
          <p style={gpsErrorHintStyle}>
            Settings → Privacy → Location Services → Enable
          </p>
        </div>
      </div>
    );
  }

  const profile = state.driverProfile;
  const unreadCount = state.notifications?.unreadCount || 0;

  return (
    <div style={dashboardContainerStyle}>
      {/* Full-Screen Map */}
      <div style={fullScreenMapStyle}>
        <GoogleTripMap
          center={driverPoint}
          zoom={15}
          style={mapFillStyle}
          fitPoints={[driverPoint, pickupPoint].filter(Boolean)}
          markers={markers}
          polylines={polylines}
          circles={heatmapCircles}
        />
      </div>

      {/* Mauritania Identity: subtle crescent & star watermark */}
      <div style={mauritaniaWatermarkStyle} aria-hidden="true">
        ☪
      </div>

      {/* Top Bar Overlay: Hamburger + Profile + Notifications */}
      <div style={topBarStyle}>
        <div style={profileAreaStyle}>
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            style={hamburgerButtonStyle}
            aria-label="Open menu"
          >
            ☰
          </button>
          {profile?.profile_picture || profile?.driver_photo ? (
            <img
              src={profile.profile_picture || profile.driver_photo}
              alt={profile?.full_name || "Driver"}
              style={profilePhotoStyle}
            />
          ) : (
            <div style={profilePhotoPlaceholderStyle}>
              {(profile?.full_name || "D")[0].toUpperCase()}
            </div>
          )}
          <div style={profileInfoStyle}>
            <span style={profileNameStyle}>
              {profile?.full_name || profile?.first_name || "Driver"}
            </span>
            <div style={profileMetaStyle}>
              <LevelBadge level={profile?.driver_level || profile?.driver_category || "bronze"} />
              <span style={earningsTextStyle}>
                {formatMoney(todayEarnings)} today
              </span>
            </div>
          </div>
        </div>

        <div style={notificationAreaStyle}>
          <button
            style={driverHeaderSafetyButtonStyle}
            onClick={() => setShowSafetyPanel(true)}
            aria-label="Open driver safety center"
          >
            Safety
          </button>
          <button style={notificationButtonStyle} aria-label="Notifications">
            <span style={bellIconStyle}>🔔</span>
            {unreadCount > 0 && (
              <span style={notificationBadgeStyle}>
                {formatNotificationCount(unreadCount)}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Ride Request Card Overlay */}
      {rideRequest && !state.activeRide && (
        <div style={rideRequestOverlayStyle}>
          <RideRequestCard
            ride={rideRequest}
            onAccept={async () => {
              try {
                const response = await axios.post(
                  `${API_URL}/rides/accept/${rideRequest.ride_id || rideRequest.id}/`,
                  {},
                  authHeaders
                );
                const acceptedRide = response.data?.ride || response.data;
                setActiveRide(acceptedRide);
                setRideRequest(null);
                // Also send WebSocket notification for real-time broadcast
                sendMessage({ type: "ride_accept", ride_id: rideRequest.ride_id || rideRequest.id });
              } catch (error) {
                const errorMsg = error.response?.data?.detail || error.response?.data?.error || "Could not accept ride";
                setRideRequest(null);
                // Show error briefly
                alert(errorMsg);
              }
            }}
            onDecline={() => setRideRequest(null)}
            onExpired={() => setRideRequest(null)}
          />
        </div>
      )}

      {/* Active Ride Card Overlay */}
      {state.activeRide && (
        <div style={activeRideOverlayStyle}>
          <ActiveRideCard ride={state.activeRide} onStatusChange={(updatedRide) => {
            // Update active ride with new status data from the API response
            if (updatedRide && updatedRide.status) {
              if (updatedRide.status === "completed" || updatedRide.status === "cancelled") {
                setActiveRide(null);
              } else {
                setActiveRide(updatedRide.ride || updatedRide);
              }
            }
            fetchDriverData();
          }} />
        </div>
      )}

      {/* Connection Error Banner */}
      {connectionError && (
        <div style={connectionBannerStyle}>
          {connectionError}
        </div>
      )}

      {/* Hamburger Navigation Menu */}
      <HamburgerMenu
        isOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
        driverProfile={{
          first_name: profile?.first_name || "",
          last_name: profile?.last_name || "",
          profile_picture: profile?.profile_picture || profile?.driver_photo || "",
          level: profile?.driver_level || profile?.driver_category || "bronze",
          points: profile?.points || 0,
          nextLevelPoints: profile?.next_level_points || 2000,
        }}
        onNavigate={(path) => { window.location.href = path; }}
        onLogout={logout}
      />
    </div>
  );
}

// ─── Sub-Components ─────────────────────────────────────────────────────────

function ActiveRideCard({ ride, onStatusChange }) {
  const statusLabel = ride.status ? ride.status.replace(/_/g, " ") : "Active";
  const [showSafety, setShowSafety] = useState(false);

  return (
    <div style={activeRideCardStyle}>
      <div style={rideCardHeaderStyle}>
        <span style={rideCardLabelStyle}>{statusLabel}</span>
        <strong style={rideCardFareStyle}>{formatMoney(ride.fare)}</strong>
      </div>

      {/* Rider Information */}
      {(ride.rider_name || ride.rider_first_name) && (
        <div style={riderInfoRowStyle}>
          {ride.rider_picture ? (
            <img src={ride.rider_picture} alt="Rider" style={riderPhotoStyle} />
          ) : (
            <div style={riderFallbackStyle}>
              {(ride.rider_name || ride.rider_first_name || "R").slice(0, 1).toUpperCase()}
            </div>
          )}
          <div>
            <strong style={riderNameStyle}>{ride.rider_name || `${ride.rider_first_name || ""} ${ride.rider_last_name || ""}`.trim() || "Rider"}</strong>
            {ride.rider_phone && <span style={riderPhoneStyle}>{ride.rider_phone}</span>}
          </div>
        </div>
      )}

      <div style={rideCardBodyStyle}>
        <p style={rideCardRouteStyle}>
          <span style={routeIconStyle}>📍</span> {ride.pickup || ride.pickup_address || "Pickup"}
        </p>
        <p style={rideCardRouteStyle}>
          <span style={routeIconStyle}>🏁</span> {ride.destination || ride.destination_address || "Destination"}
        </p>
      </div>
      <button type="button" style={driverSosButtonStyle} onClick={() => setShowSafety(true)}>
        SOS Safety
      </button>
      <RideStatusButtons ride={ride} onStatusChange={onStatusChange} />
      {showSafety && (
        <div style={driverSafetyOverlayStyle}>
          <SafetyEmergencyPanel
            role="driver"
            currentRide={ride}
            onClose={() => setShowSafety(false)}
          />
        </div>
      )}
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const driverSosButtonStyle = {
  width: "100%",
  minHeight: "46px",
  marginBottom: "10px",
  border: "2px solid #fecaca",
  borderRadius: "6px",
  background: "#dc2626",
  color: "#fff",
  fontWeight: 950,
  cursor: "pointer",
};

const driverHeaderSafetyButtonStyle = {
  minHeight: "42px",
  border: "1px solid #fecaca",
  borderRadius: "6px",
  background: "#991b1b",
  color: "#fff",
  padding: "0 12px",
  fontWeight: 900,
  cursor: "pointer",
};

const driverSafetyOverlayStyle = {
  position: "fixed",
  inset: 0,
  zIndex: 3000,
  display: "grid",
  placeItems: "center",
  padding: "16px",
  background: "rgba(2, 6, 23, 0.78)",
};

const dashboardContainerStyle = {
  position: "relative",
  width: "100%",
  height: "100vh",
  overflow: "hidden",
  backgroundColor: COLORS.darkNavy,
};

const fullScreenMapStyle = {
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 1,
};

const mapFillStyle = {
  width: "100%",
  height: "100%",
};

// ─── Mauritania Identity Elements ───────────────────────────────────────────

const mauritaniaWatermarkStyle = {
  position: "absolute",
  bottom: "120px",
  right: "16px",
  zIndex: 2,
  fontSize: "28px",
  opacity: 0.12,
  color: COLORS.mauritaniaGold,
  pointerEvents: "none",
  userSelect: "none",
};

const mauritaniaAccentBarStyle = {
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  height: "3px",
  background: `linear-gradient(90deg, ${COLORS.mauritaniaGreen} 0%, ${COLORS.mauritaniaGold} 50%, ${COLORS.mauritaniaGreen} 100%)`,
  zIndex: 1000,
};

// ─── Top Bar ────────────────────────────────────────────────────────────────

const topBarStyle = {
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  zIndex: 100,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "12px 16px",
  background: "linear-gradient(180deg, rgba(11, 18, 32, 0.92) 0%, rgba(11, 18, 32, 0) 100%)",
  pointerEvents: "none",
};

const profileAreaStyle = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  pointerEvents: "auto",
};

const hamburgerButtonStyle = {
  width: "44px",
  height: "44px",
  border: "none",
  borderRadius: "12px",
  background: "rgba(255,255,255,0.1)",
  color: COLORS.white,
  fontSize: "22px",
  fontWeight: 900,
  cursor: "pointer",
  display: "grid",
  placeItems: "center",
  flexShrink: 0,
};

const profilePhotoStyle = {
  width: "44px",
  height: "44px",
  borderRadius: "50%",
  objectFit: "cover",
  border: `2px solid ${COLORS.goldAccent}`,
};

const profilePhotoPlaceholderStyle = {
  width: "44px",
  height: "44px",
  borderRadius: "50%",
  backgroundColor: COLORS.primaryGreen,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: COLORS.white,
  fontWeight: 900,
  fontSize: "18px",
  border: `2px solid ${COLORS.goldAccent}`,
};

const profileInfoStyle = {
  display: "flex",
  flexDirection: "column",
  gap: "2px",
};

const profileNameStyle = {
  color: COLORS.white,
  fontWeight: 800,
  fontSize: "14px",
};

const profileMetaStyle = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
};

const earningsTextStyle = {
  color: COLORS.goldAccent,
  fontSize: "12px",
  fontWeight: 700,
};



// ─── Notification ───────────────────────────────────────────────────────────

const notificationAreaStyle = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  pointerEvents: "auto",
};

const notificationButtonStyle = {
  position: "relative",
  background: "rgba(255, 255, 255, 0.12)",
  border: "none",
  borderRadius: "50%",
  width: "44px",
  height: "44px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  backdropFilter: "blur(8px)",
};

const bellIconStyle = {
  width: "22px",
  height: "22px",
  display: "grid",
  placeItems: "center",
  borderRadius: "50%",
  background: "rgba(255,255,255,0.14)",
  color: COLORS.white,
  fontSize: "14px",
  fontWeight: 700,
  lineHeight: 1,
};

const notificationBadgeStyle = {
  position: "absolute",
  top: "-2px",
  right: "-2px",
  minWidth: "18px",
  height: "18px",
  padding: "0 5px",
  borderRadius: "999px",
  backgroundColor: COLORS.errorRed,
  color: COLORS.white,
  fontSize: "10px",
  fontWeight: 900,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  lineHeight: 1,
};

// ─── Ride Request Overlay ───────────────────────────────────────────────────

const rideRequestOverlayStyle = {
  position: "absolute",
  bottom: "24px",
  left: "16px",
  right: "16px",
  zIndex: 200,
};

const activeRideOverlayStyle = {
  position: "absolute",
  bottom: "24px",
  left: "16px",
  right: "16px",
  zIndex: 200,
};

const rideCardStyle = {
  backgroundColor: "rgba(11, 18, 32, 0.95)",
  borderRadius: "20px",
  padding: "0 18px 18px",
  border: `1px solid ${COLORS.goldAccent}`,
  backdropFilter: "blur(12px)",
  boxShadow: "0 16px 48px rgba(0, 0, 0, 0.4)",
  overflow: "hidden",
};

const activeRideCardStyle = {
  backgroundColor: "rgba(11, 18, 32, 0.95)",
  borderRadius: "20px",
  padding: "18px",
  border: `1px solid ${COLORS.primaryGreen}`,
  backdropFilter: "blur(12px)",
  boxShadow: "0 16px 48px rgba(0, 0, 0, 0.4)",
};

const riderInfoRowStyle = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
  marginBottom: "14px",
  padding: "10px 12px",
  borderRadius: "12px",
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.1)",
};

const riderPhotoStyle = {
  width: "48px",
  height: "48px",
  borderRadius: "50%",
  objectFit: "cover",
};

const riderFallbackStyle = {
  width: "48px",
  height: "48px",
  borderRadius: "50%",
  display: "grid",
  placeItems: "center",
  background: COLORS.primaryGreen,
  color: "#fff",
  fontWeight: 950,
  fontSize: "18px",
};

const riderNameStyle = {
  display: "block",
  color: "#fff",
  fontWeight: 800,
  fontSize: "1rem",
};

const riderPhoneStyle = {
  display: "block",
  color: "rgba(255,255,255,0.6)",
  fontSize: "0.82rem",
  fontWeight: 600,
  marginTop: "2px",
};

const countdownBarContainerStyle = {
  width: "100%",
  height: "4px",
  backgroundColor: "rgba(255, 255, 255, 0.1)",
  borderRadius: "2px",
  marginBottom: "14px",
  overflow: "hidden",
};

const countdownBarStyle = {
  height: "100%",
  borderRadius: "2px",
  transition: "width 1s linear, background-color 0.3s ease",
};

const rideCardHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "8px",
};

const rideCardLabelStyle = {
  color: COLORS.goldAccent,
  fontSize: "12px",
  fontWeight: 900,
  textTransform: "uppercase",
};

const rideCardFareRowStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "12px",
};

const rideCardFareStyle = {
  color: COLORS.white,
  fontSize: "22px",
  fontWeight: 900,
};

const rideCardBodyStyle = {
  marginBottom: "14px",
};

const rideCardRouteStyle = {
  margin: "4px 0",
  color: "rgba(255, 255, 255, 0.85)",
  fontSize: "13px",
  fontWeight: 700,
  display: "flex",
  alignItems: "center",
  gap: "6px",
};

const routeIconStyle = {
  fontSize: "14px",
  flexShrink: 0,
};

const rideCardDistanceStyle = {
  color: "rgba(255, 255, 255, 0.6)",
  fontSize: "12px",
  fontWeight: 700,
};

const countdownTimerStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "36px",
  height: "36px",
  borderRadius: "50%",
  backgroundColor: "rgba(255, 255, 255, 0.08)",
  border: `2px solid ${COLORS.primaryGreen}`,
};

const countdownNumberStyle = {
  color: COLORS.white,
  fontSize: "12px",
  fontWeight: 900,
};

const rideCardActionsStyle = {
  display: "flex",
  gap: "10px",
};

const declineButtonStyle = {
  flex: 1,
  padding: "12px",
  borderRadius: "12px",
  border: "1px solid rgba(255, 255, 255, 0.2)",
  backgroundColor: "transparent",
  color: COLORS.white,
  fontWeight: 800,
  fontSize: "14px",
  cursor: "pointer",
};

const acceptButtonStyle = {
  flex: 1,
  padding: "12px",
  borderRadius: "12px",
  border: "none",
  backgroundColor: COLORS.primaryGreen,
  color: COLORS.white,
  fontWeight: 800,
  fontSize: "14px",
  cursor: "pointer",
};

// ─── Connection Banner ──────────────────────────────────────────────────────

const connectionBannerStyle = {
  position: "absolute",
  top: "80px",
  left: "16px",
  right: "16px",
  zIndex: 150,
  padding: "10px 14px",
  borderRadius: "12px",
  backgroundColor: "rgba(239, 68, 68, 0.9)",
  color: COLORS.white,
  fontSize: "12px",
  fontWeight: 700,
  textAlign: "center",
  backdropFilter: "blur(8px)",
};

// ─── GPS Error State ────────────────────────────────────────────────────────

const gpsErrorContainerStyle = {
  position: "relative",
  width: "100%",
  height: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: COLORS.darkNavy,
  padding: "24px",
};

const gpsErrorCardStyle = {
  maxWidth: "360px",
  width: "100%",
  padding: "32px 24px",
  borderRadius: "24px",
  backgroundColor: "rgba(255, 255, 255, 0.06)",
  border: "1px solid rgba(255, 255, 255, 0.1)",
  textAlign: "center",
  backdropFilter: "blur(12px)",
};

const gpsErrorIconStyle = {
  fontSize: "48px",
  marginBottom: "16px",
};

const gpsErrorTitleStyle = {
  color: COLORS.white,
  fontSize: "22px",
  fontWeight: 900,
  margin: "0 0 12px",
};

const gpsErrorTextStyle = {
  color: "rgba(255, 255, 255, 0.7)",
  fontSize: "14px",
  lineHeight: 1.5,
  margin: "0 0 24px",
};

const gpsErrorButtonStyle = {
  padding: "14px 32px",
  borderRadius: "12px",
  border: "none",
  backgroundColor: COLORS.primaryGreen,
  color: COLORS.white,
  fontWeight: 800,
  fontSize: "15px",
  cursor: "pointer",
  transition: "transform 0.2s ease, opacity 0.2s ease",
};

const gpsErrorHintStyle = {
  color: "rgba(255, 255, 255, 0.4)",
  fontSize: "11px",
  marginTop: "12px",
  fontStyle: "italic",
};
