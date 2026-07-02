import React, { useCallback, useEffect, useState } from "react";

import { API_URL } from "../apiConfig";
import CourierSubpageShell from "./CourierSubpageShell";
import { DELIVERY_VEHICLE_TYPES } from "./deliveryVehicleTypes";
import { apiRequest } from "./DeliveryShared";
import {
  buildDocumentMap,
  getDocumentDisplayStatus,
  getExpiredOrMissingDocuments,
  getRequiredCourierDocumentTypes,
} from "./deliveryDocumentReview";
import { getCourierLevelInfo } from "./deliveryCourierLevel";
import "./delivery-courier-profile.css";
import "./delivery-courier-flow.css";

const VEHICLE_TYPE_ORDER = ["bicycle", "motorcycle", "car"];
const ORDERED_VEHICLE_TYPES = VEHICLE_TYPE_ORDER.map((key) =>
  DELIVERY_VEHICLE_TYPES.find((item) => item.key === key)
).filter(Boolean);

const DOC_STATUS = {
  approved: { label: "Approved", icon: "✓", tone: "success" },
  expires_soon: { label: "Expires soon", icon: "⚠", tone: "warning" },
  pending_review: { label: "Pending review", icon: "⏳", tone: "review" },
  expired: { label: "Expired", icon: "✕", tone: "danger" },
  rejected: { label: "Rejected", icon: "✕", tone: "danger" },
  missing: { label: "Not uploaded", icon: "○", tone: "muted" },
  uploaded: { label: "Uploaded", icon: "✓", tone: "review" },
};

const MENU_ITEMS = [
  { icon: "👤", label: "Courier Profile", subtitle: "View and edit profile", path: "/delivery/account" },
  { icon: "💰", label: "Earnings", subtitle: "Track your earnings", path: "/delivery/earnings" },
  { icon: "📋", label: "Delivery History", subtitle: "View all deliveries", path: "/delivery/history" },
  { icon: "📄", label: "Documents", subtitle: "Manage documents", path: "/delivery/documents", badgeKey: "documents" },
  { icon: "🔢", label: "Courier Code", subtitle: "Share your code", path: "/delivery/account#courier-code" },
  { icon: "🏦", label: "Payment / Withdrawals", subtitle: "Withdraw earnings", path: "/delivery/bank" },
  { icon: "👛", label: "Wallet", subtitle: "Your balance", path: "/delivery/wallet" },
  { icon: "🛵", label: "Delivery Type", subtitle: "Bicycle • Motorcycle • Vehicle", path: "/delivery/account#delivery-type" },
];

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatPoints(value) {
  const numeric = Number(value || 0);
  return numeric.toLocaleString();
}

function formatMRU(value) {
  return `${Number(value || 0).toLocaleString()} MRU`;
}

function DocumentRow({ document, onManage }) {
  const meta = DOC_STATUS[document.ui_status] || DOC_STATUS.missing;
  return (
    <button type="button" className="courier-profile__doc-row" onClick={onManage}>
      <div className="courier-profile__doc-main">
        <span className="courier-profile__doc-label">{document.label}</span>
        <span className={`courier-profile__doc-status is-${meta.tone}`}>
          {meta.label}
        </span>
      </div>
      <div className="courier-profile__doc-meta">
        {document.expires_at ? <small>Expires {formatDate(document.expires_at)}</small> : null}
        <span className={`courier-profile__doc-icon is-${meta.tone}`} aria-hidden>
          {meta.icon}
        </span>
      </div>
    </button>
  );
}

