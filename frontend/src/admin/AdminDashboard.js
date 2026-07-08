import React, { useCallback, useEffect, useRef, useState } from "react";
import { API_URL } from "../apiConfig";
import authenticatedApi from "../auth/authenticatedApi";
import { clearAuthSession } from "../auth/session";
import { MARKET, formatMoney } from "../marketConfig";
import AnalyticsDashboard from "./AnalyticsDashboard";
import SafetyAdminPanel from "./SafetyAdminPanel";
import HallOfFameAdminPanel from "./HallOfFameAdminPanel";
import DeliveryAdminPanel from "../delivery/DeliveryAdminPanel";

const MARKET_OWNER_PERCENT = MARKET.ownerCommissionPercent;
const logoSrc = "/yala-admin-logo.png";
const ADMIN_BLUE = "#00A651";
const ADMIN_BLUE_PANEL = "rgba(15, 33, 25, 0.82)";
const ADMIN_BLUE_PANEL_DARK = "rgba(12, 25, 20, 0.9)";
const ADMIN_BLUE_SOFT = "rgba(110, 231, 183, 0.14)";
const ADMIN_BLUE_BORDER = "rgba(110, 231, 183, 0.26)";
const ADMIN_TEXT_PRIMARY = "#f8fafc";
const ADMIN_TEXT_SECONDARY = "#cbd5e1";
const ADMIN_SUCCESS_BG = "#ecfdf3";
const ADMIN_SUCCESS_TEXT = "#166534";
const ADMIN_SUCCESS_BORDER = "#bbf7d0";
const ADMIN_DANGER_BG = "#fee2e2";
const ADMIN_DANGER_TEXT = "#b91c1c";
const ADMIN_DANGER_BORDER = "#fecaca";
const ADMIN_WARNING_BG = "#fff7ed";
const ADMIN_WARNING_TEXT = "#9a3412";
const ADMIN_WARNING_BORDER = "#fed7aa";

const normalizeText = (value) => String(value || "").toLowerCase();

const matchesSearch = (item, query, fields) => {
  const normalizedQuery = normalizeText(query).trim();

  if (!normalizedQuery) return true;

  return fields.some((field) => normalizeText(item[field]).includes(normalizedQuery));
};

const formatDocumentStatus = (status) => {
  if (status === "valid") return "Valid";
  if (status === "expiring_soon") return "Expiring soon";
  if (status === "expired") return "Expired";
  return "Missing expiration";
};

const documentStatusStyle = (status) => ({
  color:
    status === "valid"
      ? ADMIN_SUCCESS_TEXT
      : status === "expiring_soon"
        ? "#92400e"
        : ADMIN_DANGER_TEXT,
  fontWeight: 900,
});

const formatYearsUsingApp = (years) => {
  const value = Number(years || 0);
  return `${value} ${value === 1 ? "year" : "years"} using app`;
};

const getStatusBadgeStyle = (status) => {
  const normalized = String(status || "").toLowerCase();

  if (normalized === "approved" || normalized === "active" || normalized === "valid") {
    return {
      background: ADMIN_SUCCESS_BG,
      color: ADMIN_SUCCESS_TEXT,
      borderColor: ADMIN_SUCCESS_BORDER,
    };
  }

  if (normalized === "rejected" || normalized === "blocked" || normalized === "expired") {
    return {
      background: ADMIN_DANGER_BG,
      color: ADMIN_DANGER_TEXT,
      borderColor: ADMIN_DANGER_BORDER,
    };
  }

  return {
    background: ADMIN_WARNING_BG,
    color: ADMIN_WARNING_TEXT,
    borderColor: ADMIN_WARNING_BORDER,
  };
};

const getAlphabetName = (item) =>
  (
    item.full_name ||
    item.driver_name ||
    `${item.first_name || ""} ${item.last_name || ""}`.trim() ||
    item.email ||
    item.driver_email ||
    ""
  ).toLowerCase();

const sortAlphabetically = (items) =>
  [...items].sort((first, second) =>
    getAlphabetName(first).localeCompare(getAlphabetName(second), undefined, {
      sensitivity: "base",
    })
  );

const readJsonSafe = async (response) => {
  const contentType = response?.headers?.get?.("content-type") || "";

  try {
    if (contentType.includes("application/json")) {
      return await response.json();
    }
  } catch (error) {
    // Fall through to text parsing.
  }

  try {
    const rawText = await response.text();
    if (!rawText) return {};

    try {
      return JSON.parse(rawText);
    } catch (error) {
      return { detail: rawText.slice(0, 300) };
    }
  } catch (error) {
    return {};
  }
};

const flattenApiMessage = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map((item) => flattenApiMessage(item))
      .filter(Boolean)
      .join(", ");
  }
  if (typeof value === "object") {
    return Object.values(value)
      .map((item) => flattenApiMessage(item))
      .filter(Boolean)
      .join(", ");
  }
  return String(value);
};

const getApiMessage = (data, fallback) =>
  flattenApiMessage(data?.error) ||
  flattenApiMessage(data?.detail) ||
  flattenApiMessage(data?.message) ||
  fallback;

const callAdminApi = async (path, options = {}) => {
  const { method = "GET", body } = options;
  const methodLower = method.toLowerCase();
  try {
    let res;
    if (methodLower === "delete") res = await authenticatedApi.delete(`${API_URL}${path}`);
    else if (methodLower === "post") res = await authenticatedApi.post(`${API_URL}${path}`, body ? JSON.parse(body) : undefined);
    else if (methodLower === "patch") res = await authenticatedApi.patch(`${API_URL}${path}`, body ? JSON.parse(body) : undefined);
    else res = await authenticatedApi.get(`${API_URL}${path}`);
    return { response: { ok: true, status: res.status }, data: res.data };
  } catch (error) {
    const status = error?.response?.status || 500;
    return { response: { ok: false, status }, data: error?.response?.data || {} };
  }
};

const FAKE_VALUE_SET = new Set([
  "fake",
  "test",
  "testing",
  "unknown",
  "none",
  "null",
  "n/a",
  "na",
  "asdf",
  "qwerty",
]);

const compactText = (value) => String(value || "").trim().replace(/\s+/g, " ");

const toDigits = (value) => compactText(value).replace(/\D/g, "");

const isValidNationalId = (value) => {
  const digits = toDigits(value);
  if (digits.length !== 10) return false;
  if (new Set(digits).size === 1) return false;
  if (digits === "1234567890" || digits === "0987654321") return false;
  return true;
};

const isValidMauritaniaPhone = (value) => {
  let digits = toDigits(value);
  if (digits.startsWith("00222")) digits = digits.slice(5);
  else if (digits.startsWith("222") && digits.length === 11) digits = digits.slice(3);
  if (digits.length !== 8) return false;
  if (new Set(digits).size === 1) return false;
  if (digits === "12345678" || digits === "87654321" || digits === "00000000") return false;
  return true;
};

const isValidPlateNumber = (value) => {
  const normalized = compactText(value).toUpperCase();
  if (normalized.length < 4 || normalized.length > 20) return false;
  if (normalized.startsWith("TEMP")) return false;
  if (FAKE_VALUE_SET.has(normalized.toLowerCase())) return false;
  if (!/[A-Z]/.test(normalized) || !/\d/.test(normalized)) return false;
  return true;
};

const getDriverApprovalMissingItems = (driver, relatedUser = null) => {
  const checks = [
    { label: "National ID number", ok: isValidNationalId(driver?.national_id_number) },
    {
      label: "National ID document",
      ok: Boolean(driver?.has_national_id_document || driver?.national_id_document),
    },
    { label: "Driver photo", ok: Boolean(driver?.driver_photo) },
    { label: "Phone number", ok: isValidMauritaniaPhone(driver?.phone_number) },
    {
      label: "Plate number",
      ok: isValidPlateNumber(driver?.vehicle_plate || driver?.plate_number),
    },
    { label: "Driver license", ok: Boolean(driver?.license_file) },
    { label: "Carte Grise", ok: Boolean(driver?.vehicle_registration) },
    { label: "Insurance document", ok: Boolean(driver?.insurance_document) },
    { label: "Vignette", ok: Boolean(driver?.vignette_document) },
    {
      label: "Driver agreement signed",
      ok: Boolean(
        driver?.legal_signature?.signature_complete || driver?.driver_terms_accepted
      ),
    },
  ];

  return checks.filter((item) => !item.ok).map((item) => item.label);
};

const ADMIN_SECTION_KEYS = new Set([
  "overview",
  "verification",
  "riders",
  "drivers",
  "rides",
  "deliveries",
  "emergency",
  "vehicles",
  "cities",
  "performance",
  "hall-of-fame",
  "payments",
  "withdrawals",
  "analytics",
  "reports",
]);

const getInitialAdminSection = () => {
  if (typeof window === "undefined") return "overview";
  const section = new URLSearchParams(window.location.search).get("section");
  return ADMIN_SECTION_KEYS.has(section) ? section : "overview";
};

