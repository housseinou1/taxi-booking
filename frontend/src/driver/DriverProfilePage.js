import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";

import { API_URL } from "../apiConfig";
import "./DriverProfilePage.css";

const DOCUMENT_TYPES = [
  { type: "license", label: "Driver License", group: "Driver Documents" },
  { type: "national_id", label: "National ID", group: "Driver Documents" },
  { type: "insurance", label: "Insurance", group: "Vehicle Documents" },
  { type: "carte_grise", label: "Carte Grise", group: "Vehicle Documents" },
  { type: "vignette", label: "Vignette", group: "Vehicle Documents" },
  { type: "vehicle_registration", label: "Vehicle Registration", group: "Vehicle Documents" },
  { type: "plate_number", label: "Plate Number", group: "Vehicle Documents" },
];

const ACCORDION_SECTIONS = [
  {
    id: "earn",
    title: "More Ways to Earn",
    rows: [
      ["Scheduled Rides", "View and prepare for upcoming scheduled trips", "/driver/history"],
      ["Refer a friend", "Invite drivers and earn Yala referral rewards", "/driver/support"],
    ],
  },
  {
    id: "vehicle",
    title: "Vehicle and Devices",
  },
  {
    id: "feedback",
    title: "Feedback and Rewards",
    rows: [
      ["Ratings", "View your rider rating history", "/driver/feedback"],
      ["Rider reviews", "Read recent rider feedback", "/driver/feedback"],
      ["Driver achievements", "Track earned Yala badges", "/driver/achievements"],
      ["Rewards history", "Review rewards and recognition", "/driver/achievements"],
    ],
  },
  {
    id: "account",
    title: "Account",
  },
  {
    id: "support",
    title: "Support and Resources",
    rows: [
      ["Safety Hub", "Safety tools and trusted ride guidance", "/driver/support"],
      ["Help Center", "Common driver questions and answers", "/driver/support"],
      ["Learning Center", "Improve service quality with Yala tips", "/driver/support"],
    ],
  },
];

const getValue = (...values) => values.find((value) => value !== undefined && value !== null && value !== "");
const displayValue = (...values) => getValue(...values) || "Not provided";
const titleCase = (value = "") =>
  String(value)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const getDocumentStatus = (document) => {
  if (!document?.file) return "missing";
  const expired = document.days_until_expiry !== undefined && document.days_until_expiry !== null && document.days_until_expiry < 0;
  if (expired) return "expired";
  return document.status || "pending";
};

const documentNeedsAttention = (document) => {
  const status = getDocumentStatus(document);
  return ["expired", "rejected", "missing", "pending", "pending_review", "needs_review", "under_review", "submitted"].includes(status);
};