export default function DeliveryCourierProfileDashboard() {
  const [data, setData] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const courierLogout = () => {
    localStorage.removeItem("access");
    localStorage.removeItem("refresh");
    localStorage.removeItem("user");
    window.location.href = "/login?next=/delivery/courier";
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [profilePayload, docsPayload] = await Promise.all([
        apiRequest(`${API_URL}/deliveries/courier/account/`),
        apiRequest(`${API_URL}/drivers/me/documents/?context=delivery`).catch(() => []),
      ]);
      setData(profilePayload);
      setDocuments(docsPayload?.documents || docsPayload?.results || docsPayload || []);
    } catch (err) {
      setError(err.message || "Could not load courier profile.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Compute document alerts
  const documentAlertCount = (() => {
    try {
      const docTypes = getRequiredCourierDocumentTypes(data?.courier_type || "motorcycle");
      const alerts = getExpiredOrMissingDocuments(documents, docTypes);
      return alerts?.length || 0;
    } catch {
      return 0;
    }
  })();

  const lifetime = data?.lifetime || {};
  const today = data?.today || {};
  const requiredDocTypes = getRequiredCourierDocumentTypes(data?.courier_type || "motorcycle");
  const uploadedDocMap = buildDocumentMap(documents);
  const profileDocuments =
    Array.isArray(data?.documents) && data.documents.length
      ? data.documents
      : requiredDocTypes.map((docType) => {
          const uploaded = uploadedDocMap[docType.key];
          return {
            type: docType.key,
            label: docType.label,
            expires_at: uploaded?.expires_at,
            ui_status: getDocumentDisplayStatus(uploaded),
          };
        });
  const levelInfo = getCourierLevelInfo(data || {});
  const points = levelInfo.points;
  const pointsTarget = levelInfo.nextLevelPoints;
  const pointsPercent = Math.min(100, Math.round((Number(points || 0) / Number(pointsTarget || 3000)) * 100));
  const courierLevel = levelInfo.label;
  const deliveryTypeLabel = data?.courier_type_label || "Motorcycle";
  const walletBalance = data?.wallet_balance || data?.wallet?.balance || lifetime.wallet_balance || 0;
  const todayEarnings = today.earnings || today.total_earnings || data?.today_earnings || 0;
  const weeklyEarnings = data?.week?.earnings || data?.weekly_earnings || lifetime.weekly_earnings || 0;
  const completedToday = today.completed_deliveries || today.deliveries || 0;
  const acceptanceRate = lifetime.acceptance_rate || 0;
  const recentActivity = [
    {
      icon: "💸",
      title: "Payment received",
      subtitle: "Latest delivery payout",
      value: `+ ${formatMRU(todayEarnings)}`,
      tone: "success",
    },
    {
      icon: "📦",
      title: "Deliveries completed",
      subtitle: "Today",
      value: `${completedToday || 0}`,
      tone: "orange",
    },
    {
      icon: "⭐",
      title: "Courier level progress",
      subtitle: `${formatPoints(points)} of ${formatPoints(pointsTarget)} points`,
      value: `${pointsPercent}%`,
      tone: "warning",
    },
  ];
  const quickActions = [
    { icon: "📋", label: "Orders", path: "/delivery/history" },
    { icon: "💰", label: "Earnings", path: "/delivery/earnings" },
    { icon: "👛", label: "Wallet", path: "/delivery/wallet" },
    { icon: "📄", label: "Documents", path: "/delivery/documents", badge: documentAlertCount },
    { icon: "⚙", label: "Settings", path: "/delivery/settings" },
    { icon: "🎧", label: "Support", path: "/delivery/support" },
  ];

  const initials = (data?.full_name || "C")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  // Account status logic
  const getStatusBanner = () => {
    const status = data?.account_status;
    if (status === "verified" || status === "approved") {
      return {
        className: "is-approved",
        icon: "✓",
        text: (
          <>
            <strong>Account status: Approved</strong> — You can go online and receive delivery requests.
          </>
        ),
      };
    }
    if (status === "under_review" || status === "pending" || status === "incomplete") {
      return {
        className: "is-pending",
        icon: "⏳",
        text: (
          <>
            <strong>Account status: Pending</strong> — {data?.account_message || "Your account is being reviewed."}
          </>
        ),
      };
    }
    return {
      className: "is-rejected",
      icon: "✕",
      text: (
        <>
          <strong>Account status: Rejected</strong> — {data?.account_message || "Please contact support."}
        </>
      ),
    };
  };

  const statusBanner = data ? getStatusBanner() : null;

  const profileLinks = [
    { icon: "👤", label: "Courier info", subtitle: data?.full_name || "View and edit profile", path: "/delivery/profile/edit" },
    {
      icon: "🛵",
      label: "Vehicle & Documents",
      subtitle: `${deliveryTypeLabel}${documentAlertCount ? ` · ${documentAlertCount} alert(s)` : ""}`,
      path: "/delivery/documents",
    },
    { icon: "👛", label: "Wallet", subtitle: formatMRU(walletBalance), path: "/delivery/wallet" },
    { icon: "🔔", label: "Notifications", subtitle: "Delivery request alerts", path: "/delivery/settings" },
    { icon: "🎧", label: "Help Center", subtitle: "FAQ and courier support", path: "/delivery/support" },
    { icon: "⚙", label: "Settings", subtitle: "App preferences", path: "/delivery/settings" },
  ];

  return (
    <CourierSubpageShell title="Profile" activeNav="profile">
      <div className="courier-profile courier-profile--subpage">
      <main className="courier-profile__content courier-profile__content--subpage">
        {loading ? <p className="courier-profile__empty">Loading courier profile...</p> : null}
        {error ? <p className="courier-profile__error">{error}</p> : null}

        {!loading && data ? (
          <>
            {/* HERO SECTION */}
            <section className="courier-profile__hero">
              <div className="courier-profile__avatar">
                {data.photo_url ? <img src={data.photo_url} alt="" /> : <span>{initials}</span>}
                <button
                  type="button"
                  className="courier-profile__avatar-camera"
                  onClick={() => (window.location.href = "/delivery/profile/edit")}
                  aria-label="Edit profile photo"
                >
                  📷
                </button>
              </div>
              <div className="courier-profile__hero-info">
                <h1>{data.full_name}</h1>
                <div className="courier-profile__verified-badge">
                  ✓ Verified Courier
                </div>
                <p className="courier-profile__hero-desc">Professional delivery courier account</p>
                <div className="courier-profile__hero-contact">
                  {data.phone ? <span>📞 {data.phone}</span> : null}
                  {data.email ? <span>✉ {data.email}</span> : null}
                </div>
              </div>
              <div className="courier-profile__hero-level">
                <span className="courier-profile__hero-level-icon">★</span>
                <strong>{courierLevel}</strong>
                <small>
                  {formatPoints(points)} / {formatPoints(pointsTarget)} points
                </small>
                <div className="courier-profile__level-progress" aria-hidden>
                  <span style={{ width: `${pointsPercent}%` }} />
                </div>
                <small>3 points per 10 MRU earned</small>
              </div>
            </section>

            {/* ACCOUNT STATUS BANNER */}
            {statusBanner ? (
              <div className={`courier-profile__status-banner ${statusBanner.className}`}>
                <span className="courier-profile__status-banner-icon">{statusBanner.icon}</span>
                <span>{statusBanner.text}</span>
                <span className="courier-profile__status-arrow" aria-hidden>›</span>
              </div>
            ) : null}

            <section className="ccf-profile-links" aria-label="Profile menu">
              {profileLinks.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  className="ccf-profile-link"
                  onClick={() => {
                    window.location.href = item.path;
                  }}
                >
                  <span>{item.icon}</span>
                  <div>
                    <strong>{item.label}</strong>
                    <small>{item.subtitle}</small>
                  </div>
                  <em>›</em>
                </button>
              ))}
            </section>

            <h3 className="ccf-profile-section-title">Legal</h3>
            <section className="ccf-profile-links" aria-label="Legal">
              <button
                type="button"
                className="ccf-profile-link"
                onClick={() => {
                  window.location.href = "/delivery/courier/terms";
                }}
              >
                <span>📜</span>
                <div>
                  <strong>Courier Terms</strong>
                  <small>Yala Delivery courier agreement</small>
                </div>
                <em>›</em>
              </button>
            </section>

            <button type="button" className="ccf-profile-link" onClick={courierLogout} style={{ marginTop: 8 }}>
              <span>🚪</span>
              <div>
                <strong>Logout</strong>
                <small>Sign out of Yala Delivery</small>
              </div>
              <em>›</em>
            </button>

            {/* STATS ROW — 5 Columns */}
            <section className="courier-profile__stats-row">
              <article className="courier-profile__stat">
                <span>Total Deliveries</span>
                <strong>{lifetime.total_deliveries || 0}</strong>
              </article>
              <article className="courier-profile__stat">
                <span>Completed</span>
                <strong>{lifetime.completed_deliveries || 0}</strong>
              </article>
              <article className="courier-profile__stat">
                <span>Rating</span>
                <strong>{lifetime.rating || "—"}</strong>
              </article>
              <article className="courier-profile__stat">
                <span>Acceptance</span>
                <strong>{lifetime.acceptance_rate || 0}%</strong>
              </article>
              <article className="courier-profile__stat">
                <span>Online Time</span>
                <strong>{today.online_time || "—"}</strong>
              </article>
            </section>

            {/* DRIVER-STYLE OVERVIEW CARDS */}
            <section className="courier-profile__overview-grid" aria-label="Courier overview">
              <article className="courier-profile__wallet-card">
                <span className="courier-profile__eyebrow">Wallet balance</span>
                <strong>{formatMRU(walletBalance)}</strong>
                <p>Cashout and delivery earnings in one place.</p>
                <button type="button" onClick={() => (window.location.href = "/delivery/wallet")}>
                  Open wallet
                </button>
              </article>
              <article className="courier-profile__performance-card">
                <div>
                  <span className="courier-profile__eyebrow">This week</span>
                  <strong>{formatMRU(weeklyEarnings)}</strong>
                </div>
                <div>
                  <span className="courier-profile__eyebrow">Acceptance</span>
                  <strong>{acceptanceRate}%</strong>
                </div>
                <div className="courier-profile__performance-bar" aria-hidden>
                  <span style={{ width: `${Math.min(100, Number(acceptanceRate || 0))}%` }} />
                </div>
                <p>Keep accepting quality orders to unlock higher courier rewards.</p>
              </article>
            </section>

            {/* QUICK ACTIONS */}
            <section className="courier-profile__quick-actions" aria-label="Quick actions">
              {quickActions.map((item) => (
                <button key={item.label} type="button" onClick={() => (window.location.href = item.path)}>
                  <span>{item.icon}</span>
                  <strong>{item.label}</strong>
                  {item.badge ? <em>{item.badge}</em> : null}
                </button>
              ))}
            </section>

            {/* TWO COLUMN: Menu + Documents */}
            <div className="courier-profile__two-col">
              {/* LEFT — Menu list */}
              <div className="courier-profile__menu-list">
                <h2>Menu</h2>
                {MENU_ITEMS.map((item) => {
                  const badgeCount = item.badgeKey === "documents" ? documentAlertCount : 0;
                  return (
                    <button
                      key={item.label}
                      type="button"
                      className="courier-profile__menu-item"
                      onClick={() => (window.location.href = item.path)}
                    >
                      <span className="courier-profile__menu-item-icon">{item.icon}</span>
                      <div className="courier-profile__menu-item-text">
                        <strong>{item.label}</strong>
                        <small>{item.subtitle}</small>
                      </div>
                      {badgeCount > 0 ? (
                        <span className="courier-profile__menu-badge">{badgeCount}</span>
                      ) : null}
                      <span className="courier-profile__menu-item-arrow">›</span>
                    </button>
                  );
                })}
              </div>

              {/* RIGHT — Documents panel */}
              <div className="courier-profile__docs-panel">
                <div className="courier-profile__docs-panel-head">
                  <h2>Documents</h2>
                  <button type="button" onClick={() => (window.location.href = "/delivery/documents")}>
                    View all
                  </button>
                </div>
                <div className="courier-profile__doc-list">
                  {profileDocuments.map((doc) => (
                    <DocumentRow
                      key={doc.type || doc.label}
                      document={doc}
                      onManage={() => (window.location.href = "/delivery/documents")}
                    />
                  ))}
                  {profileDocuments.length === 0 && (
                    <p style={{ fontSize: 13, color: "#9ca3af", padding: "12px 0" }}>
                      No documents found. Upload your documents to get verified.
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* DOCUMENT STATUS CARDS */}
            <section className="courier-profile__section courier-profile__document-cards">
              <div className="courier-profile__section-head">
                <h2>Document status</h2>
                <span>{documentAlertCount ? `${documentAlertCount} need attention` : "All clear"}</span>
              </div>
              <div className="courier-profile__document-card-grid">
                {profileDocuments.slice(0, 4).map((doc) => {
                  const meta = DOC_STATUS[doc.ui_status] || DOC_STATUS.missing;
                  return (
                    <button
                      key={`card-${doc.type || doc.label}`}
                      type="button"
                      className={`courier-profile__document-card is-${meta.tone}`}
                      onClick={() => (window.location.href = "/delivery/documents")}
                    >
                      <span>{meta.icon}</span>
                      <strong>{doc.label}</strong>
                      <small>{meta.label}</small>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* DELIVERY TYPE */}
            <section className="courier-profile__section" id="delivery-type">
              <div className="courier-profile__section-head">
                <h2>Delivery Type</h2>
                <span>Active: {deliveryTypeLabel}</span>
              </div>
              <div className="courier-profile__vehicle-grid">
                {ORDERED_VEHICLE_TYPES.map((option) => {
                  const active = data.courier_type === option.key;
                  return (
                    <article
                      key={option.key}
                      className={`courier-profile__vehicle-card ${active ? "is-active" : ""}`}
                    >
                      <span className="courier-profile__vehicle-icon">{option.icon}</span>
                      <strong>{option.label}</strong>
                      <small>{option.maxPackage}</small>
                      {active ? <span className="courier-profile__vehicle-active">✓ Active</span> : null}
                    </article>
                  );
                })}
              </div>
            </section>

            {/* RECENT ACTIVITY */}
            <section className="courier-profile__section courier-profile__recent">
              <div className="courier-profile__section-head">
                <h2>Recent activity</h2>
                <button type="button" onClick={() => (window.location.href = "/delivery/history")}>
                  View all
                </button>
              </div>
              <div className="courier-profile__activity-list">
                {recentActivity.map((item) => (
                  <article key={item.title} className={`courier-profile__activity-row is-${item.tone}`}>
                    <span className="courier-profile__activity-icon">{item.icon}</span>
                    <div>
                      <strong>{item.title}</strong>
                      <small>{item.subtitle}</small>
                    </div>
                    <em>{item.value}</em>
                  </article>
                ))}
              </div>
            </section>

            {/* SUPPORT BANNER */}
            <button
              type="button"
              className="courier-profile__support-banner"
              onClick={() => (window.location.href = "/delivery/support")}
            >
              <div className="courier-profile__support-banner-text">
                <span>🎧</span>
                <strong>Need help? Contact support</strong>
              </div>
              <span className="courier-profile__support-banner-arrow">›</span>
            </button>
          </>
        ) : null}
      </main>
      </div>
    </CourierSubpageShell>
  );
}
