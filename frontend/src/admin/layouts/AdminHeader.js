import React, { useMemo, useState } from "react";

import { SearchableSelect } from "../components/library";
import { usePermissions } from "../permissions/PermissionContext";
import MauritaniaFlag from "../employees/MauritaniaFlag";
import { useAdminTheme } from "./theme/AdminThemeContext";
import { useOperatingCityOptions } from "./useOperatingCityOptions";
import AdminTopNavIcon from "./AdminTopNavIcons";

export default function AdminHeader({ onOpenMobileNav, onOpenSearch }) {
  const { permissions, logout, cityId, setCity, notifications, hasFeature } = usePermissions();
  const { mode, setMode } = useAdminTheme();
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);

  const { options: cityOptions, loading: citiesLoading } = useOperatingCityOptions();

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
          <AdminTopNavIcon name="menu" className="admin-shell__header-icon" />
        </button>
        <div className="admin-shell__brand">
          <img src="/yala-admin-logo.png" alt="" className="admin-shell__logo" />
          <MauritaniaFlag className="admin-shell__brand-flag" />
          <div>
            <div className="admin-shell__brand-title">YALA TECHNOLOGIES</div>
            <div className="admin-shell__brand-sub">Ride • Delivery • Operations</div>
          </div>
        </div>
      </div>

      <div className="admin-shell__header-center">
        <button
          type="button"
          className="admin-shell__search admin-shell__search--pending"
          onClick={onOpenSearch}
          title="Global search is not available yet"
        >
          <AdminTopNavIcon name="search" className="admin-shell__header-icon" />
          <span className="admin-shell__search-label">Search for rides, drivers…</span>
          <span className="admin-shell__search-soon">Soon</span>
          <kbd>Ctrl K</kbd>
        </button>
      </div>

      <div className="admin-shell__header-right">
        <div className="admin-shell__city-select-wrap">
          <span className="admin-shell__sr-only">Operating city</span>
          <SearchableSelect
            label=""
            value={cityId}
            onChange={setCity}
            options={cityOptions}
            loading={citiesLoading}
            placeholder="All cities"
            searchPlaceholder="Search city or wilaya…"
            className="admin-shell__city-searchable"
            name="admin-operating-city"
          />
        </div>

        <span className="admin-shell__role-badge" title="Current role">
          {permissions?.role_label || "Staff"}
        </span>

        <button
          type="button"
          className="admin-shell__icon-btn"
          aria-label={`Theme: ${themeLabel}. Click to change.`}
          onClick={cycleTheme}
        >
          <AdminTopNavIcon
            name={mode === "light" ? "sun" : mode === "system" ? "half-moon" : "moon"}
            className="admin-shell__header-icon"
          />
        </button>

        <div className="admin-shell__dropdown-wrap">
          <button
            type="button"
            className="admin-shell__icon-btn admin-shell__notify-btn"
            aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
            aria-expanded={notifyOpen}
            onClick={() => setNotifyOpen((v) => !v)}
          >
            <AdminTopNavIcon name="bell" className="admin-shell__header-icon" />
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
