import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";

import "./driver-tokens.css";
import DriverMap from "./DriverMap";
import RideDashboard from "./RideDashboard";
import { API_URL } from "../apiConfig";
import SafetyEmergencyPanel from "../safety/SafetyEmergencyPanel";
import { MARKET, formatMoney, isPointInServiceArea } from "../marketConfig";
import RideStatusButtons from "../RideStatusButtons";
import AnalyticsDashboard from "../admin/AnalyticsDashboard";
import RideChat from "../components/RideChat";
import RideCancellationModal from "../components/RideCancellationModal";
import {
  joinRideUpdates,
  leaveRideUpdates,
  sendDriverLocation,
  subscribeRideUpdates,
} from "../socket";
import { EmergencySupportButton } from "./DriverSupport";
import { isNative } from "../native/platform";
import { preloadNotificationSound, playNativeSound, vibrateNative, playRideAlertChime } from "../native/sound";

const logoSrc = "/yala-driver-logo.png";
const DRIVER_GREEN = "#0F8F4D";
const DRIVER_GREEN_BRIGHT = "#00A651";
const DRIVER_GREEN_SOFT = "rgba(15, 143, 77, 0.14)";
const DRIVER_GREEN_SHADOW = "rgba(15, 143, 77, 0.28)";

const getDriverApprovalMessage = (profile) => {
  const status = profile?.status || "pending";

  if (status === "approved") {
    return "Verified driver. You can go online and receive ride requests.";
  }

  if (status === "rejected") {
    return (
      profile?.document_rejection_reason ||
      "Your driver application was rejected. Update your documents and submit again for admin review."
    );
  }

  return "Your driver application is pending admin review. You cannot go online until your documents are approved.";
};

const getVerificationBadge = (status) => {
  if (status === "approved") {
    return {
      label: "Verified",
      background: "#dcfce7",
      color: "#166534",
      border: "#86efac",
    };
  }

  if (status === "rejected") {
    return {
      label: "Rejected",
      background: "#fee2e2",
      color: "#991b1b",
      border: "#fecaca",
    };
  }

  return {
    label: "Pending review",
    background: "#fff7ed",
    color: "#9a3412",
    border: "#fed7aa",
  };
};

