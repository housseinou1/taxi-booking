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
  const [dashboardTab, setDashboardTab] = useState("map");

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
  const totalRidesCompleted = driverProfile?.total_rides_completed || driverProfile?.total_rides || 0;
  const weeklyGoalTarget = 50;
  const weeklyGoalCurrent = Math.min(totalRidesCompleted % weeklyGoalTarget, weeklyGoalTarget);
  const weeklyGoalProgress = Math.round((weeklyGoalCurrent / weeklyGoalTarget) * 100);

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (currentView === "profile") {
    return <DriverProfilePage onBack={() => setCurrentView("dashboard")} initialTab="personal" />;
  }
  if (currentView === "documents") {
    return <DriverProfilePage onBack={() => setCurrentView("dashboard")} initialTab="documents" />;
  }

  return (
    <main className={`dd-shell${lyftUI ? " driver-app--lyft" : ""}`}>
      {/* ─── Top Header ─────────────────────────────────────── */}
      <header className="dd-header">
        <button type="button" className="dd-header-menu" onClick={() => setMenuOpen(true)} aria-label="Open menu">☰</button>
        <span className="dd-header-logo">Yala Driver</span>
        <div className="dd-header-right">
          <button type="button" className="dd-header-bell" aria-label="Notifications">🔔</button>
          {driverPhoto ? (
            <img src={driverPhoto} alt={driverName} className="dd-header-avatar" />
          ) : (
            <span className="dd-header-avatar dd-header-avatar--fallback">
              {(driverName || "Y").charAt(0).toUpperCase()}
            </span>
          )}
        </div>
      </header>

      {/* ─── Notice Banner ──────────────────────────────────── */}
      {driverNotice && <div className="dd-notice">{driverNotice}</div>}

      {/* ─── Scrollable Content ─────────────────────────────── */}
      <div className="dd-scroll">

        {/* Hero Status Card */}
        <section className="dd-hero-card">
          <div className="dd-hero-top">
            <div className="dd-hero-photo">
              {driverPhoto ? (
                <img src={driverPhoto} alt={driverName} />
              ) : (
                <span>{(driverName || "Y").charAt(0).toUpperCase()}</span>
              )}
              <span className={`dd-hero-dot ${isOnline ? "online" : ""}`} />
            </div>
            <div className="dd-hero-info">
              <div className="dd-hero-name-row">
                <h2 className="dd-hero-name">Bonjour, {driverName.split(" ")[0]}</h2>
                <span className="dd-hero-verified">✓</span>
              </div>
              <div className="dd-hero-meta">
                <span className={`dd-status-pill ${isOnline ? "online" : ""}`}>
                  <span className="dd-status-dot" />
                  {isOnline ? "Online" : "Offline"}
                </span>
                {driverRating > 0 && <span className="dd-hero-rating">★ {driverRating.toFixed(1)}</span>}
              </div>
              {(vehicleMake || vehicleModel) && (
                <p className="dd-hero-vehicle">{vehicleMake} {vehicleModel} {vehiclePlate && <b>· {vehiclePlate}</b>}</p>
              )}
            </div>
          </div>
        </section>

        {/* Wallet Balance Card */}
        <section className="dd-wallet-card">
          <div className="dd-wallet-left">
            <span className="dd-wallet-label">Wallet Balance</span>
            <strong className="dd-wallet-amount">{formatMRU(earningsByPeriod.month)}</strong>
          </div>
          <button type="button" className="dd-wallet-btn" onClick={() => window.location.href = "/driver/earnings"}>💳</button>
        </section>

        {/* Earnings Grid */}
        <section className="dd-earnings-grid">
          <div className="dd-earn-card">
            <strong>{formatMRU(earningsByPeriod.today)}</strong>
            <span>Today</span>
          </div>
          <div className="dd-earn-card">
            <strong>{formatMRU(earningsByPeriod.week)}</strong>
            <span>This Week</span>
          </div>
          <div className="dd-earn-card">
            <strong>{formatMRU(earningsByPeriod.month)}</strong>
            <span>This Month</span>
          </div>
          <div className="dd-earn-card">
            <strong>{acceptanceRate}%</strong>
            <span>Acceptance</span>
          </div>
        </section>

        {/* Weekly Goal / Bonus Card */}
        <section className="dd-goal-card">
          <div className="dd-goal-info">
            <h3 className="dd-goal-title">Weekly Goal</h3>
            <p className="dd-goal-desc">Complete {weeklyGoalTarget} rides this week for <strong>{formatMRU(5000)}</strong> bonus</p>
          </div>
          <div className="dd-goal-progress-wrap">
            <div className="dd-goal-bar">
              <div className="dd-goal-bar-fill" style={{ width: `${weeklyGoalProgress}%` }} />
            </div>
            <div className="dd-goal-stats">
              <span>{weeklyGoalCurrent} / {weeklyGoalTarget} rides</span>
              <span>{weeklyGoalProgress}%</span>
            </div>
          </div>
        </section>

        {/* Map Section */}
        <section className="dd-map-section">
          <DriverMapView
            driverPosition={driverPosition}
            activeRide={activeRide}
            routePath={routePath}
          />
        </section>

        {/* Quick Actions Grid */}
        <section className="dd-actions-section">
          <h3 className="dd-section-title">Quick Actions</h3>
          <div className="dd-actions-grid">
            <button type="button" className="dd-action-item" onClick={() => window.location.href = "/driver/history"}>
              <span className="dd-action-icon">🚕</span><span>My Rides</span>
            </button>
            <button type="button" className="dd-action-item" onClick={() => window.location.href = "/driver/earnings"}>
              <span className="dd-action-icon">💰</span><span>Earnings</span>
            </button>
            <button type="button" className="dd-action-item" onClick={() => window.location.href = "/driver/history"}>
              <span className="dd-action-icon">📊</span><span>Statistics</span>
            </button>
            <button type="button" className="dd-action-item" onClick={() => window.location.href = "/driver/feedback"}>
              <span className="dd-action-icon">⭐</span><span>Ratings</span>
            </button>
            <button type="button" className="dd-action-item" onClick={() => { setCurrentView("documents"); }}>
              <span className="dd-action-icon">📄</span><span>Documents</span>
            </button>
            <button type="button" className="dd-action-item" onClick={() => window.location.href = "/driver/achievements"}>
              <span className="dd-action-icon">🏆</span><span>Rewards</span>
            </button>
            <button type="button" className="dd-action-item" onClick={() => window.location.href = "/driver/support"}>
              <span className="dd-action-icon">💬</span><span>Support</span>
            </button>
            <button type="button" className="dd-action-item" onClick={() => window.location.href = "/driver/support"}>
              <span className="dd-action-icon">👥</span><span>Invite</span>
            </button>
          </div>
        </section>

        {/* Recent Activity Feed */}
        <section className="dd-activity-section">
          <h3 className="dd-section-title">Recent Activity</h3>
          <div className="dd-activity-feed">
            {driverRides.slice(0, 5).map((ride, i) => (
              <div key={ride.id || i} className="dd-activity-item">
                <span className="dd-activity-icon">{ride.status === "completed" ? "✅" : ride.status === "cancelled" ? "❌" : "🚗"}</span>
                <div className="dd-activity-text">
                  <strong>{ride.pickup || "Pickup"} → {ride.destination || "Destination"}</strong>
                  <small>{ride.fare ? `${ride.fare} MRU` : "Pending"} · {ride.status || "unknown"}</small>
                </div>
              </div>
            ))}
            {driverRides.length === 0 && (
              <div className="dd-activity-empty">
                <span>🚗</span>
                <p>No recent activity yet. Go online to start receiving rides.</p>
              </div>
            )}
          </div>
        </section>

      </div>{/* end dd-scroll */}

      {/* Go Online / Status Panel (fixed-positioned bottom sheet) */}
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
              onStatusChange={() => { fetchDriverRides(); fetchDriverStats(); }}
            />
          ) : null
        }
      />

      {/* Ride request overlay */}
      {isOnline && incomingRide && !activeRide && (
        <RideRequestCard
          ride={incomingRide}
          enableSound
          onAccept={() => incomingRideId && acceptRide(incomingRideId)}
          onDecline={() => incomingRideId && declineRide(incomingRideId)}
          onExpired={() => incomingRideId && declineRide(incomingRideId)}
        />
      )}

      {/* Driver cancel modal */}
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

      {/* Bottom Navigation */}
      <nav className="dd-bottom-nav">
        <button type="button" className={`dd-nav-tab${dashboardTab === "map" ? " active" : ""}`} onClick={() => setDashboardTab("map")}>
          <span className="dd-nav-icon">⌂</span><span className="dd-nav-label">Home</span>
        </button>
        <button type="button" className="dd-nav-tab" onClick={() => window.location.href = "/driver/history"}>
          <span className="dd-nav-icon">🚗</span><span className="dd-nav-label">Rides</span>
        </button>
        <button type="button" className="dd-nav-tab dd-nav-tab--center" onClick={toggleAvailability}>
          <span className="dd-nav-go-btn">
            <span className={isOnline ? "online" : ""}>⏻</span>
          </span>
          <span className="dd-nav-label">Online</span>
        </button>
        <button type="button" className="dd-nav-tab" onClick={() => window.location.href = "/driver/earnings"}>
          <span className="dd-nav-icon">💵</span><span className="dd-nav-label">Earnings</span>
        </button>
        <button type="button" className="dd-nav-tab" onClick={() => setCurrentView("profile")}>
          <span className="dd-nav-icon">👤</span><span className="dd-nav-label">Profile</span>
        </button>
      </nav>

      {/* Hamburger Menu (preserved) */}
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
