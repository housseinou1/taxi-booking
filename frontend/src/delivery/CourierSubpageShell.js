import React from "react";

import "./delivery-courier-flow.css";

const NAV_ITEMS = [
  { key: "home", label: "Home", icon: "⌂", href: "/delivery/courier" },
  { key: "orders", label: "Orders", icon: "☰", href: "/delivery/history" },
  { key: "earnings", label: "Earnings", icon: "$", href: "/delivery/earnings" },
  { key: "wallet", label: "Wallet", icon: "👛", href: "/delivery/wallet" },
  { key: "profile", label: "Profile", icon: "☺", href: "/delivery/account" },
];

/**
 * DoorDash-style subpage shell with consistent bottom navigation.
 */
export default function CourierSubpageShell({ title, activeNav, children, headerRight = null }) {
  return (
    <div className="ccf-subpage">
      <header className="ccf-subpage__header">
        <button
          type="button"
          className="ccf-subpage__back"
          onClick={() => {
            window.location.href = "/delivery/courier";
          }}
          aria-label="Back to home"
        >
          ←
        </button>
        <h1>{title}</h1>
        <div className="ccf-subpage__header-right">{headerRight}</div>
      </header>

      <main className="ccf-subpage__body">{children}</main>

      <nav className="ccf-subpage__nav" aria-label="Courier navigation">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={activeNav === item.key ? "is-active" : ""}
            onClick={() => {
              window.location.href = item.href;
            }}
          >
            <span>{item.icon}</span>
            <small>{item.label}</small>
          </button>
        ))}
      </nav>
    </div>
  );
}