function DriverEarningsDashboard({
  todayEarnings,
  totalEarnings,
  withdrawableBalance,
  charts,
}) {
  const [period, setPeriod] = useState("daily");
  const chartData = charts?.[period] || [];
  const maxEarning = Math.max(...chartData.map((item) => Number(item.earnings || 0)), 1);
  const periodLabel =
    period === "daily" ? "Last 7 days" : period === "weekly" ? "Last 4 weeks" : "Last 6 months";

  return (
    <section style={earningsDashboardStyle}>
      <div style={earningsDashboardHeaderStyle}>
        <div>
          <span style={smallLabelStyle}>Earnings dashboard</span>
          <h2 style={earningsDashboardTitleStyle}>{periodLabel}</h2>
        </div>
        <div style={earningsSegmentStyle}>
          {["daily", "weekly", "monthly"].map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setPeriod(item)}
              style={{
                ...earningsSegmentButtonStyle,
                background: period === item ? "#111827" : "transparent",
                color: period === item ? "white" : "#475467",
              }}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div style={earningsStatsGridStyle}>
        <MetricTile label="Today" value={formatMoney(todayEarnings)} />
        <MetricTile label="Total" value={formatMoney(totalEarnings)} />
        <MetricTile label="Withdrawable" value={formatMoney(withdrawableBalance)} />
      </div>

      <div style={barChartStyle}>
        {chartData.map((item) => {
          const value = Number(item.earnings || 0);
          const height = Math.max(8, Math.round((value / maxEarning) * 100));

          return (
            <div key={`${period}-${item.label}-${item.date || item.start_date}`} style={barItemStyle}>
              <div style={barColumnStyle}>
                <span
                  title={`${item.label}: ${formatMoney(value)}`}
                  style={{
                    ...barStyle,
                    height: `${height}%`,
                  }}
                />
              </div>
              <strong style={barValueStyle}>{formatMoney(value)}</strong>
              <span style={barLabelStyle}>{item.label}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function MetricTile({ label, value }) {
  return (
    <div style={metricTileStyle}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export default function DriverApp() {
  const [availableRides, setAvailableRides] = useState([]);
  const [driverRides, setDriverRides] = useState([]);
  const [isOnline, setIsOnline] = useState(false);
  const [earnings, setEarnings] = useState(0);
  const [todayEarnings, setTodayEarnings] = useState(0);
  const [todayCompletedRides, setTodayCompletedRides] = useState(0);
  const [earningsCharts, setEarningsCharts] = useState({
    daily: [],
    weekly: [],
    monthly: [],
  });
  const [completedRides, setCompletedRides] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [driverProfile, setDriverProfile] = useState(null);
  const [showSafety, setShowSafety] = useState(false);
  const [showDriverMenu, setShowDriverMenu] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [driverNotice, setDriverNotice] = useState("");
  const [showCancellation, setShowCancellation] = useState(false);
  const [cancellationSaving, setCancellationSaving] = useState(false);
  const [cancellationError, setCancellationError] = useState("");
  const [activeRouteSummary, setActiveRouteSummary] = useState(null);
  const [showTripDetails, setShowTripDetails] = useState(false);
  const [menuMessage, setMenuMessage] = useState("");
  const [isEditingVehicle, setIsEditingVehicle] = useState(false);
  const [vehicleSaving, setVehicleSaving] = useState(false);
  const [vehicleForm, setVehicleForm] = useState({
    phone_number: "",
    vehicle_make: "",
    vehicle_model: "",
    vehicle_color: "",
    vehicle_plate: "",
    car_type: "regular",
    license_issued_at: "",
    license_expires_at: "",
    vehicle_registration_expires_at: "",
    insurance_expires_at: "",
    vignette_expires_at: "",
  });
  const [documentFiles, setDocumentFiles] = useState({
    driver_photo: null,
    license_file: null,
    vehicle_registration: null,
    insurance_document: null,
    vignette_document: null,
  });
  const [identityForm, setIdentityForm] = useState({
    national_id_number: "",
    national_id_document: null,
  });
  const [identitySaving, setIdentitySaving] = useState(false);
  const [payoutMethods, setPayoutMethods] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [withdrawableBalance, setWithdrawableBalance] = useState(0);
  const [payoutSaving, setPayoutSaving] = useState(false);
  const [withdrawalSaving, setWithdrawalSaving] = useState(false);
  const [payoutForm, setPayoutForm] = useState({
    payout_type: "bank_account",
    account_holder_name: "",
    bank_name: "",
    account_reference: "",
    card_type: "visa",
    card_last4: "",
    phone_number: "",
    wallet_id: "",
  });
  const [withdrawalForm, setWithdrawalForm] = useState({
    amount: "",
    note: "",
  });
  const [openMenuSections, setOpenMenuSections] = useState({
    earn: true,
    vehicle: true,
    feedback: true,
    account: true,
    support: true,
  });

  const alertedRideIdsRef = useRef(new Set());
  const notificationAudioRef = useRef(null);
  const audioContextRef = useRef(null);
  const requestSoundTimeoutsRef = useRef([]);

  const [driverLocation, setDriverLocation] = useState({
    current_lat: MARKET.defaultPickup.position[0],
    current_lng: MARKET.defaultPickup.position[1],
  });

  const token = localStorage.getItem("access");

  const sendToLogin = useCallback((message = "Please log in again to continue.") => {
    localStorage.removeItem("access");
    localStorage.removeItem("refresh");
    localStorage.removeItem("user");
    setDriverNotice(message);
    window.location.href = "/login";
  }, []);

  const isAuthError = (error) =>
    error.response?.status === 401 ||
    error.response?.data?.code === "token_not_valid" ||
    String(error.response?.data?.detail || "").toLowerCase().includes("token");

  const authHeaders = useMemo(
    () => ({
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }),
    [token]
  );

  const activeRides = useMemo(
    () =>
      driverRides.filter((ride) =>
        ["driver_arriving", "accepted", "driver_arrived", "in_progress"].includes(ride.status)
      ),
    [driverRides]
  );

  const activeRide = activeRides[0];
  const waitMinutes = isOnline ? Math.max(1, Math.min(9, availableRides.length + 1)) : 1;

  useEffect(() => {
    notificationAudioRef.current = new Audio("/notification.wav");
    notificationAudioRef.current.preload = "auto";
    notificationAudioRef.current.volume = 0.8;
    // Preload native sound for Capacitor Android (with small delay for plugin init)
    setTimeout(() => {
      preloadNotificationSound().then(() => {
        console.log("Sound preload complete, isNative:", isNative());
      });
    }, 1000);

    return () => {
      requestSoundTimeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
      requestSoundTimeoutsRef.current = [];
    };
  }, []);

  const unlockNotificationSound = useCallback(async () => {
    const audio = notificationAudioRef.current;

    if (soundEnabled) return;

    // This runs on user tap (Go Online) — perfect time to unlock audio
    try {
      if (audio) {
        // Play for real (not muted) at low volume to unlock audio context
        audio.volume = 0.01;
        await audio.play();
        audio.pause();
        audio.currentTime = 0;
        audio.volume = 0.8;
      }

      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass && !audioContextRef.current) {
        audioContextRef.current = new AudioContextClass();
      }

      if (audioContextRef.current?.state === "suspended") {
        await audioContextRef.current.resume();
      }

      if ("Notification" in window && Notification.permission === "default") {
        await Notification.requestPermission().catch(() => {});
      }
    } catch (error) {
      console.log("Audio unlock error:", error);
    }

    // Also try native preload
    await preloadNotificationSound();

    // Always enable sound
    setSoundEnabled(true);
    setDriverNotice("Sound alerts are enabled.");
  }, [soundEnabled]);

  const playBeep = useCallback(async () => {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContextClass();
    }

    const audioContext = audioContextRef.current;
    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
    gain.gain.setValueAtTime(0.001, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.35, audioContext.currentTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.45);

    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.5);
  }, []);

  const playNotificationSound = useCallback(async () => {
    const audio = notificationAudioRef.current;

    if (!soundEnabled) return;

    // Use Lyft-style chime
    const played = await playRideAlertChime();
    if (played) return;

    // Fallback to native audio
    if (isNative()) {
      const nativePlayed = await playNativeSound();
      if (nativePlayed) return;
    }

    // Final fallback to HTML5 audio
    try {
      if (audio) {
        audio.currentTime = 0;
        await audio.play();
      }
    } catch (error) {
      console.log("Notification sound blocked:", error);
    }
  }, [soundEnabled]);

  const ringForNewRequest = useCallback(async () => {
    requestSoundTimeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
    requestSoundTimeoutsRef.current = [];

    if ("Notification" in window && Notification.permission === "granted") {
      const notificationOptions = {
        body: "Open Yala Driver to accept the trip.",
        icon: "/logo192.png",
        badge: "/logo192.png",
        tag: "sakho-new-ride-request",
        vibrate: [220, 120, 220],
        data: {
          url: "/driver",
        },
      };

      try {
        if ("serviceWorker" in navigator) {
          const registration = await navigator.serviceWorker.ready;
          if (registration?.showNotification) {
            registration.showNotification("New ride request", notificationOptions);
          } else {
            new Notification("New ride request", notificationOptions);
          }
        } else {
          new Notification("New ride request", notificationOptions);
        }
      } catch (error) {
        console.log("Driver push notification error:", error);
        new Notification("New ride request", {
          body: notificationOptions.body,
          icon: notificationOptions.icon,
        });
      }
    }

    // Subtle double pulse + two-chime cadence for a cleaner Lyft-like alert.
    await vibrateNative(true);
    await playNotificationSound();
    const followUpId = setTimeout(() => {
      playNotificationSound();
    }, 760);
    requestSoundTimeoutsRef.current.push(followUpId);
  }, [playNotificationSound]);

  useEffect(() => {
    if (!isOnline || availableRides.length === 0) return;

    const requestLabel = `${availableRides.length} rider request${
      availableRides.length === 1 ? "" : "s"
    } available.`;

    setShowTripDetails(true);
    setDriverNotice(
      soundEnabled
        ? requestLabel
        : `${requestLabel} Tap Go Offline, then Go Online once to enable sound alerts.`
    );

    const newRideIds = availableRides
      .map((ride) => ride.id)
      .filter((id) => !alertedRideIdsRef.current.has(id));

    if (newRideIds.length === 0 || !soundEnabled) return;

    ringForNewRequest();
    alertedRideIdsRef.current = new Set(availableRides.map((ride) => ride.id));
  }, [availableRides, isOnline, ringForNewRequest, soundEnabled]);

  const fetchDriverStatus = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/drivers/me/`, authHeaders);

      setDriverProfile(response.data);
      setIsOnline(Boolean(response.data.is_available));
      if (response.data.status && response.data.status !== "approved") {
        setDriverNotice(
          response.data.document_rejection_reason ||
            `Driver account status: ${response.data.status}. Admin approval is required before going online.`
        );
      }
      const savedLocation = [
        Number(
          response.data.current_lat ||
            response.data.latitude ||
            MARKET.defaultPickup.position[0]
        ),
        Number(
          response.data.current_lng ||
            response.data.longitude ||
            MARKET.defaultPickup.position[1]
        ),
      ];

      setDriverLocation({
        current_lat: isPointInServiceArea(savedLocation)
          ? savedLocation[0]
          : MARKET.defaultPickup.position[0],
        current_lng: isPointInServiceArea(savedLocation)
          ? savedLocation[1]
          : MARKET.defaultPickup.position[1],
      });
    } catch (error) {
      console.log("Driver status error:", error.response?.data || error);
      if (isAuthError(error)) {
        sendToLogin("Your login expired. Please log in again.");
        return;
      }
      setDriverNotice(
        error.response?.data?.detail ||
          error.response?.data?.error ||
          "Please log in as a driver to go online."
      );
    }
  }, [authHeaders, sendToLogin]);

  const fetchAvailableRides = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/rides/available/`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("access")}`,
        },
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

      setEarnings(response.data.total_earnings || 0);
      setTodayEarnings(response.data.today_earnings || 0);
      setTodayCompletedRides(response.data.today_completed_rides || 0);
      setEarningsCharts(response.data.charts || { daily: [], weekly: [], monthly: [] });
      setWithdrawableBalance(response.data.withdrawable_balance || 0);
      setCompletedRides(response.data.completed_rides || 0);
    } catch (error) {
      console.log("Driver stats error:", error.response?.data || error);
    }
  }, [authHeaders]);

  const fetchPayoutData = useCallback(async () => {
    try {
      const [methodsResponse, withdrawalsResponse] = await Promise.all([
        axios.get(`${API_URL}/payments/payout-methods/`, authHeaders),
        axios.get(`${API_URL}/payments/withdrawals/`, authHeaders),
      ]);

      const withdrawalPayload = withdrawalsResponse.data;

      setPayoutMethods(Array.isArray(methodsResponse.data) ? methodsResponse.data : []);
      setWithdrawals(
        Array.isArray(withdrawalPayload)
          ? withdrawalPayload
          : Array.isArray(withdrawalPayload.withdrawals)
            ? withdrawalPayload.withdrawals
            : []
      );

      if (withdrawalPayload?.available_balance !== undefined) {
        setWithdrawableBalance(Number(withdrawalPayload.available_balance || 0));
      }
    } catch (error) {
      console.log("Payout data error:", error.response?.data || error);
    }
  }, [authHeaders]);

  const fetchAllDriverData = useCallback(async () => {
    await fetchDriverStatus();
    await fetchAvailableRides();
    await fetchDriverRides();
    await fetchDriverStats();
    await fetchPayoutData();
  }, [fetchAvailableRides, fetchDriverRides, fetchDriverStats, fetchDriverStatus, fetchPayoutData]);

  const updateDriverLocation = useCallback(
    async (location) => {
      try {
        await axios.post(
          `${API_URL}/drivers/location/update/`,
          {
            current_lat: location.current_lat,
            current_lng: location.current_lng,
          },
          authHeaders
        );
      } catch (error) {
        console.log("Location update error:", error.response?.data || error);
      }
    },
    [authHeaders]
  );

  useEffect(() => {
    if (!activeRide?.id) return undefined;

    joinRideUpdates(activeRide.id);
    return () => leaveRideUpdates(activeRide.id);
  }, [activeRide?.id]);

  useEffect(() => {
    if (!activeRide?.id) return;
    sendDriverLocation(
      activeRide.id,
      driverLocation.current_lat,
      driverLocation.current_lng
    );
  }, [activeRide?.id, driverLocation.current_lat, driverLocation.current_lng]);

  useEffect(() => {
    fetchAllDriverData();
    const interval = setInterval(fetchAllDriverData, 3000);

    // Real-time: refresh immediately when a ride update comes via WebSocket
    const unsub = subscribeRideUpdates((msg) => {
      if (msg && (msg.type === "ride_update" || msg.status || msg.ride_id)) {
        fetchAllDriverData();
      }
    });

    return () => { clearInterval(interval); unsub(); };
  }, [fetchAllDriverData]);

  useEffect(() => {
    if (!driverProfile || isEditingVehicle) return;

    setVehicleForm({
      phone_number: driverProfile.phone_number || "",
      vehicle_make: driverProfile.vehicle_make || "",
      vehicle_model: driverProfile.vehicle_model || "",
      vehicle_color: driverProfile.vehicle_color || "",
      vehicle_plate: driverProfile.vehicle_plate || driverProfile.plate_number || "",
      car_type: driverProfile.car_type || "regular",
      license_issued_at: driverProfile.license_issued_at || "",
      license_expires_at: driverProfile.license_expires_at || "",
      vehicle_registration_expires_at: driverProfile.vehicle_registration_expires_at || "",
      insurance_expires_at: driverProfile.insurance_expires_at || "",
      vignette_expires_at: driverProfile.vignette_expires_at || "",
    });
  }, [driverProfile, isEditingVehicle]);

  useEffect(() => {
    if (!driverProfile) return;

    setIdentityForm((current) => ({
      ...current,
      national_id_number: driverProfile.national_id_number || "",
    }));
  }, [driverProfile]);

  useEffect(() => {
    if (!isOnline) return;

    if (navigator.geolocation) {
      const watchId = navigator.geolocation.watchPosition(
        (position) => {
          const liveLocation = {
            current_lat: position.coords.latitude,
            current_lng: position.coords.longitude,
          };

          if (!isPointInServiceArea([liveLocation.current_lat, liveLocation.current_lng])) {
            setDriverNotice(
              "Your GPS location is outside Yala's service area. Navigation will resume when you return."
            );
            return;
          }

          setDriverLocation(liveLocation);
          updateDriverLocation(liveLocation);
          if (activeRide?.id) {
            sendDriverLocation(
              activeRide.id,
              liveLocation.current_lat,
              liveLocation.current_lng
            );
          }
        },
        (error) => {
          console.log("Phone GPS error:", error);
          setDriverNotice(
            "Location permission is required for navigation. Enable precise location in your phone settings, then return to Yala."
          );
        },
        {
          enableHighAccuracy: true,
          maximumAge: 5000,
          timeout: 12000,
        }
      );

      return () => {
        navigator.geolocation.clearWatch(watchId);
      };
    }

    setDriverNotice(
      "GPS is not available on this device. Yala will keep your last known location until GPS is enabled."
    );
  }, [activeRide?.id, isOnline, updateDriverLocation]);

  const toggleAvailability = async () => {
    const nextAvailability = !isOnline;

    if (nextAvailability && driverProfile?.status !== "approved") {
      setDriverNotice(getDriverApprovalMessage(driverProfile));
      setShowDriverMenu(true);
      return;
    }

    try {
      setDriverNotice("");
      await unlockNotificationSound();

      const response = await axios.post(
        `${API_URL}/drivers/availability/toggle/`,
        {
          is_available: nextAvailability,
        },
        authHeaders
      );

      setIsOnline(Boolean(response.data.is_available));
      fetchAllDriverData();
    } catch (error) {
      console.log("Toggle status error:", error.response?.data || error);
      setIsOnline(!nextAvailability);
      if (isAuthError(error)) {
        sendToLogin("Your login expired. Please log in again before going online.");
        return;
      }
      setDriverNotice(
        error.response?.data?.error ||
          error.response?.data?.detail ||
          "Could not change driver status. Please check approval and login."
      );
    }
  };

  const cancelActiveRide = async (reason) => {
    if (!activeRide || activeRide.status === "in_progress") return;

    try {
      setCancellationSaving(true);
      setCancellationError("");
      const response = await axios.post(
        `${API_URL}/rides/cancel/${activeRide.id}/`,
        { reason },
        authHeaders
      );
      setShowCancellation(false);
      setIsOnline(true);
      setDriverNotice(
        `Ride cancelled. ${response.data.cancellation_fee || 0} MRU cancellation fee recorded. You are back online.`
      );
      await fetchAllDriverData();
    } catch (error) {
      setCancellationError(
        error.response?.data?.detail ||
          error.response?.data?.error ||
          "Could not cancel this ride."
      );
    } finally {
      setCancellationSaving(false);
    }
  };

  const shareDriverTrip = async () => {
    if (!activeRide) {
      setDriverNotice("No active ride to share yet.");
      return;
    }

    const tripText = `Yala driver trip #${activeRide.id}: ${
      activeRide.pickup || activeRide.pickup_address || "Pickup"
    } to ${activeRide.destination || activeRide.destination_address || "Destination"}. Status: ${
      activeRide.status
    }. Rider: ${activeRiderName || "rider"}.`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: "Yala driver trip",
          text: tripText,
          url: window.location.href,
        });
        return;
      }

      await navigator.clipboard.writeText(`${tripText} ${window.location.href}`);
      setDriverNotice("Trip status copied for sharing.");
    } catch (error) {
      console.log("Driver trip share error:", error);
      setDriverNotice(tripText);
    }
  };

  const toggleMenuSection = (section) => {
    setOpenMenuSections((current) => ({
      ...current,
      [section]: !current[section],
    }));
  };

  const showMenuFeedback = (message) => {
    setMenuMessage(message);
  };

  const updateVehicleForm = (field, value) => {
    setVehicleForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const saveVehicleProfile = async (event) => {
    event.preventDefault();

    try {
      setVehicleSaving(true);
      setMenuMessage("");
      const hasDocumentFiles = Object.values(documentFiles).some(Boolean);
      const payload = hasDocumentFiles ? new FormData() : vehicleForm;
      const requestConfig = hasDocumentFiles
        ? {
            headers: {
              ...authHeaders.headers,
              "Content-Type": "multipart/form-data",
            },
          }
        : authHeaders;

      if (hasDocumentFiles) {
        Object.entries(vehicleForm).forEach(([key, value]) => {
          payload.append(key, value || "");
        });

        Object.entries(documentFiles).forEach(([key, file]) => {
          if (file) {
            payload.append(key, file);
          }
        });
      }

      const response = await axios.post(
        `${API_URL}/drivers/profile/update/`,
        payload,
        requestConfig
      );

      setDriverProfile(response.data.driver);
      setDocumentFiles({
        driver_photo: null,
        license_file: null,
        vehicle_registration: null,
        insurance_document: null,
        vignette_document: null,
      });
      setIsEditingVehicle(false);
      setMenuMessage("Car information and documents updated successfully.");
      fetchAllDriverData();
    } catch (error) {
      console.log("Vehicle profile update error:", error.response?.data || error);
      setMenuMessage(
        error.response?.data?.error ||
          error.response?.data?.detail ||
          "Could not update car information."
      );
    } finally {
      setVehicleSaving(false);
    }
  };

  const updateDocumentFile = (field, file) => {
    setDocumentFiles((current) => ({
      ...current,
      [field]: file,
    }));
  };

  const saveIdentityProfile = async (event) => {
    event.preventDefault();

    try {
      setIdentitySaving(true);
      setMenuMessage("");

      const payload = new FormData();
      payload.append("national_id_number", identityForm.national_id_number || "");

      if (identityForm.national_id_document) {
        payload.append("national_id_document", identityForm.national_id_document);
      }

      const response = await axios.post(
        `${API_URL}/auth/identity/update/`,
        payload,
        {
          headers: {
            ...authHeaders.headers,
            "Content-Type": "multipart/form-data",
          },
        }
      );

      setDriverProfile((current) => ({
        ...current,
        national_id_number: response.data.user.national_id_number,
        national_id_document: response.data.user.national_id_document,
        has_national_id_document: response.data.user.has_national_id_document,
      }));
      setIdentityForm((current) => ({
        ...current,
        national_id_document: null,
      }));
      setMenuMessage("National ID information updated successfully.");
    } catch (error) {
      console.log("National ID update error:", error.response?.data || error);
      setMenuMessage(
        error.response?.data?.error ||
          error.response?.data?.detail ||
          "Could not update National ID information."
      );
    } finally {
      setIdentitySaving(false);
    }
  };

  const updatePayoutForm = (field, value) => {
    setPayoutForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const savePayoutMethod = async (event) => {
    event.preventDefault();

    try {
      setPayoutSaving(true);
      setMenuMessage("");

      await axios.post(`${API_URL}/payments/payout-methods/save/`, payoutForm, authHeaders);
      setMenuMessage("Payout method saved successfully.");
      fetchPayoutData();
    } catch (error) {
      console.log("Payout method error:", error.response?.data || error);
      setMenuMessage(error.response?.data?.error || "Could not save payout method.");
    } finally {
      setPayoutSaving(false);
    }
  };

  const requestWithdrawal = async (event) => {
    event.preventDefault();

    try {
      setWithdrawalSaving(true);
      setMenuMessage("");

      if (!defaultPayoutMethod) {
        setMenuMessage("Add Bank Account, Bankily, Masravi, or Seddad before requesting withdrawal.");
        return;
      }

      if (Number(withdrawalForm.amount || 0) > Number(withdrawableBalance || 0)) {
        setMenuMessage(`You can withdraw up to ${formatMoney(withdrawableBalance)} right now.`);
        return;
      }

      await axios.post(`${API_URL}/payments/withdrawals/request/`, withdrawalForm, authHeaders);
      setWithdrawalForm({ amount: "", note: "" });
      setMenuMessage("Withdrawal request submitted for admin approval.");
      fetchPayoutData();
    } catch (error) {
      console.log("Withdrawal request error:", error.response?.data || error);
      setMenuMessage(
        error.response?.data?.error ||
          error.response?.data?.detail ||
          "Could not submit withdrawal request."
      );
    } finally {
      setWithdrawalSaving(false);
    }
  };

  const pendingWithdrawalsTotal = withdrawals
    .filter((item) => item.status === "pending")
    .reduce((total, item) => total + Number(item.amount || 0), 0);
  const approvedWithdrawalsTotal = withdrawals
    .filter((item) => item.status === "approved")
    .reduce((total, item) => total + Number(item.amount || 0), 0);
  const defaultPayoutMethod = payoutMethods.find((item) => item.is_default) || payoutMethods[0];

  const activePickup =
    activeRide?.pickup || activeRide?.pickup_address || "Waiting for next pickup";
  const activeDestination =
    activeRide?.destination || activeRide?.destination_address || "No active drop-off";
  const activeRiderName = activeRide?.rider_name || "";
  const activeRiderPhone = activeRide?.private_call_number || activeRide?.rider_phone || "";
  const driverName =
    driverProfile?.driver_name ||
    `${driverProfile?.first_name || ""} ${driverProfile?.last_name || ""}`.trim() ||
    "Driver";
  const driverInitials = driverName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  const vehicleSummary = [
    driverProfile?.vehicle_make,
    driverProfile?.vehicle_model,
  ]
    .filter(Boolean)
    .join(" ");
  const plateNumber = driverProfile?.vehicle_plate || driverProfile?.plate_number;
  const driverRating =
    driverProfile?.average_rating ||
    driverProfile?.driver_average_rating ||
    5;
  const driverEmail = driverProfile?.driver_email || driverProfile?.email || "No email";
  const driverPhone = driverProfile?.phone_number || "No phone";
  const driverStatus = driverProfile?.status || "pending";
  const isDriverApproved = driverStatus === "approved";
  const verificationBadge = getVerificationBadge(driverStatus);
  const approvalMessage = getDriverApprovalMessage(driverProfile);
  const vehicleColor = driverProfile?.vehicle_color || "";
  const carType = driverProfile?.car_type || "Regular";
  const driverCategory = driverProfile?.driver_category || "gold";
  const driverCategoryLabel =
    driverProfile?.driver_category_label ||
    driverCategory.charAt(0).toUpperCase() + driverCategory.slice(1);
  const driverCategoryStyle =
    driverCategoryStyles[driverCategory] || driverCategoryStyles.gold;
  const driverMemberSinceYear = driverProfile?.member_since_year || "N/A";
  const driverYearsUsingApp = Number(driverProfile?.years_using_app || 0);
  const formatDocumentStatus = (status) => {
    if (status === "valid") return "Valid";
    if (status === "expiring_soon") return "Expiring soon";
    if (status === "expired") return "Expired";
    return "Missing expiration";
  };

  return (
    <div style={pageStyle}>
      <div style={mapStageStyle}>
        <div style={driverTopControlsStyle}>
          <div style={topLeftStackStyle}>
            <button
              onClick={() => setShowDriverMenu(true)}
              style={floatingIconButtonStyle}
              aria-label="Menu"
            >
              <span style={hamburgerGroupStyle}>
                <span style={hamburgerLineStyle} />
                <span style={hamburgerLineStyle} />
                <span style={hamburgerLineStyle} />
              </span>
            </button>

            <div style={cornerAvatarStyle} data-testid="driver-dashboard-avatar">
              {driverProfile?.driver_photo ? (
                <img
                  src={driverProfile.driver_photo}
                  alt={driverName}
                  style={avatarImageStyle}
                />
              ) : (
                <span style={avatarFallbackStyle}>{driverInitials || "DR"}</span>
              )}
            </div>

            <span
              style={{
                ...driverVerificationBadgeStyle,
                background: verificationBadge.background,
                color: verificationBadge.color,
                borderColor: verificationBadge.border,
              }}
            >
              {verificationBadge.label}
            </span>
          </div>

          <div style={earningsPillStyle}>
            <img src={logoSrc} alt={`${MARKET.brandName} logo`} style={earningsLogoStyle} />
            <span style={earningsTextStackStyle}>
              <strong style={earningsAmountStyle}>{formatMoney(todayEarnings)}</strong>
              <small style={earningsLabelStyle}>Today</small>
            </span>
          </div>

          <div style={rightControlStackStyle}>
            <button
              onClick={() => setShowSafety((current) => !current)}
              style={{ ...floatingIconButtonStyle, ...driverSosButtonStyle }}
              aria-label="Safety"
            >
              SOS
            </button>
            <button
              onClick={() => {
                setShowTripDetails(true);
                setDriverNotice(
                  availableRides.length
                    ? "Trip requests are open below."
                    : "No new ride requests yet. Keep the app online."
                );
              }}
              style={floatingIconButtonStyle}
              aria-label="Alerts"
            >
              {availableRides.length || "0"}
            </button>
          </div>
        </div>

        {showSafety && (
          <div style={driverSafetyPanelStyle}>
            <SafetyEmergencyPanel
              role="driver"
              currentRide={activeRide}
              onShareTrip={shareDriverTrip}
              onClose={() => setShowSafety(false)}
            />
          </div>
        )}

        <div style={driverMapFullStyle}>
          <DriverMap
            driverLocation={driverLocation}
            activeRide={activeRide}
            availableRides={availableRides}
            onRouteUpdate={setActiveRouteSummary}
          />
        </div>

        <button
          onClick={() => setDriverNotice("Map is centered on your current driver location.")}
          style={locateButtonStyle}
          aria-label="Current location"
        >
          ◎
        </button>
      </div>

      <section style={bottomSheetStyle}>
        <div style={sheetHandleStyle} />

        <div style={sheetHeaderStyle}>
          <div>
            <h1 style={waitTitleStyle}>
              {isOnline ? `${waitMinutes} min wait in your area` : "Ready to drive?"}
            </h1>
            <p style={waitSubtitleStyle}>
              {isOnline
                ? "Expected for the next 10 min"
                : "Go online to start receiving nearby ride requests"}
            </p>
            {driverNotice && <p style={noticeStyle}>{driverNotice}</p>}
          </div>
          <span
            style={{
              ...sheetStatusPillStyle,
              background: isOnline ? "#ecfdf3" : "#f2f4f7",
              color: isOnline ? "#166534" : "#475467",
            }}
          >
            {isOnline ? "Online" : "Offline"}
          </span>
        </div>

        <div
          style={{
            ...driverApprovalCardStyle,
            borderColor: verificationBadge.border,
            background: isDriverApproved ? "#f0fdf4" : driverStatus === "rejected" ? "#fff1f2" : "#fff7ed",
          }}
        >
          <span
            style={{
              ...driverApprovalIconStyle,
              background: verificationBadge.background,
              color: verificationBadge.color,
            }}
          >
            {isDriverApproved ? "✓" : "!"}
          </span>
          <div>
            <strong style={driverApprovalTitleStyle}>
              {isDriverApproved
                ? "Driver verification approved"
                : driverStatus === "rejected"
                  ? "Driver verification rejected"
                  : "Driver verification pending"}
            </strong>
            <p style={driverApprovalTextStyle}>{approvalMessage}</p>
          </div>
        </div>

        <div style={sheetDividerStyle} />

        <div style={driverPerksGridStyle}>
          <div style={driverPerkCardStyle}>
            <span style={perkIconStyle}>M</span>
            <div style={perkTextStyle}>
              <strong style={perkValueStyle}>{formatMoney(todayEarnings)}</strong>
              <span style={perkMetaStyle}>Today's earnings</span>
            </div>
          </div>

          <div style={driverPerkCardStyle}>
            <span style={perkIconStyle}>◇</span>
            <div style={perkTextStyle}>
              <strong style={perkValueStyle}>{todayCompletedRides} trips today</strong>
              <span style={perkMetaStyle}>{completedRides} total completed</span>
            </div>
          </div>

          <div style={driverPerkCardStyle}>
            <span style={perkIconStyle}>◷</span>
            <div style={perkTextStyle}>
              <strong style={perkValueStyle}>{driverYearsUsingApp} years using app</strong>
              <span style={perkMetaStyle}>Member since {driverMemberSinceYear}</span>
            </div>
          </div>
        </div>

        <DriverEarningsDashboard
          todayEarnings={todayEarnings}
          totalEarnings={earnings}
          withdrawableBalance={withdrawableBalance}
          charts={earningsCharts}
        />

        {/* Full analytics dashboard */}
        <AnalyticsDashboard mode="driver" token={localStorage.getItem("access")} />

        <div style={primaryActionRowStyle}>
          <button
            onClick={toggleAvailability}
            disabled={!isOnline && !isDriverApproved}
            style={{
              ...driverGoOnlineButtonStyle,
              background: isOnline ? "#111827" : isDriverApproved ? DRIVER_GREEN : "#98a2b3",
              cursor: !isOnline && !isDriverApproved ? "not-allowed" : "pointer",
              boxShadow:
                !isOnline && !isDriverApproved
                  ? "none"
                  : `0 14px 28px ${DRIVER_GREEN_SHADOW}`,
            }}
          >
            {isOnline ? "Go Offline" : isDriverApproved ? "Go Online" : "Approval required"}
          </button>
          <button
            onClick={() => setShowTripDetails((current) => !current)}
            style={filterButtonStyle}
            aria-label="Driver settings"
          >
            ≡
          </button>
        </div>

        <div style={activeRouteCardStyle}>
          <div>
            <span style={smallLabelStyle}>Current task</span>
            <strong style={activeRouteTitleStyle}>
              {activeRide
                ? activeRide.status === "in_progress"
                  ? "Drive to drop-off"
                  : "Drive to pickup"
                : isOnline
                  ? "Waiting for a rider request"
                  : "Go online to start"}
            </strong>
          </div>
          {activeRide && (
            <div style={activeRiderSummaryStyle}>
              {activeRide.rider_picture ? (
                <img
                  src={activeRide.rider_picture}
                  alt={activeRiderName || "Rider"}
                  style={activeRiderPhotoStyle}
                />
              ) : (
                <span style={activeRiderFallbackStyle}>
                  {(activeRiderName || "R").slice(0, 1).toUpperCase()}
                </span>
              )}
              <div>
                <span style={routeLabelStyle}>Rider</span>
                <p style={routeTextStyle}>
                  {activeRiderName || "Rider"}
                  {activeRiderPhone ? ` · Private call: ${activeRiderPhone}` : ""}
                </p>
              </div>
              {activeRiderPhone && (
                <a href={`tel:${activeRiderPhone}`} style={activeRiderCallStyle}>
                  Private call
                </a>
              )}
              <button type="button" onClick={() => setShowChat(true)} style={{ ...activeRiderCallStyle, background: DRIVER_GREEN, textDecoration: "none", border: 0, cursor: "pointer" }}>
                Chat
              </button>
            </div>
          )}
          <div style={routeLineStyle}>
            <div style={routePointStyle} />
            <div>
              <span style={routeLabelStyle}>Pickup</span>
              <p style={routeTextStyle}>{activePickup}</p>
            </div>
          </div>
          <div style={routeLineStyle}>
            <div style={{ ...routePointStyle, background: DRIVER_GREEN_BRIGHT }} />
            <div>
              <span style={routeLabelStyle}>Drop-off</span>
              <p style={routeTextStyle}>{activeDestination}</p>
            </div>
          </div>
          {activeRide && (
            <div style={activeRideActionStyle}>
              <RideStatusButtons
                ride={activeRide}
                onStatusChange={fetchAllDriverData}
                distanceToNextKm={activeRouteSummary?.distanceKm}
              />
              {activeRide.status !== "in_progress" && (
                <button
                  type="button"
                  onClick={() => {
                    setCancellationError("");
                    setShowCancellation(true);
                  }}
                  style={driverCancelRideButtonStyle}
                >
                  Cancel Ride
                </button>
              )}
            </div>
          )}
        </div>

        <details
          open={showTripDetails}
          onToggle={(event) => setShowTripDetails(event.currentTarget.open)}
          style={tripDetailsStyle}
        >
          <summary style={tripSummaryStyle}>Trip requests and history</summary>
          <RideDashboard
            rides={driverRides}
            availableRides={availableRides}
            isOnline={isOnline}
            fetchRides={fetchAllDriverData}
          />
        </details>
      </section>

      {/* Chat overlay */}
      {showChat && activeRide?.id && (
        <RideChat rideId={activeRide.id} onClose={() => setShowChat(false)} />
      )}

      {showCancellation && activeRide && (
        <RideCancellationModal
          role="driver"
          ride={activeRide}
          saving={cancellationSaving}
          error={cancellationError}
          onCancel={cancelActiveRide}
          onClose={() => setShowCancellation(false)}
        />
      )}

      {showDriverMenu && (
        <div style={menuOverlayStyle}>
          <button
            onClick={() => setShowDriverMenu(false)}
            style={menuCloseButtonStyle}
            aria-label="Close menu"
          >
            ×
          </button>

          {/* Yala Logo */}
          <div style={{ textAlign: "center", padding: "20px 0 10px" }}>
            <img src={logoSrc} alt="Yala" style={{ width: 72, height: 72, borderRadius: "50%", boxShadow: `0 6px 20px ${DRIVER_GREEN_SHADOW}` }} />
            <div style={{ color: DRIVER_GREEN, fontWeight: 900, fontSize: 18, marginTop: 8 }}>Yala Driver</div>
            <div style={{ color: "#9ca3af", fontSize: 12, fontWeight: 700 }}>Fast. Safe. Local.</div>
          </div>

          <section style={menuProfileStyle}>
            <div style={menuAvatarWrapStyle}>
              {driverProfile?.driver_photo ? (
                <img
                  src={driverProfile.driver_photo}
                  alt={driverName}
                  style={avatarImageStyle}
                />
              ) : (
                <span style={menuAvatarFallbackStyle}>{driverInitials || "DR"}</span>
              )}
              <span style={{ ...eliteBadgeStyle, ...driverCategoryStyle }}>
                {driverCategoryLabel} ›
              </span>
            </div>

            <div style={menuProfileTextStyle}>
              <div style={menuNameRowStyle}>
                <h1>{driverName}</h1>
                <span
                  style={{
                    ...menuVerificationBadgeStyle,
                    background: verificationBadge.background,
                    color: verificationBadge.color,
                    borderColor: verificationBadge.border,
                  }}
                >
                  {verificationBadge.label}
                </span>
              </div>
              <p>
                {[vehicleColor, vehicleSummary].filter(Boolean).join(" ") || "Vehicle not added"}
                {plateNumber ? ` · ${plateNumber}` : ""}
              </p>
              <p style={menuContactStyle}>{driverPhone} · {driverEmail}</p>
              <button
                onClick={() => (window.location.href = "/rider-dashboard")}
                style={viewAsRiderStyle}
              >
                View as rider
              </button>
            </div>
          </section>

          <section style={menuStatsCardStyle}>
            <div>
              <strong>{completedRides}</strong>
              <span>Rides</span>
            </div>
            <div style={menuDividerStyle} />
            <div>
              <strong>{Number(driverRating || 0).toFixed(1)}</strong>
              <span>Rating ›</span>
            </div>
            <div style={menuDividerStyle} />
            <div>
              <strong>{driverYearsUsingApp}</strong>
              <span>Years using app</span>
            </div>
          </section>

          {menuMessage && <p style={menuMessageStyle}>{menuMessage}</p>}

          <section style={menuSectionStyle}>
            <MenuSectionTitle
              title="More Ways to Earn"
              open={openMenuSections.earn}
              onClick={() => toggleMenuSection("earn")}
            />
            {openMenuSections.earn && (
              <>
                <MenuRow
                  icon="D"
                  label="Yala Delivery"
                  badge="Packages"
                  onClick={() => (window.location.href = "/driver/deliveries")}
                />
                <MenuRow
                  icon="▣"
                  label="Scheduled Rides"
                  badge="Early access"
                  onClick={() => showMenuFeedback("Scheduled rides will appear here when riders book ahead.")}
                />
                <MenuRow
                  icon="+"
                  label="Refer a friend"
                  onClick={() => showMenuFeedback("Referral sharing is ready for the next account setup step.")}
                />
              </>
            )}
          </section>

          <section>
            <MenuSectionTitle
              title="Vehicle and Devices"
              open={openMenuSections.vehicle}
              onClick={() => toggleMenuSection("vehicle")}
            />
            {openMenuSections.vehicle && (
              <>
                <MenuInfoRow label="Vehicle" value={[vehicleColor, vehicleSummary].filter(Boolean).join(" ") || "Not added"} />
                <MenuInfoRow label="Member since" value={driverMemberSinceYear} />
                <MenuInfoRow label="Plate" value={plateNumber || "Not added"} />
                <MenuInfoRow label="Ride class" value={carType} />
                <MenuInfoRow label="Driver photo" value={driverProfile?.driver_photo ? "Uploaded" : "Missing"} />
                <MenuInfoRow
                  label="License"
                  value={
                    driverProfile?.license_file
                      ? `${formatDocumentStatus(driverProfile?.license_status)}${
                          driverProfile?.license_expires_at ? ` · ${driverProfile.license_expires_at}` : ""
                        }`
                      : "Missing"
                  }
                />
                <MenuInfoRow
                  label="Registration"
                  value={
                    driverProfile?.vehicle_registration
                      ? `${formatDocumentStatus(driverProfile?.vehicle_registration_status)}${
                          driverProfile?.vehicle_registration_expires_at
                            ? ` · ${driverProfile.vehicle_registration_expires_at}`
                            : ""
                        }`
                      : "Missing"
                  }
                />
                <MenuInfoRow
                  label="Insurance"
                  value={
                    driverProfile?.insurance_document
                      ? `${formatDocumentStatus(driverProfile?.insurance_status)}${
                          driverProfile?.insurance_expires_at ? ` · ${driverProfile.insurance_expires_at}` : ""
                        }`
                      : "Missing"
                  }
                />
                <button
                  type="button"
                  onClick={() => setIsEditingVehicle((current) => !current)}
                  style={editVehicleButtonStyle}
                >
                  {isEditingVehicle ? "Close car editor" : "Update car information"}
                </button>
                {isEditingVehicle && (
                  <form onSubmit={saveVehicleProfile} style={vehicleFormStyle}>
                    <label style={vehicleFieldStyle}>
                      <span>Phone number</span>
                      <input
                        value={vehicleForm.phone_number}
                        onChange={(event) => updateVehicleForm("phone_number", event.target.value)}
                        style={vehicleInputStyle}
                        placeholder="44556666"
                      />
                    </label>
                    <label style={vehicleFieldStyle}>
                      <span>Vehicle make</span>
                      <input
                        value={vehicleForm.vehicle_make}
                        onChange={(event) => updateVehicleForm("vehicle_make", event.target.value)}
                        style={vehicleInputStyle}
                        placeholder="Toyota"
                      />
                    </label>
                    <label style={vehicleFieldStyle}>
                      <span>Vehicle model</span>
                      <input
                        value={vehicleForm.vehicle_model}
                        onChange={(event) => updateVehicleForm("vehicle_model", event.target.value)}
                        style={vehicleInputStyle}
                        placeholder="Camry"
                      />
                    </label>
                    <label style={vehicleFieldStyle}>
                      <span>Vehicle color</span>
                      <input
                        value={vehicleForm.vehicle_color}
                        onChange={(event) => updateVehicleForm("vehicle_color", event.target.value)}
                        style={vehicleInputStyle}
                        placeholder="Black"
                      />
                    </label>
                    <label style={vehicleFieldStyle}>
                      <span>Plate number</span>
                      <input
                        value={vehicleForm.vehicle_plate}
                        onChange={(event) => updateVehicleForm("vehicle_plate", event.target.value)}
                        style={vehicleInputStyle}
                        placeholder="1234 AB 01"
                        required
                      />
                    </label>
                    <label style={vehicleFieldStyle}>
                      <span>Ride class</span>
                      <select
                        value={vehicleForm.car_type}
                        onChange={(event) => updateVehicleForm("car_type", event.target.value)}
                        style={vehicleInputStyle}
                      >
                        <option value="regular">Regular</option>
                        <option value="comfort">Comfort</option>
                        <option value="xl">XL</option>
                        <option value="share">Share</option>
                      </select>
                    </label>
                    <div style={documentUploadGridStyle}>
                      <DocumentUploadField
                        label="Driver photo"
                        field="driver_photo"
                        file={documentFiles.driver_photo}
                        currentUrl={driverProfile?.driver_photo}
                        onChange={updateDocumentFile}
                      />
                      <DocumentUploadField
                        label="Driver license"
                        field="license_file"
                        file={documentFiles.license_file}
                        currentUrl={driverProfile?.license_file}
                        onChange={updateDocumentFile}
                      />
                      <label style={vehicleFieldStyle}>
                        <span>License issue date</span>
                        <input
                          type="date"
                          value={vehicleForm.license_issued_at}
                          onChange={(event) => updateVehicleForm("license_issued_at", event.target.value)}
                          style={vehicleInputStyle}
                          required
                        />
                      </label>
                      <label style={vehicleFieldStyle}>
                        <span>License expiration</span>
                        <input
                          type="date"
                          value={vehicleForm.license_expires_at}
                          onChange={(event) => updateVehicleForm("license_expires_at", event.target.value)}
                          style={vehicleInputStyle}
                          required
                        />
                      </label>
                      <DocumentUploadField
                        label="Carte Grise"
                        field="vehicle_registration"
                        file={documentFiles.vehicle_registration}
                        currentUrl={driverProfile?.vehicle_registration}
                        onChange={updateDocumentFile}
                      />
                      <label style={vehicleFieldStyle}>
                        <span>Carte Grise expiration</span>
                        <input
                          type="date"
                          value={vehicleForm.vehicle_registration_expires_at}
                          onChange={(event) =>
                            updateVehicleForm("vehicle_registration_expires_at", event.target.value)
                          }
                          style={vehicleInputStyle}
                          required
                        />
                      </label>
                      <DocumentUploadField
                        label="Insurance document"
                        field="insurance_document"
                        file={documentFiles.insurance_document}
                        currentUrl={driverProfile?.insurance_document}
                        onChange={updateDocumentFile}
                      />
                      <label style={vehicleFieldStyle}>
                        <span>Insurance expiration</span>
                        <input
                          type="date"
                          value={vehicleForm.insurance_expires_at}
                          onChange={(event) => updateVehicleForm("insurance_expires_at", event.target.value)}
                          style={vehicleInputStyle}
                          required
                        />
                      </label>
                      <DocumentUploadField
                        label="Vignette"
                        field="vignette_document"
                        file={documentFiles.vignette_document}
                        currentUrl={driverProfile?.vignette_document}
                        onChange={updateDocumentFile}
                      />
                      <label style={vehicleFieldStyle}>
                        <span>Vignette expiration</span>
                        <input
                          type="date"
                          value={vehicleForm.vignette_expires_at}
                          onChange={(event) => updateVehicleForm("vignette_expires_at", event.target.value)}
                          style={vehicleInputStyle}
                          required
                        />
                      </label>
                    </div>
                    <button
                      type="submit"
                      disabled={vehicleSaving}
                      style={{
                        ...saveVehicleButtonStyle,
                        opacity: vehicleSaving ? 0.7 : 1,
                      }}
                    >
                      {vehicleSaving ? "Saving..." : "Save car information"}
                    </button>
                  </form>
                )}
              </>
            )}
          </section>

          <section>
            <MenuSectionTitle
              title="Feedback and Rewards"
              open={openMenuSections.feedback}
              onClick={() => toggleMenuSection("feedback")}
            />
            {openMenuSections.feedback && (
              <>
                <MenuInfoRow label="Driver rating" value={`${Number(driverRating || 0).toFixed(1)} / 5`} />
                <MenuInfoRow label="Today earnings" value={formatMoney(todayEarnings)} />
                <MenuInfoRow label="Trips today" value={todayCompletedRides} />
                <MenuInfoRow label="Completed rides" value={completedRides} />
                <MenuInfoRow label="Total earnings" value={formatMoney(earnings)} />
                <MenuInfoRow label="Available to withdraw" value={formatMoney(withdrawableBalance)} />
                <MenuInfoRow label="Pending withdrawals" value={formatMoney(pendingWithdrawalsTotal)} />
                <MenuInfoRow label="Paid withdrawals" value={formatMoney(approvedWithdrawalsTotal)} />
                <MenuInfoRow
                  label="Payout method"
                  value={defaultPayoutMethod?.display_name || "Not added"}
                />
                <form onSubmit={savePayoutMethod} style={vehicleFormStyle}>
                  <label style={vehicleFieldStyle}>
                    <span>Payout type</span>
                    <select
                      value={payoutForm.payout_type}
                      onChange={(event) => updatePayoutForm("payout_type", event.target.value)}
                      style={vehicleInputStyle}
                    >
                      <option value="bank_account">Bank Account</option>
                      <option value="card">Card</option>
                      <option value="bankily">Bankily</option>
                      <option value="masrvi">Masravi</option>
                      <option value="seddad">Seddad</option>
                    </select>
                  </label>
                  <label style={vehicleFieldStyle}>
                    <span>Account holder name</span>
                    <input
                      value={payoutForm.account_holder_name}
                      onChange={(event) => updatePayoutForm("account_holder_name", event.target.value)}
                      style={vehicleInputStyle}
                      placeholder="Driver full name"
                    />
                  </label>
                  {payoutForm.payout_type === "bank_account" && (
                    <>
                      <label style={vehicleFieldStyle}>
                        <span>Bank name</span>
                        <input
                          value={payoutForm.bank_name}
                          onChange={(event) => updatePayoutForm("bank_name", event.target.value)}
                          style={vehicleInputStyle}
                          placeholder="Bank name"
                        />
                      </label>
                      <label style={vehicleFieldStyle}>
                        <span>Account number / RIB</span>
                        <input
                          value={payoutForm.account_reference}
                          onChange={(event) => updatePayoutForm("account_reference", event.target.value)}
                          style={vehicleInputStyle}
                          placeholder="Account reference"
                        />
                      </label>
                    </>
                  )}
                  {payoutForm.payout_type === "card" && (
                    <>
                      <label style={vehicleFieldStyle}>
                        <span>Card type</span>
                        <select
                          value={payoutForm.card_type}
                          onChange={(event) => updatePayoutForm("card_type", event.target.value)}
                          style={vehicleInputStyle}
                        >
                          <option value="visa">Visa</option>
                          <option value="mastercard">Mastercard</option>
                        </select>
                      </label>
                      <label style={vehicleFieldStyle}>
                        <span>Card last 4 digits</span>
                        <input
                          value={payoutForm.card_last4}
                          onChange={(event) => updatePayoutForm("card_last4", event.target.value.slice(0, 4))}
                          style={vehicleInputStyle}
                          placeholder="1234"
                        />
                      </label>
                    </>
                  )}
                  {["bankily", "masrvi", "seddad"].includes(payoutForm.payout_type) && (
                    <>
                      <label style={vehicleFieldStyle}>
                        <span>
                          {payoutForm.payout_type === "masrvi"
                            ? "Masravi phone number"
                            : `${payoutForm.payout_type.toUpperCase()} phone number`}
                        </span>
                        <input
                          value={payoutForm.phone_number}
                          onChange={(event) => updatePayoutForm("phone_number", event.target.value)}
                          style={vehicleInputStyle}
                          placeholder="Mobile money phone"
                        />
                      </label>
                      <label style={vehicleFieldStyle}>
                        <span>Wallet ID</span>
                        <input
                          value={payoutForm.wallet_id}
                          onChange={(event) => updatePayoutForm("wallet_id", event.target.value)}
                          style={vehicleInputStyle}
                          placeholder="Optional wallet ID"
                        />
                      </label>
                    </>
                  )}
                  <button
                    type="submit"
                    disabled={payoutSaving}
                    style={{ ...saveVehicleButtonStyle, opacity: payoutSaving ? 0.7 : 1 }}
                  >
                    {payoutSaving ? "Saving..." : "Save payout method"}
                  </button>
                </form>
                <form onSubmit={requestWithdrawal} style={vehicleFormStyle}>
                  <MenuInfoRow label="Withdrawable now" value={formatMoney(withdrawableBalance)} />
                  <label style={vehicleFieldStyle}>
                    <span>Withdrawal amount</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      max={withdrawableBalance || 0}
                      value={withdrawalForm.amount}
                      onChange={(event) =>
                        setWithdrawalForm((current) => ({
                          ...current,
                          amount: event.target.value,
                        }))
                      }
                      style={vehicleInputStyle}
                      placeholder="Amount in MRU"
                    />
                  </label>
                  <label style={vehicleFieldStyle}>
                    <span>Note</span>
                    <input
                      value={withdrawalForm.note}
                      onChange={(event) =>
                        setWithdrawalForm((current) => ({
                          ...current,
                          note: event.target.value,
                        }))
                      }
                      style={vehicleInputStyle}
                      placeholder="Optional note"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={withdrawalSaving || !defaultPayoutMethod || Number(withdrawableBalance || 0) <= 0}
                    style={{
                      ...saveVehicleButtonStyle,
                      opacity:
                        withdrawalSaving || !defaultPayoutMethod || Number(withdrawableBalance || 0) <= 0
                          ? 0.7
                          : 1,
                    }}
                  >
                    {withdrawalSaving ? "Submitting..." : "Request withdrawal"}
                  </button>
                </form>
                {withdrawals.length > 0 && (
                  <div style={withdrawalListStyle}>
                    {withdrawals.slice(0, 3).map((item) => (
                      <div key={item.id} style={withdrawalItemStyle}>
                        <strong>{formatMoney(item.amount)}</strong>
                        <span>{item.status}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>

          <section>
            <MenuSectionTitle
              title="Account"
              open={openMenuSections.account}
              onClick={() => toggleMenuSection("account")}
            />
            {openMenuSections.account && (
              <>
                <MenuInfoRow label="Account status" value={driverStatus} />
                {driverProfile?.document_rejection_reason && (
                  <p style={noticeStyle}>{driverProfile.document_rejection_reason}</p>
                )}
                <MenuInfoRow label="Driver level" value={driverCategoryLabel} />
                <MenuInfoRow label="National ID number" value={driverProfile?.national_id_number || "Missing"} />
                <MenuInfoRow label="National ID document" value={driverProfile?.has_national_id_document ? "Uploaded" : "Missing"} />
                <MenuInfoRow label="Online status" value={isOnline ? "Online" : "Offline"} />
                <MenuInfoRow label="Sound alerts" value={soundEnabled ? "Enabled" : "Enable by going online"} />
                <form onSubmit={saveIdentityProfile} style={vehicleFormStyle}>
                  <label style={vehicleFieldStyle}>
                    <span>National Identification Number</span>
                    <input
                      value={identityForm.national_id_number}
                      onChange={(event) =>
                        setIdentityForm((current) => ({
                          ...current,
                          national_id_number: event.target.value,
                        }))
                      }
                      style={vehicleInputStyle}
                      placeholder="National ID number"
                    />
                  </label>
                  <DocumentUploadField
                    label="National ID document"
                    field="national_id_document"
                    file={identityForm.national_id_document}
                    currentUrl={driverProfile?.national_id_document}
                    onChange={(field, file) =>
                      setIdentityForm((current) => ({
                        ...current,
                        [field]: file,
                      }))
                    }
                  />
                  <button
                    type="submit"
                    disabled={identitySaving}
                    style={{
                      ...saveVehicleButtonStyle,
                      opacity: identitySaving ? 0.7 : 1,
                    }}
                  >
                    {identitySaving ? "Saving..." : "Save National ID"}
                  </button>
                </form>
              </>
            )}
          </section>

          <section>
            <MenuSectionTitle
              title="Support and Resources"
              open={openMenuSections.support}
              onClick={() => toggleMenuSection("support")}
            />
            {openMenuSections.support &&
              MARKET.emergencyNumbers.map((item) => (
                <a key={item.number} href={`tel:${item.number}`} style={menuEmergencyRowStyle}>
                  <span>{item.label}</span>
                  <strong>{item.number}</strong>
                </a>
              ))}
          </section>

          <button
            onClick={() => {
              localStorage.removeItem("access");
              localStorage.removeItem("refresh");
              localStorage.removeItem("user");
              window.location.href = "/";
            }}
            style={logoutRowStyle}
          >
            <span>⇱</span>
            Log out
          </button>
        </div>
      )}

      {/* Persistent Emergency Support Button - visible on all screens */}
      <EmergencySupportButton />
    </div>
  );
}

function MenuSectionTitle({ title, open = false, onClick }) {
  return (
    <button type="button" onClick={onClick} style={menuSectionTitleStyle}>
      <h2>{title}</h2>
      <span>{open ? "⌃" : "⌄"}</span>
    </button>
  );
}

function MenuRow({ icon, label, badge, onClick }) {
  return (
    <button type="button" onClick={onClick} style={menuRowStyle}>
      <span style={menuRowIconStyle}>{icon}</span>
      <span>{label}</span>
      {badge && <em style={menuBadgeStyle}>{badge}</em>}
    </button>
  );
}

function MenuInfoRow({ label, value }) {
  return (
    <div style={menuInfoRowStyle}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function DocumentUploadField({ label, field, file, currentUrl, onChange }) {
  return (
    <label style={documentUploadStyle}>
      <span>{label}</span>
      <input
        type="file"
        accept="image/*,.pdf"
        onChange={(event) => onChange(field, event.target.files?.[0] || null)}
        style={documentFileInputStyle}
      />
      <small style={documentUploadHintStyle}>
        {file ? file.name : currentUrl ? "Current file uploaded" : "No file uploaded"}
      </small>
      {currentUrl && (
        <a href={currentUrl} target="_blank" rel="noreferrer" style={documentLinkStyle}>
          View current file
        </a>
      )}
    </label>
  );
}

const pageStyle = {
  minHeight: "100vh",
  background: "#f3f4f6",
  color: "#111827",
  fontFamily: "Inter, Arial, sans-serif",
};

const mapStageStyle = {
  position: "relative",
  height: "calc(100vh - 340px)",
  minHeight: "430px",
  background: "#e5e7eb",
  overflow: "hidden",
};

const driverMapFullStyle = {
  position: "absolute",
  inset: 0,
};

const driverTopControlsStyle = {
  position: "absolute",
  zIndex: 1000,
  top: "18px",
  left: "18px",
  right: "18px",
  display: "grid",
  gridTemplateColumns: "76px minmax(120px, auto) 56px",
  alignItems: "start",
  justifyItems: "center",
};

const topLeftStackStyle = {
  display: "grid",
  gap: "12px",
  pointerEvents: "auto",
};

const floatingIconButtonStyle = {
  width: "60px",
  height: "60px",
  border: "none",
  borderRadius: "16px",
  background: "white",
  color: "#111827",
  boxShadow: "0 10px 26px rgba(15, 23, 42, 0.18)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "1.3rem",
  fontWeight: 900,
  cursor: "pointer",
  zIndex: 1001,
};

const hamburgerGroupStyle = {
  display: "grid",
  gap: "4px",
};

const hamburgerLineStyle = {
  display: "block",
  width: "24px",
  height: "3px",
  background: "#111827",
  borderRadius: "999px",
};

const earningsPillStyle = {
  background: "white",
  color: "#160014",
  borderRadius: "999px",
  padding: "8px 18px 8px 10px",
  lineHeight: 1,
  fontWeight: 950,
  boxShadow: "0 12px 26px rgba(15, 23, 42, 0.22)",
  pointerEvents: "auto",
  display: "flex",
  alignItems: "center",
  gap: "10px",
};

const earningsTextStackStyle = {
  display: "grid",
  gap: "3px",
  lineHeight: 1,
};

const earningsAmountStyle = {
  fontSize: "1.55rem",
};

const earningsLabelStyle = {
  color: "#667085",
  fontSize: "0.72rem",
  fontWeight: 900,
  textTransform: "uppercase",
};

const earningsLogoStyle = {
  width: "52px",
  height: "52px",
  borderRadius: "50%",
  objectFit: "cover",
  flex: "0 0 auto",
  boxShadow: `0 4px 12px ${DRIVER_GREEN_SHADOW}`,
};

const rightControlStackStyle = {
  display: "grid",
  gap: "12px",
};

const driverSosButtonStyle = {
  background: "#dc2626",
  color: "white",
  fontSize: "0.78rem",
  boxShadow: "0 14px 30px rgba(220, 38, 38, 0.34)",
};

const driverSafetyPanelStyle = {
  position: "absolute",
  zIndex: 25,
  top: "88px",
  right: "18px",
  width: "min(620px, calc(100vw - 36px))",
};

const cornerAvatarStyle = {
  width: "60px",
  height: "60px",
  borderRadius: "999px",
  overflow: "hidden",
  background: "#111827",
  border: "3px solid white",
  boxShadow: "0 10px 26px rgba(15, 23, 42, 0.18)",
};

const driverVerificationBadgeStyle = {
  border: "1px solid",
  borderRadius: "999px",
  padding: "7px 10px",
  fontSize: "0.72rem",
  fontWeight: 950,
  boxShadow: "0 8px 18px rgba(15, 23, 42, 0.12)",
  whiteSpace: "nowrap",
};

const avatarImageStyle = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
};

const avatarFallbackStyle = {
  width: "100%",
  height: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "white",
  fontSize: "1rem",
  fontWeight: 900,
};

const locateButtonStyle = {
  position: "absolute",
  zIndex: 15,
  right: "20px",
  bottom: "22px",
  width: "56px",
  height: "56px",
  border: "none",
  borderRadius: "16px",
  background: "white",
  fontSize: "2rem",
  fontWeight: 900,
  color: "#111827",
  boxShadow: "0 12px 28px rgba(15, 23, 42, 0.18)",
};

const bottomSheetStyle = {
  position: "relative",
  zIndex: 30,
  marginTop: "-20px",
  background: "#f7f6f3",
  borderRadius: "24px 24px 0 0",
  boxShadow: "0 -14px 38px rgba(15, 23, 42, 0.18)",
  padding: "14px 28px 28px",
};

const sheetHandleStyle = {
  width: "78px",
  height: "6px",
  borderRadius: "999px",
  background: "#888",
  margin: "0 auto 24px",
};

const sheetHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: "16px",
  alignItems: "start",
};

const waitTitleStyle = {
  margin: 0,
  fontSize: "2rem",
  letterSpacing: 0,
  color: "#0b0b13",
};

const waitSubtitleStyle = {
  margin: "12px 0 0",
  color: "#667085",
  fontSize: "1.08rem",
  fontWeight: 700,
};

const noticeStyle = {
  margin: "12px 0 0",
  color: "#b91c1c",
  background: "#fee2e2",
  border: "1px solid #fecaca",
  borderRadius: "10px",
  padding: "10px 12px",
  fontWeight: 900,
};

const driverApprovalCardStyle = {
  marginTop: "18px",
  border: "1px solid",
  borderRadius: "18px",
  padding: "14px",
  display: "grid",
  gridTemplateColumns: "44px minmax(0, 1fr)",
  gap: "12px",
  alignItems: "center",
};

const driverApprovalIconStyle = {
  width: "44px",
  height: "44px",
  borderRadius: "14px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 950,
  fontSize: "1.1rem",
};

const driverApprovalTitleStyle = {
  display: "block",
  color: "#111827",
  fontWeight: 950,
};

const driverApprovalTextStyle = {
  margin: "4px 0 0",
  color: "#475467",
  lineHeight: 1.35,
  fontWeight: 800,
};

const sheetStatusPillStyle = {
  borderRadius: "999px",
  padding: "10px 14px",
  fontWeight: 900,
  whiteSpace: "nowrap",
};

const sheetDividerStyle = {
  height: "1px",
  background: "#d6d3cc",
  margin: "26px 0",
};

const driverPerksGridStyle = {
  display: "grid",
  gap: "16px",
};

const driverPerkCardStyle = {
  minHeight: "86px",
  background: "white",
  border: "1px solid #e7e5df",
  borderRadius: "18px",
  padding: "18px",
  display: "grid",
  gridTemplateColumns: "42px 1fr",
  gap: "14px",
  alignItems: "center",
  overflow: "hidden",
};

const perkIconStyle = {
  width: "42px",
  height: "42px",
  borderRadius: "50%",
  display: "grid",
  placeItems: "center",
  background: "#f3f4f6",
  color: "#6b7280",
  fontSize: "1.1rem",
  fontWeight: 900,
};

const perkTextStyle = {
  display: "grid",
  gap: "5px",
  minWidth: 0,
};

const perkValueStyle = {
  color: "#111827",
  fontSize: "1rem",
  lineHeight: 1.15,
  overflowWrap: "anywhere",
};

const perkMetaStyle = {
  color: "#667085",
  fontSize: "0.88rem",
  fontWeight: 800,
  lineHeight: 1.2,
};

const earningsDashboardStyle = {
  marginTop: "16px",
  background: "#111827",
  borderRadius: "18px",
  padding: "16px",
  color: "white",
  boxShadow: "0 18px 42px rgba(15, 23, 42, 0.12)",
};

const earningsDashboardHeaderStyle = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "12px",
  flexWrap: "wrap",
};

const earningsDashboardTitleStyle = {
  margin: "4px 0 0",
  fontSize: "1.2rem",
  color: "white",
};

const earningsSegmentStyle = {
  display: "flex",
  gap: "4px",
  padding: "4px",
  background: "rgba(255, 255, 255, 0.08)",
  borderRadius: "999px",
};

const earningsSegmentButtonStyle = {
  border: "none",
  borderRadius: "999px",
  padding: "8px 10px",
  fontWeight: 900,
  textTransform: "capitalize",
  cursor: "pointer",
};

const earningsStatsGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: "8px",
  marginTop: "14px",
};

const metricTileStyle = {
  background: "rgba(255, 255, 255, 0.08)",
  border: "1px solid rgba(255, 255, 255, 0.1)",
  borderRadius: "12px",
  padding: "10px",
  display: "grid",
  gap: "5px",
};

const barChartStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(48px, 1fr))",
  gap: "8px",
  alignItems: "end",
  marginTop: "16px",
  minHeight: "190px",
};

const barItemStyle = {
  display: "grid",
  gridTemplateRows: "120px auto auto",
  gap: "7px",
  alignItems: "end",
  textAlign: "center",
  minWidth: 0,
};

const barColumnStyle = {
  height: "120px",
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "center",
  background: "rgba(255, 255, 255, 0.06)",
  borderRadius: "12px",
  padding: "6px",
};

const barStyle = {
  width: "100%",
  borderRadius: "999px 999px 5px 5px",
  background: "linear-gradient(180deg, #22c55e 0%, #14b8a6 100%)",
  minHeight: "8px",
};

const barValueStyle = {
  color: "white",
  fontSize: "0.72rem",
  overflowWrap: "anywhere",
};

const barLabelStyle = {
  color: "#9ca3af",
  fontSize: "0.74rem",
  fontWeight: 900,
};

const primaryActionRowStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 86px",
  gap: "20px",
  marginTop: "24px",
};

const driverGoOnlineButtonStyle = {
  minHeight: "72px",
  border: "none",
  borderRadius: "999px",
  color: "white",
  fontSize: "1.5rem",
  fontWeight: 950,
  cursor: "pointer",
  boxShadow: `0 14px 28px ${DRIVER_GREEN_SHADOW}`,
};

const filterButtonStyle = {
  minHeight: "72px",
  border: "none",
  borderRadius: "999px",
  background: "#edecea",
  color: "#111827",
  fontSize: "2rem",
  fontWeight: 900,
  cursor: "pointer",
};

const activeRouteCardStyle = {
  marginTop: "18px",
  background: "white",
  border: "1px solid #e7e5df",
  borderRadius: "18px",
  padding: "16px",
};

const smallLabelStyle = {
  margin: "0 0 4px",
  color: "#667085",
  fontSize: "0.78rem",
  fontWeight: 900,
  textTransform: "uppercase",
};

const activeRouteTitleStyle = {
  display: "block",
  marginTop: "4px",
  color: "#111827",
  fontSize: "1.05rem",
};

const activeRiderSummaryStyle = {
  display: "grid",
  gridTemplateColumns: "46px minmax(0, 1fr) auto",
  gap: "10px",
  alignItems: "center",
  marginTop: "14px",
  padding: "10px",
  borderRadius: "14px",
  background: "#f8fafc",
  border: "1px solid #e5e7eb",
};

const activeRiderPhotoStyle = {
  width: "46px",
  height: "46px",
  borderRadius: "50%",
  objectFit: "cover",
};

const activeRiderFallbackStyle = {
  width: "46px",
  height: "46px",
  borderRadius: "50%",
  display: "grid",
  placeItems: "center",
  background: "#111827",
  color: "white",
  fontWeight: 950,
};

const activeRiderCallStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "36px",
  borderRadius: "999px",
  padding: "0 12px",
  background: "#111827",
  color: "white",
  fontWeight: 900,
  textDecoration: "none",
};

const routeLineStyle = {
  display: "grid",
  gridTemplateColumns: "14px minmax(0, 1fr)",
  gap: "10px",
  alignItems: "start",
  marginTop: "12px",
};

const routePointStyle = {
  width: "11px",
  height: "11px",
  borderRadius: "999px",
  background: "#12b76a",
  marginTop: "5px",
};

const routeLabelStyle = {
  display: "block",
  color: "#667085",
  fontSize: "0.76rem",
  fontWeight: 900,
};

const routeTextStyle = {
  margin: "3px 0 0",
  color: "#111827",
  fontWeight: 800,
  overflowWrap: "anywhere",
};

const activeRideActionStyle = {
  marginTop: "16px",
};

const driverCancelRideButtonStyle = {
  width: "100%",
  minHeight: "44px",
  marginTop: "10px",
  border: "1px solid #dc2626",
  borderRadius: "6px",
  background: "#fff",
  color: "#b91c1c",
  fontWeight: 850,
  cursor: "pointer",
};

const tripDetailsStyle = {
  marginTop: "18px",
};

const tripSummaryStyle = {
  cursor: "pointer",
  fontWeight: 950,
  fontSize: "1.05rem",
  padding: "14px 0",
};

const menuOverlayStyle = {
  position: "fixed",
  inset: 0,
  zIndex: 3000,
  background: "white",
  color: "#160014",
  padding: "34px 28px",
  overflowY: "auto",
};

const menuCloseButtonStyle = {
  width: "48px",
  height: "48px",
  border: "none",
  background: "transparent",
  color: "#160014",
  fontSize: "3rem",
  lineHeight: 1,
  cursor: "pointer",
};

const menuProfileStyle = {
  display: "grid",
  gridTemplateColumns: "180px minmax(0, 1fr)",
  gap: "28px",
  alignItems: "center",
  marginTop: "16px",
};

const menuAvatarWrapStyle = {
  position: "relative",
  width: "150px",
  height: "150px",
  borderRadius: "999px",
  padding: "7px",
  background: `linear-gradient(135deg, ${DRIVER_GREEN_BRIGHT}, ${DRIVER_GREEN})`,
};

const menuAvatarFallbackStyle = {
  width: "100%",
  height: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "999px",
  background: "#111827",
  color: "white",
  fontSize: "2.4rem",
  fontWeight: 950,
};

const eliteBadgeStyle = {
  position: "absolute",
  left: "18px",
  bottom: "-12px",
  borderRadius: "999px",
  padding: "8px 18px",
  fontWeight: 900,
  boxShadow: "0 8px 18px rgba(15,23,42,0.18)",
};

const driverCategoryStyles = {
  gold: {
    background: "#fef3c7",
    color: "#92400e",
  },
  platinum: {
    background: "#e0f2fe",
    color: "#075985",
  },
  diamond: {
    background: "#ede9fe",
    color: "#5b21b6",
  },
  elite: {
    background: "#4b303d",
    color: "white",
  },
};

const menuProfileTextStyle = {
  minWidth: 0,
};

const menuNameRowStyle = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  flexWrap: "wrap",
};

const menuVerificationBadgeStyle = {
  border: "1px solid",
  borderRadius: "999px",
  padding: "7px 11px",
  fontSize: "0.78rem",
  fontWeight: 950,
};

const viewAsRiderStyle = {
  border: "none",
  background: "transparent",
  color: DRIVER_GREEN,
  fontWeight: 950,
  fontSize: "1rem",
  padding: 0,
  cursor: "pointer",
};

const menuContactStyle = {
  margin: "8px 0 10px",
  color: "#667085",
  fontWeight: 700,
  overflowWrap: "anywhere",
};

const menuStatsCardStyle = {
  marginTop: "34px",
  background: "white",
  borderRadius: "8px",
  boxShadow: "0 8px 24px rgba(15,23,42,0.18)",
  border: "1px solid #e5e7eb",
  padding: "22px",
  display: "grid",
  gridTemplateColumns: "1fr 1px 1fr 1px 1fr",
  textAlign: "center",
  alignItems: "center",
};

const menuDividerStyle = {
  height: "42px",
  background: "#d1d5db",
};

const menuSectionStyle = {
  marginTop: "34px",
};

const menuSectionTitleStyle = {
  width: "100%",
  borderTop: "1px solid #e5e7eb",
  borderRight: "none",
  borderBottom: "none",
  borderLeft: "none",
  background: "transparent",
  padding: "24px 0 18px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "16px",
  color: "#160014",
  cursor: "pointer",
  textAlign: "left",
};

const menuRowStyle = {
  width: "100%",
  minHeight: "68px",
  border: "none",
  background: "transparent",
  padding: 0,
  display: "grid",
  gridTemplateColumns: "48px minmax(0, 1fr) auto",
  alignItems: "center",
  gap: "12px",
  fontSize: "1.1rem",
  color: "#160014",
  cursor: "pointer",
  textAlign: "left",
};

const menuMessageStyle = {
  margin: "24px 0 -8px",
  borderRadius: "8px",
  background: DRIVER_GREEN_SOFT,
  color: DRIVER_GREEN,
  border: "1px solid rgba(15, 143, 77, 0.22)",
  padding: "12px 14px",
  fontWeight: 800,
  lineHeight: 1.35,
};

const menuRowIconStyle = {
  fontSize: "1.7rem",
};

const menuInfoRowStyle = {
  minHeight: "50px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "16px",
  borderTop: "1px solid #f0f0f0",
  color: "#4b5563",
};

const editVehicleButtonStyle = {
  width: "100%",
  minHeight: "52px",
  border: "none",
  borderRadius: "8px",
  background: "#111827",
  color: "white",
  fontWeight: 950,
  cursor: "pointer",
  margin: "14px 0 8px",
};

const vehicleFormStyle = {
  display: "grid",
  gap: "12px",
  background: "#f8fafc",
  border: "1px solid #e5e7eb",
  borderRadius: "8px",
  padding: "14px",
  marginTop: "10px",
};

const vehicleFieldStyle = {
  display: "grid",
  gap: "7px",
  color: "#334155",
  fontWeight: 900,
};

const vehicleInputStyle = {
  width: "100%",
  minHeight: "44px",
  border: "1px solid #cbd5e1",
  borderRadius: "8px",
  background: "white",
  color: "#111827",
  padding: "0 12px",
  fontWeight: 800,
  boxSizing: "border-box",
};

const documentUploadGridStyle = {
  display: "grid",
  gap: "12px",
  marginTop: "4px",
};

const documentUploadStyle = {
  display: "grid",
  gap: "7px",
  background: "white",
  border: "1px solid #e5e7eb",
  borderRadius: "8px",
  padding: "12px",
  color: "#334155",
  fontWeight: 900,
};

const documentFileInputStyle = {
  width: "100%",
  fontWeight: 800,
};

const documentUploadHintStyle = {
  color: "#64748b",
  fontWeight: 800,
  overflowWrap: "anywhere",
};

const documentLinkStyle = {
  color: DRIVER_GREEN,
  fontWeight: 900,
  textDecoration: "none",
};

const withdrawalListStyle = {
  display: "grid",
  gap: "8px",
  marginTop: "10px",
};

const withdrawalItemStyle = {
  minHeight: "44px",
  border: "1px solid #e5e7eb",
  borderRadius: "8px",
  background: "white",
  padding: "0 12px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "12px",
  textTransform: "capitalize",
};

const saveVehicleButtonStyle = {
  minHeight: "52px",
  border: "none",
  borderRadius: "999px",
  background: DRIVER_GREEN,
  color: "white",
  fontWeight: 950,
  cursor: "pointer",
};

const menuEmergencyRowStyle = {
  minHeight: "52px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "16px",
  color: "#991b1b",
  background: "#fff5f5",
  textDecoration: "none",
  borderRadius: "12px",
  padding: "0 14px",
  marginTop: "8px",
  fontWeight: 900,
};

const menuBadgeStyle = {
  background: DRIVER_GREEN_SOFT,
  color: DRIVER_GREEN,
  borderRadius: "999px",
  padding: "7px 12px",
  fontStyle: "normal",
  fontWeight: 900,
};

const logoutRowStyle = {
  marginTop: "20px",
  border: "none",
  background: "transparent",
  display: "inline-flex",
  alignItems: "center",
  gap: "16px",
  color: "#160014",
  fontSize: "1.2rem",
  cursor: "pointer",
};
