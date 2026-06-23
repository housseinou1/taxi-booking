import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";

import { API_URL } from "../apiConfig";
import { MARKET, isPointInServiceArea } from "../marketConfig";
import { subscribeRideUpdates } from "../socket";
import { preloadNotificationSound, unlockRideRequestSound, playRideRequestAlert } from "../native/sound";
import { getDriverApprovalNotice } from "./utils/documentReview";
import { isDriverLyftUI } from "../native/platform";

import DriverMapView from "./components/DriverMapView";
import { getNavigationDestination } from "./components/MultiStopProgress";
import EarningsHeader from "./components/EarningsHeader";
import NotificationIcon from "./components/NotificationIcon";
import HamburgerMenu from "./components/HamburgerMenu";
import DriverStatusPanel from "./components/DriverStatusPanel";
import RideRequestCard from "./components/RideRequestCard";
import DriverProfilePage from "./DriverProfilePage";
import RideStatusButtons from "../RideStatusButtons";
import "./driver-tokens.css";
import "./lyft-driver.css";

const DRIVER_SOUND_ENABLED_KEY = "driver_ride_sound_enabled";

const hamburgerButtonStyle = {
  position: "fixed",
  top: 16,
  left: 16,
  zIndex: 10,
  width: 44,
  height: 44,
  borderRadius: "50%",
  background: "rgba(11, 18, 32, 0.92)",
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  border: "none",
  color: "#fff",
  fontSize: 20,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
  WebkitTapHighlightColor: "transparent",
  padding: 0,
};

const noticeStyle = {
  position: "fixed",
  top: 70,
  left: 16,
  right: 16,
  zIndex: 10,
  padding: 12,
  background: "rgba(11, 18, 32, 0.92)",
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  borderRadius: 12,
  color: "#fff",
  fontSize: 13,
  fontWeight: 600,
  textAlign: "center",
};

// ─── Main Container ─────────────────────────────────────────────────────────

