import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { API_URL } from "../apiConfig";
import authenticatedApi from "../auth/authenticatedApi";
import {
  clearAuthSession,
  isDriverAccount,
  redirectToLogin,
  restoreAuthSession,
} from "../auth/session";
import { MARKET, isPointInServiceArea } from "../marketConfig";
import { subscribeRideUpdates } from "../socket";
import { preloadNotificationSound, unlockRideRequestSound, playRideRequestAlert } from "../native/sound";
import { getDriverApprovalNotice } from "./utils/documentReview";
import {
  ensureDriverAgreementBeforeOnline,
  isDriverTermsError,
  loadDriverLegalGate,
  redirectIfDriverAgreementRequired,
  redirectToDriverAgreement,
} from "./utils/driverLegalGate";
import { formatAvailabilityApiError } from "./utils/availabilityErrors";
import { isDeliveryAppInstall, isDriverLyftUI } from "../native/platform";
import { unregisterPushNotifications } from "../native/push";
import { haversineKm } from "../delivery/deliveryPricing";

import DriverMapView from "./components/DriverMapView";
import { getNavigationDestination } from "./components/MultiStopProgress";
import HamburgerMenu from "./components/HamburgerMenu";
import RideRequestCard from "./components/RideRequestCard";
import DriverProfilePage from "./DriverProfilePage";
import RideStatusButtons from "../RideStatusButtons";
import RideCancellationModal from "../components/RideCancellationModal";
import "./driver-tokens.css";
import "./lyft-driver.css";

const DRIVER_SOUND_ENABLED_KEY = "driver_ride_sound_enabled";
const HEATMAP_REFRESH_INTERVAL = 60000;
const AVAILABILITY_TOGGLE_TIMEOUT_MS = 5000;
const AVAILABILITY_TOGGLE_WATCHDOG_MS = 5500;
const ONLINE_NOTICE_MESSAGE = "You're online — receiving ride requests.";
const ONLINE_NOTICE_DURATION_MS = 2500;
const ACTIVE_RIDE_STATUSES = ["driver_arriving", "accepted", "driver_arrived", "in_progress"];
const DRIVER_CANCEL_RIDE_STATUSES = ["accepted", "driver_arriving", "driver_arrived"];
const formatMRU = (v) => `${Number(v || 0).toLocaleString()} MRU`;

function heatmapZoneToBusyArea(zone) {
  const lat = Number(zone.center_lat);
  const lng = Number(zone.center_lng);
  const radiusKm = Number(zone.radius_km) || 1;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const points = 10;
  const coordinates = [];
  for (let i = 0; i < points; i += 1) {
    const angle = (i / points) * 2 * Math.PI;
    const dLat = (radiusKm / 111) * Math.cos(angle);
    const dLng = (radiusKm / (111 * Math.cos((lat * Math.PI) / 180))) * Math.sin(angle);
    coordinates.push([lat + dLat, lng + dLng]);
  }

  const intensity = Number(zone.intensity) || 0.5;
  return {
    coordinates,
    color: "#00A651",
    fillColor: "#00A651",
    fillOpacity: 0.08 + intensity * 0.18,
  };
}

// ─── Main Container ─────────────────────────────────────────────────────────

