import React from "react";
import "../../driver/components/HamburgerMenu.css";
import "./RiderHamburgerMenu.css";

const MENU_SECTIONS = [
  {
    title: "Rides",
    items: [
      { icon: "🚗", label: "Book a ride", action: "book" },
      { icon: "🕐", label: "Trip history", path: "/rider-history" },
      { icon: "📍", label: "Saved places", path: "/saved-places" },
    ],
  },
  {
    title: "Account",
    items: [
      { icon: "👤", label: "Profile", path: "/rider-profile" },
      { icon: "💳", label: "Payments", path: "/rider-payments" },
      { icon: "⚙️", label: "Settings", path: "/settings" },
    ],
  },
  {
    title: "More",
    items: [
      { icon: "✨", label: "Yala services", path: "/services" },
      { icon: "📦", label: "Delivery", path: "/delivery" },
      { icon: "💬", label: "Help & support", path: "/support" },
      { icon: "↪", label: "Log out", action: "logout", danger: true },
    ],
  },
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
      className={`hamburger-menu rider-menu ${isOpen ? "hamburger-menu--open" : "hamburger-menu--closed"}`}
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
            <span className="hamburger-menu__eyebrow">Rider</span>
            <h2 className="hamburger-menu__name">{fullName}</h2>
            <p>Tap a destination to get moving</p>
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

        {MENU_SECTIONS.map((section) => (
          <div key={section.title}>
            <p className="hamburger-menu__section">{section.title}</p>
            <ul className="hamburger-menu__items">
              {section.items.map((item) => (
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
          </div>
        ))}

        <div className="hamburger-menu__footer">Yala · Mauritania</div>
      </nav>
    </div>
  );
}
