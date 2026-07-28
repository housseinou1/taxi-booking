import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { navigateInApp } from "../navigation/inAppNavigation";

import { API_URL } from "../apiConfig";
import { isDriverYalaUI } from "./yalaColors";
import { Badge, ConfirmationDialog } from "../design-system/components";
import { DriverLoadingState, DriverErrorState } from "./ui/DriverAppStates";
import DocumentsUnderReviewBanner from "./components/DocumentsUnderReviewBanner";
import DriverPayoutPanel from "./components/DriverPayoutPanel";
import TrustedContactsSection from "../safety/TrustedContactsSection";
import {
  DOCUMENTS_UNDER_REVIEW_MESSAGE,
  getDocumentMenuStatusLabel,
  getDriverApprovalNotice,
  getRequiredDocumentExpirationStatus,
  shouldShowDocumentsUnderReview,
} from "./utils/documentReview";
import "./DriverProfilePage.css";

const DOCUMENT_TYPES = [
  { type: "license", label: "Driver License", group: "Driver Documents" },
  { type: "national_id", label: "National ID", group: "Driver Documents" },
  { type: "profile_photo", label: "Profile Photo", group: "Driver Documents" },
  { type: "insurance", label: "Insurance", group: "Vehicle Documents" },
  { type: "carte_grise", label: "Carte Grise", group: "Vehicle Documents" },
  { type: "vignette", label: "Vignette", group: "Vehicle Documents" },
  { type: "plate_number_photo", label: "Plate Number", group: "Vehicle Documents" },
];

const getValue = (...values) => values.find((value) => value !== undefined && value !== null && value !== "");
const isPlaceholderDisplayValue = (value) => {
  const text = String(value || "").trim();
  if (!text || text === "n/a" || text === "Not provided" || text === "Not assigned") return true;
  if (/^TEMP\b/i.test(text) || /^TEMP[-_]/i.test(text)) return true;
  return false;
};
const displayValue = (...values) =>
  getValue(...values.filter((candidate) => !isPlaceholderDisplayValue(candidate))) || "Not provided";
const formatMRU = (value) => `${Number(value || 0).toLocaleString()} MRU`;
const titleCase = (value = "") =>
  String(value)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const getRequestFailure = (reason) => {
  const response = reason?.response;
  const data = response?.data || {};
  return {
    status: response?.status,
    message: data.detail || data.error || reason?.message || "Request failed",
    code: data.code,
  };
};

const getProfileLoadError = (failures = []) => {
  const primary =
    failures.find((item) => item.key === "base")
    || failures.find((item) => item.key === "profile")
    || failures[0];

  if (!primary) {
    return "We could not load your driver profile. Please try again.";
  }
  if (primary.status === 401) {
    return { redirectToLogin: true };
  }
  if (primary.code === "not_driver_account" || primary.status === 403) {
    return "This account is not linked to a driver profile. Complete driver registration or log in with a driver account.";
  }
  if (primary.code === "driver_profile_missing") {
    return "Your driver profile is still being set up. Tap Try again or finish vehicle setup first.";
  }
  return primary.message || "We could not load your driver profile. Please try again.";
};

const getDocumentStatus = (document, docType = {}) => {
  if (!document?.file) return "missing";
  const expirationStatus = getRequiredDocumentExpirationStatus(document, {
    required: docType.required !== false,
  });
  if (expirationStatus === "expired") return "expired";
  if (expirationStatus === "expiring_soon") return "expiring_soon";
  if (document.status === "pending_review") return "pending_review";
  if (document.status === "approved" || expirationStatus === "valid") return "valid";
  return document.status || "pending";
};

const findDocumentByType = (documents, type) => {
  if (!Array.isArray(documents)) return null;
  if (type === "carte_grise") {
    return (
      documents.find((doc) => doc.document_type === "carte_grise") ||
      documents.find((doc) => doc.document_type === "vehicle_registration") ||
      null
    );
  }
  return documents.find((doc) => doc.document_type === type) || null;
};

const initials = (name) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "YD";

// Presentation-only summary of existing per-document statuses. Does not change
// document/expiry logic — it only reads getDocumentStatus() results.
const summarizeDocuments = (rows = []) => {
  const statuses = rows.map(({ item, document }) => getDocumentStatus(document, item));
  const count = (predicate) => statuses.filter(predicate).length;
  const expired = count((s) => s === "expired");
  const rejected = count((s) => s === "rejected");
  const missing = count((s) => s === "missing");
  const expiring = count((s) => s === "expiring_soon");
  const pending = count((s) =>
    ["pending", "pending_review", "needs_review", "under_review", "submitted"].includes(s)
  );
  const plural = (n) => (n > 1 ? "s" : "");
  if (expired > 0) return { intent: "danger", label: "Action needed", warning: `${expired} document${plural(expired)} expired` };
  if (rejected > 0) return { intent: "danger", label: "Action needed", warning: `${rejected} document${plural(rejected)} rejected` };
  if (missing > 0) return { intent: "warning", label: "Incomplete", warning: `${missing} document${plural(missing)} missing` };
  if (expiring > 0) return { intent: "warning", label: "Expiring soon", warning: `${expiring} document${plural(expiring)} expiring soon` };
  if (pending > 0) return { intent: "warning", label: "Pending review", warning: `${pending} document${plural(pending)} pending review` };
  return { intent: "success", label: "All approved", warning: "All documents are approved" };
};

