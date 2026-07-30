import React, { useState } from "react";
import DriverAvatar from "./DriverAvatar";
import DriverLevelBadge from "./DriverLevelBadge";
import "./HamburgerMenu.css";

const MENU_ITEMS = [
  { icon: "👤", label: "Driver Profile", subtitle: "View and edit your profile", path: "/driver/profile" },
  { icon: "💰", label: "Earnings", subtitle: "Track your income", path: "/driver/earnings" },
  { icon: "🚕", label: "Ride History", subtitle: "View completed trips", path: "/driver/history" },
  { icon: "📄", label: "Documents", subtitle: "License, insurance, registration", path: "/driver/documents" },
  { icon: "🆔", label: "Driver Code", subtitle: "Your unique driver QR code", path: "/driver/code" },
  { icon: "🏆", label: "Driver Level", subtitle: "Progress and rewards", path: "/driver/achievements" },
  { icon: "💳", label: "Payment / Withdrawals", subtitle: "Bank and payout settings", path: "/driver/wallet" },
  { icon: "👛", label: "Wallet", subtitle: "Balance and transactions", path: "/driver/wallet" },
  { icon: "⚙", label: "Settings", subtitle: "App and account preferences", path: "/settings" },
  { icon: "❓", label: "Help & Support", subtitle: "Get help from Yala team", path: "/driver/support" },
  { icon: "🆘", label: "Safety / SOS", subtitle: "Emergency tools and contacts", path: "/driver/support" },
  { icon: "↪", label: "Logout", subtitle: null, path: null, danger: true },
];

/**
 * HamburgerMenu - Sliding drawer from the left with Uber-style green Yala theme.
 *
 * Props:
 * - isOpen: boolean
 * - onClose: function
 * - driverProfile: { first_name, last_name, profile_picture, level, points, nextLevelPoints,
 *                    rating, is_online, documents_alert, documents_alert_level, payment_alert, account_alert }
 * - onNavigate: function(path)
 * - onLogout: function
 */
export default function HamburgerMenu({
  isOpen,
  onClose,
  driverProfile = {},
  onNavigate,
  onLogout,
}) {
  const {
    first_name = "",
    last_name = "",
    profile_picture,
    level = "bronze",
    points = 0,
    nextLevelPoints = 2000,
    rating = 0,
    is_online = false,
    documents_alert = false,
    documents_alert_level = null,
    payment_alert = false,
    account_alert = false,
  } = driverProfile;

  const fullName = `${first_name} ${last_name}`.trim() || "Yala Driver";

  const levelTitle = {
    bronze: "Bronze", silver: "Silver", gold: "Gold",
    platinum: "Platinum", elite: "Elite", diamond: "Diamond",
  }[level] || "Bronze";

  // Determine which items should show alert badges
  const documentsAlertLevel =
    documents_alert_level || (documents_alert ? "error" : null);

  const getItemAlertLevel = (item) => {
    if (item.label === "Documents") return documentsAlertLevel;
    if (item.label === "Payment / Withdrawals" || item.label === "Wallet") {
      return payment_alert ? "error" : null;
    }
    if (item.label === "Driver Profile" || item.label === "Settings") {
      return account_alert ? "error" : null;
    }
    return null;
  };

  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const handleItemClick = (item) => {
    if (item.label === "Logout") {
      setShowLogoutConfirm(true);
      return; // Don't close the menu yet — show confirmation first
    } else if (item.path) {
      onNavigate && onNavigate(item.path);
    }
    onClose && onClose();
  };

  const handleLogoutConfirm = () => {
    setShowLogoutConfirm(false);
    onClose && onClose();
    onLogout && onLogout();
  };

  const handleLogoutCancel = () => {
    setShowLogoutConfirm(false);
  };

  const handleItemKeyDown = (event, item) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    handleItemClick(item);
  };

  return (
    <div
      className={`hm ${isOpen ? "hm--open" : "hm--closed"}`}
      aria-hidden={!isOpen}
    >
      <div className="hm-backdrop" onClick={onClose} aria-label="Close menu" />

      <nav className="hm-drawer" role="navigation" aria-label="Main menu">
        {/* Menu Header */}
        <header className="hm-header">
          <button className="hm-close" onClick={onClose} aria-label="Close menu" type="button">×</button>
          <div className="hm-profile">
            <DriverAvatar
              src={profile_picture}
              name={fullName}
              isOnline={is_online}
              wrapperClassName="hm-avatar-wrap"
              ringClassName="hm-avatar"
              imageClassName="driver-avatar__image"
              initialsClassName="hm-avatar hm-avatar--fallback"
              dotClassName="hm-avatar-dot"
            />
            <div className="hm-profile-info">
              <div className="hm-name-row">
                <h2 className="hm-name">{fullName}</h2>
                <span className="hm-verified" aria-label="Verified driver" title="Verified driver" role="img">
                  <span aria-hidden="true">✓</span>
                </span>
              </div>
              <div className="hm-meta">
                <span className="hm-level-badge">{levelTitle}</span>
                {rating > 0 && <span className="hm-rating">★ {Number(rating).toFixed(1)}</span>}
              </div>
              <span className={`hm-status ${is_online ? "online" : ""}`}>
                <span className="hm-status-dot" aria-hidden="true" />
                {is_online ? "Online" : "Offline"}
              </span>
            </div>
          </div>
        </header>

        {/* Progress Card */}
        <section className="hm-progress">
          <DriverLevelBadge
            level={level}
            points={points}
            nextLevelPoints={nextLevelPoints}
          />
        </section>

        {/* Menu Items */}
        <ul className="hm-items">
          {MENU_ITEMS.map((item) => (
            <li
              key={item.label}
              className={`hm-item${item.danger ? " hm-item--danger" : ""}`}
              onClick={() => handleItemClick(item)}
              onKeyDown={(event) => handleItemKeyDown(event, item)}
              role="menuitem"
              tabIndex={isOpen ? 0 : -1}
            >
              <span className="hm-item-icon" aria-hidden="true">{item.icon}</span>
              <span className="hm-item-text">
                <strong>{item.label}</strong>
                {item.subtitle && <small>{item.subtitle}</small>}
              </span>
              {getItemAlertLevel(item) ? (
                <span
                  className={`hm-item-alert hm-item-alert--${getItemAlertLevel(item)}`}
                  aria-label={
                    getItemAlertLevel(item) === "warning"
                      ? "Document expiring soon"
                      : "Documents need attention"
                  }
                />
              ) : null}
              {!item.danger && <span className="hm-item-arrow">›</span>}
            </li>
          ))}
        </ul>
      </nav>

      {/* Logout Confirmation Dialog */}
      {showLogoutConfirm && (
        <div className="hm-logout-overlay" role="presentation">
          <div className="hm-logout-backdrop" onClick={handleLogoutCancel} />
          <div className="hm-logout-dialog" role="alertdialog" aria-modal="true" aria-labelledby="hm-logout-title">
            <h3 id="hm-logout-title" className="hm-logout-title">Are you sure you want to logout?</h3>
            <p className="hm-logout-desc">You will need to sign in again to go online and accept rides.</p>
            <div className="hm-logout-actions">
              <button type="button" className="hm-logout-btn hm-logout-btn--cancel" onClick={handleLogoutCancel}>
                Cancel
              </button>
              <button type="button" className="hm-logout-btn hm-logout-btn--confirm" onClick={handleLogoutConfirm}>
                Logout
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
