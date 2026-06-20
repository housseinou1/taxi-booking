import React from "react";
import "../../driver/components/HamburgerMenu.css";

const MENU_ITEMS = [
  { icon: "BR", label: "Book a ride", action: "book" },
  { icon: "RP", label: "Rider profile", path: "/rider-profile" },
  { icon: "TH", label: "Trip history", path: "/rider-history" },
  { icon: "SP", label: "Saved places", path: "/saved-places" },
  { icon: "YS", label: "Yala services", path: "/services" },
  { icon: "DL", label: "Delivery", path: "/delivery" },
  { icon: "PM", label: "Payments", path: "/rider-payments" },
  { icon: "HP", label: "Help & support", path: "/support" },
  { icon: "ST", label: "Settings", path: "/settings" },
  { icon: "LO", label: "Logout", action: "logout", danger: true },
];

export default function RiderHamburgerMenu({
  isOpen,
  onClose,
  riderProfile = {},
  onNavigate,
  onBookRide,
  onLogout,
}) {
  const {
    first_name = "",
    last_name = "",
    profile_picture,
  } = riderProfile;

  const fullName = `${first_name} ${last_name}`.trim() || "Yala Rider";
  const initials = fullName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  const handleItemClick = (item) => {
    if (item.action === "logout") {
      onLogout?.();
    } else if (item.action === "book") {
      onBookRide?.();
    } else if (item.path) {
      onNavigate?.(item.path);
    }
    onClose?.();
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

      <nav className="hamburger-menu__drawer" role="navigation" aria-label="Rider menu">
        <div className="hamburger-menu__header">
          {profile_picture ? (
            <img
              src={profile_picture}
              alt={fullName}
              className="hamburger-menu__avatar"
            />
          ) : (
            <div className="hamburger-menu__avatar-placeholder">
              {initials || "YR"}
            </div>
          )}
          <div className="hamburger-menu__profile-info">
            <span className="hamburger-menu__eyebrow">Yala Rider</span>
            <h2 className="hamburger-menu__name">{fullName}</h2>
            <p>Profile, trips, and booking</p>
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
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