// Presentation-only mapping of the existing backend-derived approval status to a
// badge intent, icon, and human-readable label. Does not introduce new statuses,
// infer verification, or alter gating.
const getAccountStatusMeta = (status) => {
  const key = String(status || "").toLowerCase();
  const map = {
    approved: { intent: "success", icon: "✓", label: "Approved" },
    active: { intent: "success", icon: "✓", label: "Approved" },
    pending: { intent: "warning", icon: "⏳", label: "Pending review" },
    pending_review: { intent: "warning", icon: "⏳", label: "Pending review" },
    under_review: { intent: "warning", icon: "⏳", label: "Under review" },
    submitted: { intent: "warning", icon: "⏳", label: "Pending review" },
    incomplete: { intent: "warning", icon: "📝", label: "Setup incomplete" },
    rejected: { intent: "danger", icon: "✕", label: "Rejected" },
    suspended: { intent: "danger", icon: "🚫", label: "Suspended" },
    blocked: { intent: "danger", icon: "🚫", label: "Blocked" },
    expired: { intent: "danger", icon: "⚠️", label: "Documents expired" },
  };
  return map[key] || { intent: "neutral", icon: "•", label: titleCase(status || "Pending") };
};

export default function DriverProfilePage({ onBack }) {
  const [data, setData] = useState({
    base: null,
    profile: null,
    stats: null,
    documents: [],
    reviews: [],
    achievements: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [uploadingType, setUploadingType] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [documentsUnderReview, setDocumentsUnderReview] = useState(false);
  const [activeTab, setActiveTab] = useState("profile");
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const fileInputRef = useRef(null);
  const pendingDocumentType = useRef("");
  const documentsPanelRef = useRef(null);
  const payoutPanelRef = useRef(null);
  const token = localStorage.getItem("access");

  const authHeaders = useMemo(
    () => ({ headers: { Authorization: `Bearer ${token}` } }),
    [token]
  );

  const loadProfile = useCallback(async () => {
    if (!token) {
      window.location.href = "/login";
      return;
    }

    setLoading(true);
    setError("");
    const endpoints = [
      ["base", "/drivers/me/"],
      ["profile", "/drivers/me/profile/"],
      ["stats", "/drivers/me/stats/"],
      ["documents", "/drivers/me/documents/"],
      ["reviews", "/drivers/me/feedback/reviews/"],
      ["achievements", "/drivers/me/achievements/"],
    ];

    const responses = await Promise.allSettled(
      endpoints.map(([, path]) => axios.get(`${API_URL}${path}`, authHeaders))
    );

    const next = {
      base: null,
      profile: null,
      stats: null,
      documents: [],
      reviews: [],
      achievements: [],
    };
    const failures = [];

    responses.forEach((response, index) => {
      const [key] = endpoints[index];
      if (response.status !== "fulfilled") {
        failures.push({ key, ...getRequestFailure(response.reason) });
        return;
      }
      const payload = response.value.data;
      if (key === "documents") {
        next.documents = payload.documents || payload.results || [];
      } else if (key === "reviews") next.reviews = payload.results || payload.reviews || [];
      else if (key === "achievements") next.achievements = payload.achievements || payload.results || [];
      else next[key] = payload;
    });

    const hasCoreProfile = Boolean(next.base || next.profile);
    if (!hasCoreProfile) {
      const loadError = getProfileLoadError(failures);
      if (loadError?.redirectToLogin) {
        window.location.href = "/login";
        return;
      }
      setError(loadError);
    } else {
      setData(next);
      const documentsPayload = responses[endpoints.findIndex(([key]) => key === "documents")];
      const documentsResponse =
        documentsPayload?.status === "fulfilled" ? documentsPayload.value.data : null;
      setDocumentsUnderReview(
        shouldShowDocumentsUnderReview({
          documents: next.documents,
          driverStatus: next.base?.status || next.profile?.status,
          documentsUnderReview: documentsResponse?.documents_under_review,
          allRequiredDocumentsUploaded: documentsResponse?.all_required_documents_uploaded,
        })
      );
      const nonCoreFailure = failures.find((item) => !["base", "profile"].includes(item.key));
      if (nonCoreFailure) {
        console.warn("Driver profile partial load:", failures);
      }
    }
    setLoading(false);
  }, [authHeaders, token]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (loading) return;
    const shouldOpenDocuments =
      window.location.pathname === "/driver/documents" ||
      window.location.search.includes("section=documents");
    const shouldOpenPayout = window.location.search.includes("section=payout");
    if (!shouldOpenDocuments && !shouldOpenPayout) return;
    if (shouldOpenDocuments) setActiveTab("documents");
    if (shouldOpenPayout) {
      window.setTimeout(() => {
        payoutPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 75);
    }
  }, [loading]);

  const startUpload = (documentType) => {
    pendingDocumentType.current = documentType;
    fileInputRef.current?.click();
  };

  const uploadDocument = async (event) => {
    const file = event.target.files?.[0];
    const documentType = pendingDocumentType.current;
    event.target.value = "";
    if (!file || !documentType) return;

    setError("");
    setSuccessMessage("");
    setUploadingType(documentType);
    const form = new FormData();
    form.append("document_type", documentType);
    form.append("file", file);

    try {
      const uploadResponse = await axios.post(`${API_URL}/drivers/me/documents/upload/`, form, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "multipart/form-data",
        },
      });
      if (uploadResponse?.data?.documents_under_review) {
        setSuccessMessage(DOCUMENTS_UNDER_REVIEW_MESSAGE);
        setDocumentsUnderReview(true);
      }
      await loadProfile();
    } catch (uploadError) {
      setError(uploadError.response?.data?.error || "Document upload failed. Please try again.");
    } finally {
      setUploadingType("");
      pendingDocumentType.current = "";
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("access");
    localStorage.removeItem("refresh");
    localStorage.removeItem("user");
    window.location.href = "/login";
  };

  // Confirm before ending the session; guard against duplicate submissions.
  const confirmLogout = () => {
    if (loggingOut) return;
    setLoggingOut(true);
    handleLogout();
  };

  const handleDocumentsClick = () => {
    setActiveTab("documents");
    window.setTimeout(() => {
      documentsPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  };

  const handlePayoutClick = () => {
    window.setTimeout(() => {
      payoutPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  };

  const handleMenuAction = (action) => {
    if (!action) return;
    if (action === "documents") {
      handleDocumentsClick();
      return;
    }
    if (action === "payout") {
      handlePayoutClick();
      return;
    }
    navigateInApp(action);
  };

  if (loading) {
    return (
      <main className="dp-shell dp-state">
        <DriverLoadingState
          title="Loading your driver profile"
          message="Preparing profile, vehicle, documents, and rewards."
        />
      </main>
    );
  }

  if (error && !data.base && !data.profile) {
    return (
      <main className="dp-shell dp-state">
        <DriverErrorState
          title="Profile unavailable"
          message={error}
          actionLabel="Try again"
          onAction={loadProfile}
        />
        {String(error).toLowerCase().includes("not linked") && (
          <button
            type="button"
            className="dp-retry-btn"
            onClick={() => { window.location.href = "/driver-vehicle-setup"; }}
          >
            Complete driver setup
          </button>
        )}
      </main>
    );
  }

  // --- Derived data (preserving all existing logic) ---
  const base = data.base || {};
  const enhanced = data.profile || {};
  const stats = data.stats || enhanced.stats || {};
  const user = base.user || enhanced.user || {};
  const vehicle = enhanced.vehicle || base.vehicle || {};
  const firstName = getValue(enhanced.first_name, base.first_name, user.first_name, "");
  const lastName = getValue(enhanced.last_name, base.last_name, user.last_name, "");
  const fullName =
    getValue(enhanced.driver_name, base.driver_name, `${firstName} ${lastName}`.trim(), user.full_name) ||
    "Yala Driver";
  const level = String(getValue(enhanced.level?.current_level, base.driver_level, base.driver_category, "bronze")).toLowerCase();
  const isOnline = Boolean(getValue(enhanced.is_available, base.is_available, false));
  const rating = Number(getValue(stats.average_rating, base.average_rating, enhanced.rating, 0));
  const totalRides = getValue(stats.total_rides_completed, stats.total_rides, base.total_rides_completed, base.total_rides, 0);
  const driverPhoto = getValue(enhanced.driver_photo, enhanced.profile_photo, base.driver_photo, base.profile_photo, user.photo_url);
  const make = displayValue(vehicle.make, base.vehicle_make, base.car_make);
  const model = displayValue(vehicle.model, base.vehicle_model, base.car_model);
  const plate = displayValue(vehicle.plate_number, base.vehicle_plate, base.plate_number);
  // Raw vehicle values for the structured summary (rows hidden when absent).
  const vehicleMakeRaw = getValue(vehicle.make, base.vehicle_make, base.car_make);
  const vehicleModelRaw = getValue(vehicle.model, base.vehicle_model, base.car_model);
  const vehicleColorRaw = getValue(vehicle.color, base.vehicle_color, base.car_color);
  const vehiclePlateRaw = getValue(vehicle.plate_number, base.vehicle_plate, base.plate_number);
  const vehicleTypeRaw = getValue(vehicle.car_type, base.car_type, enhanced.car_type);
  const contactPhone = displayValue(base.phone_number, enhanced.phone_number, user.phone_number);
  const contactEmail = displayValue(base.email, enhanced.email, user.email);
  // Raw (unformatted) values for the structured details section — rows are hidden
  // when the value is missing or a placeholder, never rendered as "Not provided".
  const cityRaw = getValue(
    base.city_name, base.city?.name, enhanced.city_name, enhanced.city?.name,
    user.city_name, user.city?.name
  );
  const memberSinceRaw = getValue(base.date_joined, base.created_at, user.date_joined, user.created_at);
  const memberSince = (() => {
    if (!memberSinceRaw) return "";
    const date = new Date(memberSinceRaw);
    if (Number.isNaN(date.getTime())) return "";
    try {
      return date.toLocaleDateString(undefined, { year: "numeric", month: "long" });
    } catch {
      return "";
    }
  })();
  const preferredLanguageRaw = getValue(base.preferred_language, enhanced.preferred_language, user.preferred_language);
  const walletBalance = getValue(
    stats.available_balance,
    stats.withdrawable_balance,
    stats.wallet_balance,
    enhanced.wallet_balance,
    base.wallet_balance,
    0
  );
  const todayEarnings = getValue(stats.today_earnings, enhanced.today_earnings, 1250);
  const weekEarnings = getValue(stats.week_earnings, enhanced.week_earnings, 8750);
  const monthEarnings = getValue(stats.month_earnings, enhanced.month_earnings, 32500);
  const acceptanceRate = getValue(stats.acceptance_rate, enhanced.acceptance_rate, base.acceptance_rate, 92);
  const completionRate = getValue(stats.completion_rate, enhanced.completion_rate, base.completion_rate, 96);
  const cancellationRate = getValue(stats.cancellation_rate, enhanced.cancellation_rate, base.cancellation_rate, 4);
  const levelPoints = Number(getValue(enhanced.level?.points, stats.level_points, 780));
  const nextLevelPoints = Number(getValue(enhanced.level?.next_level_points, stats.next_level_points, 1000));
  const levelProgress = Math.max(0, Math.min(100, Math.round((levelPoints / nextLevelPoints) * 100)));
  const nextLevel = titleCase(getValue(enhanced.level?.next_level, stats.next_level, "diamond"));

  const documentsByType = DOCUMENT_TYPES.map((item) => ({
    item,
    document: findDocumentByType(data.documents, item.type),
  }));
  const approvedDocuments = documentsByType.filter(
    ({ document, item }) => ["approved", "valid", "expiring_soon"].includes(getDocumentStatus(document, item))
  ).length;

  const shortDocumentCards = [
    { type: "license", label: "Driver License", icon: "🪪" },
    { type: "insurance", label: "Insurance", icon: "🛡️" },
    { type: "carte_grise", label: "Registration", icon: "📋" },
    { type: "vignette", label: "Vignette", icon: "🏷️" },
  ].map((item) => ({
    ...item,
    document: findDocumentByType(data.documents, item.type),
  }));

  const approvalStatus = getValue(enhanced.status, base.status, "pending");
  const approvalNotice = getDriverApprovalNotice(
    { ...base, ...enhanced, status: approvalStatus },
    data.documents
  );

  const statusBadgeLabel = (status) => {
    const map = {
      valid: getDocumentMenuStatusLabel("valid"),
      approved: getDocumentMenuStatusLabel("valid"),
      expiring_soon: getDocumentMenuStatusLabel("expiring_soon"),
      pending: "Pending Review",
      pending_review: "Pending Review",
      needs_review: "Pending Review",
      under_review: "Pending Review",
      submitted: "Pending Review",
      rejected: "Rejected",
      expired: getDocumentMenuStatusLabel("expired"),
      missing: getDocumentMenuStatusLabel("expired"),
    };
    return map[status] || titleCase(status);
  };

  return (
    <main className={`dp-shell${isDriverYalaUI() ? " dp-shell--lyft" : ""}`}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,application/pdf"
        onChange={uploadDocument}
        hidden
      />

      {/* Top Bar */}
      <header className="dp-topbar">
        <button
          type="button"
          className="dp-topbar-btn"
          aria-label="Back to driver dashboard"
          onClick={() => (onBack ? onBack() : (window.location.href = "/driver"))}
        >
          ←
        </button>
        <h1 className="dp-topbar-title">Profile</h1>
        <button
          type="button"
          className="dp-topbar-btn"
          aria-label="Open driver settings"
          onClick={() => handleMenuAction("/settings")}
        >
          ⚙
        </button>
      </header>

      <div className="dp-content">
        {error && <div className="dp-alert">{error}</div>}
        {successMessage && <div className="dp-success">{successMessage}</div>}
        {approvalStatus !== "approved" && (() => {
          const meta = getAccountStatusMeta(approvalStatus);
          const isProblem = meta.intent === "danger";
          return (
            <section
              className={`dp-status-card dp-status-card--${meta.intent}`}
              role={isProblem ? "alert" : "status"}
              aria-label={`Account status: ${meta.label}`}
            >
              <span className="dp-status-card__icon" aria-hidden="true">{meta.icon}</span>
              <div className="dp-status-card__body">
                <div className="dp-status-card__head">
                  <span className="dp-status-card__title">Account status</span>
                  <Badge intent={meta.intent}>{meta.label}</Badge>
                </div>
                {approvalNotice && (
                  <p className="dp-status-card__notice">{approvalNotice}</p>
                )}
                {isProblem && (
                  <button
                    type="button"
                    className="dp-status-card__action"
                    onClick={() => handleMenuAction("/driver/support")}
                  >
                    Get help
                  </button>
                )}
              </div>
            </section>
          );
        })()}

        {/* Hero Section */}
        <section className="dp-hero">
          <div className="dp-hero-photo">
            <div className="dp-photo-ring">
              {driverPhoto ? (
                <img src={driverPhoto} alt={fullName} />
              ) : (
                <span className="dp-photo-initials">{initials(fullName)}</span>
              )}
            </div>
            <span className={`dp-online-dot ${isOnline ? "online" : ""}`} />
          </div>
          <div className="dp-hero-info">
            <div className="dp-hero-name-row">
              <h2 className="dp-hero-name">{fullName}</h2>
              {approvalStatus === "approved" && (
                <span
                  className="dp-verified"
                  role="img"
                  aria-label="Verified driver"
                  title="Verified driver"
                >
                  ✓
                </span>
              )}
            </div>
            <p className="dp-hero-phone">{contactPhone}</p>
            <p className="dp-hero-email">{contactEmail}</p>
            <div className="dp-hero-vehicle">
              <span className="dp-vehicle-icon">🚗</span>
              <span>{make} {model}</span>
              <span className="dp-plate-badge">{plate}</span>
            </div>
          </div>
        </section>

        {/* Level Card */}
        <section className="dp-level-card">
          <div className="dp-level-header">
            <div className="dp-level-current">
              <span className="dp-level-label">Driver Level</span>
              <strong className="dp-level-name">{titleCase(level)}</strong>
            </div>
            <div className="dp-level-next">
              <span className="dp-level-label">Next Level</span>
              <strong className="dp-level-name">{nextLevel}</strong>
            </div>
          </div>
          <div className="dp-level-progress-wrap">
            <div className="dp-level-bar">
              <div className="dp-level-bar-fill" style={{ width: `${levelProgress}%` }} />
            </div>
            <div className="dp-level-points">
              <span>{levelPoints} pts</span>
              <span>{nextLevelPoints} pts needed</span>
            </div>
          </div>
        </section>

        {/* Personal Information */}
        <section className="dp-section-card">
          <h3 className="dp-section-title">Personal information</h3>
          <div className="dp-detail-list">
            <DetailRow label="Phone" value={contactPhone} />
            <DetailRow label="Email" value={contactEmail} />
            <DetailRow label="City" value={cityRaw} />
            <DetailRow label="Preferred language" value={titleCase(preferredLanguageRaw)} />
            <DetailRow label="Member since" value={memberSince} />
          </div>
          <button
            type="button"
            className="dp-row-btn dp-detail-edit"
            onClick={() => handleMenuAction("/driver/profile/edit")}
          >
            <span className="dp-row-icon">✏️</span>
            <span className="dp-row-text">
              <strong>Edit profile</strong>
              <small>Update your personal and vehicle details</small>
            </span>
            <span className="dp-row-arrow">›</span>
          </button>
        </section>

        {/* Vehicle Summary */}
        <section className="dp-section-card" aria-label="Vehicle summary">
          <div className="dp-section-header">
            <h3 className="dp-section-title">Vehicle</h3>
            {vehiclePlateRaw && !isPlaceholderDisplayValue(vehiclePlateRaw) && (
              <span className="dp-plate-badge">{vehiclePlateRaw}</span>
            )}
          </div>
          <div className="dp-detail-list">
            <DetailRow label="Make" value={vehicleMakeRaw} />
            <DetailRow label="Model" value={vehicleModelRaw} />
            <DetailRow label="Color" value={titleCase(vehicleColorRaw)} />
            <DetailRow label="Type" value={titleCase(vehicleTypeRaw)} />
            <DetailRow label="Plate number" value={vehiclePlateRaw} />
          </div>
          <button
            type="button"
            className="dp-row-btn dp-detail-edit"
            onClick={() => documentsPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
          >
            <span className="dp-row-icon">🚗</span>
            <span className="dp-row-text">
              <strong>Vehicle &amp; documents</strong>
              <small>View your vehicle documents</small>
            </span>
            <span className="dp-row-arrow">›</span>
          </button>
        </section>

        {/* Document Status Summary */}
        {(() => {
          const docSummary = summarizeDocuments(documentsByType);
          return (
            <section
              className="dp-section-card dp-doc-summary"
              aria-label={`Document status: ${docSummary.label}`}
            >
              <div className="dp-section-header">
                <h3 className="dp-section-title">Document status</h3>
                <Badge intent={docSummary.intent}>{docSummary.label}</Badge>
              </div>
              <p className="dp-doc-summary__warning">
                <span aria-hidden="true">{docSummary.intent === "success" ? "✓" : "⚠️"}</span>{" "}
                {docSummary.warning}
              </p>
              <p className="dp-doc-summary__count">
                {approvedDocuments}/{DOCUMENT_TYPES.length} documents approved
              </p>
              <button
                type="button"
                className="dp-row-btn dp-detail-edit"
                onClick={() => documentsPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
              >
                <span className="dp-row-icon">📄</span>
                <span className="dp-row-text">
                  <strong>Manage documents</strong>
                  <small>View and update your documents</small>
                </span>
                <span className="dp-row-arrow">›</span>
              </button>
            </section>
          );
        })()}

        {/* Wallet Section */}
        <section className="dp-section-card">
          <h3 className="dp-section-title">Wallet</h3>
          <div className="dp-wallet-balance">
            <span className="dp-wallet-label">Balance</span>
            <strong className="dp-wallet-amount">{formatMRU(walletBalance)}</strong>
          </div>
          <div className="dp-wallet-rows">
            <button type="button" className="dp-row-btn" onClick={() => handleMenuAction("payout")}>
              <span className="dp-row-icon">💳</span>
              <span className="dp-row-text">
                <strong>Payment methods</strong>
                <small>Cash, wallet, and payout settings</small>
              </span>
              <span className="dp-row-arrow">›</span>
            </button>
            <button type="button" className="dp-row-btn" onClick={() => handleMenuAction("payout")}>
              <span className="dp-row-icon">📜</span>
              <span className="dp-row-text">
                <strong>Payment history</strong>
                <small>Review payments and withdrawals</small>
              </span>
              <span className="dp-row-arrow">›</span>
            </button>
          </div>
        </section>

        {/* Activity Section */}
        <section className="dp-section-card">
          <h3 className="dp-section-title">Activity</h3>
          <div className="dp-stats-grid">
            <div className="dp-stat-item">
              <strong>{Number(totalRides || 0).toLocaleString()}</strong>
              <span>Total Rides</span>
            </div>
            <div className="dp-stat-item">
              <strong>{formatMRU(todayEarnings)}</strong>
              <span>Today</span>
            </div>
            <div className="dp-stat-item">
              <strong>{formatMRU(weekEarnings)}</strong>
              <span>This Week</span>
            </div>
            <div className="dp-stat-item">
              <strong>{formatMRU(monthEarnings)}</strong>
              <span>This Month</span>
            </div>
          </div>
          <div className="dp-activity-rows">
            <button type="button" className="dp-row-btn" onClick={() => handleMenuAction("/driver/history")}>
              <span className="dp-row-icon">🚕</span>
              <span className="dp-row-text">
                <strong>Ride history</strong>
                <small>{Number(totalRides || 0).toLocaleString()} completed rides</small>
              </span>
              <span className="dp-row-arrow">›</span>
            </button>
            <button type="button" className="dp-row-btn" onClick={() => handleMenuAction("/driver/earnings")}>
              <span className="dp-row-icon">💰</span>
              <span className="dp-row-text">
                <strong>Earnings</strong>
                <small>{formatMRU(monthEarnings)} this month</small>
              </span>
              <span className="dp-row-arrow">›</span>
            </button>
            <button type="button" className="dp-row-btn" onClick={() => handleMenuAction("/driver/feedback")}>
              <span className="dp-row-icon">⭐</span>
              <span className="dp-row-text">
                <strong>Ratings</strong>
                <small>{rating > 0 ? `${rating.toFixed(1)} average` : "No rating yet"}</small>
              </span>
              <span className="dp-row-arrow">›</span>
            </button>
          </div>
          <div className="dp-rates-grid">
            <div className="dp-rate-item">
              <span className="dp-rate-value dp-rate-green">{acceptanceRate}%</span>
              <span className="dp-rate-label">Acceptance</span>
            </div>
            <div className="dp-rate-item">
              <span className="dp-rate-value dp-rate-green">{completionRate}%</span>
              <span className="dp-rate-label">Completion</span>
            </div>
            <div className="dp-rate-item">
              <span className="dp-rate-value dp-rate-red">{cancellationRate}%</span>
              <span className="dp-rate-label">Cancellation</span>
            </div>
          </div>
        </section>

        {/* Documents Section */}
        <section className="dp-section-card" ref={documentsPanelRef}>
          <div className="dp-section-header">
            <h3 className="dp-section-title">Documents</h3>
            <span className="dp-doc-count">{approvedDocuments}/{DOCUMENT_TYPES.length} approved</span>
          </div>
          {documentsUnderReview && <DocumentsUnderReviewBanner />}
          <div className="dp-doc-grid">
            {shortDocumentCards.map(({ type, label, icon, document }) => {
              const status = getDocumentStatus(document, { required: true });
              return (
                <button
                  type="button"
                  key={type}
                  className="dp-doc-card"
                  onClick={() => startUpload(type)}
                >
                  <span className="dp-doc-icon">{icon}</span>
                  <strong className="dp-doc-label">{label}</strong>
                  <span className={`dp-doc-status dp-doc-status--${status}`}>
                    {statusBadgeLabel(status)}
                  </span>
                </button>
              );
            })}
          </div>
          {/* Full document upload rows */}
          <div className="dp-doc-full-list">
            {["Driver Documents", "Vehicle Documents"].map((group) => (
              <div key={group} className="dp-doc-group">
                <h4 className="dp-doc-group-title">{group}</h4>
                {documentsByType
                  .filter(({ item }) => item.group === group)
                  .map(({ item, document }) => (
                    <DocumentRow
                      key={item.type}
                      item={item}
                      document={document}
                      uploading={uploadingType === item.type}
                      onUpload={() => startUpload(item.type)}
                    />
                  ))}
              </div>
            ))}
          </div>
        </section>

        {/* Payout Panel */}
        <div ref={payoutPanelRef}>
          <DriverPayoutPanel
            authHeaders={authHeaders}
            onMessage={(message) => {
              setError("");
              setSuccessMessage(message);
            }}
          />
        </div>

        {/* Trusted Contacts */}
        <section className="dp-section-card">
          <TrustedContactsSection compact />
        </section>

        {/* Support Section */}
        <section className="dp-section-card">
          <h3 className="dp-section-title">Support</h3>
          <div className="dp-support-rows">
            <button type="button" className="dp-row-btn" onClick={() => handleMenuAction("/driver/support")}>
              <span className="dp-row-icon">❓</span>
              <span className="dp-row-text">
                <strong>Help Center</strong>
                <small>Common questions and answers</small>
              </span>
              <span className="dp-row-arrow">›</span>
            </button>
            <button type="button" className="dp-row-btn" onClick={() => handleMenuAction("/driver/support")}>
              <span className="dp-row-icon">💬</span>
              <span className="dp-row-text">
                <strong>Contact Support</strong>
                <small>Get help from Yala team</small>
              </span>
              <span className="dp-row-arrow">›</span>
            </button>
            <button type="button" className="dp-row-btn" onClick={() => handleMenuAction("/driver/support")}>
              <span className="dp-row-icon">📖</span>
              <span className="dp-row-text">
                <strong>FAQ</strong>
                <small>Frequently asked questions</small>
              </span>
              <span className="dp-row-arrow">›</span>
            </button>
          </div>
        </section>

        {/* Settings Section */}
        <section className="dp-section-card">
          <h3 className="dp-section-title">Settings</h3>
          <div className="dp-settings-rows">
            <button type="button" className="dp-row-btn" onClick={() => handleMenuAction("/driver/profile/edit")}>
              <span className="dp-row-icon">👤</span>
              <span className="dp-row-text">
                <strong>Account settings</strong>
                <small>Edit your profile information</small>
              </span>
              <span className="dp-row-arrow">›</span>
            </button>
            <button type="button" className="dp-row-btn" onClick={() => handleMenuAction("/settings")}>
              <span className="dp-row-icon">🌐</span>
              <span className="dp-row-text">
                <strong>Language</strong>
                <small>App language preferences</small>
              </span>
              <span className="dp-row-arrow">›</span>
            </button>
            <button type="button" className="dp-row-btn" onClick={() => handleMenuAction("/settings")}>
              <span className="dp-row-icon">🔔</span>
              <span className="dp-row-text">
                <strong>Notifications</strong>
                <small>Push and in-app notifications</small>
              </span>
              <span className="dp-row-arrow">›</span>
            </button>
            <button type="button" className="dp-row-btn" onClick={() => handleMenuAction("/settings")}>
              <span className="dp-row-icon">🔒</span>
              <span className="dp-row-text">
                <strong>Security</strong>
                <small>Password and 2FA settings</small>
              </span>
              <span className="dp-row-arrow">›</span>
            </button>
          </div>
        </section>

        {/* Logout */}
        <button
          type="button"
          className="dp-logout-btn"
          onClick={() => setLogoutOpen(true)}
          aria-haspopup="dialog"
        >
          <span aria-hidden="true">↪</span>
          Logout
        </button>
      </div>

      <ConfirmationDialog
        open={logoutOpen}
        danger
        title="Log out?"
        confirmLabel={loggingOut ? "Logging out…" : "Log out"}
        cancelLabel="Cancel"
        onConfirm={confirmLogout}
        onCancel={() => setLogoutOpen(false)}
      >
        You&apos;ll need to sign in again to access your driver account on this device.
      </ConfirmationDialog>

      {/* Bottom Navigation */}
      <nav className="dp-bottom-nav">
        <button type="button" className="dp-nav-tab" onClick={() => handleMenuAction("/driver")}>
          <span className="dp-nav-icon">⌂</span>
          <span className="dp-nav-label">Home</span>
        </button>
        <button type="button" className="dp-nav-tab" onClick={() => handleMenuAction("/driver/history")}>
          <span className="dp-nav-icon">🚗</span>
          <span className="dp-nav-label">Rides</span>
        </button>
        <button type="button" className="dp-nav-tab dp-nav-tab--online" onClick={() => handleMenuAction("/driver")}>
          <span className="dp-nav-online-btn">
            <span className={isOnline ? "online" : ""}>⏻</span>
          </span>
          <span className="dp-nav-label">Online</span>
        </button>
        <button type="button" className="dp-nav-tab" onClick={() => handleMenuAction("/driver/earnings")}>
          <span className="dp-nav-icon">💵</span>
          <span className="dp-nav-label">Earnings</span>
        </button>
        <button type="button" className="dp-nav-tab dp-nav-tab--active" aria-current="page">
          <span className="dp-nav-icon" aria-hidden="true">👤</span>
          <span className="dp-nav-label">Profile</span>
        </button>
      </nav>
    </main>
  );
}

function DetailRow({ label, value }) {
  const text = String(value ?? "").trim();
  if (!text || isPlaceholderDisplayValue(text)) return null;
  return (
    <div className="dp-detail-row">
      <span className="dp-detail-label">{label}</span>
      <span className="dp-detail-value">{text}</span>
    </div>
  );
}

function DocumentRow({ item, document, uploading, onUpload }) {
  const status = getDocumentStatus(document, item);
  const labels = {
    valid: getDocumentMenuStatusLabel("valid"),
    approved: getDocumentMenuStatusLabel("valid"),
    expiring_soon: getDocumentMenuStatusLabel("expiring_soon"),
    pending: "Pending Review",
    pending_review: "Pending Review",
    needs_review: "Pending Review",
    under_review: "Pending Review",
    submitted: "Pending Review",
    rejected: "Rejected",
    expired: getDocumentMenuStatusLabel("expired"),
    missing: getDocumentMenuStatusLabel("expired"),
  };

  const daysRemaining =
    document?.days_until_expiry ??
    (document?.expires_at
      ? Math.ceil(
          (new Date(document.expires_at) - new Date(new Date().toDateString())) /
            (1000 * 60 * 60 * 24)
        )
      : null);

  return (
    <div className="dp-doc-row">
      <div className="dp-doc-row-info">
        <strong>{item.label}</strong>
        <small>
          {status === "expiring_soon" && daysRemaining !== null
            ? `Expiring in ${daysRemaining} day${daysRemaining === 1 ? "" : "s"}`
            : document?.expires_at
              ? `Expires ${document.expires_at}`
              : "No expiry set"}
        </small>
      </div>
      <span className={`dp-doc-status dp-doc-status--${status}`}>
        {labels[status] || titleCase(status)}
      </span>
      <div className="dp-doc-row-actions">
        {document?.file && (
          <a href={document.file} target="_blank" rel="noreferrer" className="dp-doc-preview-link">
            Preview
          </a>
        )}
        <button type="button" className="dp-doc-upload-btn" onClick={onUpload} disabled={uploading}>
          {uploading ? "Uploading..." : document?.file ? "Re-upload" : "Upload"}
        </button>
      </div>
    </div>
  );
}
