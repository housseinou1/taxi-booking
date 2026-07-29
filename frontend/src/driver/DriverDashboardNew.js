/**
 * Production Driver dashboard (ACTIVE).
 * Mounted by App.js for `/driver` and native driver bootstrap.
 * Do not replace with DriverApp / DriverDashboard / RideDashboard.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { API_URL } from "../apiConfig";
import authenticatedApi, { resetAuthRedirectFlag } from "../auth/authenticatedApi";
import {
  clearAuthSession,
  getStoredUser,
  hasStoredAuthCredentials,
  isDriverAccount,
  redirectToLogin,
  restoreAuthSession,
} from "../auth/session";
import { navigateInApp } from "../navigation/inAppNavigation";
import { MARKET, isPointInServiceArea } from "../marketConfig";
import { subscribeRideUpdates } from "../socket";
import { preloadNotificationSound, unlockRideRequestSound, stopRideRequestAlert } from "../native/sound";
import { driverDocumentsBlockOnline, getDriverApprovalNotice, getDriverDocumentsAlertLevel } from "./utils/documentReview";
import {
  ensureDriverAgreementBeforeOnline,
  isDriverTermsError,
  loadDriverLegalGate,
  redirectIfDriverAgreementRequired,
  redirectToDriverAgreement,
} from "./utils/driverLegalGate";
import { formatAvailabilityApiError } from "./utils/availabilityErrors";
import { isDeliveryAppInstall, isDriverYalaUI, isNative } from "../native/platform";
import { unregisterPushNotifications } from "../native/push";
import { requestLocationPermission, stopBackgroundLocationTracking, watchForegroundLocation } from "../native/location";
import { haversineKm } from "../delivery/deliveryPricing";
import { computeArriveGate, parseGeoCoord } from "../utils/rideGeo";
import { getStableDeviceId } from "../native/deviceId";
import RideCancellationModal, {
  isDriverNoShowReason,
} from "../components/RideCancellationModal";

import DriverMapView from "./components/DriverMapView";
import DriverLiveTripBar from "./components/DriverLiveTripBar";
import DriverPerformanceStrip from "./components/DriverPerformanceStrip";
import useRideLiveState from "./hooks/useRideLiveState";
import { getAutoNavigationEnabled } from "./utils/driverNavigationPrefs";
import { openExternalNavigation } from "./utils/externalNavigation";
import { driverTripDebug } from "./utils/driverTripDebug";
import { getNavigationDestination } from "./components/MultiStopProgress";
import { mergeAvailableRidesFromServer, normalizeRideOfferId } from "./utils/mergeAvailableRides";
import HamburgerMenu from "./components/HamburgerMenu";
import RideRequestCard from "./components/RideRequestCard";
import TripCompletionSummary from "./components/TripCompletionSummary";
import DriverDashboardContent from "./dashboard/DriverDashboardContent";
import DriverProfilePage from "./DriverProfilePage";
import RideStatusButtons from "../RideStatusButtons";
import { PrimaryButton, Button } from "../design-system/components";
import SafetyEmergencyPanel from "../safety/SafetyEmergencyPanel";
import TripSafetyPrompt from "../safety/TripSafetyPrompt";
import useTripSafetyMonitor from "../safety/useTripSafetyMonitor";
import { DriverLoadingState, DriverErrorState } from "./ui/DriverAppStates";
import "./driver-tokens.css";
import "./driver-theme.css";

const DRIVER_SOUND_ENABLED_KEY = "driver_ride_sound_enabled";
const HEATMAP_REFRESH_INTERVAL = 60000;
const AVAILABILITY_TOGGLE_TIMEOUT_MS = 5000;
const AVAILABILITY_TOGGLE_WATCHDOG_MS = 5500;
const DRIVER_SESSION_GATE_TIMEOUT_MS = 8000;
const ONLINE_NOTICE_MESSAGE = "You're online — receiving ride requests.";
const ONLINE_NOTICE_DURATION_MS = 2500;
const ACTIVE_RIDE_STATUSES = ["driver_arriving", "accepted", "driver_arrived", "in_progress"];
const TERMINAL_RIDE_STATUSES = ["cancelled", "completed", "rider_no_show"];
const DRIVER_CANCEL_RIDE_STATUSES = ["accepted", "driver_arriving", "driver_arrived"];
const formatMRU = (v) => `${Number(v || 0).toLocaleString()} MRU`;

function getActiveRideFromList(rides) {
  return rides.find((ride) => ACTIVE_RIDE_STATUSES.includes(ride.status)) || null;
}

function reconcileActiveRideSnapshot(rides, snapshotRef) {
  const activeInList = getActiveRideFromList(rides);
  if (activeInList) {
    snapshotRef.current = activeInList;
    return;
  }

  const snapshotId = snapshotRef.current?.id;
  if (!snapshotId) {
    snapshotRef.current = null;
    return;
  }

  const match = rides.find((ride) => String(ride.id) === String(snapshotId));
  if (match && ACTIVE_RIDE_STATUSES.includes(match.status)) {
    snapshotRef.current = match;
  } else if (match && TERMINAL_RIDE_STATUSES.includes(match.status)) {
    snapshotRef.current = null;
  }
}

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
  const [authReady, setAuthReady] = useState(
    () => hasStoredAuthCredentials() && isDriverAccount(getStoredUser())
  );
  const [authGateError, setAuthGateError] = useState("");

  useEffect(() => {
    if (isDeliveryAppInstall()) {
      window.location.replace("/delivery/courier");
    }
  }, []);

  useEffect(() => {
    if (authReady) return undefined;

    let cancelled = false;
    let timeoutId = null;
    let gateResolved = false;

    const allowCachedSessionOrLogin = () => {
      if (cancelled || gateResolved) return;
      gateResolved = true;
      if (hasStoredAuthCredentials()) {
        setAuthGateError("");
        setAuthReady(true);
        return;
      }
      clearAuthSession();
      redirectToLogin("/driver");
    };

    const verifyDriverSession = async () => {
      timeoutId = window.setTimeout(() => {
        allowCachedSessionOrLogin();
      }, DRIVER_SESSION_GATE_TIMEOUT_MS);

      try {
        const result = await restoreAuthSession({ requiredRole: "driver" });
        if (cancelled || gateResolved) return;
        gateResolved = true;

        if (!result.authenticated || !isDriverAccount(result.user)) {
          if (result.offline && hasStoredAuthCredentials()) {
            setAuthGateError("");
            setAuthReady(true);
            return;
          }
          clearAuthSession();
          redirectToLogin("/driver");
          return;
        }

        setAuthGateError("");
        setAuthReady(true);
      } catch (error) {
        console.log("Driver session restore error:", error);
        if (cancelled || gateResolved) return;
        setAuthGateError("Unable to verify session. Opening cached driver mode...");
        allowCachedSessionOrLogin();
      } finally {
        if (timeoutId) {
          window.clearTimeout(timeoutId);
        }
      }
    };

    verifyDriverSession();

    return () => {
      cancelled = true;
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [authReady]);

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
    if (authGateError) {
      return (
        <main className="driver-dashboard-new" style={mapFirstShell}>
          <DriverErrorState
            title="Could not start driver session"
            message={authGateError}
            actionLabel="Try again"
            onAction={() => window.location.reload()}
          />
        </main>
      );
    }
    return (
      <main className="driver-dashboard-new" style={mapFirstShell}>
        <DriverLoadingState title="Checking your driver session..." />
      </main>
    );
  }

  return <DriverDashboardContentView />;
}

function DriverDashboardContentView() {
  const yalaUI = isDriverYalaUI();
  const [isOnline, setIsOnline] = useState(false);
  const [toggleLoading, setToggleLoading] = useState(false);
  const [driverProfile, setDriverProfile] = useState(null);
  const [heatmapZones, setHeatmapZones] = useState([]);
  const [driverPosition, setDriverPosition] = useState(null);
  const [earningsByPeriod, setEarningsByPeriod] = useState({
    today: 0, week: 0, month: 0, year: 0,
  });
  const [earningsDate, setEarningsDate] = useState(null);
  const [driverPerformance, setDriverPerformance] = useState(null);
  const [availableRides, setAvailableRides] = useState([]);
  const [completedRideSummary, setCompletedRideSummary] = useState(null);
  const [driverRides, setDriverRides] = useState([]);
  const [routePath, setRoutePath] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showSafety, setShowSafety] = useState(false);
  const [currentView, setCurrentView] = useState("dashboard");
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [driverNotice, setDriverNotice] = useState("");
  const [onlineNotice, setOnlineNotice] = useState("");
  const [acceptError, setAcceptError] = useState("");
  const [statusLoadError, setStatusLoadError] = useState("");
  const [toggleError, setToggleError] = useState("");
  const [gpsUnavailable, setGpsUnavailable] = useState(false);
  const [locationPermissionDenied, setLocationPermissionDenied] = useState(false);
  const [gpsOutsideServiceArea, setGpsOutsideServiceArea] = useState(false);
  const [acceptingRideId, setAcceptingRideId] = useState(null);

  const alertedRideIdsRef = useRef(new Set());
  const suppressedOfferIdsRef = useRef(new Map());
  const availableRidesRef = useRef([]);
  const isOnlineRef = useRef(isOnline);
  const hasLoadedStatusRef = useRef(false);
  const statusFetchInFlightRef = useRef(false);
  const availabilityMutationRef = useRef(false);
  const serverOnlineRef = useRef(false);
  const toggleRequestIdRef = useRef(0);
  const activeRideSnapshotRef = useRef(null);
  const activeRideRef = useRef(null);
  const lastInServicePositionRef = useRef(null);
  const onlineNoticeTimeoutRef = useRef(null);
  const acceptingRideIdRef = useRef(null);
  const autoAcceptedRideIdRef = useRef(null);
  const recentRideEventsRef = useRef(new Set());

  const documentsAlertLevel = useMemo(
    () => getDriverDocumentsAlertLevel(driverProfile),
    [driverProfile]
  );
  const documentsAlert = documentsAlertLevel !== null;
  const documentsBlockOnline = useMemo(
    () => driverDocumentsBlockOnline(driverProfile),
    [driverProfile]
  );

  const shouldProcessRideEvent = useCallback((message, source = "event") => {
    const rideId = message?.ride_id || message?.id;
    const type = message?.type || message?.status || source;
    if (!rideId) return true;
    const key = `${source}:${type}:${rideId}`;
    if (recentRideEventsRef.current.has(key)) return false;
    recentRideEventsRef.current.add(key);
    window.setTimeout(() => recentRideEventsRef.current.delete(key), 4000);
    return true;
  }, []);

  useEffect(() => {
    availabilityMutationRef.current = false;
  }, []);

  useEffect(() => {
    isOnlineRef.current = isOnline;
  }, [isOnline]);

  useEffect(() => {
    if (!isNative()) return undefined;
    let cancelled = false;
    let attempts = 0;

    const checkPermission = async () => {
      attempts += 1;
      const result = await requestLocationPermission();
      if (cancelled) return;

      console.log("[driver-location] permission check", { attempt: attempts, granted: result.granted, reason: result.reason });
      driverTripDebug("gps-permission", { attempt: attempts, ...result });

      if (!result.granted) {
        setLocationPermissionDenied(true);
        setGpsUnavailable(true);
        // Retry a few times in case the user is still responding to the system dialog.
        if (attempts < 3) {
          window.setTimeout(checkPermission, 2000);
        }
      } else {
        setLocationPermissionDenied(false);
        setGpsUnavailable(false);
      }
    };

    checkPermission();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    availableRidesRef.current = availableRides;
  }, [availableRides]);

  useEffect(() => {
    if (!toggleError) return undefined;
    const timeout = window.setTimeout(() => setToggleError(""), 8000);
    return () => window.clearTimeout(timeout);
  }, [toggleError]);

  useEffect(() => {
    if (!acceptError) return undefined;
    const timeout = window.setTimeout(() => setAcceptError(""), 6000);
    return () => window.clearTimeout(timeout);
  }, [acceptError]);

  // Keep the active ride stable across foreground pushes and short polling gaps.
  const activeRide = useMemo(
    () => getActiveRideFromList(driverRides) || activeRideSnapshotRef.current || null,
    [driverRides]
  );

  const { openEvent: safetyEvent, respond: respondSafetyEvent } = useTripSafetyMonitor({
    rideId: activeRide?.id,
    enabled: Boolean(activeRide?.id),
  });

  useEffect(() => {
    activeRideRef.current = activeRide;
    if (activeRide) {
      activeRideSnapshotRef.current = activeRide;
      setAvailableRides([]);
      setAcceptError("");
      stopRideRequestAlert();
    } else if (!acceptingRideIdRef.current) {
      activeRideSnapshotRef.current = null;
    }
  }, [activeRide]);

  const showOnlineNotice = useCallback(() => {
    if (onlineNoticeTimeoutRef.current) {
      window.clearTimeout(onlineNoticeTimeoutRef.current);
    }
    setOnlineNotice(ONLINE_NOTICE_MESSAGE);
    onlineNoticeTimeoutRef.current = window.setTimeout(() => {
      setOnlineNotice((current) => (current === ONLINE_NOTICE_MESSAGE ? "" : current));
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
      serverOnlineRef.current = online;
      if (!availabilityMutationRef.current) {
        setIsOnline(online);
      }
      if (online) {
        if (localStorage.getItem(DRIVER_SOUND_ENABLED_KEY) === "1") {
          setSoundEnabled(true);
        }
      }
      // Seed map position from last known in-service profile coords when phone GPS is wrong/empty.
      const profilePos = parseGeoCoord(response.data.current_lat, response.data.current_lng);
      if (profilePos && isPointInServiceArea([profilePos.lat, profilePos.lng])) {
        lastInServicePositionRef.current = [profilePos.lat, profilePos.lng];
        setDriverPosition((current) => {
          if (current && isPointInServiceArea(current)) return current;
          return [profilePos.lat, profilePos.lng];
        });
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
      const activeId = activeRideRef.current?.id || activeRideSnapshotRef.current?.id;
      const rides = Array.isArray(response.data) ? response.data : [];
      setAvailableRides((prev) =>
        mergeAvailableRidesFromServer(rides, prev, activeId).filter((ride) => {
          const offerId = normalizeRideOfferId(ride);
          const expiresAt = suppressedOfferIdsRef.current.get(offerId);
          if (!expiresAt) return true;
          if (Date.now() > expiresAt) {
            suppressedOfferIdsRef.current.delete(offerId);
            return true;
          }
          return false;
        })
      );
    } catch (error) {
      console.log("Available rides error:", error.response?.data || error);
      if (isAuthError(error)) { sendToLogin(); return; }
      // Keep pending WS offers during transient polling failures.
    }
  }, [isAuthError, sendToLogin]);

  const fetchDriverRides = useCallback(async () => {
    try {
      const response = await authenticatedApi.get(`${API_URL}/rides/driver-rides/`);
      const rides = Array.isArray(response.data) ? response.data : [];
      reconcileActiveRideSnapshot(rides, activeRideSnapshotRef);
      if (rides.some((ride) => ACTIVE_RIDE_STATUSES.includes(ride.status))) {
        setAvailableRides([]);
      }
      setDriverRides((prev) => {
        const prevActive = prev.find((ride) => ACTIVE_RIDE_STATUSES.includes(ride.status));
        const nextActive = rides.find((ride) => ACTIVE_RIDE_STATUSES.includes(ride.status));
        if (
          prevActive &&
          nextActive &&
          String(prevActive.id) === String(nextActive.id)
        ) {
          return rides.map((ride) => {
            if (String(ride.id) !== String(nextActive.id)) return ride;
            const merged = { ...prevActive, ...ride };
            if (prevActive.pickup_pin_verified && !ride.pickup_pin_verified) {
              merged.pickup_pin_verified = true;
              if (prevActive.pickup_pin_verified_at) {
                merged.pickup_pin_verified_at = prevActive.pickup_pin_verified_at;
              }
            }
            return merged;
          });
        }
        if (prevActive && !nextActive) {
          const serverMatch = rides.find(
            (ride) => String(ride.id) === String(prevActive.id)
          );
          if (serverMatch && TERMINAL_RIDE_STATUSES.includes(serverMatch.status)) {
            activeRideSnapshotRef.current = null;
            return rides;
          }
          if (!serverMatch) {
            return [prevActive, ...rides.filter((ride) => String(ride.id) !== String(prevActive.id))];
          }
          return rides;
        }
        return rides;
      });
    } catch (error) {
      console.log("Driver rides error:", error.response?.data || error);
      if (isAuthError(error)) { sendToLogin(); return; }
      // Preserve the active sheet during transient polling/WS failures.
    }
  }, [isAuthError, sendToLogin]);

  const fetchDriverStats = useCallback(async () => {
    try {
      const [earningsRes, statsRes] = await Promise.all([
        authenticatedApi.get(`${API_URL}/rides/driver/earnings/`),
        authenticatedApi.get(`${API_URL}/drivers/me/stats/`).catch(() => ({ data: null })),
      ]);
      const data = earningsRes.data || {};
      setEarningsByPeriod({
        today: data.today_earnings || 0,
        week: data.week_earnings || 0,
        month: data.month_earnings || 0,
        year: data.year_earnings || 0,
      });
      setEarningsDate(data.earnings_date || null);
      if (statsRes?.data) {
        setDriverPerformance(statsRes.data);
      }
    } catch (error) {
      console.log("Driver stats error:", error.response?.data || error);
      if (isAuthError(error)) { sendToLogin(); return; }
    }
  }, [isAuthError, sendToLogin]);

  const handleRideStatusChange = useCallback((data) => {
    const updated = data?.ride || data;
    const rideId = updated?.id || updated?.ride_id;
    if (rideId) {
      const status = updated.status || data?.status;
      const isTerminal = TERMINAL_RIDE_STATUSES.includes(status);
      if (!isTerminal) {
        activeRideSnapshotRef.current = { ...updated, id: rideId, status };
      } else {
        // UI-only: capture the finished ride for the completion summary sheet
        // before the active ride is cleared. Does not affect ride lifecycle.
        if (status === "completed") {
          const priorSnapshot = activeRideSnapshotRef.current;
          if (priorSnapshot && String(priorSnapshot.id) === String(rideId)) {
            setCompletedRideSummary({ ...priorSnapshot, ...updated, id: rideId, status });
          } else {
            setCompletedRideSummary({ ...updated, id: rideId, status });
          }
        }
        activeRideSnapshotRef.current = null;
      }
      setDriverRides((prev) => {
        if (isTerminal) {
          return prev.filter((ride) => String(ride.id) !== String(rideId));
        }
        const others = prev.filter((ride) => String(ride.id) !== String(rideId));
        const merged = {
          ...updated,
          id: rideId,
          status: status || updated.status,
          pickup_pin_verified:
            updated.pickup_pin_verified ?? Boolean(updated.pickup_pin_verified_at),
        };
        return [merged, ...others];
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
        const agreementResult = await ensureDriverAgreementBeforeOnline("/driver");
        if (!agreementResult || agreementResult === false) {
          finishToggle();
          return;
        }
        if (agreementResult && typeof agreementResult === "object" && agreementResult.ok === false) {
          setToggleError(agreementResult.error || "Could not verify driver agreement.");
          finishToggle();
          return;
        }
        if (driverProfile?.status && driverProfile.status !== "approved") {
          setToggleError(getDriverApprovalNotice(driverProfile));
          finishToggle();
          return;
        }
        if (documentsBlockOnline) {
          setToggleError(
            "One or more required documents have expired. Upload renewed documents before going online."
          );
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
        serverOnlineRef.current = goingOnline;
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
      finishToggle();
    }
  }, [
    documentsBlockOnline,
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
    if (!rideId || activeRideRef.current) return;
    if (message?.status && message.status !== "requested") return;
    setAvailableRides((prev) => {
      if (prev.some((ride) => normalizeRideOfferId(ride) === String(rideId))) return prev;
      return [{
        id: rideId, ride_id: rideId,
        pickup: message.pickup, destination: message.destination,
        pickup_lat: message.pickup_lat, pickup_lng: message.pickup_lng,
        destination_lat: message.destination_lat, destination_lng: message.destination_lng,
        fare: message.fare, distance_km: message.distance_km,
        stop_count: message.stop_count, stops: message.stops,
        countdown: message.countdown || 30,
        offerReceivedAt: Date.now(),
      }, ...prev];
    });
  }, []);

  const silentMergeActiveRide = useCallback((message) => {
    const rideId = message?.ride_id || message?.id;
    const active = activeRideRef.current;
    if (!active || !rideId || String(active.id) !== String(rideId)) {
      return false;
    }
    const status = message.status || active.status;
    setDriverRides((prev) =>
      prev.map((ride) => {
        if (String(ride.id) !== String(rideId)) return ride;
        const merged = { ...ride, ...message, id: rideId, status };
        // Never let a partial WS payload wipe a verified PIN.
        if (ride.pickup_pin_verified && message.pickup_pin_verified !== true) {
          merged.pickup_pin_verified = true;
          if (ride.pickup_pin_verified_at && !merged.pickup_pin_verified_at) {
            merged.pickup_pin_verified_at = ride.pickup_pin_verified_at;
          }
        }
        return merged;
      })
    );
    const snapshot = { ...active, ...message, id: rideId, status };
    if (active.pickup_pin_verified && message.pickup_pin_verified !== true) {
      snapshot.pickup_pin_verified = true;
    }
    activeRideSnapshotRef.current = snapshot;
    return true;
  }, []);

  const updateDriverLocation = useCallback(async (location) => {
    try {
      await authenticatedApi.post(`${API_URL}/drivers/location/update/`, {
        current_lat: location[0],
        current_lng: location[1],
      });
      console.log("[driver-location] backend update success", { lat: location[0], lng: location[1] });
      driverTripDebug("location-update-ok", { lat: location[0], lng: location[1] });
    } catch (error) {
      driverTripDebug("location-update-fail", {
        status: error.response?.status,
        detail: error.response?.data?.detail || error.response?.data?.error,
      });
      console.log("[driver-location] backend update error:", error.response?.data || error);
      if (isAuthError(error)) { sendToLogin(); }
    }
  }, [isAuthError, sendToLogin]);

  // ─── Ride Request Handling ──────────────────────────────────────────────────

  const acceptRide = useCallback(async (rideId) => {
    if (!rideId || acceptingRideIdRef.current === rideId) return;
    if (activeRideRef.current) {
      setAcceptError("Finish your current ride before accepting another request.");
      return;
    }

    acceptingRideIdRef.current = rideId;
    setAcceptingRideId(rideId);
    stopRideRequestAlert();
    const requestRide = availableRidesRef.current.find((ride) => String(ride.id || ride.ride_id) === String(rideId)) || {};
    setAvailableRides((prev) => prev.filter((ride) => String(ride.id || ride.ride_id) !== String(rideId)));

    try {
      const response = await authenticatedApi.post(`${API_URL}/rides/accept/${rideId}/`, {});
      const acceptedRide = response.data?.ride || response.data || {};
      const hydratedRide = {
        ...requestRide,
        ...acceptedRide,
        id: acceptedRide.id || rideId,
        status: acceptedRide.status === "accepted" ? "driver_arriving" : (acceptedRide.status || "driver_arriving"),
      };
      activeRideSnapshotRef.current = hydratedRide;
      setAvailableRides([]);
      stopRideRequestAlert();
      alertedRideIdsRef.current.add(rideId);
      setDriverRides((prev) => {
        const nonActive = prev.filter(
          (ride) => String(ride.id) !== String(rideId) && !ACTIVE_RIDE_STATUSES.includes(ride.status)
        );
        return [hydratedRide, ...nonActive];
      });
      fetchDriverRides();
      if (isNative()) {
        requestLocationPermission().then((result) => {
          driverTripDebug("gps-permission-on-accept", result);
          setLocationPermissionDenied(!result.granted);
          if (result.granted) setGpsUnavailable(false);
        });
      }
      if (getAutoNavigationEnabled()) {
        openExternalNavigation(hydratedRide, "pickup");
      }
    } catch (error) {
      console.log("Accept ride error:", error.response?.data || error);
      if (isAuthError(error)) { sendToLogin(); return; }
      stopRideRequestAlert();
      suppressedOfferIdsRef.current.set(String(rideId), Date.now() + 90000);
      alertedRideIdsRef.current.add(rideId);
      setAcceptError(error.response?.data?.detail || error.response?.data?.error || "Could not accept ride. Please try again.");
      fetchDriverRides();
    } finally {
      if (acceptingRideIdRef.current === rideId) {
        acceptingRideIdRef.current = null;
      }
      setAcceptingRideId((current) => (current === rideId ? null : current));
    }
  }, [fetchDriverRides, isAuthError, sendToLogin]);

  const dismissRideOffer = useCallback((rideId) => {
    stopRideRequestAlert();
    setAvailableRides((prev) =>
      prev.filter((ride) => normalizeRideOfferId(ride) !== String(rideId))
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
    // Let the server 30s timeout record a missed offer; declining would
    // cancel that timer and apply the wrong penalty bucket.
    dismissRideOffer(rideId);
  }, [dismissRideOffer]);

  // Cancel active ride (driver side)
  const [driverCancelOpen, setDriverCancelOpen] = useState(false);
  const [driverCancelError, setDriverCancelError] = useState("");
  const [driverCancelling, setDriverCancelling] = useState(false);

  const cancelActiveRide = async ({ reason, reason_details: reasonDetails = "" }) => {
    if (!activeRide || !reason?.trim()) return;
    try {
      setDriverCancelling(true);
      setDriverCancelError("");
      const payload = {
        reason: reason.trim(),
        reason_details: reasonDetails.trim(),
        cancelled_by: "driver",
      };
      if (isDriverNoShowReason(reason.trim()) && driverPosition) {
        payload.lat = Number(driverPosition[0]);
        payload.lng = Number(driverPosition[1]);
        try {
          payload.device_id = await getStableDeviceId();
        } catch {
          payload.device_id = "";
        }
      }
      const { data } = await authenticatedApi.post(
        `${API_URL}/rides/cancel/${activeRide.id}/`,
        payload
      );
      setDriverCancelOpen(false);
      const cancelledRideId = activeRide.id;
      activeRideSnapshotRef.current = null;
      setDriverRides((prev) =>
        prev.filter((ride) => String(ride.id) !== String(cancelledRideId))
      );
      if (data?.is_rider_no_show || data?.penalty_waived) {
        // Soft success — rider no-show: no driver penalty, compensation applied server-side
      }
      fetchDriverRides();
      fetchDriverStatus();
      fetchDriverStats();
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

  const logAndCallRider = useCallback(
    async (ride) => {
      const target = ride || activeRideSnapshotRef.current;
      if (!target?.id) return;
      try {
        const { data } = await authenticatedApi.post(
          `${API_URL}/rides/call-attempt/${target.id}/`,
          {}
        );
        const nextCount = Number(data?.call_attempts || 0);
        const patch = {
          rider_call_attempt_count: nextCount,
          rider_call_last_at: data?.rider_call_last_at || null,
        };
        setDriverRides((prev) =>
          prev.map((item) => (item.id === target.id ? { ...item, ...patch } : item))
        );
        if (activeRideSnapshotRef.current?.id === target.id) {
          activeRideSnapshotRef.current = {
            ...activeRideSnapshotRef.current,
            ...patch,
          };
        }
      } catch (error) {
        // Non-blocking: still open dialer even if logging fails
        console.warn("call-attempt log failed", error?.response?.status || error);
      }
      const phone =
        target.private_call_number || target.rider_phone || target.rider?.phone_number || "";
      if (phone) {
        window.open(`tel:${phone}`, "_self");
      }
    },
    []
  );

  const closeDriverCancelModal = useCallback(() => {
    setDriverCancelOpen(false);
    setDriverCancelError("");
  }, []);

  // ─── Navigation / Logout ────────────────────────────────────────────────────

  const logout = useCallback(async () => {
    // Clear session and redirect immediately — don't block on network calls
    resetAuthRedirectFlag();
    clearAuthSession();
    // Fire-and-forget: cleanup background services
    stopBackgroundLocationTracking().catch(() => {});
    unregisterPushNotifications(API_URL).catch(() => {});
    redirectToLogin("/driver");
  }, []);

  // ─── Effects ────────────────────────────────────────────────────────────────

  useEffect(() => {
    fetchDriverStatus();
    fetchDriverRides();
    fetchAvailableRides();
    fetchDriverStats();
    preloadNotificationSound();
  }, [fetchDriverStatus, fetchDriverRides, fetchAvailableRides, fetchDriverStats]);

  useEffect(() => {
    if (!isOnline) return;
    fetchAvailableRides();
    fetchHeatmap();
  }, [isOnline, fetchAvailableRides, fetchHeatmap]);

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
    const statusInterval = setInterval(fetchDriverStatus, 15000);
    const ridesInterval = setInterval(() => {
      fetchDriverRides();
      if (!activeRideRef.current && (isOnlineRef.current || serverOnlineRef.current)) {
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
      if (!shouldProcessRideEvent(msg, "ws")) return;

      const msgRideId = msg?.ride_id || msg?.id;
      const active = activeRideRef.current;
      const activeId = active ? String(active.id) : null;
      const isSameActiveRide = Boolean(activeId && msgRideId && activeId === String(msgRideId));

      if (
        msg.type === "ride_request"
        && (isOnlineRef.current || serverOnlineRef.current)
        && !active
      ) {
        mergeIncomingRideRequest(msg);
        // Sound/vibration is handled by RideRequestCard so it is not duplicated here.
        return;
      }
      if (msg.type === "ride_request" && active) {
        return;
      }
      if (msg.type === "ride_request_expired") {
        const expiredRideId = msg?.ride_id || msg?.id;
        if (expiredRideId) {
          dismissRideOffer(expiredRideId);
        } else {
          fetchAvailableRides();
        }
        return;
      }
      if (
        !active &&
        msgRideId &&
        (msg.status === "accepted" || msg.status === "driver_arriving") &&
        availableRidesRef.current.some(
          (ride) => normalizeRideOfferId(ride) === String(msgRideId)
        )
      ) {
        dismissRideOffer(msgRideId);
        return;
      }
      if (msg.type === "document_status") {
        fetchDriverStatus();
        return;
      }
      if (
        msg.status === "cancelled" ||
        msg.status === "completed" ||
        msg.status === "rider_no_show"
      ) {
        handleRideStatusChange(msg);
        if (!activeRideRef.current) {
          fetchAvailableRides();
        }
        return;
      }
      if (
        isSameActiveRide &&
        (msg.type === "ride_update" || msg.type === "ride_status_update" || msg.status) &&
        silentMergeActiveRide(msg)
      ) {
        return;
      }
      if (active) {
        return;
      }
      if (
        msg.type === "ride_request" ||
        msg.type === "ride_request_expired" ||
        msg.type === "ride_update" ||
        msg.type === "ride_status_update" ||
        msg.status ||
        msg.ride_id
      ) {
        fetchDriverRides();
        fetchDriverStats();
        fetchAvailableRides();
      }
    });
    return () => unsub();
  }, [dismissRideOffer, fetchAvailableRides, fetchDriverRides, fetchDriverStats, fetchDriverStatus, handleRideStatusChange, mergeIncomingRideRequest, shouldProcessRideEvent, silentMergeActiveRide]);

  // Foreground push: refresh silently; never duplicate active ride UI.
  useEffect(() => {
    const onPushReceived = (event) => {
      const data = event?.detail?.data || event?.detail?.notification?.data || {};
      if (!shouldProcessRideEvent(data, "push")) return;

      const type = data?.type;
      const rideId = data?.ride_id || data?.id;
      const active = activeRideRef.current;

      if (
        data.status === "cancelled" ||
        data.status === "completed" ||
        data.status === "rider_no_show"
      ) {
        handleRideStatusChange(data);
        return;
      }

      if (active && rideId && String(active.id) === String(rideId)) {
        if (type === "ride_request") return;
        silentMergeActiveRide({ ...data, ride_id: rideId });
        return;
      }

      if (type === "ride_request" && !active) {
        mergeIncomingRideRequest(data);
      }
    };

    const onFocusRide = (event) => {
      const data = event?.detail || {};
      const rideId = data?.ride_id || data?.id;
      if (
        activeRideRef.current &&
        rideId &&
        String(activeRideRef.current.id) === String(rideId)
      ) {
        return;
      }
      if (!activeRideRef.current) {
        fetchDriverRides();
      }
    };

    window.addEventListener("yala:push-received", onPushReceived);
    window.addEventListener("yala:driver-focus-ride", onFocusRide);
    return () => {
      window.removeEventListener("yala:push-received", onPushReceived);
      window.removeEventListener("yala:driver-focus-ride", onFocusRide);
    };
  }, [fetchDriverRides, handleRideStatusChange, mergeIncomingRideRequest, shouldProcessRideEvent, silentMergeActiveRide]);

  // Geolocation: watch driver position with Capacitor plugin when native
  useEffect(() => {
    let cleanup = () => {};
    let mounted = true;

    const startWatch = async () => {
      cleanup = await watchForegroundLocation({
        onLocation: ({ lat, lng, accuracy }) => {
          if (!mounted) return;

          const parsed = parseGeoCoord(lat, lng);
          if (!parsed) {
            driverTripDebug("gps-parse-fail", { lat, lng, accuracy });
            setGpsUnavailable(true);
            return;
          }

          const inService = isPointInServiceArea([parsed.lat, parsed.lng]);
          driverTripDebug("gps-fix", {
            lat: parsed.lat,
            lng: parsed.lng,
            accuracy,
            inServiceArea: inService,
            onActiveRide: Boolean(activeRideRef.current),
          });

          // Never use out-of-market GPS for trip distance / arrive (e.g. US phone testing MR rides).
          if (!inService) {
            setGpsOutsideServiceArea(true);
            setGpsUnavailable(false);
            setLocationPermissionDenied(false);
            const fallback = lastInServicePositionRef.current;
            if (fallback) {
              setDriverPosition(fallback);
            }
            return;
          }

          setGpsOutsideServiceArea(false);
          setGpsUnavailable(false);
          setLocationPermissionDenied(false);
          lastInServicePositionRef.current = [parsed.lat, parsed.lng];
          setDriverPosition([parsed.lat, parsed.lng]);
          updateDriverLocation([parsed.lat, parsed.lng]);
        },
        onError: ({ code, message }) => {
          if (!mounted) return;
          driverTripDebug("gps-error", { code, message });
          setGpsUnavailable(true);
          if (!activeRideRef.current && !lastInServicePositionRef.current) {
            setDriverPosition(null);
          }
        },
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 12000,
      });
    };

    startWatch();

    return () => {
      mounted = false;
      cleanup();
    };
  }, [updateDriverLocation]);

  useEffect(() => {
    if (!activeRide?.id || !isNative()) return undefined;
    let cancelled = false;
    requestLocationPermission().then((result) => {
      if (cancelled) return;
      driverTripDebug("gps-permission-on-ride", { rideId: activeRide.id, ...result });
      setLocationPermissionDenied(!result.granted);
      if (result.granted) setGpsUnavailable(false);
    });
    return () => {
      cancelled = true;
    };
  }, [activeRide?.id]);

  // Refresh badge immediately when a document is uploaded from DriverDocuments page
  useEffect(() => {
    const onDocsChanged = () => fetchDriverStatus();
    window.addEventListener("yala:documents-changed", onDocsChanged);
    return () => window.removeEventListener("yala:documents-changed", onDocsChanged);
  }, [fetchDriverStatus]);

  // Refresh ride state when app returns to foreground
  useEffect(() => {
    const refreshDashboard = () => {
      fetchDriverStatus();
      if (activeRideRef.current) {
        return;
      }
      fetchDriverRides();
      fetchAvailableRides();
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

  const arriveGate = useMemo(() => {
    if (!activeRide) return null;
    if (!["accepted", "driver_arriving", "driver_arrived"].includes(activeRide.status)) {
      return null;
    }
    return computeArriveGate({
      driverPosition,
      pickupLat: activeRide.pickup_lat,
      pickupLng: activeRide.pickup_lng,
      outsideServiceArea: gpsOutsideServiceArea,
    });
  }, [activeRide, driverPosition, gpsOutsideServiceArea]);

  const distanceToNextKm = useMemo(() => {
    if (!activeRide || !driverPosition) return null;

    if (["accepted", "driver_arriving", "driver_arrived"].includes(activeRide.status)) {
      return arriveGate?.distanceKm ?? null;
    }

    const driverCoord = parseGeoCoord(driverPosition[0], driverPosition[1]);
    if (!driverCoord) return null;

    let targetLat = null;
    let targetLng = null;

    if (activeRide.status === "in_progress") {
      const sortedStops = Array.isArray(activeRide.stops)
        ? [...activeRide.stops].sort(
            (left, right) => Number(left.stop_order || 0) - Number(right.stop_order || 0)
          )
        : [];
      const nextStop = getNavigationDestination(sortedStops, "in_progress");
      if (nextStop) {
        targetLat = nextStop.latitude;
        targetLng = nextStop.longitude;
      } else {
        targetLat = activeRide.destination_lat;
        targetLng = activeRide.destination_lng;
      }
    }

    const targetCoord = parseGeoCoord(targetLat, targetLng);
    if (!targetCoord) return null;
    return haversineKm(
      driverCoord.lat,
      driverCoord.lng,
      targetCoord.lat,
      targetCoord.lng
    );
  }, [activeRide, arriveGate, driverPosition]);

  const liveTripState = useRideLiveState(activeRide, driverPosition, {
    distanceKm: distanceToNextKm,
  });

  useEffect(() => {
    if (!activeRide) return;
    const slideStatuses = ["accepted", "driver_arriving"];
    driverTripDebug("trip-state", {
      status: activeRide.status,
      driverLat: driverPosition?.[0] ?? null,
      driverLng: driverPosition?.[1] ?? null,
      pickupLat: activeRide.pickup_lat,
      pickupLng: activeRide.pickup_lng,
      distanceKm: distanceToNextKm,
      distanceM: arriveGate?.distanceM ?? null,
      nearPickup: arriveGate?.near ?? false,
      gpsUnavailable,
      locationPermissionDenied,
      slideVisible:
        slideStatuses.includes(activeRide.status) && Boolean(arriveGate?.near),
      slideReason: !driverPosition
        ? "no_driver_coords"
        : !arriveGate?.reliable
        ? "distance_unknown"
        : !arriveGate?.near
        ? `too_far_${Math.round(arriveGate?.distanceM ?? 0)}m`
        : "ready",
    });
  }, [
    activeRide,
    arriveGate,
    distanceToNextKm,
    driverPosition,
    gpsUnavailable,
    locationPermissionDenied,
  ]);

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
        yalaUI ? "driver-dashboard-new--lyft" : "",
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
      {(() => {
        const banners = [];
        if (onlineNotice && !activeRide) {
          banners.push({ msg: onlineNotice, bg: "rgba(0,166,81,0.92)" });
        }
        const errorMsg = statusLoadError || toggleError;
        if (errorMsg) banners.push({ msg: errorMsg, bg: "rgba(239,68,68,0.92)", alert: true });
        if (driverNotice && !activeRide) banners.push({ msg: driverNotice, bg: "rgba(30,58,138,0.92)" });
        if (acceptError) banners.push({ msg: acceptError, bg: "rgba(239,68,68,0.92)", alert: true });
        if (!driverPosition && (gpsUnavailable || locationPermissionDenied)) {
          banners.push({
            msg: locationPermissionDenied
              ? "Location permission denied. Enable GPS in phone settings."
              : "Location unavailable. Enable GPS to navigate.",
            bg: "rgba(239,68,68,0.92)",
            alert: true,
          });
        } else if (gpsOutsideServiceArea && activeRide) {
          banners.push({
            msg: "GPS is outside Mauritania. Mark Arrived is unlocked — confirm only if you are at pickup.",
            bg: "rgba(245,158,11,0.95)",
          });
        }
        if (cancellationWarning && !activeRide) banners.push({ msg: cancellationWarning, bg: "rgba(245,158,11,0.95)" });
        if (documentsBlockOnline && !activeRide) {
          banners.push({
            msg: "Required documents have expired. Upload renewed documents before going online.",
            bg: "rgba(239,68,68,0.92)",
            alert: true,
          });
        } else if (documentsAlertLevel === "warning" && !activeRide) {
          const soon = driverProfile?.expiring_soon_documents?.[0];
          const days = soon?.days_remaining;
          banners.push({
            msg:
              days !== undefined && days !== null
                ? `A required document expires in ${days} day${days === 1 ? "" : "s"}. Open Documents to renew.`
                : "A required document is expiring soon. Open Documents to renew.",
            bg: "rgba(245,158,11,0.95)",
          });
        }
        if (banners.length === 0) return null;
        return (
          <div style={noticeBannerStackStyle}>
            {banners.map((b, i) => (
              <div
                key={i}
                className="driver-dashboard-new__notice"
                style={{ ...noticeBannerStyle, position: "relative", top: 0, background: b.bg }}
                role={b.alert ? "alert" : undefined}
              >
                {b.msg}
              </div>
            ))}
          </div>
        );
      })()}

      <DriverDashboardContent
        driverProfile={driverProfile}
        isOnline={isOnline}
        toggleLoading={toggleLoading}
        toggleError={toggleError}
        documentsBlockOnline={documentsBlockOnline}
        documentsAlert={documentsAlert}
        documentsAlertLevel={documentsAlertLevel}
        todayTripsCount={todayTripsCount}
        todayEarnings={earningsByPeriod.today}
        acceptanceRate={acceptanceRate}
        missedRides={missedRides}
        driverPerformance={driverPerformance}
        earningsByPeriod={earningsByPeriod}
        recentRides={driverRides}
        onToggleAvailability={toggleAvailability}
        onOpenMenu={() => setMenuOpen(true)}
        loading={!driverProfile && !statusLoadError}
        error={statusLoadError}
        onRetry={fetchDriverStatus}
      />

      {/* ─── Navigation sheet (collapsed during active ride) ─── */}
      {activeRide && (
        <section
          className="driver-nav-sheet is-expanded"
          aria-label="Active ride navigation"
        >
          <div className="driver-nav-sheet__header" aria-live="polite">
            <span className="driver-nav-sheet__grip" aria-hidden="true" />
            <div className="driver-nav-sheet__summary">
              <span className="driver-nav-sheet__status">{activeRideStatusLabel}</span>
              <span className="driver-nav-sheet__fare">
                {activeRide.fare ? `${activeRide.fare} MRU` : ""}
              </span>
            </div>
          </div>

          <div className="driver-nav-sheet__body">
            <DriverLiveTripBar
              ride={activeRide}
              liveState={liveTripState}
              distanceKm={distanceToNextKm}
              locationPending={!driverPosition}
              onNoShow={() => setDriverCancelOpen(true)}
            />
            <div className="driver-nav-sheet__route">
              <span>📍 {activeRide.pickup || "Pickup"}</span>
              <span className="driver-nav-sheet__route-arrow">→</span>
              <span>🏁 {activeRide.destination || "Destination"}</span>
            </div>
          </div>
          <div className="driver-nav-sheet__actions">
            <RideStatusButtons
              key={`ride-actions-${activeRide.id}`}
              ride={activeRide}
              distanceToNextKm={distanceToNextKm}
              driverPosition={driverPosition}
              arriveGate={arriveGate}
              gpsUnavailable={gpsUnavailable}
              onStatusChange={handleRideStatusChange}
            />
            {activeRide.status === "driver_arrived" &&
            (activeRide.private_call_number || activeRide.rider_phone) ? (
              <PrimaryButton
                fullWidth
                size="sm"
                iconLeft="📞"
                onClick={() => logAndCallRider(activeRide)}
                aria-label="Call rider"
              >
                Call Rider
              </PrimaryButton>
            ) : null}
            {canCancelActiveRide ? (
              <Button
                variant="danger"
                fullWidth
                size="sm"
                onClick={() => setDriverCancelOpen(true)}
                aria-label="Cancel ride"
              >
                Cancel ride
              </Button>
            ) : null}
          </div>
        </section>
      )}

      {/* ─── Ride Request Overlay ────────────────────────────── */}
      {isOnline && incomingRide && !activeRide && (
        <RideRequestCard
          key={incomingRideId}
          ride={incomingRide}
          enableSound
          accepting={Boolean(acceptingRideId)}
          onAccept={() => incomingRideId && acceptRide(incomingRideId)}
          onDecline={() => incomingRideId && declineRide(incomingRideId)}
          onExpired={() => incomingRideId && handleOfferExpired(incomingRideId)}
        />
      )}

      {/* ─── Completed Trip Summary (UI-only) ────────────────── */}
      {completedRideSummary && !activeRide && (
        <TripCompletionSummary
          ride={completedRideSummary}
          onDismiss={() => setCompletedRideSummary(null)}
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
          onCallRider={logAndCallRider}
          distanceToPickupM={
            distanceToNextKm != null && Number.isFinite(Number(distanceToNextKm))
              ? Number(distanceToNextKm) * 1000
              : null
          }
        />
      )}

      {activeRide ? (
        <button
          type="button"
          className="driver-dashboard-new__sos"
          onClick={() => setShowSafety(true)}
          aria-label="Open safety center"
          style={{
            position: "fixed",
            right: 16,
            bottom: activeRide ? 180 : 96,
            zIndex: 900,
            width: 56,
            height: 56,
            borderRadius: "999px",
            border: 0,
            background: "#dc2626",
            color: "#fff",
            fontWeight: 900,
            boxShadow: "0 10px 30px rgba(220,38,38,.45)",
          }}
        >
          SOS
        </button>
      ) : null}

      {showSafety && activeRide ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1100,
            background: "rgba(0,0,0,.55)",
            display: "grid",
            placeItems: "center",
            padding: 16,
          }}
        >
          <SafetyEmergencyPanel
            role="driver"
            currentRide={activeRide}
            onClose={() => setShowSafety(false)}
          />
        </div>
      ) : null}

      <TripSafetyPrompt
        event={safetyEvent}
        onSafe={() => respondSafetyEvent(true)}
        onNeedHelp={() => {
          respondSafetyEvent(false, "Driver requested help from safety prompt");
          setShowSafety(true);
        }}
      />

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
          documents_alert_level: documentsAlertLevel,
        }}
        onNavigate={(path) => {
          const basePath = String(path || "").split("?")[0];
          if (basePath === "/driver/account" || basePath === "/driver/profile") {
            if (path.includes("?")) {
              window.history.replaceState(null, "", path);
            }
            setCurrentView("profile");
            setMenuOpen(false);
            return;
          }
          if (basePath === "/driver/documents") {
            setCurrentView("documents");
            setMenuOpen(false);
            return;
          }
          navigateInApp(path);
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
  fontFamily: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
};

const mapFullscreen = {
  position: "absolute",
  inset: 0,
  zIndex: 0,
};

const noticeBannerStackStyle = {
  position: "absolute",
  top: 88,
  left: 12,
  right: 12,
  zIndex: 30,
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const noticeBannerStyle = {
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
