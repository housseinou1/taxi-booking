import React, { useEffect, useMemo, useRef, useState } from "react";

import { usePermissions } from "../permissions/PermissionContext";
import { useAdminTheme } from "./theme/AdminThemeContext";
import AdminIcon from "./icons/AdminIcon";

const CITIES = [
  { id: "", label: "All cities" },
  { id: "nouakchott", label: "Nouakchott" },
  { id: "nouadhibou", label: "Nouadhibou" },
];

function initialsOf(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "S";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function useDismiss(open, setOpen) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, setOpen]);
  return ref;
}

export default function AdminHeader({ onOpenMobileNav, onOpenSearch }) {
  const { permissions, logout, cityId, setCity, notifications, hasFeature } = usePermissions();
  const { mode, setMode } = useAdminTheme();
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const profileRef = useDismiss(profileOpen, setProfileOpen);
  const notifyRef = useDismiss(notifyOpen, setNotifyOpen);
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine !== false));

  useEffect(() => {
    const update = () => setOnline(navigator.onLine !== false);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const unreadCount = notifications?.length || 0;
  const displayName = permissions?.display_name || permissions?.email || "Staff";
  const isCeo = permissions?.role === "ceo";
  const roleLabel = permissions?.role_label || "Staff";

  const themeLabel = useMemo(() => {
    if (mode === "system") return "System";
    if (mode === "light") return "Light";
    return "Dark";
  }, [mode]);

  const cycleTheme = () => {
    const order = ["dark", "light", "system"];
    const idx = order.indexOf(mode);
    setMode(order[(idx + 1) % order.length]);
  };

  return (
    <header className="admin-shell__header">
      <div className="admin-shell__header-left">
        <button
          type="button"
          className="admin-shell__icon-btn admin-shell__menu-btn"
          aria-label="Open navigation menu"
          onClick={onOpenMobileNav}
        >
          <AdminIcon name="menu" size={20} />
        </button>
        <a href="/admin" className="admin-shell__brand admin-shell__header-brand">
          <img src="/yala-admin-logo.png" alt="" className="admin-shell__logo" />
          <span className="admin-shell__brand-title">YALA Admin</span>
        </a>
        <span className="admin-shell__page-title">YALA Admin Dashboard</span>
        <span className={`admin-shell__live ${online ? "" : "admin-shell__live--off"}`.trim()} title="Connection status">
          <span className="admin-shell__live-dot" aria-hidden="true" />
          {online ? "Live" : "Offline"}
        </span>
      </div>

      <div className="admin-shell__header-center">
        <button
          type="button"
          className="admin-shell__search admin-shell__search--pending"
          onClick={onOpenSearch}
          title="Global search is not available yet"
        >
          <AdminIcon name="search" size={16} className="admin-shell__search-icon" />
          <span className="admin-shell__search-label">
            Global search (drivers, riders, trips, vehicles...)
          </span>
          <span className="admin-shell__search-soon">Soon</span>
          <kbd>Ctrl K</kbd>
        </button>
      </div>

      <div className="admin-shell__header-right">
        <button
          type="button"
          className="admin-shell__icon-btn admin-shell__search-mobile"
          aria-label="Global search"
          onClick={onOpenSearch}
        >
          <AdminIcon name="search" size={18} />
        </button>

        <label className="admin-shell__city-select-wrap">
          <AdminIcon name="map-pin" size={15} className="admin-shell__city-icon" />
          <span className="admin-shell__sr-only">City</span>
          <select
            className="admin-shell__city-select"
            value={cityId}
            onChange={(e) => setCity(e.target.value)}
            aria-label="Select city"
          >
            {CITIES.map((c) => (
              <option key={c.id || "all"} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>

        <span
          className={`admin-shell__role-badge ${isCeo ? "admin-shell__role-badge--ceo" : ""}`.trim()}
          title="Current role"
        >
          <AdminIcon name={isCeo ? "shield-check" : "user"} size={14} />
          <span>{isCeo ? "CEO Access" : roleLabel}</span>
        </span>

        <button
          type="button"
          className="admin-shell__icon-btn"
          aria-label={`Theme: ${themeLabel}. Click to change.`}
          title={`Theme: ${themeLabel}`}
          onClick={cycleTheme}
        >
          <AdminIcon name={mode === "light" ? "sun" : mode === "system" ? "monitor" : "moon"} size={18} />
        </button>

        <div className="admin-shell__dropdown-wrap" ref={notifyRef}>
          <button
            type="button"
            className="admin-shell__icon-btn admin-shell__notify-btn"
            aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
            aria-expanded={notifyOpen}
            onClick={() => setNotifyOpen((v) => !v)}
          >
            <AdminIcon name="bell" size={19} />
            {unreadCount ? <span className="admin-shell__badge">{unreadCount}</span> : null}
          </button>
          {notifyOpen ? (
            <div className="admin-shell__dropdown admin-shell__dropdown--notify" role="menu">
              <div className="admin-shell__dropdown-title">Notifications</div>
              {notifications?.length ? (
                notifications.map((n) => (
                  <div key={n.id || n.title} className="admin-shell__notify-item">
                    <strong>{n.title}</strong>
                    <p>{n.message}</p>
                  </div>
                ))
              ) : (
                <p className="admin-shell__dropdown-empty">No new notifications</p>
              )}
            </div>
          ) : null}
        </div>

        <div className="admin-shell__dropdown-wrap" ref={profileRef}>
          <button
            type="button"
            className="admin-shell__profile-btn"
            aria-expanded={profileOpen}
            onClick={() => setProfileOpen((v) => !v)}
          >
            <span className="admin-shell__avatar" aria-hidden="true">
              {initialsOf(permissions?.display_name)}
            </span>
            <span className="admin-shell__profile-text">
              <span className="admin-shell__profile-name">{displayName}</span>
              <span className="admin-shell__profile-role">{roleLabel}</span>
            </span>
            <AdminIcon name="chevron-down" size={14} className="admin-shell__profile-caret" />
          </button>
          {profileOpen ? (
            <div className="admin-shell__dropdown" role="menu">
              <div className="admin-shell__dropdown-meta">{permissions?.email}</div>
              <button type="button" className="admin-shell__dropdown-item" role="menuitem" onClick={() => logout()}>
                <AdminIcon name="logout" size={15} /> Log out
              </button>
              {hasFeature("logout_all_devices") ? (
                <button
                  type="button"
                  className="admin-shell__dropdown-item"
                  role="menuitem"
                  onClick={() => logout({ allDevices: true })}
                >
                  <AdminIcon name="logout" size={15} /> Log out all devices
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
