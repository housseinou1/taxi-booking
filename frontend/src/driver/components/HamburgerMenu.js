import React from "react";
import DriverLevelBadge from "./DriverLevelBadge";
import "./HamburgerMenu.css";

const MENU_ITEMS = [
  { icon: "DP", label: "Driver Profile", path: "/driver/profile" },
  { icon: "ER", label: "Earnings", path: "/driver/earnings" },
  { icon: "RH", label: "Ride History", path: "/driver/history" },
  { icon: "DC", label: "Documents", path: "/driver/documents", alert: true },
  { icon: "ID", label: "Driver Code", path: "/driver/code" },
  { icon: "LV", label: "Driver Level", path: "/driver/achievements" },
  { icon: "PW", label: "Payment / Withdrawals", path: "/driver/earnings" },
  { icon: "ST", label: "Settings", path: "/settings" },
  { icon: "HP", label: "Help & Support", path: "/driver/support" },
  { icon: "LO", label: "Logout", path: null, danger: true },
];

/**
 * HamburgerMenu - Full-screen sliding drawer from the left.
 *
 * Props:
 * - isOpen: boolean
 * - onClose: function
 * - driverProfile: { first_name, last_name, profile_picture, level, points, nextLevelPoints }
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
  } = driverProfile;

  const fullName = `${first_name} ${last_name}`.trim() || "Yala Driver";
  const initials = fullName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  const handleItemClick = (item) => {
    if (item.label === "Logout") {
      onLogout && onLogout();
    } else if (item.path) {
      onNavigate && onNavigate(item.path);
    }
    onClose && onClose();
  };

  const handleItemKeyDown = (event, item) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    handleItemClick(item);
  };

  return (
    <div
      className={`hamburger-menu ${isOpen ? "hamburger-menu--open" : "hamburger-menu--closed"}`}
      aria-hidden={!isOpen}
    >
      <div
        className="hamburger-menu__backdrop"
        onClick={onClose}
        aria-label="Close menu"
      />

      <nav className="hamburger-menu__drawer" role="navigation" aria-label="Main menu">
        <div className="hamburger-menu__header">
          {profile_picture ? (
            <img
              src={profile_picture}
              alt={fullName}
              className="hamburger-menu__avatar"
            />
          ) : (
            <div className="hamburger-menu__avatar-placeholder">
              {initials || "YD"}
            </div>
          )}
          <div className="hamburger-menu__profile-info">
            <span className="hamburger-menu__eyebrow">Yala Driver</span>
            <h2 className="hamburger-menu__name">{fullName}</h2>
            <p>Professional driver account</p>
          </div>
          <button
            className="hamburger-menu__close"
            onClick={onClose}
            aria-label="Close menu"
            type="button"
          >
            ×
          </button>
        </div>

        <div className="hamburger-menu__level">
          <DriverLevelBadge
            level={level}
            points={points}
            nextLevelPoints={nextLevelPoints}
          />
        </div>

        <ul className="hamburger-menu__items">
          {MENU_ITEMS.map((item) => (
            <li
              key={item.label}
              className={`hamburger-menu__item ${item.danger ? "hamburger-menu__item--danger" : ""}`}
              onClick={() => handleItemClick(item)}
              onKeyDown={(event) => handleItemKeyDown(event, item)}
              role="menuitem"
              tabIndex={isOpen ? 0 : -1}
            >
              <span className="hamburger-menu__item-icon" aria-hidden="true">
                {item.icon}
              </span>
              <span className="hamburger-menu__item-label">{item.label}</span>
              {item.alert && <span className="hamburger-menu__item-alert" aria-label="Needs attention" />}
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