function AdminDashboard() {
  const DRIVER_CATEGORIES = [
    { value: "gold", label: "Gold" },
    { value: "platinum", label: "Platinum" },
    { value: "diamond", label: "Diamond" },
    { value: "elite", label: "Elite" },
  ];

  const [page, setPage] = useState(getInitialAdminSection);
  const [searchQuery, setSearchQuery] = useState("");
  const [drivers, setDrivers] = useState([]);
  const [users, setUsers] = useState([]);
  const [rides, setRides] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [cities, setCities] = useState([]);
  const [regions, setRegions] = useState([]);
  const [cityAnalytics, setCityAnalytics] = useState({ summary: {}, cities: [] });
  const [cityForm, setCityForm] = useState({
    name: "",
    region: "",
    is_active: true,
  });
  const [driverPerformance, setDriverPerformance] = useState({
    average_score: 0,
    excellent_count: 0,
    watch_count: 0,
    driver_count: 0,
    drivers: [],
  });
  const [ownerPayoutSummary, setOwnerPayoutSummary] = useState({
    owner_commission_percent: MARKET_OWNER_PERCENT,
    owner_commission_balance: 0,
    methods: [],
  });
  const [ownerPayoutSaving, setOwnerPayoutSaving] = useState(false);
  const [ownerPayoutMessage, setOwnerPayoutMessage] = useState("");
  const [driverTab, setDriverTab] = useState("taxi"); // 'taxi' | 'courier'
  const [cancelRide, setCancelRide] = useState(null); // { rideId, reason }
  const [cancelRideLoading, setCancelRideLoading] = useState(false);
  const [isCompactLayout, setIsCompactLayout] = useState(
    typeof window !== "undefined" ? window.innerWidth <= 1120 : false
  );
  const [ownerPayoutForm, setOwnerPayoutForm] = useState({
    payout_type: "bank_account",
    account_holder_name: "",
    bank_name: "",
    account_reference: "",
    phone_number: "",
    wallet_id: "",
  });

  const navigateAdminSection = useCallback((sectionKey) => {
    if (!ADMIN_SECTION_KEYS.has(sectionKey)) return;
    setPage(sectionKey);

    if (typeof window === "undefined") return;
    const next = `/admin?section=${encodeURIComponent(sectionKey)}`;
    if (`${window.location.pathname}${window.location.search}` !== next) {
      window.history.replaceState(null, "", next);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const updateLayout = () => setIsCompactLayout(window.innerWidth <= 1120);
    updateLayout();
    window.addEventListener("resize", updateLayout);
    return () => window.removeEventListener("resize", updateLayout);
  }, []);

  const fetchDrivers = useCallback(async () => {
    try {
      const res = await authenticatedApi.get(`${API_URL}/drivers/list/`);
      setDrivers(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      console.error("Error fetching drivers:", error);
      setDrivers([]);
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await authenticatedApi.get(`${API_URL}/auth/users/`);
      setUsers(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      console.error("Error fetching users:", error);
      setUsers([]);
    }
  }, []);

  const fetchRides = useCallback(async () => {
    try {
      const res = await authenticatedApi.get(`${API_URL}/rides/history/`);
      setRides(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      console.error("Error fetching rides:", error);
      setRides([]);
    }
  }, []);

  const fetchWithdrawals = useCallback(async () => {
    try {
      const res = await authenticatedApi.get(`${API_URL}/payments/withdrawals/`);
      setWithdrawals(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      console.error("Withdrawal fetch error:", error);
      setWithdrawals([]);
    }
  }, []);

  const fetchLocations = useCallback(async () => {
    try {
      const [citiesRes, regionsRes, analyticsRes] = await Promise.all([
        authenticatedApi.get(`${API_URL}/locations/cities/`),
        authenticatedApi.get(`${API_URL}/locations/regions/`),
        authenticatedApi.get(`${API_URL}/locations/analytics/`),
      ]);
      setCities(Array.isArray(citiesRes.data) ? citiesRes.data : []);
      setRegions(Array.isArray(regionsRes.data) ? regionsRes.data : []);
      setCityAnalytics(analyticsRes.data || { summary: {}, cities: [] });
    } catch (error) {
      console.error("Locations fetch error:", error);
      setCities([]);
      setRegions([]);
      setCityAnalytics({ summary: {}, cities: [] });
    }
  }, []);

  const fetchDriverPerformance = useCallback(async () => {
    try {
      const res = await authenticatedApi.get(`${API_URL}/drivers/performance/`);
      const data = res.data || {};
      setDriverPerformance({
        average_score: data.average_score || 0,
        excellent_count: data.excellent_count || 0,
        watch_count: data.watch_count || 0,
        driver_count: data.driver_count || 0,
        drivers: Array.isArray(data.drivers) ? data.drivers : [],
      });
    } catch (error) {
      console.error("Driver performance fetch error:", error);
      setDriverPerformance({ average_score: 0, excellent_count: 0, watch_count: 0, driver_count: 0, drivers: [] });
    }
  }, []);

  const fetchOwnerPayout = useCallback(async () => {
    try {
      const res = await authenticatedApi.get(`${API_URL}/payments/owner-payout/`);
      const data = res.data || {};
      setOwnerPayoutSummary({
        owner_commission_percent: data.owner_commission_percent || MARKET_OWNER_PERCENT,
        owner_commission_balance: data.owner_commission_balance || 0,
        methods: Array.isArray(data.methods) ? data.methods : [],
      });
    } catch (error) {
      console.error("Owner payout fetch error:", error);
    }
  }, []);

  useEffect(() => {
    fetchDrivers();
    fetchDriverPerformance();
    fetchLocations();
    fetchUsers();
    fetchRides();
    fetchWithdrawals();
    fetchOwnerPayout();
  }, [
    fetchDriverPerformance,
    fetchDrivers,
    fetchLocations,
    fetchOwnerPayout,
    fetchRides,
    fetchUsers,
    fetchWithdrawals,
  ]);

  const approveDriver = async (id) => {
    if (!id) {
      showToast("Could not approve driver: missing driver id", "error");
      return;
    }
    try {
      const { response, data } = await callAdminApi(`/drivers/approve/${id}/`, { method: "POST" });
      if (response.ok) {
        showToast(getApiMessage(data, "Driver approved"), "success");
        fetchDrivers();
        fetchUsers();
        return;
      }
      showToast(getApiMessage(data, `Could not approve driver (HTTP ${response.status})`), "error");
    } catch (error) {
      console.error("Approve driver network error:", error);
      showToast(`Server error approving driver: ${error.message || "Network request failed"}`, "error");
    }
  };

  const rejectDriver = async (id) => {
    const reason = await showPrompt("Why is this driver application being rejected?");
    if (!reason || reason.trim().length < 5) return;
    try {
      const { response, data } = await callAdminApi(`/drivers/reject/${id}/`, {
        method: "POST",
        body: JSON.stringify({ reason: reason.trim() }),
      });
      if (response.ok) {
        showToast(getApiMessage(data, "Driver rejected"), "error");
        fetchDrivers();
        fetchUsers();
      } else {
        showToast(getApiMessage(data, `Could not reject driver (HTTP ${response.status})`), "error");
      }
    } catch (error) {
      console.error(error);
      showToast("Server error rejecting driver", "error");
    }
  };

  const deleteDriver = async (id) => {
    const confirmed = await showConfirm("Permanently delete this driver? This cannot be undone.");
    if (!confirmed) return;
    try {
      const { response, data } = await callAdminApi(`/drivers/delete/${id}/`, { method: "DELETE" });
      if (response.ok) {
        showToast(getApiMessage(data, "Driver permanently deleted"), "success");
        fetchDrivers();
        fetchUsers();
      } else {
        showToast(getApiMessage(data, `Could not delete driver (HTTP ${response.status})`), "error");
      }
    } catch (error) {
      console.error(error);
      showToast("Server error deleting driver", "error");
    }
  };

  const handleAdminCancelRide = async () => {
    if (!cancelRide?.rideId || !cancelRide?.reason?.trim()) return;
    setCancelRideLoading(true);
    try {
      const { response, data } = await callAdminApi(`/rides/cancel/${cancelRide.rideId}/`, {
        method: "POST",
        body: JSON.stringify({ reason: cancelRide.reason.trim() }),
      });
      if (response.ok) {
        showToast(`Ride #${cancelRide.rideId} cancelled`, "success");
        setCancelRide(null);
        fetchRides();
      } else {
        showToast(getApiMessage(data, `Could not cancel ride (HTTP ${response.status})`), "error");
      }
    } catch (error) {
      showToast("Server error cancelling ride", "error");
    } finally {
      setCancelRideLoading(false);
    }
  };

  const reintegrateDriver = async (id) => {
    try {
      const { response, data } = await callAdminApi(`/drivers/reintegrate/${id}/`, {
        method: "POST",
        body: JSON.stringify({ status: "approved" }),
      });
      if (!response.ok) {
        showToast(getApiMessage(data, `Could not reintegrate driver (HTTP ${response.status})`), "error");
        return;
      }
      showToast(getApiMessage(data, "Driver reintegrated"), "success");
      fetchDrivers();
      fetchUsers();
    } catch (error) {
      console.error(error);
      showToast("Server error reintegrating driver", "error");
    }
  };

  const setUserBlocked = async (userId, shouldBlock) => {
    try {
      const endpoint = shouldBlock ? "block" : "unblock";
      const { response, data } = await callAdminApi(`/auth/users/${userId}/${endpoint}/`, { method: "POST" });
      if (!response.ok) {
        showToast(getApiMessage(data, `Could not update user (HTTP ${response.status})`), "error");
        return;
      }
      showToast(getApiMessage(data, "User updated"), "success");
      fetchUsers();
      fetchDrivers();
    } catch (error) {
      console.error(error);
      showToast("Server error updating user", "error");
    }
  };

  const updateRiderApproval = async (userId, action) => {
    let reason = "";
    if (action === "reject") {
      reason = await showPrompt("Why is this rider application being rejected?");
      if (!reason || reason.trim().length < 5) return;
    }
    try {
      const { response, data } = await callAdminApi(`/auth/users/${userId}/${action}-rider/`, {
        method: "POST",
        body: JSON.stringify(action === "reject" ? { reason: reason.trim() } : {}),
      });
      if (!response.ok) {
        showToast(getApiMessage(data, `Could not update rider application (HTTP ${response.status})`), "error");
        return;
      }
      showToast(getApiMessage(data, "Rider application updated"), "success");
      fetchUsers();
      fetchDrivers();
    } catch (error) {
      console.error(error);
      showToast("Server error updating rider application", "error");
    }
  };

  const deleteRider = async (user) => {
    const riderName = user?.full_name || user?.email || "this rider";
    const confirmed = await showConfirm(`Delete rider account for ${riderName}? This cannot be undone.`);
    if (!confirmed) return;
    try {
      const { response, data } = await callAdminApi(`/auth/users/${user.id}/delete-rider/`, { method: "DELETE" });
      if (!response.ok) {
        showToast(getApiMessage(data, `Could not delete rider (HTTP ${response.status})`), "error");
        return;
      }
      showToast(getApiMessage(data, "Rider deleted"), "success");
      fetchUsers();
      fetchRides();
      fetchWithdrawals();
    } catch (error) {
      console.error(error);
      showToast("Server error deleting rider", "error");
    }
  };

  const updateDriverCategory = async (driverId, driverCategory) => {
    try {
      const { response, data } = await callAdminApi(`/drivers/category/${driverId}/`, {
        method: "POST",
        body: JSON.stringify({ driver_category: driverCategory }),
      });
      if (!response.ok) {
        showToast(getApiMessage(data, `Could not update driver category (HTTP ${response.status})`), "error");
        return;
      }
      showToast(getApiMessage(data, "Driver category updated"), "success");
      fetchDrivers();
      fetchUsers();
    } catch (error) {
      console.error(error);
      showToast("Server error updating driver category", "error");
    }
  };

  const approveWithdrawal = async (id) => {
    try {
      await authenticatedApi.post(`${API_URL}/payments/withdrawals/${id}/approve/`);
      showToast("Withdrawal approved", "success");
      fetchWithdrawals();
    } catch (error) {
      console.error(error);
      showToast(error?.response?.data?.detail || "Could not approve withdrawal", "error");
    }
  };

  const rejectWithdrawal = async (id) => {
    try {
      await authenticatedApi.post(`${API_URL}/payments/withdrawals/${id}/reject/`);
      showToast("Withdrawal rejected", "error");
      fetchWithdrawals();
    } catch (error) {
      console.error(error);
      showToast(error?.response?.data?.detail || "Could not reject withdrawal", "error");
    }
  };

  const updateOwnerPayoutForm = (field, value) => {
    setOwnerPayoutForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const saveOwnerPayoutMethod = async (event) => {
    event.preventDefault();
    try {
      setOwnerPayoutSaving(true);
      setOwnerPayoutMessage("");
      await authenticatedApi.post(`${API_URL}/payments/owner-payout/save/`, ownerPayoutForm);
      setOwnerPayoutMessage("Owner payout method saved successfully.");
      fetchOwnerPayout();
    } catch (error) {
      console.error("Owner payout save error:", error);
      const data = error?.response?.data || {};
      setOwnerPayoutMessage(
        data.error || data.detail ||
        (Array.isArray(data.non_field_errors) ? data.non_field_errors.join(" ") : "") ||
        "Could not save owner payout method."
      );
    } finally {
      setOwnerPayoutSaving(false);
    }
  };

  const createCity = async (event) => {
    event.preventDefault();
    if (!cityForm.name || !cityForm.region) return;
    try {
      await authenticatedApi.post(`${API_URL}/locations/cities/`, cityForm);
      setCityForm({ name: "", region: "", is_active: true });
      fetchLocations();
    } catch (error) {
      console.error("City create error:", error);
      const data = error?.response?.data || {};
      showToast(data.detail || data.name || "Could not create city", "error");
    }
  };

  const getFileUrl = (path) => {
    if (!path) return null;
    if (path.startsWith("http")) return path;
    return `${API_URL}${path}`;
  };

  const menuItems = [
    { key: "overview", label: "Overview" },
    { key: "verification", label: "Verification" },
    { key: "riders", label: "Riders" },
    { key: "drivers", label: "Drivers" },
    { key: "rides", label: "Dispatch" },
    { key: "deliveries", label: "Deliveries" },
    { key: "emergency", label: "Emergency" },
    { key: "vehicles", label: "Vehicles" },
    { key: "cities", label: "Cities" },
    { key: "performance", label: "Performance" },
    { key: "hall-of-fame", label: "Hall of Fame" },
    { key: "payments", label: "Payments" },
    { key: "withdrawals", label: "Withdrawals" },
    { key: "analytics", label: "Analytics" },
    { key: "reports", label: "Reports" },
  ];
  const adminQuickShortcuts = [
    { key: "overview", label: "Overview" },
    { key: "riders", label: "Riders" },
    { key: "drivers", label: "Drivers" },
    { key: "deliveries", label: "Deliveries" },
    { key: "payments", label: "Payments" },
  ];

  const alphabetDrivers = sortAlphabetically(drivers);
  const pendingDrivers = alphabetDrivers.filter((driver) => driver.status === "pending");
  const approvedDrivers = alphabetDrivers.filter(
    (driver) => driver.status === "approved"
  );
  const rejectedDrivers = alphabetDrivers.filter(
    (driver) => driver.status === "rejected"
  );
  const onlineDrivers = drivers.filter((driver) => driver.is_available);
  const riders = sortAlphabetically(
    users.filter(
      (user) => (user.is_rider || user.user_type === "rider") && !user.is_staff
    )
  );
  const pendingRiders = riders.filter((user) => user.rider_status === "pending");
  const approvedRiders = riders.filter((user) => user.rider_status === "approved");
  const rejectedRiders = riders.filter((user) => user.rider_status === "rejected");
  const platformDrivers = sortAlphabetically(
    users.filter(
      (user) => (user.is_driver || user.user_type === "driver") && !user.is_staff
    )
  );
  const blockedUsers = users.filter((user) => !user.is_active && !user.is_staff);

  const paidRides = rides.filter((ride) => ride.payment_status === "paid");
  const unpaidRides = rides.filter((ride) => ride.payment_status !== "paid");
  const completedRides = rides.filter((ride) => ride.status === "completed");
  const cancelledRides = rides.filter(
    (ride) => ride.status === "cancelled" || ride.status === "rider_no_show"
  );
  const riderNoShowRides = rides.filter(
    (ride) => ride.status === "rider_no_show" || ride.is_rider_no_show
  );
  const activeRideStatuses = [
    "requested",
    "pending",
    "accepted",
    "driver_arriving",
    "driver_arrived",
    "in_progress",
  ];
  const activeRides = rides.filter((ride) => activeRideStatuses.includes(ride.status));
  const driverArrivingRides = rides.filter((ride) => ride.status === "driver_arriving");
  const inProgressRides = rides.filter((ride) => ride.status === "in_progress");
  const pendingRideRequests = rides.filter((ride) => ["requested", "pending"].includes(ride.status));

  const pendingWithdrawals = withdrawals.filter(
    (item) => item.status === "pending"
  );
  const approvedWithdrawals = withdrawals.filter(
    (item) => item.status === "approved"
  );
  const rejectedWithdrawals = withdrawals.filter(
    (item) => item.status === "rejected"
  );

  const totalRevenue = rides.reduce(
    (total, ride) => total + Number(ride.fare || 0),
    0
  );

  const platformCommission = rides.reduce(
    (total, ride) => total + Number(ride.app_fee || 0),
    0
  );

  const driverPayouts = rides.reduce(
    (total, ride) => total + Number(ride.driver_earning || 0),
    0
  );
  const ownerCommissionPercent =
    totalRevenue > 0
      ? Math.round((platformCommission / totalRevenue) * 1000) / 10
      : MARKET_OWNER_PERCENT;

  const totalWithdrawRequested = withdrawals.reduce(
    (total, item) => total + Number(item.amount || 0),
    0
  );

  const totalApprovedWithdrawals = approvedWithdrawals.reduce(
    (total, item) => total + Number(item.amount || 0),
    0
  );
  const completionRate =
    rides.length > 0 ? Math.round((completedRides.length / rides.length) * 100) : 0;
  const cancellationRate =
    rides.length > 0 ? Math.round((cancelledRides.length / rides.length) * 100) : 0;
  const averageFare =
    rides.length > 0 ? Math.round(totalRevenue / rides.length) : 0;
  const emergencyWatchList = [
    ...activeRides.slice(0, 5).map((ride) => ({
      id: `ride-${ride.id}`,
      title: `Ride #${ride.id}`,
      status: ride.status,
      detail: `${ride.pickup || "Pickup"} to ${ride.destination || "Destination"}`,
      severity:
        ride.status === "in_progress"
          ? "medium"
          : ride.status === "driver_arriving"
            ? "low"
            : "watch",
    })),
    ...blockedUsers.slice(0, 3).map((user) => ({
      id: `blocked-${user.id}`,
      title: user.full_name || user.email || "Blocked user",
      status: "blocked",
      detail: "Account blocked. Support may need to review access.",
      severity: "high",
    })),
  ];
  const menuCounts = {
    overview: activeRides.length,
    verification: pendingDrivers.length,
    riders: riders.length,
    drivers: platformDrivers.length,
    rides: rides.length,
    emergency: emergencyWatchList.length,
    vehicles: drivers.length,
    cities: cities.length,
    performance: driverPerformance.watch_count,
    payments: paidRides.length,
    withdrawals: pendingWithdrawals.length,
    analytics: completedRides.length,
    reports: emergencyWatchList.length + cancelledRides.length + pendingWithdrawals.length,
  };
  const currentViewTitle =
    menuItems.find((item) => item.key === page)?.label || "Admin";
  const filteredRiders = riders.filter((user) =>
    matchesSearch(user, searchQuery, [
      "full_name",
      "email",
      "phone_number",
      "national_id_number",
    ])
  );
  const filteredPlatformDrivers = platformDrivers.filter((user) =>
    matchesSearch(user, searchQuery, [
      "full_name",
      "email",
      "phone_number",
      "driver_status",
      "driver_category_label",
      "national_id_number",
    ])
  );
  const filteredDriverProfiles = alphabetDrivers.filter((driver) =>
    matchesSearch(driver, searchQuery, [
      "driver_name",
      "driver_email",
      "phone_number",
      "vehicle_make",
      "vehicle_model",
      "vehicle_plate",
      "driver_category_label",
      "status",
    ])
  );
  const usersById = new Map(users.map((user) => [Number(user.id), user]));
  const filteredPendingDrivers = pendingDrivers.filter((driver) =>
    matchesSearch(driver, searchQuery, [
      "driver_name",
      "driver_email",
      "phone_number",
      "vehicle_make",
      "vehicle_model",
      "vehicle_plate",
    ])
  );
  const filteredRides = rides.filter((ride) =>
    matchesSearch(ride, searchQuery, [
      "id",
      "status",
      "pickup",
      "destination",
      "rider_email",
      "driver_email",
      "rider_name",
      "driver_name",
    ])
  );
  const filteredWithdrawals = withdrawals.filter((item) =>
    matchesSearch(item, searchQuery, [
      "id",
      "driver",
      "driver_name",
      "status",
      "payout_method_display",
    ])
  );

  const refreshAdminData = () => {
    fetchDrivers();
    fetchUsers();
    fetchRides();
    fetchWithdrawals();
    fetchOwnerPayout();
  };

  const [sidebarOpen, setSidebarOpen] = useState(!isCompactLayout);

  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);
  const showToast = useCallback((message, type = "success") => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, type });
    toastTimerRef.current = setTimeout(() => setToast(null), 4000);
  }, []);

  const [confirmDialog, setConfirmDialog] = useState(null);
  const confirmResolveRef = useRef(null);
  const showConfirm = useCallback((message) => new Promise((resolve) => {
    confirmResolveRef.current = resolve;
    setConfirmDialog(message);
  }), []);

  const [promptDialog, setPromptDialog] = useState(null);
  const promptResolveRef = useRef(null);
  const [promptValue, setPromptValue] = useState("");
  const showPrompt = useCallback((message) => new Promise((resolve) => {
    promptResolveRef.current = resolve;
    setPromptValue("");
    setPromptDialog(message);
  }), []);

  return (
    <div style={{ ...pageStyle, ...(isCompactLayout ? pageStyleCompact : {}) }}>
      {/* Mobile hamburger button */}
      {isCompactLayout && (
        <button
          type="button"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          style={{
            position: "fixed",
            top: 12,
            left: 12,
            zIndex: 1100,
            width: 44,
            height: 44,
            border: "1px solid rgba(255,255,255,0.2)",
            borderRadius: 10,
            background: "rgba(15,23,42,0.95)",
            color: "#fff",
            fontSize: 22,
            fontWeight: 900,
            cursor: "pointer",
            display: "grid",
            placeItems: "center",
          }}
          aria-label="Toggle menu"
        >
          ☰
        </button>
      )}

      {/* Mobile backdrop */}
      {isCompactLayout && sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 999, background: "rgba(0,0,0,0.5)" }}
        />
      )}

      <div style={{ ...sidebar, ...(isCompactLayout ? sidebarCompact : {}), ...(isCompactLayout && !sidebarOpen ? { transform: "translateX(-100%)", pointerEvents: "none" } : {}) }}>
        <div style={sidebarBrandStyle}>
          <img src={logoSrc} alt={`${MARKET.brandName} logo`} style={brandLogoStyle} />
          <div>
            <h2 style={sidebarTitle}>Yala Admin</h2>
            <p style={sidebarSubtitleStyle}>Operations console</p>
          </div>
        </div>

        {/* Admin user info */}
        <div style={adminUserCardStyle}>
          <div style={adminUserAvatarStyle}>
            {(() => { try { const u = JSON.parse(localStorage.getItem("user") || "{}"); return (u.first_name || "A")[0].toUpperCase(); } catch(e) { return "A"; } })()}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={adminUserNameStyle}>
              {(() => { try { const u = JSON.parse(localStorage.getItem("user") || "{}"); return `${u.first_name || ""} ${u.last_name || ""}`.trim() || "Admin"; } catch(e) { return "Admin"; } })()}
            </div>
            <div style={adminUserEmailStyle}>
              {(() => { try { return JSON.parse(localStorage.getItem("user") || "{}").email || ""; } catch(e) { return ""; } })()}
            </div>
          </div>
        </div>

        {menuItems.map((item) => (
          <button
            key={item.key}
            style={{
              ...menuButton,
              background:
                page === item.key ? "linear-gradient(135deg, rgba(148, 163, 184, 0.26), rgba(148, 163, 184, 0.12))" : "transparent",
              color: page === item.key ? "#ffffff" : "#cbd5e1",
              borderColor:
                page === item.key ? "rgba(148, 163, 184, 0.42)" : "rgba(148, 163, 184, 0.16)",
              boxShadow: page === item.key ? "inset 2px 0 0 #34d399" : "none",
            }}
            onClick={() => {
              if (item.path) {
                window.location.href = item.path;
                return;
              }
              navigateAdminSection(item.key);
              if (isCompactLayout) setSidebarOpen(false);
            }}
          >
            <span>{item.label}</span>
            <span style={menuCountStyle}>{menuCounts[item.key] || 0}</span>
          </button>
        ))}

        <button
          type="button"
          onClick={() => {
            clearAuthSession();
            window.location.replace("/login");
          }}
          style={{
            ...menuButton,
            marginTop: "auto",
            color: "#fca5a5",
            borderColor: "rgba(239,68,68,0.22)",
            background: "rgba(239,68,68,0.08)",
          }}
        >
          <span>Log out</span>
        </button>
      </div>

      <div style={{ ...content, ...(isCompactLayout ? contentCompact : {}) }}>
        <header style={{ ...topBarStyle, ...(isCompactLayout ? topBarCompactStyle : {}) }}>
          <div>
            <span style={topBarKickerStyle}>Admin app</span>
            <h1 style={topBarTitleStyle}>{currentViewTitle}</h1>
          </div>
          <div style={{ ...topBarActionsStyle, ...(isCompactLayout ? topBarActionsCompactStyle : {}) }}>
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search users, rides, vehicles"
              style={{ ...searchInputStyle, ...(isCompactLayout ? searchInputCompactStyle : {}) }}
            />
            <button type="button" onClick={refreshAdminData} style={refreshButtonStyle}>
              Refresh
            </button>
          </div>
        </header>

        <div style={adminShortcutRowStyle} role="tablist" aria-label="Admin quick shortcuts">
          {adminQuickShortcuts.map((item) => {
            const active = page === item.key;
            return (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => navigateAdminSection(item.key)}
                style={{
                  ...adminShortcutButtonStyle,
                  ...(active ? adminShortcutButtonActiveStyle : {}),
                }}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        <section style={{ ...opsHeroStyle, ...(isCompactLayout ? opsHeroCompactStyle : {}) }}>
          <div>
            <span style={opsKickerStyle}>Three app platform</span>
            <h1 style={opsTitleStyle}>Admin operations center</h1>
            <p style={opsSubtitleStyle}>
              Monitor riders, drivers, dispatch, payments, and approvals from one place.
            </p>
          </div>

          <div style={opsStatsGridStyle}>
            <StatCard title="Drivers" value={drivers.length} />
            <StatCard title="Riders" value={riders.length} />
            <StatCard title="Online" value={onlineDrivers.length} />
            <StatCard title="Active rides" value={activeRides.length} />
            <StatCard title="Revenue" value={formatMoney(totalRevenue)} />
          </div>
        </section>

        {page === "overview" && (
          <div style={adminOverviewGridStyle}>
            <section style={card}>
              <SectionTitle
                title="Marketplace command center"
                subtitle="A live executive view of approvals, active trips, revenue, and platform safety."
              />

              <AdminInfoLines
                lines={[
                  {
                    title: "Operations",
                    items: [
                      ["Active rides", activeRides.length],
                      ["Waiting requests", pendingRideRequests.length],
                      ["Driver arriving", driverArrivingRides.length],
                      ["In progress", inProgressRides.length],
                      ["Completed", completedRides.length],
                      ["Cancelled", cancelledRides.length],
                    ],
                  },
                  {
                    title: "Accounts",
                    items: [
                      ["Total riders", riders.length],
                      ["Total drivers", platformDrivers.length],
                      ["Online drivers", onlineDrivers.length],
                      ["Pending drivers", pendingDrivers.length],
                      ["Pending riders", pendingRiders.length],
                      ["Blocked users", blockedUsers.length],
                    ],
                  },
                  {
                    title: "Financials",
                    items: [
                      ["Revenue", formatMoney(totalRevenue)],
                      ["Owner commission", formatMoney(platformCommission)],
                      ["Driver payouts", formatMoney(driverPayouts)],
                      ["Withdraw pending", pendingWithdrawals.length],
                      ["Withdraw approved", approvedWithdrawals.length],
                      ["Avg fare", formatMoney(averageFare)],
                    ],
                  },
                ]}
              />

              <div style={premiumMetricGridStyle}>
                <PremiumMetric title="Active rides" value={activeRides.length} tone="green" />
                <PremiumMetric title="Total riders" value={riders.length} tone="blue" />
                <PremiumMetric title="Total drivers" value={platformDrivers.length} tone="gold" />
                <PremiumMetric title="Pending drivers" value={pendingDrivers.length} tone="amber" />
                <PremiumMetric title="Pending riders" value={pendingRiders.length} tone="amber" />
                <PremiumMetric title="Online drivers" value={onlineDrivers.length} tone="blue" />
                <PremiumMetric title="Revenue" value={formatMoney(totalRevenue)} tone="gold" />
                <PremiumMetric title="Owner commission" value={formatMoney(platformCommission)} tone="green" />
              </div>

              <div style={overviewPanelsStyle}>
                <RideAnalyticsPanel
                  completed={completedRides.length}
                  cancelled={cancelledRides.length}
                  active={activeRides.length}
                  pending={pendingRideRequests.length}
                  completionRate={completionRate}
                  cancellationRate={cancellationRate}
                />
                <RevenueAnalyticsPanel
                  totalRevenue={totalRevenue}
                  platformCommission={platformCommission}
                  driverPayouts={driverPayouts}
                  averageFare={averageFare}
                />
              </div>
            </section>

            <section style={card}>
              <SectionTitle
                title="Live active rides"
                subtitle="Trips that need operational visibility right now."
              />
              <LiveRidesList
                rides={activeRides}
                onCancelRide={(rideId) => setCancelRide({ rideId, reason: "" })}
              />
            </section>

            <section style={card}>
              <SectionTitle
                title="Emergency monitoring"
                subtitle="Watch active trips, blocked accounts, and emergency contacts."
              />
              <EmergencyMonitor
                items={emergencyWatchList}
                activeRides={activeRides.length}
                blockedUsers={blockedUsers.length}
              />
            </section>
          </div>
        )}

        {page === "verification" && (
          <div style={card}>
            <SectionTitle title="Driver verification" subtitle="Approve or reject new driver applications." />

            <div style={statsGrid}>
              <StatCard title="Pending" value={pendingDrivers.length} />
              <StatCard title="Approved" value={approvedDrivers.length} />
              <StatCard title="Rejected" value={rejectedDrivers.length} />
              <StatCard title="Rider Applications" value={pendingRiders.length} />
            </div>

            <h2 style={subHeadingStyle}>Pending driver applications</h2>

            {filteredPendingDrivers.length === 0 ? (
              <p>No pending driver applications.</p>
            ) : (
              filteredPendingDrivers.map((driver) => (
                <DriverVerificationCard
                  key={driver.id}
                  driver={driver}
                  getFileUrl={getFileUrl}
                  approveDriver={approveDriver}
                  rejectDriver={rejectDriver}
                />
              ))
            )}

            <h2 style={subHeadingStyle}>Pending rider applications</h2>

            {pendingRiders.length === 0 ? (
              <p>No pending rider applications.</p>
            ) : (
              pendingRiders.map((user) => (
                <UserAccessCard
                  key={user.id}
                  user={user}
                  setUserBlocked={setUserBlocked}
                  updateRiderApproval={updateRiderApproval}
                  deleteRider={deleteRider}
                  showApprovalActions
                />
              ))
            )}
          </div>
        )}

        {page === "riders" && (
          <div style={card}>
            <SectionTitle
              title="Riders list"
              subtitle="Manage rider accounts, rider quality scores, and account access."
            />

            <div style={statsGrid}>
              <StatCard title="Total Riders" value={riders.length} />
              <StatCard title="Showing" value={filteredRiders.length} />
              <StatCard title="Pending Approval" value={pendingRiders.length} />
              <StatCard title="Approved Riders" value={approvedRiders.length} />
              <StatCard title="Rejected Riders" value={rejectedRiders.length} />
              <StatCard
                title="Blocked Riders"
                value={riders.filter((user) => !user.is_active).length}
              />
              <StatCard
                title="Rated Riders"
                value={riders.filter((user) => Number(user.rider_rating_count || 0) > 0).length}
              />
            </div>

            {filteredRiders.length === 0 ? (
              <p>No riders found.</p>
            ) : (
              filteredRiders.map((user) => (
                <UserAccessCard
                  key={user.id}
                  user={user}
                  setUserBlocked={setUserBlocked}
                  updateRiderApproval={updateRiderApproval}
                  deleteRider={deleteRider}
                  showApprovalActions
                />
              ))
            )}

          </div>
        )}

        {page === "drivers" && (() => {
          const taxiProfiles = filteredDriverProfiles.filter((d) => !d.is_courier);
          const courierProfiles = filteredDriverProfiles.filter((d) => d.is_courier);
          const shownProfiles = driverTab === "taxi" ? taxiProfiles : courierProfiles;
          return (
            <div style={card}>
              <SectionTitle
                title="Drivers"
                subtitle="Manage driver accounts, approval status, and access. Switch tabs to separate taxi drivers from delivery couriers."
              />

              {/* Taxi / Courier tab switcher */}
              <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
                <button
                  type="button"
                  onClick={() => setDriverTab("taxi")}
                  style={{
                    ...refreshButtonStyle,
                    background: driverTab === "taxi"
                      ? "linear-gradient(135deg, #6366f1, #4f46e5)"
                      : "rgba(99,102,241,0.15)",
                    color: driverTab === "taxi" ? "#fff" : "#a5b4fc",
                    border: "1.5px solid #6366f1",
                  }}
                >
                  🚗 Taxi Drivers ({taxiProfiles.length})
                </button>
                <button
                  type="button"
                  onClick={() => setDriverTab("courier")}
                  style={{
                    ...refreshButtonStyle,
                    background: driverTab === "courier"
                      ? "linear-gradient(135deg, #f59e0b, #d97706)"
                      : "rgba(245,158,11,0.15)",
                    color: driverTab === "courier" ? "#fff" : "#fcd34d",
                    border: "1.5px solid #f59e0b",
                  }}
                >
                  📦 Delivery Couriers ({courierProfiles.length})
                </button>
              </div>

              <div style={statsGrid}>
                <StatCard title={driverTab === "taxi" ? "Taxi Drivers" : "Delivery Couriers"} value={shownProfiles.length} />
                <StatCard title="Online" value={shownProfiles.filter((d) => d.is_available).length} />
                <StatCard title="Pending" value={shownProfiles.filter((d) => d.status === "pending").length} />
                <StatCard title="Blocked" value={shownProfiles.filter((d) => !d.is_active).length} />
              </div>

              <h2 style={subHeadingStyle}>
                {driverTab === "taxi" ? "Taxi Drivers" : "Delivery Couriers"}
              </h2>
              {shownProfiles.length === 0 ? (
                <p style={{ color: "#94a3b8" }}>No {driverTab === "taxi" ? "taxi drivers" : "delivery couriers"} found.</p>
              ) : (
                shownProfiles.map((driver) => (
                  <DriverInfoCard
                    key={driver.id}
                    driver={driver}
                    relatedUser={usersById.get(Number(driver.user_id))}
                    getFileUrl={getFileUrl}
                    setUserBlocked={setUserBlocked}
                    approveDriver={approveDriver}
                    rejectDriver={rejectDriver}
                    updateDriverCategory={updateDriverCategory}
                    reintegrateDriver={reintegrateDriver}
                    deleteDriver={deleteDriver}
                    driverCategories={DRIVER_CATEGORIES}
                  />
                ))
              )}
            </div>
          );
        })()}

        {page === "deliveries" && (
          <div style={card}>
            <SectionTitle
              title="Yala Delivery"
              subtitle="Orders, couriers, merchants, revenue, and approvals."
            />
            <DeliveryAdminPanel embedded />
          </div>
        )}

        {page === "rides" && (
          <div style={card}>
            <SectionTitle title="Ride dispatch" subtitle="Watch active and historic trip activity. Use Cancel to force-cancel a pending ride." />

            <div style={liveOpsStripStyle}>
              <PremiumMetric title="Waiting requests" value={pendingRideRequests.length} tone="amber" />
              <PremiumMetric title="Driver arriving" value={driverArrivingRides.length} tone="blue" />
              <PremiumMetric title="In progress" value={inProgressRides.length} tone="green" />
              <PremiumMetric title="Completed" value={completedRides.length} tone="gold" />
            </div>

            <h2 style={subHeadingStyle}>Live active rides</h2>
            <LiveRidesList
              rides={activeRides}
              onCancelRide={(rideId) => setCancelRide({ rideId, reason: "" })}
            />

            <h2 style={subHeadingStyle}>All rides</h2>

            {filteredRides.length === 0 ? (
              <p>No rides found.</p>
            ) : (
              filteredRides.map((ride) => {
                const cancellable = !["cancelled", "completed", "in_progress", "rider_no_show"].includes(ride.status);
                return (
                  <div key={ride.id} style={{ ...listCard, position: "relative" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "8px" }}>
                      <div>
                        <p style={{ margin: "0 0 4px" }}><b>Ride #{ride.id}</b> &nbsp;
                          <span style={{
                            fontSize: "11px", fontWeight: 700, padding: "2px 8px",
                            borderRadius: "999px",
                            background: ride.status === "in_progress" ? "#166534" : ride.status === "completed" ? "#1e3a5f" : ride.status === "cancelled" ? "#450a0a" : ride.status === "rider_no_show" ? "#7c2d12" : "#713f12",
                            color: ride.status === "in_progress" ? "#86efac" : ride.status === "completed" ? "#93c5fd" : ride.status === "cancelled" ? "#fca5a5" : ride.status === "rider_no_show" ? "#fdba74" : "#fde68a",
                          }}>{ride.status}</span>
                        </p>
                        <p style={{ margin: "2px 0", fontSize: "13px", color: "#94a3b8" }}>
                          {ride.pickup} → {ride.destination}
                        </p>
                      </div>
                      {cancellable && (
                        <button
                          type="button"
                          onClick={() => setCancelRide({ rideId: ride.id, reason: "" })}
                          style={{
                            padding: "6px 14px", borderRadius: "8px", border: "1.5px solid #ef4444",
                            background: "rgba(239,68,68,0.1)", color: "#f87171",
                            fontWeight: 700, fontSize: "12px", cursor: "pointer",
                          }}
                        >
                          Cancel Ride
                        </button>
                      )}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "4px 12px", marginTop: "8px" }}>
                      <p style={{ margin: 0, fontSize: "13px" }}><b>Distance:</b> {ride.distance_km || 0} km</p>
                      <p style={{ margin: 0, fontSize: "13px" }}><b>Fare:</b> {formatMoney(ride.fare)}</p>
                      <p style={{ margin: 0, fontSize: "13px" }}><b>App Fee:</b> {formatMoney(ride.app_fee)}</p>
                      <p style={{ margin: 0, fontSize: "13px" }}><b>Tip:</b> {formatMoney(ride.payment_tip_amount)}</p>
                      <p style={{ margin: 0, fontSize: "13px" }}><b>Driver Earning:</b> {formatMoney(ride.driver_earning)}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {page === "emergency" && (
          <div style={card}>
            <SafetyAdminPanel />
          </div>
        )}

        {page === "vehicles" && (
          <div style={card}>
            <SectionTitle title="Vehicle management" subtitle="Review car type, plate, registration, and insurance." />

            {filteredDriverProfiles.length === 0 ? (
              <p>No vehicles found.</p>
            ) : (
              filteredDriverProfiles.map((driver) => (
                <div key={driver.id} style={listCard}>
                  <p>
                    <b>Driver:</b> {driver.driver_name || "N/A"}
                  </p>

                  <p>
                    <b>Vehicle:</b> {driver.vehicle_make} {driver.vehicle_model}
                  </p>

                  <p>
                    <b>Type:</b> {driver.car_type}
                  </p>

                  <p>
                    <b>Color:</b> {driver.vehicle_color || "N/A"}
                  </p>

                  <p>
                    <b>Plate:</b> {driver.vehicle_plate}
                  </p>
                  {driver.document_rejection_reason && (
                    <p style={documentStatusStyle("expired")}>
                      {driver.document_rejection_reason}
                    </p>
                  )}

                  {driver.license_file && (
                    <p>
                      <a
                        href={getFileUrl(driver.license_file)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View Driver License
                      </a>
                    </p>
                  )}
                  <p>
                    <b>License issue date:</b> {driver.license_issued_at || "Missing"}
                  </p>
                  <p>
                    <b>License expiration:</b>{" "}
                    <span style={documentStatusStyle(driver.license_status)}>
                      {formatDocumentStatus(driver.license_status)}
                    </span>
                    {driver.license_expires_at ? ` · ${driver.license_expires_at}` : ""}
                  </p>

                  {driver.vehicle_registration && (
                    <p>
                      <a
                        href={getFileUrl(driver.vehicle_registration)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View Carte Grise
                      </a>
                    </p>
                  )}
                  <p>
                    <b>Carte Grise expiration:</b>{" "}
                    <span style={documentStatusStyle(driver.vehicle_registration_status)}>
                      {formatDocumentStatus(driver.vehicle_registration_status)}
                    </span>
                    {driver.vehicle_registration_expires_at
                      ? ` · ${driver.vehicle_registration_expires_at}`
                      : ""}
                  </p>

                  {driver.insurance_document && (
                    <p>
                      <a
                        href={getFileUrl(driver.insurance_document)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View Insurance Document
                      </a>
                    </p>
                  )}
                  <p>
                    <b>Insurance expiration:</b>{" "}
                    <span style={documentStatusStyle(driver.insurance_status)}>
                      {formatDocumentStatus(driver.insurance_status)}
                    </span>
                    {driver.insurance_expires_at ? ` · ${driver.insurance_expires_at}` : ""}
                  </p>
                  {driver.vignette_document && (
                    <p>
                      <a
                        href={getFileUrl(driver.vignette_document)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View Vignette
                      </a>
                    </p>
                  )}
                  <p>
                    <b>Vignette expiration:</b>{" "}
                    <span style={documentStatusStyle(driver.vignette_status)}>
                      {formatDocumentStatus(driver.vignette_status)}
                    </span>
                    {driver.vignette_expires_at ? ` · ${driver.vignette_expires_at}` : ""}
                  </p>
                  <ReviewActions
                    approveLabel="Approve Driver"
                    rejectLabel="Reject Driver"
                    onApprove={() => approveDriver(driver.id)}
                    onReject={() => rejectDriver(driver.id)}
                    canApprove={driver.status !== "approved"}
                    canReject={driver.status !== "rejected"}
                  />
                </div>
              ))
            )}
          </div>
        )}

        {page === "payments" && (
          <div style={card}>
            <SectionTitle title="Payment management" subtitle="Track rider payments, platform commission, and driver earnings." />

            <div style={statsGrid}>
              <StatCard title="Paid Rides" value={paidRides.length} />
              <StatCard title="Unpaid Rides" value={unpaidRides.length} />
              <StatCard
                title="Total Revenue"
                value={formatMoney(totalRevenue)}
              />
              <StatCard
                title={`Owner Commission (${ownerCommissionPercent}%)`}
                value={formatMoney(platformCommission)}
              />
              <StatCard
                title="Driver Payouts"
                value={formatMoney(driverPayouts)}
              />
              <StatCard
                title="Owner Available"
                value={formatMoney(ownerPayoutSummary.owner_commission_balance)}
              />
            </div>

            <section style={ownerPayoutPanelStyle}>
              <div>
                <SectionTitle
                  title="Owner payout method"
                  subtitle={`Save where the platform owner receives the ${ownerPayoutSummary.owner_commission_percent}% commission.`}
                />

                {ownerPayoutSummary.methods.length === 0 ? (
                  <p style={accessMetaStyle}>No owner payout method saved yet.</p>
                ) : (
                  ownerPayoutSummary.methods.map((method) => (
                    <div key={method.id} style={ownerPayoutSavedStyle}>
                      <strong>{method.display_name}</strong>
                      <span>{method.payout_type.replace("_", " ")}</span>
                    </div>
                  ))
                )}
              </div>

              <form onSubmit={saveOwnerPayoutMethod} style={ownerPayoutFormStyle}>
                <label style={ownerPayoutFieldStyle}>
                  <span>Payout method</span>
                  <select
                    value={ownerPayoutForm.payout_type}
                    onChange={(event) => updateOwnerPayoutForm("payout_type", event.target.value)}
                    style={ownerPayoutInputStyle}
                  >
                    <option value="bank_account">Bank account</option>
                    <option value="bankily">Bankily</option>
                    <option value="masrvi">Masravi</option>
                    <option value="seddad">Seddad</option>
                  </select>
                </label>

                <label style={ownerPayoutFieldStyle}>
                  <span>Account holder name</span>
                  <input
                    value={ownerPayoutForm.account_holder_name}
                    onChange={(event) =>
                      updateOwnerPayoutForm("account_holder_name", event.target.value)
                    }
                    style={ownerPayoutInputStyle}
                    placeholder="Owner name"
                  />
                </label>

                {ownerPayoutForm.payout_type === "bank_account" ? (
                  <>
                    <label style={ownerPayoutFieldStyle}>
                      <span>Bank name</span>
                      <input
                        value={ownerPayoutForm.bank_name}
                        onChange={(event) => updateOwnerPayoutForm("bank_name", event.target.value)}
                        style={ownerPayoutInputStyle}
                        placeholder="Bank name"
                      />
                    </label>
                    <label style={ownerPayoutFieldStyle}>
                      <span>Account number / RIB</span>
                      <input
                        value={ownerPayoutForm.account_reference}
                        onChange={(event) =>
                          updateOwnerPayoutForm("account_reference", event.target.value)
                        }
                        style={ownerPayoutInputStyle}
                        placeholder="Account number or RIB"
                      />
                    </label>
                  </>
                ) : (
                  <>
                    <label style={ownerPayoutFieldStyle}>
                      <span>Phone number</span>
                      <input
                        value={ownerPayoutForm.phone_number}
                        onChange={(event) =>
                          updateOwnerPayoutForm("phone_number", event.target.value)
                        }
                        style={ownerPayoutInputStyle}
                        placeholder="Mobile money phone number"
                      />
                    </label>
                    <label style={ownerPayoutFieldStyle}>
                      <span>Wallet ID</span>
                      <input
                        value={ownerPayoutForm.wallet_id}
                        onChange={(event) => updateOwnerPayoutForm("wallet_id", event.target.value)}
                        style={ownerPayoutInputStyle}
                        placeholder="Optional wallet ID"
                      />
                    </label>
                  </>
                )}

                <button
                  type="submit"
                  disabled={ownerPayoutSaving}
                  style={ownerPayoutButtonStyle}
                >
                  {ownerPayoutSaving ? "Saving..." : "Save owner payout"}
                </button>
                {ownerPayoutMessage && (
                  <p style={ownerPayoutMessageStyle}>{ownerPayoutMessage}</p>
                )}
              </form>
            </section>
          </div>
        )}

        {page === "withdrawals" && (
          <div style={card}>
            <SectionTitle title="Withdrawal requests" subtitle="Approve driver payout requests when they are ready." />

            <div style={statsGrid}>
              <StatCard title="Total Requests" value={withdrawals.length} />
              <StatCard title="Pending" value={pendingWithdrawals.length} />
              <StatCard title="Approved" value={approvedWithdrawals.length} />
              <StatCard title="Rejected" value={rejectedWithdrawals.length} />
              <StatCard
                title="Total Requested"
                value={formatMoney(totalWithdrawRequested)}
              />
              <StatCard
                title="Total Approved"
                value={formatMoney(totalApprovedWithdrawals)}
              />
            </div>

            <h2 style={subHeadingStyle}>Requests list</h2>

            {filteredWithdrawals.length === 0 ? (
              <p>No withdrawal requests.</p>
            ) : (
              filteredWithdrawals.map((item) => (
                <div key={item.id} style={listCard}>
                  <p>
                    <b>Request ID:</b> {item.id}
                  </p>

                  <p>
                    <b>Driver:</b> {item.driver}
                  </p>

                  {item.driver_name && (
                    <p>
                      <b>Name:</b> {item.driver_name}
                    </p>
                  )}

                  <p>
                    <b>Payout:</b> {item.payout_method_display || "N/A"}
                  </p>

                  <p>
                    <b>Amount:</b> {formatMoney(item.amount)}
                  </p>

                  <p>
                    <b>Status:</b> {item.status}
                  </p>

                  {item.status === "pending" && (
                    <>
                      <button
                        style={approveButton}
                        onClick={() => approveWithdrawal(item.id)}
                      >
                        Approve ✅
                      </button>

                      <button
                        style={rejectButton}
                        onClick={() => rejectWithdrawal(item.id)}
                      >
                        Reject ❌
                      </button>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {page === "cities" && (
          <CityManagementPanel
            cities={cities}
            regions={regions}
            analytics={cityAnalytics}
            cityForm={cityForm}
            setCityForm={setCityForm}
            createCity={createCity}
          />
        )}

        {page === "performance" && (
          <DriverPerformancePanel performance={driverPerformance} />
        )}

        {page === "hall-of-fame" && (
          <div style={card}>
            <HallOfFameAdminPanel cities={cities} />
          </div>
        )}

        {page === "analytics" && (
          <AnalyticsDashboard mode="admin" />
        )}

        {page === "reports" && (
          <div style={card}>
            <SectionTitle
              title="Reports center"
              subtitle="Operational reports for safety, revenue, approvals, rides, and account health."
            />

            <ReportsSection
              riders={riders}
              drivers={platformDrivers}
              pendingDrivers={pendingDrivers}
              pendingRiders={pendingRiders}
              activeRides={activeRides}
              completedRides={completedRides}
              cancelledRides={cancelledRides}
              riderNoShowRides={riderNoShowRides}
              blockedUsers={blockedUsers}
              paidRides={paidRides}
              unpaidRides={unpaidRides}
              withdrawals={withdrawals}
              pendingWithdrawals={pendingWithdrawals}
              totalRevenue={totalRevenue}
              platformCommission={platformCommission}
              driverPayouts={driverPayouts}
              emergencyWatchList={emergencyWatchList}
            />
          </div>
        )}
      </div>

      {/* ── Admin cancel ride modal (Overview + Rides live lists) ─────── */}
      {cancelRide && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 9999,
          background: "rgba(0,0,0,0.65)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            background: "#1e293b", borderRadius: "18px",
            padding: "32px", minWidth: "340px", maxWidth: "420px", width: "90%",
            boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
          }}>
            <h3 style={{ color: "#f1f5f9", marginTop: 0 }}>Cancel Ride #{cancelRide.rideId}</h3>
            <p style={{ color: "#94a3b8", fontSize: "13px" }}>This action is irreversible. Provide a reason before confirming.</p>
            <textarea
              autoFocus
              rows={3}
              placeholder="Cancellation reason (required)"
              value={cancelRide.reason}
              onChange={(e) => setCancelRide((prev) => ({ ...prev, reason: e.target.value }))}
              style={{
                width: "100%", borderRadius: "10px", padding: "10px 12px",
                background: "#0f172a", border: "1.5px solid #334155",
                color: "#f1f5f9", fontSize: "14px", resize: "vertical", boxSizing: "border-box",
              }}
            />
            <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
              <button
                type="button"
                disabled={cancelRideLoading || !cancelRide.reason.trim()}
                onClick={handleAdminCancelRide}
                style={{
                  flex: 1, padding: "10px", borderRadius: "10px", border: "none",
                  background: cancelRide.reason.trim() ? "#ef4444" : "#475569",
                  color: "#fff", fontWeight: 700, cursor: cancelRide.reason.trim() ? "pointer" : "not-allowed",
                }}
              >
                {cancelRideLoading ? "Cancelling…" : "Confirm Cancel"}
              </button>
              <button
                type="button"
                onClick={() => setCancelRide(null)}
                style={{
                  flex: 1, padding: "10px", borderRadius: "10px", border: "1.5px solid #334155",
                  background: "transparent", color: "#94a3b8", fontWeight: 600, cursor: "pointer",
                }}
              >
                Keep Ride
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast notification ─────────────────────────────────────────── */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          zIndex: 9999, padding: "12px 22px", borderRadius: 10,
          background: toast.type === "error" ? "#991b1b" : "#14532d",
          color: "#fff", fontWeight: 700, fontSize: 14,
          boxShadow: "0 8px 32px rgba(0,0,0,0.45)",
          maxWidth: "90vw", textAlign: "center",
        }}>
          {toast.message}
        </div>
      )}

      {/* ── Confirm dialog ─────────────────────────────────────────────── */}
      {confirmDialog && (
        <div style={{ position: "fixed", inset: 0, zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.65)" }}>
          <div style={{ background: "#1e293b", border: "1px solid rgba(148,163,184,0.2)", borderRadius: 14, padding: "28px 24px", maxWidth: 400, width: "90vw", display: "grid", gap: 18 }}>
            <p style={{ color: "#e2e8f0", fontSize: 15, fontWeight: 600, margin: 0 }}>{confirmDialog}</p>
            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: "none", background: "#ef4444", color: "#fff", fontWeight: 700, cursor: "pointer" }}
                onClick={() => { setConfirmDialog(null); if (confirmResolveRef.current) { confirmResolveRef.current(true); confirmResolveRef.current = null; } }}>
                Confirm
              </button>
              <button type="button" style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: "1px solid rgba(148,163,184,0.3)", background: "transparent", color: "#cbd5e1", fontWeight: 700, cursor: "pointer" }}
                onClick={() => { setConfirmDialog(null); if (confirmResolveRef.current) { confirmResolveRef.current(false); confirmResolveRef.current = null; } }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Prompt dialog ──────────────────────────────────────────────── */}
      {promptDialog && (
        <div style={{ position: "fixed", inset: 0, zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.65)" }}>
          <div style={{ background: "#1e293b", border: "1px solid rgba(148,163,184,0.2)", borderRadius: 14, padding: "28px 24px", maxWidth: 420, width: "90vw", display: "grid", gap: 16 }}>
            <p style={{ color: "#e2e8f0", fontSize: 15, fontWeight: 600, margin: 0 }}>{promptDialog}</p>
            <textarea
              autoFocus
              value={promptValue}
              onChange={(e) => setPromptValue(e.target.value)}
              rows={3}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid rgba(148,163,184,0.3)", background: "#0f172a", color: "#e2e8f0", fontSize: 14, resize: "vertical", boxSizing: "border-box" }}
            />
            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: "none", background: "#2563eb", color: "#fff", fontWeight: 700, cursor: "pointer" }}
                onClick={() => { const v = promptValue; setPromptDialog(null); setPromptValue(""); if (promptResolveRef.current) { promptResolveRef.current(v); promptResolveRef.current = null; } }}>
                Submit
              </button>
              <button type="button" style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: "1px solid rgba(148,163,184,0.3)", background: "transparent", color: "#cbd5e1", fontWeight: 700, cursor: "pointer" }}
                onClick={() => { setPromptDialog(null); setPromptValue(""); if (promptResolveRef.current) { promptResolveRef.current(null); promptResolveRef.current = null; } }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DriverVerificationCard({
  driver,
  getFileUrl,
  approveDriver,
  rejectDriver,
}) {
  const missingDriverRequirements = getDriverApprovalMissingItems(driver);
  const canApproveDriver = driver.status !== "approved";

  return (
    <div style={verificationCard}>
      <div style={profilePhotoColumnStyle}>
        {driver.driver_photo ? (
          <img
            src={getFileUrl(driver.driver_photo)}
            alt="Driver"
            style={driverPhoto}
          />
        ) : (
          <div style={placeholderPhoto}>DR</div>
        )}
      </div>

      <div style={reviewContentStyle}>
        <div style={reviewHeaderStyle}>
          <div>
            <span style={sectionKickerStyle}>Driver application</span>
            <h2 style={reviewTitleStyle}>{driver.driver_name || "Driver Name"}</h2>
            <p style={accessMetaStyle}>{driver.driver_email || "No email"}</p>
          </div>
          <StatusBadge label={driver.status || "pending"} />
        </div>

        <div style={detailGridStyle}>
          <DetailItem label="Phone" value={driver.phone_number || "N/A"} />
          <DetailItem
            label="Vehicle"
            value={`${driver.vehicle_make || ""} ${driver.vehicle_model || ""}`.trim() || "N/A"}
          />
          <DetailItem label="Type" value={driver.car_type || "N/A"} />
          <DetailItem label="Color" value={driver.vehicle_color || "N/A"} />
          <DetailItem label="Plate" value={driver.vehicle_plate || "N/A"} />
        </div>

        <div style={documentLinks}>
          {driver.vehicle_registration && (
            <a
              href={getFileUrl(driver.vehicle_registration)}
              target="_blank"
              rel="noreferrer"
              style={documentButton}
            >
              View Carte Grise
            </a>
          )}

          {driver.insurance_document && (
            <a
              href={getFileUrl(driver.insurance_document)}
              target="_blank"
              rel="noreferrer"
              style={documentButton}
            >
              View Insurance
            </a>
          )}
          {driver.license_file && (
            <a
              href={getFileUrl(driver.license_file)}
              target="_blank"
              rel="noreferrer"
              style={documentButton}
            >
              View Driver License
            </a>
          )}
          {driver.vignette_document && (
            <a
              href={getFileUrl(driver.vignette_document)}
              target="_blank"
              rel="noreferrer"
              style={documentButton}
            >
              View Vignette
            </a>
          )}
        </div>

        <RequirementChecklist
          title="Missing requirements"
          missingItems={missingDriverRequirements}
        />

        <ReviewActions
          approveLabel="Approve Driver"
          rejectLabel="Reject Driver"
          onApprove={() => approveDriver(driver.id)}
          onReject={() => rejectDriver(driver.id)}
          canApprove={canApproveDriver}
          canReject={driver.status !== "rejected"}
        />
      </div>
    </div>
  );
}

function CityManagementPanel({
  cities,
  regions,
  analytics,
  cityForm,
  setCityForm,
  createCity,
}) {
  const rows = Array.isArray(analytics.cities) ? analytics.cities : [];
  const cityStats = new Map(rows.map((row) => [row.city_id, row]));

  return (
    <div style={performanceLayoutStyle}>
      <div style={reportsHeroStyle}>
        <div>
          <span style={opsKickerStyle}>Mauritania expansion</span>
          <h2 style={reportsHeroTitleStyle}>City Management</h2>
          <p style={opsSubtitleStyle}>
            Manage regions, cities, pricing coverage, and operating analytics for every
            Yala market without changing application code.
          </p>
        </div>
        <StatusBadge label={`${cities.length} cities`} />
      </div>

      <div style={premiumMetricGridStyle}>
        <PremiumMetric title="Total cities" value={cities.length} tone="blue" />
        <PremiumMetric title="Regions" value={regions.length} tone="gold" />
        <PremiumMetric title="City rides" value={analytics.summary?.rides || 0} tone="green" />
        <PremiumMetric title="City revenue" value={formatMoney(analytics.summary?.revenue || 0)} tone="amber" />
      </div>

      <div style={cityManagementGridStyle}>
        <form style={ownerPayoutFormStyle} onSubmit={createCity}>
          <h3 style={reportTitleStyle}>Add city</h3>
          <label style={ownerPayoutFieldStyle}>
            Region
            <select
              style={ownerPayoutInputStyle}
              value={cityForm.region}
              onChange={(event) =>
                setCityForm((current) => ({ ...current, region: event.target.value }))
              }
            >
              <option value="">Select region</option>
              {regions.map((region) => (
                <option key={region.id} value={region.id}>
                  {region.name}
                </option>
              ))}
            </select>
          </label>
          <label style={ownerPayoutFieldStyle}>
            City name
            <input
              style={ownerPayoutInputStyle}
              value={cityForm.name}
              onChange={(event) =>
                setCityForm((current) => ({ ...current, name: event.target.value }))
              }
              placeholder="Example: Nbeika"
            />
          </label>
          <button type="submit" style={ownerPayoutButtonStyle}>
            Add city
          </button>
        </form>

        <div style={performanceTableStyle}>
          {cities.map((city) => {
            const stats = cityStats.get(city.id) || {};
            return (
              <article key={city.id} style={cityRowStyle}>
                <div>
                  <h3 style={emergencyItemTitleStyle}>{city.name}</h3>
                  <p style={accessMetaStyle}>{city.region_name}</p>
                </div>
                <div style={performanceMetricsStyle}>
                  <DetailItem label="Rides" value={stats.rides || 0} />
                  <DetailItem label="Revenue" value={formatMoney(stats.revenue || 0)} />
                  <DetailItem label="Drivers" value={stats.active_drivers || 0} />
                  <DetailItem label="Riders" value={stats.active_riders || 0} />
                  <DetailItem label="Pricing" value={`${city.pricing?.length || 0} types`} />
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DriverPerformancePanel({ performance }) {
  const drivers = Array.isArray(performance.drivers) ? performance.drivers : [];
  const bandColor = (band) => {
    if (band === "excellent") return "#22c55e";
    if (band === "strong") return "#38bdf8";
    if (band === "watch") return "#f59e0b";
    return "#ef4444";
  };

  return (
    <div style={performanceLayoutStyle}>
      <div style={reportsHeroStyle}>
        <div>
          <span style={opsKickerStyle}>Driver performance</span>
          <h2 style={reportsHeroTitleStyle}>Performance Score Center</h2>
          <p style={opsSubtitleStyle}>
            Track acceptance, cancellations, ratings, completed rides, and on-time
            arrivals so dispatch decisions are based on real operating quality.
          </p>
        </div>
        <StatusBadge label={`${performance.average_score || 0} avg score`} />
      </div>

      <div style={premiumMetricGridStyle}>
        <PremiumMetric title="Average score" value={performance.average_score || 0} tone="blue" />
        <PremiumMetric title="Excellent drivers" value={performance.excellent_count || 0} tone="green" />
        <PremiumMetric title="Watch list" value={performance.watch_count || 0} tone="red" />
        <PremiumMetric title="Drivers scored" value={performance.driver_count || 0} tone="gold" />
      </div>

      {drivers.length === 0 ? (
        <div style={emptyStateStyle}>
          <strong>No driver performance data yet.</strong>
          <span>Completed rides, ratings, and arrivals will appear after drivers start operating.</span>
        </div>
      ) : (
        <div style={performanceTableStyle}>
          {drivers.map((driver) => (
            <article key={driver.driver_id} style={performanceRowStyle}>
              <div style={performanceScoreStyle}>
                <strong>{driver.score}</strong>
                <span style={{ ...performanceBandStyle, background: bandColor(driver.score_band) }}>
                  {driver.score_band}
                </span>
              </div>

              <div style={performanceDriverStyle}>
                <h3 style={emergencyItemTitleStyle}>{driver.driver_name}</h3>
                <p style={accessMetaStyle}>{driver.driver_email}</p>
                <p style={reviewHintStyle}>{driver.recommendation}</p>
              </div>

              <div style={performanceMetricsStyle}>
                <DetailItem label="Acceptance" value={`${driver.acceptance_rate}%`} />
                <DetailItem label="Perf. points" value={driver.performance_points ?? "—"} />
                <DetailItem label="Missed" value={driver.missed_rides ?? 0} />
                <DetailItem label="Cancelled" value={driver.cancelled_rides ?? 0} />
                <DetailItem label="Cancellation" value={`${driver.cancellation_rate}%`} />
                <DetailItem label="Rating" value={`${driver.rating_average}/5`} />
                <DetailItem label="Completed" value={driver.completed_rides} />
                <DetailItem label="On time" value={`${driver.on_time_rate}%`} />
                <DetailItem
                  label="Risk"
                  value={
                    driver.account_risk_flag || driver.account_under_review
                      ? "At risk"
                      : "OK"
                  }
                />
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function PremiumMetric({ title, value, tone = "blue" }) {
  const toneStyle = premiumMetricToneStyles[tone] || premiumMetricToneStyles.blue;

  return (
    <div style={{ ...premiumMetricStyle, ...toneStyle }}>
      <span>{title}</span>
      <strong>{value}</strong>
    </div>
  );
}

function RideAnalyticsPanel({
  completed,
  cancelled,
  active,
  pending,
  completionRate,
  cancellationRate,
}) {
  const rows = [
    { label: "Completed", value: completed, tone: "#38bdf8" },
    { label: "Active", value: active, tone: ADMIN_BLUE },
    { label: "Waiting", value: pending, tone: "#f59e0b" },
    { label: "Cancelled", value: cancelled, tone: "#ef4444" },
  ];
  const maxValue = Math.max(...rows.map((item) => Number(item.value || 0)), 1);

  return (
    <div style={analyticsPanelStyle}>
      <div style={analyticsPanelHeaderStyle}>
        <div>
          <span style={sectionKickerStyle}>Ride analytics</span>
          <h3 style={analyticsPanelTitleStyle}>Trip health</h3>
        </div>
        <StatusBadge label={`${completionRate}% complete`} />
      </div>

      <div style={analyticsBarListStyle}>
        {rows.map((item) => (
          <div key={item.label} style={analyticsBarRowStyle}>
            <span>{item.label}</span>
            <div style={analyticsBarTrackStyle}>
              <div
                style={{
                  ...analyticsBarFillStyle,
                  width: `${Math.max(8, (item.value / maxValue) * 100)}%`,
                  background: item.tone,
                }}
              />
            </div>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>

      <div style={analyticsSplitStyle}>
        <DetailItem label="Completion rate" value={`${completionRate}%`} />
        <DetailItem label="Cancellation rate" value={`${cancellationRate}%`} />
      </div>
    </div>
  );
}

function RevenueAnalyticsPanel({
  totalRevenue,
  platformCommission,
  driverPayouts,
  averageFare,
}) {
  const maxValue = Math.max(totalRevenue, platformCommission, driverPayouts, averageFare, 1);
  const rows = [
    { label: "Total revenue", value: totalRevenue, tone: "#f59e0b" },
    { label: "Owner commission", value: platformCommission, tone: "#38bdf8" },
    { label: "Driver earnings", value: driverPayouts, tone: ADMIN_BLUE },
    { label: "Average fare", value: averageFare, tone: "#a855f7" },
  ];

  return (
    <div style={analyticsPanelStyle}>
      <div style={analyticsPanelHeaderStyle}>
        <div>
          <span style={sectionKickerStyle}>Revenue analytics</span>
          <h3 style={analyticsPanelTitleStyle}>Money flow</h3>
        </div>
        <StatusBadge label="MRU" />
      </div>

      <div style={revenueBarsStyle}>
        {rows.map((item) => (
          <div key={item.label} style={revenueBarItemStyle}>
            <div style={revenueBarColumnStyle}>
              <span
                style={{
                  ...revenueBarFillStyle,
                  height: `${Math.max(10, (Number(item.value || 0) / maxValue) * 100)}%`,
                  background: item.tone,
                }}
              />
            </div>
            <strong>{formatMoney(item.value)}</strong>
            <small>{item.label}</small>
          </div>
        ))}
      </div>
    </div>
  );
}

function LiveRidesList({ rides, onCancelRide }) {
  if (rides.length === 0) {
    return (
      <div style={emptyStateStyle}>
        <strong>No active rides right now.</strong>
        <span>New requests, driver arrival, and in-progress trips will appear here.</span>
      </div>
    );
  }

  return (
    <div style={liveRideGridStyle}>
      {rides.slice(0, 8).map((ride) => {
        const cancellable = !["cancelled", "completed", "in_progress", "rider_no_show"].includes(ride.status);
        return (
          <article key={ride.id} style={liveRideCardStyle}>
            <div style={liveRideHeaderStyle}>
              <div>
                <span style={sectionKickerStyle}>Ride #{ride.id}</span>
                <h3 style={liveRideTitleStyle}>{ride.status}</h3>
              </div>
              <StatusBadge label={ride.payment_status || "payment"} />
            </div>

            <div style={detailGridStyle}>
              <DetailItem label="Pickup" value={ride.pickup || "N/A"} />
              <DetailItem label="Destination" value={ride.destination || "N/A"} />
              <DetailItem label="Fare" value={formatMoney(ride.fare)} />
              <DetailItem label="Distance" value={`${ride.distance_km || 0} KM`} />
            </div>

            <p style={accessMetaStyle}>
              Rider: {ride.rider_name || ride.rider_email || "N/A"} · Driver:{" "}
              {ride.driver_name || ride.driver_email || "Unassigned"}
            </p>

            {cancellable && typeof onCancelRide === "function" ? (
              <button
                type="button"
                onClick={() => onCancelRide(ride.id)}
                style={{
                  marginTop: "12px",
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: "10px",
                  border: "1.5px solid #ef4444",
                  background: "rgba(239,68,68,0.12)",
                  color: "#f87171",
                  fontWeight: 700,
                  fontSize: "12px",
                  cursor: "pointer",
                }}
              >
                Cancel Ride
              </button>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

function EmergencyMonitor({ items, activeRides, blockedUsers }) {
  return (
    <div style={emergencyLayoutStyle}>
      <div style={emergencyContactGridStyle}>
        {MARKET.emergencyNumbers.map((contact) => (
          <a
            key={contact.number}
            href={`tel:${contact.number}`}
            style={emergencyContactCardStyle}
          >
            <span>{contact.label}</span>
            <strong>{contact.number}</strong>
            <small>{contact.description}</small>
          </a>
        ))}
      </div>

      <div style={premiumMetricGridStyle}>
        <PremiumMetric title="Active rides watched" value={activeRides} tone="blue" />
        <PremiumMetric title="Blocked accounts" value={blockedUsers} tone="red" />
        <PremiumMetric title="Emergency contacts" value={MARKET.emergencyNumbers.length} tone="gold" />
      </div>

      <div style={emergencyWatchListStyle}>
        {items.length === 0 ? (
          <div style={emptyStateStyle}>
            <strong>No emergency items.</strong>
            <span>Active trips and blocked-account reviews will appear here.</span>
          </div>
        ) : (
          items.map((item) => (
            <article key={item.id} style={emergencyItemStyle}>
              <span style={{ ...severityDotStyle, ...severityToneStyle(item.severity) }} />
              <div>
                <h3 style={emergencyItemTitleStyle}>{item.title}</h3>
                <p style={accessMetaStyle}>{item.detail}</p>
              </div>
              <StatusBadge label={item.status} />
            </article>
          ))
        )}
      </div>
    </div>
  );
}

function ReportsSection({
  riders,
  drivers,
  pendingDrivers,
  pendingRiders,
  activeRides,
  completedRides,
  cancelledRides,
  riderNoShowRides = [],
  blockedUsers,
  paidRides,
  unpaidRides,
  withdrawals,
  pendingWithdrawals,
  totalRevenue,
  platformCommission,
  driverPayouts,
  emergencyWatchList,
}) {
  const reportCards = [
    {
      title: "Marketplace summary",
      tone: "blue",
      rows: [
        ["Total riders", riders.length],
        ["Total drivers", drivers.length],
        ["Active rides", activeRides.length],
        ["Completed rides", completedRides.length],
      ],
    },
    {
      title: "Driver approval system",
      tone: "amber",
      rows: [
        ["Pending drivers", pendingDrivers.length],
        ["Pending riders", pendingRiders.length],
        ["Blocked accounts", blockedUsers.length],
        ["Pending withdrawals", pendingWithdrawals.length],
      ],
    },
    {
      title: "Earnings analytics",
      tone: "gold",
      rows: [
        ["Total revenue", formatMoney(totalRevenue)],
        ["Yala fee", formatMoney(platformCommission)],
        ["Driver earnings", formatMoney(driverPayouts)],
        ["Withdrawals", withdrawals.length],
      ],
    },
    {
      title: "Payment report",
      tone: "green",
      rows: [
        ["Paid rides", paidRides.length],
        ["Unpaid rides", unpaidRides.length],
        ["Cancelled rides", cancelledRides.length],
        ["Rider no-shows", riderNoShowRides.length],
        ["Payment risk", unpaidRides.length + cancelledRides.length],
      ],
    },
    {
      title: "Emergency alerts",
      tone: "red",
      rows: [
        ["Watch list", emergencyWatchList.length],
        ["Active rides watched", activeRides.length],
        ["Blocked users", blockedUsers.length],
        ["Emergency contacts", MARKET.emergencyNumbers.length],
      ],
    },
  ];

  return (
    <div style={reportsLayoutStyle}>
      <div style={reportsHeroStyle}>
        <div>
          <span style={opsKickerStyle}>Live reports</span>
          <h2 style={reportsHeroTitleStyle}>Yala operating report</h2>
          <p style={opsSubtitleStyle}>
            Review marketplace health before approving drivers, responding to emergencies,
            and reconciling platform earnings.
          </p>
        </div>
        <StatusBadge label={`${emergencyWatchList.length} alerts`} />
      </div>

      <div style={reportsGridStyle}>
        {reportCards.map((report) => (
          <article key={report.title} style={reportCardStyle}>
            <div style={reportHeaderStyle}>
              <span style={{ ...severityDotStyle, ...reportToneStyle(report.tone) }} />
              <h3 style={reportTitleStyle}>{report.title}</h3>
            </div>
            <div style={reportRowsStyle}>
              {report.rows.map(([label, value]) => (
                <DetailItem key={label} label={label} value={value} />
              ))}
            </div>
          </article>
        ))}
      </div>

      <div style={reportActionBarStyle}>
        <button type="button" style={refreshButtonStyle} onClick={() => window.print()}>
          Print report
        </button>
        <button
          type="button"
          style={neutralButtonStyle}
          onClick={() => (window.location.href = "/support")}
        >
          Open support process
        </button>
      </div>

      {/* Rider no-show records */}
      {riderNoShowRides.length > 0 && (
        <div style={{ marginTop: "28px" }}>
          <h3 style={reportTitleStyle}>Rider no-show records</h3>
          <div style={{ display: "grid", gap: "10px", marginTop: "14px" }}>
            {riderNoShowRides.slice(0, 15).map((ride) => {
              const evidence = ride.no_show_evidence || {};
              return (
                <div key={`noshow-${ride.id}`} style={{ ...reportCardStyle, padding: "14px 18px", borderLeft: "3px solid #f59e0b" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                    <div>
                      <strong style={{ color: ADMIN_TEXT_PRIMARY, fontSize: "14px" }}>Ride #{ride.id}</strong>
                      <span style={{ color: ADMIN_TEXT_SECONDARY, fontSize: "12px", marginLeft: "10px" }}>
                        {ride.pickup} → {ride.destination}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                      <span
                        style={{
                          background: "#451a03",
                          color: "#fdba74",
                          padding: "4px 10px",
                          borderRadius: "999px",
                          fontSize: "11px",
                          fontWeight: 700,
                        }}
                      >
                        rider_no_show
                      </span>
                      {Number(ride.no_show_fee) > 0 && (
                        <span style={{ background: ADMIN_DANGER_BG, color: "#991b1b", padding: "4px 10px", borderRadius: "999px", fontSize: "11px", fontWeight: 700 }}>
                          Rider fee {ride.no_show_fee} MRU
                        </span>
                      )}
                      {Number(ride.no_show_driver_compensation) > 0 && (
                        <span style={{ background: "#052e16", color: "#86efac", padding: "4px 10px", borderRadius: "999px", fontSize: "11px", fontWeight: 700 }}>
                          Driver +{ride.no_show_driver_compensation} MRU
                        </span>
                      )}
                    </div>
                  </div>
                  <p style={{ margin: "8px 0 0", color: "#cbd5e1", fontSize: "13px" }}>
                    Rider: {ride.rider_name || ride.rider_email || "N/A"} · Driver: {ride.driver_name || ride.driver_email || "N/A"}
                  </p>
                  <p style={{ margin: "4px 0 0", color: "#94a3b8", fontSize: "12px" }}>
                    Waited {evidence.waited_seconds != null ? `${evidence.waited_seconds}s` : "—"}
                    {evidence.distance_to_pickup_m != null ? ` · ${evidence.distance_to_pickup_m}m from pickup` : ""}
                    {evidence.device_id ? ` · device ${String(evidence.device_id).slice(0, 12)}` : ""}
                    {ride.cancelled_at ? ` · ${new Date(ride.cancelled_at).toLocaleString()}` : ""}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Cancellation Details */}
      {cancelledRides.length > 0 && (
        <div style={{ marginTop: "28px" }}>
          <h3 style={reportTitleStyle}>Recent Cancellations</h3>
          <div style={{ display: "grid", gap: "10px", marginTop: "14px" }}>
            {cancelledRides.slice(0, 10).map((ride) => (
              <div key={ride.id} style={{ ...reportCardStyle, padding: "14px 18px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                  <div>
                    <strong style={{ color: ADMIN_TEXT_PRIMARY, fontSize: "14px" }}>Ride #{ride.id}</strong>
                    <span style={{ color: ADMIN_TEXT_SECONDARY, fontSize: "12px", marginLeft: "10px" }}>
                      {ride.pickup} → {ride.destination}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    {(ride.is_rider_no_show || ride.status === "rider_no_show") && (
                      <span
                        style={{
                          background: "#451a03",
                          color: "#fdba74",
                          padding: "4px 10px",
                          borderRadius: "999px",
                          fontSize: "11px",
                          fontWeight: 700,
                        }}
                      >
                        no-show
                      </span>
                    )}
                    {ride.cancelled_by && (
                      <span
                        style={{
                          ...cancellationActorPillStyle(ride.cancelled_by),
                          padding: "4px 10px",
                          borderRadius: "999px",
                          fontSize: "11px",
                          fontWeight: 700,
                        }}
                      >
                        {ride.cancelled_by}
                      </span>
                    )}
                    {Number(ride.cancellation_fee) > 0 && (
                      <span
                        style={{
                          background: ADMIN_DANGER_BG,
                          color: "#991b1b",
                          padding: "4px 10px",
                          borderRadius: "999px",
                          fontSize: "11px",
                          fontWeight: 700,
                        }}
                      >
                        {ride.cancellation_fee} MRU fee
                      </span>
                    )}
                  </div>
                </div>
                {ride.cancellation_reason && (
                  <p style={{ margin: "8px 0 0", color: "#cbd5e1", fontSize: "13px" }}>
                    Reason: {ride.cancellation_reason}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function reportToneStyle(tone) {
  if (tone === "red") return { background: "#ef4444" };
  if (tone === "amber") return { background: "#f59e0b" };
  if (tone === "gold") return { background: "#fbbf24" };
  if (tone === "green") return { background: ADMIN_BLUE };
  return { background: ADMIN_BLUE };
}

function severityToneStyle(severity) {
  if (severity === "high") return { background: "#ef4444" };
  if (severity === "medium") return { background: "#f59e0b" };
  if (severity === "low") return { background: ADMIN_BLUE };
  return { background: ADMIN_BLUE };
}

function cancellationActorPillStyle(cancelledBy) {
  if (cancelledBy === "rider") {
    return { background: "#fef3c7", color: "#92400e" };
  }
  if (cancelledBy === "driver") {
    return { background: ADMIN_DANGER_BG, color: "#991b1b" };
  }
  return { background: "#e0e7ff", color: "#3730a3" };
}

function boolPillStyle(isPositive) {
  return isPositive
    ? { background: ADMIN_SUCCESS_BG, color: ADMIN_SUCCESS_TEXT }
    : { background: ADMIN_WARNING_BG, color: ADMIN_WARNING_TEXT };
}

function UserAccessCard({
  user,
  setUserBlocked,
  updateRiderApproval,
  deleteRider,
  showApprovalActions = false,
}) {
  const isRiderAccount =
    (user.is_rider || user.user_type === "rider") && !user.is_staff;
  const isRider =
    isRiderAccount && !(user.is_driver || user.user_type === "driver");
  const riderRequirementChecks = [
    { label: "Profile photo", ok: Boolean(user.has_profile_picture || user.profile_picture) },
    { label: "National ID document", ok: Boolean(user.has_national_id_document || user.national_id_document) },
    { label: "National ID number", ok: Boolean(user.national_id_number) },
    { label: "Phone number", ok: Boolean(user.phone_number) },
    { label: "Verified phone number", ok: Boolean(user.phone_verified) },
  ];
  const missingRiderRequirements = riderRequirementChecks
    .filter((item) => !item.ok)
    .map((item) => item.label);

  const canApproveRider =
    isRider && user.rider_status !== "approved";
  const canRejectRider = isRider && user.rider_status !== "rejected";

  return (
    <div style={accessCardStyle}>
      <div>
        <h3 style={accessTitleStyle}>{user.full_name || "User"}</h3>
        <p style={accessMetaStyle}>{user.email}</p>
        <div style={accessPillRowStyle}>
          <span style={rolePillStyle}>{user.is_driver ? "Driver" : "Rider"}</span>
          {isRider && (
            <span
              style={{
                ...rolePillStyle,
                background:
                  user.rider_status === "approved"
                    ? ADMIN_SUCCESS_BG
                    : user.rider_status === "rejected"
                      ? ADMIN_DANGER_BG
                      : ADMIN_WARNING_BG,
                color:
                  user.rider_status === "approved"
                    ? ADMIN_SUCCESS_TEXT
                    : user.rider_status === "rejected"
                      ? ADMIN_DANGER_TEXT
                      : ADMIN_WARNING_TEXT,
              }}
            >
              Rider {user.rider_status_label || user.rider_status || "Pending"}
            </span>
          )}
          <span style={rolePillStyle}>
            Driver score {Number(user.driver_average_rating || 0).toFixed(1)}
          </span>
          <span style={rolePillStyle}>
            Rider score {Number(user.rider_average_rating || 0).toFixed(1)}
          </span>
          <span
            style={{
              ...rolePillStyle,
              background: user.is_active ? ADMIN_SUCCESS_BG : ADMIN_DANGER_BG,
              color: user.is_active ? ADMIN_SUCCESS_TEXT : ADMIN_DANGER_TEXT,
            }}
          >
            {user.is_active ? "Active" : "Blocked"}
          </span>
          <span
            style={{
              ...rolePillStyle,
              ...boolPillStyle(Boolean(user.national_id_number && user.has_national_id_document)),
            }}
          >
            {user.national_id_number && user.has_national_id_document
              ? "National ID complete"
              : "National ID missing"}
          </span>
          <span style={rolePillStyle}>
            Since {user.member_since_year || "N/A"}
          </span>
          <span style={rolePillStyle}>
            {formatYearsUsingApp(user.years_using_app)}
          </span>
          <span style={rolePillStyle}>
            Phone {user.phone_verified ? "verified" : "not verified"}
          </span>
          {user.is_driver && user.driver_status && (
            <span style={rolePillStyle}>{user.driver_status}</span>
          )}
          {user.is_driver && user.driver_category_label && (
            <span style={rolePillStyle}>{user.driver_category_label}</span>
          )}
        </div>
        <p style={accessMetaStyle}>
          {user.is_driver
            ? `${user.driver_rating_count || 0} driver reviews`
            : `${user.rider_rating_count || 0} rider reviews`}
        </p>
        <p style={accessMetaStyle}>
          National ID: {user.national_id_number || "Not added"}
          {user.national_id_document && (
            <>
              {" · "}
              <a href={user.national_id_document} target="_blank" rel="noreferrer">
                View ID
              </a>
            </>
          )}
        </p>
        {user.rider_rejection_reason && (
          <p style={accessMetaStyle}>Rejection reason: {user.rider_rejection_reason}</p>
        )}
      </div>

      <div style={actionClusterStyle}>
        {showApprovalActions && isRider && (
          <RequirementChecklist
            title="Missing requirements"
            missingItems={missingRiderRequirements}
          />
        )}
        {showApprovalActions && isRider && (
          <ReviewActions
            approveLabel="Approve Rider"
            rejectLabel="Reject Rider"
            onApprove={() => updateRiderApproval(user.id, "approve")}
            onReject={() => updateRiderApproval(user.id, "reject")}
            canApprove={canApproveRider}
            canReject={canRejectRider}
          />
        )}

        <button
          style={user.is_active ? blockButtonStyle : unblockButtonStyle}
          onClick={() => setUserBlocked(user.id, user.is_active)}
        >
          {user.is_active ? "Block user" : "Unblock user"}
        </button>
        {isRiderAccount && (
          <button
            type="button"
            style={dangerSolidButtonStyle}
            onClick={() => deleteRider(user)}
          >
            🗑️ Delete Rider
          </button>
        )}
      </div>
    </div>
  );
}

function DriverInfoCard({
  driver,
  relatedUser,
  getFileUrl,
  setUserBlocked,
  approveDriver,
  rejectDriver,
  updateDriverCategory,
  reintegrateDriver,
  deleteDriver,
  driverCategories,
}) {
  const missingDriverRequirements = getDriverApprovalMissingItems(driver, relatedUser);

  const canApproveDriver = driver.status !== "approved";
  const canRejectDriver = driver.status !== "rejected";
  const uploadedDriverDocs = [
    driver.driver_photo,
    driver.license_file,
    driver.vehicle_registration,
    driver.insurance_document,
    driver.vignette_document,
  ].filter(Boolean).length;
  const verificationLabel =
    driver.status === "approved"
      ? "Verified profile"
      : driver.status === "rejected"
        ? "Rejected profile"
        : "Needs review";

  return (
    <div style={driverProfileCardStyle}>
      <div style={driverProfileMainStyle}>
        <div style={profilePhotoColumnStyle}>
          {driver.driver_photo ? (
            <img
              src={getFileUrl(driver.driver_photo)}
              alt="Driver"
              style={driverPhoto}
            />
          ) : (
            <div style={placeholderPhoto}>DR</div>
          )}
          <StatusBadge label={driver.is_active ? "Active" : "Blocked"} />
        </div>

        <div style={reviewContentStyle}>
          <div style={reviewHeaderStyle}>
            <div>
              <span style={sectionKickerStyle}>Driver profile</span>
              <h3 style={reviewTitleStyle}>{driver.driver_name || "N/A"}</h3>
              <p style={accessMetaStyle}>{driver.driver_email || "N/A"}</p>
            </div>
            <div style={driverVerificationStackStyle}>
              <StatusBadge label={driver.status || "pending"} />
              <span style={driverVerificationMiniBadgeStyle}>{verificationLabel}</span>
            </div>
          </div>

          <div style={detailGridStyle}>
            <DetailItem label="Phone" value={driver.phone_number || "N/A"} />
            <DetailItem
              label="Phone verification"
              value={driver.phone_verified ? "Verified" : "Not verified"}
            />
            <DetailItem
              label="Member since"
              value={`${driver.member_since_year || "N/A"} · ${formatYearsUsingApp(driver.years_using_app)}`}
            />
            <DetailItem label="Category" value={driver.driver_category_label || "Gold"} />
            <DetailItem
              label="Vehicle"
              value={`${driver.vehicle_make || ""} ${driver.vehicle_model || ""}`.trim() || "N/A"}
            />
            <DetailItem label="Plate" value={driver.vehicle_plate || "N/A"} />
            <DetailItem label="Documents" value={`${uploadedDriverDocs}/4 uploaded`} />
            <DetailItem
              label="Driver agreement"
              value={
                driver.legal_signature?.signature_complete || driver.driver_terms_accepted
                  ? `Signed${driver.legal_signature?.driver_terms_accepted_at ? ` · ${new Date(driver.legal_signature.driver_terms_accepted_at).toLocaleDateString()}` : ""}`
                  : "Not signed"
              }
            />
          </div>
          {driver.legal_signature?.signature_image_url ? (
            <div style={{ marginTop: 12 }}>
              <span style={sectionKickerStyle}>Agreement signature</span>
              <img
                src={driver.legal_signature.signature_image_url}
                alt="Driver agreement signature"
                style={{ display: "block", maxHeight: 72, marginTop: 8, background: "#fff", borderRadius: 8 }}
              />
            </div>
          ) : null}
          {driver.application_rejection_reason && (
            <p style={accessMetaStyle}>
              Rejection reason: {driver.application_rejection_reason}
            </p>
          )}

          <label style={driverCategoryControlStyle}>
            <span>Driver category</span>
            <select
              value={driver.driver_category || "gold"}
              onChange={(event) => updateDriverCategory(driver.id, event.target.value)}
              style={driverCategorySelectStyle}
            >
              {driverCategories.map((category) => (
                <option key={category.value} value={category.value}>
                  {category.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div style={reviewPanelStyle}>
        <div>
          <span style={sectionKickerStyle}>Application review</span>
          <p style={reviewHintStyle}>
            Approve qualified drivers, reject incomplete applications, or reintegrate a driver after review.
          </p>
          <RequirementChecklist
            title="Missing requirements"
            missingItems={missingDriverRequirements}
          />
        </div>

        <ReviewActions
          approveLabel="Approve Driver"
          rejectLabel="Reject Driver"
          onApprove={() => approveDriver(driver.id)}
          onReject={() => rejectDriver(driver.id)}
          canApprove={canApproveDriver}
          canReject={canRejectDriver}
        />

        <div style={actionClusterStyle}>
          <button
            style={driver.is_active ? dangerOutlineButtonStyle : successOutlineButtonStyle}
            onClick={() => setUserBlocked(driver.user_id, driver.is_active)}
          >
            {driver.is_active ? "Block Driver" : "Unblock Driver"}
          </button>

          <button
            style={{
              ...neutralButtonStyle,
              opacity: driver.is_active && driver.status === "approved" ? 0.55 : 1,
              cursor: driver.is_active && driver.status === "approved" ? "not-allowed" : "pointer",
            }}
            disabled={driver.is_active && driver.status === "approved"}
            onClick={() => reintegrateDriver(driver.id)}
          >
            Reintegrate Driver
          </button>

          <button
            style={dangerSolidButtonStyle}
            onClick={() => deleteDriver(driver.id)}
          >
            🗑️ Delete Driver
          </button>
        </div>

        {driver.is_active && driver.status === "approved" && (
          <p style={reviewDoneStyle}>Driver is active and approved.</p>
        )}
      </div>
    </div>
  );
}

function StatCard({ title, value }) {
  return (
    <div style={statCard}>
      <h2 style={statCardValueStyle}>{value}</h2>
      <p style={statCardLabelStyle}>{title}</p>
    </div>
  );
}

function StatusBadge({ label }) {
  return (
    <span style={{ ...statusBadgeStyle, ...getStatusBadgeStyle(label) }}>
      {String(label || "pending").replace("_", " ")}
    </span>
  );
}

function DetailItem({ label, value }) {
  return (
    <div style={detailItemStyle}>
      <span style={detailItemLabelStyle}>{label}</span>
      <strong style={detailItemValueStyle}>{value}</strong>
    </div>
  );
}

function RequirementChecklist({ title, missingItems = [] }) {
  const checklistStyles = {
    panel: {
      marginTop: "10px",
      padding: "10px 12px",
      borderRadius: "12px",
      border: `1px solid ${ADMIN_BLUE_BORDER}`,
      background: ADMIN_BLUE_PANEL,
      maxWidth: "560px",
      display: "grid",
      gap: "6px",
    },
    title: {
      color: "#e2e8f0",
      fontSize: "0.78rem",
      fontWeight: 900,
      letterSpacing: "0.02em",
      textTransform: "uppercase",
    },
    list: {
      margin: 0,
      padding: 0,
      listStyle: "none",
      display: "grid",
      gap: "2px",
    },
    item: {
      color: "#fca5a5",
      fontSize: "0.82rem",
      fontWeight: 800,
    },
    success: {
      color: "#86efac",
      fontSize: "0.82rem",
      fontWeight: 800,
    },
  };

  return (
    <div style={checklistStyles.panel}>
      <strong style={checklistStyles.title}>{title}</strong>
      {missingItems.length > 0 ? (
        <ul style={checklistStyles.list}>
          {missingItems.map((item) => (
            <li key={item} style={checklistStyles.item}>- {item}</li>
          ))}
        </ul>
      ) : (
        <span style={checklistStyles.success}>All required fields are complete.</span>
      )}
    </div>
  );
}

function ReviewActions({
  approveLabel,
  rejectLabel,
  onApprove,
  onReject,
  canApprove = true,
  canReject = true,
}) {
  return (
    <div style={reviewActionsStyle}>
      <button
        type="button"
        style={reviewApproveButtonStyle}
        onClick={() => {
          if (!canApprove) return;
          onApprove();
        }}
      >
        {approveLabel}
      </button>
      <button
        type="button"
        style={reviewRejectButtonStyle}
        onClick={() => {
          if (!canReject) return;
          onReject();
        }}
      >
        {rejectLabel}
      </button>
    </div>
  );
}

function SectionTitle({ title, subtitle }) {
  return (
    <div style={sectionTitleWrapStyle}>
      <span style={sectionKickerStyle}>Admin app</span>
      <h1 style={sectionTitleStyle}>{title}</h1>
      <p style={sectionSubtitleStyle}>{subtitle}</p>
    </div>
  );
}

function AdminInfoLines({ lines = [] }) {
  return (
    <div style={adminInfoLinesWrapStyle}>
      {lines.map((line) => (
        <div key={line.title} style={adminInfoLineStyle}>
          <span style={adminInfoLineTitleStyle}>{line.title}</span>
          <div style={adminInfoLineItemsStyle}>
            {line.items.map(([label, value]) => (
              <div key={`${line.title}-${label}`} style={adminInfoChipStyle}>
                <span style={adminInfoChipLabelStyle}>{label}</span>
                <strong style={adminInfoChipValueStyle}>{value}</strong>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const adminOverviewGridStyle = {
  display: "grid",
  gap: "18px",
};

const adminInfoLinesWrapStyle = {
  display: "grid",
  gap: "10px",
  marginBottom: "16px",
};

const adminInfoLineStyle = {
  display: "grid",
  gap: "8px",
  border: `1px solid ${ADMIN_BLUE_BORDER}`,
  borderRadius: "14px",
  padding: "12px",
  background: ADMIN_BLUE_PANEL_DARK,
};

const adminInfoLineTitleStyle = {
  color: "#e2e8f0",
  fontSize: "0.78rem",
  fontWeight: 900,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
};

const adminInfoLineItemsStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
  gap: "8px",
};

const adminInfoChipStyle = {
  border: `1px solid ${ADMIN_BLUE_BORDER}`,
  borderRadius: "10px",
  background: ADMIN_BLUE_PANEL,
  padding: "8px 10px",
  display: "grid",
  gap: "2px",
};

const adminInfoChipLabelStyle = {
  color: "#94a3b8",
  fontSize: "0.72rem",
  fontWeight: 800,
  textTransform: "uppercase",
};

const adminInfoChipValueStyle = {
  color: "white",
  fontSize: "0.9rem",
};

const premiumMetricGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: "12px",
};

const premiumMetricStyle = {
  minHeight: "104px",
  border: "1px solid",
  borderRadius: "16px",
  padding: "16px",
  display: "grid",
  alignContent: "space-between",
  boxShadow: "0 12px 24px rgba(0, 0, 0, 0.16)",
};

const premiumMetricToneStyles = {
  green: {
    background: "linear-gradient(135deg, rgba(34, 197, 94, 0.22), rgba(34, 197, 94, 0.06))",
    borderColor: "rgba(74, 222, 128, 0.34)",
    color: "#dcfce7",
  },
  amber: {
    background: "linear-gradient(135deg, rgba(245, 158, 11, 0.24), rgba(245, 158, 11, 0.08))",
    borderColor: "rgba(245, 158, 11, 0.34)",
    color: "#fef3c7",
  },
  blue: {
    background: "linear-gradient(135deg, rgba(37, 99, 235, 0.22), rgba(37, 99, 235, 0.06))",
    borderColor: ADMIN_BLUE_BORDER,
    color: "#dbeafe",
  },
  gold: {
    background: "linear-gradient(135deg, rgba(251, 191, 36, 0.24), rgba(245, 158, 11, 0.08))",
    borderColor: "rgba(251, 191, 36, 0.34)",
    color: "#fef3c7",
  },
  red: {
    background: "linear-gradient(135deg, rgba(239, 68, 68, 0.22), rgba(239, 68, 68, 0.06))",
    borderColor: "rgba(248, 113, 113, 0.34)",
    color: "#fee2e2",
  },
};

const overviewPanelsStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: "16px",
  marginTop: "18px",
};

const analyticsPanelStyle = {
  background: ADMIN_BLUE_PANEL_DARK,
  border: `1px solid ${ADMIN_BLUE_BORDER}`,
  borderRadius: "14px",
  padding: "18px",
};

const analyticsPanelHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: "12px",
  alignItems: "flex-start",
  marginBottom: "16px",
};

const analyticsPanelTitleStyle = {
  margin: "3px 0 0",
  color: "white",
  fontSize: "1.25rem",
};

const analyticsBarListStyle = {
  display: "grid",
  gap: "12px",
};

const analyticsBarRowStyle = {
  display: "grid",
  gridTemplateColumns: "92px 1fr 38px",
  gap: "10px",
  alignItems: "center",
  color: "#d1d5db",
  fontWeight: 900,
};

const analyticsBarTrackStyle = {
  height: "10px",
  borderRadius: "999px",
  background: "rgba(191, 219, 254, 0.16)",
  overflow: "hidden",
};

const analyticsBarFillStyle = {
  display: "block",
  height: "100%",
  borderRadius: "999px",
};

const analyticsSplitStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "10px",
  marginTop: "16px",
};

const revenueBarsStyle = {
  minHeight: "230px",
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: "12px",
  alignItems: "end",
};

const revenueBarItemStyle = {
  display: "grid",
  gap: "8px",
  color: "#d1d5db",
  textAlign: "center",
  fontWeight: 900,
};

const revenueBarColumnStyle = {
  height: "142px",
  borderRadius: "12px",
  background: ADMIN_BLUE_PANEL,
  border: `1px solid ${ADMIN_BLUE_BORDER}`,
  display: "flex",
  alignItems: "end",
  justifyContent: "center",
  padding: "8px",
};

const revenueBarFillStyle = {
  display: "block",
  width: "100%",
  borderRadius: "6px",
};

const liveOpsStripStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: "12px",
  marginBottom: "18px",
};

const liveRideGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
  gap: "12px",
  marginBottom: "18px",
};

const liveRideCardStyle = {
  background: ADMIN_BLUE_PANEL_DARK,
  border: `1px solid ${ADMIN_BLUE_BORDER}`,
  borderRadius: "14px",
  padding: "16px",
};

const liveRideHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: "12px",
  alignItems: "flex-start",
  marginBottom: "14px",
};

const liveRideTitleStyle = {
  margin: "4px 0 0",
  color: "white",
  textTransform: "capitalize",
};

const emptyStateStyle = {
  display: "grid",
  gap: "5px",
  border: `1px dashed ${ADMIN_BLUE_BORDER}`,
  borderRadius: "14px",
  padding: "18px",
  background: ADMIN_BLUE_PANEL_DARK,
  color: "#d1d5db",
};

const emergencyLayoutStyle = {
  display: "grid",
  gap: "16px",
};

const emergencyContactGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: "12px",
};

const emergencyContactCardStyle = {
  display: "grid",
  gap: "7px",
  minHeight: "118px",
  alignContent: "center",
  padding: "16px",
  borderRadius: "14px",
  border: "1px solid rgba(248, 113, 113, 0.34)",
  background: "linear-gradient(135deg, rgba(239, 68, 68, 0.2), rgba(239, 68, 68, 0.06))",
  color: "white",
  textDecoration: "none",
  fontWeight: 900,
};

const emergencyWatchListStyle = {
  display: "grid",
  gap: "10px",
};

const emergencyItemStyle = {
  display: "grid",
  gridTemplateColumns: "14px minmax(0, 1fr) auto",
  gap: "12px",
  alignItems: "center",
  background: ADMIN_BLUE_PANEL_DARK,
  border: `1px solid ${ADMIN_BLUE_BORDER}`,
  borderRadius: "14px",
  padding: "14px",
};

const severityDotStyle = {
  width: "12px",
  height: "12px",
  borderRadius: "50%",
  boxShadow: "0 0 0 5px rgba(255, 255, 255, 0.06)",
};

const emergencyItemTitleStyle = {
  margin: 0,
  color: "white",
  fontSize: "1rem",
};

const reportsLayoutStyle = {
  display: "grid",
  gap: "16px",
};

const reportsHeroStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: "16px",
  alignItems: "flex-start",
  border: `1px solid ${ADMIN_BLUE_BORDER}`,
  borderRadius: "18px",
  padding: "18px",
  background:
    `radial-gradient(circle at 90% 10%, rgba(96, 165, 250, 0.26), transparent 34%), ${ADMIN_BLUE_PANEL_DARK}`,
};

const reportsHeroTitleStyle = {
  margin: "6px 0 8px",
  color: "white",
  fontSize: "1.65rem",
  letterSpacing: 0,
};

const reportsGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
  gap: "12px",
};

const reportCardStyle = {
  display: "grid",
  gap: "14px",
  border: `1px solid ${ADMIN_BLUE_BORDER}`,
  borderRadius: "16px",
  padding: "16px",
  background: ADMIN_BLUE_PANEL_DARK,
  boxShadow: "0 12px 24px rgba(0, 0, 0, 0.14)",
};

const reportHeaderStyle = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
};

const reportTitleStyle = {
  margin: 0,
  color: "white",
  fontSize: "1rem",
};

const reportRowsStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "10px",
};

const reportActionBarStyle = {
  display: "flex",
  justifyContent: "flex-end",
  gap: "10px",
  flexWrap: "wrap",
};

const performanceLayoutStyle = {
  display: "grid",
  gap: "16px",
};

const performanceTableStyle = {
  display: "grid",
  gap: "12px",
};

const performanceRowStyle = {
  display: "grid",
  gridTemplateColumns: "96px minmax(220px, 0.75fr) minmax(360px, 1.25fr)",
  gap: "14px",
  alignItems: "center",
  background: ADMIN_BLUE_PANEL_DARK,
  border: `1px solid ${ADMIN_BLUE_BORDER}`,
  borderRadius: "14px",
  padding: "14px",
};

const performanceScoreStyle = {
  display: "grid",
  justifyItems: "center",
  gap: "8px",
  color: "white",
};

const performanceBandStyle = {
  borderRadius: "999px",
  color: "white",
  padding: "5px 9px",
  fontSize: "0.68rem",
  fontWeight: 950,
  textTransform: "uppercase",
};

const performanceDriverStyle = {
  minWidth: 0,
};

const performanceMetricsStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(5, minmax(92px, 1fr))",
  gap: "8px",
};

const cityManagementGridStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(260px, 360px) minmax(0, 1fr)",
  gap: "16px",
  alignItems: "start",
};

const cityRowStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(170px, 0.45fr) minmax(360px, 1fr)",
  gap: "14px",
  alignItems: "center",
  background: ADMIN_BLUE_PANEL_DARK,
  border: `1px solid ${ADMIN_BLUE_BORDER}`,
  borderRadius: "14px",
  padding: "14px",
};

const pageStyle = {
  display: "grid",
  gridTemplateColumns: "300px minmax(0, 1fr)",
  minHeight: "100vh",
  backgroundImage: "radial-gradient(circle at top right, rgba(0, 166, 81, 0.16), transparent 44%), linear-gradient(135deg, #08130f 0%, #0b1814 45%, #112019 100%)",
  backgroundSize: "cover",
  backgroundPosition: "center",
  backgroundRepeat: "no-repeat",
  backgroundAttachment: "fixed",
  color: "#f8fafc",
  fontFamily: "\"Plus Jakarta Sans\", \"Inter\", \"Segoe UI\", sans-serif",
};

const sidebar = {
  position: "sticky",
  top: 0,
  height: "100vh",
  background: "linear-gradient(180deg, rgba(6, 16, 12, 0.98) 0%, rgba(11, 24, 18, 0.98) 100%)",
  color: "white",
  padding: "24px 20px",
  borderRight: "1px solid rgba(148, 163, 184, 0.2)",
  boxSizing: "border-box",
  overflowY: "auto",
  minWidth: "260px",
  boxShadow: "8px 0 24px rgba(0, 0, 0, 0.2)",
};

const sidebarBrandStyle = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
  marginBottom: "26px",
};

const brandLogoStyle = {
  width: "56px",
  height: "56px",
  borderRadius: "14px",
  objectFit: "cover",
  boxShadow: "0 4px 16px rgba(16,185,129,0.28)",
};

const sidebarTitle = {
  margin: 0,
  fontSize: "1.1rem",
};

const sidebarSubtitleStyle = {
  margin: "3px 0 0",
  color: "#94a3b8",
  fontSize: "0.78rem",
  fontWeight: 800,
};

const adminUserCardStyle = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "12px 0",
  marginBottom: 12,
  borderBottom: "1px solid rgba(148, 163, 184, 0.2)",
};

const adminUserAvatarStyle = {
  width: 40,
  height: 40,
  borderRadius: "50%",
  background: "linear-gradient(135deg, #34d399, #10b981)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "#052e1d",
  fontWeight: 900,
  fontSize: 14,
  flexShrink: 0,
};

const adminUserNameStyle = {
  color: "#f8fafc",
  fontWeight: 700,
  fontSize: 13,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const adminUserEmailStyle = {
  color: "#94a3b8",
  fontSize: 11,
};

const menuButton = {
  width: "100%",
  padding: "12px 14px",
  marginBottom: "6px",
  border: "1px solid transparent",
  borderRadius: "12px",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "10px",
  textAlign: "left",
  fontWeight: 800,
  fontSize: "0.88rem",
  transition: "all 180ms ease",
};

const menuCountStyle = {
  minWidth: "30px",
  height: "24px",
  borderRadius: "999px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(110, 231, 183, 0.22)",
  fontSize: "0.76rem",
  fontWeight: 950,
};

const content = {
  padding: "28px",
  minWidth: 0,
  background: "rgba(8, 22, 16, 0.28)",
};

const pageStyleCompact = {
  gridTemplateColumns: "minmax(0, 1fr)",
};

const sidebarCompact = {
  position: "fixed",
  top: 0,
  left: 0,
  bottom: 0,
  width: "min(300px, 85vw)",
  height: "100vh",
  minWidth: 0,
  padding: "18px 16px 12px",
  borderRight: "1px solid rgba(148, 163, 184, 0.24)",
  boxShadow: "8px 0 24px rgba(0, 0, 0, 0.3)",
  zIndex: 1000,
  overflowY: "auto",
  transition: "transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)",
};

const contentCompact = {
  padding: "16px",
};

const topBarStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "18px",
  background: ADMIN_BLUE_PANEL,
  border: `1px solid ${ADMIN_BLUE_BORDER}`,
  borderRadius: "20px",
  padding: "18px 20px",
  marginBottom: "20px",
  boxShadow: "0 16px 34px rgba(0, 0, 0, 0.2)",
};

const adminShortcutRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: "10px",
  marginBottom: "16px",
};

const adminShortcutButtonStyle = {
  minHeight: "38px",
  padding: "0 14px",
  borderRadius: "999px",
  border: `1px solid ${ADMIN_BLUE_BORDER}`,
  background: "rgba(15, 33, 25, 0.56)",
  color: "#cbd5e1",
  fontSize: "0.82rem",
  fontWeight: 800,
  cursor: "pointer",
  transition: "all 180ms ease",
};

const adminShortcutButtonActiveStyle = {
  background: "linear-gradient(135deg, rgba(52, 211, 153, 0.28), rgba(16, 185, 129, 0.2))",
  color: "#ffffff",
  borderColor: "rgba(52, 211, 153, 0.55)",
  boxShadow: "inset 0 0 0 1px rgba(52, 211, 153, 0.2)",
};

const topBarKickerStyle = {
  color: "#94a3b8",
  fontSize: "0.72rem",
  fontWeight: 950,
  textTransform: "uppercase",
};

const topBarTitleStyle = {
  margin: "3px 0 0",
  color: "white",
  fontSize: "1.45rem",
  letterSpacing: 0,
};

const topBarActionsStyle = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
  flexWrap: "wrap",
  justifyContent: "flex-end",
};

const topBarCompactStyle = {
  flexDirection: "column",
  alignItems: "stretch",
};

const topBarActionsCompactStyle = {
  width: "100%",
  justifyContent: "stretch",
};

const searchInputStyle = {
  width: "min(360px, 48vw)",
  minHeight: "44px",
  border: `1px solid ${ADMIN_BLUE_BORDER}`,
  borderRadius: "14px",
  padding: "0 14px",
  color: "white",
  fontWeight: 700,
  background: ADMIN_BLUE_PANEL_DARK,
  outline: "none",
};

const searchInputCompactStyle = {
  width: "100%",
};

const refreshButtonStyle = {
  minHeight: "44px",
  border: "none",
  borderRadius: "12px",
  background: "linear-gradient(135deg, #34d399, #10b981)",
  color: "#052e1d",
  padding: "0 16px",
  cursor: "pointer",
  fontWeight: 900,
};

const opsHeroStyle = {
  background: `linear-gradient(135deg, ${ADMIN_BLUE_PANEL} 0%, ${ADMIN_BLUE_PANEL_DARK} 100%)`,
  color: "white",
  borderRadius: "22px",
  padding: "28px",
  display: "grid",
  gridTemplateColumns: "minmax(260px, 0.8fr) minmax(300px, 1.2fr)",
  gap: "20px",
  alignItems: "center",
  marginBottom: "22px",
  border: `1px solid ${ADMIN_BLUE_BORDER}`,
  boxShadow: "0 16px 32px rgba(0, 0, 0, 0.2)",
};

const opsHeroCompactStyle = {
  gridTemplateColumns: "minmax(0, 1fr)",
  padding: "16px",
  marginBottom: "14px",
};

const opsKickerStyle = {
  color: "#cbd5e1",
  fontSize: "0.78rem",
  fontWeight: 900,
  textTransform: "uppercase",
};

const opsTitleStyle = {
  margin: "7px 0 8px",
  fontSize: "clamp(1.4rem, 5vw, 2rem)",
  letterSpacing: 0,
};

const opsSubtitleStyle = {
  margin: 0,
  color: "#cbd5e1",
  lineHeight: 1.5,
  maxWidth: "560px",
};

const opsStatsGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
  gap: "12px",
};

const card = {
  background: ADMIN_BLUE_PANEL,
  padding: "30px",
  borderRadius: "22px",
  border: `1px solid ${ADMIN_BLUE_BORDER}`,
  boxShadow: "0 18px 36px rgba(0, 0, 0, 0.2)",
  backdropFilter: "blur(12px)",
};

const listCard = {
  background: ADMIN_BLUE_PANEL_DARK,
  padding: "18px",
  borderRadius: "16px",
  marginBottom: "14px",
  border: `1px solid ${ADMIN_BLUE_BORDER}`,
  boxShadow: "none",
};

const verificationCard = {
  display: "flex",
  gap: "20px",
  background: ADMIN_BLUE_PANEL_DARK,
  padding: "20px",
  borderRadius: "14px",
  marginBottom: "16px",
  border: `1px solid ${ADMIN_BLUE_BORDER}`,
  boxShadow: "none",
};

const statsGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: "16px",
  marginTop: "20px",
};

const statCard = {
  background: "linear-gradient(135deg, rgba(5, 42, 24, 0.96), rgba(8, 31, 20, 0.92))",
  padding: "20px",
  borderRadius: "16px",
  border: `1px solid ${ADMIN_BLUE_BORDER}`,
  minHeight: "96px",
  boxShadow: "0 12px 24px rgba(0,0,0,0.18)",
  transition: "transform 0.2s, box-shadow 0.2s",
};

const statCardValueStyle = {
  margin: "0 0 6px",
  fontSize: "1.8rem",
  fontWeight: 800,
  color: ADMIN_TEXT_PRIMARY,
  letterSpacing: "-0.02em",
};

const statCardLabelStyle = {
  margin: 0,
  color: ADMIN_TEXT_SECONDARY,
  fontSize: "0.82rem",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const sectionTitleWrapStyle = {
  marginBottom: "20px",
};

const sectionKickerStyle = {
  display: "block",
  color: "#94a3b8",
  fontSize: "0.76rem",
  fontWeight: 900,
  textTransform: "uppercase",
  marginBottom: "4px",
};

const sectionTitleStyle = {
  margin: 0,
  color: "white",
  fontSize: "1.75rem",
  fontWeight: 800,
  letterSpacing: "-0.02em",
};

const sectionSubtitleStyle = {
  margin: "6px 0 0",
  color: "#cbd5e1",
  lineHeight: 1.45,
};

const subHeadingStyle = {
  marginTop: "24px",
  color: "white",
};

const approveButton = {
  padding: "11px 18px",
  border: "none",
  borderRadius: "12px",
  background: ADMIN_BLUE,
  color: "white",
  marginRight: "10px",
  cursor: "pointer",
  fontWeight: 950,
};

const rejectButton = {
  padding: "11px 18px",
  border: "none",
  borderRadius: "12px",
  background: "#dc2626",
  color: "white",
  cursor: "pointer",
  fontWeight: 950,
};

const accessCardStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "16px",
  background: ADMIN_BLUE_PANEL_DARK,
  padding: "16px",
  borderRadius: "14px",
  marginBottom: "12px",
  border: `1px solid ${ADMIN_BLUE_BORDER}`,
  flexWrap: "wrap",
  boxShadow: "none",
};

const accessTitleStyle = {
  margin: 0,
  color: "white",
};

const accessMetaStyle = {
  margin: "4px 0 10px",
  color: "#94a3b8",
  fontWeight: 700,
};

const accessPillRowStyle = {
  display: "flex",
  gap: "8px",
  flexWrap: "wrap",
};

const actionClusterStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: "10px",
  flexWrap: "wrap",
};

const driverProfileCardStyle = {
  background: ADMIN_BLUE_PANEL_DARK,
  border: `1px solid ${ADMIN_BLUE_BORDER}`,
  borderRadius: "14px",
  padding: "16px",
  marginBottom: "14px",
  display: "grid",
  gap: "16px",
  boxShadow: "none",
};

const driverProfileMainStyle = {
  display: "grid",
  gridTemplateColumns: "132px minmax(0, 1fr)",
  gap: "18px",
  alignItems: "start",
};

const profilePhotoColumnStyle = {
  display: "grid",
  justifyItems: "center",
  gap: "10px",
};

const reviewContentStyle = {
  minWidth: 0,
};

const reviewHeaderStyle = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "12px",
  marginBottom: "12px",
};

const driverVerificationStackStyle = {
  display: "grid",
  justifyItems: "end",
  gap: "8px",
};

const driverVerificationMiniBadgeStyle = {
  border: `1px solid ${ADMIN_BLUE_BORDER}`,
  borderRadius: "999px",
  background: ADMIN_BLUE_SOFT,
  color: "#e2e8f0",
  padding: "7px 10px",
  fontSize: "0.72rem",
  fontWeight: 950,
  whiteSpace: "nowrap",
};

const reviewTitleStyle = {
  margin: "2px 0 0",
  color: "white",
  fontSize: "1.25rem",
  letterSpacing: 0,
};

const detailGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: "10px",
};

const detailItemStyle = {
  display: "grid",
  gap: "4px",
  background: ADMIN_BLUE_PANEL,
  border: `1px solid ${ADMIN_BLUE_BORDER}`,
  borderRadius: "12px",
  padding: "10px 12px",
  minWidth: 0,
};

const detailItemLabelStyle = {
  color: "#94a3b8",
  fontSize: "0.72rem",
  fontWeight: 950,
  textTransform: "uppercase",
};

const detailItemValueStyle = {
  color: "white",
  fontSize: "0.92rem",
  overflowWrap: "anywhere",
};

const reviewPanelStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "14px",
  flexWrap: "wrap",
  borderTop: `1px solid ${ADMIN_BLUE_BORDER}`,
  paddingTop: "14px",
};

const reviewHintStyle = {
  margin: "4px 0 0",
  color: "#94a3b8",
  fontWeight: 700,
  maxWidth: "560px",
};

const reviewActionsStyle = {
  display: "inline-flex",
  gap: "8px",
  padding: "5px",
  borderRadius: "12px",
  background: ADMIN_BLUE_PANEL,
  border: `1px solid ${ADMIN_BLUE_BORDER}`,
  flexWrap: "wrap",
};

const reviewApproveButtonStyle = {
  minHeight: "42px",
  border: "none",
  borderRadius: "10px",
  background: ADMIN_BLUE,
  color: "white",
  padding: "0 14px",
  fontWeight: 950,
};

const reviewRejectButtonStyle = {
  ...reviewApproveButtonStyle,
  background: "#ef4444",
};

const statusBadgeStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "30px",
  borderRadius: "999px",
  border: "1px solid",
  padding: "0 10px",
  fontSize: "0.76rem",
  fontWeight: 950,
  textTransform: "capitalize",
  whiteSpace: "nowrap",
};

const neutralButtonStyle = {
  minHeight: "42px",
  border: `1px solid ${ADMIN_BLUE_BORDER}`,
  borderRadius: "10px",
  background: ADMIN_BLUE_PANEL,
  color: "white",
  padding: "0 14px",
  cursor: "pointer",
  fontWeight: 950,
};

const dangerOutlineButtonStyle = {
  ...neutralButtonStyle,
  borderColor: ADMIN_DANGER_BORDER,
  color: ADMIN_DANGER_TEXT,
  background: "#fff7f7",
};

const successOutlineButtonStyle = {
  ...neutralButtonStyle,
  borderColor: ADMIN_SUCCESS_BORDER,
  color: ADMIN_SUCCESS_TEXT,
  background: "#f0fdf4",
};

const dangerSolidButtonStyle = {
  ...neutralButtonStyle,
  borderColor: "#991b1b",
  background: "#7f1d1d",
  color: "#fecaca",
};

const reviewDoneStyle = {
  margin: 0,
  padding: "10px 12px",
  borderRadius: "12px",
  background: "#ecfdf3",
  color: "#166534",
  fontWeight: 900,
};

const rolePillStyle = {
  background: "#eef2ff",
  color: "#3730a3",
  borderRadius: "999px",
  padding: "7px 10px",
  fontSize: "0.78rem",
  fontWeight: 900,
  textTransform: "capitalize",
};

const driverCategoryControlStyle = {
  display: "grid",
  gap: "8px",
  margin: "14px 0",
  maxWidth: "280px",
  color: "#d1d5db",
  fontWeight: 900,
};

const driverCategorySelectStyle = {
  width: "100%",
  minHeight: "44px",
  border: `1px solid ${ADMIN_BLUE_BORDER}`,
  borderRadius: "6px",
  background: ADMIN_BLUE_PANEL_DARK,
  color: "white",
  padding: "0 12px",
  fontWeight: 900,
  cursor: "pointer",
};

const ownerPayoutPanelStyle = {
  marginTop: "26px",
  background: ADMIN_BLUE_PANEL_DARK,
  border: `1px solid ${ADMIN_BLUE_BORDER}`,
  borderRadius: "14px",
  padding: "20px",
  display: "grid",
  gridTemplateColumns: "minmax(260px, 1fr) minmax(280px, 430px)",
  gap: "20px",
  alignItems: "start",
};

const ownerPayoutSavedStyle = {
  background: ADMIN_BLUE_PANEL,
  border: `1px solid ${ADMIN_BLUE_BORDER}`,
  borderRadius: "12px",
  padding: "12px",
  marginBottom: "10px",
  display: "grid",
  gap: "5px",
  color: "white",
  textTransform: "capitalize",
};

const ownerPayoutFormStyle = {
  display: "grid",
  gap: "12px",
};

const ownerPayoutFieldStyle = {
  display: "grid",
  gap: "7px",
  color: "#e2e8f0",
  fontWeight: 900,
};

const ownerPayoutInputStyle = {
  width: "100%",
  minHeight: "44px",
  border: `1px solid ${ADMIN_BLUE_BORDER}`,
  borderRadius: "10px",
  background: ADMIN_BLUE_PANEL_DARK,
  color: "white",
  padding: "0 12px",
  fontWeight: 800,
  boxSizing: "border-box",
};

const ownerPayoutButtonStyle = {
  minHeight: "46px",
  border: "none",
  borderRadius: "10px",
  background: "linear-gradient(135deg, #34d399, #10b981)",
  color: "#052e1d",
  cursor: "pointer",
  fontWeight: 900,
};

const ownerPayoutMessageStyle = {
  margin: 0,
  padding: "10px 12px",
  borderRadius: "8px",
  background: "#ecfdf3",
  color: "#166534",
  fontWeight: 900,
};

const blockButtonStyle = {
  padding: "11px 16px",
  border: "none",
  borderRadius: "10px",
  background: "#dc2626",
  color: "white",
  cursor: "pointer",
  fontWeight: 900,
};

const unblockButtonStyle = {
  padding: "11px 16px",
  border: "none",
  borderRadius: "10px",
  background: ADMIN_BLUE,
  color: "white",
  cursor: "pointer",
  fontWeight: 900,
};

const driverPhoto = {
  width: "96px",
  height: "96px",
  borderRadius: "14px",
  objectFit: "cover",
  marginBottom: "10px",
};

const placeholderPhoto = {
  width: "96px",
  height: "96px",
  borderRadius: "14px",
  background: ADMIN_BLUE_PANEL,
  color: "#9ca3af",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  fontSize: "1rem",
  fontWeight: 950,
  marginBottom: "10px",
};

const documentLinks = {
  display: "flex",
  gap: "10px",
  flexWrap: "wrap",
  marginTop: "15px",
};

const documentButton = {
  display: "inline-block",
  padding: "10px 14px",
  background: "linear-gradient(135deg, #34d399, #10b981)",
  color: "#052e1d",
  borderRadius: "10px",
  textDecoration: "none",
  fontWeight: 800,
};

export default AdminDashboard;