export default function DriverDashboardNew() {
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    if (isDeliveryAppInstall()) {
      window.location.replace("/delivery/courier");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const verifyDriverSession = async () => {
      const result = await restoreAuthSession({ requiredRole: "driver" });
      if (cancelled) return;

      if (!result.authenticated || !isDriverAccount(result.user)) {
        clearAuthSession();
        redirectToLogin("/driver");
        return;
      }

      setAuthReady(true);
    };

    verifyDriverSession();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!authReady) return undefined;
    let cancelled = false;
    loadDriverLegalGate()
      .then((gate) => {
        if (cancelled) return;
        redirectIfDriverAgreementRequired(gate.driver, "/driver");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [authReady]);

  if (!authReady) {
    return <div className="driver-shell-loading">Checking your driver session...</div>;
  }

  return <DriverDashboardContent />;
}

function DriverDashboardContent() {
  const lyftUI = isDriverLyftUI();
  const [isOnline, setIsOnline] = useState(false);
  const [toggleLoading, setToggleLoading] = useState(false);
  const [driverProfile, setDriverProfile] = useState(null);
  const [heatmapZones, setHeatmapZones] = useState([]);
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
  const [statusLoadError, setStatusLoadError] = useState("");
  const [toggleError, setToggleError] = useState("");
  const [gpsUnavailable, setGpsUnavailable] = useState(false);
  const [acceptingRideId, setAcceptingRideId] = useState(null);

  const alertedRideIdsRef = useRef(new Set());
  const isOnlineRef = useRef(isOnline);
  const hasLoadedStatusRef = useRef(false);
  const statusFetchInFlightRef = useRef(false);
  const availabilityMutationRef = useRef(false);
  const toggleRequestIdRef = useRef(0);
  const activeRideSnapshotRef = useRef(null);
  const onlineNoticeTimeoutRef = useRef(null);
  const acceptingRideIdRef = useRef(null);
  const autoAcceptedRideIdRef = useRef(null);

  useEffect(() => {
    isOnlineRef.current = isOnline;
  }, [isOnline]);

  useEffect(() => {
    if (!toggleError) return undefined;
    const timeout = window.setTimeout(() => setToggleError(""), 8000);
    return () => window.clearTimeout(timeout);
  }, [toggleError]);

  // Derive active ride from driver rides (sticky snapshot prevents idle UI flash).
  const activeRide = useMemo(() => {
    const fromList = driverRides.find((ride) =>
      ACTIVE_RIDE_STATUSES.includes(ride.status)
    );
    if (fromList) {
      activeRideSnapshotRef.current = fromList;
      return fromList;
    }

    const snapshot = activeRideSnapshotRef.current;
    if (snapshot && ACTIVE_RIDE_STATUSES.includes(snapshot.status)) {
      return snapshot;
    }

    activeRideSnapshotRef.current = null;
    return null;
  }, [driverRides]);

  useEffect(() => {
    activeRideSnapshotRef.current = activeRide;
  }, [activeRide]);

  const showOnlineNotice = useCallback(() => {
    if (onlineNoticeTimeoutRef.current) {
      window.clearTimeout(onlineNoticeTimeoutRef.current);
    }
    setDriverNotice(ONLINE_NOTICE_MESSAGE);
    onlineNoticeTimeoutRef.current = window.setTimeout(() => {
      setDriverNotice((current) => (current === ONLINE_NOTICE_MESSAGE ? "" : current));
      onlineNoticeTimeoutRef.current = null;
    }, ONLINE_NOTICE_DURATION_MS);
  }, []);

  useEffect(() => () => {
    if (onlineNoticeTimeoutRef.current) {
      window.clearTimeout(onlineNoticeTimeoutRef.current);
    }
  }, []);

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
      String(error.response?.data?.detail || "").toLowerCase().includes("token") ||
      String(error.response?.data?.detail || "").toLowerCase().includes("credentials"),
    []
  );

  const sendToLogin = useCallback(() => {
    clearAuthSession();
    redirectToLogin("/driver");
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
    if (statusFetchInFlightRef.current) return;
    statusFetchInFlightRef.current = true;

    try {
      const response = await authenticatedApi.get(`${API_URL}/drivers/me/`);
      hasLoadedStatusRef.current = true;
      setStatusLoadError("");
      setDriverProfile(response.data);
      const online = Boolean(response.data.is_available);
      if (!availabilityMutationRef.current) {
        setIsOnline(online);
      }
      if (online && localStorage.getItem(DRIVER_SOUND_ENABLED_KEY) === "1") {
        setSoundEnabled(true);
      }
      if (response.data.status && response.data.status !== "approved") {
        setDriverNotice(getDriverApprovalNotice(response.data));
      }
    } catch (error) {
      console.log("Driver status error:", error.response?.data || error);
      if (isAuthError(error)) { sendToLogin(); return; }
      if ([404].includes(error.response?.status)) {
        setDriverNotice("This account is not a driver. Opening the correct dashboard...");
        window.setTimeout(sendToStoredRoleDashboard, 700);
        return;
      }
      const message =
        error.response?.data?.detail ||
        error.response?.data?.error ||
        "Could not load driver status.";
      if (!hasLoadedStatusRef.current) {
        setStatusLoadError(message);
      }
    } finally {
      statusFetchInFlightRef.current = false;
    }
  }, [isAuthError, sendToLogin, sendToStoredRoleDashboard]);

  const fetchAvailableRides = useCallback(async () => {
    try {
      const response = await authenticatedApi.get(`${API_URL}/rides/available/`);
      setAvailableRides(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.log("Available rides error:", error.response?.data || error);
      if (isAuthError(error)) { sendToLogin(); return; }
      setAvailableRides([]);
    }
  }, [isAuthError, sendToLogin]);

  const fetchDriverRides = useCallback(async () => {
    try {
      const response = await authenticatedApi.get(`${API_URL}/rides/driver-rides/`);
      const rides = Array.isArray(response.data) ? response.data : [];
      setDriverRides((prev) => {
        const activeRideId = activeRideSnapshotRef.current?.id;
        if (activeRideId) {
          const updatedActive = rides.find((ride) => String(ride.id) === String(activeRideId));
          if (updatedActive) {
            activeRideSnapshotRef.current = updatedActive;
          } else if (!rides.some((ride) => ACTIVE_RIDE_STATUSES.includes(ride.status))) {
            activeRideSnapshotRef.current = null;
          }
        } else if (!rides.some((ride) => ACTIVE_RIDE_STATUSES.includes(ride.status))) {
          activeRideSnapshotRef.current = null;
        }

        return rides;
      });
    } catch (error) {
      console.log("Driver rides error:", error.response?.data || error);
      if (isAuthError(error)) { sendToLogin(); return; }
    }
  }, [isAuthError, sendToLogin]);

  const fetchDriverStats = useCallback(async () => {
    try {
      const response = await authenticatedApi.get(`${API_URL}/rides/driver/earnings/`);
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
      if (isAuthError(error)) { sendToLogin(); return; }
    }
  }, [isAuthError, sendToLogin]);

  const handleRideStatusChange = useCallback((data) => {
    const updated = data?.ride || data;
    if (updated?.id) {
      if (["cancelled", "completed"].includes(updated.status)) {
        activeRideSnapshotRef.current = null;
      } else {
        activeRideSnapshotRef.current = updated;
      }
      setDriverRides((prev) => {
        if (["cancelled", "completed"].includes(updated.status)) {
          return prev.filter((ride) => String(ride.id) !== String(updated.id));
        }
        const others = prev.filter((ride) => String(ride.id) !== String(updated.id));
        return [updated, ...others];
      });
    } else {
      fetchDriverRides();
    }
    fetchDriverStats();
    fetchDriverStatus();
  }, [fetchDriverRides, fetchDriverStats, fetchDriverStatus]);

  const fetchHeatmap = useCallback(async () => {
    try {
      const response = await authenticatedApi.get(`${API_URL}/drivers/heatmap/`);
      setHeatmapZones(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.log("Heatmap load error:", error.response?.data || error);
      if (isAuthError(error)) { sendToLogin(); return; }
      setHeatmapZones([]);
    }
  }, [isAuthError, sendToLogin]);

  const toggleAvailability = useCallback(async () => {
    if (availabilityMutationRef.current) return;

    const previousOnline = isOnlineRef.current;
    const targetOnline = !previousOnline;

    availabilityMutationRef.current = true;
    setToggleLoading(true);
    setStatusLoadError("");
    setToggleError("");

    const finishToggle = () => {
      availabilityMutationRef.current = false;
      setToggleLoading(false);
    };

    try {
      if (targetOnline) {
        const agreementOk = await ensureDriverAgreementBeforeOnline("/driver");
        if (!agreementOk) {
          finishToggle();
          return;
        }
        if (driverProfile?.status && driverProfile.status !== "approved") {
          setToggleError(getDriverApprovalNotice(driverProfile));
          finishToggle();
          return;
        }
      }

      const requestId = toggleRequestIdRef.current + 1;
      toggleRequestIdRef.current = requestId;

      let watchdogId;
      watchdogId = window.setTimeout(() => {
        if (toggleRequestIdRef.current !== requestId) return;
        toggleRequestIdRef.current += 1;
        finishToggle();
        setIsOnline(previousOnline);
        setToggleError("Request timed out. Check your connection and try again.");
      }, AVAILABILITY_TOGGLE_WATCHDOG_MS);

      try {
        const response = await authenticatedApi.post(
          `${API_URL}/drivers/availability/toggle/`,
          { is_available: targetOnline },
          { timeout: AVAILABILITY_TOGGLE_TIMEOUT_MS }
        );

        if (toggleRequestIdRef.current !== requestId) return;

        const goingOnline = Boolean(response.data.is_available);
        setIsOnline(goingOnline);
        setToggleError("");

        if (goingOnline) {
          unlockRideRequestSound().catch(() => {});
          setSoundEnabled(true);
          localStorage.setItem(DRIVER_SOUND_ENABLED_KEY, "1");
          showOnlineNotice();
          fetchHeatmap();
          fetchAvailableRides();
        } else {
          setSoundEnabled(false);
          localStorage.removeItem(DRIVER_SOUND_ENABLED_KEY);
          setDriverNotice("");
        }

        fetchDriverStats();
      } catch (error) {
        if (toggleRequestIdRef.current !== requestId) return;

        console.log(
          "Toggle availability error:",
          error.response?.status,
          error.response?.data || error
        );
        if (targetOnline) {
          if (isAuthError(error)) {
            sendToLogin();
            return;
          }
          if (isDriverTermsError(error)) {
            redirectToDriverAgreement("/driver");
            return;
          }
        } else if (isAuthError(error)) {
          sendToLogin();
          return;
        }

        setIsOnline(previousOnline);
        setToggleError(formatAvailabilityApiError(error));
        fetchDriverStatus();
      } finally {
        window.clearTimeout(watchdogId);
        if (toggleRequestIdRef.current === requestId) {
          toggleRequestIdRef.current += 1;
          finishToggle();
        }
      }
    } catch (error) {
      console.log("Toggle availability prep error:", error);
      setToggleError("Could not verify driver status. Try again.");
    }
  }, [
    driverProfile,
    fetchAvailableRides,
    fetchDriverStats,
    fetchDriverStatus,
    fetchHeatmap,
    isAuthError,
    sendToLogin,
    showOnlineNotice,
  ]);

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
      await authenticatedApi.post(`${API_URL}/drivers/location/update/`, {
        current_lat: location[0],
        current_lng: location[1],
      });
    } catch (error) {
      console.log("Location update error:", error.response?.data || error);
      if (isAuthError(error)) { sendToLogin(); }
    }
  }, [isAuthError, sendToLogin]);

  // ─── Ride Request Handling ──────────────────────────────────────────────────

  const acceptRide = useCallback(async (rideId) => {
    if (!rideId || acceptingRideIdRef.current === rideId) return;

    acceptingRideIdRef.current = rideId;
    setAcceptingRideId(rideId);
    setAvailableRides((prev) => prev.filter((ride) => String(ride.id || ride.ride_id) !== String(rideId)));

    try {
      const response = await authenticatedApi.post(`${API_URL}/rides/accept/${rideId}/`, {});
      const acceptedRide = response.data?.ride || response.data || {};
      const requestRide = availableRides.find((ride) => String(ride.id || ride.ride_id) === String(rideId)) || {};
      const hydratedRide = {
        ...requestRide,
        ...acceptedRide,
        status: acceptedRide.status || requestRide.status || "accepted",
      };
      activeRideSnapshotRef.current = hydratedRide;
      setDriverRides((prev) => {
        const nonActive = prev.filter(
          (ride) => String(ride.id) !== String(rideId) && !ACTIVE_RIDE_STATUSES.includes(ride.status)
        );
        return [hydratedRide, ...nonActive];
      });
      fetchAvailableRides();
      fetchDriverRides();
    } catch (error) {
      console.log("Accept ride error:", error.response?.data || error);
      if (isAuthError(error)) { sendToLogin(); return; }
      setDriverNotice(error.response?.data?.detail || error.response?.data?.error || "Could not accept ride.");
      fetchAvailableRides();
    } finally {
      if (acceptingRideIdRef.current === rideId) {
        acceptingRideIdRef.current = null;
      }
      setAcceptingRideId((current) => (current === rideId ? null : current));
    }
  }, [availableRides, fetchAvailableRides, fetchDriverRides, isAuthError, sendToLogin]);

  const dismissRideOffer = useCallback((rideId) => {
    setAvailableRides((prev) =>
      prev.filter((ride) => ride.id !== rideId && ride.ride_id !== rideId)
    );
    alertedRideIdsRef.current.delete(rideId);
  }, []);

  const declineRide = useCallback(async (rideId) => {
    try {
      await authenticatedApi.post(`${API_URL}/rides/decline/${rideId}/`, {});
      fetchDriverStatus();
    } catch (error) {
      console.log("Decline ride error:", error.response?.data || error);
      if (isAuthError(error)) {
        sendToLogin();
        return;
      }
    }
    dismissRideOffer(rideId);
  }, [dismissRideOffer, fetchDriverStatus, isAuthError, sendToLogin]);

  const handleOfferExpired = useCallback((rideId) => {
    declineRide(rideId);
  }, [declineRide]);

  // Cancel active ride (driver side)
  const [driverCancelOpen, setDriverCancelOpen] = useState(false);
  const [driverCancelError, setDriverCancelError] = useState("");
  const [driverCancelling, setDriverCancelling] = useState(false);

  const cancelActiveRide = async ({ reason, reason_details: reasonDetails = "" }) => {
    if (!activeRide || !reason?.trim()) return;
    try {
      setDriverCancelling(true);
      setDriverCancelError("");
      await authenticatedApi.post(`${API_URL}/rides/cancel/${activeRide.id}/`, {
        reason: reason.trim(),
        reason_details: reasonDetails.trim(),
        cancelled_by: "driver",
      });
      setDriverCancelOpen(false);
      activeRideSnapshotRef.current = null;
      fetchDriverRides();
      fetchDriverStatus();
    } catch (error) {
      setDriverCancelError(
        error.response?.data?.detail ||
          error.response?.data?.error ||
          "Could not cancel this ride."
      );
    } finally {
      setDriverCancelling(false);
    }
  };

  const closeDriverCancelModal = useCallback(() => {
    setDriverCancelOpen(false);
    setDriverCancelError("");
  }, []);

  // ─── Navigation / Logout ────────────────────────────────────────────────────

  const logout = useCallback(async () => {
    try {
      await unregisterPushNotifications(API_URL);
    } catch (error) {
      console.log("Push unregister error:", error);
    }
    clearAuthSession();
    redirectToLogin("/driver");
  }, []);

  // ─── Effects ────────────────────────────────────────────────────────────────

  useEffect(() => {
    fetchDriverStatus();
    fetchAvailableRides();
    fetchDriverStats();
    preloadNotificationSound();
  }, [fetchDriverStatus, fetchAvailableRides, fetchDriverStats]);

  useEffect(() => {
    if (!isOnline) {
      setHeatmapZones([]);
      return undefined;
    }

    fetchHeatmap();
    const interval = setInterval(fetchHeatmap, HEATMAP_REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [isOnline, fetchHeatmap]);

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

  // Poll rides every 5s; skip available-ride poll while on an active trip.
  useEffect(() => {
    const statusInterval = setInterval(fetchDriverStatus, 10000);
    const ridesInterval = setInterval(() => {
      fetchDriverRides();
      if (!activeRideSnapshotRef.current) {
        fetchAvailableRides();
      }
    }, 5000);
    return () => {
      clearInterval(statusInterval);
      clearInterval(ridesInterval);
    };
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
        fetchDriverRides();
        fetchDriverStats();
        if (!activeRideSnapshotRef.current) {
          fetchAvailableRides();
        }
      }
    });
    return () => unsub();
  }, [fetchAvailableRides, fetchDriverRides, fetchDriverStats, mergeIncomingRideRequest]);

  // Geolocation: watch driver position
  useEffect(() => {
    if (!navigator.geolocation) {
      setGpsUnavailable(true);
      return undefined;
    }
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setGpsUnavailable(false);
        const newPos = [position.coords.latitude, position.coords.longitude];
        if (isPointInServiceArea(newPos)) {
          setDriverPosition(newPos);
          updateDriverLocation(newPos);
        } else {
          setDriverPosition(MARKET.defaultPickup.position);
        }
      },
      () => {
        setGpsUnavailable(true);
        setDriverPosition(MARKET.defaultPickup.position);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 12000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [updateDriverLocation]);

  // Refresh ride state when app returns to foreground
  useEffect(() => {
    const refreshDashboard = () => {
      fetchDriverStatus();
      fetchDriverRides();
      if (!activeRideSnapshotRef.current) {
        fetchAvailableRides();
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        refreshDashboard();
      }
    };

    document.addEventListener("visibilitychange", onVisible);

    let appListener;
    const capacitorApp = window.Capacitor?.Plugins?.App;
    if (capacitorApp?.addListener) {
      capacitorApp
        .addListener("appStateChange", ({ isActive }) => {
          if (isActive) refreshDashboard();
        })
        .then((listener) => {
          appListener = listener;
        })
        .catch(() => {});
    }

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      appListener?.remove?.();
    };
  }, [fetchAvailableRides, fetchDriverRides, fetchDriverStatus]);

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
  const acceptanceRate = Math.round(
    Number(driverProfile?.acceptance_rate ?? driverProfile?.acceptance_rate_points ?? 100)
  );
  const missedRides = driverProfile?.total_rides_missed ?? 0;
  const cancellationWarning =
    driverProfile?.cancellation_warning || driverProfile?.account_risk_reason || "";
  const documentsAlert = useMemo(
    () =>
      Boolean(
        driverProfile?.missing_document_types?.length ||
          driverProfile?.expired_document_types?.length ||
          driverProfile?.expired_documents?.length ||
          driverProfile?.documents_under_review
      ),
    [driverProfile]
  );
  const todayTripsCount = useMemo(
    () => driverRides.filter((ride) => ride.status === "completed").length,
    [driverRides]
  );
  const todayEarnings = useMemo(
    () => Number(earningsByPeriod.today || 0).toFixed(2),
    [earningsByPeriod.today]
  );
  const busyAreas = useMemo(
    () =>
      heatmapZones
        .filter((zone) => zone.active !== false)
        .map(heatmapZoneToBusyArea)
        .filter(Boolean),
    [heatmapZones]
  );
  const displayRating = driverRating > 0 ? driverRating.toFixed(1) : "5.0";
  const [autoAccept, setAutoAccept] = useState(false);
  const [navSheetExpanded, setNavSheetExpanded] = useState(true);

  useEffect(() => {
    if (!activeRide) {
      setNavSheetExpanded(false);
      return;
    }
    setNavSheetExpanded(true);
  }, [activeRide?.id, activeRide?.status]);

  const activeRideStatusLabel = useMemo(() => {
    if (!activeRide) return "";
    if (activeRide.status === "driver_arriving") return "Heading to pickup";
    if (activeRide.status === "driver_arrived") {
      return activeRide.pickup_pin_verified
        ? "PIN verified — ready to start"
        : "Arrived at pickup";
    }
    if (activeRide.status === "in_progress") return "Ride in progress";
    return "Active ride";
  }, [activeRide]);

  const canCancelActiveRide = Boolean(
    activeRide && DRIVER_CANCEL_RIDE_STATUSES.includes(activeRide.status)
  );

  const distanceToNextKm = useMemo(() => {
    if (!activeRide || !driverPosition) return null;

    const driverLat = Number(driverPosition[0]);
    const driverLng = Number(driverPosition[1]);
    if (!Number.isFinite(driverLat) || !Number.isFinite(driverLng)) return null;

    let targetLat = null;
    let targetLng = null;

    if (["accepted", "driver_arriving"].includes(activeRide.status)) {
      targetLat = Number(activeRide.pickup_lat);
      targetLng = Number(activeRide.pickup_lng);
    } else if (activeRide.status === "in_progress") {
      const sortedStops = Array.isArray(activeRide.stops)
        ? [...activeRide.stops].sort(
            (left, right) => Number(left.stop_order || 0) - Number(right.stop_order || 0)
          )
        : [];
      const nextStop = getNavigationDestination(sortedStops, "in_progress");
      if (nextStop) {
        targetLat = Number(nextStop.latitude);
        targetLng = Number(nextStop.longitude);
      } else {
        targetLat = Number(activeRide.destination_lat);
        targetLng = Number(activeRide.destination_lng);
      }
    }

    if (!Number.isFinite(targetLat) || !Number.isFinite(targetLng)) return null;
    return haversineKm(driverLat, driverLng, targetLat, targetLng);
  }, [activeRide, driverPosition]);

  // Auto-accept incoming rides when enabled
  useEffect(() => {
    if (autoAccept && isOnline && incomingRide && !activeRide) {
      const rideId = incomingRide?.id || incomingRide?.ride_id;
      if (rideId && autoAcceptedRideIdRef.current !== rideId && !acceptingRideIdRef.current) {
        autoAcceptedRideIdRef.current = rideId;
        acceptRide(rideId);
      }
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
    <main
      className={[
        "driver-dashboard-new",
        "driver-dashboard-v2",
        lyftUI ? "driver-dashboard-new--lyft" : "",
        isOnline ? "driver-dashboard-new--online" : "",
        activeRide ? "driver-dashboard-new--navigating" : "",
        incomingRide && !activeRide ? "driver-dashboard-new--incoming" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={mapFirstShell}
    >
      {/* ─── Fullscreen Map ──────────────────────────────────── */}
      <div style={mapFullscreen}>
        <DriverMapView
          driverPosition={driverPosition}
          activeRide={activeRide}
          busyAreas={isOnline ? busyAreas : []}
          routePath={routePath}
        />
      </div>

      {/* ─── Notice Banner ──────────────────────────────────── */}
      {(statusLoadError || toggleError || (driverNotice && !activeRide)) && (
        <div className="driver-dashboard-new__notice" style={noticeBannerStyle}>
          {statusLoadError || toggleError || driverNotice}
        </div>
      )}

      {gpsUnavailable && (
        <div
          className="driver-dashboard-new__notice"
          style={{
            top: cancellationWarning && !activeRide ? 88 : 12,
            background: "rgba(239,68,68,0.92)",
            color: "#fff",
          }}
          role="alert"
        >
          Location unavailable. Enable GPS to navigate and mark arrival accurately.
        </div>
      )}

      {cancellationWarning && !activeRide && (
        <div
          className="driver-dashboard-new__notice driver-dashboard-new__notice--warning"
          style={{
            ...noticeBannerStyle,
            top: statusLoadError || toggleError || driverNotice ? 140 : 88,
            background: "rgba(245,158,11,0.95)",
          }}
        >
          {cancellationWarning}
        </div>
      )}

      {/* ─── Top Bar (menu · status · auto-accept) ───────────── */}
      <header className="driver-dashboard-new__topbar">
        <button
          type="button"
          className="driver-dashboard-new__menu-btn"
          onClick={() => setMenuOpen(true)}
          aria-label="Open menu"
        >
          <span className="driver-dashboard-new__menu-btn-icon" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          {documentsAlert ? <span className="driver-dashboard-new__menu-btn-dot" aria-label="Documents need attention" /> : null}
        </button>

        <div className="driver-dashboard-new__topbar-center">
          {isOnline ? (
            <span className="driver-online-badge" aria-live="polite">
              <span className="driver-online-badge__dot" aria-hidden="true" />
              Online
            </span>
          ) : null}
        </div>

        <button
          type="button"
          className={`driver-dashboard-new__auto-accept${autoAccept ? " is-active" : ""}`}
          style={{ ...autoAcceptBtn, borderColor: autoAccept ? "#00A651" : "#4a5568" }}
          onClick={() => setAutoAccept((value) => !value)}
          aria-pressed={autoAccept}
          aria-label="Auto accept ride requests"
        >
          <span style={{ fontSize: 10, color: "#ccc", lineHeight: 1 }}>Auto</span>
          <span style={{ fontSize: 10, color: "#ccc", lineHeight: 1 }}>Accept</span>
          <span style={toggleTrack(autoAccept, true)}>
            <span style={toggleThumb(autoAccept, true)} />
          </span>
        </button>
      </header>

      <button type="button" className="driver-earnings-chip" aria-label={`Today's earnings: ${todayEarnings} MRU`}>
        <span className="driver-earnings-chip__label">Today</span>
        <span className="driver-earnings-chip__divider" aria-hidden="true">•</span>
        <span className="driver-earnings-chip__amount">{todayEarnings} MRU</span>
      </button>

      {/* ─── Map recenter ───────────────────────────────────── */}
      <button type="button" className="driver-dashboard-new__recenter" aria-label="Re-center map">
        ◎
      </button>

      {/* ─── Bottom action dock ─────────────────────────────── */}
      {!activeRide && !incomingRide && (
        <section className="driver-action-dock" aria-label="Driver availability">
          <div className="driver-summary-card">
            <div className="driver-summary-card__header">
              <span className="driver-summary-card__title">Today</span>
            </div>
            <div className="driver-summary-card__stats driver-summary-card__stats--four">
              <div className="driver-summary-card__stat">
                <strong>{todayTripsCount}</strong>
                <span>Trips</span>
              </div>
              <div className="driver-summary-card__stat">
                <strong>{todayEarnings}</strong>
                <span>Earnings (MRU)</span>
              </div>
              <div className="driver-summary-card__stat">
                <strong>{acceptanceRate}%</strong>
                <span>Acceptance</span>
              </div>
              <div className="driver-summary-card__stat">
                <strong>{missedRides}</strong>
                <span>Missed</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            className={[
              "driver-go-btn",
              isOnline ? "driver-go-btn--offline" : "driver-go-btn--online",
              toggleLoading ? "is-loading" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={toggleAvailability}
            disabled={toggleLoading}
            aria-label={isOnline ? "Go offline" : "Go online"}
          >
            <span className="driver-go-btn__icon" aria-hidden="true">
              {isOnline ? "⏻" : "⏻"}
            </span>
            <span className="driver-go-btn__label">
              {toggleLoading ? "Updating..." : isOnline ? "Go Offline" : "Go Online"}
            </span>
          </button>
        </section>
      )}

      {/* ─── Navigation sheet (collapsed during active ride) ─── */}
      {activeRide && (
        <section
          className={`driver-nav-sheet${navSheetExpanded ? " is-expanded" : " is-collapsed"}`}
          aria-label="Active ride navigation"
        >
          <button
            type="button"
            className="driver-nav-sheet__header"
            onClick={() => setNavSheetExpanded((value) => !value)}
            aria-expanded={navSheetExpanded}
          >
            <span className="driver-nav-sheet__grip" aria-hidden="true" />
            <div className="driver-nav-sheet__summary">
              <span className="driver-nav-sheet__status">{activeRideStatusLabel}</span>
              <span className="driver-nav-sheet__fare">
                {activeRide.fare ? `${activeRide.fare} MRU` : ""}
              </span>
            </div>
            <span className="driver-nav-sheet__chevron" aria-hidden="true">
              {navSheetExpanded ? "▾" : "▴"}
            </span>
          </button>

          <div className="driver-nav-sheet__body">
            <div className="driver-nav-sheet__route">
              <span>📍 {activeRide.pickup || "Pickup"}</span>
              <span className="driver-nav-sheet__route-arrow">→</span>
              <span>🏁 {activeRide.destination || "Destination"}</span>
            </div>
            <div className="driver-nav-sheet__actions">
              <RideStatusButtons
                ride={activeRide}
                distanceToNextKm={distanceToNextKm}
                onStatusChange={handleRideStatusChange}
              />
            </div>
            {canCancelActiveRide ? (
              <button
                type="button"
                className="driver-nav-sheet__cancel"
                onClick={() => setDriverCancelOpen(true)}
              >
                Cancel ride
              </button>
            ) : null}
          </div>
        </section>
      )}

      {/* ─── Ride Request Overlay ────────────────────────────── */}
      {isOnline && incomingRide && !activeRide && (
        <RideRequestCard
          ride={incomingRide}
          enableSound
          accepting={Boolean(acceptingRideId)}
          onAccept={() => incomingRideId && acceptRide(incomingRideId)}
          onDecline={() => incomingRideId && declineRide(incomingRideId)}
          onExpired={() => incomingRideId && handleOfferExpired(incomingRideId)}
        />
      )}

      {/* ─── Driver Cancel Modal ─────────────────────────────── */}
      {driverCancelOpen && activeRide && (
        <RideCancellationModal
          key={`driver-cancel-${activeRide.id}`}
          role="driver"
          ride={activeRide}
          saving={driverCancelling}
          error={driverCancelError}
          onCancel={cancelActiveRide}
          onClose={closeDriverCancelModal}
        />
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
          is_online: isOnline,
          documents_alert: documentsAlert,
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
  top: 88,
  left: 12,
  right: 12,
  zIndex: 30,
  background: "rgba(239,68,68,0.92)",
  color: "#fff",
  borderRadius: 10,
  padding: "10px 14px",
  fontSize: 13,
  fontWeight: 600,
  textAlign: "center",
};

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
