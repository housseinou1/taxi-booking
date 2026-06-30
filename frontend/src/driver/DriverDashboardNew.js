import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";

import { API_URL } from "../apiConfig";
import { MARKET, isPointInServiceArea } from "../marketConfig";
import { subscribeRideUpdates } from "../socket";
import { preloadNotificationSound, unlockRideRequestSound, playRideRequestAlert } from "../native/sound";
import { getDriverApprovalNotice } from "./utils/documentReview";
import { isDeliveryAppInstall, isDriverLyftUI } from "../native/platform";

import DriverMapView from "./components/DriverMapView";
import { getNavigationDestination } from "./components/MultiStopProgress";
import HamburgerMenu from "./components/HamburgerMenu";
import DriverStatusPanel from "./components/DriverStatusPanel";
import RideRequestCard from "./components/RideRequestCard";
import DriverProfilePage from "./DriverProfilePage";
import RideStatusButtons from "../RideStatusButtons";
import "./driver-tokens.css";
import "./lyft-driver.css";

const DRIVER_SOUND_ENABLED_KEY = "driver_ride_sound_enabled";
const formatMRU = (v) => `${Number(v || 0).toLocaleString()} MRU`;

// ─── Main Container ─────────────────────────────────────────────────────────

export default function DriverDashboardNew() {
  useEffect(() => {
    if (isDeliveryAppInstall()) {
      window.location.replace("/delivery/courier");
    }
  }, []);

  const lyftUI = isDriverLyftUI();

  // ─── State ──────────────────────────────────────────────────────────────────
  const [isOnline, setIsOnline] = useState(false);
  const [toggleLoading, setToggleLoading] = useState(false);
  const [driverProfile, setDriverProfile] = useState(null);
  const [driverPosition, setDriverPosition] = useState(null);
  const [earningsByPeriod, setEarningsByPeriod] = useState({
    today: 0, week: 0, month: 0, year: 0,
  });
  const [earningsDate, setEarningsDate] = useState(null);
  const [availableRides, setAvailableRides] = useState([]);
  const [driverRides, setDriverRides] = useState([]);
  const [routePath, setRoutePath] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [currentView, setCurrentView] = useState("dashboard");
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [driverNotice, setDriverNotice] = useState("");

  const alertedRideIdsRef = useRef(new Set());
  const isOnlineRef = useRef(isOnline);

  useEffect(() => {
    isOnlineRef.current = isOnline;
  }, [isOnline]);

  const token = localStorage.getItem("access");

  const authHeaders = useMemo(
    () => ({ headers: { Authorization: `Bearer ${token}` } }),
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
      String(error.response?.data?.detail || "").toLowerCase().includes("token"),
    []
  );

  const sendToLogin = useCallback(() => {
    localStorage.removeItem("access");
    localStorage.removeItem("refresh");
    localStorage.removeItem("user");
    window.location.href = "/login";
  }, []);

  const sendToStoredRoleDashboard = useCallback(() => {
    let user = {};
    try { user = JSON.parse(localStorage.getItem("user") || "{}"); } catch (e) { user = {}; }

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
      if (isAuthError(error)) { sendToLogin(); return; }
      if ([403, 404].includes(error.response?.status)) {
        setDriverNotice("This account is not a driver. Opening the correct dashboard...");
        window.setTimeout(sendToStoredRoleDashboard, 700);
        return;
      }
      setDriverNotice(
        error.response?.data?.detail || error.response?.data?.error || "Please log in as a driver to go online."
      );
    }
  }, [authHeaders, isAuthError, sendToLogin, sendToStoredRoleDashboard]);

  const fetchAvailableRides = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/rides/available/`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("access")}` },
      });
      setAvailableRides(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.log("Available rides error:", error.response?.data || error);
      setAvailableRides([]);
    }
  }, []);

  const fetchDriverRides = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/rides/driver-rides/`, authHeaders);
      setDriverRides(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.log("Driver rides error:", error.response?.data || error);
      setDriverRides([]);
    }
  }, [authHeaders]);

  const fetchDriverStats = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/rides/driver/earnings/`, authHeaders);
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
      const response = await axios.post(`${API_URL}/drivers/availability/toggle/`, {}, authHeaders);
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
      if (isAuthError(error)) { sendToLogin(); return; }
      setDriverNotice(error.response?.data?.detail || error.response?.data?.error || "Could not toggle availability.");
    } finally {
      setToggleLoading(false);
    }
  }, [authHeaders, isAuthError, sendToLogin]);

  const mergeIncomingRideRequest = useCallback((message) => {
    const rideId = message?.ride_id || message?.id;
    if (!rideId) return;
    setAvailableRides((prev) => {
      if (prev.some((ride) => String(ride.id || ride.ride_id) === String(rideId))) return prev;
      return [{
        id: rideId, ride_id: rideId,
        pickup: message.pickup, destination: message.destination,
        pickup_lat: message.pickup_lat, pickup_lng: message.pickup_lng,
        destination_lat: message.destination_lat, destination_lng: message.destination_lng,
        fare: message.fare, distance_km: message.distance_km,
        stop_count: message.stop_count, stops: message.stops,
        countdown: message.countdown || 30,
      }, ...prev];
    });
  }, []);

  const updateDriverLocation = useCallback(async (location) => {
    try {
      await axios.post(`${API_URL}/drivers/location/update/`, { current_lat: location[0], current_lng: location[1] }, authHeaders);
    } catch (error) {
      console.log("Location update error:", error.response?.data || error);
    }
  }, [authHeaders]);

  // ─── Ride Request Handling ──────────────────────────────────────────────────

  const acceptRide = useCallback(async (rideId) => {
    try {
      const response = await axios.post(`${API_URL}/rides/accept/${rideId}/`, {}, authHeaders);
      const acceptedRide = response.data?.ride || response.data || {};
      const requestRide = availableRides.find((ride) => ride.id === rideId) || {};
      const hydratedRide = { ...requestRide, ...acceptedRide, status: acceptedRide.status || requestRide.status || "accepted" };
      setDriverRides((prev) => {
        const nonActive = prev.filter((ride) => ride.id !== rideId && !["driver_arriving", "accepted", "driver_arrived", "in_progress"].includes(ride.status));
        return [hydratedRide, ...nonActive];
      });
      setAvailableRides((prev) => prev.filter((ride) => ride.id !== rideId));
      fetchAvailableRides();
      fetchDriverRides();
    } catch (error) {
      console.log("Accept ride error:", error.response?.data || error);
      if (isAuthError(error)) { sendToLogin(); return; }
      setDriverNotice(error.response?.data?.detail || error.response?.data?.error || "Could not accept ride.");
    }
  }, [authHeaders, availableRides, fetchAvailableRides, fetchDriverRides, isAuthError, sendToLogin]);

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
        reason: driverCancelReason.trim(), cancelled_by: "driver",
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

  useEffect(() => {
    fetchDriverStatus();
    fetchAvailableRides();
    fetchDriverStats();
    preloadNotificationSound();
  }, [fetchDriverStatus, fetchAvailableRides, fetchDriverStats]);

  // Refetch earnings when the calendar day rolls over
  useEffect(() => {
    const getLocalDateKey = () => {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
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
      if (msg.type === "ride_request" || msg.type === "ride_request_expired" || msg.type === "ride_update" || msg.type === "ride_status_update" || msg.status || msg.ride_id) {
        fetchAvailableRides();
        fetchDriverRides();
        fetchDriverStats();
      }
    });
    return () => unsub();
  }, [fetchAvailableRides, fetchDriverRides, fetchDriverStats, mergeIncomingRideRequest]);

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
          setDriverPosition(MARKET.defaultPickup.position);
        }
      },
      () => { setDriverPosition(MARKET.defaultPickup.position); },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 12000 }
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

  // ─── Derived profile data ───────────────────────────────────────────────────
  const driverName = [
    driverProfile?.user?.first_name || driverProfile?.first_name || "",
    driverProfile?.user?.last_name || driverProfile?.last_name || "",
  ].filter(Boolean).join(" ") || "Yala Driver";
  const driverPhoto = driverProfile?.driver_photo || driverProfile?.profile_picture || "";
  const driverRating = Number(driverProfile?.average_rating || driverProfile?.rating || 0);
  const vehicleMake = driverProfile?.vehicle?.make || driverProfile?.vehicle_make || driverProfile?.car_make || "";
  const vehicleModel = driverProfile?.vehicle?.model || driverProfile?.vehicle_model || driverProfile?.car_model || "";
  const vehiclePlate = driverProfile?.vehicle?.plate_number || driverProfile?.vehicle_plate || driverProfile?.plate_number || "";
  const acceptanceRate = driverProfile?.acceptance_rate || 92;
  // ─── Auto-accept state ──────────────────────────────────────────────────────
  const [autoAccept, setAutoAccept] = useState(false);

  // Auto-accept incoming rides when enabled
  useEffect(() => {
    if (autoAccept && isOnline && incomingRide && !activeRide) {
      const rideId = incomingRide?.id || incomingRide?.ride_id;
      if (rideId) acceptRide(rideId);
    }
  }, [autoAccept, isOnline, incomingRide, activeRide, acceptRide]);

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (currentView === "profile") {
    return <DriverProfilePage onBack={() => setCurrentView("dashboard")} initialTab="personal" />;
  }
  if (currentView === "documents") {
    return <DriverProfilePage onBack={() => setCurrentView("dashboard")} initialTab="documents" />;
  }

  return (
    <main style={mapFirstShell}>
      {/* ─── Fullscreen Map ──────────────────────────────────── */}
      <div style={mapFullscreen}>
        <DriverMapView
          driverPosition={driverPosition}
          activeRide={activeRide}
          routePath={routePath}
        />
      </div>

      {/* ─── Notice Banner ──────────────────────────────────── */}
      {driverNotice && !activeRide && (
        <div style={noticeBannerStyle}>{driverNotice}</div>
      )}

      {/* ─── Top Bar ─────────────────────────────────────────── */}
      <div style={topBar}>
        {/* Hamburger + notification dot */}
        <button type="button" style={menuBtn} onClick={() => setMenuOpen(true)} aria-label="Open menu">
          ☰
          <span style={notifDot} />
        </button>

        {/* ON / OFF toggle pill — matches reference exactly */}
        <button
          type="button"
          style={{ ...onOffPill, borderColor: isOnline ? "#00A651" : "#4a5568" }}
          onClick={toggleAvailability}
          disabled={toggleLoading}
          aria-pressed={isOnline}
          aria-label={isOnline ? "Go Offline" : "Go Online"}
        >
          <span style={{ ...powerIcon, color: isOnline ? "#00A651" : "#9ca3af" }}>⏻</span>
          <span style={{ color: isOnline ? "#fff" : "#9ca3af", fontWeight: 700, fontSize: 13, letterSpacing: 1 }}>
            {toggleLoading ? "..." : isOnline ? "ON" : "OFF"}
          </span>
          {/* Toggle slider */}
          <span style={toggleTrack(isOnline)}>
            <span style={toggleThumb(isOnline)} />
          </span>
        </button>

        {/* Auto Accept */}
        <button
          type="button"
          style={{ ...autoAcceptBtn, borderColor: autoAccept ? "#00A651" : "#4a5568" }}
          onClick={() => setAutoAccept((v) => !v)}
          aria-pressed={autoAccept}
        >
          <span style={{ fontSize: 10, color: "#ccc", lineHeight: 1 }}>Auto</span>
          <span style={{ fontSize: 10, color: "#ccc", lineHeight: 1 }}>Accept</span>
          <span style={toggleTrack(autoAccept, true)}>
            <span style={toggleThumb(autoAccept, true)} />
          </span>
        </button>
      </div>

      {/* ─── Active Ride Panel ───────────────────────────────── */}
      {activeRide && (
        <div style={activeRidePanel}>
          <div style={activeRideRow}>
            <span style={activeRideLabel}>
              {activeRide.status === "driver_arriving" ? "Heading to pickup" :
               activeRide.status === "driver_arrived" ? "Arrived at pickup" :
               activeRide.status === "in_progress" ? "Ride in progress" : "Active ride"}
            </span>
            <span style={activeRideFare}>{activeRide.fare ? `${activeRide.fare} MRU` : ""}</span>
          </div>
          <div style={activeRideRoute}>
            <span>📍 {activeRide.pickup || "Pickup"}</span>
            <span style={{ color: "#aaa", margin: "0 6px" }}>→</span>
            <span>🏁 {activeRide.destination || "Destination"}</span>
          </div>
          <div style={rideActionsRow}>
            <RideStatusButtons
              ride={activeRide}
              onStatusChange={() => { fetchDriverRides(); fetchDriverStats(); }}
            />
            <button type="button" style={cancelRideBtn} onClick={() => setDriverCancelOpen(true)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ─── Left float button ────────────────────────────────── */}
      <button type="button" style={floatBtnLeft} onClick={() => setMenuOpen(true)} aria-label="Filters">
        ⚙
      </button>

      {/* ─── Right float button ──────────────────────────────────*/}
      <button type="button" style={floatBtnRight} aria-label="Settings">
        ◎
      </button>

      {/* ─── Bottom Panel ────────────────────────────────────────*/}
      <div style={bottomPanel}>
        {/* Row 1: Today label + rating + AR */}
        <div style={bottomRow1}>
          <button type="button" style={todayBtn} onClick={() => setMenuOpen(true)}>
            <span style={{ fontSize: 13, color: "#fff", marginRight: 2 }}>▾</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>Today</span>
          </button>
          <div style={ratingAR}>
            <span style={{ color: "#f59e0b", fontSize: 14 }}>★</span>
            <span style={{ color: "#fff", fontWeight: 700, fontSize: 14, marginLeft: 3 }}>
              {driverRating > 0 ? driverRating.toFixed(1) : "5.0"}
            </span>
            <span style={arDivider} />
            <span style={{ color: "#00A651", fontWeight: 700, fontSize: 14 }}>AR {acceptanceRate}%</span>
          </div>
        </div>
        {/* Row 2: Trips + Earned */}
        <div style={bottomRow2}>
          <div style={statBlock}>
            <div style={statBigVal}>
              {driverRides.filter(r => r.status === "completed").length}
              <span style={statArrow}> ›</span>
            </div>
            <div style={statSmallLabel}>Trip(s) completed</div>
          </div>
          <div style={statBlock}>
            <div style={statBigVal}>
              {Number(earningsByPeriod.today || 0).toFixed(2)} MRU
              <span style={statArrow}> ›</span>
            </div>
            <div style={statSmallLabel}>Earned</div>
          </div>
        </div>
      </div>

      {/* ─── Ride Request Overlay ────────────────────────────── */}
      {isOnline && incomingRide && !activeRide && (
        <RideRequestCard
          ride={incomingRide}
          enableSound
          onAccept={() => incomingRideId && acceptRide(incomingRideId)}
          onDecline={() => incomingRideId && declineRide(incomingRideId)}
          onExpired={() => incomingRideId && declineRide(incomingRideId)}
        />
      )}

      {/* ─── Driver Cancel Modal ─────────────────────────────── */}
      {driverCancelOpen && (
        <div className="dd-cancel-modal">
          <h3>Cancel this ride?</h3>
          <p>Select a reason:</p>
          {["Rider not available", "Emergency", "Waited too long", "Wrong pickup location", "Vehicle issue", "Other"].map((reason) => (
            <button key={reason} type="button" className={`dd-cancel-reason${driverCancelReason === reason ? " active" : ""}`} onClick={() => setDriverCancelReason(reason)}>
              {reason}
            </button>
          ))}
          <div className="dd-cancel-actions">
            <button type="button" className="dd-cancel-keep" onClick={() => setDriverCancelOpen(false)}>Keep Ride</button>
            <button type="button" className="dd-cancel-confirm" onClick={cancelActiveRide} disabled={!driverCancelReason || driverCancelling}>
              {driverCancelling ? "Cancelling..." : "Confirm Cancel"}
            </button>
          </div>
        </div>
      )}

      {/* ─── Hamburger Menu ──────────────────────────────────── */}
      <HamburgerMenu
        isOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
        driverProfile={{
          first_name: driverProfile?.user?.first_name || driverProfile?.first_name || "",
          last_name: driverProfile?.user?.last_name || driverProfile?.last_name || "",
          profile_picture: driverProfile?.driver_photo || driverProfile?.profile_picture || "",
          level: driverProfile?.driver_level || "bronze",
          points: driverProfile?.level_points || 0,
          nextLevelPoints: driverProfile?.next_level_points || 3000,
        }}
        onNavigate={(path) => {
          if (path === "/driver/account" || path === "/driver/profile") { setCurrentView("profile"); setMenuOpen(false); }
          else if (path === "/driver/documents") { setCurrentView("documents"); setMenuOpen(false); }
          else { window.location.href = path; }
        }}
        onLogout={logout}
      />
    </main>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const mapFirstShell = {
  position: "fixed",
  inset: 0,
  background: "#0d1117",
  overflow: "hidden",
  fontFamily: "'Inter', system-ui, sans-serif",
};

const mapFullscreen = {
  position: "absolute",
  inset: 0,
  zIndex: 0,
};

const noticeBannerStyle = {
  position: "absolute",
  top: 72,
  left: 12,
  right: 12,
  zIndex: 30,
  background: "rgba(239,68,68,0.92)",
  color: "#fff",
  borderRadius: 10,
  padding: "8px 14px",
  fontSize: 13,
  fontWeight: 500,
};

// Top bar — dark strip matching reference
const topBar = {
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  zIndex: 20,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  background: "rgba(18,24,38,0.96)",
  padding: "38px 14px 10px",
  gap: 8,
};

const menuBtn = {
  background: "none",
  border: "none",
  color: "#fff",
  fontSize: 22,
  cursor: "pointer",
  position: "relative",
  padding: "4px 8px",
  lineHeight: 1,
};

const notifDot = {
  position: "absolute",
  top: 2,
  right: 2,
  width: 9,
  height: 9,
  borderRadius: "50%",
  background: "#ef4444",
  border: "2px solid rgba(18,24,38,0.96)",
};

// ON/OFF pill — dark rounded pill with power icon + text + mini toggle
const onOffPill = {
  display: "flex",
  alignItems: "center",
  gap: 7,
  background: "rgba(30,36,50,0.98)",
  border: "1.5px solid",
  borderRadius: 24,
  padding: "7px 14px",
  cursor: "pointer",
  flex: 1,
  justifyContent: "center",
  maxWidth: 140,
};

const powerIcon = { fontSize: 15, lineHeight: 1 };

const toggleTrack = (active, small = false) => ({
  width: small ? 28 : 32,
  height: small ? 16 : 18,
  borderRadius: 20,
  background: active ? "#00A651" : "#374151",
  position: "relative",
  flexShrink: 0,
  transition: "background 0.2s",
});

const toggleThumb = (active, small = false) => ({
  position: "absolute",
  top: small ? 2 : 2,
  left: active ? (small ? 12 : 14) : 2,
  width: small ? 12 : 14,
  height: small ? 12 : 14,
  borderRadius: "50%",
  background: "#fff",
  transition: "left 0.2s",
});

// Auto Accept button
const autoAcceptBtn = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 2,
  background: "rgba(30,36,50,0.98)",
  border: "1.5px solid",
  borderRadius: 10,
  padding: "5px 8px",
  cursor: "pointer",
  minWidth: 54,
};

// Active ride panel
const activeRidePanel = {
  position: "absolute",
  bottom: 140,
  left: 12,
  right: 12,
  zIndex: 20,
  background: "rgba(13,17,23,0.97)",
  borderRadius: 16,
  padding: "14px 16px 24px",
  border: "1px solid rgba(0,166,81,0.3)",
  boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
  maxHeight: "calc(100vh - 280px)",
  overflowY: "auto",
  WebkitOverflowScrolling: "touch",
};

const activeRideRow = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 6,
};

const activeRideLabel = { color: "#00A651", fontWeight: 700, fontSize: 13 };
const activeRideFare = { color: "#fff", fontWeight: 700, fontSize: 15 };

const activeRideRoute = {
  color: "#ccc",
  fontSize: 12,
  marginBottom: 10,
  display: "flex",
  flexWrap: "wrap",
  gap: 2,
};

const rideActionsRow = { display: "flex", gap: 8, alignItems: "center" };

const cancelRideBtn = {
  background: "rgba(239,68,68,0.15)",
  border: "1px solid rgba(239,68,68,0.4)",
  color: "#ef4444",
  borderRadius: 8,
  padding: "6px 12px",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

// Floating side buttons
const floatBtnLeft = {
  position: "absolute",
  left: 14,
  bottom: 145,
  zIndex: 20,
  width: 44,
  height: 44,
  borderRadius: "50%",
  background: "#2563eb",
  border: "none",
  color: "#fff",
  fontSize: 18,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  boxShadow: "0 2px 12px rgba(37,99,235,0.5)",
};

const floatBtnRight = {
  position: "absolute",
  right: 14,
  bottom: 145,
  zIndex: 20,
  width: 44,
  height: 44,
  borderRadius: "50%",
  background: "rgba(30,36,50,0.96)",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "#fff",
  fontSize: 18,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  boxShadow: "0 2px 12px rgba(0,0,0,0.4)",
};

// Bottom panel — matches reference exactly
const bottomPanel = {
  position: "absolute",
  bottom: 0,
  left: 0,
  right: 0,
  zIndex: 20,
  background: "rgba(18,24,38,0.98)",
  borderTopLeftRadius: 18,
  borderTopRightRadius: 18,
  padding: "14px 20px 28px",
};

const bottomRow1 = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: 14,
};

const todayBtn = {
  background: "none",
  border: "none",
  display: "flex",
  alignItems: "center",
  gap: 2,
  cursor: "pointer",
  padding: 0,
};

const ratingAR = {
  display: "flex",
  alignItems: "center",
  gap: 6,
};

const arDivider = {
  width: 1,
  height: 16,
  background: "rgba(255,255,255,0.2)",
  margin: "0 4px",
};

const bottomRow2 = {
  display: "flex",
  gap: 0,
};

const statBlock = {
  flex: 1,
};

const statBigVal = {
  color: "#fff",
  fontWeight: 700,
  fontSize: 17,
  display: "flex",
  alignItems: "center",
};

const statArrow = { color: "#9ca3af", fontSize: 14, marginLeft: 2 };
const statSmallLabel = { color: "#9ca3af", fontSize: 12, marginTop: 2 };