export default function DriverDashboardNew() {
  const lyftUI = isDriverLyftUI();
  // ─── State ──────────────────────────────────────────────────────────────────
  const [isOnline, setIsOnline] = useState(false);
  const [toggleLoading, setToggleLoading] = useState(false);
  const [driverProfile, setDriverProfile] = useState(null);
  const [driverPosition, setDriverPosition] = useState(null);
  const [earningsPeriod, setEarningsPeriod] = useState("today");
  const [earningsByPeriod, setEarningsByPeriod] = useState({
    today: 0,
    week: 0,
    month: 0,
    year: 0,
  });
  const [earningsDate, setEarningsDate] = useState(null);
  const [availableRides, setAvailableRides] = useState([]);
  const [driverRides, setDriverRides] = useState([]);
  const [routePath, setRoutePath] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [currentView, setCurrentView] = useState("dashboard");
  const [unreadNotifications] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [driverNotice, setDriverNotice] = useState("");

  const alertedRideIdsRef = useRef(new Set());
  const isOnlineRef = useRef(isOnline);

  useEffect(() => {
    isOnlineRef.current = isOnline;
  }, [isOnline]);

  const token = localStorage.getItem("access");

  const authHeaders = useMemo(
    () => ({
      headers: { Authorization: `Bearer ${token}` },
    }),
    [token]
  );

  // Derive active ride from driver rides
  const activeRide = useMemo(
    () =>
      driverRides.find((ride) =>
        ["driver_arriving", "accepted", "driver_arrived", "in_progress"].includes(ride.status)
      ) || null,
    [driverRides]
  );

  // Build a route preview path for DriverMapView, including intermediate stops.
  useEffect(() => {
    if (!activeRide) {
      setRoutePath([]);
      return;
    }

    const pickupPoint =
      Number.isFinite(Number(activeRide.pickup_lat)) && Number.isFinite(Number(activeRide.pickup_lng))
        ? [Number(activeRide.pickup_lat), Number(activeRide.pickup_lng)]
        : null;

    const destinationPoint =
      Number.isFinite(Number(activeRide.destination_lat)) &&
      Number.isFinite(Number(activeRide.destination_lng))
        ? [Number(activeRide.destination_lat), Number(activeRide.destination_lng)]
        : null;

    const sortedStops = Array.isArray(activeRide.stops)
      ? [...activeRide.stops].sort(
          (left, right) => Number(left.stop_order || 0) - Number(right.stop_order || 0)
        )
      : [];

    const stopPoints = sortedStops
      .map((stop) => {
        const lat = Number(stop.latitude);
        const lng = Number(stop.longitude);
        return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null;
      })
      .filter(Boolean);

    const points = [];
    if (driverPosition) points.push(driverPosition);

    if (activeRide.status === "in_progress") {
      const nextStop = getNavigationDestination(sortedStops, "in_progress");
      if (nextStop) {
        const lat = Number(nextStop.latitude);
        const lng = Number(nextStop.longitude);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          points.push([lat, lng]);
        }
      } else if (destinationPoint) {
        points.push(destinationPoint);
      }
    } else {
      if (pickupPoint) points.push(pickupPoint);
      stopPoints.forEach((point) => points.push(point));
      if (destinationPoint) points.push(destinationPoint);
    }

    setRoutePath(points.length >= 2 ? points : []);
  }, [activeRide, driverPosition]);

  // ─── Auth Error Handling ────────────────────────────────────────────────────

  const isAuthError = useCallback(
    (error) =>
      error.response?.status === 401 ||
      error.response?.data?.code === "token_not_valid" ||
      String(error.response?.data?.detail || "")
        .toLowerCase()
        .includes("token"),
    []
  );

  const sendToLogin = useCallback((message) => {
    localStorage.removeItem("access");
    localStorage.removeItem("refresh");
    localStorage.removeItem("user");
    window.location.href = "/login";
  }, []);

  const sendToStoredRoleDashboard = useCallback(() => {
    let user = {};
    try {
      user = JSON.parse(localStorage.getItem("user") || "{}");
    } catch (error) {
      user = {};
    }

    if (user.is_staff || user.is_superuser || user.role === "admin") {
      window.location.href = "/admin";
      return;
    }

    if (user.is_driver || user.user_type === "driver" || user.role === "driver") {
      window.location.href = "/driver-vehicle-setup";
      return;
    }

    window.location.href = "/rider-dashboard";
  }, []);

  // ─── API Hooks ──────────────────────────────────────────────────────────────

  const fetchDriverStatus = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/drivers/me/`, authHeaders);
      setDriverProfile(response.data);
      const online = Boolean(response.data.is_available);
      setIsOnline(online);
      if (online && localStorage.getItem(DRIVER_SOUND_ENABLED_KEY) === "1") {
        setSoundEnabled(true);
      }

      if (response.data.status && response.data.status !== "approved") {
        setDriverNotice(getDriverApprovalNotice(response.data));
      }
    } catch (error) {
      console.log("Driver status error:", error.response?.data || error);
      if (isAuthError(error)) {
        sendToLogin();
        return;
      }

      if ([403, 404].includes(error.response?.status)) {
        setDriverNotice("This account is not a driver. Opening the correct dashboard...");
        window.setTimeout(sendToStoredRoleDashboard, 700);
        return;
      }

      setDriverNotice(
        error.response?.data?.detail ||
          error.response?.data?.error ||
          "Please log in as a driver to go online."
      );
    }
  }, [authHeaders, isAuthError, sendToLogin, sendToStoredRoleDashboard]);

  const fetchAvailableRides = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/rides/available/`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("access")}` },
      });
      const rides = Array.isArray(response.data) ? response.data : [];
      setAvailableRides(rides);
    } catch (error) {
      console.log("Available rides error:", error.response?.data || error);
      setAvailableRides([]);
    }
  }, []);

  const fetchDriverRides = useCallback(async () => {
    try {
      const response = await axios.get(
        `${API_URL}/rides/driver-rides/`,
        authHeaders
      );
      setDriverRides(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.log("Driver rides error:", error.response?.data || error);
      setDriverRides([]);
    }
  }, [authHeaders]);

  const fetchDriverStats = useCallback(async () => {
    try {
      const response = await axios.get(
        `${API_URL}/rides/driver/earnings/`,
        authHeaders
      );
      const data = response.data || {};
      setEarningsByPeriod({
        today: data.today_earnings || 0,
        week: data.week_earnings || 0,
        month: data.month_earnings || 0,
        year: data.year_earnings || 0,
      });
      setEarningsDate(data.earnings_date || null);
    } catch (error) {
      console.log("Driver stats error:", error.response?.data || error);
    }
  }, [authHeaders]);

  const toggleAvailability = useCallback(async () => {
    setToggleLoading(true);
    try {
      const response = await axios.post(
        `${API_URL}/drivers/availability/toggle/`,
        {},
        authHeaders
      );
      const goingOnline = Boolean(response.data.is_available);
      setIsOnline(goingOnline);

      if (goingOnline) {
        await unlockRideRequestSound();
        setSoundEnabled(true);
        localStorage.setItem(DRIVER_SOUND_ENABLED_KEY, "1");
        setDriverNotice("Sound alerts enabled for new ride requests.");
      } else {
        setSoundEnabled(false);
        localStorage.removeItem(DRIVER_SOUND_ENABLED_KEY);
      }
    } catch (error) {
      console.log("Toggle availability error:", error.response?.data || error);
      if (isAuthError(error)) {
        sendToLogin();
        return;
      }
      setDriverNotice(
        error.response?.data?.detail ||
          error.response?.data?.error ||
          "Could not toggle availability."
      );
    } finally {
      setToggleLoading(false);
    }
  }, [authHeaders, isAuthError, sendToLogin]);

  const mergeIncomingRideRequest = useCallback((message) => {
    const rideId = message?.ride_id || message?.id;
    if (!rideId) return;

    setAvailableRides((prev) => {
      if (prev.some((ride) => String(ride.id || ride.ride_id) === String(rideId))) {
        return prev;
      }

      return [
        {
          id: rideId,
          ride_id: rideId,
          pickup: message.pickup,
          destination: message.destination,
          pickup_lat: message.pickup_lat,
          pickup_lng: message.pickup_lng,
          destination_lat: message.destination_lat,
          destination_lng: message.destination_lng,
          fare: message.fare,
          distance_km: message.distance_km,
          stop_count: message.stop_count,
          stops: message.stops,
          countdown: message.countdown || 30,
        },
        ...prev,
      ];
    });
  }, []);

  const updateDriverLocation = useCallback(
    async (location) => {
      try {
        await axios.post(
          `${API_URL}/drivers/location/update/`,
          {
            current_lat: location[0],
            current_lng: location[1],
          },
          authHeaders
        );
      } catch (error) {
        console.log("Location update error:", error.response?.data || error);
      }
    },
    [authHeaders]
  );

  // ─── Ride Request Handling ──────────────────────────────────────────────────

  const acceptRide = useCallback(
    async (rideId) => {
      try {
        const response = await axios.post(
          `${API_URL}/rides/accept/${rideId}/`,
          {},
          authHeaders
        );
        const acceptedRide = response.data?.ride || response.data || {};
        const requestRide = availableRides.find((ride) => ride.id === rideId) || {};
        const hydratedRide = {
          ...requestRide,
          ...acceptedRide,
          status: acceptedRide.status || requestRide.status || "accepted",
        };
        setDriverRides((prev) => {
          const nonActive = prev.filter(
            (ride) =>
              ride.id !== rideId &&
              !["driver_arriving", "accepted", "driver_arrived", "in_progress"].includes(ride.status)
          );
          return [hydratedRide, ...nonActive];
        });
        setAvailableRides((prev) => prev.filter((ride) => ride.id !== rideId));
        // Refetch after accept
        fetchAvailableRides();
        fetchDriverRides();
      } catch (error) {
        console.log("Accept ride error:", error.response?.data || error);
        if (isAuthError(error)) {
          sendToLogin();
          return;
        }
        setDriverNotice(
          error.response?.data?.detail ||
            error.response?.data?.error ||
            "Could not accept ride."
        );
      }
    },
    [authHeaders, availableRides, fetchAvailableRides, fetchDriverRides, isAuthError, sendToLogin]
  );

  const declineRide = useCallback((rideId) => {
    setAvailableRides((prev) => prev.filter((r) => r.id !== rideId));
    alertedRideIdsRef.current.delete(rideId);
  }, []);

  // Cancel active ride (driver side)
  const [driverCancelOpen, setDriverCancelOpen] = useState(false);
  const [driverCancelReason, setDriverCancelReason] = useState("");
  const [driverCancelling, setDriverCancelling] = useState(false);

  const cancelActiveRide = async () => {
    if (!activeRide || !driverCancelReason.trim()) return;
    try {
      setDriverCancelling(true);
      await axios.post(`${API_URL}/rides/cancel/${activeRide.id}/`, {
        reason: driverCancelReason.trim(),
        cancelled_by: "driver",
      }, { headers: { Authorization: `Bearer ${localStorage.getItem("access")}` } });
      setDriverCancelOpen(false);
      setDriverCancelReason("");
      fetchDriverRides();
    } catch (error) {
      console.log("Cancel error:", error.response?.data || error);
    } finally {
      setDriverCancelling(false);
    }
  };

  // ─── Navigation / Logout ────────────────────────────────────────────────────

  const logout = useCallback(() => {
    localStorage.removeItem("access");
    localStorage.removeItem("refresh");
    localStorage.removeItem("user");
    window.location.href = "/login";
  }, []);

  // ─── Effects ────────────────────────────────────────────────────────────────

  // On mount: fetch initial data + preload sound
  useEffect(() => {
    fetchDriverStatus();
    fetchAvailableRides();
    fetchDriverStats();
    preloadNotificationSound();
  }, [fetchDriverStatus, fetchAvailableRides, fetchDriverStats]);

  // Refetch earnings when the calendar day rolls over (Today resets at midnight).
  useEffect(() => {
    const getLocalDateKey = () => {
      const now = new Date();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const day = String(now.getDate()).padStart(2, "0");
      return `${now.getFullYear()}-${month}-${day}`;
    };

    const checkCalendarDay = () => {
      const localToday = getLocalDateKey();
      if (earningsDate && earningsDate !== localToday) {
        fetchDriverStats();
        fetchDriverStatus();
      }
    };

    checkCalendarDay();
    const interval = setInterval(checkCalendarDay, 60000);
    return () => clearInterval(interval);
  }, [earningsDate, fetchDriverStats, fetchDriverStatus]);

  // Poll every 3s
  useEffect(() => {
    const interval = setInterval(() => {
      fetchDriverStatus();
      fetchAvailableRides();
      fetchDriverRides();
    }, 3000);
    return () => clearInterval(interval);
  }, [fetchDriverStatus, fetchAvailableRides, fetchDriverRides]);

  // WebSocket subscription
  useEffect(() => {
    const unsub = subscribeRideUpdates((msg) => {
      if (!msg) return;

      if (msg.type === "ride_request" && isOnlineRef.current) {
        mergeIncomingRideRequest(msg);
        playRideRequestAlert({ force: true });
      }

      if (
        msg.type === "ride_request" ||
        msg.type === "ride_request_expired" ||
        msg.type === "ride_update" ||
        msg.type === "ride_status_update" ||
        msg.status ||
        msg.ride_id
      ) {
        fetchAvailableRides();
        fetchDriverRides();
        fetchDriverStats();
      }
    });
    return () => unsub();
  }, [
    fetchAvailableRides,
    fetchDriverRides,
    fetchDriverStats,
    mergeIncomingRideRequest,
  ]);

  // Geolocation: watch driver position
  useEffect(() => {
    if (!navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const newPos = [position.coords.latitude, position.coords.longitude];
        if (isPointInServiceArea(newPos)) {
          setDriverPosition(newPos);
          updateDriverLocation(newPos);
        } else {
          // Fallback to default position if outside service area
          const fallback = MARKET.defaultPickup.position;
          setDriverPosition(fallback);
        }
      },
      (error) => {
        console.log("Geolocation error:", error);
        // Set default position if geo fails
        setDriverPosition(MARKET.defaultPickup.position);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 12000,
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [updateDriverLocation]);

  // Sound alert when new rides appear
  useEffect(() => {
    if (!isOnline || availableRides.length === 0 || !soundEnabled) return;

    const newRideIds = availableRides
      .map((ride) => ride.id || ride.ride_id)
      .filter((id) => id && !alertedRideIdsRef.current.has(id));

    if (newRideIds.length === 0) return;

    newRideIds.forEach((id) => alertedRideIdsRef.current.add(id));
  }, [availableRides, isOnline, soundEnabled]);

  const incomingRide = availableRides[0] || null;
  const incomingRideId = incomingRide?.id || incomingRide?.ride_id;

  // ─── Render ─────────────────────────────────────────────────────────────────

  // Show profile page if selected from menu
  if (currentView === "profile") {
    return <DriverProfilePage onBack={() => setCurrentView("dashboard")} initialTab="personal" />;
  }
  if (currentView === "documents") {
    return <DriverProfilePage onBack={() => setCurrentView("dashboard")} initialTab="documents" />;
  }

  return (
    <main
      className={lyftUI ? "driver-app--lyft" : undefined}
      style={{
        position: "relative",
        width: "100%",
        height: "100vh",
        overflow: "hidden",
      }}
    >
      <DriverMapView
        driverPosition={driverPosition}
        activeRide={activeRide}
        routePath={routePath}
      />

      <EarningsHeader
        earnings={earningsByPeriod[earningsPeriod] ?? 0}
        period={earningsPeriod}
        onPeriodChange={setEarningsPeriod}
        lyftUI={lyftUI}
        onTap={() => {
          window.location.href = "/driver/earnings";
        }}
      />

      {/* Hamburger menu button - top left */}
      <button
        onClick={() => setMenuOpen(true)}
        className={lyftUI ? "driver-dashboard__menu-btn" : undefined}
        style={lyftUI ? {
          position: "fixed",
          top: 16,
          left: 16,
          zIndex: 10,
          width: 44,
          height: 44,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          padding: 0,
        } : hamburgerButtonStyle}
        aria-label="Open menu"
        type="button"
      >
        ☰
      </button>

      <NotificationIcon
        unreadCount={unreadNotifications}
        onTap={() => {
          /* show notifications */
        }}
      />

      {/* Notice bar (if driverNotice) */}
      {driverNotice && (
        <div className={lyftUI ? "driver-dashboard__notice" : undefined} style={lyftUI ? {
          position: "fixed",
          top: 70,
          left: 16,
          right: 16,
          zIndex: 10,
          padding: 12,
          borderRadius: 12,
          fontSize: 13,
          fontWeight: 600,
          textAlign: "center",
        } : noticeStyle}
        >
          {driverNotice}
        </div>
      )}

      {/* Ride request overlay when new rides available */}
      {isOnline && incomingRide && !activeRide && (
        <RideRequestCard
          ride={incomingRide}
          enableSound
          onAccept={() => incomingRideId && acceptRide(incomingRideId)}
          onDecline={() => incomingRideId && declineRide(incomingRideId)}
          onExpired={() => incomingRideId && declineRide(incomingRideId)}
        />
      )}

      <DriverStatusPanel
        isOnline={isOnline}
        loading={toggleLoading}
        onToggle={toggleAvailability}
        activeRide={activeRide}
        driverLevel={{
          level: driverProfile?.driver_level || "bronze",
          points: driverProfile?.level_points || 0,
          nextLevelPoints: driverProfile?.next_level_points || 3000,
        }}
        onCancelRide={() => setDriverCancelOpen(true)}
        rideActions={
          activeRide ? (
            <RideStatusButtons
              ride={activeRide}
              onStatusChange={() => {
                fetchDriverRides();
                fetchDriverStats();
              }}
            />
          ) : null
        }
      />

      {/* Driver cancel modal */}
      {driverCancelOpen && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 100, padding: 20, borderRadius: "20px 20px 0 0", background: "#fff", boxShadow: "0 -4px 30px rgba(0,0,0,0.2)", color: "#0B1220", maxHeight: "60vh", overflowY: "auto" }}>
          <h3 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 800 }}>Cancel this ride?</h3>
          <p style={{ margin: "0 0 12px", fontSize: 13, color: "#64748b" }}>Select a reason:</p>
          {["Rider not available", "Emergency", "Waited too long", "Wrong pickup location", "Vehicle issue", "Other"].map((reason) => (
            <button key={reason} type="button" onClick={() => setDriverCancelReason(reason)}
              style={{ display: "block", width: "100%", padding: "10px 14px", marginBottom: 6, borderRadius: 8, border: driverCancelReason === reason ? "2px solid #EF4444" : "1px solid #e2e8f0", background: driverCancelReason === reason ? "#fef2f2" : "#f8fafc", textAlign: "left", fontSize: 14, cursor: "pointer" }}>
              {reason}
            </button>
          ))}
          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <button type="button" onClick={() => setDriverCancelOpen(false)} style={{ flex: 1, padding: 12, borderRadius: 10, border: "1px solid #e2e8f0", background: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Keep Ride</button>
            <button type="button" onClick={cancelActiveRide} disabled={!driverCancelReason || driverCancelling} style={{ flex: 1, padding: 12, borderRadius: 10, border: "none", background: "#EF4444", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", opacity: !driverCancelReason || driverCancelling ? 0.5 : 1 }}>
              {driverCancelling ? "Cancelling..." : "Confirm Cancel"}
            </button>
          </div>
        </div>
      )}

      <HamburgerMenu
        isOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
        driverProfile={{
          first_name:
            driverProfile?.user?.first_name || driverProfile?.first_name || "",
          last_name:
            driverProfile?.user?.last_name || driverProfile?.last_name || "",
          profile_picture:
            driverProfile?.driver_photo ||
            driverProfile?.profile_picture ||
            "",
          level: driverProfile?.driver_level || "bronze",
          points: driverProfile?.level_points || 0,
          nextLevelPoints: driverProfile?.next_level_points || 3000,
        }}
        onNavigate={(path) => {
          if (path === "/driver/account" || path === "/driver/profile") {
            setCurrentView("profile");
            setMenuOpen(false);
          } else if (path === "/driver/documents") {
            setCurrentView("documents");
            setMenuOpen(false);
          } else {
            window.location.href = path;
          }
        }}
        onLogout={logout}
      />
    </main>
  );
}
