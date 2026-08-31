import React, { useMemo, useState } from "react";

import { usePermissions } from "../permissions/PermissionContext";
import { useAdminTheme } from "./theme/AdminThemeContext";

const CITIES = [
  { id: "", label: "All cities" },
  { id: "nouakchott", label: "Nouakchott" },
];

export default function AdminHeader({ onOpenMobileNav, onOpenSearch }) {
  const { permissions, logout, cityId, setCity, notifications, hasFeature } = usePermissions();
  const { mode, setMode } = useAdminTheme();
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);

  const unreadCount = notifications?.length || 0;

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
          ☰
        </button>
        <div className="admin-shell__brand">
          <img src="/yala-admin-logo.png" alt="" className="admin-shell__logo" />
          <div>
            <div className="admin-shell__brand-title">YALA Admin</div>
            <div className="admin-shell__brand-sub">Operations Platform</div>
          </div>
        </div>
      </div>

      <div className="admin-shell__header-center">
        <button type="button" className="admin-shell__search" onClick={onOpenSearch}>
          <span aria-hidden="true">🔍</span>
          <span>Search rides, riders, tickets…</span>
          <kbd>Ctrl K</kbd>
        </button>
      </div>

      <div className="admin-shell__header-right">
        <label className="admin-shell__city-select-wrap">
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

        <span className="admin-shell__role-badge" title="Current role">
          {permissions?.role_label || "Staff"}
        </span>

        <button
          type="button"
          className="admin-shell__icon-btn"
          aria-label={`Theme: ${themeLabel}. Click to change.`}
          onClick={cycleTheme}
        >
          {mode === "light" ? "☀" : mode === "system" ? "◐" : "☾"}
        </button>

        <div className="admin-shell__dropdown-wrap">
          <button
            type="button"
            className="admin-shell__icon-btn admin-shell__notify-btn"
            aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
            aria-expanded={notifyOpen}
            onClick={() => setNotifyOpen((v) => !v)}
          >
            🔔
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

        <div className="admin-shell__dropdown-wrap">
          <button
            type="button"
            className="admin-shell__profile-btn"
            aria-expanded={profileOpen}
            onClick={() => setProfileOpen((v) => !v)}
          >
            <span className="admin-shell__avatar" aria-hidden="true">
              {(permissions?.display_name || "S").slice(0, 2).toUpperCase()}
            </span>
            <span className="admin-shell__profile-name">{permissions?.display_name || "Staff"}</span>
          </button>
          {profileOpen ? (
            <div className="admin-shell__dropdown" role="menu">
              <div className="admin-shell__dropdown-meta">{permissions?.email}</div>
              <button type="button" className="admin-shell__dropdown-item" role="menuitem" onClick={() => logout()}>
                Log out
              </button>
              {hasFeature("logout_all_devices") ? (
                <button
                  type="button"
                  className="admin-shell__dropdown-item"
                  role="menuitem"
                  onClick={() => logout({ allDevices: true })}
                >
                  Log out all devices
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