const initials = (name) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "YD";

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
  const [openSections, setOpenSections] = useState(() => new Set(["account"]));
  const fileInputRef = useRef(null);
  const pendingDocumentType = useRef("");
  const documentsPanelRef = useRef(null);
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

    responses.forEach((response, index) => {
      if (response.status !== "fulfilled") return;
      const [key] = endpoints[index];
      const payload = response.value.data;
      if (key === "documents") next.documents = payload.documents || payload.results || [];
      else if (key === "reviews") next.reviews = payload.results || payload.reviews || [];
      else if (key === "achievements") next.achievements = payload.achievements || payload.results || [];
      else next[key] = payload;
    });

    if (!next.base && !next.profile) {
      setError("We could not load your driver profile. Please try again.");
    } else {
      setData(next);
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
    if (!shouldOpenDocuments) return;
    setOpenSections((current) => new Set([...current, "account"]));
    window.setTimeout(() => {
      documentsPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 75);
  }, [loading]);

  const toggleSection = (sectionId) => {
    setOpenSections((current) => {
      const next = new Set(current);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  };

  const startUpload = (documentType) => {
    pendingDocumentType.current = documentType;
    fileInputRef.current?.click();
  };

  const uploadDocument = async (event) => {
    const file = event.target.files?.[0];
    const documentType = pendingDocumentType.current;
    event.target.value = "";
    if (!file || !documentType) return;

    setUploadingType(documentType);
    const form = new FormData();
    form.append("document_type", documentType);
    form.append("file", file);

    try {
      await axios.post(`${API_URL}/drivers/me/documents/upload/`, form, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "multipart/form-data",
        },
      });
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

  const handleDocumentsClick = () => {
    setOpenSections((current) => new Set([...current, "account"]));
    window.setTimeout(() => {
      documentsPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  };

  const handleMenuAction = (action) => {
    if (!action) return;
    if (action === "documents") {
      handleDocumentsClick();
      return;
    }
    window.location.href = action;
  };

  if (loading) {
    return (
      <main className="driver-profile-shell driver-profile-state">
        <div className="driver-profile-loader" />
        <strong>Loading your driver profile</strong>
        <span>Preparing profile, vehicle, documents, and rewards.</span>
      </main>
    );
  }

  if (error && !data.base && !data.profile) {
    return (
      <main className="driver-profile-shell driver-profile-state">
        <strong>Profile unavailable</strong>
        <span>{error}</span>
        <button type="button" className="driver-profile-action" onClick={loadProfile}>
          Try again
        </button>
      </main>
    );
  }

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
  const yearsDriving = getValue(stats.years_driving, base.years_driving, enhanced.years_driving, 0);
  const driverPhoto = getValue(enhanced.driver_photo, enhanced.profile_photo, base.driver_photo, base.profile_photo, user.photo_url);
  const make = displayValue(vehicle.make, base.vehicle_make, base.car_make);
  const model = displayValue(vehicle.model, base.vehicle_model, base.car_model);
  const plate = displayValue(vehicle.plate_number, base.vehicle_plate, base.plate_number);
  const vehiclePhoto = getValue(vehicle.photo_url, vehicle.photo, base.vehicle_photo_url, base.vehicle_photo);
  const documentsByType = DOCUMENT_TYPES.map((item) => ({
    item,
    document: data.documents.find((doc) => doc.document_type === item.type),
  }));
  const approvedDocuments = documentsByType.filter(({ document }) => getDocumentStatus(document) === "approved").length;
  const documentsNeedingAttention = documentsByType.filter(({ document }) => documentNeedsAttention(document)).length;
  const hasDocumentAttention = documentsNeedingAttention > 0;

  const vehicleRows = [
    ["Your Vehicle", `${make} ${model} · ${plate}`.trim(), "/driver/profile/edit"],
    ["Amp", "Manage Yala display and driver visibility", "/settings"],
    ["Your recording devices", vehiclePhoto ? "Vehicle media and recording setup" : "Add vehicle media and recording setup", "documents"],
    ["Order emblem and airport docs", "Yala emblem, airport permits, and vehicle documents", "documents"],
  ];

  const accountRows = [
    ["Your Info", displayValue(base.email, enhanced.email, user.email), "/driver/profile/edit"],
    ["Pay and Tax Info", "Payment setup and tax records", "/driver/earnings"],
    ["Documents", `${approvedDocuments}/${DOCUMENT_TYPES.length} approved`, "documents"],
    ["Settings", "App, privacy, and notification settings", "/settings"],
    ["Dashboard", "Return to driver dashboard", "/driver"],
  ];

  return (
    <main className="driver-profile-shell">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,application/pdf"
        onChange={uploadDocument}
        hidden
      />

      <section className="driver-profile-card">
        <button
          type="button"
          className="driver-profile-close"
          aria-label="Close profile"
          onClick={() => (onBack ? onBack() : (window.location.href = "/driver"))}
        >
          ×
        </button>

        {error && <div className="driver-profile-alert">{error}</div>}

        <div className="driver-profile-brandbar">
          <span>Yala</span>
          <strong>Driver Center</strong>
        </div>

        <header className="driver-profile-header">
          <div className="driver-photo-block">
            <div className="driver-photo-ring">
              {driverPhoto ? <img src={driverPhoto} alt={fullName} /> : <span>{initials(fullName)}</span>}
            </div>
            <button type="button" className={`driver-level-pill ${level}`} onClick={() => handleMenuAction("/driver/achievements")}>
              <span>Y</span>
              {titleCase(level)}
              <b>›</b>
            </button>
          </div>

          <div className="driver-title-block">
            <h1>{fullName}</h1>
            <p>{make} {model} · {plate}</p>
            <button type="button" onClick={() => (window.location.href = "/driver/profile/edit")}>
              Edit driver profile
            </button>
            <div className="driver-status-line">
              <span className={isOnline ? "online" : "offline"} />
              {isOnline ? "Online" : "Offline"}
            </div>
          </div>
        </header>

        <section className="driver-summary-card" aria-label="Driver summary">
          <SummaryStat label="Rides" value={totalRides} />
          <SummaryStat label="Rating" value={rating > 0 ? rating.toFixed(1) : "New"} prefix={rating > 0 ? "★" : ""} />
          <SummaryStat label="Years" value={yearsDriving} />
        </section>

        <div className="driver-accordion-list">
          {ACCORDION_SECTIONS.map((section) => (
            <AccordionSection
              key={section.id}
              id={section.id}
              title={section.title}
              open={openSections.has(section.id)}
              hasAlert={section.id === "account" && hasDocumentAttention}
              onToggle={() => toggleSection(section.id)}
            >
              {section.id === "vehicle" && (
                <div className="driver-vehicle-panel">
                  <div className="driver-vehicle-photo">
                    {vehiclePhoto ? <img src={vehiclePhoto} alt={`${make} ${model}`} /> : <span>YALA</span>}
                  </div>
                  <div className="driver-menu-rows">
                    {vehicleRows.map(([label, detail, action]) => (
                      <MenuRow key={label} label={label} detail={detail} onClick={() => handleMenuAction(action)} />
                    ))}
                  </div>
                </div>
              )}

              {section.id === "account" && (
                <>
                  <div className="driver-menu-rows">
                    {accountRows.map(([label, detail, action]) => (
                      <MenuRow key={label} label={label} detail={detail} onClick={() => handleMenuAction(action)} />
                    ))}
                  </div>

                  <div className="driver-documents-panel" ref={documentsPanelRef}>
                    {["Driver Documents", "Vehicle Documents"].map((group) => (
                      <section key={group}>
                        <h3>{group}</h3>
                        {documentsByType.filter(({ item }) => item.group === group).map(({ item, document }) => {
                          return (
                            <DocumentRow
                              key={item.type}
                              item={item}
                              document={document}
                              uploading={uploadingType === item.type}
                              onUpload={() => startUpload(item.type)}
                            />
                          );
                        })}
                      </section>
                    ))}
                  </div>
                </>
              )}

              {section.rows && (
                <div className="driver-menu-rows">
                  {section.rows.map(([label, detail, action]) => (
                    <MenuRow key={label} label={label} detail={detail} onClick={() => handleMenuAction(action)} />
                  ))}
                </div>
              )}
            </AccordionSection>
          ))}
        </div>

        <button type="button" className="driver-logout-row" onClick={handleLogout}>
          <span aria-hidden="true">↪</span>
          Log out
        </button>
      </section>
    </main>
  );
}

function SummaryStat({ label, value, prefix = "" }) {
  return (
    <div>
      <strong>{prefix}{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function AccordionSection({ title, open, hasAlert, onToggle, children }) {
  return (
    <section className={`driver-accordion-section ${open ? "open" : ""}`}>
      <button type="button" className="driver-accordion-trigger" onClick={onToggle} aria-expanded={open}>
        <span>{title}</span>
        <i aria-hidden="true" className={hasAlert ? "has-alert" : ""} />
        <b aria-hidden="true">{open ? "⌃" : "⌄"}</b>
      </button>
      {open && <div className="driver-accordion-content">{children}</div>}
    </section>
  );
}

function MenuRow({ label, detail, alert, onClick }) {
  return (
    <button type="button" className="driver-menu-row" onClick={onClick}>
      <span className="driver-menu-icon" aria-hidden="true">{label.charAt(0)}</span>
      <span>
        <strong>{label}</strong>
        {detail && <small>{detail}</small>}
      </span>
      {alert && <em>!</em>}
    </button>
  );
}

function DocumentRow({ item, document, uploading, onUpload }) {
  const status = getDocumentStatus(document);
  const labels = {
    approved: "Approved",
    pending: "Pending",
    pending_review: "Pending",
    needs_review: "Pending",
    under_review: "Pending",
    submitted: "Pending",
    rejected: "Rejected",
    expired: "Expired",
    missing: "Missing",
  };

  return (
    <article className="driver-document-row">
      <div>
        <strong>{item.label}</strong>
        <small>{document?.file ? "Uploaded" : "Missing"}</small>
      </div>
      <span className={`driver-document-status ${status}`}>{labels[status] || titleCase(status)}</span>
      <small>{document?.expires_at ? `Expires ${document.expires_at}` : "Expiration date not set"}</small>
      <div>
        {document?.file && <a href={document.file} target="_blank" rel="noreferrer">Preview</a>}
        <button type="button" onClick={onUpload} disabled={uploading}>
          {uploading ? "Uploading..." : document ? "Re-upload" : "Upload"}
        </button>
      </div>
    </article>
  );
}
