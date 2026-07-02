import React from "react";

import { useCourierMenuData } from "./useCourierMenuData";
import "./delivery-courier-profile.css";

const MENU_ITEMS = [
  { icon: "👤", label: "Courier Profile", path: "/delivery/account" },
  { icon: "💰", label: "Earnings", path: "/delivery/earnings" },
  { icon: "📦", label: "Delivery History", path: "/delivery/history" },
  {
    icon: "📄",
    label: "Documents",
    path: "/delivery/documents",
    badgeKey: "documents",
  },
  { icon: "🔢", label: "Courier Code", path: "/delivery/account#courier-code" },
  { icon: "🏦", label: "Payment / Withdrawals", path: "/delivery/bank" },
  { icon: "👛", label: "Wallet", path: "/delivery/wallet" },
  { icon: "🛵", label: "Delivery Type", path: "/delivery/account#delivery-type" },
  { icon: "⚙️", label: "Settings", path: "/delivery/settings" },
  { icon: "💬", label: "Help & Support", path: "/delivery/support" },
  { icon: "🆘", label: "Safety / SOS", path: "/delivery/support" },
];

function courierLogout() {
  localStorage.removeItem("access");
  localStorage.removeItem("refresh");
  localStorage.removeItem("user");
  window.location.href = "/login?next=/delivery/courier";
}

export default function DeliveryCourierMenu({ open, onClose }) {
  const { profile, documentAlertCount, loading } = useCourierMenuData(open);
  const currentPath = (window.location.pathname || "").replace(/\/+$/, "") || "/";

  if (!open) return null;

  const navigate = (path) => {
    onClose();
    window.location.href = path;
  };

  const initials = (profile?.fullName || "C")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  return (
    <>
      <button type="button" className="delivery-uber__menu-scrim" aria-label="Close menu" onClick={onClose} />
      <aside className="delivery-uber__menu delivery-uber__menu--courier-dark" aria-label="Courier menu">
        <header className="delivery-uber__menu-brand">
          <img src="/yala-delivery-logo.png" alt="Yala Delivery" className="delivery-uber__menu-logo" />
          <strong>YALA DELIVERY</strong>
          <span>Courier menu</span>
        </header>

        <header className="delivery-uber__menu-profile">
          <div className="delivery-uber__menu-avatar" aria-hidden>
            {profile?.photoUrl ? (
              <img src={profile.photoUrl} alt="" />
            ) : (
              <span>{initials || "C"}</span>
            )}
          </div>
          <div className="delivery-uber__menu-profile-body">
            <strong>{loading && !profile ? "Loading..." : profile?.fullName || "Courier"}</strong>
            <span className="delivery-uber__menu-profile-meta">Professional delivery courier account</span>
            <span
              className={`delivery-uber__menu-status ${
                profile?.online ? "is-online" : "is-offline"
              }`}
            >
              {profile?.online ? "Online" : "Offline"}
            </span>
          </div>
        </header>

        {profile?.courierTypeLabel ? (
          <div className="delivery-uber__menu-level-card">
            <strong>{profile.courierTypeLabel}</strong>
            <small>{profile.completedDeliveries || 0} completed deliveries</small>
            <small>{profile.courierId || "Yala Delivery courier"}</small>
          </div>
        ) : null}

        <nav className="delivery-uber__menu-nav">
          <span className="delivery-uber__menu-subtitle">Menu</span>
          {MENU_ITEMS.map((item) => {
            const badgeCount = item.badgeKey === "documents" ? documentAlertCount : 0;
            const isActive =
              currentPath === item.path ||
              (item.path.startsWith("/delivery/account") && currentPath === "/delivery/account");

            return (
              <button
                key={`${item.label}-${item.path}`}
                type="button"
                className={`delivery-uber__menu-item ${isActive ? "is-active" : ""}`}
                onClick={() => navigate(item.path)}
              >
                <span className="delivery-uber__menu-item-icon">{item.icon}</span>
                <span className="delivery-uber__menu-item-label">{item.label}</span>
                {badgeCount > 0 ? (
                  <span className="delivery-uber__menu-badge" aria-label={`${badgeCount} document alerts`}>
                    {badgeCount}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>

        <footer className="delivery-uber__menu-footer">
          <button type="button" className="delivery-uber__menu-signout" onClick={courierLogout}>
            Logout
          </button>
        </footer>
      </aside>
    </>
  );
}
